import fs from 'node:fs/promises'
import path from 'node:path'

import {
  SUPPORTED_FREEBUFF_MODELS,
  isFreebuffPausedFreeModelId,
  isSupportedFreebuffModelId,
} from '@codebuff/common/constants/freebuff-models'
import { callFreebuffSession } from './utils/freebuff-session-api'
import { getAuthTokenDetails } from './utils/auth'
import {
  getHeadlessCodebuffClient,
  wasHeadlessInteractiveInputRequested,
} from './utils/codebuff-client'
import { getFreebuffCliAgentIdForModel } from './utils/freebuff-agent-selection'
import { isSensitiveFile } from './utils/create-run-config'
import { loadAgentDefinitions } from './utils/local-agent-registry'
import {
  createDelegatedContinuationStore,
  DELEGATED_CONTINUATION_TTL_MS,
  type DelegatedContinuationRecord,
  type DelegatedContinuationStore,
} from './utils/delegated-continuation'
import {
  requestAds,
  toSponsorMessage,
  type AdMessage,
  type AdRequestResult,
  type SponsorMessage,
} from './utils/sponsor-ads'
import {
  DelegatedSessionError,
  resumeDelegatedSession,
  type DelegatedSessionLease,
} from './delegated-session'

import type { AgentDefinition, RunState } from '@codebuff/sdk'
import type { AgentOutput } from '@codebuff/common/types/session-state'

export const DELEGATED_RUN_DEFAULT_TIMEOUT_MS = 30 * 60 * 1000
export const DELEGATED_RUN_EXIT_CODES = {
  success: 0,
  runtimeError: 1,
  invalidArguments: 2,
  cancelled: 130,
} as const

export type SponsorStatus = AdRequestResult['status']

export type DelegatedRunEnvelope = {
  schemaVersion: 1
  status: 'success' | 'error' | 'cancelled'
  model?: string
  agent?: string
  durationMs: number
  output?: AgentOutput
  traceSessionId?: string
  cost?: number
  continuationId?: string
  session?: DelegatedSessionLease
  sponsors: SponsorMessage[]
  sponsorStatus: SponsorStatus
  error?: {
    code: string
    message: string
  }
}

export type DelegatedRunArgs = {
  model?: string
  prompt?: string
  promptFile?: string
  cwd?: string
  timeout?: string
  maxAgentSteps?: string
  format?: string
  events?: string
  continue?: boolean
  continueId?: string | null
  sessionId?: string
  keepSession?: boolean
}

export type DelegatedRunValidation =
  | {
      valid: true
      model?: string
      timeoutMs: number
      maxAgentSteps?: number
      continuationId?: string
      sessionId?: string
      keepSession: boolean
    }
  | { valid: false; code: string; message: string }

export type DelegatedRunEvent =
  | {
      schemaVersion: 1
      type: 'run_started'
      model?: string
      continuation: boolean
    }
  | {
      schemaVersion: 1
      type: 'session_admitted'
      model: string
      elapsedMs: number
      session?: DelegatedSessionLease
    }
  | {
      schemaVersion: 1
      type: 'sponsor_batch'
      status: SponsorStatus
      sponsors: SponsorMessage[]
      elapsedMs: number
    }
  | {
      schemaVersion: 1
      type: 'agent_started'
      model: string
      agent: string
      elapsedMs: number
    }
  | {
      schemaVersion: 1
      type: 'agent_finished'
      model: string
      agent: string
      elapsedMs: number
      cost?: number
    }
  | {
      schemaVersion: 1
      type: 'run_failed'
      code: string
      elapsedMs: number
    }
  | {
      schemaVersion: 1
      type: 'run_cancelled'
      elapsedMs: number
      timedOut: boolean
    }
  | {
      schemaVersion: 1
      type: 'completion'
      envelope: DelegatedRunEnvelope
    }

export type DelegatedRunDependencies = {
  getToken: () => string | undefined
  admit: (params: {
    token: string
    model: string
    signal: AbortSignal
  }) => Promise<{ instanceId: string; model: string; expiresAt: string }>
  resume: (params: {
    token: string
    sessionId: string
    model?: string
    signal: AbortSignal
  }) => Promise<{ instanceId: string; model: string; expiresAt: string }>
  release: (params: { token: string; instanceId: string }) => Promise<void>
  getClient: () => Promise<DelegatedClient | null>
  loadAgents: () => AgentDefinition[]
  fetchSponsors: (params: {
    token: string
    prompt: string
    signal: AbortSignal
  }) => Promise<AdRequestResult>
  resolveAgent: (model: string) => string
  loadContinuation: (id: string) => Promise<DelegatedContinuationRecord | null>
  saveContinuation: (params: {
    model: string
    cwd: string
    runState: RunState
    now: number
  }) => Promise<string | undefined>
  removeContinuation: (id: string) => Promise<void>
  now?: () => number
}

