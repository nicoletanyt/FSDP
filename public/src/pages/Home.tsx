const palette = [
  { name: 'Shinju Blue', hex: '#2c3f67', swatch: 'bg-brand-blue' },
  { name: 'Aikido Red', hex: '#e62128', swatch: 'bg-brand-red' },
  { name: 'Dojo Grey', hex: '#352b29', swatch: 'bg-brand-grey' },
]

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="grid items-center gap-10 md:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-red-ink">
            Aikido Shinju-Kai
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Welcome to the <span className="text-primary">FSDP</span> project portal.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
            A full-stack foundation for the Aikido Shinju-Kai community, built with
            React, Supabase, and Stripe Checkout.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <span className="rounded-full border border-border bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
              Classes
            </span>
            <span className="rounded-full border border-border bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
              Members
            </span>
            <span className="rounded-full border border-border bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
              Payments
            </span>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-xs">
          <div
            className="absolute inset-4 -z-10 rounded-full bg-secondary blur-2xl"
            aria-hidden="true"
          />
          <img
            src="/logo.png"
            alt="Aikido Shinju-Kai emblem"
            width={605}
            height={605}
            className="w-full rounded-full shadow-sm ring-1 ring-border"
          />
        </div>
      </section>

      <section aria-labelledby="palette-heading">
        <h2 id="palette-heading" className="text-lg font-semibold tracking-tight">
          Brand palette
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The colours behind the emblem, applied through the theme tokens.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {palette.map((colour) => (
            <div key={colour.hex} className="rounded-xl border border-border bg-card p-4">
              <div className={`h-16 rounded-lg ${colour.swatch}`} aria-hidden="true" />
              <p className="mt-3 font-medium">{colour.name}</p>
              <p className="text-sm text-muted-foreground">{colour.hex}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
