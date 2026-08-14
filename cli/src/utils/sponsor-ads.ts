import { WEBSITE_URL } from '@codebuff/sdk'
import { getAdUserAgent } from '@codebuff/common/util/ad-user-agent'

import { IS_FREEBUFF } from './constants'
import { getCliEnv } from './env'

export type AdProvider = 'gravity' | 'carbon' | 'zeroclick'
export type AdSurface = 'waiting_room' | 'cli_chat'

/** Normalized response shared by the interactive and delegated clients. */
export type AdResponse = {
  adText: string
  title: string
  cta: string
  url: string
  favicon: string
  clickUrl: string
  impUrl: string
  provider?: AdProvider
  impressionIds?: string[]
  credits?: number
}

export type AdMessage = { role: 'user' | 'assistant'; content: string }
export type AdFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type AdRequestResult =
  | { status: 'filled'; ads: AdResponse[] }
  | { status: 'no_fill'; ads: [] }
  | { status: 'unavailable'; ads: [] }

export type SponsorMessage = {
  provider: AdProvider
  title: string
  message: string
  cta: string
  url: string
  surface: AdSurface
  placement: string
}

type DeviceInfo = {
  os: 'macos' | 'windows' | 'linux'
  timezone: string
  locale: string
}

function getDeviceInfo(): DeviceInfo {
  const platformToOs: Record<string, DeviceInfo['os']> = {
    darwin: 'macos',
    win32: 'windows',
    linux: 'linux',
  }

  return {
    os: platformToOs[process.platform] ?? 'linux',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
  }
}

export function getCliAdRequestUserAgent(): string {
  const product = IS_FREEBUFF ? 'Freebuff-CLI' : 'Codebuff-CLI'
  const version = getCliEnv().CODEBUFF_CLI_VERSION ?? 'dev'
  return `${product}/${version}`
}

/**
 * Request a normalized ad batch. This deliberately does not record an
 * impression: callers must only record one after an ad is actually rendered.
 */
export async function requestAds(params: {
  token: string
  messages: AdMessage[]
  provider?: AdProvider
  surface?: AdSurface
  placementId?: string
  sessionId?: string
  signal?: AbortSignal
  fetchImpl?: AdFetch
}): Promise<AdRequestResult> {
  const provider = params.provider ?? 'gravity'
  const fetchImpl = params.fetchImpl ?? fetch

  try {
    const response = await fetchImpl(`${WEBSITE_URL}/api/v1/ads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.token}`,
        'User-Agent': getCliAdRequestUserAgent(),
      },
      signal: params.signal,
      body: JSON.stringify({
        provider,
        messages: params.messages,
        ...(params.sessionId ? { sessionId: params.sessionId } : {}),
        device: getDeviceInfo(),
        ...(params.surface ? { surface: params.surface } : {}),
        ...(params.placementId ? { placementId: params.placementId } : {}),
        // Native runtime UAs look bot-like to ad networks. Send the shared
        // browser-like UA so every provider sees a usable targeting signal.
        userAgent: getAdUserAgent(),
      }),
    })

    if (!response.ok) return { status: 'unavailable', ads: [] }

    const data = (await response.json()) as {
      ads?: unknown
      provider?: unknown
    }
    if (!Array.isArray(data.ads) || data.ads.length === 0) {
      return { status: 'no_fill', ads: [] }
    }

    const normalized = data.ads
      .filter((ad): ad is AdResponse => isAdResponse(ad))
      .map((ad) => ({
        ...ad,
        provider: isAdProvider(data.provider) ? data.provider : provider,
      }))

    return normalized.length > 0
      ? { status: 'filled', ads: normalized }
      : { status: 'no_fill', ads: [] }
  } catch {
    return { status: 'unavailable', ads: [] }
  }
}

function isAdProvider(value: unknown): value is AdProvider {
  return value === 'gravity' || value === 'carbon' || value === 'zeroclick'
}

function isAdResponse(value: unknown): value is AdResponse {
  if (!value || typeof value !== 'object') return false
  const ad = value as Partial<AdResponse>
  return (
    typeof ad.adText === 'string' &&
    typeof ad.title === 'string' &&
    typeof ad.cta === 'string' &&
    typeof ad.url === 'string' &&
    typeof ad.favicon === 'string' &&
    typeof ad.clickUrl === 'string' &&
    typeof ad.impUrl === 'string'
  )
}

/** Convert a provider response into the caller-visible, non-tracking shape. */
export function toSponsorMessage(params: {
  ad: AdResponse
  surface: AdSurface
  placement: string
}): SponsorMessage {
  return {
    provider: params.ad.provider ?? 'gravity',
    title: params.ad.title,
    message: params.ad.adText,
    cta: params.ad.cta,
    url: params.ad.url,
    surface: params.surface,
    placement: params.placement,
  }
}
