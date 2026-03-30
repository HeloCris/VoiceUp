import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider, getAuthToken } from '../firebase';

type UserRole = 'student' | 'teacher';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  role: UserRole | null;
  roleLoading: boolean;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
      setError(null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadRole = async () => {
      if (!user) {
        setRole(null);
        setRoleLoading(false);
        return;
      }
      setRoleLoading(true);
      try {
        const token = await getAuthToken();
        if (!token) {
          setRole(null);
          return;
        }
        const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          setRole(null);
          return;
        }
        const data = (await response.json()) as { role?: UserRole };
        setRole(data.role ?? null);
      } catch (err) {
        setRole(null);
      } finally {
        setRoleLoading(false);
      }
    };

    loadRole();
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      role,
      roleLoading,
      signIn: async () => {
        try {
          setError(null);
          await signInWithPopup(auth, googleProvider);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Falha ao entrar com Google.';
          setError(message);
        }
      },
      signOutUser: async () => {
        await signOut(auth);
      },
    }),
    [user, loading, error, role, roleLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
