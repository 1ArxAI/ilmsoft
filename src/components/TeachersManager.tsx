import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Role } from '../lib/supabase';
import { useFlashMessage } from '../hooks/useFlashMessage';
import {
  Plus, X, GraduationCap, Briefcase, Phone,
  MapPin, Search, Trash2, Edit2
} from 'lucide-react';
import { Button } from './ui/Button';
import { Input }  from './ui/Input';
import { isValidCNIC } from '../lib/validation';
import '../components/managers.css';

type Teacher = {
  id: string; school_id: string; name: string;
  type: 'Teacher' | 'Staff'; cnic: string; gender: string;
  personal_contact: string; home_contact: string; address: string;
  education: string; salary: number; notes: string;
};

const EMPTY = {
  name: '', type: 'Teacher' as 'Teacher' | 'Staff', gender: 'Male',
  cnic: '', personal_contact: '', home_contact: '',
  address: '', education: '', salary: '', notes: '',
};

export const TeachersManager = ({ schoolId, role }: { schoolId: string; role?: Role }) => {
  const isOwner = role === 'owner';
  const [records, setRecords]       = useState<Teacher[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [form, setForm]             = useState({ ...EMPTY });
  const [saving, setSaving]         = useState(false);
  const { flash, showFlash }         = useFlashMessage(4000);
  const [search, setSearch]         = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Teacher | null>(null);
  const [editTarget, setEditTarget] = useState<Teacher | null>(null);
  const [deleting, setDeleting]     = useState(false);
  const [cnicError, setCnicError]   = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('teachers').select('id, school_id, name, type, cnic, gender, personal_contact, home_contact, address, education, salary, notes')
        .eq('school_id', schoolId).eq('is_active', true).order('type').order('name');
      if (error) throw error;
      setRecords(data || []);
    } catch (err: any) {
      showFlash('Error loading teachers: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [schoolId]);

  const set = (k: string, v: string) => {
    setForm(f => ({ ...f, [k]: v }));
    if (k === 'cnic') setCnicError('');
  };

  const openEdit = (teacher: Teacher) => {
    setEditTarget(teacher);
    setForm({
      name: teacher.name,
      type: teacher.type,
      gender: teacher.gender,
      cnic: teacher.cnic || '',
      personal_contact: teacher.personal_contact || '',
      home_contact: teacher.home_contact || '',
      address: teacher.address || '',
      education: teacher.education || '',
      salary: teacher.salary ? String(teacher.salary) : '',
      notes: teacher.notes || '',
    });
    setCnicError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.personal_contact.trim()) return;
    
    // Validate CNIC format if provided
    if (form.cnic && !isValidCNIC(form.cnic)) {
      setCnicError('Invalid CNIC format. Use XXXXX-XXXXXXX-X (e.g., 12345-1234567-1)');
      return;
    }
    
    setSaving(true);
    let error;
    if (editTarget) {
      const { error: err } = await supabase.from('teachers').update({
        ...form, salary: parseInt(form.salary) || 0,
      }).eq('id', editTarget.id);
      error = err;
    } else {
      const { error: err } = await supabase.from('teachers').insert({
        school_id: schoolId, is_active: true,
        ...form, salary: parseInt(form.salary) || 0,
      });
      error = err;
    }
    setSaving(false);
    if (error) { showFlash('Error: ' + error.message); }
    else       { showFlash(`${form.type} "${form.name}" ${editTarget ? 'updated' : 'added'}!`); setShowModal(false); setForm({ ...EMPTY }); setCnicError(''); setEditTarget(null); load(); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('teachers').update({ is_active: false }).eq('id', deleteTarget.id);
      if (error) throw error;
      showFlash(`${deleteTarget.type} "${deleteTarget.name}" removed successfully`);
      setDeleteTarget(null);
      load();
    } catch (err: any) {
      showFlash('Error removing ' + deleteTarget.type.toLowerCase() + ': ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter(r => r.name.toLowerCase().includes(q) || r.personal_contact?.includes(q));
  }, [records, search]);

  const counts = { Teacher: records.filter(r => r.type === 'Teacher').length, Staff: records.filter(r => r.type === 'Staff').length };

  if (loading) return <div className="manager-loading"><div className="spinner" /><span>Loading…</span></div>;

  return (
    <div className="manager">
      <div className="manager-toolbar">
        <div className="manager-title">
          <GraduationCap size={24} />
          <div>
            <h3></h3>
            <p>{counts.Teacher} Teachers · {counts.Staff} Staff</p>
          </div>
        </div>
        <div style={{ display:'flex', gap:'0.75rem', alignItems:'center', flexWrap:'wrap' }}>
          <div className="manager-search-bar">
            <Search size={16} />
            <input placeholder="Search by name…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button onClick={() => { setForm({ ...EMPTY }); setEditTarget(null); setShowModal(true); }}>
            <Plus size={18} /> Add Person
          </Button>
        </div>
      </div>

      {flash && <div className={`flash ${flash.startsWith('Error') ? 'error' : 'success'}`}>{flash}</div>}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <GraduationCap size={52} />
          <p>{records.length === 0 ? 'No teachers or staff yet' : 'No results found'}</p>
          <small>{records.length === 0 ? 'Click "Add Person" to register your first teacher or staff member' : ''}</small>
          {records.length === 0 && <Button onClick={() => setShowModal(true)}><Plus size={18} /> Add First Person</Button>}
        </div>
      ) : (
        <div className="card-grid">
          {filtered.map(r => (
            <div key={r.id} className="record-card">
              <div className="record-avatar">{r.name.charAt(0).toUpperCase()}</div>
              <div className="record-info">
                <div className="record-name-row">
                  <h4>{r.name}</h4>
                  <span className={`rec-badge ${r.type.toLowerCase()}`}>{r.type}</span>
                </div>
                <div className="record-meta">
                  <span><Phone size={12} /> {r.personal_contact}</span>
                  {r.cnic      && <span>CNIC: {r.cnic}</span>}
                  {r.education && <span><GraduationCap size={12} /> {r.education}</span>}
                  {r.salary > 0 && <span>Rs {r.salary.toLocaleString()}/mo</span>}
                  {r.address   && <span><MapPin size={12} /> {r.address}</span>}
                </div>
              </div>
              {isOwner && (
                <div className="row-actions" style={{ position: 'absolute', top: '0.75rem', right: '0.75rem' }}>
                  <button className="action-btn edit" title="Edit" onClick={() => openEdit(r)}>
                    <Edit2 size={14} />
                  </button>
                  <button className="action-btn delete" title="Remove" onClick={() => setDeleteTarget(r)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-box">
            <div className="modal-head">
              <h3>{editTarget ? 'Edit' : 'Add'} Teacher / Staff</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {/* Type */}
              <div>
                <div className="form-section-label">Type *</div>
                <div className="type-pills" style={{ marginTop:'0.625rem' }}>
                  {(['Teacher','Staff'] as const).map(t => (
                    <button key={t} type="button"
                      className={`type-pill${form.type === t ? ' active' : ''}`}
                      onClick={() => set('type', t)}>
                      {t === 'Teacher' ? <GraduationCap size={14} /> : <Briefcase size={14} />} {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Required */}
              <div className="form-section-label">Basic Information</div>
              <div className="form-grid">
                <div className="span-2">
                  <Input label="Full Name *" placeholder="Enter full name" value={form.name} onChange={e => set('name', e.target.value)} required />
                </div>
                <Input label="Contact Number *" placeholder="03XX-XXXXXXX" value={form.personal_contact} onChange={e => set('personal_contact', e.target.value)} required />
                <Input label="Home Contact" placeholder="03XX-XXXXXXX" value={form.home_contact} onChange={e => set('home_contact', e.target.value)} />
              </div>

              {/* Optional */}
              <div className="form-section-label">Additional Details</div>
              <div className="form-grid">
                <div>
                  <label className="form-label">Gender</label>
                  <select className="form-select" value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <option>Male</option><option>Female</option>
                  </select>
                </div>
                <Input 
                  label="CNIC" 
                  placeholder="XXXXX-XXXXXXX-X" 
                  value={form.cnic} 
                  onChange={e => set('cnic', e.target.value)}
                  error={cnicError}
                />
                <Input label="Education" placeholder="e.g. BA, BEd, MSc" value={form.education} onChange={e => set('education', e.target.value)} />
                <Input label="Monthly Salary (Rs)" type="number" placeholder="e.g. 25000" value={form.salary || ''} onChange={e => set('salary', String(parseInt(e.target.value) || 0))} />
                <div className="span-2">
                  <label className="form-label">Address</label>
                  <textarea className="form-textarea" rows={2} placeholder="Full address" value={form.address} onChange={e => set('address', e.target.value)} />
                </div>
                <div className="span-2">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" rows={2} placeholder="Any additional notes…" value={form.notes} onChange={e => set('notes', e.target.value)} />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={handleSave} isLoading={saving} disabled={!form.name.trim() || !form.personal_contact.trim()}>
                {editTarget ? <Edit2 size={18} /> : <Plus size={18} />} {editTarget ? 'Save Changes' : `Save ${form.type}`}
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
            <h3>Remove {deleteTarget.type}?</h3>
            <p>This will remove <strong>{deleteTarget.name}</strong> from your records.</p>
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
