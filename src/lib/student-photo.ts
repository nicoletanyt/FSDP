import { supabase } from './supabase'

// Matches the private student-photos bucket (20261115062916_student_profile_photos.sql).
const BUCKET = 'student-photos'
const MAX_BYTES = 5 * 1024 * 1024
const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** A message to show if the chosen file can't be used, otherwise null. */
export function studentPhotoError(file: File) {
  if (!EXTENSIONS[file.type]) return 'Please choose a JPG, PNG or WebP photo.'
  if (file.size > MAX_BYTES) return 'Please choose a photo smaller than 5 MB.'
  return null
}

/** Uploads into the student's own folder under a new random name and returns its path. */
export async function uploadStudentPhoto(file: File, userId: string) {
  const path = `${userId}/${crypto.randomUUID()}.${EXTENSIONS[file.type]}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type, upsert: false, cacheControl: '3600',
  })
  if (error) throw new Error('We could not upload your photo. Please try again.')
  return path
}

/** Makes an uploaded photo the student's profile photo (needs their student record). */
export async function saveStudentPhoto(userId: string, path: string) {
  const { data: current, error: readError } = await supabase
    .from('students').select('photo_path').eq('user_id', userId).maybeSingle<{ photo_path: string | null }>()
  if (readError || !current) throw new Error('Your student record is not ready yet.')
  const { error } = await supabase.rpc('save_my_student_photo', {
    expected_photo_path: current.photo_path, new_photo_path: path,
  })
  if (error) throw new Error(error.message)
}

/** A short-lived link for showing a stored photo, or null if it can't be shown. */
export async function studentPhotoUrl(path: string | null) {
  if (!path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  return error ? null : data.signedUrl
}
