import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { localAuthBypass } from '../firebase';
const localRole = (import.meta.env.VITE_LOCAL_ROLE as UserRole | undefined) ?? 'student';
const localUserEmail = import.meta.env.VITE_LOCAL_USER_EMAIL ?? 'local@voiceup.dev';

const normalizeEmail = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  const [local, domain] = trimmed.split('@');
  if (!local || !domain) return trimmed;
  const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;
  const localPart = normalizedDomain === 'gmail.com'
    ? local.split('+')[0].replace(/\./g, '')
    : local.split('+')[0];
  return `${localPart}@${normalizedDomain}`;
};

const localSuperadminEmails = (String(import.meta.env.VITE_SUPERADMIN_EMAIL ?? localUserEmail))
  .split(/[,;]+/)
  .map((value: string) => normalizeEmail(value))
  .filter(Boolean);

type UserRole = 'student' | 'teacher';

interface AppUser {
  uid: string;
  email: string | null;
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  error: string | null;
  role: UserRole | null;
  roleLoading: boolean;
  isSuperadmin: boolean;
  accessDenied: boolean;
  localOverrideRole: UserRole | null;
  localOverrideEmail: string | null;
  localOverrideIsSuperadmin: boolean | null;
  setLocalOverrideRole: (role: UserRole | null) => void;
  setLocalOverrideEmail: (email: string | null) => void;
  setLocalOverrideIsSuperadmin: (value: boolean | null) => void;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [localSignedOut, setLocalSignedOut] = useState(false);
  const [localOverrideRole, setLocalOverrideRole] = useState<UserRole | null>(null);
  const [localOverrideEmail, setLocalOverrideEmail] = useState<string | null>(null);
  const [localOverrideIsSuperadmin, setLocalOverrideIsSuperadmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (localAuthBypass) {
      if (localSignedOut) {
        setUser(null);
        setLoading(false);
        setError(null);
        setIsSuperadmin(false);
        setAccessDenied(false);
        return;
      }
      const overrideEmail = localOverrideEmail ?? localUserEmail;
      const localUser: AppUser = {
        uid: 'local-user',
        email: overrideEmail,
      };
      setUser(localUser);
      setLoading(false);
      setError(null);
      setIsSuperadmin(false);
      setAccessDenied(false);
      return;
    }

    setUser(null);
    setLoading(false);
    setError('Autenticação remota não está disponível.');
    setIsSuperadmin(false);
    setAccessDenied(false);
  }, [localSignedOut, localOverrideEmail]);

  useEffect(() => {
    if (!localAuthBypass) return;
    if (typeof window === 'undefined') return;
    const email = localOverrideEmail ?? localUserEmail;
    const role = localOverrideRole ?? localRole;
    window.localStorage.setItem('voiceup_local_email', email);
    window.localStorage.setItem('voiceup_local_role', role);
  }, [localOverrideEmail, localOverrideRole]);

  useEffect(() => {
    if (localAuthBypass) {
      if (localSignedOut) {
        setRole(null);
        setRoleLoading(false);
        setIsSuperadmin(false);
        setAccessDenied(false);
        return;
      }
      setRoleLoading(false);
      const role = localOverrideRole ?? localRole;
      setRole(role);
      setIsSuperadmin(role !== 'student' && (localOverrideIsSuperadmin ?? false));
      setAccessDenied(false);
      return;
    }

    setRole(null);
    setRoleLoading(false);
    setIsSuperadmin(false);
    setAccessDenied(false);
  }, [localAuthBypass, localOverrideRole, localOverrideIsSuperadmin]);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      role,
      roleLoading,
      isSuperadmin,
      accessDenied,
      localOverrideRole,
      localOverrideEmail,
      localOverrideIsSuperadmin,
      setLocalOverrideRole,
      setLocalOverrideEmail,
      setLocalOverrideIsSuperadmin,
      signIn: async () => {
        if (!localAuthBypass) {
          setError('Autenticação local não está habilitada.');
          return;
        }

        setLocalSignedOut(false);
        const overrideEmail = localOverrideEmail ?? localUserEmail;
        const localUser: AppUser = {
          uid: 'local-user',
          email: overrideEmail,
        };
        setUser(localUser);
        const role = localOverrideRole ?? localRole;
        setRole(role);
        const isLocalSuperadmin =
          role !== 'student' &&
          (localOverrideIsSuperadmin ?? localSuperadminEmails.includes(overrideEmail.toLowerCase()));
        setIsSuperadmin(isLocalSuperadmin);
        setAccessDenied(false);
      },
      signOutUser: async () => {
        if (!localAuthBypass) {
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem(extensionEmailStorageKey);
          }
          if (!auth) return;
          try {
            await signOut(auth);
          } catch (logoutError) {
            console.error('Firebase logout failed', logoutError);
          }
          setUser(null);
          setRole(null);
          setIsSuperadmin(false);
          setAccessDenied(false);
          return;
        }

        setLocalSignedOut(true);
        setUser(null);
        setRole(null);
        setIsSuperadmin(false);
        setAccessDenied(false);
      },
    }),
    [
      user,
      loading,
      error,
      role,
      roleLoading,
      isSuperadmin,
      accessDenied,
      localOverrideRole,
      localOverrideEmail,
      localOverrideIsSuperadmin,
      localSignedOut,
    ]
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
