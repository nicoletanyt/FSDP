import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env before using Supabase.',
  )
}

// Auth, REST, and Functions each append their own path to the project origin.
export const supabase = createClient(new URL(supabaseUrl).origin, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
