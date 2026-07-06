import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { localAuthBypass } from '../firebase';
const localRole = (import.meta.env.VITE_LOCAL_ROLE as LocalRole | undefined) ?? 'student';
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

const localSuperadminEmails = (String(import.meta.env.VITE_SUPERADMIN_EMAIL ?? 'cristinehelorrayne@gmail.com'))
  .split(/[,;]+/)
  .map((value: string) => normalizeEmail(value))
  .filter(Boolean);

type UserRole = 'student' | 'teacher';
type LocalRole = UserRole | 'superadmin';

interface AppUser {
  uid: string;
  email: string | null;
}

export type LocalRole = UserRole | 'superadmin';

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  error: string | null;
  role: UserRole | null;
  roleLoading: boolean;
  isSuperadmin: boolean;
  accessDenied: boolean;
  localOverrideRole: LocalRole | null;
  localOverrideEmail: string | null;
  localOverrideIsSuperadmin: boolean | null;
  setLocalOverrideRole: (role: LocalRole | null) => void;
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
  const [localOverrideRole, setLocalOverrideRole] = useState<LocalRole | null>(null);
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
        const email = localOverrideEmail?.trim() || localUserEmail;
        const normalizedEmail = normalizeEmail(email);
        const localUser: AppUser = {
          uid: 'local-user',
          email: normalizedEmail,
        };
        setUser(localUser);

        const explicitRole = localOverrideRole ?? localRole;
        const isSuperadminEmail = localSuperadminEmails.includes(normalizedEmail);
        const finalRole: UserRole = explicitRole === 'teacher' || explicitRole === 'superadmin' ? 'teacher' : 'student';
        const isSuper = explicitRole === 'superadmin' || isSuperadminEmail;

        setRole(finalRole);
        setIsSuperadmin(isSuper);
        setAccessDenied(false);
      },
      signOutUser: async () => {
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
