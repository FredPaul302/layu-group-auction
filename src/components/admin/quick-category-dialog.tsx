"use client";

import type { Category } from "@prisma/client";
import { useState } from "react";

import { slugify } from "@/lib/catalog";
import { formatDepositTierLabel, type DepositTierSettings } from "@/lib/verification/tiers";

export type QuickCategory = Pick<Category, "id" | "name" | "slug" | "requiredBidTier">;

export function QuickCategoryDialog({
  onClose,
  onCreated,
  tierSettings
}: {
  onClose: () => void;
  onCreated: (category: QuickCategory) => void;
  tierSettings?: Partial<DepositTierSettings>;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [minimumStartBid, setMinimumStartBid] = useState("5.00");
  const [minimumBidIncrement, setMinimumBidIncrement] = useState("1.00");
  const [requiredBidTier, setRequiredBidTier] = useState("tier_1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, description, minimumStartBid, minimumBidIncrement, requiredBidTier })
      });
      const payload = await response.json().catch(() => null) as { category?: QuickCategory; message?: string } | null;
      if (!response.ok || !payload?.category || typeof payload.category.id !== "string" || typeof payload.category.slug !== "string") {
        setError(payload?.message || "The category could not be created. Try again.");
        return;
      }
      onCreated(payload.category);
    } catch {
      setError("The category could not be created. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="quick-category-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section aria-labelledby="quick-category-title" aria-modal="true" className="quick-category-dialog" onKeyDown={(event) => { if (event.key === "Escape" && !busy) onClose(); }} role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold" id="quick-category-title">Add a category</h2>
            <p className="mt-1 text-sm">Create a category and continue editing this batch.</p>
          </div>
          <button aria-label="Close category form" className="button-ghost px-2 py-1" disabled={busy} onClick={onClose} type="button">✕</button>
        </div>
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
          <label className="space-y-1 text-sm sm:col-span-2"><span>Category name</span>
            <input autoFocus maxLength={120} onChange={(event) => { const value = event.currentTarget.value; setName(value); if (!slugEdited) setSlug(slugify(value)); }} required value={name} />
          </label>
          <label className="space-y-1 text-sm"><span>Slug</span>
            <input maxLength={120} onChange={(event) => { setSlug(event.currentTarget.value); setSlugEdited(true); }} required value={slug} />
          </label>
          <label className="space-y-1 text-sm"><span>Required bid tier</span>
            <select onChange={(event) => setRequiredBidTier(event.currentTarget.value)} value={requiredBidTier}>
              {(["tier_1", "tier_20"] as const).map((tier) => <option key={tier} value={tier}>{formatDepositTierLabel(tier, tierSettings)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm"><span>Minimum start bid ($)</span>
            <input inputMode="decimal" min="0" onChange={(event) => setMinimumStartBid(event.currentTarget.value)} required step="0.01" type="number" value={minimumStartBid} />
          </label>
          <label className="space-y-1 text-sm"><span>Minimum bid increment ($)</span>
            <input inputMode="decimal" min="0.01" onChange={(event) => setMinimumBidIncrement(event.currentTarget.value)} required step="0.01" type="number" value={minimumBidIncrement} />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2"><span>Description (optional)</span>
            <textarea maxLength={2000} onChange={(event) => setDescription(event.currentTarget.value)} value={description} />
          </label>
          {error ? <p className="notice notice-danger sm:col-span-2" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button className="button-secondary px-4 py-2" disabled={busy} onClick={onClose} type="button">Cancel</button>
            <button className="button-primary px-4 py-2" disabled={busy} type="submit">{busy ? "Creating…" : "Create category"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
