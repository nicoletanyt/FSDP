import type { SupabaseClient } from '@supabase/supabase-js'
import type { GradeRow, InstructorIdentity } from './types'
import { InstructorDataError, toInstructorDataError } from './errors'

export const INSTRUCTOR_PHOTO_BUCKET = 'instructor-photos'
export const MAX_ADDRESS_LENGTH = 1000

export interface InstructorProfileDetails {
  instructorId: string
  userId: string
  address: string | null
  employmentType: 'part_time' | 'full_time' | null
  photoPath: string | null
  photoUrl: string | null
  grade: GradeRow | null
}

type ProfileClient = Pick<SupabaseClient, 'from' | 'rpc'> & Partial<Pick<SupabaseClient, 'storage'>>

export function createInstructorProfileApi(client: ProfileClient,
  getIdentity: (signal?: AbortSignal) => Promise<InstructorIdentity>) {
  async function identityFor(expectedUserId: string, signal?: AbortSignal) {
    const identity = await getIdentity(signal)
    if (identity.userId !== expectedUserId) {
      throw new InstructorDataError('forbidden', 'The signed-in account changed. Reload your profile.')
    }
    return identity
  }

  function bucket() {
    if (!client.storage) throw new InstructorDataError('request_failed', 'Photo storage is unavailable. Please try again.')
    return client.storage.from(INSTRUCTOR_PHOTO_BUCKET)
  }

  async function photoUrl(path: string | null) {
    if (!path) return null
    // Preserve previously configured HTTPS image URLs; new uploads store paths.
    if (path.startsWith('https://')) return path
    const { data, error } = await bucket().createSignedUrl(path, 3600)
    if (error || !data?.signedUrl) throw error ?? new Error('Missing photo URL')
    return data.signedUrl
  }

  async function savePhoto(expectedUserId: string, expectedPath: string | null, path: string | null) {
    const { data, error } = await client.rpc('save_instructor_profile_photo', {
      expected_user: expectedUserId, expected_photo_path: expectedPath, new_photo_path: path,
    })
    if (error) throw error
    if (!data || data.photo_path !== path) throw new Error('Photo save was not confirmed')
    // Best-effort removal of the superseded, immutable object. A cleanup failure
    // must not report a confirmed database save as failed.
    if (expectedPath?.startsWith(`${expectedUserId}/`) && expectedPath !== path) {
      try { await bucket().remove([expectedPath]) } catch { /* Safe to leave an orphan rather than lose the new photo. */ }
    }
  }

  return {
    async getProfile(expectedUserId: string, signal?: AbortSignal): Promise<InstructorProfileDetails> {
      try {
        const identity = await identityFor(expectedUserId, signal)
        const publicQuery = client.from('instructors').select('profile_picture_url, employment_type, grade:grades(id, label, colour, is_ranked, sort_order)')
          .eq('id', identity.instructorId)
        const privateQuery = client.from('instructor_private_details').select('address')
          .eq('instructor_id', identity.instructorId)
        if (signal) { publicQuery.abortSignal(signal); privateQuery.abortSignal(signal) }
        const [publicResult, privateResult] = await Promise.all([publicQuery.single(), privateQuery.maybeSingle()])
        if (publicResult.error) throw publicResult.error
        if (privateResult.error) throw privateResult.error
        const row = publicResult.data
        if (!row || (row.profile_picture_url !== null && typeof row.profile_picture_url !== 'string')
          || ![null, 'part_time', 'full_time'].includes(row.employment_type)
          || (privateResult.data?.address != null && typeof privateResult.data.address !== 'string')) {
          throw new InstructorDataError('invalid_data', 'Your instructor profile contains invalid data.')
        }
        const url = await photoUrl(row.profile_picture_url)
        signal?.throwIfAborted()
        return { instructorId: identity.instructorId, userId: identity.userId,
          address: privateResult.data?.address ?? null, employmentType: row.employment_type,
          photoPath: row.profile_picture_url, photoUrl: url, grade: (row.grade as unknown as GradeRow | null) ?? null }
      } catch (error) {
        throw toInstructorDataError(error, 'Unable to load your profile. Please try again.')
      }
    },

    async saveAddress(expectedUserId: string, value: string): Promise<string | null> {
      const address = value.trim() || null
      if (address && Array.from(address).length > MAX_ADDRESS_LENGTH) {
        throw new InstructorDataError('invalid_request', 'Use an address of 1,000 characters or fewer.')
      }
      try {
        await identityFor(expectedUserId)
        const { data, error } = await client.rpc('save_instructor_address', {
          expected_user: expectedUserId, new_address: address,
        })
        if (error) throw error
        if (!data || data.address !== address) throw new Error('Address save was not confirmed')
        return data.address
      } catch (error) {
        throw toInstructorDataError(error, 'Unable to save your address. Your draft is kept; please try again.')
      }
    },

    async uploadProfilePhoto(expectedUserId: string, expectedPath: string | null, image: Blob) {
      if (image.type !== 'image/jpeg' || !image.size || image.size > 5 * 1024 * 1024) {
        throw new InstructorDataError('invalid_request', 'Choose a valid profile photo of 5 MB or smaller.')
      }
      try {
        await identityFor(expectedUserId)
        const path = `${expectedUserId}/${crypto.randomUUID()}.jpg`
        const { error } = await bucket().upload(path, image, { contentType: 'image/jpeg', upsert: false })
        if (error) throw error
        const url = await photoUrl(path)
        await savePhoto(expectedUserId, expectedPath, path)
        // Do not delete the new object on transport failure: the RPC may have
        // committed even if its response was lost. Retry after reloading instead.
        return { photoPath: path, photoUrl: url }
      } catch (error) {
        throw toInstructorDataError(error, 'Unable to save your photo. Reload your profile, then try again.')
      }
    },

    async removeProfilePhoto(expectedUserId: string, expectedPath: string | null) {
      try {
        await identityFor(expectedUserId)
        await savePhoto(expectedUserId, expectedPath, null)
        return { photoPath: null, photoUrl: null }
      } catch (error) {
        throw toInstructorDataError(error, 'Unable to remove your photo. Reload your profile, then try again.')
      }
    },
  }
}
