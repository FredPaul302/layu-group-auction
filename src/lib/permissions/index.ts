import type { AuthRole } from "../auth";

export function canAccessAdmin(role: AuthRole) {
  return role === "admin";
}
