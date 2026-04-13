"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import pb from "./pocketbase";

interface AuthContextType {
  authenticated: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  authenticated: false,
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const valid = pb.authStore.isValid;
    setAuthenticated(valid);
    setChecked(true);
    if (!valid && pathname !== "/login") {
      router.replace("/login");
    }
  }, [pathname, router]);

  // Listen for auth changes
  useEffect(() => {
    const unsub = pb.authStore.onChange(() => {
      const valid = pb.authStore.isValid;
      setAuthenticated(valid);
      if (!valid && pathname !== "/login") {
        router.replace("/login");
      }
    });
    return unsub;
  }, [pathname, router]);

  const logout = () => {
    pb.authStore.clear();
    setAuthenticated(false);
    router.replace("/login");
  };

  if (!checked) return null;
  if (!authenticated && pathname !== "/login") return null;

  return (
    <AuthContext.Provider value={{ authenticated, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
