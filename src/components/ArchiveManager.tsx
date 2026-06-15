import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Role } from '../lib/supabase';
import { Button } from './ui/Button';
import { useFlashMessage } from '../hooks/useFlashMessage';
import { Users, GraduationCap, Search, RotateCcw, Loader2, AlertTriangle } from 'lucide-react';
import './managers.css';

interface ArchiveManagerProps {
  schoolId: string;
  role?: Role;
}

export const ArchiveManager = ({ schoolId, role }: ArchiveManagerProps) => {
  const isOwner = !role || role === 'owner';
  const { flash, showFlash } = useFlashMessage(4000);
  const [subTab, setSubTab] = useState<'parents' | 'students'>('parents');
  const [loading, setLoading] = useState(true);
  const [parents, setParents] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  
  // Activation state
  const [parentTarget, setParentTarget] = useState<any | null>(null);
  const [studentTarget, setStudentTarget] = useState<any | null>(null);
  const [activating, setActivating] = useState(false);

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

  const handleActivateParent = async () => {
    if (!parentTarget) return;
    setActivating(true);
    try {
      // 1. Activate parent
      const { error: parentErr } = await supabase
        .from('parents')
        .update({ is_active: true })
        .eq('id', parentTarget.id);
      if (parentErr) throw parentErr;

      // 2. Also activate all their students
      const { error: studentErr } = await supabase
        .from('students')
        .update({ active: true })
        .eq('parent_id', parentTarget.id);
      if (studentErr) throw studentErr;

      showFlash(`Parent "${parentTarget.first_name} ${parentTarget.last_name}" and their children activated successfully.`);
      setParentTarget(null);
      await loadData();
    } catch (err: any) {
      showFlash('Failed to activate parent: ' + err.message);
    } finally {
      setActivating(false);
    }
  };

  const handleActivateStudent = async () => {
    if (!studentTarget) return;
    setActivating(true);
    try {
      // If parent is deactivated, warn/check
      const parentIsActive = studentTarget.parents?.is_active !== false;
      
      // If parent is inactive, activate parent first
      if (!parentIsActive) {
        const { error: parentErr } = await supabase
          .from('parents')
          .update({ is_active: true })
          .eq('id', studentTarget.parent_id);
        if (parentErr) throw parentErr;
      }

      // Activate student
      const { error: studentErr } = await supabase
        .from('students')
        .update({ active: true })
        .eq('id', studentTarget.id);
      if (studentErr) throw studentErr;

      showFlash(`Student "${studentTarget.first_name} ${studentTarget.last_name}" activated successfully.`);
      setStudentTarget(null);
      await loadData();
    } catch (err: any) {
      showFlash('Failed to activate student: ' + err.message);
    } finally {
      setActivating(false);
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
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => setParentTarget(p)}
                              title="Restore Parent and Children"
                            >
                              <RotateCcw size={14} /> Restore
                            </Button>
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
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => setStudentTarget(s)}
                                title="Restore Student"
                              >
                                <RotateCcw size={14} /> Restore
                              </Button>
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

      {/* Parent Restoration confirmation backdrop */}
      {parentTarget && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setParentTarget(null)}>
          <div className="confirm-box">
            <AlertTriangle size={40} color="var(--primary)" />
            <h3>Restore Parent Account?</h3>
            <p>
              This will restore <strong>{parentTarget.first_name} {parentTarget.last_name}</strong> and reactivate all children registered under their profile.
            </p>
            <div className="confirm-box-btns">
              <Button variant="secondary" onClick={() => setParentTarget(null)}>Cancel</Button>
              <Button onClick={handleActivateParent} isLoading={activating}>Restore</Button>
            </div>
          </div>
        </div>
      )}

      {/* Student Restoration confirmation backdrop */}
      {studentTarget && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setStudentTarget(null)}>
          <div className="confirm-box">
            <AlertTriangle size={40} color="var(--primary)" />
            <h3>Restore Student Profile?</h3>
            <p>
              This will reactivate student <strong>{studentTarget.first_name} {studentTarget.last_name}</strong>.
              {studentTarget.parents?.is_active === false && (
                <span style={{ display: 'block', marginTop: '0.5rem', fontSize: 'var(--font-xs)', color: 'var(--danger)' }}>
                  <strong>Important:</strong> The parent profile for this student is currently deactivated. Restoring this student will automatically reactivate the parent profile as well.
                </span>
              )}
            </p>
            <div className="confirm-box-btns">
              <Button variant="secondary" onClick={() => setStudentTarget(null)}>Cancel</Button>
              <Button onClick={handleActivateStudent} isLoading={activating}>Restore</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
