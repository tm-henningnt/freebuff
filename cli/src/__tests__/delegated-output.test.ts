import { expect, test } from 'bun:test'

import {
  serializeDelegatedCompletion,
  serializeDelegatedEvent,
} from '../delegated-output'
import type { DelegatedRunEnvelope } from '../delegated-run'

const envelope: DelegatedRunEnvelope = {
  schemaVersion: 1,
  status: 'success',
  model: 'deepseek/deepseek-v4-pro',
  durationMs: 12,
  sponsors: [],
  sponsorStatus: 'no_fill',
}

test('serializes the default delegated result as one JSON object', () => {
  const output = serializeDelegatedCompletion(envelope)
  expect(output.endsWith('\n')).toBe(true)
  expect(JSON.parse(output)).toEqual(envelope)
})

test('serializes JSONL completion as a versioned completion event', () => {
  const output = serializeDelegatedCompletion(envelope, 'jsonl')
  expect(JSON.parse(output)).toEqual({
    schemaVersion: 1,
    type: 'completion',
    envelope,
  })
})

test('serializes lifecycle events without adding prompt data', () => {
  const output = serializeDelegatedEvent({
    schemaVersion: 1,
    type: 'run_started',
    model: 'deepseek/deepseek-v4-pro',
    continuation: false,
  })
  expect(JSON.parse(output)).toEqual({
    schemaVersion: 1,
    type: 'run_started',
    model: 'deepseek/deepseek-v4-pro',
    continuation: false,
  })
  expect(output).not.toContain('prompt')
})
