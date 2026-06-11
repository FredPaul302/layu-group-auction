"use client";

import type { BidTier } from "@prisma/client";
import { useState } from "react";

import { slugify } from "@/lib/catalog";

type CategoryFormModel = {
  description: string | null;
  minimumBidIncrementCents: number;
  minimumStartBidCents: number;
  name: string;
  requiredBidTier: BidTier;
  slug: string;
};

type CategoryFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  category?: CategoryFormModel;
  submitLabel: string;
};

const tierOptions = [
  { label: "$5 tier", value: "tier_5" },
  { label: "$10 tier", value: "tier_10" },
  { label: "$20 tier", value: "tier_20" }
] as const;

function createInitialCategory(): CategoryFormModel {
  return {
    description: "",
    minimumBidIncrementCents: 100,
    minimumStartBidCents: 500,
    name: "",
    requiredBidTier: "tier_5",
    slug: ""
  };
}

export function CategoryForm({ action, category, submitLabel }: CategoryFormProps) {
  const initialCategory = category ?? createInitialCategory();
  const [name, setName] = useState(initialCategory.name);
  const [slug, setSlug] = useState(initialCategory.slug);
  const [slugWasEdited, setSlugWasEdited] = useState(Boolean(category));

  function updateName(nextName: string) {
    setName(nextName);

    if (!slugWasEdited) {
      setSlug(slugify(nextName));
    }
  }

  function regenerateSlug() {
    setSlug(slugify(name));
    setSlugWasEdited(false);
  }

  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <label className="space-y-2 text-sm text-zinc-700">
        <span className="font-medium text-zinc-900">Name</span>
        <input
          className="w-full rounded-md border border-zinc-300 px-3 py-2"
          name="name"
          onChange={(event) => updateName(event.currentTarget.value)}
          required
          type="text"
          value={name}
        />
      </label>

      <div className="space-y-2 text-sm text-zinc-700">
        <label className="block space-y-2">
          <span className="font-medium text-zinc-900">Slug</span>
          <input
            className="w-full rounded-md border border-zinc-300 px-3 py-2"
            name="slug"
            onChange={(event) => {
              setSlug(event.currentTarget.value);
              setSlugWasEdited(true);
            }}
            value={slug}
          />
        </label>
        <button
          className="button-ghost px-0 py-0 text-xs font-medium text-emerald-700"
          onClick={regenerateSlug}
          type="button"
        >
          Regenerate from name
        </button>
      </div>

      <label className="space-y-2 text-sm text-zinc-700 md:col-span-2">
        <span className="font-medium text-zinc-900">Description</span>
        <textarea
          className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2"
          defaultValue={initialCategory.description ?? ""}
          name="description"
        />
      </label>

      <label className="space-y-2 text-sm text-zinc-700">
        <span className="font-medium text-zinc-900">Minimum start bid cents</span>
        <input
          className="w-full rounded-md border border-zinc-300 px-3 py-2"
          defaultValue={initialCategory.minimumStartBidCents}
          min={0}
          name="minimumStartBidCents"
          required
          step={1}
          type="number"
        />
      </label>

      <label className="space-y-2 text-sm text-zinc-700">
        <span className="font-medium text-zinc-900">Minimum bid increment cents</span>
        <input
          className="w-full rounded-md border border-zinc-300 px-3 py-2"
          defaultValue={initialCategory.minimumBidIncrementCents}
          min={1}
          name="minimumBidIncrementCents"
          required
          step={1}
          type="number"
        />
      </label>

      <label className="space-y-2 text-sm text-zinc-700">
        <span className="font-medium text-zinc-900">Required bid tier</span>
        <select
          className="w-full rounded-md border border-zinc-300 px-3 py-2"
          defaultValue={initialCategory.requiredBidTier}
          name="requiredBidTier"
        >
          {tierOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="md:col-span-2">
        <button className="button-secondary px-4 py-2 text-sm font-medium" type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
