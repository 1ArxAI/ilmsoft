/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { SchoolProfile, Role } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: SchoolProfile | null;
  role: Role | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  role: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

// Constants defined outside component to prevent recreation on every render
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession]       = useState<Session | null>(null);
  const [user, setUser]             = useState<User | null>(null);
  const [profile, setProfile]       = useState<SchoolProfile | null>(null);
  const [role, setRole]             = useState<Role | null>(null);
  const [loading, setLoading]       = useState(true);
  const userIdRef = useRef<string | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);


  /**
   * Fetch user profile with role detection:
   * 1. Check school_members — if user is an active member, use that school
   * 2. Fallback: check schools.user_id — existing owner behavior
   */
  const fetchProfile = useCallback((userId: string): Promise<void> => {
    if (inflightRef.current) return inflightRef.current;
    const run = (async () => {
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      // Step 1: Check if user is a member (owner or manager) of any school
      // One round trip: the membership row with its school embedded.
      const { data: member } = await supabase
        .from('school_members')
        .select('role, schools:school_id(id, user_id, school_name, contact, email, logo_url, primary_color, secondary_color, tertiary_color, total_credits, credit_expires_at, created_at)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('role', { ascending: false })   // 'owner' before 'manager'
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const embedded = member?.schools as unknown as SchoolProfile | SchoolProfile[] | null | undefined;
      const school = Array.isArray(embedded) ? embedded[0] : embedded;
      if (member && school) {
        setRole(member.role as Role);
        setProfile(school);
        return;
      }

      // Step 2: Fallback — check if user owns a school (backward compat)
      const { data, error } = await supabase
        .from('schools')
        .select('id, user_id, school_name, contact, email, logo_url, primary_color, secondary_color, tertiary_color, total_credits, credit_expires_at, created_at')
        .eq('user_id', userId)
        .single();

      if (error) {
        const shouldRetry = attempt <= MAX_RETRIES && (
          error.message?.includes('network') ||
          error.message?.includes('timeout') ||
          error.code?.startsWith('5')
        );
        
        if (shouldRetry) {
          await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
          continue;
        }
        
        // Only log in development
        if (import.meta.env.DEV) {
          console.error('Error fetching profile:', error.message);
        }
      } else if (data) {
        setProfile(data as SchoolProfile);
        setRole('owner');
      }
    } catch (err) {
      if (attempt <= MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
        continue;
      }
      // Only log in development
      if (import.meta.env.DEV) {
        console.error('Unexpected error fetching profile', err);
      }
    }
    return;
    }
    })().finally(() => { inflightRef.current = null; });
    inflightRef.current = run;
    return run;
  }, []);

  useEffect(() => {
    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          userIdRef.current = session.user.id;
          fetchProfile(session.user.id).finally(() => setLoading(false));
        } else {
          setLoading(false);
        }
      } catch (err) {
        // Only log in development
        if (import.meta.env.DEV) {
          console.error('Error fetching initial session:', err);
        }
        setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // supabase-js emits INITIAL_SESSION, then SIGNED_IN (often several times) on every page load, and
        // TOKEN_REFRESHED hourly. The profile only needs loading when the signed-in user actually changes;
        // initSession() above handles the first load.
        if (event === 'TOKEN_REFRESHED' || userIdRef.current === session.user.id) return;
        setLoading(true);
        userIdRef.current = session.user.id;
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        userIdRef.current = null;
        setProfile(null);
        setRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // Only log in development
      if (import.meta.env.DEV) {
        console.error('Error signing out:', err);
      }
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  }, [user, fetchProfile]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    session,
    user,
    profile,
    role,
    loading,
    signOut,
    refreshProfile,
  }), [session, user, profile, role, loading, signOut, refreshProfile]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