export type DelegatedClient = {
  interactiveInputRequested?: () => boolean
  run: (options: {
    agent: string
    prompt: string
    agentDefinitions: AgentDefinition[]
    costMode: 'free'
    signal: AbortSignal
    previousRun?: RunState
    maxAgentSteps?: number
    extraCodebuffMetadata?: Record<string, string>
    handleEvent?: (event: {
      type: string
      totalCost?: number
      agentId?: string
    }) => void
    fileFilter?: (filePath: string) => { status: 'allow' | 'blocked' }
  }) => Promise<RunState>
}

export function validateDelegatedRunArgs(
  args: DelegatedRunArgs,
): DelegatedRunValidation {
  const continuationId = args.continueId?.trim() || undefined
  const sessionId = args.sessionId?.trim() || undefined
  if (args.continue && !continuationId) {
    return {
      valid: false,
      code: 'continuation_id_required',
      message:
        '`--continue` requires a continuation handle for `freebuff run`.',
    }
  }
  if (!args.continue && continuationId) {
    return {
      valid: false,
      code: 'invalid_continuation',
      message: 'A continuation handle requires `--continue`.',
    }
  }
  if (!args.model?.trim() && !continuationId && !sessionId) {
    return {
      valid: false,
      code: 'model_required',
      message: '--model is required for `freebuff run`.',
    }
  }
  if (args.model?.trim() && !isSupportedFreebuffModelId(args.model.trim())) {
    return {
      valid: false,
      code: 'unsupported_model',
      message: `Unsupported Freebuff model: ${args.model.trim()}`,
    }
  }
  if (args.prompt !== undefined && args.promptFile !== undefined) {
    return {
      valid: false,
      code: 'multiple_prompt_sources',
      message: 'Specify exactly one of --prompt or --prompt-file.',
    }
  }
  if (args.prompt === undefined && args.promptFile === undefined) {
    return {
      valid: false,
      code: 'prompt_required',
      message: 'A delegated run requires --prompt or --prompt-file.',
    }
  }
  if (args.format && args.format !== 'json') {
    return {
      valid: false,
      code: 'unsupported_format',
      message: '`freebuff run` currently supports only --format json.',
    }
  }
  if (args.events && args.events !== 'jsonl') {
    return {
      valid: false,
      code: 'unsupported_events',
      message: '`freebuff run` currently supports only --events jsonl.',
    }
  }

  const timeoutMs = parsePositiveIntegerSeconds(
    args.timeout,
    DELEGATED_RUN_DEFAULT_TIMEOUT_MS,
  )
  if (timeoutMs === null) {
    return {
      valid: false,
      code: 'invalid_timeout',
      message: '--timeout must be a positive whole number of seconds.',
    }
  }

  const maxAgentSteps = parsePositiveInteger(args.maxAgentSteps)
  if (args.maxAgentSteps !== undefined && maxAgentSteps === null) {
    return {
      valid: false,
      code: 'invalid_max_agent_steps',
      message: '--max-agent-steps must be a positive whole number.',
    }
  }

  return {
    valid: true,
    ...(args.model?.trim() ? { model: args.model.trim() } : {}),
    timeoutMs,
    ...(continuationId ? { continuationId } : {}),
    ...(sessionId ? { sessionId } : {}),
    keepSession: Boolean(args.keepSession),
    ...(maxAgentSteps !== undefined && maxAgentSteps !== null
      ? { maxAgentSteps }
      : {}),
  }
}

