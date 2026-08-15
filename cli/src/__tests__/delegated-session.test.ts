import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  endDelegatedSession,
  resumeDelegatedSession,
} from '../delegated-session'

const activeSession = {
  status: 'active' as const,
  accessTier: 'full' as const,
  instanceId: 'session-1',
  model: 'deepseek/deepseek-v4-pro',
  admittedAt: '2026-08-15T12:00:00.000Z',
  expiresAt: '2026-08-15T13:00:00.000Z',
  remainingMs: 3_600_000,
}

describe('delegated session leases', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = 'https://example.codebuff.test'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('resumes a session by instance id and returns its lease', async () => {
    const calls: Array<{ method?: string; headers?: Headers }> = []
    globalThis.fetch = (async (_input, init) => {
      calls.push({
        method: init?.method,
        headers: new Headers(init?.headers),
      })
      return new Response(JSON.stringify(activeSession), { status: 200 })
    }) as typeof fetch

    await expect(
      resumeDelegatedSession({
        token: 'token',
        sessionId: 'session-1',
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      id: 'session-1',
      model: 'deepseek/deepseek-v4-pro',
      expiresAt: '2026-08-15T13:00:00.000Z',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ method: 'GET' })
    expect(calls[0]?.headers?.get('authorization')).toBe('Bearer token')
    expect(calls[0]?.headers?.get('x-freebuff-instance-id')).toBe('session-1')
  })

  test('rejects a retained session when its model does not match', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(activeSession), {
        status: 200,
      })) as unknown as typeof fetch

    await expect(
      resumeDelegatedSession({
        token: 'token',
        sessionId: 'session-1',
        model: 'google/gemini-3-pro-preview',
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'session_model_mismatch' })
  })

  test('verifies the lease before ending it and targets the session id', async () => {
    const calls: Array<{ method?: string; headers?: Headers }> = []
    globalThis.fetch = (async (_input, init) => {
      calls.push({
        method: init?.method,
        headers: new Headers(init?.headers),
      })
      return new Response(JSON.stringify(activeSession), { status: 200 })
    }) as typeof fetch

    await endDelegatedSession({ token: 'token', sessionId: 'session-1' })

    expect(calls.map((call) => call.method)).toEqual(['GET', 'DELETE'])
    expect(calls[1]?.headers?.get('x-freebuff-instance-id')).toBe('session-1')
  })
})
