import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { issuePasswordReset } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");

  if (email) {
    await issuePasswordReset(email);
  }

  return NextResponse.redirect(new URL("/auth/forgot-password?status=sent", request.url), {
    status: 303
  });
}
