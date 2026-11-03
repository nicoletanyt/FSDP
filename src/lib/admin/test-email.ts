import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export const testEmailRecipient = 'mq07110@gmail.com'

export type TestEmailTemplate = 'grading_invitation' | 'attendance_concern' | 'general_reminder'

export async function sendTestEmail(template: TestEmailTemplate, message: string) {
  const { data, error } = await supabase.functions.invoke<{ id: string }>('send-test-notification', {
    body: { template, message },
  })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const response: unknown = await error.context.json().catch(() => null)
      if (response && typeof response === 'object' && 'error' in response && typeof response.error === 'string') {
        throw new Error(response.error)
      }
    }
    throw new Error('Unable to send the test email.')
  }
  if (!data?.id) throw new Error('The test email could not be confirmed.')
  console.log("this works");
  return data.id
}
