import { useState, useEffect, useMemo } from 'react';
import { supabase, fetchAll } from '../lib/supabase';
import type { Role, ExtraFee, Class, ExtraFeePayment } from '../lib/supabase';
import { useFlashMessage } from '../hooks/useFlashMessage';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/Button';
import { CheckCircle, MessageCircle, DollarSign, BookOpen, AlertCircle } from 'lucide-react';
import './managers.css';

export const ExtraFeeCollectionManager = ({ schoolId, role }: { schoolId: string; role?: Role }) => {
  const { profile } = useAuth();
  const [fees, setFees] = useState<ExtraFee[]>([]);
  const [classes, setClasses] = useState<Pick<Class, 'id' | 'name'>[]>([]);
  const [loading, setLoading] = useState(true);
  const { flash, showFlash } = useFlashMessage(4000);

  // Workflow State
  const [selectedFeeId, setSelectedFeeId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  
  // Data for selected class
  const [students, setStudents] = useState<any[]>([]);
  const [payments, setPayments] = useState<ExtraFeePayment[]>([]);
  const [parentsMap, setParentsMap] = useState<Record<string, any>>({});
  const [dataLoading, setDataLoading] = useState(false);

  // Payment Modal State
  const [payStudent, setPayStudent] = useState<any | null>(null);
  const [payMethod, setPayMethod] = useState('Cash');
  const [saving, setSaving] = useState(false);

  // Unpay Modal State
  const [unpayTarget, setUnpayTarget] = useState<ExtraFeePayment | null>(null);
  const [unpaying, setUnpaying] = useState(false);

  // Success State (for WhatsApp)
  const [lastPayment, setLastPayment] = useState<any | null>(null);

  useEffect(() => {
    const loadBaseData = async () => {
      setLoading(true);
      try {
        const [feesRes, classesRes] = await Promise.all([
          supabase.from('extra_fees').select('id, name, amount, due_date, classes, school_id, is_active, created_at').eq('school_id', schoolId).eq('is_active', true).order('due_date', { ascending: false }),
          supabase.from('classes').select('id, name').eq('school_id', schoolId).order('name')
        ]);
        if (feesRes.error) throw feesRes.error;
        if (classesRes.error) throw classesRes.error;
        setFees(feesRes.data || []);
        setClasses(classesRes.data || []);
      } catch (err: any) {
        showFlash('Error loading fees: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    loadBaseData();
  }, [schoolId]);

  useEffect(() => {
    if (!selectedFeeId || !selectedClassId) {
      setStudents([]);
      setPayments([]);
      return;
    }
    
    const loadClassData = async () => {
      setDataLoading(true);
      try {
        const [{ data: stdData, error: stdErr }, { data: payData, error: payErr }] = await Promise.all([
          fetchAll((from, to) => supabase
            .from('students')
            .select('id, parent_id, first_name, last_name, parents:parent_id(id, first_name, last_name, contact, whatsapp)')
            .eq('school_id', schoolId)
            .eq('admission_class_id', selectedClassId)
            .eq('active', true).order('first_name').order('id').range(from, to)),
          fetchAll((from, to) => supabase
            .from('extra_fee_payments')
            .select('id, school_id, extra_fee_id, student_id, parent_id, amount_paid, payment_method, payment_date, created_at')
            .eq('school_id', schoolId)
            .eq('extra_fee_id', selectedFeeId).order('id').range(from, to)),
        ]);
        if (stdErr) throw stdErr;
        if (payErr) throw payErr;

        const pMap: Record<string, any> = {};
        (stdData || []).forEach((st: any) => { const p = st.parents; if (p) pMap[p.id] = { ...p, name: `${p.first_name || ''} ${p.last_name || ''}`.trim() }; });

        setStudents(stdData || []);
        setPayments(payData || []);
        setParentsMap(pMap);
      } catch (err: any) {
        showFlash('Error loading students: ' + err.message);
      } finally {
        setDataLoading(false);
      }
    };
    loadClassData();
  }, [selectedFeeId, selectedClassId, schoolId]);

  const selectedFee = fees.find(f => f.id === selectedFeeId);
  
  // Filter classes applicable to the selected fee
  const applicableClasses = useMemo(() => {
    if (!selectedFee) return [];
    return classes.filter(c => (selectedFee.classes || []).includes(c.id));
  }, [selectedFee, classes]);

  // Map of paid students
  const paidStudentsMap = useMemo(() => {
    const map = new Map<string, ExtraFeePayment>();
    payments.forEach(p => map.set(p.student_id, p));
    return map;
  }, [payments]);

  const handleMarkPaid = async () => {
    if (!payStudent || !selectedFee) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from('extra_fee_payments').insert({
        school_id: schoolId,
        extra_fee_id: selectedFee.id,
        student_id: payStudent.id,
        parent_id: payStudent.parent_id,
        amount_paid: selectedFee.amount,
        payment_method: payMethod,
        payment_date: new Date().toISOString().split('T')[0]
      }).select().single();
      
      if (error) throw error;
      
      showFlash(`Successfully collected Rs ${selectedFee.amount} for ${payStudent.first_name}`);
      
      // Update local state
      setPayments(prev => [...prev, data as ExtraFeePayment]);
      
      // Ready whatsapp state
      setLastPayment({
        student: payStudent,
        fee: selectedFee,
        parent: parentsMap[payStudent.parent_id]
      });
      
      setPayStudent(null);
    } catch (err: any) {
      showFlash('Payment error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkUnpaid = async () => {
    if (!unpayTarget) return;
    setUnpaying(true);
    try {
      const { error } = await supabase.from('extra_fee_payments').delete().eq('id', unpayTarget.id);
      if (error) throw error;
      showFlash('Payment removed (marked as unpaid)');
      setPayments(prev => prev.filter(p => p.id !== unpayTarget.id));
      setUnpayTarget(null);
    } catch (err: any) {
      showFlash('Error marking as unpaid: ' + err.message);
    } finally {
      setUnpaying(false);
    }
  };

  const sendWhatsApp = (paymentObj?: any) => {
    const target = paymentObj || lastPayment;
    if (!target) return;
    const { student, fee, parent } = target;
    let num = parent?.whatsapp || parent?.contact || '';
    num = num.replace(/\D/g, ''); // strip non-digits
    if (num.length === 11 && num.startsWith('0')) {
      num = '92' + num.substring(1);
    }
    
    if (!num) {
      showFlash('No contact number found for parent.');
      return;
    }
    
    const schoolName = profile?.school_name || 'Our School';
    const msg = `🧾 *Payment Receipt*\n\nDear ${parent?.name || 'Parent'},\nWe have received your payment of *Rs ${fee.amount}* for the *${fee.name}* of your child, *${student.first_name} ${student.last_name}*.\n\nThank you!\n- ${schoolName}`;
    
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  if (loading) return <div className="manager-loading"><div className="spinner" /><span>Loading…</span></div>;

  return (
    <div className="manager">
      <div className="manager-toolbar">
        <div className="manager-title">
          <CheckCircle size={24} />
          <div>
            <h3>Collect One-Time Fee</h3>
            <p>Select a fee and a class to mark students as paid</p>
          </div>
        </div>
      </div>

      {flash && <div className={`flash ${flash.startsWith('Error') ? 'error' : 'success'}`}>{flash}</div>}

      <div className="record-panel" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem', background: 'var(--surface-hover)', padding: '1rem', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ flex: '1 1 250px' }}>
          <label style={{ display: 'block', fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>1. Select Extra Fee</label>
          <select 
            className="form-input" 
            value={selectedFeeId} 
            onChange={e => { setSelectedFeeId(e.target.value); setSelectedClassId(''); setLastPayment(null); }}
          >
            <option value="">-- Choose a Fee --</option>
            {fees.map(f => (
              <option key={f.id} value={f.id}>{f.name} (Rs {f.amount})</option>
            ))}
          </select>
        </div>

        {selectedFeeId && (
          <div style={{ flex: '1 1 250px' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>2. Select Class</label>
            <select 
              className="form-input" 
              value={selectedClassId} 
              onChange={e => { setSelectedClassId(e.target.value); setLastPayment(null); }}
            >
              <option value="">-- Choose a Class --</option>
              {applicableClasses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {applicableClasses.length === 0 && <small style={{ color: 'var(--danger)', marginTop: '4px', display: 'block' }}>This fee is not assigned to any classes. Edit it in School Profile.</small>}
          </div>
        )}
      </div>

      {selectedFeeId && selectedClassId && (
        <div className="dashboard-card">
          <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen size={18} /> 
              Class Roster 
              <span className="rec-badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>{students.length} Students</span>
            </h4>
          </div>
          
          {dataLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading students...</div>
          ) : students.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
              <AlertCircle size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem', opacity: 0.8 }} />
              <h3 style={{ color: 'var(--text)' }}>No Students Found</h3>
              <p style={{ color: 'var(--text-muted)' }}>There are no active students in this class.</p>
            </div>
          ) : (
            <div className="table-responsive" style={{ padding: '0 1.25rem 1.25rem' }}>
              <table className="record-table" style={{ width: '100%', minWidth: '600px', marginTop: '1rem' }}>
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Parent / Contact</th>
                    <th>Fee Amount</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(student => {
                    const parent = parentsMap[student.parent_id];
                    const isPaid = paidStudentsMap.has(student.id);
                    return (
                      <tr key={student.id}>
                        <td style={{ fontWeight: 500 }}>{student.first_name} {student.last_name}</td>
                        <td>
                          <div style={{ fontSize: '13px' }}>{parent?.name || '—'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{parent?.contact || parent?.whatsapp || 'No contact'}</div>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, color: isPaid ? 'var(--success)' : 'var(--danger)' }}>Rs {selectedFee?.amount.toLocaleString()}</span>
                        </td>
                        <td>
                          {isPaid ? (
                            <span className="rec-badge" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>Paid</span>
                          ) : (
                            <span className="rec-badge" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>Unpaid</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {isPaid ? (
                            <div style={{ display: 'inline-flex', gap: '4px' }}>
                              <Button size="sm" variant="outline" onClick={() => sendWhatsApp({ student, fee: selectedFee, parent })}>
                                <MessageCircle size={14} /> Receipt
                              </Button>
                              {role === 'owner' && (
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  style={{ color: 'var(--danger)', borderColor: 'var(--danger-light)' }} 
                                  onClick={() => setUnpayTarget(paidStudentsMap.get(student.id)!)}
                                >
                                  Undo
                                </Button>
                              )}
                            </div>
                          ) : (
                            <Button size="sm" onClick={() => setPayStudent(student)}>
                              Mark as Paid
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Payment Confirmation Modal */}
      {payStudent && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setPayStudent(null)}>
          <div className="modal-box" style={{ maxWidth: '400px' }}>
            <div className="modal-head">
              <h3>Confirm Payment</h3>
              <button className="modal-close" onClick={() => setPayStudent(null)}>×</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
              <DollarSign size={40} style={{ color: 'var(--success)', margin: '0 auto 1rem' }} />
              <p style={{ fontSize: 'var(--font-lg)', margin: '0 0 0.5rem' }}>
                Collect <strong>Rs {selectedFee?.amount}</strong>?
              </p>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                Payment for <strong>{selectedFee?.name}</strong><br/>
                from <strong>{payStudent.first_name} {payStudent.last_name}</strong>
              </p>
              
              <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Payment Method</label>
                <select className="form-input" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  <option>Cash</option>
                  <option>Bank Transfer</option>
                  <option>JazzCash</option>
                  <option>EasyPaisa</option>
                </select>
              </div>
            </div>
            <div className="modal-foot">
              <Button variant="secondary" onClick={() => setPayStudent(null)}>Cancel</Button>
              <Button onClick={handleMarkPaid} isLoading={saving}>Confirm Collection</Button>
            </div>
          </div>
        </div>
      )}

      {/* Undo Payment Confirmation Modal */}
      {unpayTarget && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setUnpayTarget(null)}>
          <div className="confirm-box">
            <AlertCircle size={40} color="var(--danger)" />
            <h3>Mark as Unpaid?</h3>
            <p>This will permanently delete this payment record and revert the student's status.</p>
            <div className="confirm-box-btns" style={{ marginTop: '1.5rem' }}>
              <Button variant="secondary" onClick={() => setUnpayTarget(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleMarkUnpaid} isLoading={unpaying}>Mark Unpaid</Button>
            </div>
          </div>
        </div>
      )}

      {/* Post-Payment WhatsApp Prompt */}
      {lastPayment && (
        <div className="modal-backdrop" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 9999 }}>
          <div className="confirm-box" style={{ maxWidth: '350px' }}>
            <CheckCircle size={40} color="var(--success)" />
            <h3>Payment Recorded!</h3>
            <p>Would you like to send a receipt to the parent via WhatsApp?</p>
            <div className="confirm-box-btns" style={{ marginTop: '1.5rem' }}>
              <Button variant="secondary" onClick={() => setLastPayment(null)}>Done</Button>
              <Button onClick={() => { sendWhatsApp(); setLastPayment(null); }} style={{ background: '#25D366', color: '#fff', border: 'none' }}>
                <MessageCircle size={16} /> Send WhatsApp
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
