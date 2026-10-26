import { createClient } from '@supabase/supabase-js'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function requiredEnv(name) {
  const value = process.env[name]
  if (!value?.trim()) throw new Error(`Set ${name} in the root .env.`)
  return value
}

export async function seedAdmin() {
  const url = new URL(requiredEnv('VITE_SUPABASE_URL').trim()).origin
  const key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY').trim()
  const email = requiredEnv('ADMIN_SEED_EMAIL').trim().toLowerCase()
  const password = requiredEnv('ADMIN_SEED_PASSWORD')
  if (password.length < 8 || password.length > 128 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('ADMIN_SEED_PASSWORD must contain 8–128 characters and at least one letter and one number.')
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_SEED_EMAIL must be a valid email address.')
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error: schemaError } = await admin.from('users').select('id').limit(1)
  if (schemaError) throw new Error('Apply the auth roles migration before seeding.')

  // Idempotent: never overwrite an existing account or reset its password.
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error('Unable to check existing Auth accounts.')
    const existing = data.users.find((user) => user.email?.toLowerCase() === email)
    if (existing) {
      const { data: profile, error: profileError } = await admin
        .from('users').select('role').eq('id', existing.id).single()
      if (profileError || profile?.role !== 'administrator') {
        throw new Error('This email already belongs to a non-administrator. No changes made.')
      }
      console.log(`Development administrator already exists: ${email}`)
      return
    }
    if (data.users.length < 200) break
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: 'Development', last_name: 'Administrator' },
    app_metadata: { role: 'administrator' },
  })
  if (error) throw new Error('Administrator creation failed. No credentials were logged.')
  const { data: profile, error: profileError } = await admin
    .from('users').select('role').eq('id', data.user.id).single()
  if (profileError || profile?.role !== 'administrator') {
    throw new Error('The Auth account was created, but its administrator profile is unavailable. Check the migrations.')
  }
  console.log(`Created development administrator: ${email}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  seedAdmin().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
