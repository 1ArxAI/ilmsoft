import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Role } from '../lib/supabase';
import { useFlashMessage } from '../hooks/useFlashMessage';
import { Plus, X, BookOpen, Search, Edit2, Trash2, Users, Loader2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Input }  from './ui/Input';
import '../components/managers.css';
import { isPositiveNumber } from '../lib/validation';
import './ClassesManager.css';

const DEFAULT_SUBJECTS = ['English', 'Math', 'Science', 'Urdu', 'Quran', 'Islamyat'];

type Class = {
  id: string;
  school_id: string;
  name: string;
  display_order: number;
  monthly_fee: number;
  admission_fee: number;
  active: boolean;
  subjects: string[];
  created_at: string;
};

export const ClassesManager = ({ schoolId, role }: { schoolId: string; role?: Role }) => {
  const isOwner = role === 'owner';
  const [classes, setClasses] = useState<Class[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const { flash, showFlash } = useFlashMessage(3000);
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFee, setNewFee] = useState('');
  const [newSubjects, setNewSubjects] = useState<string[]>(DEFAULT_SUBJECTS);
  const [subjectInput, setSubjectInput] = useState('');
  const [saving, setSaving] = useState(false);
  
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [editName, setEditName] = useState('');
  const [editFee, setEditFee] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editSubjects, setEditSubjects] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!schoolId?.trim()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [classRes, studentRes] = await Promise.all([
        supabase.from('classes').select('id, school_id, name, display_order, monthly_fee, admission_fee, active, subjects, created_at')
          .eq('school_id', schoolId)
          .order('display_order', { ascending: true })
          .order('name'),
        supabase.from('students').select('admission_class_id')
          .eq('school_id', schoolId)
          .eq('active', true)
      ]);
      
      if (classRes.error) throw classRes.error;
      if (studentRes.error) throw studentRes.error;
      
      setClasses(classRes.data || []);
      // Count students per class
      const counts: Record<string, number> = {};
      (studentRes.data || []).forEach(s => {
        if (s.admission_class_id) {
          counts[s.admission_class_id] = (counts[s.admission_class_id] || 0) + 1;
        }
      });
      setStudentCounts(counts);
    } catch (err: any) {
      showFlash('Error loading classes: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => { 
    load(); 
  }, [load]);

  const handleAdd = useCallback(async () => {
    if (!newName.trim()) {
      showFlash('Please enter a class name');
      return;
    }
    if (!isPositiveNumber(newFee)) {
      showFlash('Please enter a valid positive fee amount (maximum Rs 999,999,999)');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('classes').insert({
        school_id: schoolId,
        name: newName.trim(),
        monthly_fee: parseInt(newFee, 10),
        admission_fee: 0,
        display_order: classes.length + 1,
        active: true,
        subjects: newSubjects
      });
      if (error) {
        showFlash('Error: ' + error.message);
      } else {
        showFlash('Class added!');
        setNewName('');
        setNewFee('');
        setNewSubjects(DEFAULT_SUBJECTS);
        setShowAddModal(false);
        load();
      }
    } catch (err: any) {
      showFlash('Error adding class: ' + err.message);
    } finally {
      setSaving(false);
    }
  }, [newName, newFee, newSubjects, schoolId, classes.length, showFlash, load]);

  const handleEdit = useCallback(async () => {
    if (!editingClass || !editName.trim()) {
      showFlash('Please enter a class name');
      return;
    }
    if (!isPositiveNumber(editFee)) {
      showFlash('Please enter a valid positive fee amount (maximum Rs 999,999,999)');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('classes').update({
        name: editName.trim(),
        monthly_fee: parseInt(editFee, 10),
        active: editActive,
        subjects: editSubjects
      }).eq('id', editingClass.id);
      if (error) {
        showFlash('Error: ' + error.message);
      } else {
        showFlash('Class updated!');
        setEditingClass(null);
        load();
      }
    } catch (err: any) {
      showFlash('Error updating class: ' + err.message);
    } finally {
      setSaving(false);
    }
  }, [editingClass, editName, editFee, editActive, editSubjects, showFlash, load]);

  const handleDelete = (id: string) => {
    // Check if class has students before allowing deletion
    if ((studentCounts[id] || 0) > 0) {
      showFlash('Error: Cannot delete class with enrolled students. Please move students to another class first.');
      return;
    }
    
    setConfirmAction({
      message: 'Delete this class?',
      onConfirm: async () => {
        setDeletingId(id);
        const { error } = await supabase.from('classes').delete().eq('id', id);
        if (error) {
          showFlash('Error: ' + error.message);
        } else {
          showFlash('Class deleted!');
          load();
        }
        setDeletingId(null);
        setConfirmAction(null);
      }
    });
  };

  const openEdit = (c: Class) => {
    setEditingClass(c);
    setEditName(c.name);
    setEditFee(c.monthly_fee.toString());
    setEditActive(c.active);
    setEditSubjects(c.subjects || []);
    setSubjectInput('');
  };

  const addSubject = (current: string[], set: (s: string[]) => void) => {
    if (!subjectInput.trim()) return;
    if (current.includes(subjectInput.trim())) return;
    set([...current, subjectInput.trim()]);
    setSubjectInput('');
  };

  const removeSubject = (current: string[], set: (s: string[]) => void, subject: string) => {
    set(current.filter(s => s !== subject));
  };

  const filtered = search.trim()
    ? classes.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : classes;

  if (loading) return <div className="manager-loading"><div className="spinner" /><span>Loading…</span></div>;

  return (
    <div className="manager">
      <div className="manager-toolbar">
        <div className="manager-title">
          <BookOpen size={24} />
          <div>
            <h3></h3>
            <p>{classes.length} class{classes.length !== 1 ? 'es' : ''} registered</p>
          </div>
        </div>
        <div style={{ display:'flex', gap:'0.75rem', alignItems:'center' }}>
          <div className="manager-search-bar">
            <Search size={16} />
            <input placeholder="Search classes…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {isOwner && (
            <Button onClick={() => { 
              setNewName(''); 
              setNewFee(''); 
              setNewSubjects(DEFAULT_SUBJECTS);
              setSubjectInput('');
              setShowAddModal(true); 
            }}>
              <Plus size={18} /> Add Class
            </Button>
          )}
        </div>
      </div>

      {flash && <div className={`flash ${flash.startsWith('Error') ? 'error' : 'success'}`}>{flash}</div>}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={52} />
          <p>{classes.length === 0 ? 'No classes yet' : 'No results found'}</p>
          <small>{classes.length === 0 ? 'Add your first class using the button above' : ''}</small>
          {classes.length === 0 && isOwner && <Button onClick={() => setShowAddModal(true)}><Plus size={18} /> Add First Class</Button>}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Class Name</th>
                <th>Monthly Fee</th>
                <th># of Students</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className={c.active ? '' : 'inactive'}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div className="class-subjects-list">
                      {(c.subjects || []).join(', ')}
                    </div>
                  </td>
                  <td>Rs {c.monthly_fee.toLocaleString()}</td>
                  <td><Users size={14} style={{marginRight:4}}/>{studentCounts[c.id] || 0}</td>
                  <td>
                    <span className={`status-badge ${c.active ? 'active' : 'inactive'}`}>
                      {c.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    {isOwner && (
                      <div className="row-actions">
                        <button className="action-btn edit" title="Edit" onClick={() => openEdit(c)}>
                          <Edit2 size={14} />
                        </button>
                        <button className="action-btn delete" title="Delete" onClick={() => handleDelete(c.id)} disabled={deletingId === c.id}>
                          {deletingId === c.id ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="modal-box">
            <div className="modal-head">
              <h3>Add New Class</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="span-2">
                  <Input label="Class Name *" placeholder="e.g. Class 5, Grade 8" value={newName} onChange={e => setNewName(e.target.value)} required />
                </div>
                <div className="span-2">
                  <Input label="Monthly Fee (Rs) *" placeholder="e.g. 1500" inputMode="numeric" pattern="[0-9]*" value={newFee} onChange={e => setNewFee(e.target.value)} required />
                </div>
                <div className="span-2">
                  <label className="form-label">Subjects Management</label>
                  <div className="subject-tag-input-wrap">
                    <div className="subject-tags">
                      {newSubjects.map(s => (
                        <span key={s} className="subject-tag">
                          {s} <X size={12} onClick={() => removeSubject(newSubjects, setNewSubjects, s)} />
                        </span>
                      ))}
                    </div>
                    <div className="subject-input-row">
                      <input 
                        className="form-input" 
                        placeholder="Type a subject and press Enter..." 
                        value={subjectInput}
                        onChange={e => setSubjectInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addSubject(newSubjects, setNewSubjects)}
                      />
                      <Button size="sm" onClick={() => addSubject(newSubjects, setNewSubjects)}>Add</Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button onClick={handleAdd} isLoading={saving} disabled={!newName.trim() || !newFee.trim()}>
                <Plus size={18} /> Add Class
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingClass && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setEditingClass(null)}>
          <div className="modal-box">
            <div className="modal-head">
              <h3>Edit Class</h3>
              <button className="modal-close" onClick={() => setEditingClass(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="span-2">
                  <Input label="Class Name *" value={editName} onChange={e => setEditName(e.target.value)} required />
                </div>
                <div>
                  <Input label="Monthly Fee (Rs) *" inputMode="numeric" pattern="[0-9]*" value={editFee} onChange={e => setEditFee(e.target.value)} required />
                </div>
                <div className="span-2">
                  <label className="form-label">Subjects Management</label>
                  <div className="subject-tag-input-wrap">
                    <div className="subject-tags">
                      {editSubjects.map(s => (
                        <span key={s} className="subject-tag">
                          {s} <X size={12} onClick={() => removeSubject(editSubjects, setEditSubjects, s)} />
                        </span>
                      ))}
                    </div>
                    <div className="subject-input-row">
                      <input 
                        className="form-input" 
                        placeholder="Add more subjects..." 
                        value={subjectInput}
                        onChange={e => setSubjectInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addSubject(editSubjects, setEditSubjects)}
                      />
                      <Button size="sm" onClick={() => addSubject(editSubjects, setEditSubjects)}>Add</Button>
                    </div>
                  </div>
                </div>
                <div className="span-2">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={editActive ? 'true' : 'false'} onChange={e => setEditActive(e.target.value === 'true')}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <Button variant="secondary" onClick={() => setEditingClass(null)}>Cancel</Button>
              <Button onClick={handleEdit} isLoading={saving} disabled={!editName.trim() || !editFee.trim()}>
                <Edit2 size={14} /> Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <div className="modal-backdrop" onClick={() => setConfirmAction(null)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <Trash2 size={40} color="var(--danger)" />
            <h3>{confirmAction.message}</h3>
            <div className="confirm-box-btns">
              <Button variant="secondary" onClick={() => setConfirmAction(null)}>Cancel</Button>
              <Button variant="danger" onClick={confirmAction.onConfirm}>Confirm</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
