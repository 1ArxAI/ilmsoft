import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useClasses } from '../hooks/useClasses';
import type { Role, ExtraFee } from '../lib/supabase';
import { useFlashMessage } from '../hooks/useFlashMessage';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Plus, X, Search, Trash2, Edit2, Calendar, BookOpen, DollarSign } from 'lucide-react';
import './managers.css';

const EMPTY = {
  name: '',
  amount: '',
  due_date: '',
  classes: [] as string[],
};

export const ExtraFeesManager = ({ schoolId, role }: { schoolId: string; role?: Role }) => {
  const isOwner = role === 'owner';
  const [fees, setFees] = useState<ExtraFee[]>([]);
  const { classes: classList } = useClasses(schoolId);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const { flash, showFlash } = useFlashMessage(4000);
  const [search, setSearch] = useState('');
  
  const [deleteTarget, setDeleteTarget] = useState<ExtraFee | null>(null);
  const [editTarget, setEditTarget] = useState<ExtraFee | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const feesRes = await supabase.from('extra_fees').select('id, name, amount, due_date, classes, is_active, school_id, created_at').eq('school_id', schoolId).eq('is_active', true).order('due_date', { ascending: false });
      if (feesRes.error) throw feesRes.error;
      setFees(feesRes.data || []);
    } catch (err: any) {
      showFlash('Error loading data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [schoolId]);

  const set = (k: string, v: string | number) => {
    setForm(prev => ({ ...prev, [k]: v }));
  };

  const toggleClass = (classId: string) => {
    setForm(f => {
      const current = new Set(f.classes);
      if (current.has(classId)) current.delete(classId);
      else current.add(classId);
      return { ...f, classes: Array.from(current) };
    });
  };

  const openEdit = (fee: ExtraFee) => {
    setEditTarget(fee);
    setForm({
      name: fee.name,
      amount: String(fee.amount),
      due_date: fee.due_date,
      classes: fee.classes || [],
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.amount || !form.due_date || form.classes.length === 0) {
      showFlash('Please fill in all required fields and select at least one class.');
      return;
    }
    
    setSaving(true);
    let error;
    
    if (editTarget) {
      const { error: err } = await supabase.from('extra_fees').update({
        name: form.name.trim(),
        amount: parseFloat(form.amount) || 0,
        due_date: form.due_date,
        classes: form.classes,
      }).eq('id', editTarget.id);
      error = err;
    } else {
      const { error: err } = await supabase.from('extra_fees').insert({
        school_id: schoolId,
        is_active: true,
        name: form.name.trim(),
        amount: parseFloat(form.amount) || 0,
        due_date: form.due_date,
        classes: form.classes,
      });
      error = err;
    }
    
    setSaving(false);
    if (error) { 
      showFlash('Error: ' + error.message); 
    } else { 
      showFlash(`Fee "${form.name}" ${editTarget ? 'updated' : 'added'}!`); 
      setShowModal(false); 
      setForm({ ...EMPTY }); 
      setEditTarget(null); 
      loadData(); 
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('extra_fees').update({ is_active: false }).eq('id', deleteTarget.id);
      if (error) throw error;
      showFlash(`Fee removed successfully`);
      setDeleteTarget(null);
      loadData();
    } catch (err: any) {
      showFlash('Error removing fee: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return fees;
    const q = search.toLowerCase();
    return fees.filter(f => f.name.toLowerCase().includes(q));
  }, [fees, search]);

  if (loading) return <div className="manager-loading"><div className="spinner" /><span>Loading…</span></div>;

  return (
    <div className="manager">
      <div className="manager-toolbar">
        <div className="manager-title">
          <DollarSign size={24} />
          <div>
            <h3>One-Time Fees</h3>
            <p>Manage extra fees applicable to specific classes</p>
          </div>
        </div>
        <div style={{ display:'flex', gap:'0.75rem', alignItems:'center', flexWrap:'wrap' }}>
          <div className="manager-search-bar">
            <Search size={16} />
            <input placeholder="Search fees…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button onClick={() => { setForm({ ...EMPTY }); setEditTarget(null); setShowModal(true); }}>
            <Plus size={18} /> Define Fee
          </Button>
        </div>
      </div>

      {flash && <div className={`flash ${flash.startsWith('Error') ? 'error' : 'success'}`}>{flash}</div>}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <DollarSign size={52} />
          <p>{fees.length === 0 ? 'No extra fees defined' : 'No results found'}</p>
          <small>{fees.length === 0 ? 'Click "Define Fee" to create a new one-time fee' : ''}</small>
          {fees.length === 0 && <Button onClick={() => setShowModal(true)}><Plus size={18} /> Create First Fee</Button>}
        </div>
      ) : (
        <div className="card-grid">
          {filtered.map(f => {
            // Map class IDs to class names for display
            const assignedClasses = (f.classes || []).map(cid => {
              const c = classList.find(cls => cls.id === cid);
              return c ? c.name : 'Unknown Class';
            });
            
            return (
              <div key={f.id} className="record-card">
                <div className="record-avatar" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                  <DollarSign size={22} />
                </div>
                <div className="record-info">
                  <div className="record-name-row">
                    <h4>{f.name}</h4>
                    <span className="rec-badge" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
                      Rs {f.amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="record-meta">
                    <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                      <Calendar size={12} /> Due: {new Date(f.due_date).toLocaleDateString()}
                    </span>
                  </div>
                  {/* Classes Pills */}
                  {assignedClasses.length > 0 && (
                    <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      <BookOpen size={12} style={{ color: 'var(--text-muted)', marginTop: '2px' }} />
                      {assignedClasses.map((cname, i) => (
                        <span key={i} style={{ 
                          fontSize: '10px', 
                          background: 'var(--surface-hover)', 
                          padding: '2px 6px', 
                          borderRadius: '4px',
                          border: '1px solid var(--border)'
                        }}>
                          {cname}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {isOwner && (
                  <div className="row-actions" style={{ position: 'absolute', top: '0.75rem', right: '0.75rem' }}>
                    <button className="action-btn edit" title="Edit" onClick={() => openEdit(f)}>
                      <Edit2 size={14} />
                    </button>
                    <button className="action-btn delete" title="Remove" onClick={() => setDeleteTarget(f)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-box">
            <div className="modal-head">
              <h3>{editTarget ? 'Edit' : 'Define'} One-Time Fee</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-section-label">Fee Details</div>
              <div className="form-grid">
                <div className="span-2">
                  <Input 
                    label="Fee Title *" 
                    placeholder="e.g. Annual Sports Fee" 
                    value={form.name} 
                    onChange={e => set('name', e.target.value)} 
                    required 
                  />
                </div>
                <Input 
                  label="Amount (Rs) *" 
                  type="number" 
                  placeholder="e.g. 1000" 
                  value={form.amount} 
                  onChange={e => set('amount', e.target.value)} 
                  required 
                />
                <Input 
                  label="Due Date *" 
                  type="date" 
                  value={form.due_date} 
                  onChange={e => set('due_date', e.target.value)} 
                  required 
                />
              </div>

              <div className="form-section-label" style={{ marginTop: '0.5rem' }}>Applicable Classes *</div>
              {classList.length === 0 ? (
                <div style={{ padding: '1rem', background: 'var(--bg)', borderRadius: 'var(--radius-md)', textAlign: 'center', fontSize: 'var(--font-sm)' }}>
                  No classes found. Please create classes first.
                </div>
              ) : (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', 
                  gap: '0.5rem',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  padding: '4px'
                }}>
                  {classList.map(cls => {
                    const isChecked = form.classes.includes(cls.id);
                    return (
                      <label 
                        key={cls.id} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '6px', 
                          cursor: 'pointer',
                          padding: '0.5rem',
                          background: isChecked ? 'var(--primary-muted)' : 'var(--bg)',
                          border: `1px solid ${isChecked ? 'var(--primary)' : 'var(--border)'}`,
                          borderRadius: 'var(--radius-md)',
                          fontSize: 'var(--font-sm)',
                          transition: 'all 0.15s'
                        }}
                      >
                        <input 
                          type="checkbox" 
                          checked={isChecked} 
                          onChange={() => toggleClass(cls.id)} 
                          style={{ accentColor: 'var(--primary)', width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <span style={{ fontWeight: isChecked ? 600 : 400, color: isChecked ? 'var(--primary)' : 'var(--text)' }}>
                          {cls.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {form.classes.length > 0 && (
                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', textAlign: 'right' }}>
                  {form.classes.length} class{form.classes.length !== 1 ? 'es' : ''} selected
                </div>
              )}
            </div>
            <div className="modal-foot">
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={handleSave} isLoading={saving} disabled={!form.name.trim() || !form.amount || !form.due_date || form.classes.length === 0}>
                {editTarget ? <Edit2 size={18} /> : <Plus size={18} />} {editTarget ? 'Save Changes' : `Save Fee`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="confirm-box">
            <Trash2 size={40} color="var(--danger)" />
            <h3>Remove Fee?</h3>
            <p>This will remove <strong>{deleteTarget.name}</strong> from active extra fees.</p>
            <div className="confirm-box-btns">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete} isLoading={deleting}>Remove</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
