import { PageHeader } from "@/components/ui/page-header";

const sections = [
  {
    title: "Private beta auction platform",
    body:
      "Layu Group LLC Auction is a private beta, single-seller auction and fixed-price marketplace. Access may be limited while the operator tests listing, bidding, payment review, verification, and fulfillment workflows."
  },
  {
    title: "Account eligibility and responsibility",
    body:
      "You are responsible for keeping your account information accurate, protecting your login credentials, and using the site only for your own account activity. The operator may require email verification, identity verification, or manual deposit verification before certain actions are available."
  },
  {
    title: "Bids and fixed-price claims",
    body:
      "Auction bids and fixed-price claims should be placed only when you intend to complete the purchase. Bids may be binding once accepted by the site, and fixed-price claims may reserve an item while payment review is pending."
  },
  {
    title: "Payments and proof review",
    body:
      "Payments are handled outside the site through the payment methods shown by the operator. The site records submitted payment details and optional proof uploads so an admin can manually approve or reject a payment submission."
  },
  {
    title: "Verification and deposits",
    body:
      "Some bidding or claiming activity may require verified email plus hosted identity verification or manual deposit verification. Deposit verification is reviewed by an admin and may be tiered by amount."
  },
  {
    title: "Pickup, shipping, and fulfillment",
    body:
      "Listing pages and order pages describe pickup, shipping, or fulfillment expectations. Buyers should follow the operator's instructions and respond promptly to pickup or shipping requests."
  },
  {
    title: "Prohibited conduct",
    body:
      "Do not abuse the site, interfere with other users, submit false payment or verification information, attempt unauthorized access, scrape private data, or use the private beta for illegal or harmful activity."
  },
  {
    title: "Suspension and removal",
    body:
      "The operator may suspend accounts, remove listings, cancel bids or claims, reject payment or verification submissions, or limit access when needed to protect the site, users, inventory, or business operations."
  },
  {
    title: "Changes to these terms",
    body:
      "These terms may change as the private beta evolves. Continued use after updated terms are posted means you accept the updated terms version shown at registration or account use."
  }
] as const;

export default function TermsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        description="Practical private beta terms for accounts, bidding, manual payments, verification, and fulfillment. The operator should review this content before launch."
        eyebrow="Legal"
        title="Terms of Use"
      />

      <section className="surface-card space-y-6 p-6">
        <p className="text-sm text-zinc-600">
          This page is operator-editable policy content for the private beta. It is not legal
          advice, and the operator should review it with appropriate counsel before opening the
          site to invited users.
        </p>

        <div className="grid gap-5">
          {sections.map((section) => (
            <article key={section.title} className="space-y-2">
              <h3 className="text-base font-semibold text-zinc-950">{section.title}</h3>
              <p className="text-sm leading-6 text-zinc-700">{section.body}</p>
            </article>
          ))}
        </div>

        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
          Questions about these terms should be sent to the site operator through the support or
          contact channel provided for the private beta.
        </div>
      </section>
    </div>
  );
}
