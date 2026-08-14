/**
 * Public client configuration shipped in the published Freebuff binary.
 *
 * These values are intentionally public: they are used by the web/client
 * application and are not authentication secrets. Keep deployment-specific
 * overrides possible by applying the current process environment afterward.
 */
export const FREEBUFF_PUBLIC_ENV = {
  NEXT_PUBLIC_CB_ENVIRONMENT: 'prod',
  NEXT_PUBLIC_CODEBUFF_APP_URL: 'https://www.codebuff.com',
  NEXT_PUBLIC_FREEBUFF_APP_URL: 'https://freebuff.com',
  NEXT_PUBLIC_SUPPORT_EMAIL: 'support@codebuff.com',
  NEXT_PUBLIC_POSTHOG_API_KEY:
    'phc_xxx',
  NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://us.i.posthog.com',
  NEXT_PUBLIC_GRAVITY_PIXEL_ID: 'xxx',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
    'pk_live_xxx',
  NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL:
    'https://billing.stripe.com/p/login/xxx',
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID: 'your google verification id',
  NEXT_PUBLIC_WEB_PORT: '3000',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: '0xXXX',
  NEXT_PUBLIC_HUMANBEHAVIOR_API_KEY: 'hb_xxx',
} as const

export function getFreebuffBuildEnv(
  currentEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...FREEBUFF_PUBLIC_ENV,
    ...currentEnv,
    FREEBUFF_MODE: 'true',
  }
}
