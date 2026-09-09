import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchMe,
  loginAccount,
  logoutAccount,
  registerAccount,
  type PublicUser,
} from "../api/auth";

type AuthContextValue = {
  user: PublicUser | null;
  loading: boolean;
  register: (input: {
    name: string;
    phone: string;
    password: string;
    confirmPassword: string;
  }) => Promise<PublicUser>;
  login: (input: { phone: string; password: string }) => Promise<PublicUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async register(input) {
        const created = await registerAccount(input);
        setUser(created);
        return created;
      },
      async login(input) {
        const signedIn = await loginAccount(input);
        setUser(signedIn);
        return signedIn;
      },
      async logout() {
        await logoutAccount();
        setUser(null);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
