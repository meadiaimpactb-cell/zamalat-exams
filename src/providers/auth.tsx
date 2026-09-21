import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { trpc } from "@/providers/trpc";

export type StaffUser = {
  id: number;
  username: string;
  nameAr: string;
  nameEn: string;
  role: "super_admin" | "admin" | "tech_general" | "fellowship_manager" | "expert";
  email: string | null;
};

type AuthCtx = {
  user: StaffUser | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  ready: boolean;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  token: null,
  login: async () => {},
  logout: () => {},
  ready: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StaffUser | null>(() => {
    const raw = localStorage.getItem("staff_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("staff_token"));
  const loginMutation = trpc.auth.login.useMutation();

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await loginMutation.mutateAsync({ username, password });
      localStorage.setItem("staff_token", res.token);
      localStorage.setItem("staff_user", JSON.stringify(res.user));
      setToken(res.token);
      setUser(res.user as StaffUser);
    },
    [loginMutation],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("staff_token");
    localStorage.removeItem("staff_user");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, token, login, logout, ready: true }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
