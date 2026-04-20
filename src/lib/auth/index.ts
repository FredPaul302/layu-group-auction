export type AuthRole =
  | "guest"
  | "registered_user"
  | "deposit_verified_bidder"
  | "persona_verified_bidder"
  | "admin";

export type SessionUser = {
  id: string;
  email: string;
  role: AuthRole;
};
