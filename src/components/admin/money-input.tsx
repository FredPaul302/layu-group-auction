"use client";

import { useState } from "react";
import { centsToDollars, dollarsToCents } from "@/lib/money";

// Keep saved workspaces in their existing cent units, including when an AI
// suggestion or a resumed draft supplies a new value. Incomplete edits survive
// autosave, but cannot pass the workspace's whole-cent validation.
const unfinishedPrefix = "dollars:";
function displayValue(value: string) {
  return value.startsWith(unfinishedPrefix) ? value.slice(unfinishedPrefix.length) : centsToDollars(value);
}

export function MoneyInput({ valueCents, onChangeCents, placeholder }: {
  valueCents: string;
  onChangeCents: (value: string) => void;
  placeholder?: string;
}) {
  const [edit, setEdit] = useState({ source: valueCents, text: displayValue(valueCents) });
  if (edit.source !== valueCents) setEdit({ source: valueCents, text: displayValue(valueCents) });
  const text = edit.source === valueCents ? edit.text : displayValue(valueCents);
  return <input type="text" inputMode="decimal" value={text} placeholder={placeholder ?? "0.00"}
    aria-invalid={valueCents.startsWith(unfinishedPrefix) || undefined}
    onChange={(event) => {
      const next = event.currentTarget.value;
      const cents = dollarsToCents(next);
      const source = next === "" ? "" : Number.isFinite(cents) ? String(cents) : `${unfinishedPrefix}${next}`;
      setEdit({ source, text: next });
      onChangeCents(source);
    }}
    onBlur={() => {
      if (!valueCents.startsWith(unfinishedPrefix)) setEdit({ source: valueCents, text: centsToDollars(valueCents) });
    }} />;
}
