import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchPublicCatalog } from "../api/auth";
import type { Catalog } from "../api/catalog";

type SalonContextValue = {
  catalog: Catalog | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
};

const SalonContext = createContext<SalonContextValue | null>(null);

export function SalonProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const data = await fetchPublicCatalog();
    setCatalog(data);
    setError("");
  }, []);

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load salon details."))
      .finally(() => setLoading(false));
  }, [reload]);

  return (
    <SalonContext.Provider value={{ catalog, loading, error, reload }}>{children}</SalonContext.Provider>
  );
}

export function useSalon() {
  const context = useContext(SalonContext);
  if (!context) {
    throw new Error("useSalon must be used within SalonProvider");
  }
  return context;
}
