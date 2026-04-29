import { PageHeader } from "@/components/ui/page-header";

const sections = [
  {
    title: "Information collected",
    items: [
      "Account data such as name, email, password authentication data, terms acceptance, and session activity.",
      "Bidder profile and contact information used for auction eligibility, orders, pickup, shipping, and support.",
      "Listing, bid, order, payment, runner-up offer, and fulfillment records created through site activity.",
      "Payment proof uploads and deposit proof uploads submitted for manual admin review.",
      "Persona verification status and related metadata where Persona verification is used.",
      "Logs, security signals, origin checks, rate-limit data, and other operational records used to protect the site."
    ]
  },
  {
    title: "How information is used",
    items: [
      "To operate accounts, auctions, fixed-price claims, orders, payment review, verification, and fulfillment.",
      "To help prevent fraud, enforce bidding eligibility, investigate abuse, and secure the private beta.",
      "To provide support, admin operations, notifications, audit records, and operator reporting."
    ]
  },
  {
    title: "Sharing",
    items: [
      "Information may be shared with service providers such as email, file storage, Persona, hosting, database, logging, and security providers.",
      "Payment services chosen outside the site may receive information directly from users when users complete external payments.",
      "Information may be shared when needed for legal, safety, fraud prevention, business protection, or dispute handling reasons."
    ]
  },
  {
    title: "Retention",
    items: [
      "Records may be retained as needed for site operations, orders, disputes, fraud prevention, security, accounting, and legal or business recordkeeping.",
      "Some records may remain after account closure when operational, safety, accounting, or legal needs require retention."
    ]
  },
  {
    title: "Security",
    items: [
      "Private payment and deposit proof files are access-controlled through authenticated routes rather than public upload URLs.",
      "The operator uses reasonable safeguards for the private beta, but no system can guarantee absolute security."
    ]
  },
  {
    title: "User choices and contact",
    items: [
      "Users may contact the operator for account support, correction requests, deletion requests, or questions about stored information.",
      "Correction or deletion requests may be limited by operational, dispute, fraud prevention, security, accounting, or legal needs."
    ]
  },
  {
    title: "Children and minors",
    items: [
      "The site is not intended for children or for users who are not allowed to enter purchase or auction commitments."
    ]
  },
  {
    title: "Changes",
    items: [
      "This privacy policy may be updated as the private beta changes. The current posted version applies to ongoing use of the site."
    ]
  }
] as const;

export default function PrivacyPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        description="Practical private beta privacy information for accounts, auction activity, proof uploads, verification, logs, and service providers."
        eyebrow="Legal"
        title="Privacy Policy"
      />

      <section className="surface-card space-y-6 p-6">
        <p className="text-sm text-zinc-600">
          This page is operator-editable policy content for the private beta. It is not legal
          advice, and the operator should review it with appropriate counsel before opening the
          site to invited users.
        </p>

        <div className="grid gap-6">
          {sections.map((section) => (
            <article key={section.title} className="space-y-3">
              <h3 className="text-base font-semibold text-zinc-950">{section.title}</h3>
              <ul className="space-y-2 text-sm leading-6 text-zinc-700">
                {section.items.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-700" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
