"use client";

import { useEffect, useRef, useState } from "react";
import { centsToDollars, moneyFormValue } from "@/lib/money";

import { PhotoThumbnails, type SavedPhotoPreview } from "@/components/admin/photo-thumbnails";
import { PriceSuggestionPreview } from "@/components/admin/price-suggestion-preview";
import { isPriceSuggestion, type PriceSuggestion, type PricingListingType } from "@/lib/catalog/price-suggestion";
import { listingImageAcceptValue, listingImageMaxCount, listingImageMaxSizeBytes } from "@/lib/catalog/index";
import { validateDescriptionDraftInput } from "@/lib/catalog/description-draft-input";
import { descriptionPhotoMaxCount } from "@/lib/catalog/description-photos";
import { prepareDescriptionPhotos } from "@/lib/catalog/prepare-description-photos";

function readItemFacts(form: HTMLFormElement) {
  const formData = new FormData(form);
  const category = form.elements.namedItem("categoryId") as HTMLSelectElement | null;
  const upload = form.elements.namedItem("images") as HTMLInputElement | null;
  return {
    facts: {
      title: String(formData.get("title") ?? ""),
      category: category?.selectedOptions[0]?.textContent ?? "",
      conditionNote: String(formData.get("conditionNote") ?? ""),
      description: String(formData.get("description") ?? "")
    },
    photos: Array.from(upload?.files ?? []),
    pricing: {
      listingType: (formData.get("listingType") === "fixed_price" ? "fixed_price" : "auction") as PricingListingType,
      fixedPriceCents: String(moneyFormValue(formData, "fixedPrice", "fixedPriceCents")),
      startingBidCents: String(moneyFormValue(formData, "startingBid", "startingBidCents"))
    }
  };
}

type ItemSnapshot = ReturnType<typeof readItemFacts>;
export function isSameItem(current: ItemSnapshot, source: ItemSnapshot, withPhotos: boolean) {
  return JSON.stringify(current.facts) === JSON.stringify(source.facts) && (!withPhotos ||
    (current.photos.length === source.photos.length && current.photos.every((file, index) => file === source.photos[index])));
}

export function canApplyItemPrice(current: ItemSnapshot, source: ItemSnapshot, withPhotos: boolean) {
  return isSameItem(current, source, withPhotos) && JSON.stringify(current.pricing) === JSON.stringify(source.pricing);
}

type ListingDescriptionFieldProps = {
  initialTitle: string;
  initialDescription: string;
  initialCondition?: string;
  aiEnabled: boolean;
  savedImages?: SavedPhotoPreview[];
};

