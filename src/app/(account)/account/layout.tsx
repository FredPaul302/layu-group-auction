import type { ReactNode } from "react";

import { requireAuthenticatedUser } from "@/lib/auth";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  await requireAuthenticatedUser();

  return children;
}
