import { useState, useMemo, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Role } from '../lib/supabase';
import { useFlashMessage } from '../hooks/useFlashMessage';
import { useDebounce } from '../hooks/useDebounce';
import { GraduationCap, Search, Settings, Plus, Trash2, Check, BookOpen, ChevronLeft, ChevronRight, UserCheck } from 'lucide-react';
import { Button } from './ui/Button';
import { useStudents } from '../hooks/useStudents';
import type { Student } from '../hooks/useStudents';
import { isValidCNIC } from '../lib/validation';

// New Sub-components
import { StudentStats } from './students/StudentStats';
import { StudentTable } from './students/StudentTable';
import { StudentModal } from './students/StudentModal';

import './managers.css';

const EMPTY_FORM = {
  parent_id: '', first_name: '', last_name: '', cnic: '', gender: 'Boy' as 'Boy' | 'Girl',
  date_of_birth: '', date_of_admission: new Date().toISOString().split('T')[0],
  admission_class_id: '', current_class_id: '', monthly_fee: 0,
  discount_type: '', discount_value: 0, active: true,
};

const PAGE_SIZE = 25;

export const StudentsManager = ({ schoolId, role }: { schoolId: string; role?: Role }) => {
  const isOwner = !role || role === 'owner';
  const { flash, showFlash } = useFlashMessage();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    admissionClass: true, currentClass: true, fee: true,
    discount: true, monthlyFee: true, actions: true,
    gender: false, cnic: false, dob: false
  });

  const { students, classes, parents, loading, stats, load } = useStudents(schoolId, showFlash);

  const toggleColumn = (col: string) => setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));



  const set = (k: string, v: any) => {
    setForm(prev => {
      const newForm = { ...prev, [k]: v };
      if (k === 'admission_class_id') {
        const cls = classes.find(c => c.id === v);
        newForm.monthly_fee = cls ? cls.monthly_fee : 0;
        newForm.discount_type = ''; newForm.discount_value = 0;
        if (!editStudent) newForm.current_class_id = v as string;
      }
      return newForm;
    });
  };

  const openAdd = () => { setForm({ ...EMPTY_FORM }); setEditStudent(null); setShowModal(true); };
  const openEdit = useCallback((s: Student) => {
    setEditStudent(s);
    setForm({
      parent_id: s.parent_id, first_name: s.first_name, last_name: s.last_name,
      cnic: s.cnic || '', gender: s.gender || 'Boy', date_of_birth: s.date_of_birth || '',
      date_of_admission: s.date_of_admission || new Date().toISOString().split('T')[0],
      admission_class_id: s.admission_class_id || '',
      current_class_id: s.current_class_id || s.admission_class_id || '',
      monthly_fee: s.monthly_fee, discount_type: s.discount_type || '', discount_value: s.discount_value || 0,
      active: s.active,
    });
    setShowModal(true);
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('students').update({ active: false }).eq('id', deleteTarget.id);
      if (error) throw error;
      showFlash(`Student "${deleteTarget.first_name}" deactivated`);
      setDeleteTarget(null); load();
    } catch (err: any) {
      showFlash('Error: ' + err.message);
    } finally { setDeleting(false); }
  };

  const handleSave = async () => {
    if (!form.parent_id || !form.first_name.trim() || !form.last_name.trim()) {
      showFlash('Error: Parent and basic info are required'); return;
    }
    if (form.cnic && !isValidCNIC(form.cnic)) { showFlash('Error: Invalid CNIC format'); return; }
    setSaving(true);
    const net_monthly_fee = form.discount_type && form.discount_value !== null
        ? (form.discount_type === 'percentage' ? Math.round((form.monthly_fee || 0) * (100 - (form.discount_value || 0)) / 100) : Math.max(0, (form.monthly_fee || 0) - (form.discount_value || 0)))
        : (form.monthly_fee || 0);
    const payload = {
      school_id: schoolId, parent_id: form.parent_id, first_name: form.first_name.trim(), last_name: form.last_name.trim(),
      cnic: form.cnic.trim() || null, gender: form.gender, date_of_birth: form.date_of_birth || null,
      date_of_admission: form.date_of_admission || null, admission_class_id: form.admission_class_id || null,
      current_class_id: form.current_class_id || form.admission_class_id || null,
      monthly_fee: form.monthly_fee || 0, current_monthly_fee: net_monthly_fee,
      discount_type: form.discount_type || null, discount_value: form.discount_value || null, active: form.active,
    };
    try {
      const { error } = editStudent ? await supabase.from('students').update(payload).eq('id', editStudent.id) : await supabase.from('students').insert(payload);
      if (error) throw error;
      showFlash(`Student successfully ${editStudent ? 'updated' : 'added'}!`);
      setShowModal(false); load();
    } catch (err: any) { showFlash('Error: ' + err.message); } finally { setSaving(false); }
  };

  const getParentName = useCallback((parentId: string) => {
    const p = parents.find(x => x.id === parentId);
    return p ? `${p.first_name} ${p.last_name}` : '—';
  }, [parents]);

  const getClassName = useCallback((classId: string | null) => {
    const c = classes.find(x => x.id === classId);
    return c ? c.name : '—';
  }, [classes]);

  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return students;
    const q = debouncedSearch.toLowerCase();
    return students.filter(s =>
      s.first_name.toLowerCase().includes(q) || s.last_name.toLowerCase().includes(q) ||
      (s.cnic && s.cnic.includes(q)) || getParentName(s.parent_id).toLowerCase().includes(q) ||
      getClassName(s.current_class_id || s.admission_class_id).toLowerCase().includes(q)
    );
  }, [students, debouncedSearch, parents, classes]);

  const totalPages = useMemo(() => Math.ceil(filtered.length / PAGE_SIZE), [filtered]);
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE; return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => setPage(1), [debouncedSearch]);

  if (loading) return <div className="manager-loading"><div className="spinner" /><span>Loading…</span></div>;

  return (
    <div className="manager">
      <div className="manager-toolbar">
        <div className="manager-title">
          <GraduationCap size={24} />
          <div>
            <h3>Students Management</h3>
            <p>{students.length} student{students.length !== 1 ? 's' : ''} in database</p>
          </div>
        </div>
        <div style={{ display:'flex', gap:'0.75rem', alignItems:'center', flexWrap:'wrap' }}>
          <div className="manager-search-bar">
            <Search size={16} />
            <input placeholder="Search by name, CNIC, parent or class…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div style={{ position: 'relative' }}>
            <Button variant="outline" onClick={() => setShowColumnSettings(!showColumnSettings)}>
              <Settings size={18} /> Columns
            </Button>
            {showColumnSettings && (
              <div className="column-settings-popover">
                <div className="popover-title">Show / Hide Columns</div>
                {[
                  { id: 'admissionClass', label: 'Admission Class', icon: BookOpen },
                  { id: 'currentClass', label: 'Current Class', icon: BookOpen },
                  { id: 'fee', label: 'Class Fee (Gross)', icon: Search },
                  { id: 'discount', label: 'Discount', icon: Search },
                  { id: 'monthlyFee', label: 'Monthly Fee (Net)', icon: Search },
                  { id: 'gender', label: 'Gender', icon: UserCheck },
                  { id: 'cnic', label: 'CNIC', icon: Search },
                  { id: 'dob', label: 'Date of Birth', icon: Search }
                ].map(col => (
                  <div key={col.id} onClick={() => toggleColumn(col.id)} className={`popover-item ${visibleColumns[col.id] ? 'active' : ''}`}>
                    <col.icon size={14} /> <span>{col.label}</span> {visibleColumns[col.id] && <Check size={14} />}
                  </div>
                ))}
              </div>
            )}
          </div>
          {isOwner && <Button onClick={openAdd}><Plus size={18} /> Add Student</Button>}
        </div>
      </div>

      <StudentStats stats={stats} />

      {flash && <div className={`flash ${flash.startsWith('Error') ? 'error' : 'success'}`}>{flash}</div>}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <GraduationCap size={52} />
          <p>{students.length === 0 ? 'No students enrolled yet' : 'No results found'}</p>
          {students.length === 0 && <Button onClick={openAdd}><Plus size={18} /> Add First Student</Button>}
        </div>
      ) : (
        <>
          <StudentTable 
            students={paginated} visibleColumns={visibleColumns} isOwner={isOwner} 
            getClassName={getClassName} getParentName={getParentName}
            onEdit={openEdit} onDelete={setDeleteTarget}
          />

          {totalPages > 1 && (
            <div className="pagination">
              <span className="pagination-info">
                Showing {(page-1)*PAGE_SIZE + 1}–{Math.min(page*PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="pagination-controls">
                <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p-1)}><ChevronLeft size={16} /></button>
                {Array.from({ length: totalPages }, (_, i) => i+1).map(p => (
                  <button key={p} className={`page-btn${p === page ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p+1)}><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </>
      )}

      {showModal && (
        <StudentModal 
          form={form} set={set} editStudent={editStudent} classes={classes} 
          parents={parents} saving={saving} onClose={() => setShowModal(false)}
          onSave={handleSave} getParentName={getParentName}
        />
      )}

      {deleteTarget && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="confirm-box">
            <Trash2 size={40} color="var(--danger)" />
            <h3>Remove Student?</h3>
            <p>This will permanently remove <strong>{deleteTarget.first_name} {deleteTarget.last_name}</strong> from enrollment records.</p>
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
