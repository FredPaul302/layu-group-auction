import Link from "next/link";

type PlaceholderLink = {
  href: string;
  label: string;
};

type PlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  links?: PlaceholderLink[];
};

export function PlaceholderPage({
  eyebrow,
  title,
  description,
  bullets,
  links = []
}: PlaceholderPageProps) {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">{eyebrow}</p>
        <div className="space-y-3">
          <h2 className="text-3xl font-semibold text-zinc-950">{title}</h2>
          <p className="max-w-3xl text-base text-zinc-600">{description}</p>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Scaffold notes</h3>
          <ul className="mt-4 space-y-3 text-sm text-zinc-700">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-600" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4 rounded-md border border-zinc-200 p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Next stops</h3>
          {links.length === 0 ? (
            <p className="text-sm text-zinc-600">
              Additional links will appear here as each feature area is implemented.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {links.map((link) => (
                <li key={link.href}>
                  <Link className="text-emerald-700 hover:text-emerald-800" href={link.href}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
