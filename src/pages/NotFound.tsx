import { Link, useMatch } from 'react-router'

export default function NotFound() {
  return (
    <section className={useMatch('/instructor/*') ? 'mx-auto mb-24 w-full p-4 lg:mb-0 lg:w-[70%] lg:px-0 lg:pt-6 lg:pb-28' : undefined}>
      <h1 className="text-3xl font-bold tracking-tight">
        <span className="text-brand-red-ink">404</span> — Page not found
      </h1>
      <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
        The page you requested does not exist.
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
