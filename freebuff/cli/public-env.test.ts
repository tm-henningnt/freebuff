import { describe, expect, test } from 'bun:test'

import { clientEnvSchema } from '@codebuff/common/env-schema'

import { FREEBUFF_PUBLIC_ENV, getFreebuffBuildEnv } from './public-env'

describe('Freebuff public build environment', () => {
  test('contains a schema-valid production configuration', () => {
    const result = clientEnvSchema.safeParse(FREEBUFF_PUBLIC_ENV)

    expect(result.success).toBe(true)
  })

  test('allows explicit environment values to override the published defaults', () => {
    const env = getFreebuffBuildEnv({
      NEXT_PUBLIC_CB_ENVIRONMENT: 'test',
      NEXT_PUBLIC_CODEBUFF_APP_URL: 'http://127.0.0.1:3000',
      FREEBUFF_MODE: 'false',
    })

    expect(env.NEXT_PUBLIC_CB_ENVIRONMENT).toBe('test')
    expect(env.NEXT_PUBLIC_CODEBUFF_APP_URL).toBe('http://127.0.0.1:3000')
    expect(env.FREEBUFF_MODE).toBe('true')
    expect(env.NEXT_PUBLIC_SUPPORT_EMAIL).toBe(
      FREEBUFF_PUBLIC_ENV.NEXT_PUBLIC_SUPPORT_EMAIL,
    )
  })
})
