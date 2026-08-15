import { describe, expect, test } from 'bun:test'

import {
  readDelegatedPrompt,
  runDelegated,
  validateDelegatedRunArgs,
} from '../delegated-run'
import type {
  DelegatedRunDependencies,
  DelegatedRunEvent,
} from '../delegated-run'
import type { DelegatedContinuationRecord } from '../utils/delegated-continuation'
import type { AdResponse } from '../utils/sponsor-ads'

const MODEL = 'deepseek/deepseek-v4-pro'
const EXPIRES_AT = '2026-08-15T13:00:00.000Z'

const ad: AdResponse = {
  adText: 'Build faster with Example.',
  title: 'Example',
  cta: 'Learn more',
  url: 'https://example.com',
  favicon: 'https://example.com/favicon.ico',
  clickUrl: 'https://tracking.example/click',
  impUrl: 'https://tracking.example/impression',
  provider: 'gravity',
  impressionIds: ['secret-impression-id'],
  credits: 42,
}

describe('delegated run arguments', () => {
  test('requires a supported model and exactly one prompt source', () => {
    expect(validateDelegatedRunArgs({})).toMatchObject({
      valid: false,
      code: 'model_required',
    })
    expect(
      validateDelegatedRunArgs({
        model: MODEL,
        prompt: 'one',
        promptFile: 'two',
      }),
    ).toMatchObject({ valid: false, code: 'multiple_prompt_sources' })
    expect(
      validateDelegatedRunArgs({ model: 'provider/unknown', prompt: 'one' }),
    ).toMatchObject({ valid: false, code: 'unsupported_model' })
    expect(
      validateDelegatedRunArgs({
        continue: true,
        prompt: 'follow up',
      }),
    ).toMatchObject({ valid: false, code: 'continuation_id_required' })
    expect(
      validateDelegatedRunArgs({
        continue: true,
        continueId: 'continuation-1',
        prompt: 'follow up',
      }),
    ).toMatchObject({ valid: true })
    expect(
      validateDelegatedRunArgs({
        sessionId: 'session-1',
        prompt: 'follow up',
      }),
    ).toMatchObject({ valid: true, sessionId: 'session-1' })
    expect(
      validateDelegatedRunArgs({
        model: MODEL,
        prompt: 'one',
        events: 'xml',
      }),
    ).toMatchObject({ valid: false, code: 'unsupported_events' })
  })

  test('reads a file prompt and refuses implicit tty stdin', async () => {
    await expect(
      readDelegatedPrompt({
        promptFile: 'prompt.md',
        readFile: async () => 'from file',
      }),
    ).resolves.toBe('from file')

    await expect(
      readDelegatedPrompt({ promptFile: '-', stdinIsTTY: true }),
    ).rejects.toMatchObject({ code: 'prompt_stdin_requires_pipe' })
  })
})