export async function readDelegatedPrompt(params: {
  prompt?: string
  promptFile?: string
  stdinIsTTY?: boolean
  readFile?: (path: string, encoding: 'utf8') => Promise<string>
  readStdin?: () => Promise<string>
}): Promise<string> {
  const readFile =
    params.readFile ??
    ((path: string, encoding: 'utf8') => fs.readFile(path, encoding))
  const readStdin =
    params.readStdin ??
    (async () => {
      let value = ''
      for await (const chunk of process.stdin) value += String(chunk)
      return value
    })

  const prompt =
    params.prompt !== undefined
      ? params.prompt
      : params.promptFile === '-'
        ? params.stdinIsTTY
          ? ''
          : await readStdin()
        : params.promptFile
          ? await readFile(params.promptFile, 'utf8')
          : ''

  if (!prompt.trim()) {
    throw new DelegatedRunError(
      params.promptFile === '-' && params.stdinIsTTY
        ? 'prompt_stdin_requires_pipe'
        : 'empty_prompt',
      params.promptFile === '-' && params.stdinIsTTY
        ? 'Use --prompt-file - only when stdin is a pipe.'
        : 'The delegated prompt must not be empty.',
    )
  }
  return prompt
}

export class DelegatedRunError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'DelegatedRunError'
  }
}

