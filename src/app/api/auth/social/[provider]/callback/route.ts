import type { NextRequest } from "next/server";
import { finishSocialLogin } from "@/lib/auth/social-routes";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  return finishSocialLogin(request, (await context.params).provider);
}
