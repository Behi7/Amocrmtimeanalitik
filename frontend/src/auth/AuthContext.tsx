import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authApi, setAccessToken, getAccessToken } from '../api/client';

interface AuthState {
  role: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await authApi.refresh();
      if (token) {
        // We got new access token via refresh but need role — try to decode JWT
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          setRole(payload.role);
        } catch {
          setRole(null);
        }
      }
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setAccessToken(res.accessToken);
    setRole(res.role);
  };

  const logout = async () => {
    await authApi.logout();
    setAccessToken(null);
    setRole(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ role, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