export async function runDelegated(
  params: {
    model?: string
    prompt: string
    timeoutMs: number
    maxAgentSteps?: number
    cwd?: string
    continuationId?: string
    sessionId?: string
    keepSession?: boolean
    onEvent?: (event: DelegatedRunEvent) => void
    signal?: AbortSignal
  },
  dependencies: DelegatedRunDependencies = createDefaultDependencies(),
): Promise<{ envelope: DelegatedRunEnvelope; exitCode: number }> {
  const now = dependencies.now ?? Date.now
  const startedAt = now()
  const currentCwd = path.resolve(params.cwd ?? process.cwd())
  const controller = new AbortController()
  let timedOut = false
  let cost: number | undefined
  let agentFromEvent: string | undefined
  let sponsors: SponsorMessage[] = []
  let sponsorStatus: SponsorStatus = 'unavailable'
  let admission:
    { instanceId: string; model: string; expiresAt: string } | undefined
  let retainedSession: DelegatedSessionLease | undefined
  let token: string | undefined
  let effectiveModel = params.model
  let previousRun: RunState | undefined
  let savedContinuationId: string | undefined
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  let removeExternalAbort: (() => void) | undefined

  const emit = (event: DelegatedRunEvent): void => {
    try {
      params.onEvent?.(event)
    } catch {
      // Event consumers are observational. A closed or failed output stream
      // must not turn a successful agent run into a different task result.
    }
  }

  const finishErrorResult = (error: Parameters<typeof finishError>[0]) => {
    emit({
      schemaVersion: 1,
      type: 'run_failed',
      code: error.code,
      elapsedMs: Math.max(0, now() - startedAt),
    })
    return finishError({ ...error, session: retainedSession })
  }

  const finishCancelledResult = (
    cancelled: Parameters<typeof finishCancelled>[0],
  ) => {
    emit({
      schemaVersion: 1,
      type: 'run_cancelled',
      elapsedMs: Math.max(0, now() - startedAt),
      timedOut: timedOut,
    })
    return finishCancelled({ ...cancelled, session: retainedSession })
  }

  emit({
    schemaVersion: 1,
    type: 'run_started',
    ...(params.model ? { model: params.model } : {}),
    continuation: Boolean(params.continuationId),
  })

  if (params.signal) {
    const abort = () => controller.abort(params.signal?.reason)
    if (params.signal.aborted) abort()
    else {
      params.signal.addEventListener('abort', abort, { once: true })
      removeExternalAbort = () =>
        params.signal?.removeEventListener('abort', abort)
    }
  }
  timeoutHandle = setTimeout(() => {
    timedOut = true
    controller.abort(
      new DelegatedRunError('timeout', 'Delegated run timed out.'),
    )
  }, params.timeoutMs)

  try {
    token = dependencies.getToken()
    if (!token) {
      return finishErrorResult({
        startedAt,
        now,
        model: effectiveModel,
        sponsors,
        sponsorStatus,
        code: 'auth_required',
        message:
          'No authentication token is available. Run `freebuff login` first.',
      })
    }

    if (params.continuationId) {
      const continuation = await dependencies.loadContinuation(
        params.continuationId,
      )
      if (!continuation) {
        return finishErrorResult({
          startedAt,
          now,
          model: effectiveModel,
          sponsors,
          sponsorStatus,
          code: 'continuation_unavailable',
          message: 'The continuation handle is missing, invalid, or expired.',
        })
      }
      if (path.resolve(continuation.cwd) !== currentCwd) {
        return finishErrorResult({
          startedAt,
          now,
          model: continuation.model,
          sponsors,
          sponsorStatus,
          code: 'continuation_workspace_mismatch',
          message: 'The continuation belongs to a different workspace.',
        })
      }
      if (effectiveModel && effectiveModel !== continuation.model) {
        return finishErrorResult({
          startedAt,
          now,
          model: effectiveModel,
          sponsors,
          sponsorStatus,
          code: 'continuation_model_mismatch',
          message: 'The continuation belongs to a different Freebuff model.',
        })
      }
      effectiveModel = continuation.model
      previousRun = continuation.runState
    }

    if (!effectiveModel && !params.sessionId) {
      return finishErrorResult({
        startedAt,
        now,
        sponsors,
        sponsorStatus,
        code: 'model_required',
        message: '--model is required for a new delegated run.',
      })
    }

    if (params.sessionId) {
      admission = await dependencies.resume({
        token,
        sessionId: params.sessionId,
        ...(effectiveModel ? { model: effectiveModel } : {}),
        signal: controller.signal,
      })
    } else {
      admission = await dependencies.admit({
        token,
        model: effectiveModel!,
        signal: controller.signal,
      })
    }
    effectiveModel = admission.model
    if (params.keepSession) {
      retainedSession = {
        id: admission.instanceId,
        model: admission.model,
        expiresAt: admission.expiresAt,
      }
    }
    emit({
      schemaVersion: 1,
      type: 'session_admitted',
      model: effectiveModel,
      elapsedMs: Math.max(0, now() - startedAt),
      ...(retainedSession ? { session: retainedSession } : {}),
    })

    const sponsorResult = await dependencies.fetchSponsors({
      token,
      prompt: params.prompt,
      signal: controller.signal,
    })
    sponsorStatus = sponsorResult.status
    sponsors = sponsorResult.ads.map((ad) =>
      toSponsorMessage({
        ad,
        surface: 'cli_chat',
        placement: 'Single-Ad-Unit-1',
      }),
    )
    emit({
      schemaVersion: 1,
      type: 'sponsor_batch',
      status: sponsorStatus,
      sponsors,
      elapsedMs: Math.max(0, now() - startedAt),
    })

    const client = await dependencies.getClient()
    if (!client) {
      return finishErrorResult({
        startedAt,
        now,
        model: effectiveModel,
        agent: dependencies.resolveAgent(effectiveModel),
        sponsors,
        sponsorStatus,
        code: 'client_unavailable',
        message: 'Unable to initialize the Freebuff client.',
      })
    }

    const agent = dependencies.resolveAgent(effectiveModel)
    emit({
      schemaVersion: 1,
      type: 'agent_started',
      model: effectiveModel,
      agent,
      elapsedMs: Math.max(0, now() - startedAt),
    })
    const runState = await client.run({
      agent,
      prompt: params.prompt,
      agentDefinitions: dependencies.loadAgents(),
      costMode: 'free',
      signal: controller.signal,
      ...(previousRun ? { previousRun } : {}),
      ...(params.maxAgentSteps !== undefined
        ? { maxAgentSteps: params.maxAgentSteps }
        : {}),
      ...(admission.instanceId
        ? {
            extraCodebuffMetadata: {
              freebuff_instance_id: admission.instanceId,
            },
          }
        : {}),
      handleEvent: (event) => {
        if (event.type === 'finish') {
          cost = event.totalCost
          agentFromEvent = event.agentId
          emit({
            schemaVersion: 1,
            type: 'agent_finished',
            model: effectiveModel!,
            agent: event.agentId ?? agent,
            elapsedMs: Math.max(0, now() - startedAt),
            ...(event.totalCost !== undefined ? { cost: event.totalCost } : {}),
          })
        }
      },
      fileFilter: (filePath) =>
        isSensitiveFile(filePath) ? { status: 'blocked' } : { status: 'allow' },
    })

    if (client.interactiveInputRequested?.()) {
      return finishErrorResult({
        startedAt,
        now,
        model: effectiveModel,
        agent: agentFromEvent ?? agent,
        runState,
        cost,
        sponsors,
        sponsorStatus,
        code: 'interactive_input_required',
        message: 'The selected agent requested interactive input.',
      })
    }

    if (runState.sessionState) {
      try {
        savedContinuationId = await dependencies.saveContinuation({
          model: effectiveModel,
          cwd: currentCwd,
          runState,
          now: now(),
        })
        if (params.continuationId && savedContinuationId) {
          await dependencies.removeContinuation(params.continuationId)
        }
      } catch {
        // Continuation is an optional convenience. A persistence failure must
        // not replace the completed agent result.
      }
    }

    if (controller.signal.aborted || timedOut) {
      return finishCancelledResult({
        startedAt,
        now,
        model: effectiveModel,
        agent: agentFromEvent ?? agent,
        runState,
        cost,
        sponsors,
        sponsorStatus,
        continuationId: savedContinuationId,
        message: timedOut
          ? 'Delegated run timed out.'
          : 'Delegated run was cancelled.',
      })
    }

    if (runState.output.type === 'error') {
      return finishErrorResult({
        startedAt,
        now,
        model: effectiveModel,
        agent: agentFromEvent ?? agent,
        runState,
        cost,
        sponsors,
        sponsorStatus,
        continuationId: savedContinuationId,
        code: 'agent_error',
        message: 'The delegated agent reported an error.',
      })
    }

    return {
      envelope: {
        schemaVersion: 1,
        status: 'success',
        model: effectiveModel,
        agent: agentFromEvent ?? agent,
        durationMs: Math.max(0, now() - startedAt),
        output: runState.output,
        traceSessionId: runState.traceSessionId,
        ...(cost !== undefined ? { cost } : {}),
        ...(savedContinuationId ? { continuationId: savedContinuationId } : {}),
        ...(retainedSession ? { session: retainedSession } : {}),
        sponsors,
        sponsorStatus,
      },
      exitCode: DELEGATED_RUN_EXIT_CODES.success,
    }
  } catch (error) {
    if (controller.signal.aborted || timedOut) {
      return finishCancelledResult({
        startedAt,
        now,
        model: effectiveModel,
        agent: agentFromEvent,
        cost,
        sponsors,
        sponsorStatus,
        continuationId: savedContinuationId,
        message: timedOut
          ? 'Delegated run timed out.'
          : 'Delegated run was cancelled.',
      })
    }

    const normalized = normalizeError(error)
    return finishErrorResult({
      startedAt,
      now,
      model: effectiveModel,
      agent: agentFromEvent,
      cost,
      sponsors,
      sponsorStatus,
      code: normalized.code,
      message: normalized.message,
    })
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
    removeExternalAbort?.()
    if (token && admission && !params.keepSession) {
      try {
        await dependencies.release({ token, instanceId: admission.instanceId })
      } catch {
        // Session cleanup is best effort. It must not replace the result the
        // caller is waiting for; the server-side expiry sweep is the backstop.
      }
    }
  }
}