export function ListingDescriptionField({ initialTitle, initialDescription, initialCondition = "", aiEnabled, savedImages = [] }: ListingDescriptionFieldProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [condition, setCondition] = useState(initialCondition);
  const [editingInstructions, setEditingInstructions] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [includePriceSuggestion, setIncludePriceSuggestion] = useState(true);
  const [draft, setDraft] = useState<{ title: string; description: string; conditionNote: string; descriptionOnly: boolean; source: ItemSnapshot; withPhotos: boolean; priceSuggestion?: PriceSuggestion | null; textApplied?: boolean; priceApplied?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const requestInFlight = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function generateDraft(withPhotos = false, descriptionOnly = false) {
    const form = fieldRef.current?.form;
    if (!form || requestInFlight.current) {
      return;
    }
    const source = readItemFacts(form);
    if (withPhotos && !source.photos.length) {
      setMessage("Choose item photos in Upload images, then click Describe uploaded photos. Saved gallery photos are not analyzed by this button.");
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    requestInFlight.current = true;
    setBusy(true);
    setDraft(null);
    setMessage(withPhotos ? `Preparing ${Math.min(source.photos.length, descriptionPhotoMaxCount)} photo(s) for analysis…` : "Drafting from your notes…");
    try {
      const images = withPhotos ? await prepareDescriptionPhotos(source.photos, controller.signal) : undefined;
      if (controller.signal.aborted) return;
      const validation = validateDescriptionDraftInput({ ...source.facts, listingType: source.pricing.listingType,
        includePriceSuggestion: descriptionOnly ? false : includePriceSuggestion,
        ...(descriptionOnly ? { revisionInstructions: editingInstructions } : {}), ...(images ? { images } : {}) });
      if (!validation.input) throw new Error(validation.error);
      if (!isSameItem(readItemFacts(form), source, withPhotos)) throw new Error("Item details or photos changed. Start again to describe the updated item.");
      setMessage(withPhotos ? "Analyzing item photos…" : "Drafting from your notes…");
      const response = await fetch("/api/admin/listings/description-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.input),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)])
      });
      if (response.redirected) {
        throw new Error("Please sign in as an administrator again. Your title and description have not changed.");
      }
      const payload = await response.json() as { title?: string; description?: string; conditionNote?: string; message?: string; priceSuggestion?: unknown };
      if (!response.ok || typeof payload.title !== "string" || !payload.title.trim() || typeof payload.description !== "string" || !payload.description.trim()
        || typeof payload.conditionNote !== "string" || payload.conditionNote.length > 2000) {
        throw new Error(payload.message ?? "AI drafting could not finish. Your title and description have not changed.");
      }
      if (controller.signal.aborted) return;
      if (!isSameItem(readItemFacts(form), source, withPhotos)) throw new Error("Item details or photos changed while drafting. Generate a new draft for the updated item.");
      if (!descriptionOnly && includePriceSuggestion && payload.priceSuggestion != null && !isPriceSuggestion(payload.priceSuggestion, source.pricing.listingType)) {
        throw new Error("AI returned an invalid price suggestion. Your fields have not changed.");
      }
      setDraft({ title: payload.title, description: payload.description, conditionNote: payload.conditionNote, descriptionOnly, source, withPhotos,
        ...(!descriptionOnly && includePriceSuggestion ? { priceSuggestion: payload.priceSuggestion as PriceSuggestion | null ?? null } : {}) });
      setMessage(descriptionOnly ? "Revised description ready. Review it before applying." : "Title, description and estimated condition ready. Review the suggestions before applying.");
    } catch (error) {
      setMessage(controller.signal.aborted ? "Drafting stopped. Your title and description have not changed." : error instanceof Error && error.name !== "TimeoutError"
        ? error.message
        : "AI drafting timed out. Your title and description have not changed.");
    } finally {
      if (controller.signal.aborted) {
        setMessage("Drafting stopped. Your title and description have not changed.");
      }
      requestInFlight.current = false;
      controllerRef.current = null;
      setBusy(false);
    }
  }

  function applyDraft(withPrice = false) {
    const form = fieldRef.current?.form;
    if (!draft || !form) return;
    const current = readItemFacts(form);
    if (!isSameItem(current, draft.source, draft.withPhotos) || (withPrice && !canApplyItemPrice(current, draft.source, draft.withPhotos))) {
      setMessage("Your item details, photos or price changed. Generate fresh suggestions so your edits are preserved.");
      return;
    }
    if (withPrice) {
      if (draft.descriptionOnly || !draft.priceSuggestion) return;
      const priceField = form.elements.namedItem(draft.source.pricing.listingType === "auction" ? "startingBid" : "fixedPrice");
      if (!(priceField instanceof HTMLInputElement) || priceField.disabled || priceField.readOnly) return;
      priceField.value = centsToDollars(draft.priceSuggestion.suggestedPriceCents);
      priceField.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (!draft.descriptionOnly) {
      setTitle(draft.title);
      setCondition(draft.conditionNote);
    }
    setDescription(draft.description);
    setDraft(!draft.descriptionOnly && draft.priceSuggestion && !draft.priceApplied && !withPrice ? { ...draft, textApplied: true,
      source: { ...draft.source, facts: { ...draft.source.facts, title: draft.title, description: draft.description, conditionNote: draft.conditionNote } } } : null);
    setMessage(draft.descriptionOnly ? "Revised description applied. Title, condition and price are unchanged; save when ready." : "Suggestions applied. Review the fields, then save the listing when ready.");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="min-w-0 space-y-3">
        <label className="block space-y-2 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Upload images</span>
          <input accept={listingImageAcceptValue} className="w-full rounded-md border border-zinc-300 px-3 py-2"
            multiple name="images" onChange={(event) => setPhotos(Array.from(event.currentTarget.files ?? []))} type="file" />
          <span className="block text-xs text-zinc-500">
            Up to {listingImageMaxCount} images total. JPEG, PNG, WebP, AVIF, or GIF only. {Math.floor(listingImageMaxSizeBytes / (1024 * 1024))} MB max per image.
          </span>
        </label>
        {photos.length ? <>
          <p className="text-sm font-medium text-zinc-900">Selected photos ({photos.length})</p>
          <PhotoThumbnails files={photos} label="New photos for this item" />
        </> : <p className="text-sm text-zinc-600">Choose photos to preview them beside the item details.</p>}
        {savedImages.length ? <>
          <p className="text-sm font-medium text-zinc-900">Saved photos ({savedImages.length})</p>
          <PhotoThumbnails images={savedImages} label="Saved photos for this item" />
          <p className="text-xs text-zinc-600">Use the gallery manager to choose a cover, reorder, or remove saved photos.</p>
        </> : null}
      </div>
      <div className="min-w-0 space-y-3">
      <label className="block space-y-2 text-sm text-zinc-700">
        <span className="font-medium text-zinc-900">Title</span>
        <input className="w-full rounded-md border border-zinc-300 px-3 py-2" name="title"
          onChange={(event) => setTitle(event.currentTarget.value)} required type="text" value={title} />
      </label>
      <label className="block space-y-2 text-sm text-zinc-700">
        <span className="font-medium text-zinc-900">Description</span>
        <textarea
          className="min-h-32 w-full rounded-md border border-zinc-300 px-3 py-2"
          name="description"
          onChange={(event) => setDescription(event.currentTarget.value)}
          ref={fieldRef}
          value={description}
        />
      </label>
      <p className="text-xs text-zinc-600">Edit the description directly, or use AI editing instructions below.</p>
      <label className="block space-y-2 text-sm text-zinc-700">
        <span className="font-medium text-zinc-900">Condition note</span>
        <textarea className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2" name="conditionNote" maxLength={2000}
          value={condition} onChange={(event) => setCondition(event.currentTarget.value)} />
      </label>
      <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <label className="block space-y-2 text-sm text-zinc-700"><span>AI editing instructions</span>
          <textarea maxLength={2000} disabled={busy} value={editingInstructions} placeholder="For example: make this shorter while keeping the condition and missing-part details."
            onChange={(event) => { setEditingInstructions(event.currentTarget.value); setDraft(null); }} />
        </label>
        <button className="button-secondary px-3 py-2 text-sm disabled:opacity-50" type="button"
          disabled={!aiEnabled || busy || !description.trim() || !editingInstructions.trim()}
          onClick={() => void generateDraft(photos.length > 0, true)}>Revise description with AI</button>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input checked={includePriceSuggestion} disabled={!aiEnabled || busy} onChange={(event) => setIncludePriceSuggestion(event.currentTarget.checked)} type="checkbox" />
          Also suggest a price
        </label>
        <p className="text-xs text-zinc-600">Review the title, description, estimated condition and price. Apply all suggestions together or apply the price separately.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="button-primary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!aiEnabled || busy}
            onClick={() => void generateDraft(true)}
            type="button"
          >Describe uploaded photos</button>
          <button
            className="button-secondary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!aiEnabled || busy}
            onClick={() => void generateDraft(false)}
            type="button"
          >
            Draft with AI from notes
          </button>
          {busy ? <button className="button-ghost px-3 py-2 text-sm" onClick={() => { controllerRef.current?.abort(); setMessage("Stopping drafting…"); }} type="button">Stop drafting</button> : null}
          <p className="text-xs text-zinc-600">
            {aiEnabled
              ? `Photo analysis uses the first ${descriptionPhotoMaxCount} newly selected images plus your notes. Smaller copies go to your configured AI provider; original uploads stay intact. Free quota or charges depend on your provider's plan. Use product photos only, without personal or confidential information. Photos cannot prove working condition or authenticity.`
              : "AI drafting is currently turned off. You can write and save descriptions as usual."}
          </p>
        </div>
        <p aria-live="polite" className="text-sm text-zinc-700" role="status">{message}</p>
        {draft !== null ? (
          <div className="space-y-3 border-t border-zinc-200 pt-3">
            <p className="text-sm font-semibold text-zinc-900">AI draft preview</p>
            {!draft.descriptionOnly ? <><p className="text-xs font-medium text-zinc-600">Suggested title</p>
            <p className="text-sm font-semibold text-zinc-900">{draft.title}</p></> : null}
            <p className="text-xs font-medium text-zinc-600">Suggested description</p>
            <p className="whitespace-pre-wrap text-sm text-zinc-700">{draft.description}</p>
            {!draft.descriptionOnly ? <><p className="text-xs font-medium text-zinc-600">Estimated condition</p><p className="whitespace-pre-wrap text-sm text-zinc-700">{draft.conditionNote}</p></> : null}
            <p className="text-xs text-zinc-600">{draft.descriptionOnly ? "Applying changes only the description. Your title, condition and price stay as entered." : "Confirm visible condition, included parts, and other claims. Applying fills the title, description and condition; every field remains editable. Save the listing to keep your changes."}</p>
            <div className="flex flex-wrap gap-2">
              <button
                className="button-secondary px-3 py-2 text-sm"
                disabled={busy || draft.textApplied}
                onClick={() => applyDraft()}
                type="button"
              >{draft.textApplied ? "Text and condition applied" : draft.descriptionOnly ? "Apply revised description" : "Apply title, description and condition"}</button>
              {!draft.descriptionOnly && !draft.textApplied && !draft.priceApplied && draft.priceSuggestion ? <button
                className="button-primary px-3 py-2 text-sm" disabled={busy} onClick={() => applyDraft(true)} type="button">Apply all suggestions</button> : null}
              <button
                className="button-ghost px-3 py-2 text-sm"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  setMessage("Remaining suggestions discarded. Your current fields have not changed.");
                }}
                type="button"
              >Discard draft</button>
            </div>
            {draft.priceSuggestion !== undefined ? <PriceSuggestionPreview
              suggestion={draft.priceSuggestion} listingType={draft.source.pricing.listingType}
              applied={draft.priceApplied} disabled={busy}
              onApply={() => {
                const form = fieldRef.current?.form;
                if (!form || !draft.priceSuggestion) return;
                const current = readItemFacts(form);
                if (!canApplyItemPrice(current, draft.source, draft.withPhotos)) {
                  setMessage("Item details, photos, listing type, or price changed. Generate a fresh suggestion to preserve your edits.");
                  return;
                }
                const fieldName = draft.source.pricing.listingType === "auction" ? "startingBid" : "fixedPrice";
                const priceField = form.elements.namedItem(fieldName);
                if (!(priceField instanceof HTMLInputElement) || priceField.disabled || priceField.readOnly) return;
                priceField.value = centsToDollars(draft.priceSuggestion.suggestedPriceCents);
                priceField.dispatchEvent(new Event("input", { bubbles: true }));
                setDraft({ ...draft, priceApplied: true, source: { ...draft.source, pricing: readItemFacts(form).pricing } });
                setMessage("Suggested price applied. Review the price field and save the listing when ready.");
              }} /> : null}
          </div>
        ) : null}
      </div>
      </div>
    </div>
  );
}
