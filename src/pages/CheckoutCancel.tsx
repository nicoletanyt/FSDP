import { Link } from 'react-router'

export default function CheckoutCancel() {
  return (
    <section>
      <h1 className="text-3xl font-bold tracking-tight">Checkout canceled</h1>
      <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
        You left checkout before completing payment.
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
