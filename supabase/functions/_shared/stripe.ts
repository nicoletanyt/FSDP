import Stripe from 'npm:stripe@23.0.1'

export function requireEnv(name: string) {
  const value = Deno.env.get(name)?.trim()

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`)
  }

  return value
}

export function getStripe() {
  const secretKey = requireEnv('STRIPE_SECRET_KEY')

  if (!secretKey.startsWith('sk_test_')) {
    throw new Error('Only Stripe test-mode secret keys are supported.')
  }

  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export const cryptoProvider = Stripe.createSubtleCryptoProvider()
