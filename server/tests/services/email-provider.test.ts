import { describe, it, expect, afterEach, vi } from 'vitest'

/**
 * Provider selection for the email service. Mirrors the storage service's
 * precedence chain: a configured cloud provider wins, with a local fallback for
 * development so the suite and local dev run without credentials.
 */

const saved = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  EMAIL_FROM: process.env.EMAIL_FROM,
}

/**
 * Clears by assigning '' rather than `delete`.
 *
 * These tests re-import the service through vi.resetModules(), which re-runs
 * src/config/env.ts and therefore dotenv.config(). dotenv skips keys already
 * present in process.env but repopulates deleted ones from server/.env — so
 * `delete process.env.RESEND_API_KEY` silently came back as the real key once one
 * was configured, and the test asserted against the developer's own .env instead
 * of the case it names. An empty string keeps the key present and falsy.
 */
function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    process.env[k] = v ?? ''
  }
}

afterEach(() => {
  // Restore exactly, including keys that were genuinely absent before.
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  vi.resetModules()
})

async function provider(vars: Record<string, string | undefined>) {
  vi.resetModules()
  setEnv({ RESEND_API_KEY: undefined, SMTP_HOST: undefined, SMTP_USER: undefined, SMTP_PASS: undefined, ...vars })
  const { getActiveEmailProvider } = await import('../../src/services/email.service')
  return getActiveEmailProvider()
}

describe('email provider selection', () => {
  it('prefers Resend when RESEND_API_KEY is set', async () => {
    expect(await provider({ RESEND_API_KEY: 're_test_key' })).toBe('resend')
  })

  it('prefers Resend even when SMTP is also fully configured', async () => {
    expect(
      await provider({
        RESEND_API_KEY: 're_test_key',
        SMTP_HOST: 'smtp.example.com',
        SMTP_USER: 'user@example.com',
        SMTP_PASS: 'realpassword',
      })
    ).toBe('resend')
  })

  it('falls back to SMTP when only SMTP is configured', async () => {
    expect(
      await provider({
        SMTP_HOST: 'smtp.example.com',
        SMTP_USER: 'user@example.com',
        SMTP_PASS: 'realpassword',
      })
    ).toBe('smtp')
  })

  it('falls back to mock when nothing is configured', async () => {
    expect(await provider({})).toBe('mock')
  })

  it('does not treat placeholder SMTP credentials as configured', async () => {
    expect(
      await provider({
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_USER: 'yourstore@gmail.com',
        SMTP_PASS: 'your-app-specific-password',
      })
    ).toBe('mock')
  })
})
