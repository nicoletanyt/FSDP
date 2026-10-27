import { Link } from 'react-router'

export default function CheckoutSuccess() {
  return (
    <section>
      <h1 className="text-3xl font-bold tracking-tight">Checkout complete</h1>
      <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
        Thank you. Payment confirmation is handled securely by Stripe webhooks.
      </p>
      <Link
        to="/"
        className="mt-6 inline-block font-medium text-primary underline underline-offset-4 hover:text-primary/80"
      >
        Back to home
      </Link>
    </section>
  )
}
