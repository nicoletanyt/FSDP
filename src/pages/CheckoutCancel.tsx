import { Link } from 'react-router'

export default function CheckoutCancel() {
  return (
    <section>
      <h1 className="text-3xl font-bold">Checkout canceled</h1>
      <p className="mt-4 text-slate-600">You left checkout before completing payment.</p>
      <Link to="/" className="mt-6 inline-block text-blue-700 underline">
        Back to home
      </Link>
    </section>
  )
}
