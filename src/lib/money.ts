// Prices remain integer cents in storage and domain code. Convert only at the UI boundary.
export const maxMoneyCents = 2_147_483_647;

export function dollarsToCents(value: unknown): number {
  if (typeof value !== "string") return Number.NaN;
  const normalized = value.trim();
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/u.test(normalized)) return Number.NaN;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= maxMoneyCents ? cents : Number.NaN;
}

export function centsToDollars(value: number | string | null | undefined): string {
  if (value == null || value === "") return "";
  const cents = Number(value);
  return Number.isSafeInteger(cents) ? (cents / 100).toFixed(2) : "";
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

// Old forms and saved workspaces explicitly marked as cents retain their value.
export function moneyFormValue(form: FormData, dollarsName: string, legacyCentsName: string): number {
  if (form.has(dollarsName)) return dollarsToCents(form.get(dollarsName));
  const legacy = form.get(legacyCentsName);
  if (typeof legacy !== "string" || !/^\d+$/u.test(legacy.trim())) return Number.NaN;
  const cents = Number(legacy);
  return Number.isSafeInteger(cents) && cents <= maxMoneyCents ? cents : Number.NaN;
}
