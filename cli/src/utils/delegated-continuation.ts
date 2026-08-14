import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { RunState } from '@codebuff/sdk'

import { getProjectDataDir } from '../project-files'
import { serializeForPersistence } from './safe-json'
import { writeFileAtomicAsync } from './write-file-atomic'

export const DELEGATED_CONTINUATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000
export const DELEGATED_CONTINUATION_MAX_ENTRIES = 32
export const DELEGATED_CONTINUATION_VERSION = 1

export type DelegatedContinuationRecord = {
  version: typeof DELEGATED_CONTINUATION_VERSION
  id: string
  model: string
  cwd: string
  createdAt: number
  expiresAt: number
  runState: RunState
}

export type DelegatedContinuationInput = Omit<
  DelegatedContinuationRecord,
  'id' | 'version'
>

export type DelegatedContinuationStore = {
  save: (record: DelegatedContinuationInput) => Promise<string>
  load: (id: string) => Promise<DelegatedContinuationRecord | null>
  remove: (id: string) => Promise<void>
}

export function createDelegatedContinuationStore(
  options: {
    baseDir?: string
    now?: () => number
    ttlMs?: number
    maxEntries?: number
  } = {},
): DelegatedContinuationStore {
  const baseDir =
    options.baseDir ?? path.join(getProjectDataDir(), 'delegated-continuations')
  const now = options.now ?? Date.now
  const ttlMs = options.ttlMs ?? DELEGATED_CONTINUATION_TTL_MS
  const maxEntries = options.maxEntries ?? DELEGATED_CONTINUATION_MAX_ENTRIES

  const filePath = (id: string) => path.join(baseDir, `${id}.json`)

  const isValidId = (id: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      id,
    )

  const remove = async (id: string): Promise<void> => {
    if (!isValidId(id)) return
    await fs.unlink(filePath(id)).catch(() => {})
  }

  const prune = async (): Promise<void> => {
    const entries = await fs
      .readdir(baseDir, { withFileTypes: true })
      .catch(() => [])
    const files = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith('.json') &&
          isValidId(entry.name.slice(0, -'.json'.length)),
      )
      .map((entry) => entry.name)

    const candidates = await Promise.all(
      files.map(async (name) => {
        const id = name.slice(0, -'.json'.length)
        try {
          const record = JSON.parse(
            await fs.readFile(path.join(baseDir, name), 'utf8'),
          ) as Partial<DelegatedContinuationRecord>
          const stat = await fs.stat(path.join(baseDir, name))
          return {
            id,
            expiresAt:
              typeof record.expiresAt === 'number' ? record.expiresAt : 0,
            mtimeMs: stat.mtimeMs,
          }
        } catch {
          return { id, expiresAt: 0, mtimeMs: 0 }
        }
      }),
    )

    const expired = candidates.filter((entry) => entry.expiresAt <= now())
    await Promise.all(expired.map((entry) => remove(entry.id)))

    const remaining = candidates
      .filter((entry) => entry.expiresAt > now())
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
    await Promise.all(
      remaining.slice(maxEntries).map((entry) => remove(entry.id)),
    )
  }

  return {
    async save(record) {
      await fs.mkdir(baseDir, { recursive: true })
      const id = randomUUID()
      const expiresAt = Math.min(record.expiresAt, now() + ttlMs)
      const persisted: DelegatedContinuationRecord = {
        version: DELEGATED_CONTINUATION_VERSION,
        ...record,
        id,
        expiresAt,
      }
      const { json } = serializeForPersistence(persisted)
      await writeFileAtomicAsync(filePath(id), json)
      await fs.chmod(filePath(id), 0o600).catch(() => {})
      await prune()
      return id
    },

    async load(id) {
      if (!isValidId(id)) return null
      try {
        const record = JSON.parse(
          await fs.readFile(filePath(id), 'utf8'),
        ) as DelegatedContinuationRecord
        if (
          record.version !== DELEGATED_CONTINUATION_VERSION ||
          record.id !== id ||
          typeof record.model !== 'string' ||
          typeof record.cwd !== 'string' ||
          typeof record.createdAt !== 'number' ||
          typeof record.expiresAt !== 'number' ||
          !record.runState
        ) {
          return null
        }
        if (record.expiresAt <= now()) {
          await remove(id)
          return null
        }
        return record
      } catch {
        return null
      }
    },

    remove,
  }
}
