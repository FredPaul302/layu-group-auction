import type { NextRequest } from "next/server";
import { disconnectSocialLogin } from "@/lib/auth/social-routes";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  return disconnectSocialLogin(request, (await context.params).provider);
}
