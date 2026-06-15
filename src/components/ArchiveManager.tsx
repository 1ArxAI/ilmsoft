import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Role } from '../lib/supabase';
import { Button } from './ui/Button';
import { useFlashMessage } from '../hooks/useFlashMessage';
import { Users, GraduationCap, Search, Loader2, Trash2 } from 'lucide-react';
import './managers.css';

interface ArchiveManagerProps {
  schoolId: string;
  role?: Role;
  onAction?: (parentId: string, targetTab: 'people-parents') => void;
}

export const ArchiveManager = ({ schoolId, role, onAction }: ArchiveManagerProps) => {
  const isOwner = !role || role === 'owner';
  const { flash, showFlash } = useFlashMessage(4000);
  const [subTab, setSubTab] = useState<'parents' | 'students'>('parents');
  const [loading, setLoading] = useState(true);
  const [parents, setParents] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  // Delete state
  const [deleteParentTarget, setDeleteParentTarget] = useState<any | null>(null);
  const [deleteStudentTarget, setDeleteStudentTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (subTab === 'parents') {
        const { data, error } = await supabase
          .from('parents')
          .select('id, first_name, last_name, cnic, contact, address, is_active')
          .eq('school_id', schoolId)
          .eq('is_active', false)
          .order('first_name');
        if (error) throw error;
        setParents(data || []);
      } else {
        const { data, error } = await supabase
          .from('students')
          .select(`
            id, first_name, last_name, cnic, active, parent_id,
            classes:current_class_id(name),
            parents:parent_id(first_name, last_name, is_active)
          `)
          .eq('school_id', schoolId)
          .eq('active', false)
          .order('first_name');
        if (error) throw error;
        setStudents(data || []);
      }
    } catch (err: any) {
      showFlash('Error loading archived data: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [schoolId, subTab, showFlash]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeleteParent = async () => {
    if (!deleteParentTarget) return;
    setDeleting(true);
    try {
      // 1. Delete discounts & monthly fees for all students of this parent
      const { data: parentStudents } = await supabase
        .from('students')
        .select('id')
        .eq('parent_id', deleteParentTarget.id);
      
      const studentIds = (parentStudents || []).map(s => s.id);
      
      if (studentIds.length > 0) {
        await supabase.from('discounts').delete().in('student_id', studentIds);
        await supabase.from('student_monthly_fees').delete().in('student_id', studentIds);
        await supabase.from('students').delete().in('id', studentIds);
      }
      
      // 2. Delete ledger and payments
      await supabase.from('ledger').delete().eq('parent_id', deleteParentTarget.id);
      await supabase.from('payments').delete().eq('parent_id', deleteParentTarget.id);
      
      // 3. Delete parent
      const { error } = await supabase
        .from('parents')
        .delete()
        .eq('id', deleteParentTarget.id);
        
      if (error) throw error;
      
      showFlash(`Parent "${deleteParentTarget.first_name} ${deleteParentTarget.last_name}" permanently deleted.`);
      setDeleteParentTarget(null);
      await loadData();
    } catch (err: any) {
      showFlash('Failed to delete parent: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!deleteStudentTarget) return;
    setDeleting(true);
    try {
      // 1. Delete discounts
      await supabase.from('discounts').delete().eq('student_id', deleteStudentTarget.id);
      
      // 2. Delete student monthly fees
      await supabase.from('student_monthly_fees').delete().eq('student_id', deleteStudentTarget.id);
      
      // 3. Delete student
      const { error } = await supabase
        .from('students')
        .delete()
        .eq('id', deleteStudentTarget.id);
        
      if (error) throw error;
      
      showFlash(`Student "${deleteStudentTarget.first_name} ${deleteStudentTarget.last_name}" permanently deleted.`);
      setDeleteStudentTarget(null);
      await loadData();
    } catch (err: any) {
      showFlash('Failed to delete student: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const filteredParents = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return parents;
    return parents.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
      (p.cnic || '').includes(q) ||
      (p.contact || '').includes(q)
    );
  }, [parents, search]);

  const filteredStudents = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return students;
    return students.filter(s =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
      (s.cnic || '').includes(q) ||
      (s.classes?.name || '').toLowerCase().includes(q)
    );
  }, [students, search]);

  return (
    <div className="manager">
      <div className="manager-toolbar">
        <div className="manager-title">
          <Users size={24} />
          <div>
            <h3>Deactivated Records Archive</h3>
            <p>View and restore deactivated family profiles and students</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div className="manager-search-bar">
            <Search size={16} />
            <input 
              placeholder={subTab === 'parents' ? 'Search by name, CNIC or contact...' : 'Search by name, class or CNIC...'} 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
            />
          </div>
        </div>
      </div>

      {/* Sub tabs */}
      <div className="type-pills" style={{ marginBottom: '0.5rem' }}>
        <button 
          className={`type-pill ${subTab === 'parents' ? 'active' : ''}`}
          onClick={() => { setSubTab('parents'); setSearch(''); }}
        >
          <Users size={16} /> Deactivated Parents ({parents.length})
        </button>
        <button 
          className={`type-pill ${subTab === 'students' ? 'active' : ''}`}
          onClick={() => { setSubTab('students'); setSearch(''); }}
        >
          <GraduationCap size={16} /> Deactivated Students ({students.length})
        </button>
      </div>

      {flash && <div className={"flash " + (flash.startsWith('Error') || flash.startsWith('Failed') ? 'error' : 'success')}>{flash}</div>}

      {loading ? (
        <div className="manager-loading">
          <Loader2 className="spin" />
          <span>Fetching deactivated records...</span>
        </div>
      ) : (
        <>
          {subTab === 'parents' ? (
            filteredParents.length === 0 ? (
              <div className="empty-state">
                <Users size={52} />
                <p>{parents.length === 0 ? 'No deactivated parents found' : 'No results match search query'}</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Parent Name</th>
                      <th>CNIC</th>
                      <th>Contact</th>
                      <th>Address</th>
                      {isOwner && <th style={{ textAlign: 'right' }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredParents.map(p => (
                      <tr key={p.id}>
                        <td>
                          <span style={{ fontWeight: 600 }}>{p.first_name} {p.last_name}</span>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.cnic}</td>
                        <td>{p.contact}</td>
                        <td>{p.address || '—'}</td>
                        {isOwner && (
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => onAction && onAction(p.id, 'people-parents')}
                                title="View Parent Profile"
                              >
                                <Search size={14} /> View Profile
                              </Button>
                              <Button 
                                size="sm" 
                                variant="danger"
                                onClick={() => setDeleteParentTarget(p)}
                                title="Permanently Delete Duplicate Parent"
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            filteredStudents.length === 0 ? (
              <div className="empty-state">
                <GraduationCap size={52} />
                <p>{students.length === 0 ? 'No deactivated students found' : 'No results match search query'}</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>Class</th>
                      <th>CNIC</th>
                      <th>Parent</th>
                      <th>Parent Status</th>
                      {isOwner && <th style={{ textAlign: 'right' }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map(s => {
                      const parentIsActive = s.parents?.is_active !== false;
                      return (
                        <tr key={s.id}>
                          <td>
                            <span style={{ fontWeight: 600 }}>{s.first_name} {s.last_name}</span>
                          </td>
                          <td>{s.classes?.name || 'Unassigned'}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.cnic || '—'}</td>
                          <td>{s.parents ? `${s.parents.first_name} ${s.parents.last_name}` : '—'}</td>
                          <td>
                            <span className={`status-pill ${parentIsActive ? 'approved' : 'rejected'}`} style={{ fontSize: '10px' }}>
                              {parentIsActive ? 'Active' : 'Deactivated'}
                            </span>
                          </td>
                          {isOwner && (
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => onAction && onAction(s.parent_id, 'people-parents')}
                                  title="View Parent Profile"
                                >
                                  <Search size={14} /> View Profile
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="danger"
                                  onClick={() => setDeleteStudentTarget(s)}
                                  title="Permanently Delete Duplicate Student"
                                >
                                  Delete
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}

      {/* Parent Deletion confirmation backdrop */}
      {deleteParentTarget && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setDeleteParentTarget(null)}>
          <div className="confirm-box">
            <Trash2 size={40} color="var(--danger)" />
            <h3>Delete Parent Permanently?</h3>
            <p>
              Are you sure this is a duplicate record? This will permanently delete <strong>{deleteParentTarget.first_name} {deleteParentTarget.last_name}</strong> and all their registered child profiles from the database. This action cannot be undone.
            </p>
            <div className="confirm-box-btns">
              <Button variant="secondary" onClick={() => setDeleteParentTarget(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleDeleteParent} isLoading={deleting}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {/* Student Deletion confirmation backdrop */}
      {deleteStudentTarget && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setDeleteStudentTarget(null)}>
          <div className="confirm-box">
            <Trash2 size={40} color="var(--danger)" />
            <h3>Delete Student Permanently?</h3>
            <p>
              Are you sure this is a duplicate record? This will permanently delete student <strong>{deleteStudentTarget.first_name} {deleteStudentTarget.last_name}</strong> from the database. This action cannot be undone.
            </p>
            <div className="confirm-box-btns">
              <Button variant="secondary" onClick={() => setDeleteStudentTarget(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleDeleteStudent} isLoading={deleting}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
