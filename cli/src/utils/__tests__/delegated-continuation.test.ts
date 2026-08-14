import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, expect, test } from 'bun:test'

import {
  createDelegatedContinuationStore,
  type DelegatedContinuationRecord,
} from '../delegated-continuation'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function createRecord(
  now: number,
): Omit<DelegatedContinuationRecord, 'id' | 'version'> {
  return {
    model: 'deepseek/deepseek-v4-pro',
    cwd: '/workspace',
    createdAt: now,
    expiresAt: now + 1_000,
    runState: {
      traceSessionId: 'trace-1',
      sessionState: {} as never,
      output: { type: 'lastMessage', value: [] },
    },
  }
}

test('persists and loads an opaque continuation handle', async () => {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'freebuff-continuation-'))
  tempDirs.push(baseDir)
  const store = createDelegatedContinuationStore({
    baseDir,
    now: () => 1_000,
  })

  const id = await store.save(createRecord(1_000))
  expect(id).toMatch(/^[0-9a-f-]{36}$/)
  expect(readFileSync(path.join(baseDir, `${id}.json`), 'utf8')).toContain(id)
  await expect(store.load(id)).resolves.toMatchObject({
    id,
    model: 'deepseek/deepseek-v4-pro',
    cwd: '/workspace',
  })
})

test('expires and removes stale continuation handles', async () => {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'freebuff-continuation-'))
  tempDirs.push(baseDir)
  let now = 1_000
  const store = createDelegatedContinuationStore({
    baseDir,
    now: () => now,
  })

  const id = await store.save({
    ...createRecord(now),
    expiresAt: now + 10,
  })
  now = 1_011

  await expect(store.load(id)).resolves.toBeNull()
  await expect(store.remove(id)).resolves.toBeUndefined()
})
