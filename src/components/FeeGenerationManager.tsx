import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from './ui/Button';
import { 
    Calendar, Zap, CheckCircle, AlertCircle, Check, Printer 
} from 'lucide-react';
import { useFlashMessage } from '../hooks/useFlashMessage';
import { InvoicePrinter } from './InvoicePrinter';
import './managers.css';



export const FeeGenerationManager = ({ schoolId }: { schoolId: string }) => {
  const { flash, showFlash } = useFlashMessage();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<{ 
    count: number; 
    total: number;
    parentCount: number;
    grossTotal: number;
    discountTotal: number;
    missingClassCount: number;
    students: Record<string, unknown>[];
  } | null>(null);
  const [detailClassId, setDetailClassId] = useState<string | null>(null);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [classes, setClasses] = useState<{id: string, name: string, monthly_fee: number}[]>([]);
  const [fixing, setFixing] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [generatedMonths, setGeneratedMonths] = useState<Record<string, string>>({});
  const [printingMonth, setPrintingMonth] = useState<string | null>(null);

  const groupedStudents = useMemo(() => {
    if (!preview?.students) return {};
    const groups: Record<string, any[]> = {};
    preview.students.forEach((s: any) => {
      const cid = (s.current_class_id || s.admission_class_id || 'unassigned') as string;
      if (!groups[cid]) groups[cid] = [];
      groups[cid].push(s);
    });
    return groups;
  }, [preview?.students]);

  // Derived stats based on selected classes
  const stats = useMemo(() => {
    if (!preview?.students) return { count: 0, total: 0 };
    
    const students = preview.students.filter((s: any) => {
      const cid = (s.current_class_id || s.admission_class_id || 'unassigned') as string;
      return selectedClassIds.includes(cid);
    });

    return {
      count: students.length,
      total: students.reduce((sum, s: any) => sum + (Number(s.current_monthly_fee) || 0), 0)
    };
  }, [preview?.students, selectedClassIds]);

  // Get current and next two months
  const upcomingMonths = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push({
        id: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
        short: d.toLocaleString('default', { month: 'short' })
      });
    }
    return months;
  }, []);

  const toggleMonth = (monthId: string) => {
    setSelectedMonths(prev => 
      prev.includes(monthId) 
        ? prev.filter(m => m !== monthId) 
        : [...prev, monthId]
    );
  };

  const loadHistory = async () => {
    const { data, error } = await supabase
      .from('fee_generations')
      .select('id, school_id, months_generated, student_count, total_amount, status, generated_at')
      .eq('school_id', schoolId)
      .order('generated_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error loading history:', error);
    } else {
      // Extract all generated months into a map for quick lookup with dates
      const monthsMap: Record<string, string> = {};
      data?.forEach(log => {
        if (log.months_generated) {
           log.months_generated.forEach((m: string) => {
             // Store the date if not already present or if this is the newest record
             if (!monthsMap[m]) {
               monthsMap[m] = new Date(log.generated_at).toLocaleDateString('en-US', {
                 month: 'short', day: 'numeric', year: 'numeric'
               });
             }
           });
        }
      });
      setGeneratedMonths(monthsMap);
    }
  };

  const loadPreview = async () => {
    setLoading(true);
    try {
      // Fetch classes first for labels
      const { data: classData } = await supabase.from('classes').select('id, name, monthly_fee').eq('school_id', schoolId);
      setClasses((classData as any) || []);

      const { data, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, parent_id, current_monthly_fee, monthly_fee, current_class_id, admission_class_id, active, school_id, registration_number')
        .eq('school_id', schoolId)
        .eq('active', true);

      if (error) {
        showFlash('Error loading student data: ' + error.message);
      } else if (data) {
        const count = data.length;
        const netTotal = data.reduce((sum, s) => sum + (Number(s.current_monthly_fee) || 0), 0);
        // Fallback to current_monthly_fee if monthly_fee (gross) is missing
        const grossTotal = data.reduce((sum, s) => sum + (Number(s.monthly_fee) || Number(s.current_monthly_fee) || 0), 0);
        const parentCount = new Set(data.map(s => s.parent_id)).size;
        
        // Count how many have missing class_id (used by DB triggers)
        // Check for common variations: class_id, current_class_id, admission_class_id
        const missingClass = data.filter(s => !s.current_class_id && !(s as any).admission_class_id);

        setPreview({ 
          count, 
          total: netTotal,
          parentCount,
          grossTotal,
          discountTotal: Math.max(0, grossTotal - netTotal),
          missingClassCount: missingClass.length,
          students: data
        });

        // Default: select all classes that have students
        const allClassIds = [...new Set(data.map(s => (s.current_class_id || (s as any).admission_class_id || 'unassigned') as string))];
        setSelectedClassIds(allClassIds);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fixStudentData = async () => {
    if (!preview?.students) return;
    setFixing(true);
    try {
      const targets = preview.students.filter(s => !s.current_class_id && s.admission_class_id);
      if (targets.length === 0) {
        showFlash('No students found needing class alignment.');
        return;
      }

      showFlash(`Fixing data for ${targets.length} students...`);
      
      const updates = targets.map(s => {
        const bestClassId = s.current_class_id || s.admission_class_id;
        return supabase.from('students')
          .update({ 
            current_class_id: bestClassId,
            admission_class_id: bestClassId
          })
          .eq('id', s.id);
      });

      await Promise.all(updates);
      showFlash('Data synchronized successfully. Refreshing preview...');
      await loadPreview();
    } catch (err: any) {
      showFlash('Error fixing data: ' + err.message);
    } finally {
      setFixing(false);
    }
  };

  useEffect(() => {
    loadHistory();
    loadPreview();
  }, [schoolId]);

  const handleGenerate = async () => {
    if (selectedMonths.length === 0) {
      showFlash('Please select at least one month');
      return;
    }

    const monthLabels = selectedMonths
      .map(id => upcomingMonths.find(m => m.id === id)?.label)
      .filter(Boolean)
      .join(', ');

    if (!confirm(`Generate fees for: ${monthLabels}?\nThis will create debit entries for all active students.`)) {
      return;
    }

    setGenerating(true);
    try {
      const realClassIds = selectedClassIds.filter(id => id !== 'unassigned');
      const includeUnassigned = selectedClassIds.includes('unassigned');

      const { data, error } = await supabase.rpc('generate_bulk_fees', {
        p_school_id: schoolId,
        p_months: selectedMonths,
        p_class_ids: realClassIds,
        p_include_unassigned: includeUnassigned
      });

      if (error) throw error;

      showFlash(`Successfully generated fees for ${data.student_count} student entries!`);
      setSelectedMonths([]);
      loadHistory();
    } catch (err: any) {
      showFlash(err.message || 'Failed to generate fees');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="manager">
      <div className="manager-toolbar">
        <div className="manager-title">
          <Zap size={24} />
          <div>
            <h3>Fee Generation (v2)</h3>
            <p>Generate monthly fee charges for all active students</p>
          </div>
        </div>
      </div>

      {flash && (
        <div className={`flash ${flash.startsWith('Error') ? 'error' : 'success'}`}>
          {flash.startsWith('Error') ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
          {flash}
        </div>
      )}

      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <Calendar size={20} style={{ color: 'var(--primary)' }} />
          <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Select Months to Generate</h4>
        </div>
        
        <div style={{ 
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '1rem' 
        }}>
          {upcomingMonths.map((m) => {
            const genDate = generatedMonths[m.id];
            const isGenerated = !!genDate;
            const isSelected = selectedMonths.includes(m.id);
            
            return (
              <div 
                key={m.id}
                onClick={() => !generating && !isGenerated && toggleMonth(m.id)}
                style={{ 
                  padding: '0.875rem', borderRadius: 'var(--radius-lg)', 
                  border: '2px solid', 
                  borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                  background: isSelected ? 'var(--primary-light)' : (isGenerated ? 'var(--bg-alt)' : 'var(--surface)'),
                  cursor: isGenerated ? 'not-allowed' : 'pointer', transition: 'all 0.2s', position: 'relative',
                  display: 'flex', flexDirection: 'column', gap: '0.5rem',
                  boxShadow: isSelected ? 'var(--shadow-md)' : 'none',
                  opacity: isGenerated ? 0.8 : 1
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-md)', background: isSelected ? 'var(--primary)' : (isGenerated ? 'var(--border)' : 'var(--bg-alt)'), display: 'flex', alignItems: 'center', justifyContent: 'center', color: isSelected ? 'white' : 'var(--primary)' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.7rem' }}>{m.short}</span>
                  </div>
                  {isGenerated && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                      <span style={{ 
                        fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', 
                        background: 'var(--success-light)', color: 'var(--success)', 
                        borderRadius: '99px', display: 'flex', alignItems: 'center', gap: '4px',
                        whiteSpace: 'nowrap'
                      }}>
                        <CheckCircle size={10} /> {genDate}
                      </span>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={(e) => {
                          e.stopPropagation();
                          setPrintingMonth(m.id);
                        }}
                        style={{ border: '1px solid var(--success)', color: 'var(--success)', fontSize: '0.65rem', padding: '2px 8px' }}
                      >
                        <Printer size={10} style={{ marginRight: '4px' }} /> Print Invoices
                      </Button>
                    </div>
                  )}
                </div>
                
                <div>
                  <div style={{ fontWeight: 700, color: isGenerated ? 'var(--text-muted)' : 'var(--text)', fontSize: '0.9rem' }}>{m.label}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {isGenerated ? `Generated ${genDate}` : 'Pending'}
                  </div>
                </div>

                <div style={{ 
                  position: 'absolute', top: '10px', right: '10px', 
                  width: '20px', height: '20px', borderRadius: '50%',
                  border: '2px solid', borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                  background: isSelected ? 'var(--primary)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {isSelected && <Check size={14} color="white" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {selectedMonths.length > 0 && preview?.students && (
        <div style={{ marginTop: '2rem', animation: 'fadeIn 0.3s ease-out' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Zap size={20} style={{ color: 'var(--primary)' }} />
              <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Class Summary</h4>
            </div>
            {preview.missingClassCount > 0 && (
              <Button variant="danger" size="sm" onClick={fixStudentData} isLoading={fixing}>
                Fix {preview.missingClassCount} Mismatched Students
              </Button>
            )}
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
            gap: '1.25rem', marginBottom: '2rem' 
          }}>
            {Object.entries(groupedStudents).map(([classId, students]: [string, any[]]) => {
              const className = classes.find(c => c.id === classId)?.name || (classId === 'unassigned' ? 'Unassigned' : 'Unknown Class');
              const classTotal = students.reduce((sum, s) => sum + (Number(s.current_monthly_fee) || 0), 0);
              const isUnassigned = classId === 'unassigned';
              const isSelected = selectedClassIds.includes(classId);
              const isFocused = detailClassId === classId;

              return (
                <div 
                  key={classId}
                  onClick={() => {
                    // Toggle selection
                    setSelectedClassIds(prev => 
                      prev.includes(classId) 
                        ? prev.filter(id => id !== classId) 
                        : [...prev, classId]
                    );
                    // Also focus for detail view
                    setDetailClassId(classId);
                  }}
                  className="record-card"
                  style={{ 
                    cursor: 'pointer', flexDirection: 'column', gap: '0.5rem',
                    border: isFocused ? '2px solid var(--primary)' : (isUnassigned ? '1.5px dashed var(--danger)' : '1px solid var(--border)'),
                    background: isSelected 
                      ? (isFocused ? 'var(--primary-light)' : 'var(--surface)') 
                      : 'var(--bg-alt)',
                    boxShadow: isFocused ? 'var(--shadow-md)' : 'none',
                    opacity: isSelected ? 1 : 0.6,
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                >
                  <div style={{ 
                    position: 'absolute', top: '10px', right: '10px',
                    width: '18px', height: '18px', borderRadius: '50%',
                    border: '1.5px solid', borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                    background: isSelected ? 'var(--primary)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {isSelected && <Check size={12} color="white" />}
                  </div>

                  <div style={{ fontWeight: 700, fontSize: '1rem', color: isUnassigned ? 'var(--danger)' : 'var(--text)' }}>{className}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {students.length} Students
                  </div>
                  <div style={{ fontWeight: 800, color: isSelected ? 'var(--primary)' : 'var(--text-muted)', fontSize: '1.1rem', marginTop: '0.5rem' }}>
                    Rs. {classTotal.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Student List Inline Table (Replaced Modal) */}
          {detailClassId && (
            <div className="record-card" style={{ display: 'block', marginBottom: '4rem', animation: 'fadeIn 0.2s ease-out', borderTop: '4px solid var(--primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Students in {classes.find(c => c.id === detailClassId)?.name || 'Unassigned'}</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>Review students participating in this month's fee generation</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setDetailClassId(null)}>✕ Close</Button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>Current Class</th>
                      <th style={{ textAlign: 'right' }}>Monthly Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedStudents[detailClassId]?.map(s => (
                      <tr key={s.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{s.first_name} {s.last_name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{s.registration_number}</div>
                        </td>
                        <td>{classes.find(c => c.id === s.current_class_id)?.name || '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: s.current_monthly_fee === 0 ? 'var(--danger)' : 'var(--text)' }}>
                          Rs. {(s.current_monthly_fee || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Final Action Bar (Persistent at bottom when selection exists) */}
      {selectedMonths.length > 0 && (
        <div style={{ 
          position: 'sticky', bottom: '-1.75rem', 
          margin: '2rem -1.75rem -1.75rem -1.75rem',
          background: 'var(--surface)', borderTop: '2px solid var(--primary)', 
          padding: '1rem 1.75rem', zIndex: 100,
          boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3rem' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Total Students</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{stats.count}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Months</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{selectedMonths.length}</div>
            </div>
            <div style={{ height: '30px', width: '1px', background: 'var(--border)' }} />
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>Final Generation Total</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--primary)', lineHeight: 1 }}>
                Rs. {(stats.total * selectedMonths.length).toLocaleString()}
              </div>
            </div>
          </div>
          
          <Button 
            variant="primary" 
            size="lg"
            onClick={handleGenerate} 
            isLoading={generating}
            disabled={loading || selectedMonths.length === 0}
            style={{ padding: '0 3rem', height: '56px', fontSize: '1.1rem' }}
          >
            <Zap size={20} style={{ marginRight: '10px' }} />
            Generate Fees
          </Button>
        </div>
      )}
      
      {printingMonth && (
        <InvoicePrinter 
          schoolId={schoolId} 
          month={printingMonth} 
          onClose={() => setPrintingMonth(null)} 
        />
      )}
    </div>
  );
};