function createDependencies(): {
  dependencies: DelegatedRunDependencies
  calls: string[]
} {
  const calls: string[] = []
  const dependencies: DelegatedRunDependencies = {
    getToken: () => 'token',
    admit: async ({ model }) => {
      calls.push(`admit:${model}`)
      return { instanceId: 'instance-1', model, expiresAt: EXPIRES_AT }
    },
    resume: async ({ sessionId, model }) => {
      calls.push(`resume:${sessionId}`)
      return {
        instanceId: sessionId,
        model: model ?? MODEL,
        expiresAt: EXPIRES_AT,
      }
    },
    release: async () => {
      calls.push('release')
    },
    getClient: async () => ({
      run: async (options) => {
        calls.push(`run:${options.agent}`)
        expect(options.costMode).toBe('free')
        expect(options.extraCodebuffMetadata).toEqual({
          freebuff_instance_id: 'instance-1',
        })
        options.handleEvent?.({
          type: 'finish',
          agentId: options.agent,
          totalCost: 0,
        })
        return {
          traceSessionId: 'trace-1',
          output: {
            type: 'lastMessage' as const,
            value: [
              { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
            ],
          },
        }
      },
    }),
    loadAgents: () => [],
    fetchSponsors: async () => {
      calls.push('sponsors')
      return { status: 'filled', ads: [ad] }
    },
    resolveAgent: () => 'base3-free-deepseek',
    loadContinuation: async () => null,
    saveContinuation: async () => undefined,
    removeContinuation: async () => {},
    now: () => 2_000,
  }
  return { dependencies, calls }
}

test('returns opaque agent output and sanitized sponsor messages', async () => {
  const { dependencies, calls } = createDependencies()
  const result = await runDelegated(
    { model: MODEL, prompt: 'Fix it', timeoutMs: 10_000 },
    dependencies,
  )

  expect(result.exitCode).toBe(0)
  expect(result.envelope).toMatchObject({
    schemaVersion: 1,
    status: 'success',
    model: MODEL,
    agent: 'base3-free-deepseek',
    sponsorStatus: 'filled',
    sponsors: [
      {
        provider: 'gravity',
        title: 'Example',
        message: 'Build faster with Example.',
        cta: 'Learn more',
        url: 'https://example.com',
        surface: 'cli_chat',
        placement: 'Single-Ad-Unit-1',
      },
    ],
  })
  expect(result.envelope.output?.type).toBe('lastMessage')
  expect(result.envelope.sponsors[0]).not.toHaveProperty('clickUrl')
  expect(result.envelope.sponsors[0]).not.toHaveProperty('impUrl')
  expect(result.envelope.sponsors[0]).not.toHaveProperty('impressionIds')
  expect(calls).toEqual([
    'admit:deepseek/deepseek-v4-pro',
    'sponsors',
    'run:base3-free-deepseek',
    'release',
  ])
})

test('authentication failure is structured and does not start a session', async () => {
  const { dependencies, calls } = createDependencies()
  dependencies.getToken = () => undefined

  const result = await runDelegated(
    { model: MODEL, prompt: 'Fix it', timeoutMs: 10_000 },
    dependencies,
  )

  expect(result.exitCode).toBe(1)
  expect(result.envelope).toMatchObject({
    status: 'error',
    error: {
      code: 'auth_required',
    },
    sponsors: [],
    sponsorStatus: 'unavailable',
  })
  expect(calls).toEqual([])
})

test('keeps a retained session and returns its lease metadata', async () => {
  const { dependencies, calls } = createDependencies()
  const result = await runDelegated(
    {
      model: MODEL,
      prompt: 'Keep it',
      timeoutMs: 10_000,
      keepSession: true,
    },
    dependencies,
  )

  expect(result.envelope.session).toEqual({
    id: 'instance-1',
    model: MODEL,
    expiresAt: EXPIRES_AT,
  })
  expect(calls).not.toContain('release')
})

test('resumes a retained session without admitting a new one', async () => {
  const { dependencies, calls } = createDependencies()
  const result = await runDelegated(
    {
      sessionId: 'session-1',
      prompt: 'Resume it',
      timeoutMs: 10_000,
      keepSession: true,
    },
    dependencies,
  )

  expect(result.envelope.model).toBe(MODEL)
  expect(result.envelope.session).toEqual({
    id: 'session-1',
    model: MODEL,
    expiresAt: EXPIRES_AT,
  })
  expect(calls).toContain('resume:session-1')
  expect(calls).not.toContain('admit:undefined')
  expect(calls).not.toContain('release')
})

test('emits safe lifecycle events and returns a continuation handle', async () => {
  const { dependencies } = createDependencies()
  const events: DelegatedRunEvent[] = []
  const continuation: DelegatedContinuationRecord = {
    version: 1,
    id: 'continuation-1',
    model: MODEL,
    cwd: '/workspace',
    createdAt: 2_000,
    expiresAt: 3_000,
    runState: {
      traceSessionId: 'trace-1',
      sessionState: {} as never,
      output: { type: 'lastMessage', value: [] },
    },
  }
  dependencies.saveContinuation = async () => continuation.id
  dependencies.removeContinuation = async () => {}
  dependencies.getClient = async () => ({
    run: async (options) => {
      options.handleEvent?.({
        type: 'finish',
        agentId: options.agent,
        totalCost: 0,
      })
      return {
        traceSessionId: 'trace-1',
        sessionState: {} as never,
        output: {
          type: 'lastMessage' as const,
          value: [{ role: 'assistant', content: [] }],
        },
      }
    },
  })

  const result = await runDelegated(
    {
      model: MODEL,
      prompt: 'Fix it',
      cwd: '/workspace',
      timeoutMs: 10_000,
      onEvent: (event) => events.push(event),
    },
    dependencies,
  )

  expect(events.map((event) => event.type)).toEqual([
    'run_started',
    'session_admitted',
    'sponsor_batch',
    'agent_started',
    'agent_finished',
  ])
  expect(events).not.toContainEqual(
    expect.objectContaining({ prompt: expect.anything() }),
  )
  expect(result.envelope.continuationId).toBe('continuation-1')
})

test('resumes a continuation with the stored model and run state', async () => {
  const { dependencies, calls } = createDependencies()
  const previousRun = {
    traceSessionId: 'trace-previous',
    sessionState: {} as never,
    output: { type: 'lastMessage' as const, value: [] },
  }
  let loadedId: string | undefined
  dependencies.loadContinuation = async (id) => {
    loadedId = id
    return {
      version: 1,
      id,
      model: MODEL,
      cwd: '/workspace',
      createdAt: 1_000,
      expiresAt: 3_000,
      runState: previousRun,
    }
  }
  dependencies.saveContinuation = async () => 'continuation-2'
  dependencies.removeContinuation = async (id) => {
    calls.push(`remove:${id}`)
  }

  const result = await runDelegated(
    {
      prompt: 'Continue it',
      continuationId: 'continuation-1',
      cwd: '/workspace',
      timeoutMs: 10_000,
    },
    {
      ...dependencies,
      getClient: async () => ({
        run: async (options) => {
          expect(options.previousRun).toBe(previousRun)
          return {
            traceSessionId: 'trace-next',
            sessionState: {} as never,
            output: { type: 'lastMessage' as const, value: [] },
          }
        },
      }),
    },
  )

  expect(loadedId).toBe('continuation-1')
  expect(result.envelope.model).toBe(MODEL)
  expect(result.envelope.continuationId).toBe('continuation-2')
  expect(calls).toContain('remove:continuation-1')
})

test('returns graceful cancellation and releases the admitted session', async () => {
  const { dependencies, calls } = createDependencies()
  dependencies.getClient = async () => ({
    run: async (options) =>
      new Promise<never>((_resolve, reject) => {
        if (options.signal.aborted) {
          reject(new Error('aborted'))
          return
        }
        options.signal.addEventListener('abort', () => {
          reject(new Error('aborted'))
        })
      }),
  })
  const controller = new AbortController()
  const resultPromise = runDelegated(
    {
      model: MODEL,
      prompt: 'Cancel it',
      timeoutMs: 10_000,
      signal: controller.signal,
    },
    dependencies,
  )

  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  controller.abort()
  const result = await resultPromise

  expect(result.exitCode).toBe(130)
  expect(result.envelope).toMatchObject({
    status: 'cancelled',
    error: { code: 'cancelled' },
  })
  expect(calls).toContain('release')
})

test('emits terminal failure and cancellation events before completion', async () => {
  const { dependencies } = createDependencies()
  const failureEvents: DelegatedRunEvent[] = []
  dependencies.getClient = async () => ({
    run: async () => ({
      traceSessionId: 'trace-failure',
      sessionState: {} as never,
      output: {
        type: 'error' as const,
        error: 'agent_error',
        message: 'agent failed',
      },
    }),
  })

  const failure = await runDelegated(
    {
      model: MODEL,
      prompt: 'Fail it',
      timeoutMs: 10_000,
      onEvent: (event) => failureEvents.push(event),
    },
    dependencies,
  )

  expect(failure.exitCode).toBe(1)
  expect(failureEvents.map((event) => event.type)).toContain('run_failed')

  const { dependencies: cancellationDependencies } = createDependencies()
  const cancellationEvents: DelegatedRunEvent[] = []
  cancellationDependencies.getClient = async () => ({
    run: async (options) =>
      new Promise<never>((_resolve, reject) => {
        if (options.signal.aborted) {
          reject(new Error('aborted'))
          return
        }
        options.signal.addEventListener('abort', () =>
          reject(new Error('aborted')),
        )
      }),
  })
  const controller = new AbortController()
  const cancellation = runDelegated(
    {
      model: MODEL,
      prompt: 'Cancel it',
      timeoutMs: 10_000,
      signal: controller.signal,
      onEvent: (event) => cancellationEvents.push(event),
    },
    cancellationDependencies,
  )
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  controller.abort()

  const cancelled = await cancellation
  expect(cancelled.exitCode).toBe(130)
  expect(cancellationEvents.map((event) => event.type)).toContain(
    'run_cancelled',
  )
})

test('turns headless interactive input into a structured failure', async () => {
  const { dependencies } = createDependencies()
  dependencies.getClient = async () => ({
    interactiveInputRequested: () => true,
    run: async () => ({
      traceSessionId: 'trace-interactive',
      sessionState: {} as never,
      output: { type: 'lastMessage' as const, value: [] },
    }),
  })

  const result = await runDelegated(
    { model: MODEL, prompt: 'Ask me', timeoutMs: 10_000 },
    dependencies,
  )

  expect(result.exitCode).toBe(1)
  expect(result.envelope.error).toEqual({
    code: 'interactive_input_required',
    message: 'The selected agent requested interactive input.',
  })
})
