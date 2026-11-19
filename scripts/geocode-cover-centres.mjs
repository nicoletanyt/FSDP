// One-time cache fill for ordinary-class cover. Query Nominatim at most once
// every 1.1 seconds and use only matches with the requested Singapore postal
// code; ambiguous addresses remain unverified instead of guessing a position.
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Supabase URL and service role key are required')
const apply = process.argv.includes('--apply')
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: centres, error: centresError } = await db.from('centres')
  .select('id,name,address,status').eq('status', 'active')
if (centresError) throw centresError
const { data: existing, error: cacheError } = await db.from('centre_cover_geocodes')
  .select('centre_id,address_snapshot')
if (cacheError) throw cacheError
const cached = new Map(existing.map(entry => [entry.centre_id, entry.address_snapshot]))
const missing = centres.filter(centre => cached.get(centre.id) !== centre.address)
let found = 0
let skipped = 0

for (const [index, centre] of missing.entries()) {
  if (index) await new Promise(resolve => setTimeout(resolve, 2100))
  const postal = centre.address.match(/\b\d{6}\b/)?.[0]
  const query = postal ? `${centre.address}, Singapore` : `${centre.name}, ${centre.address}, Singapore`
  const lookup = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: query, format: 'jsonv2', limit: '5', addressdetails: '1' })}`
  const headers = { 'User-Agent': 'fsdp-cover-geocode/1.0 (one-time admin lookup)', Accept: 'application/json' }
  let response = await fetch(lookup, { headers })
  if (response.status === 503 || response.status === 429) {
    await new Promise(resolve => setTimeout(resolve, 10000))
    response = await fetch(lookup, { headers })
  }
  if (!response.ok) throw new Error(`Geocoder returned ${response.status}; stopped before making further requests`)
  const results = await response.json()
  const match = results.find(result => postal
    ? result.address?.postcode === postal
    : result.display_name?.includes('Singapore'))
  let latitude = Number(match?.lat)
  let longitude = Number(match?.lon)
  let source = 'OpenStreetMap contributors / Nominatim'
  if ((!match || !Number.isFinite(latitude) || !Number.isFinite(longitude)) && postal) {
    await new Promise(resolve => setTimeout(resolve, 1100))
    const address = centre.address.replace(/#[A-Za-z0-9-]+/g, '').replace(/\bSingapore\s*\d{6}\b/i, 'Singapore')
    const photon = await fetch(`https://photon.komoot.io/api/?${new URLSearchParams({ q: address, limit: '5' })}`, {
      headers: { 'User-Agent': 'fsdp-cover-geocode/1.0 (one-time admin lookup)' },
    })
    if (!photon.ok) throw new Error(`Fallback geocoder returned ${photon.status}`)
    const features = (await photon.json()).features
    const exact = features.find(item => item.properties?.postcode === postal &&
      item.properties?.countrycode === 'SG' && item.properties?.housenumber)
    if (exact) {
      longitude = Number(exact.geometry.coordinates[0])
      latitude = Number(exact.geometry.coordinates[1])
      source = 'OpenStreetMap contributors / Photon'
    }
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    skipped++
    console.log(`No reliable match: ${centre.name}`)
    continue
  }
  found++
  if (apply) {
    const { error } = await db.from('centre_cover_geocodes').upsert({
      centre_id: centre.id, address_snapshot: centre.address,
      latitude, longitude, geocode_source: source,
    }, { onConflict: 'centre_id' })
    if (error) throw error
  }
}
console.log(`${apply ? 'Cached' : 'Would cache'} ${found} centres; ${skipped} need manual location verification.`)
