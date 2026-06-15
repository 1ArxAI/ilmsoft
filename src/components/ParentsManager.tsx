import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Role } from '../lib/supabase';
import { useFlashMessage } from '../hooks/useFlashMessage';
import { useDebounce } from '../hooks/useDebounce';
import { isValidPhone } from '../lib/validation';
import { Trash2, Plus, Users, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useParents } from '../hooks/useParents';
import type { Parent } from '../hooks/useParents';
import { Button } from './ui/Button';

// New Sub-components
import { ParentStats } from './parents/ParentStats';
import { ParentTable } from './parents/ParentTable';
import { ParentModal } from './parents/ParentModal';
import { ChildModal } from './parents/ChildModal';
import { ParentDetailView } from './parents/ParentDetailView';

import '../components/managers.css';

const EMPTY = {
  first_name: '', last_name: '', cnic: '', contact: '', address: '', notes: '', initial_balance: '',
};
const EMPTY_STUDENT = { first_name: '', last_name: '', cnic: '', date_of_birth: '', date_of_admission: new Date().toISOString().split('T')[0], admission_class_id: '', monthly_fee: 0, discount_type: '', discount_value: 0 };

const PAGE_SIZE = 25;

export const ParentsManager = ({ schoolId, role }: { schoolId: string; role?: Role }) => {
  const isOwner = !role || role === 'owner';
  const { flash, showFlash } = useFlashMessage(4000);
  
  const {
    records, loading, classes,
    studentCounts, monthlyTotals, discountTotals,
    parentStats, load, loadClasses
  } = useParents(schoolId, showFlash);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [deleteTarget, setDeleteTarget] = useState<Parent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cnicError, setCnicError] = useState('');
  const [page, setPage] = useState(1);
  const [editTarget, setEditTarget] = useState<Parent | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showChildModal, setShowChildModal] = useState(false);
  const [selectedParentForChild, setSelectedParentForChild] = useState<Parent | null>(null);
  const [childForm, setChildForm] = useState({ ...EMPTY_STUDENT });
  const [savingChild, setSavingChild] = useState(false);
  const [viewTarget, setViewTarget] = useState<Parent | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  const set = (k: string, v: string) => {
    setForm(f => ({ ...f, [k]: v }));
    if (k === 'cnic') setCnicError('');
  };

  const setChild = (k: string, v: string | number) => {
    const newForm = { ...childForm, [k]: v };
    if (k === 'admission_class_id') {
      const cls = classes.find(c => c.id === v);
      newForm.monthly_fee = cls ? cls.monthly_fee : 0;
      
      newForm.discount_type = '';
      newForm.discount_value = 0;
    }
    setChildForm(newForm);
  };

  const getFinalFee = () => {
    if (!childForm.discount_type || !childForm.discount_value) return childForm.monthly_fee;
    if (childForm.discount_type === 'percentage') {
      return Math.round(childForm.monthly_fee * (1 - childForm.discount_value / 100));
    }
    return Math.max(0, childForm.monthly_fee - childForm.discount_value);
  };

  const validateCnic = async (cnic: string, excludeId?: string): Promise<boolean> => {
    if (!cnic.trim()) return false;
    let query = supabase.from('parents').select('id').eq('school_id', schoolId).eq('cnic', cnic);
    if (excludeId) query = query.neq('id', excludeId);
    const { data } = await query.maybeSingle();
    return data === null;
  };

  const handleSave = async () => {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.contact.trim() || !form.cnic.trim()) {
      showFlash('Error: First name, last name, CNIC and contact are required');
      return;
    }
    // Validate phone format
    if (form.contact && !isValidPhone(form.contact)) {
      showFlash('Error: Contact number must be a valid Pakistani mobile number (e.g., 03XX-XXXXXXX or 03XXXXXXXXX)');
      return;
    }
    const cnicValid = await validateCnic(form.cnic);
    if (!cnicValid) {
      setCnicError('A parent with this CNIC already exists');
      return;
    }
    setSaving(true);
    const balNum = Number(form.initial_balance) || 0;
    const { data: newParent, error } = await supabase.from('parents').insert({
      school_id: schoolId,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      cnic: form.cnic.trim(),
      contact: form.contact.trim(),
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    }).select('id').single();

    if (newParent && !error && balNum !== 0) {
      await supabase.from('ledger').insert({
         school_id: schoolId,
         parent_id: newParent.id,
         entry_type: balNum > 0 ? 'debit' : 'credit',
         amount: Math.abs(balNum),
         reference_type: 'opening_balance',
         description: 'Opening Balance'
      });
    }

    setSaving(false);
    if (error) {
      if (error.message.includes('unique') || error.message.includes('duplicate')) {
        setCnicError('A parent with this CNIC already exists');
      } else {
        showFlash('Error: ' + error.message);
      }
    } else {
      showFlash('Parent "' + form.first_name + ' ' + form.last_name + '" added!');
      setShowModal(false);
      setForm({ ...EMPTY });
      setCnicError('');
      load();
    }
  };

  const openEdit = useCallback(async (parent: Parent) => {
    setEditTarget(parent);
    setForm({
      first_name: parent.first_name,
      last_name: parent.last_name,
      cnic: parent.cnic,
      contact: parent.contact,
      address: parent.address || '',
      notes: parent.notes || '',
      initial_balance: ''
    });
    setCnicError('');
    setShowEditModal(true);

    const { data } = await supabase.from('ledger').select('amount, entry_type').eq('parent_id', parent.id).eq('reference_type', 'opening_balance').maybeSingle();
    if (data) {
      setForm(prev => ({ ...prev, initial_balance: data.entry_type === 'debit' ? String(data.amount) : String(-data.amount) }));
    }
  }, []);

  const handleEdit = async () => {
    if (!editTarget) return;
    if (!form.first_name.trim() || !form.last_name.trim() || !form.contact.trim() || !form.cnic.trim()) {
      showFlash('Error: All fields are required');
      return;
    }
    const cnicValid = await validateCnic(form.cnic, editTarget.id);
    if (!cnicValid) {
      setCnicError('A parent with this CNIC already exists');
      return;
    }
    setSaving(true);
    const balNum = Number(form.initial_balance) || 0;
    const { error } = await supabase.from('parents').update({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      cnic: form.cnic.trim(),
      contact: form.contact.trim(),
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    }).eq('id', editTarget.id);
    
    if (!error) {
       await supabase.from('ledger').delete().eq('parent_id', editTarget.id).eq('reference_type', 'opening_balance');
       if (balNum !== 0) {
         await supabase.from('ledger').insert({
           school_id: schoolId,
           parent_id: editTarget.id,
           entry_type: balNum > 0 ? 'debit' : 'credit',
           amount: Math.abs(balNum),
           reference_type: 'opening_balance',
           description: 'Opening Balance'
         });
       }
    }
    setSaving(false);
    if (error) {
      if (error.message.includes('unique') || error.message.includes('duplicate')) {
        setCnicError('A parent with this CNIC already exists');
      } else {
        showFlash('Error: ' + error.message);
      }
    } else {
      showFlash('Parent "' + form.first_name + ' ' + form.last_name + '" updated!');
      setShowEditModal(false);
      if (viewTarget && viewTarget.id === editTarget.id) {
        setViewTarget({
          ...viewTarget,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          cnic: form.cnic.trim(),
          contact: form.contact.trim(),
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
        });
        setRefreshCount(prev => prev + 1);
      }
      setEditTarget(null);
      setForm({ ...EMPTY });
      setCnicError('');
      load();
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // Soft-delete: deactivate parent and their students
      const { error } = await supabase.from('parents').update({ is_active: false }).eq('id', deleteTarget.id);
      if (error) {
        showFlash('Error deactivating parent: ' + error.message);
      } else {
        // Also deactivate all their students
        await supabase.from('students').update({ active: false }).eq('parent_id', deleteTarget.id);
        showFlash(`Parent "${deleteTarget.first_name} ${deleteTarget.last_name}" deactivated`);
        setDeleteTarget(null);
        setViewTarget(null);
        load();
      }
    } catch (err: any) {
      showFlash('Error: ' + (err.message || 'Failed to deactivate parent'));
    } finally {
      setDeleting(false);
    }
  };

  const openAddChild = useCallback((parent: Parent) => {
    setSelectedParentForChild(parent);
    setChildForm({ ...EMPTY_STUDENT });
    loadClasses();
    setShowChildModal(true);
  }, [loadClasses]);

  const handleSaveChild = async () => {
    if (!selectedParentForChild || !childForm.first_name.trim() || !childForm.last_name.trim()) {
      showFlash('Error: First name and last name are required');
      return;
    }
    setSavingChild(true);
    
    // Calculate final monthly fee for revenue integrity
    const net_monthly_fee = childForm.discount_type && childForm.discount_value
        ? (childForm.discount_type === 'percentage' 
            ? Math.round(childForm.monthly_fee * (100 - childForm.discount_value) / 100) 
            : Math.max(0, childForm.monthly_fee - childForm.discount_value))
        : childForm.monthly_fee;

    const { error } = await supabase.from('students').insert({
      school_id: schoolId,
      parent_id: selectedParentForChild.id,
      first_name: childForm.first_name.trim(),
      last_name: childForm.last_name.trim(),
      cnic: childForm.cnic.trim() || null,
      date_of_birth: childForm.date_of_birth || null,
      date_of_admission: childForm.date_of_admission || null,
      admission_class_id: childForm.admission_class_id || null,
      current_class_id: childForm.admission_class_id || null, // Ensure current_class is set
      monthly_fee: childForm.monthly_fee,
      current_monthly_fee: net_monthly_fee, // Explicitly save net fee
      discount_type: childForm.discount_type || null,
      discount_value: childForm.discount_value || null,
      active: true,
    });
    setSavingChild(false);
    if (error) {
      showFlash('Error: ' + error.message);
    } else {
      showFlash('Student "' + childForm.first_name + ' ' + childForm.last_name + '" added for ' + selectedParentForChild.first_name + '!');
      setShowChildModal(false);
      setChildForm({ ...EMPTY_STUDENT });
      const parentId = selectedParentForChild.id;
      setSelectedParentForChild(null);
      load();
      if (viewTarget && viewTarget.id === parentId) {
        setRefreshCount(prev => prev + 1);
      }
    }
  };

  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return records;
    const q = debouncedSearch.toLowerCase();
    return records.filter(r =>
      (r.first_name || '').toLowerCase().includes(q) ||
      (r.last_name || '').toLowerCase().includes(q) ||
      (r.cnic || '').includes(q) ||
      (r.contact || '').includes(q)
    );
  }, [records, debouncedSearch]);

  const totalPages = useMemo(() => Math.ceil(filtered.length / PAGE_SIZE), [filtered]);
  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  // Reset page when search changes
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  if (loading) return <div className="manager-loading"><div className="spinner" /><span>Loading...</span></div>;

  return (
    <div className="manager">
      {!viewTarget && (
        <div className="manager-toolbar">
          <div className="manager-title">
            <Users size={24} />
            <div>
              <h3>Families & Beneficiaries</h3>
              <p>{records.length} {records.length === 1 ? 'parent' : 'parents'} registered across all classes</p>
            </div>
          </div>
          <div style={{ display:'flex', gap:'0.75rem', alignItems:'center', flexWrap:'wrap' }}>
            <div className="manager-search-bar">
              <Search size={16} />
              <input placeholder="Search by name, CNIC or contact..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button onClick={() => { setForm({ ...EMPTY }); setCnicError(''); setShowModal(true); }}>
              <Plus size={18} /> Add Parent
            </Button>
          </div>
        </div>
      )}

      {viewTarget ? (
        <ParentDetailView
          key={`${viewTarget.id}-${refreshCount}`}
          parent={viewTarget}
          classes={classes}
          onBack={() => setViewTarget(null)}
          onAddChild={openAddChild}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
          isOwner={isOwner}
          onPaymentRecorded={load}
        />
      ) : (
        <>
          <ParentStats stats={parentStats} />

          {flash && <div className={"flash " + (flash.startsWith('Error') ? 'error' : 'success')}>{flash}</div>}

          {filtered.length === 0 ? (
            <div className="empty-state">
              <Users size={52} />
              <p>{records.length === 0 ? 'No parents added yet' : 'No results found'}</p>
              <small>{records.length === 0 ? 'Click "Add Parent" to register the first parent' : ''}</small>
              {records.length === 0 && <Button onClick={() => { setForm({ ...EMPTY }); setCnicError(''); setShowModal(true); }}><Plus size={18} /> Add First Parent</Button>}
            </div>
          ) : (
            <>
              <ParentTable 
                records={paginated}
                studentCounts={studentCounts}
                monthlyTotals={monthlyTotals}
                discountTotals={discountTotals}
                isOwner={isOwner}
                onAddChild={openAddChild}
                onEdit={openEdit}
                onView={setViewTarget}
              />

              {totalPages > 1 && (
                <div className="pagination">
                  <span className="pagination-info">
                    Showing {(page-1)*PAGE_SIZE + 1}-{Math.min(page*PAGE_SIZE, filtered.length)} of {filtered.length}
                  </span>
                  <div className="pagination-controls">
                    <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p-1)}>
                      <ChevronLeft size={16} />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i+1).map(p => (
                      <button key={p} className={"page-btn" + (p === page ? ' active' : '')} onClick={() => setPage(p)}>{p}</button>
                    ))}
                    <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p+1)}>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {showModal && (
        <ParentModal 
          form={form} set={set} cnicError={cnicError} saving={saving}
          editTarget={null} onClose={() => setShowModal(false)} onSave={handleSave}
        />
      )}

      {showEditModal && editTarget && (
        <ParentModal 
          form={form} set={set} cnicError={cnicError} saving={saving}
          editTarget={editTarget} onClose={() => setShowEditModal(false)} onSave={handleEdit}
        />
      )}

      {deleteTarget && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="confirm-box">
            <Trash2 size={40} color="var(--danger)" />
            <h3>Remove Parent?</h3>
            <p>This will remove <strong>{deleteTarget.first_name} {deleteTarget.last_name}</strong> from your records.</p>
            <div className="confirm-box-btns">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete} isLoading={deleting}>Remove</Button>
            </div>
          </div>
        </div>
      )}

      {showChildModal && selectedParentForChild && (
        <ChildModal 
          parent={selectedParentForChild} childForm={childForm} setChild={setChild}
          classes={classes} savingChild={savingChild} onClose={() => setShowChildModal(false)}
          onSave={handleSaveChild} getFinalFee={getFinalFee}
        />
      )}
    </div>
  );
};
