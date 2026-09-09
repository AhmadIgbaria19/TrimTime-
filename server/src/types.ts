export type UserRole = "customer" | "admin";

export type PublicUser = {
  id: number;
  name: string;
  phone: string;
  role: UserRole;
  phoneVerified: boolean;
};
