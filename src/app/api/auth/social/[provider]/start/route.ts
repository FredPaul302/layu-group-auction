import type { NextRequest } from "next/server";
import { startSocialLogin } from "@/lib/auth/social-routes";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  return startSocialLogin(request, (await context.params).provider);
}
