import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { GraduationCap, UserPlus, CheckCircle, AlertTriangle, ArrowRight, Shield } from 'lucide-react';
import './Auth.css';

/* ═══════════════════════════════════════════════════════════════════
   Join Invite Page — Manager accepts school invitation
   ═══════════════════════════════════════════════════════════════════ */

export const JoinInvite = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();

  const [inviteInfo, setInviteInfo]       = useState<{ school_name: string; email: string } | null>(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signingUp, setSigningUp]         = useState(false);
  const [signupDone, setSignupDone]       = useState(false);
  const [claiming, setClaiming]           = useState(false);

  /* ── Step 1: Verify invite token ──────────────────────────── */
  useEffect(() => {
    if (!token) { setError('Invalid invite link'); setLoading(false); return; }

    supabase.rpc('verify_invite', { p_token: token }).then(({ data, error: rpcError }) => {
      if (rpcError || !data || data.length === 0) {
        setError('This invite link is invalid or has already been used');
      } else {
        setInviteInfo({ school_name: data[0].school_name, email: data[0].email });
        setEmail(data[0].email);
      }
      setLoading(false);
    });
  }, [token]);

  /* ── Step 2: If already logged in, claim invite ───────────── */
  useEffect(() => {
    if (session?.user && inviteInfo && !signupDone) {
      handleClaim();
    }
  }, [session?.user, inviteInfo]);

  const handleClaim = async () => {
    if (!token) return;
    setClaiming(true);
    try {
      const { data: schoolId, error } = await supabase.rpc('claim_invite', { p_token: token });

      if (error || !schoolId) {
        setError(error?.message || 'Could not accept invitation. The link may have expired.');
      } else {
        setSignupDone(true);
        // Navigate to dashboard after a short delay
        setTimeout(() => navigate('/dashboard', { replace: true }), 1500);
      }
    } catch (err: any) {
      setError('Error accepting invitation: ' + err.message);
    } finally {
      setClaiming(false);
    }
  };

  /* ── Step 3: Sign up + claim ───────────────────────────────── */
  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setSigningUp(true);
    setError('');

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { invite_token: token, email: email.trim().toLowerCase() } },
    });

    if (authError) {
      setError(authError.message);
      setSigningUp(false);
      return;
    }

    if (data.user) {
      // The signup trigger links this account to the invitation (matched by token + email).
      setSignupDone(true);
      if (data.session) {
        setTimeout(() => navigate('/dashboard', { replace: true }), 1500);
      }
      // Otherwise email confirmation is on: they confirm, sign in, and land in the school.
    }

    setSigningUp(false);
  };

  /* ── Already logged in claiming ────────────────────────────── */
  if (claiming) {
    return (
      <div className="auth-page">
        <div className="auth-form-panel">
          <div className="auth-form-wrap animate-fade-up" style={{ textAlign: 'center', maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={28} color="var(--primary)" />
              </div>
            </div>
            <h2>Joining school...</h2>
            <p style={{ color: 'var(--text-muted)', margin: '1rem 0' }}>Linking your account to the school</p>
            <div className="spinner" style={{ margin: '1.5rem auto' }} />
          </div>
        </div>
      </div>
    );
  }

  /* ── Signup success ────────────────────────────────────────── */
  if (signupDone) {
    return (
      <div className="auth-page">
        <div className="auth-form-panel">
          <div className="auth-form-wrap animate-fade-up" style={{ textAlign: 'center', maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={28} color="#059669" />
              </div>
            </div>
            <h2>Welcome to the team!</h2>
            <p style={{ color: 'var(--text-muted)', margin: '1rem 0' }}>
              Your account has been linked to <strong>{inviteInfo?.school_name}</strong>
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>
              {session ? 'Redirecting to dashboard...' : 'Confirm your email from the message we just sent, then sign in.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Error state ───────────────────────────────────────────── */
  if (error && !inviteInfo) {
    return (
      <div className="auth-page">
        <div className="auth-form-panel">
          <div className="auth-form-wrap animate-fade-up" style={{ textAlign: 'center', maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--danger-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={28} color="var(--danger)" />
              </div>
            </div>
            <h2>Invite Not Found</h2>
            <p style={{ color: 'var(--text-muted)', margin: '1rem 0' }}>{error}</p>
            <Link to="/login">
              <Button size="lg"><ArrowRight size={16} /> Go to Login</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ── Loading ───────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-form-panel">
          <div className="auth-form-wrap" style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '2rem auto' }} />
          </div>
        </div>
      </div>
    );
  }

  /* ── Signup form ───────────────────────────────────────────── */
  return (
    <div className="auth-page">
      {/* Brand panel */}
      <div className="auth-brand-panel">
        <div className="auth-brand-logo">
          <div className="logo-icon-wrap"><GraduationCap size={28} color="#fff" /></div>
          <span>ilm<em>soft</em></span>
        </div>
        <div className="auth-brand-tagline">
          <strong>You're invited!</strong>
          Create your account to join the school team and start managing daily operations.
        </div>
      </div>

      {/* Form panel */}
      <div className="auth-form-panel">
        <div className="auth-form-wrap animate-fade-up">
          <div className="auth-form-header">
            <h2>Join {inviteInfo?.school_name}</h2>
            <p>Create your manager account to get started</p>
          </div>

          {error && <div className="auth-error">{error}</div>}

          {/* School info banner */}
          <div style={{
            padding: '0.875rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--primary-light)',
            border: '1px solid var(--primary)',
            fontSize: 'var(--font-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            marginBottom: '1rem',
          }}>
            <Shield size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text)' }}>{inviteInfo?.school_name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                You'll be added as a team manager
              </div>
            </div>
          </div>

          <form onSubmit={handleSignup} className="auth-form">
            <div className="auth-form-grid">
              <div className="span-2">
                <Input
                  id="email"
                  label="Email Address"
                  type="email"
                  value={email}
                  disabled
                />
              </div>
              <div className="span-2">
                <Input
                  id="password"
                  label="Create Password"
                  type="password"
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="span-2">
                <Input
                  id="confirmPassword"
                  label="Confirm Password"
                  type="password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            </div>
            <Button type="submit" fullWidth isLoading={signingUp} size="lg">
              <UserPlus size={18} /> Create Account &amp; Join School
            </Button>
          </form>

          <div className="auth-footer">
            Already have an account? <Link to="/login">Login here</Link>
          </div>
        </div>
      </div>
    </div>
  );
};
