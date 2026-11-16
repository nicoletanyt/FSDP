import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env before using Supabase.',
  )
}

const connection = {
  origin: new URL(supabaseUrl).origin,
  publishableKey: supabasePublishableKey,
}

// Auth, REST, and Functions each append their own path to the project origin.
export const supabase = createClient(connection.origin, connection.publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// Verify student-portal credentials without publishing a session to AuthProvider.
// Only a verified student session is transferred to the persistent client.
export function createTransientAuthClient() {
  return createClient(connection.origin, connection.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
