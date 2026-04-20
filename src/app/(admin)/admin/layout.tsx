import type { ReactNode } from "react";

import { requireAdminUser } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminUser();

  return children;
}
