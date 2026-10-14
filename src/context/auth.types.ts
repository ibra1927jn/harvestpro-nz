/**
 * Auth Types — Extracted from AuthContext
 *
 * Shared types for authentication state and context API.
 * @module context/auth.types
 */
import { User } from '@supabase/supabase-js';
import { Role, AppUser } from '../types';

// =============================================
// AUTH STATE
// =============================================
/**
 * Authentication state shape
 * Contains user session, profile, and role information
 */
export interface AuthState {
  /** Supabase auth user (from auth.users table) */
  user: User | null;
  /** Application user profile (from public.users table) */
  appUser: AppUser | null;
  /** Whether user is currently authenticated */
  isAuthenticated: boolean;
  /** Loading state during auth initialization */
  isLoading: boolean;
  /** Whether initial setup wizard is complete */
  isSetupComplete: boolean;
  /** Current active role */
  currentRole: Role | null;
  /** Cached user display name */
  userName: string;
  /** Cached user email */
  userEmail: string;
  /** Currently selected orchard ID */
  orchardId: string | null;
  /** Current orchard display name */
  orchardName: string;
  /** All orchards the user can access */
  availableOrchards: Array<{ id: string; name: string; total_rows: number }>;
  /** Team ID for team_leader role */
  teamId: string | null;
  /** 🔧 R8-Fix2: True when JWT expired but pending data exists */
  needsReAuth: boolean;
  /** 🔐 True when user has not yet accepted NZ Privacy Act 2020 consent */
  needsPrivacyConsent: boolean;
  /** Cuándo se aceptó el código 2FA en esta sesión (los datos se recargan con aal2) */
  mfaVerifiedAt?: number;
}

// =============================================
// CONTEXT API TYPE
// =============================================
/**
 * AuthContext public API
 * Extends AuthState with authentication actions
 *
 * @example
 * ```tsx
 * const { appUser, signIn, signOut } = useAuth();
 * await signIn('user@example.com', 'password');
 * ```
 */
export interface AuthContextType extends AuthState {
  /** Sign in with email and password */
  signIn: (
    email: string,
    password: string
  ) => Promise<{ user: User | null; profile: AppUser | null }>;
  /** Register new user — email must be pre-authorized by HR in allowed_registrations */
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  /** Send password reset email */
  resetPassword: (email: string) => Promise<void>;
  /** Sign out current user (clears session) */
  signOut: () => Promise<void>;
  /** Alias for signOut */
  logout: () => Promise<void>;
  /** Switch to a different orchard */
  switchOrchard: (orchardId: string) => Promise<void>;
  /** Manually update auth state (advanced use only) */
  updateAuthState: (updates: Partial<AuthState>) => void;
}