export function getFreebuffModelCatalog() {
  // SUPPORTED_FREEBUFF_MODELS keeps a WITHDRAWN model's row so the server can
  // still recognise and coerce the id when an old, already-shipped binary
  // sends it — see FREEBUFF_PAUSED_FREE_MODEL_IDS. That backward-compat
  // reason does not apply to this catalog: a caller running `freebuff models`
  // is asking what to pick right now, not what a stale binary might still
  // hold, so a paused row here just admits with model_unavailable. Filter it
  // out rather than list a model that cannot be selected.
  return SUPPORTED_FREEBUFF_MODELS.filter(
    (model) => !isFreebuffPausedFreeModelId(model.id),
  ).map((model) => ({
    id: model.id,
    displayName: model.displayName,
    tagline: model.tagline,
    availability: model.availability,
    premium: model.premium,
    multimodal: model.multimodal,
    ...('warning' in model && model.warning ? { warning: model.warning } : {}),
    dataUse: model.dataUse,
  }))
}

function createDefaultDependencies(): DelegatedRunDependencies {
  const continuationStore: DelegatedContinuationStore =
    createDelegatedContinuationStore()
  return {
    getToken: () => getAuthTokenDetails().token,
    admit: async ({ token, model, signal }) => {
      const response = await callFreebuffSession('POST', token, {
        model,
        signal,
      })
      if (response.status !== 'active' || response.model !== model) {
        throw new DelegatedRunError(
          response.status === 'model_unavailable' ||
            response.status === 'model_locked'
            ? 'model_unavailable'
            : 'session_admission_failed',
          `Freebuff could not admit the requested model (${response.status}).`,
        )
      }
      return {
        instanceId: response.instanceId,
        model: response.model,
        expiresAt: response.expiresAt,
      }
    },
    resume: async ({ token, sessionId, model, signal }) => {
      const lease = await resumeDelegatedSession({
        token,
        sessionId,
        ...(model ? { model } : {}),
        signal,
      })
      return {
        instanceId: lease.id,
        model: lease.model,
        expiresAt: lease.expiresAt,
      }
    },
    release: async ({ token, instanceId }) => {
      await callFreebuffSession('DELETE', token, { instanceId })
    },
    getClient: async () => {
      const client = await getHeadlessCodebuffClient()
      return client
        ? {
            run: (options: Parameters<DelegatedClient['run']>[0]) =>
              client.run(options),
            interactiveInputRequested: wasHeadlessInteractiveInputRequested,
          }
        : null
    },
    loadAgents: loadAgentDefinitions,
    fetchSponsors: async ({ token, prompt, signal }) => {
      const messages: AdMessage[] = [
        { role: 'user', content: `<user_message>${prompt}</user_message>` },
      ]
      return requestAds({
        token,
        messages,
        surface: 'cli_chat',
        placementId: 'Single-Ad-Unit-1',
        signal,
      })
    },
    resolveAgent: getFreebuffCliAgentIdForModel,
    loadContinuation: (id) => continuationStore.load(id),
    saveContinuation: ({ model, cwd, runState, now }) =>
      continuationStore.save({
        model,
        cwd,
        runState,
        createdAt: now,
        expiresAt: now + DELEGATED_CONTINUATION_TTL_MS,
      }),
    removeContinuation: (id) => continuationStore.remove(id),
  }
}

