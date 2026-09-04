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


  /**
   * Fetch user profile with role detection:
   * 1. Check school_members — if user is an active member, use that school
   * 2. Fallback: check schools.user_id — existing owner behavior
   */
  const fetchProfile = useCallback(async (userId: string, attempt = 1): Promise<void> => {
    try {
      // Step 1: Check if user is a member (owner or manager) of any school
      const { data: member } = await supabase
        .from('school_members')
        .select('school_id, role, status')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('role', { ascending: false })   // 'owner' before 'manager'
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (member) {
        setRole(member.role as Role);
        const { data: school, error: schoolError } = await supabase
          .from('schools')
          .select('id, user_id, school_name, contact, email, logo_url, primary_color, secondary_color, tertiary_color, total_credits, credit_expires_at, created_at')
          .eq('id', member.school_id)
          .single();

        if (school) {
          setProfile(school as SchoolProfile);
          // Members (managers invited to existing schools) don't get free credits
        } else if (schoolError) {
          // Only log in development
          if (import.meta.env.DEV) {
            console.error('Error fetching school by member:', schoolError.message);
          }
        }
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
          return fetchProfile(userId, attempt + 1);
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
        return fetchProfile(userId, attempt + 1);
      }
      // Only log in development
      if (import.meta.env.DEV) {
        console.error('Unexpected error fetching profile', err);
      }
    }
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        if (userIdRef.current !== session.user.id) {
          setLoading(true);
          userIdRef.current = session.user.id;
        }
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
