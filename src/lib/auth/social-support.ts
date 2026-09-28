import { prisma } from "@/lib/prisma";

export function validSupportEmail(value: string | null | undefined) {
  const email = value?.trim();
  if (!email || email.length > 320 || !/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/u.test(email)) return null;
  return email;
}

export async function getSocialDataSupportEmail() {
  const setting = await prisma.siteSetting.findUnique({ where: { id: 1 }, select: { supportEmail: true } });
  return validSupportEmail(setting?.supportEmail);
}
