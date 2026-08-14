import { expect, test } from 'bun:test'

import { requestAds, toSponsorMessage, type AdResponse } from '../sponsor-ads'

const ad: AdResponse = {
  adText: 'Build faster with Example.',
  title: 'Example',
  cta: 'Learn more',
  url: 'https://example.com',
  favicon: 'https://example.com/favicon.ico',
  clickUrl: 'https://tracking.example/click',
  impUrl: 'https://tracking.example/impression',
  provider: 'gravity',
}

test('requests a normalized ad batch and sanitizes it for delegated callers', async () => {
  let requestBody: Record<string, unknown> | undefined
  const result = await requestAds({
    token: 'token',
    messages: [
      { role: 'user', content: '<user_message>Fix it</user_message>' },
    ],
    surface: 'cli_chat',
    placementId: 'Single-Ad-Unit-1',
    fetchImpl: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Response.json({ ads: [ad], provider: 'gravity' })
    },
  })

  expect(result).toMatchObject({ status: 'filled', ads: [ad] })
  expect(requestBody).toMatchObject({
    provider: 'gravity',
    surface: 'cli_chat',
    placementId: 'Single-Ad-Unit-1',
  })

  expect(
    toSponsorMessage({
      ad,
      surface: 'cli_chat',
      placement: 'Single-Ad-Unit-1',
    }),
  ).toEqual({
    provider: 'gravity',
    title: 'Example',
    message: 'Build faster with Example.',
    cta: 'Learn more',
    url: 'https://example.com',
    surface: 'cli_chat',
    placement: 'Single-Ad-Unit-1',
  })
})

test('treats an ad-service error as unavailable rather than a run failure', async () => {
  const result = await requestAds({
    token: 'token',
    messages: [],
    fetchImpl: async () => new Response('unavailable', { status: 503 }),
  })

  expect(result).toEqual({ status: 'unavailable', ads: [] })
})
