import { Link } from 'react-router'

export default function CheckoutSuccess() {
  return (
    <section>
      <h1 className="text-3xl font-bold">Checkout complete</h1>
      <p className="mt-4 text-slate-600">
        Thank you. Payment confirmation is handled securely by Stripe webhooks.
      </p>
      <Link to="/" className="mt-6 inline-block text-blue-700 underline">
        Back to home
      </Link>
    </section>
  )
}
