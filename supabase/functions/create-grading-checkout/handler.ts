import { adminClient, authenticate, gradingHeaders } from '../_shared/grading.ts'
import { getStripe } from '../_shared/stripe.ts'
import { confirmGradingPreview } from '../_shared/grading-drafts.ts'

const UUID = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i

export async function handleRequest(request: Request): Promise<Response> {
  let headers: Record<string, string> = {}
  try {
    const config = gradingHeaders(request)
    headers = config.headers
    if (!config.allowed) return Response.json({ error: 'Origin not allowed.' }, { status: 403, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers })
    const user = await authenticate(request, 'student')
    if (!user) return Response.json({ error: 'Student sign-in required.' }, { status: 403, headers })
    const body = await request.json().catch(() => null)
    const db = adminClient()

    // Test-key-only previews save drafts, never formal applications or payments.
    if (body?.action === 'test-checkout') {
      const stripe = getStripe() // Rejects live keys before any Stripe request.
      if (!UUID.test(body.request_id ?? '') || !Number.isInteger(body.expected_amount)) {
        return Response.json({ error: 'Invalid test checkout request.' }, { status: 400, headers })
      }
      const [student, grades, tracks, requirements] = await Promise.all([
        db.from('students').select('id,current_grade_id,date_of_birth').eq('user_id', user).maybeSingle(),
        db.from('grades').select('id,label,sort_order').order('sort_order'),
        db.from('grade_tracks').select('grade_id,track'),
        db.from('grade_requirements').select('grade_id,track,fee_cents'),
      ])
      if ([student, grades, tracks, requirements].some((result) => result.error)) throw new Error('Unable to load test checkout records.')
      const current = grades.data?.find((grade) => grade.id === student.data?.current_grade_id)
      const birth = student.data?.date_of_birth
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
      if (!current || !birth || birth > today) {
        return Response.json({ error: 'A valid linked student record is required.' }, { status: 403, headers })
      }
      const track = Number(today.slice(0, 4)) - Number(birth.slice(0, 4)) >= 13 ? 'adult' : 'children'
      const target = grades.data?.find((grade) => grade.sort_order > current.sort_order &&
        tracks.data?.some((entry) => entry.grade_id === grade.id && entry.track === track))
      const fee = requirements.data?.find((entry) => entry.grade_id === target?.id && entry.track === track)?.fee_cents
      if (!target || !Number.isInteger(fee) || fee <= 0) {
        return Response.json({ error: 'Your next grading fee is not configured.' }, { status: 403, headers })
      }
      if (body.target_grade_id !== target.id || body.expected_amount !== fee) {
        return Response.json({ error: 'Your grade or fee changed. Refresh and review before paying.' }, { status: 409, headers })
      }
      // Save before redirecting: a cancelled checkout still has a durable draft.
      const { error: draftError } = await db.from('grading_application_drafts').upsert({
        user_id: user, student_id: student.data!.id, request_id: body.request_id,
        current_grade_id: current.id, target_grade_id: target.id, track, base_fee_cents: fee,
      }, { onConflict: 'user_id,request_id', ignoreDuplicates: true })
      if (draftError) throw draftError
      const { data: draft, error: readError } = await db.from('grading_application_drafts')
        .select('id,target_grade_id,base_fee_cents,status,stripe_session_id')
        .eq('user_id', user).eq('request_id', body.request_id).single()
      if (readError) throw readError
      if (draft.target_grade_id !== target.id || draft.base_fee_cents !== fee || draft.status === 'preview_paid') {
        return Response.json({ error: 'This saved draft has changed or is already paid. Refresh before continuing.' }, { status: 409, headers })
      }
      const origin = request.headers.get('origin') ?? config.appOrigin
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', allowed_payment_method_types: ['card'], client_reference_id: user,
        line_items: [{ quantity: 1, price_data: { currency: 'sgd', unit_amount: fee,
          product_data: { name: `Test only — Grading examination — ${target.label}` } } }],
        metadata: { grading_preview: 'true', grading_preview_user_id: user, target_grade_id: target.id, grading_draft_id: draft.id },
        custom_text: { submit: { message: 'Test payment only. No formal grading application will be submitted.' } },
        success_url: `${origin}/grading?checkout=test-success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/grading?checkout=test-cancel`,
      }, { idempotencyKey: `grading-preview-${user}-${body.request_id}-${target.id}-${fee}` })
      if (session.livemode || !session.url) throw new Error('Invalid test Checkout session.')
      const { data: saved, error: saveError } = await db.from('grading_application_drafts')
        .update({ stripe_session_id: session.id, status: 'checkout_open', updated_at: new Date().toISOString() })
        .eq('id', draft.id).eq('user_id', user).neq('status', 'preview_paid').select('id').maybeSingle()
      if (saveError) throw saveError
      if (!saved) throw new Error('Unable to save checkout to your application draft.')
      return Response.json({ url: session.url, draft_id: saved.id }, { headers })
    }

    if (body?.action === 'test-status') {
      if (typeof body.session_id !== 'string' || !/^cs_test_[A-Za-z0-9_]+$/.test(body.session_id)) {
        return Response.json({ error: 'Invalid test checkout session.' }, { status: 400, headers })
      }
      const session = await getStripe().checkout.sessions.retrieve(body.session_id)
      if (session.livemode || session.client_reference_id !== user ||
        session.metadata?.grading_preview !== 'true' || session.metadata?.grading_preview_user_id !== user) {
        return Response.json({ error: 'Test checkout not found for your account.' }, { status: 404, headers })
      }
      const paid = session.payment_status === 'paid'
      const draftSaved = paid ? await confirmGradingPreview(session) : Boolean(session.metadata?.grading_draft_id)
      return Response.json({ paid, draftSaved }, { headers })
    }

    if (body?.action === 'status') {
      if (typeof body.session_id !== 'string' || !/^cs_test_[A-Za-z0-9_]+$/.test(body.session_id)) {
        return Response.json({ error: 'Invalid checkout session.' }, { status: 400, headers })
      }
      const { data, error } = await db.from('grading_checkout_attempts')
        .select('status, students!inner(user_id)').eq('stripe_session_id', body.session_id)
        .eq('students.user_id', user).maybeSingle()
      if (error) throw error
      if (!data) return Response.json({ error: 'Checkout not found for your account.' }, { status: 404, headers })
      return Response.json({ paid: data.status === 'paid' }, { headers })
    }

    if (!body || !['quote', 'checkout'].includes(body.action) ||
      typeof body.event_id !== 'string' || !UUID.test(body.event_id) || typeof body.target_grade_id !== 'string') {
      return Response.json({ error: 'Select a grading event and target grade.' }, { status: 400, headers })
    }

    async function reserve() {
      const { data, error } = await db.rpc('reserve_grading_checkout', { target_event: body.event_id, auth_user: user })
      if (error || !data?.length) return null
      return data[0]
    }
    let attempt = await reserve()
    if (!attempt) return Response.json({ error: 'This grading is closed or you do not meet its eligibility requirements.' }, { status: 403, headers })
    const stripe = getStripe()
    let existing
    if (attempt.checkout_session) {
      existing = await stripe.checkout.sessions.retrieve(attempt.checkout_session)
      if (existing.payment_status === 'paid') {
        return Response.json({ error: 'Payment is being confirmed. Return to your grading applications; do not pay again.' }, { status: 409, headers })
      }
      if (existing.status === 'expired') {
        const { error } = await db.rpc('retry_grading_checkout', { attempt: attempt.attempt_id, expired_session: existing.id })
        if (error) return Response.json({ error: 'Checkout changed. Please review the fee again.' }, { status: 409, headers })
        attempt = await reserve()
        existing = undefined
      } else if (existing.status !== 'open') {
        return Response.json({ error: 'Checkout is processing. Please try again shortly.' }, { status: 409, headers })
      }
    }
    if (!attempt || attempt.target_grade !== body.target_grade_id) {
      return Response.json({ error: 'Your eligible target grade has changed. Return to the application and select it again.' }, { status: 409, headers })
    }
    if (!Number.isInteger(attempt.amount) || attempt.amount <= 0 ||
      !Number.isInteger(attempt.base_amount) || !Number.isInteger(attempt.late_amount) ||
      attempt.base_amount + attempt.late_amount !== attempt.amount) throw new Error('Invalid grading quote.')

    const { data: grade, error: gradeError } = await db.from('grades').select('label').eq('id', attempt.target_grade).maybeSingle()
    if (gradeError) throw gradeError
    const quote = {
      eventId: body.event_id, targetGradeId: attempt.target_grade,
      gradeLabel: grade?.label ?? attempt.target_grade,
      baseFeeCents: attempt.base_amount, lateFeeCents: attempt.late_amount,
      totalCents: attempt.amount, applicationDeadline: attempt.deadline,
    }
    if (body.action === 'quote') return Response.json({ quote }, { headers })
    // The client total is only a review guard, never the source of the charge.
    if (body.expected_amount !== attempt.amount) {
      return Response.json({ error: 'The fee changed. Review the updated total before paying.', quote }, { status: 409, headers })
    }
    if (existing) {
      if (existing.amount_total !== attempt.amount || existing.currency !== 'sgd' || !existing.url) throw new Error('Existing checkout mismatch.')
      return Response.json({ url: existing.url }, { headers })
    }

    const line = (name: string, amount: number) => ({ quantity: 1,
      price_data: { currency: 'sgd', unit_amount: amount, product_data: { name } } })
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [line(`Grading examination — ${quote.gradeLabel}`, attempt.base_amount),
        ...(attempt.late_amount > 0 ? [line('Late submission charge', attempt.late_amount)] : [])],
      client_reference_id: attempt.attempt_id,
      metadata: { grading_attempt_id: attempt.attempt_id },
      success_url: `${config.appOrigin}/grading/applications?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.appOrigin}/grading/applications?checkout=cancel`,
    }, { idempotencyKey: `grading-${attempt.attempt_id}-${attempt.revision}-${attempt.amount}` })
    if (!session.url) throw new Error('Missing Stripe Checkout URL.')
    const { data: saved, error: saveError } = await db.from('grading_checkout_attempts')
      .update({ stripe_session_id: session.id }).eq('id', attempt.attempt_id)
      .eq('checkout_revision', attempt.revision).eq('amount_cents', attempt.amount)
      .is('stripe_session_id', null).select('id').maybeSingle()
    if (saveError) throw saveError
    if (!saved) {
      const { data: current } = await db.from('grading_checkout_attempts').select('stripe_session_id').eq('id', attempt.attempt_id).single()
      if (current?.stripe_session_id !== session.id) throw new Error('Concurrent checkout conflict.')
    }
    return Response.json({ url: session.url }, { headers })
  } catch (error) {
    console.error('Grading checkout failed:', error)
    return Response.json({ error: 'Unable to start grading checkout. Please try again.' }, { status: 500, headers })
  }
}
