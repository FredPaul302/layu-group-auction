import type { BulkListingItemInput } from "./bulk-listings";

export type AuctionDurationUnit = "days" | "hours" | "minutes";
const minuteCounts = { days: 1440, hours: 60, minutes: 1 } as const;

export function auctionEndAfter(value: string, unit: AuctionDurationUnit, now = new Date()) {
  const minutes = Number(value) * minuteCounts[unit];
  if (!value.trim() || !Number.isFinite(minutes) || minutes < 1) return null;
  const end = new Date(Math.ceil((now.getTime() + minutes * 60_000) / 60_000) * 60_000);
  return Number.isFinite(end.getTime()) && end.getUTCFullYear() <= 9999 ? end.toISOString() : null;
}

export function auctionEndToLocalInput(value: string) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localAuctionEndToUtc(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value);
  // Reject impossible dates and local times skipped by daylight saving changes.
  if (!Number.isFinite(date.getTime()) || auctionEndToLocalInput(date.toISOString()) !== value) return null;
  return date.toISOString();
}

export function applySharedAuctionEnd(items: BulkListingItemInput[], enabled: boolean, endAtUtc: string) {
  return enabled ? items.map((item) => item.listingType === "auction" ? { ...item, endAtUtc } : item) : items;
}