function parsePositiveIntegerSeconds(
  value: string | undefined,
  fallbackMs: number,
): number | null {
  if (value === undefined) return fallbackMs
  const seconds = parsePositiveInteger(value)
  return typeof seconds === 'number' ? seconds * 1000 : null
}

function parsePositiveInteger(
  value: string | undefined,
): number | null | undefined {
  if (value === undefined) return undefined
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function normalizeError(error: unknown): { code: string; message: string } {
  if (error instanceof DelegatedRunError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof DelegatedSessionError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof Error) {
    return { code: 'runtime_error', message: 'Delegated run failed.' }
  }
  return { code: 'runtime_error', message: 'Delegated run failed.' }
}

function finishError(params: {
  startedAt: number
  now: () => number
  model?: string
  agent?: string
  runState?: RunState
  cost?: number
  sponsors: SponsorMessage[]
  sponsorStatus: SponsorStatus
  continuationId?: string
  session?: DelegatedSessionLease
  code: string
  message: string
}): { envelope: DelegatedRunEnvelope; exitCode: number } {
  return {
    envelope: {
      schemaVersion: 1,
      status: 'error',
      ...(params.model ? { model: params.model } : {}),
      ...(params.agent ? { agent: params.agent } : {}),
      durationMs: Math.max(0, params.now() - params.startedAt),
      ...(params.runState?.output ? { output: params.runState.output } : {}),
      ...(params.runState?.traceSessionId
        ? { traceSessionId: params.runState.traceSessionId }
        : {}),
      ...(params.cost !== undefined ? { cost: params.cost } : {}),
      ...(params.continuationId
        ? { continuationId: params.continuationId }
        : {}),
      ...(params.session ? { session: params.session } : {}),
      sponsors: params.sponsors,
      sponsorStatus: params.sponsorStatus,
      error: { code: params.code, message: params.message },
    },
    exitCode: DELEGATED_RUN_EXIT_CODES.runtimeError,
  }
}

function finishCancelled(params: {
  startedAt: number
  now: () => number
  model?: string
  agent?: string
  runState?: RunState
  cost?: number
  sponsors: SponsorMessage[]
  sponsorStatus: SponsorStatus
  continuationId?: string
  session?: DelegatedSessionLease
  message: string
}): { envelope: DelegatedRunEnvelope; exitCode: number } {
  return {
    envelope: {
      schemaVersion: 1,
      status: 'cancelled',
      ...(params.model ? { model: params.model } : {}),
      ...(params.agent ? { agent: params.agent } : {}),
      durationMs: Math.max(0, params.now() - params.startedAt),
      ...(params.runState?.output ? { output: params.runState.output } : {}),
      ...(params.runState?.traceSessionId
        ? { traceSessionId: params.runState.traceSessionId }
        : {}),
      ...(params.cost !== undefined ? { cost: params.cost } : {}),
      ...(params.continuationId
        ? { continuationId: params.continuationId }
        : {}),
      ...(params.session ? { session: params.session } : {}),
      sponsors: params.sponsors,
      sponsorStatus: params.sponsorStatus,
      error: { code: 'cancelled', message: params.message },
    },
    exitCode: DELEGATED_RUN_EXIT_CODES.cancelled,
  }
}
