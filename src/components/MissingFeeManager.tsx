import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from './ui/Button';
import { 
    Calendar, AlertCircle, CheckCircle, Search, ShieldAlert, Zap, Eye, X
} from 'lucide-react';
import { useFlashMessage } from '../hooks/useFlashMessage';
import './managers.css';

interface ParentWithStudents {
  id: string;
  first_name: string;
  last_name: string;
  contact: string;
  students: { 
    id: string; 
    active: boolean; 
    first_name: string;
    last_name: string;
    current_monthly_fee: number;
    discount_type: string;
    discount_value: number;
    classes: { name: string; monthly_fee: number; }; 
  }[];
}

export const MissingFeeManager = ({ schoolId }: { schoolId: string }) => {
  const { flash, showFlash } = useFlashMessage();
  const [loading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState('');
  
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [missingParents, setMissingParents] = useState<ParentWithStudents[]>([]);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [viewParent, setViewParent] = useState<ParentWithStudents | null>(null);

  // Generate a sliding window of months: 2 past, current, 1 future
  const availableMonths = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = -1; i <= 2; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push({
        id: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
        short: d.toLocaleString('default', { month: 'short' }),
        isCurrent: i === 0
      });
    }
    return months;
  }, []);

  // One round trip: the parents (with their active students) who have no fee for the month.
  useEffect(() => {
    if (!selectedMonth) { setMissingParents([]); return; }
    let cancelled = false;
    const run = async () => {
      setFetching(true);
      try {
        const { data, error } = await supabase.rpc('missing_fee_parents', { p_school_id: schoolId, p_month: selectedMonth });
        if (error) throw error;
        if (!cancelled) setMissingParents((data as any) || []);
      } catch (err: any) {
        showFlash('Error checking missing fees: ' + err.message);
      } finally {
        if (!cancelled) setFetching(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [selectedMonth, schoolId, showFlash]);

  const handleGenerateIndividual = async (parent: ParentWithStudents) => {
    if (!selectedMonth) return;
    setGeneratingId(parent.id);
    try {
      const { error } = await supabase.rpc('generate_individual_fee', {
        p_school_id: schoolId,
        p_parent_id: parent.id,
        p_month: selectedMonth
      });

      if (error) throw error;
      showFlash(`Successfully generated fee for ${parent.first_name} ${parent.last_name}`);
      
      // Instantly remove them from the missing list
      setMissingParents(prev => prev.filter(p => p.id !== parent.id));
    } catch (err: any) {
      showFlash('Failed to generate fee: ' + err.message);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleGenerateAll = async () => {
    if (!selectedMonth || missingParents.length === 0) return;
    if (!confirm(`Are you sure you want to generate fees for ${missingParents.length} missing accounts?`)) return;
    
    setGeneratingAll(true);
    let successCount = 0;
    try {
      const { data, error } = await supabase.rpc('generate_fees_for_parents', {
        p_school_id: schoolId,
        p_parent_ids: missingParents.map(p => p.id),
        p_month: selectedMonth
      });
      if (error) throw error;
      successCount = (data as any)?.processed ?? 0;
      showFlash(`Successfully processed ${successCount} missing fee accounts!`);
      setMissingParents(prev => prev.filter(() => false));
    } catch(err: any) {
      showFlash('Bulk process interruption: ' + err.message);
    } finally {
      setGeneratingAll(false);
    }
  };

  const getCalculatedFee = (s: any) => {
    const base = s.classes?.monthly_fee || 0;
    if (s.discount_type === 'percentage') {
      return Math.round(base * (1 - (s.discount_value || 0) / 100));
    } else if (s.discount_type === 'amount') {
      return Math.max(0, base - (s.discount_value || 0));
    }
    return base;
  };

  const filteredMissing = useMemo(() => {
    if (!search.trim()) return missingParents;
    const lower = search.toLowerCase();
    return missingParents.filter(p => 
      p.first_name.toLowerCase().includes(lower) || 
      p.last_name.toLowerCase().includes(lower) || 
      p.contact.includes(lower)
    );
  }, [missingParents, search]);

  return (
    <div className="manager">
      <div className="manager-toolbar">
        <div className="manager-title">
          <ShieldAlert size={24} color="var(--warning)" />
          <div>
            <h3>Missing Fee Audit</h3>
            <p>Target and isolate parents who missed monthly generation</p>
          </div>
        </div>
        {selectedMonth && missingParents.length > 0 && (
          <Button variant="primary" onClick={handleGenerateAll} isLoading={generatingAll}>
            <Zap size={18} /> Generate All Missing ({missingParents.length})
          </Button>
        )}
      </div>

      {flash && (
        <div className={`flash ${flash.startsWith('Error') || flash.includes('Failed') ? 'error' : 'success'}`}>
          {flash.startsWith('Error') || flash.includes('Failed') ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
          {flash}
        </div>
      )}

      {/* Month Selection Grid */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <Calendar size={20} style={{ color: 'var(--primary)' }} />
          <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Select Month to Audit</h4>
        </div>
        
        <div style={{ 
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
          gap: '1rem' 
        }}>
          {availableMonths.map((m) => {
            const isSelected = selectedMonth === m.id;
            return (
              <div 
                key={m.id}
                onClick={() => setSelectedMonth(m.id)}
                style={{ 
                  padding: '1rem', borderRadius: 'var(--radius-lg)', 
                  border: '2px solid', 
                  borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                  background: isSelected ? 'var(--primary-light)' : 'var(--surface)',
                  cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  boxShadow: isSelected ? 'var(--shadow-md)' : 'none'
                }}
              >
                <div style={{ 
                  width: '40px', height: '40px', borderRadius: 'var(--radius-md)', 
                  background: isSelected ? 'var(--primary)' : 'var(--bg-alt)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  color: isSelected ? 'white' : 'var(--text)', fontWeight: 800
                }}>
                  {m.short}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9rem' }}>{m.label}</div>
                  <div style={{ fontSize: '0.7rem', color: isSelected ? 'var(--primary)' : 'var(--text-muted)' }}>
                    {m.isCurrent ? 'Current Month' : 'Historical Data'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="dash-loading"><div className="spinner"></div> System check...</div>
      ) : selectedMonth ? (
         missingParents.length === 0 ? (
           <div className="section-empty" style={{ background: 'var(--surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)' }}>
              <CheckCircle size={48} color="var(--success)" />
              <div style={{ marginTop: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text)' }}>100% Generated!</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>All active parents have successfully received fee charges for this month.</p>
              </div>
           </div>
         ) : (
           <div className="record-card" style={{ display: 'block', padding: '0', overflow: 'hidden', animation: 'fadeIn 0.3s ease-out' }}>
              <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <div>
                   <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Missing Families ({missingParents.length})</h3>
                   <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>The following families have no registered fee entries for the selected month.</p>
                 </div>
                 <div className="manager-search-bar" style={{ width: '250px' }}>
                    <Search size={16} />
                    <input 
                      type="text" 
                      placeholder="Search missing parents..." 
                      value={search} 
                      onChange={e => setSearch(e.target.value)} 
                    />
                 </div>
              </div>

              <div style={{ overflowX: 'auto', opacity: fetching ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Parent Identity</th>
                      <th>Contact</th>
                      <th style={{ textAlign: 'center' }}>Active Students</th>
                      <th style={{ textAlign: 'right' }}>Total Expected Fee</th>
                      <th style={{ textAlign: 'center' }}>Fix Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMissing.map(p => {
                      const totalFee = p.students.reduce((acc, s) => acc + getCalculatedFee(s), 0);
                      return (
                        <tr key={p.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{p.first_name} {p.last_name}</div>
                          </td>
                          <td>{p.contact}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ background: 'var(--bg-alt)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 700 }}>
                              {p.students.length}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>
                            Rs. {totalFee.toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'center', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => setViewParent(p)}
                              disabled={generatingAll}
                            >
                              <Eye size={14} style={{ marginRight: '6px' }} /> View
                            </Button>
                            <Button 
                              size="sm" 
                              variant="primary" 
                              onClick={() => handleGenerateIndividual(p)}
                              isLoading={generatingId === p.id}
                              disabled={generatingAll || (generatingId !== null && generatingId !== p.id)}
                            >
                              <Zap size={14} style={{ marginRight: '6px' }} /> Generate
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
           </div>
         )
      ) : (
        <div className="section-empty" style={{ opacity: 0.6 }}>
          <ShieldAlert size={48} />
          <p>Please select a month above to scan for errors.</p>
        </div>
      )}

      {viewParent && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setViewParent(null)}>
          <div className="modal-box" style={{ maxWidth: '650px' }}>
            <div className="modal-head">
              <h3>Children of {viewParent.first_name} {viewParent.last_name}</h3>
              <button className="modal-close" onClick={() => setViewParent(null)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Class</th>
                    <th>Gross Fee</th>
                    <th>Discount</th>
                    <th>Final Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {viewParent.students.map(s => {
                    const baseFee = s.classes?.monthly_fee || 0;
                    const finalFee = getCalculatedFee(s);
                    const isDiscounted = baseFee > finalFee;
                    return (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600 }}>{s.first_name} {s.last_name}</td>
                        <td>{s.classes?.name || 'Unassigned'}</td>
                        <td style={{ color: isDiscounted ? 'var(--text-muted)' : 'inherit', textDecoration: isDiscounted ? 'line-through' : 'none' }}>
                          Rs. {baseFee.toLocaleString()}
                        </td>
                        <td>
                          {s.discount_type === 'percentage' ? (
                            <span style={{ color: 'var(--success)', fontWeight: 600 }}>{s.discount_value}% Off</span>
                          ) : s.discount_type === 'amount' ? (
                            <span style={{ color: 'var(--success)', fontWeight: 600 }}>-Rs. {s.discount_value}</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>None</span>
                          )}
                        </td>
                        <td style={{ fontWeight: 800, color: 'var(--primary)' }}>Rs. {finalFee.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ padding: '1rem', background: 'var(--bg-alt)', textAlign: 'right', fontWeight: 800, fontSize: '1.1rem' }}>
                Total Missing Burden: <span style={{ color: 'var(--primary)' }}>Rs. {viewParent.students.reduce((acc, s) => acc + getCalculatedFee(s), 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
