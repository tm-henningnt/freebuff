import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, test } from 'bun:test'

import { requireFreebuffBinary } from '../utils'

function isolatedEnv(home: string, apiKey = ''): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: home,
    CODEBUFF_API_KEY: apiKey,
    NO_COLOR: '1',
    TERM: 'dumb',
  }
}

function runBinary(
  binary: string,
  args: string[],
  cwd: string,
  home: string,
  apiKey = '',
) {
  return spawnSync(binary, args, {
    cwd,
    env: isolatedEnv(home, apiKey),
    encoding: 'utf8',
    timeout: 30_000,
  })
}

describe('Freebuff delegated run contract', () => {
  test('advertises JSONL events and continuation in help', () => {
    const binary = requireFreebuffBinary()
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-home-'))
    const result = spawnSync(binary, ['--help'], {
      env: isolatedEnv(home),
      encoding: 'utf8',
      timeout: 30_000,
    })

    try {
      expect(result.status).toBe(0)
      expect(result.stdout).toContain('--events')
      expect(result.stdout).toContain('--continue')
      expect(result.stdout).toContain('--session')
      expect(result.stdout).toContain('--keep-session')
      expect(result.stdout).toContain('session end')
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  test('lists the local model catalog as JSON', () => {
    const binary = requireFreebuffBinary()
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-run-'))
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-home-'))

    try {
      const result = runBinary(
        binary,
        ['models', '--format', 'json'],
        workspace,
        home,
      )
      expect(result.status).toBe(0)
      expect(JSON.parse(result.stdout)).toEqual(expect.any(Array))
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true })
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  test('returns a JSONL authentication failure without TUI output', () => {
    const binary = requireFreebuffBinary()
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-run-'))
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-home-'))

    try {
      const result = runBinary(
        binary,
        [
          'run',
          '--model',
          'deepseek/deepseek-v4-pro',
          '--prompt',
          'Do not execute this task',
          '--events',
          'jsonl',
        ],
        workspace,
        home,
      )

      expect(result.status).toBe(1)
      const events = result.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>)
      expect(events[0]).toMatchObject({
        schemaVersion: 1,
        type: 'run_started',
      })
      expect(events.at(-1)).toMatchObject({
        schemaVersion: 1,
        type: 'completion',
        envelope: {
          status: 'error',
          error: {
            code: 'auth_required',
            message:
              'Freebuff authentication is required. No token was found in the local credentials file or CODEBUFF_API_KEY. Run `freebuff login` or set CODEBUFF_API_KEY.',
          },
        },
      })
      expect(result.stdout).not.toContain('Do not execute this task')
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true })
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  test('returns an invalid-argument completion for a missing prompt', () => {
    const binary = requireFreebuffBinary()
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-run-'))
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-home-'))

    try {
      const result = runBinary(
        binary,
        ['run', '--model', 'deepseek/deepseek-v4-pro'],
        workspace,
        home,
      )
      expect(result.status).toBe(2)
      expect(JSON.parse(result.stdout)).toMatchObject({
        schemaVersion: 1,
        status: 'error',
        error: { code: 'prompt_required' },
      })
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true })
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  const liveEnabled =
    process.env.FREEBUFF_LIVE_E2E === '1' &&
    Boolean(process.env.CODEBUFF_API_KEY)

  test.skipIf(!liveEnabled)(
    liveEnabled
      ? 'runs a minimal authenticated delegated task against Freebuff services'
      : 'runs a minimal authenticated delegated task against Freebuff services (skipped: set FREEBUFF_LIVE_E2E=1 and CODEBUFF_API_KEY)',
    () => {
      const binary = requireFreebuffBinary()
      const workspace = fs.mkdtempSync(
        path.join(os.tmpdir(), 'freebuff-live-run-'),
      )
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-live-home-'))

      try {
        const result = runBinary(
          binary,
          [
            'run',
            '--model',
            process.env.FREEBUFF_LIVE_MODEL ?? 'deepseek/deepseek-v4-pro',
            '--prompt',
            'Reply with a short message. Do not edit any files.',
            '--max-agent-steps',
            '2',
            '--timeout',
            '180',
          ],
          workspace,
          home,
          process.env.CODEBUFF_API_KEY,
        )

        expect(result.status).toBe(0)
        const envelope = JSON.parse(result.stdout) as Record<string, unknown>
        expect(envelope).toMatchObject({
          schemaVersion: 1,
          status: 'success',
          sponsors: expect.any(Array),
        })
        expect(['filled', 'no_fill', 'unavailable']).toContain(
          envelope.sponsorStatus,
        )
      } finally {
        fs.rmSync(workspace, { recursive: true, force: true })
        fs.rmSync(home, { recursive: true, force: true })
      }
    },
    240_000,
  )
})
