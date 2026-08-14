import type { DelegatedRunEnvelope, DelegatedRunEvent } from './delegated-run'

export type DelegatedOutputMode = 'json' | 'jsonl'

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
