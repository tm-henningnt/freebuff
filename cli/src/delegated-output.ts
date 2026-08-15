import type { DelegatedRunEnvelope, DelegatedRunEvent } from './delegated-run'

export type DelegatedOutputMode = 'json' | 'jsonl'

export type DelegatedSessionEndEnvelope = {
  schemaVersion: 1
  status: 'ended' | 'error'
  sessionId?: string
  model?: string
  expiresAt?: string
  error?: {
    code: string
    message: string
  }
}

export function serializeDelegatedEvent(event: DelegatedRunEvent): string {
  return `${JSON.stringify(event)}\n`
}

export function serializeDelegatedCompletion(
  envelope: DelegatedRunEnvelope,
  mode: DelegatedOutputMode = 'json',
): string {
  if (mode === 'jsonl') {
    return serializeDelegatedEvent({
      schemaVersion: 1,
      type: 'completion',
      envelope,
    })
  }
  return `${JSON.stringify(envelope)}\n`
}

export function serializeDelegatedSessionEnd(
  envelope: DelegatedSessionEndEnvelope,
): string {
  return `${JSON.stringify(envelope)}\n`
}
