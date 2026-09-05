import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useClasses } from '../hooks/useClasses';
import { useFlashMessage } from '../hooks/useFlashMessage';
import { Button } from './ui/Button';
import { 
  GraduationCap, AlertCircle, CheckCircle, 
  ArrowRight, Users, Search, Loader2 
} from 'lucide-react';

interface StudentPromotionProps {
  schoolId: string;
}

const StudentPromotion = ({ schoolId }: StudentPromotionProps) => {
  const { flash, showFlash } = useFlashMessage(5000);
  
  // Data State
  const [students, setStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  
  // Selection State
  const [sourceClassId, setSourceClassId] = useState('');
  const [targetClassId, setTargetClassId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  
  // Execution State
  const [promoting, setPromoting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { classes: allClasses, loading: loadingClasses } = useClasses(schoolId);
  const classes = useMemo(() => allClasses.filter(c => c.active), [allClasses]);

  // Load Students when Source Class changes
  useEffect(() => {
    if (!sourceClassId) {
      setStudents([]);
      setSelectedIds(new Set());
      return;
    }

    const loadStudents = async () => {
      setLoadingStudents(true);
      try {
        const { data: stdData, error: stdErr } = await supabase
          .from('students')
          .select('id, first_name, last_name, monthly_fee')
          .eq('school_id', schoolId)
          .eq('current_class_id', sourceClassId)
          .eq('active', true)
          .order('first_name');
        
        if (stdErr) throw stdErr;
        
        const validStudents = stdData || [];
        setStudents(validStudents);
        // Select all by default
        setSelectedIds(new Set(validStudents.map(s => s.id)));
      } catch (err: any) {
        showFlash('Error loading students: ' + err.message);
      } finally {
        setLoadingStudents(false);
      }
    };
    loadStudents();
  }, [sourceClassId, schoolId]);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return students;
    const q = searchTerm.toLowerCase();
    return students.filter(s => 
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q)
    );
  }, [students, searchTerm]);

  // Handle Toggle Selection
  const toggleStudent = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleAll = () => {
    if (selectedIds.size === students.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(students.map(s => s.id)));
  };

  // Handle Promotion
  const handlePromote = async () => {
    if (selectedIds.size === 0 || !targetClassId) return;
    
    setPromoting(true);
    try {
      const { error } = await supabase
        .from('students')
        .update({ current_class_id: targetClassId })
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      showFlash(`Successfully promoted ${selectedIds.size} students to ${classes.find(c => c.id === targetClassId)?.name}`);
      
      // Cleanup
      setSourceClassId('');
      setTargetClassId('');
      setStudents([]);
      setSelectedIds(new Set());
      setShowConfirm(false);
    } catch (err: any) {
      showFlash('Promotion failed: ' + err.message);
    } finally {
      setPromoting(false);
    }
  };

  if (loadingClasses) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <Loader2 className="spin" size={32} style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
        <p style={{ color: 'var(--text-muted)' }}>Initializing promotion utility...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      {flash && (
        <div className={`flash ${flash.startsWith('Error') ? 'error' : 'success'}`} style={{ marginBottom: '1.5rem' }}>
          {flash.startsWith('Error') ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
          {flash}
        </div>
      )}

      <div className="profile-card" style={{ padding: '1.5rem' }}>
        <div className="form-section-label" style={{ marginBottom: '1.5rem' }}>Promotion Workflow</div>
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr auto 1fr', 
          alignItems: 'center', 
          gap: '1.5rem',
          marginBottom: '2rem'
        }}>
          <div>
            <label className="form-label" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Current Class (Source)</label>
            <select 
              className="form-input" 
              value={sourceClassId} 
              onChange={e => setSourceClassId(e.target.value)}
              style={{ padding: '0.75rem' }}
            >
              <option value="">Select current class...</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div style={{ paddingTop: '1.5rem' }}>
            <ArrowRight size={24} style={{ color: 'var(--border)' }} />
          </div>

          <div>
            <label className="form-label" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Target Class (New Grade)</label>
            <select 
              className="form-input" 
              value={targetClassId} 
              onChange={e => setTargetClassId(e.target.value)}
              disabled={!sourceClassId}
              style={{ padding: '0.75rem' }}
            >
              <option value="">Select target class...</option>
              {classes.filter(c => c.id !== sourceClassId).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {sourceClassId && (
          <div className="student-roster-section animate-fade-up">
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '1rem' 
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Users size={20} style={{ color: 'var(--primary)' }} />
                <h4 style={{ margin: 0 }}>Class Roster</h4>
                <span className="rec-badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                  {selectedIds.size} of {students.length} selected
                </span>
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div className="manager-search-bar" style={{ minWidth: '250px' }}>
                  <Search size={16} />
                  <input 
                    type="text" 
                    placeholder="Filter students..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button size="sm" variant="outline" onClick={toggleAll}>
                  {selectedIds.size === students.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
            </div>

            {loadingStudents ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <Loader2 className="spin" size={24} />
                <p>Loading parent records...</p>
              </div>
            ) : students.length === 0 ? (
              <div className="empty-state" style={{ padding: '3rem' }}>
                <Users size={40} style={{ opacity: 0.3 }} />
                <p>No active students found in this class.</p>
              </div>
            ) : (
              <div className="table-wrap" style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                <table className="data-table" style={{ margin: 0 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface)' }}>
                    <tr>
                      <th style={{ width: '40px' }}></th>
                      <th>Student Name</th>
                      <th>Class Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map(s => (
                      <tr 
                        key={s.id} 
                        onClick={() => toggleStudent(s.id)}
                        style={{ cursor: 'pointer', background: selectedIds.has(s.id) ? 'var(--primary-light-alpha)' : 'transparent' }}
                      >
                        <td>
                          <input 
                            type="checkbox" 
                            checked={selectedIds.has(s.id)} 
                            onChange={() => {}} // Handled by tr onClick
                            style={{ 
                              width: '18px', height: '18px', accentColor: 'var(--primary)',
                              cursor: 'pointer'
                            }}
                          />
                        </td>
                        <td style={{ fontWeight: 600 }}>{s.first_name} {s.last_name}</td>
                        <td style={{ color: 'var(--text-muted)' }}>Rs {s.monthly_fee.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selectedIds.size > 0 && targetClassId && (
              <div style={{ 
                marginTop: '1.5rem', 
                padding: '1.5rem', 
                background: 'var(--surface-hover)', 
                borderRadius: 'var(--radius-lg)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: '1px solid var(--primary-light)'
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)' }}>
                    Ready to Promote
                  </div>
                  <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Moving <strong>{selectedIds.size} students</strong> to <strong>{classes.find(c => c.id === targetClassId)?.name}</strong>.
                    <br/>
                    <small style={{ color: 'var(--primary)' }}>Fees will be automatically recalculated by the database.</small>
                  </p>
                </div>
                <Button size="lg" onClick={() => setShowConfirm(true)}>
                  <GraduationCap size={18} /> Promote Selected Students
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div className="modal-body" style={{ padding: '2rem' }}>
              <div style={{ 
                width: '64px', height: '64px', background: 'var(--primary-light)', 
                color: 'var(--primary)', borderRadius: '50%', display: 'flex', 
                alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' 
              }}>
                <GraduationCap size={32} />
              </div>
              <h3 style={{ marginBottom: '0.75rem' }}>Confirm Promotion</h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: '1.5' }}>
                You are about to promote <strong>{selectedIds.size}</strong> students to <strong>{classes.find(c => c.id === targetClassId)?.name}</strong>.
                <br/><br/>
                This action will update their class and recalculate their monthly fees based on the new class rate.
              </p>
              
              <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                <Button 
                  variant="secondary" 
                  fullWidth 
                  onClick={() => setShowConfirm(false)}
                  disabled={promoting}
                >
                  Cancel
                </Button>
                <Button 
                  fullWidth 
                  onClick={handlePromote}
                  isLoading={promoting}
                >
                  Confirm & Promote
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentPromotion;
