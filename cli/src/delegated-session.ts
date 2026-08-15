import {
  callFreebuffSession,
  type FreebuffSessionMethod,
} from './utils/freebuff-session-api'

export type DelegatedSessionLease = {
  /** Opaque server-side Freebuff instance id. */
  id: string
  model: string
  expiresAt: string
}

export class DelegatedSessionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'DelegatedSessionError'
  }
}

function sessionMethodError(
  method: FreebuffSessionMethod,
): DelegatedSessionError {
  return new DelegatedSessionError(
    'session_unavailable',
    `Freebuff session ${method} could not find an active session for the supplied session id.`,
  )
}

function leaseFromActiveResponse(
  sessionId: string,
  response: Awaited<ReturnType<typeof callFreebuffSession>>,
  requestedModel?: string,
): DelegatedSessionLease {
  if (response.status !== 'active' || response.instanceId !== sessionId) {
    throw sessionMethodError('GET')
  }

  if (requestedModel && response.model !== requestedModel) {
    throw new DelegatedSessionError(
      'session_model_mismatch',
      `The retained Freebuff session uses ${response.model}, not ${requestedModel}.`,
    )
  }

  return {
    id: response.instanceId,
    model: response.model,
    expiresAt: response.expiresAt,
  }
}

export async function resumeDelegatedSession(params: {
  token: string
  sessionId: string
  model?: string
  signal: AbortSignal
}): Promise<DelegatedSessionLease> {
  const response = await callFreebuffSession('GET', params.token, {
    instanceId: params.sessionId,
    signal: params.signal,
  })
  return leaseFromActiveResponse(params.sessionId, response, params.model)
}

/**
 * End a retained session after verifying that the requested lease is still
 * active. The current server DELETE is account-scoped; the instance header is
 * included for target-aware server implementations, while the GET check
 * makes stale handles fail cleanly before the delete is attempted.
 */
export async function endDelegatedSession(params: {
  token: string
  sessionId: string
  signal?: AbortSignal
}): Promise<DelegatedSessionLease> {
  const response = await callFreebuffSession('GET', params.token, {
    instanceId: params.sessionId,
    signal: params.signal,
  })
  const lease = leaseFromActiveResponse(params.sessionId, response)

  await callFreebuffSession('DELETE', params.token, {
    instanceId: params.sessionId,
    signal: params.signal,
  })

  return lease
}
