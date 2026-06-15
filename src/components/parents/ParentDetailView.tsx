import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { Parent, Class } from '../../hooks/useParents';
import { Button } from '../ui/Button';
import { 
  ArrowLeft, Phone, CreditCard, GraduationCap, Plus, Trash2, 
  Loader2, DollarSign, Printer, Clock, FileText, CheckCircle, AlertCircle
} from 'lucide-react';
import { useFlashMessage } from '../../hooks/useFlashMessage';
import { isValidPhone } from '../../lib/validation';

interface ParentDetailViewProps {
  parent: Parent;
  classes: Class[];
  onBack: () => void;
  onAddChild: (p: Parent) => void;
  onEdit: (p: Parent) => void;
  onDelete: (p: Parent) => void;
  isOwner: boolean;
  onPrintReceipt?: (paymentId: string) => void;
  onPaymentRecorded?: () => void;
}

export const ParentDetailView = ({
  parent,
  classes,
  onBack,
  onAddChild,
  onEdit,
  onDelete,
  isOwner,
  onPrintReceipt,
  onPaymentRecorded
}: ParentDetailViewProps) => {
  const { flash, showFlash } = useFlashMessage();
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [payments, setPayments] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [children, setChildren] = useState<any[]>([]);
  
  // Payment recording form state
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [balRes, payRes, ledgerRes, childrenRes] = await Promise.all([
        supabase.from('parent_balances').select('balance').eq('parent_id', parent.id).maybeSingle(),
        supabase.from('payments').select('id, received_amount, payment_method, received_at, notes').eq('parent_id', parent.id).order('received_at', { ascending: false }).limit(5),
        supabase.from('ledger').select('id, entry_type, amount, reference_type, description, month, created_at').eq('parent_id', parent.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('students').select('*').eq('parent_id', parent.id).eq('active', true)
      ]);

      setBalance(balRes.data?.balance || 0);
      setPayments(payRes.data || []);
      setLedger(ledgerRes.data || []);
      setChildren(childrenRes.data || []);
    } catch (err: any) {
      showFlash('Error loading report data: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [parent.id, showFlash]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const pkrAmount = parseFloat(amount);
    if (Number.isNaN(pkrAmount) || pkrAmount <= 0) {
      showFlash('Error: Please enter a valid positive amount.');
      return;
    }

    setSavingPayment(true);
    try {
      const { error } = await supabase.from('payments').insert({
        school_id: parent.school_id,
        parent_id: parent.id,
        received_amount: pkrAmount,
        payment_method: method,
        notes: notes.trim() || null,
        received_at: new Date().toISOString()
      });

      if (error) throw error;
      showFlash('Payment recorded successfully!');
      setAmount('');
      setNotes('');
      await loadData();
      if (onPaymentRecorded) {
        onPaymentRecorded();
      }
    } catch (err: any) {
      showFlash('Payment failed: ' + err.message);
    } finally {
      setSavingPayment(false);
    }
  };

  const getClassName = (classId: string) => {
    const cls = classes.find(c => c.id === classId);
    return cls ? cls.name : 'Unassigned';
  };

  if (loading) {
    return (
      <div className="manager-loading">
        <Loader2 className="spin" />
        <span>Generating parent intelligence report...</span>
      </div>
    );
  }

  // Derived Numbers
  const totalMonthlyFee = children.reduce((sum, child) => sum + (child.current_monthly_fee || 0), 0);
  const totalDiscount = children.reduce((sum, child) => {
    const gross = child.monthly_fee || 0;
    const net = child.current_monthly_fee || 0;
    return sum + Math.max(0, gross - net);
  }, 0);

  return (
    <div className="animate-fade-up" style={{ paddingBottom: '2rem' }}>
      {/* Header toolbar */}
      <div className="manager-toolbar" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={18} style={{ marginRight: '8px' }} /> Back to Families
        </Button>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="outline" onClick={() => onEdit(parent)}>Edit Profile</Button>
          <Button onClick={() => onAddChild(parent)}><Plus size={16} /> Add Child</Button>
        </div>
      </div>

      {flash && (
        <div className={`flash ${flash.startsWith('Error') || flash.startsWith('Payment failed') ? 'error' : 'success'}`} style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {flash.startsWith('Error') || flash.startsWith('Payment failed') ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
            {flash}
          </div>
        </div>
      )}

      {/* Main Profile Info Grid */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Left Column: Report content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Parent Summary Card */}
          <div className="record-card" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <div className="record-avatar" style={{ width: '64px', height: '64px', fontSize: '1.5rem' }}>
              {parent.first_name[0]}{parent.last_name[0]}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{parent.first_name} {parent.last_name}</h2>
              <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>
                <span><strong>CNIC:</strong> {parent.cnic}</span>
                <span><strong>Contact:</strong> {parent.contact}</span>
              </div>
              {parent.address && <div style={{ marginTop: '0.25rem', color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}><strong>Address:</strong> {parent.address}</div>}
            </div>
          </div>

          {/* Stats Boxes */}
          <div className="overview-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: 0 }}>
            <div className={`ov-stat-card ${balance < 0 ? 'rose' : 'green'}`}>
              <div className="ov-stat-icon"><DollarSign size={20} /></div>
              <div className="ov-stat-label">Current Balance</div>
              <div className="ov-stat-value" style={{ color: balance < 0 ? 'var(--danger)' : 'var(--success)' }}>
                {balance < 0 ? `Rs. ${Math.abs(balance).toLocaleString()}` : `Rs. ${balance.toLocaleString()} (Adv)`}
              </div>
              <div className="ov-stat-sub">{balance < 0 ? 'Outstanding dues' : 'Advance balance'}</div>
            </div>
            <div className="ov-stat-card blue">
              <div className="ov-stat-icon"><GraduationCap size={20} /></div>
              <div className="ov-stat-label">Monthly Fee</div>
              <div className="ov-stat-value">Rs. {totalMonthlyFee.toLocaleString()}</div>
              <div className="ov-stat-sub">For {children.length} active children</div>
            </div>
            <div className="ov-stat-card purple">
              <div className="ov-stat-icon"><Coins size={20} /></div>
              <div className="ov-stat-label">Scholarship / Discount</div>
              <div className="ov-stat-value" style={{ color: totalDiscount > 0 ? 'var(--success)' : 'inherit' }}>
                Rs. {totalDiscount.toLocaleString()}
              </div>
              <div className="ov-stat-sub">Monthly reduction</div>
            </div>
          </div>

          {/* Children section */}
          <div className="record-card">
            <h3 style={{ marginTop: 0, marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>Active Enrolled Children</h3>
            {children.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>No children enrolled yet.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student Name</th><th>Gender</th><th>Class</th><th>Gross Fee</th><th>Discount</th><th>Net Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {children.map(child => {
                    const gross = child.monthly_fee || 0;
                    const net = child.current_monthly_fee || 0;
                    const disc = gross - net;
                    return (
                      <tr key={child.id}>
                        <td style={{ fontWeight: 600 }}>{child.first_name} {child.last_name}</td>
                        <td>{child.gender || '—'}</td>
                        <td>{getClassName(child.current_class_id)}</td>
                        <td>Rs. {gross.toLocaleString()}</td>
                        <td style={{ color: disc > 0 ? 'var(--success)' : 'inherit' }}>
                          {disc > 0 ? `-Rs. ${disc.toLocaleString()}` : '—'}
                        </td>
                        <td style={{ fontWeight: 700 }}>Rs. {net.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Payment History section */}
          <div className="record-card">
            <h3 style={{ marginTop: 0, marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>Recent Payment History</h3>
            {payments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>No payment records found.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Amount</th><th>Method</th><th>Notes/Reference</th><th>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(pay => (
                    <tr key={pay.id}>
                      <td>{new Date(pay.received_at).toLocaleDateString('en-PK')}</td>
                      <td style={{ fontWeight: 600, color: 'var(--success)' }}>Rs. {pay.received_amount.toLocaleString()}</td>
                      <td style={{ textTransform: 'capitalize' }}>{pay.payment_method}</td>
                      <td>{pay.notes || '—'}</td>
                      <td>
                        {onPrintReceipt && (
                          <Button size="sm" variant="ghost" onClick={() => onPrintReceipt(pay.id)}>
                            <Printer size={14} /> Receipt
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Ledger Timeline section */}
          <div className="record-card">
            <h3 style={{ marginTop: 0, marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>Ledger Timeline (Last 10 Entries)</h3>
            {ledger.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>No transactions recorded yet.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Description</th><th>Type</th><th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map(entry => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.created_at).toLocaleDateString('en-PK')}</td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{entry.description || 'Adjustment'}</span>
                        {entry.month && <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '8px' }}>({entry.month})</span>}
                      </td>
                      <td>
                        <span className={`status-pill ${entry.entry_type === 'debit' ? 'rejected' : 'approved'}`} style={{ fontSize: '10px' }}>
                          {entry.entry_type === 'debit' ? 'Debit' : 'Credit'}
                        </span>
                      </td>
                      <td style={{ 
                        textAlign: 'right', 
                        fontWeight: 600, 
                        color: entry.entry_type === 'debit' ? 'var(--danger)' : 'var(--success)' 
                      }}>
                        {entry.entry_type === 'debit' ? `+Rs. ${entry.amount.toLocaleString()}` : `-Rs. ${entry.amount.toLocaleString()}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Column: Actions / Payments */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Quick Record Payment Form */}
          <div className="record-card">
            <h3 style={{ marginTop: 0, marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>Record Payment</h3>
            <form onSubmit={handleRecordPayment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Amount Received (PKR)</label>
                <input 
                  type="number" 
                  required 
                  className="form-input" 
                  value={amount} 
                  onChange={e => setAmount(e.target.value)} 
                  placeholder="0.00" 
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Payment Method</label>
                <select className="form-select" value={method} onChange={e => setMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Notes / Reference</label>
                <textarea 
                  className="form-textarea" 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)} 
                  placeholder="Reference details..." 
                  rows={2} 
                />
              </div>

              <Button type="submit" size="lg" fullWidth isLoading={savingPayment}>
                <DollarSign size={16} /> Save Payment
              </Button>
            </form>
          </div>

          {/* Account Settings / Deactivate Panel */}
          {isOwner && (
            <div className="record-card" style={{ border: '1px solid var(--danger-light)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--danger)' }}>Danger Zone</h3>
              <p style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                Deactivating this parent will also deactivate all their child profiles and restrict billing.
              </p>
              <Button variant="danger" fullWidth onClick={() => onDelete(parent)}>
                <Trash2 size={16} style={{ marginRight: '8px' }} /> Deactivate Parent
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Re-export Coins for the parent stats/icons
const Coins = ({ size, color }: { size: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6"/>
    <circle cx="18" cy="18" r="4"/>
    <path d="M12 18a6 6 0 0 0-6-6"/>
  </svg>
);
