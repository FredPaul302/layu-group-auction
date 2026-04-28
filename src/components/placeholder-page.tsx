import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";

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
      <PageHeader description={description} eyebrow={eyebrow} title={title} />

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="surface-card fade-in p-6">
          <h3 className="text-lg font-semibold text-zinc-950">Scaffold notes</h3>
          <ul className="mt-4 space-y-3 text-sm text-zinc-700">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-700" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="surface-card fade-in space-y-4 p-6">
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
