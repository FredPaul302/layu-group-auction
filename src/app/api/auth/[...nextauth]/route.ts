import { notImplementedResponse } from "@/app/api/_utils/not-implemented";

export async function GET() {
  return notImplementedResponse("/api/auth/[...nextauth]", ["GET", "POST"]);
}

export async function POST() {
  return notImplementedResponse("/api/auth/[...nextauth]", ["GET", "POST"]);
}
