import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useFlashMessage } from '../hooks/useFlashMessage';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Users, UserPlus, Shield, Copy, CheckCircle, XCircle, Trash2, Clock } from 'lucide-react';
import type { SchoolMember } from '../lib/supabase';
import { isValidEmail } from '../lib/validation';
import './managers.css';

/* ═══════════════════════════════════════════════════════════════════
   Team Manager — Owner can add/remove managers
   ═══════════════════════════════════════════════════════════════════ */

export const TeamManager = ({ schoolId }: { schoolId: string }) => {
  const { role } = useAuth();
  const { flash, showFlash } = useFlashMessage(5000);

  const [members, setMembers]       = useState<SchoolMember[]>([]);
  const [loading, setLoading]       = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting]     = useState(false);
  const [removing, setRemoving]     = useState<string | null>(null);
  const [copiedId, setCopiedId]     = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  
  // Track timeout for confirm dismiss cleanup
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Load Members ──────────────────────────────────────────── */
  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('school_members')
        .select('id, school_id, user_id, email, role, status, invite_token, created_at, updated_at')
        .eq('school_id', schoolId)
        .in('status', ['active', 'pending'])
        .order('role', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMembers(data || []);
    } catch (err: any) {
      console.error('Error loading members:', err.message);
      showFlash('Error loading team members: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [schoolId, showFlash]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  /* ── Invite Manager ────────────────────────────────────────── */
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;

    // Use centralized email validation
    if (!isValidEmail(email)) {
      showFlash('Please enter a valid email address');
      return;
    }

    // Check if already a member
    const existing = members.find(m => m.email === email && m.status !== 'removed');
    if (existing) {
      showFlash('This email is already a team member');
      return;
    }

    setInviting(true);
    try {
      const inviteToken = crypto.randomUUID();
      const { error } = await supabase
        .from('school_members')
        .upsert({
          school_id: schoolId,
          email,
          role: 'manager',
          status: 'pending',
          invite_token: inviteToken,
          user_id: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'school_id,email' });

      if (error) {
        if (error.code === '23505') {
          showFlash('This email is already invited to this school');
        } else {
          throw error;
        }
      } else {
        showFlash(`Invitation sent to ${email}`);
        setInviteEmail('');
        await loadMembers();
      }
    } catch (err: any) {
      showFlash('Error sending invitation: ' + err.message);
    } finally {
      setInviting(false);
    }
  };

  /* ── Copy Invite Link ──────────────────────────────────────── */
  const copyInviteLink = async (member: SchoolMember) => {
    if (!member.invite_token) return;
    const link = `${window.location.origin}/join/${member.invite_token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(member.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
      showFlash('Link: ' + link);
    }
  };

  /* ── Remove Member ─────────────────────────────────────────── */
  const handleRemove = async (memberId: string) => {
    if (memberId === confirmRemove) {
      setRemoving(memberId);
      try {
        const { error } = await supabase
          .from('school_members')
          .update({ status: 'removed', updated_at: new Date().toISOString() })
          .eq('id', memberId);

        if (error) throw error;
        showFlash('Member removed');
        setConfirmRemove(null);
        await loadMembers();
      } catch (err: any) {
        showFlash('Error removing member: ' + err.message);
      } finally {
        setRemoving(null);
      }
    } else {
      // Clear any existing timeout before setting new one
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
      }
      setConfirmRemove(memberId);
      // Auto-dismiss confirm after 5s
      confirmTimeoutRef.current = setTimeout(() => setConfirmRemove(null), 5000);
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
      }
    };
  }, []);

  /* ── Only owner can access ─────────────────────────────────── */
  if (role !== 'owner') {
    return (
      <div className="manager">
        <div className="manager-toolbar">
          <div className="manager-title">
            <Users size={24} />
            <div><h3>Team Members</h3><p>Manage your school team</p></div>
          </div>
        </div>
        <div className="empty-state">
          <Shield size={48} />
          <p>Only the school owner can manage team members</p>
        </div>
      </div>
    );
  }

  return (
    <div className="manager">
      {/* Toolbar */}
      <div className="manager-toolbar">
        <div className="manager-title">
          <Users size={24} />
          <div><h3>Team Members</h3><p>Manage who has access to your school</p></div>
        </div>
      </div>

      {/* Flash */}
      {flash && (
        <div className={'flash ' + (flash.startsWith('Error') ? 'error' : 'success')}>
          {flash.startsWith('Error') ? <span>⚠ {flash}</span> : <span>✓ {flash}</span>}
        </div>
      )}

      {/* Invite Form */}
      <div className="team-invite-card">
        <form onSubmit={handleInvite} className="team-invite-form">
          <div className="team-invite-icon"><UserPlus size={20} /></div>
          <Input
            type="email"
            placeholder="manager@example.com"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            label="Invite a manager by email"
            required
          />
          <Button type="submit" isLoading={inviting} disabled={!inviteEmail.trim()}>
            Send Invite
          </Button>
        </form>
        <p className="team-invite-hint">
          They'll receive an invite link to create their account and join your school.
        </p>
      </div>

      {/* Members List */}
      <div className="team-members-list">
        <div className="form-section-label">
          Team Members ({members.length})
        </div>

        {loading ? (
          <div className="manager-loading"><div className="spinner" /><span>Loading...</span></div>
        ) : members.length === 0 ? (
          <div className="empty-state">
            <Users size={48} />
            <p>No team members yet</p>
            <small>Invite managers above to help manage your school</small>
          </div>
        ) : (
          <div className="team-list">
            {members.map(member => (
              <div key={member.id} className={`team-member-row ${member.status === 'pending' ? 'pending' : ''}`}>
                {/* Avatar */}
                <div className={`team-avatar ${member.role}`}>
                  {member.role === 'owner' ? <Shield size={18} /> : <Users size={18} />}
                </div>

                {/* Info */}
                <div className="team-member-info">
                  <div className="team-member-email">{member.email}</div>
                  <div className="team-member-meta">
                    <span className={`team-role-badge ${member.role}`}>
                      {member.role === 'owner' ? 'Owner' : 'Manager'}
                    </span>
                    {member.status === 'pending' && (
                      <span className="team-status-badge pending">
                        <Clock size={10} /> Invitation pending
                      </span>
                    )}
                    {member.status === 'active' && member.role === 'manager' && (
                      <span className="team-status-badge active">
                        <CheckCircle size={10} /> Active
                      </span>
                    )}
                    {member.role === 'owner' && (
                      <span className="team-status-badge active">
                        <CheckCircle size={10} /> You
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="team-member-actions">
                  {member.status === 'pending' && member.invite_token && (
                    <button
                      className="action-btn copy-btn"
                      onClick={() => copyInviteLink(member)}
                      title="Copy invite link"
                    >
                      {copiedId === member.id ? <CheckCircle size={14} color="var(--success)" /> : <Copy size={14} />}
                    </button>
                  )}
                  {member.role === 'manager' && (
                    <button
                      className="action-btn delete"
                      onClick={() => handleRemove(member.id)}
                      disabled={removing === member.id}
                      title={confirmRemove === member.id ? 'Click again to confirm' : 'Remove member'}
                    >
                      {confirmRemove === member.id ? <XCircle size={14} /> : <Trash2 size={14} />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
