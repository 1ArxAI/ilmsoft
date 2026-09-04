import { sanitizeSearchTerm } from '../lib/validation';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from './ui/Button';
import { 
    Search, CreditCard, CheckCircle, AlertCircle, 
    ArrowLeft, Loader2, DollarSign, Printer 
} from 'lucide-react';
import { useFlashMessage } from '../hooks/useFlashMessage';
import { useDebounce } from '../hooks/useDebounce';
import './managers.css';

interface ParentSummary {
  id: string;
  first_name: string;
  last_name: string;
  contact: string;
  balance: number;
}

export const PaymentPortalV2 = ({ 
  schoolId,
  initialParentId,
  onPrintReceipt
}: { 
  schoolId: string;
  initialParentId?: string;
  onPrintReceipt?: (pid: string) => void;
}) => {
  const { flash, showFlash } = useFlashMessage();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [parents, setParents] = useState<ParentSummary[]>([]);
  const [selectedParent, setSelectedParent] = useState<ParentSummary | null>(null);
  
  // Payment Form
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);

  const loadParents = useCallback(async () => {
    setLoading(true);
    try {
      const term = sanitizeSearchTerm(debouncedSearch);
      const { data, error } = await supabase
        .from('parents')
        .select(`
          id, first_name, last_name, contact,
          parent_balances ( balance )
        `)
        .eq('school_id', schoolId)
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,contact.ilike.%${term}%`)
        .order('first_name');

      if (error) throw error;

      const formatted = data.map(p => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        contact: p.contact,
        balance: p.parent_balances?.[0]?.balance || 0
      })).sort((a, b) => {
        // Sort by balance: negative (due) first, then zero, then positive (advance).
        // For equal balances, maintain the alphabetical order from the DB query.
        if (a.balance !== b.balance) {
            return a.balance - b.balance;
        }
        return 0; 
      });

      setParents(formatted);

      // Deep link auto-selection
      if (initialParentId && !selectedParent) {
        const target = formatted.find(p => p.id === initialParentId);
        if (target) setSelectedParent(target);
      }
    } catch (err: any) {
      showFlash('Error loading parents: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [schoolId, debouncedSearch, showFlash, initialParentId, selectedParent]);

  useEffect(() => {
    loadParents();
  }, [loadParents]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParent || !amount || parseFloat(amount) <= 0) return;

    setSaving(true);
    try {
      const { data: inserted, error } = await supabase
        .from('payments')
        .insert([{
          school_id: schoolId,
          parent_id: selectedParent.id,
          received_amount: parseFloat(amount),
          payment_method: method,
          notes: notes,
          received_at: new Date().toISOString()
        }])
        .select('id')
        .single();

      if (error) throw error;

      if (inserted) {
        setLastPaymentId(inserted.id);
      }
      showFlash('Payment recorded successfully!');
      setAmount('');
      setNotes('');
      // Refresh balance
      const { data: newBal } = await supabase
        .from('parent_balances')
        .select('balance')
        .eq('parent_id', selectedParent.id)
        .single();
      
      if (newBal) {
        setSelectedParent({ ...selectedParent, balance: newBal.balance });
      }
      loadParents(); // Refresh list too
    } catch (err: any) {
      showFlash('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="manager">
      <div className="manager-toolbar">
        <div className="manager-title">
          <CreditCard size={24} />
          <div>
            <h3>Receive Payment</h3>
            <p>Record money received from parents</p>
          </div>
        </div>
        {!selectedParent && (
          <div className="manager-search-bar">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search parent..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {flash && (
        <div className={`flash ${flash.startsWith('Error') ? 'error' : 'success'}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {flash.startsWith('Error') ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
            {flash}
          </div>
        </div>
      )}

      {!selectedParent ? (
        <div className="table-wrap animate-fade-up">
          <table className="data-table">
            <thead>
              <tr>
                <th>Parent Name</th>
                <th>Contact</th>
                <th style={{ textAlign: 'right' }}>Current Balance</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="manager-loading">
                    <Loader2 className="spin" /> Loading parents...
                  </td>
                </tr>
              ) : parents.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty-state">No parents found.</td>
                </tr>
              ) : (
                parents.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="record-avatar" style={{ width: '32px', height: '32px', fontSize: '0.8rem' }}>
                          {p.first_name[0]}{p.last_name[0]}
                        </div>
                        <span style={{ fontWeight: 600 }}>{p.first_name} {p.last_name}</span>
                      </div>
                    </td>
                    <td>{p.contact}</td>
                    <td style={{ 
                      textAlign: 'right', 
                      fontWeight: 700,
                      color: p.balance < 0 ? 'var(--danger)' : 'var(--success)'
                    }}>
                      Rs. {p.balance.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <Button size="sm" variant="outline" onClick={() => setSelectedParent(p)}>
                        Collect Payment
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="record-card" style={{ gridColumn: 'span 2', display: 'block' }}>
            <Button variant="ghost" onClick={() => setSelectedParent(null)} style={{ marginBottom: '1rem' }}>
              <ArrowLeft size={18} /> Back to List
            </Button>
            
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ margin: 0 }}>Collecting for {selectedParent.first_name} {selectedParent.last_name}</h3>
              <p style={{ color: 'var(--text-muted)' }}>
                Current Balance: <strong style={{ color: selectedParent.balance < 0 ? 'var(--danger)' : 'var(--success)' }}>
                  Rs. {selectedParent.balance.toLocaleString()}
                </strong>
              </p>
            </div>

            <form onSubmit={handleRecordPayment} className="form-grid">
              <div className="form-group">
                <label className="form-label">Amount Received (PKR)</label>
                <input
                  type="number"
                  required
                  className="form-input"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setLastPaymentId(null); // Reset when starting new entry
                  }}
                  placeholder="0.00"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Payment Method</label>
                <select 
                  className="form-select"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="span-2 form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-textarea"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional details..."
                  rows={3}
                />
              </div>

              <div className="span-2" style={{ display: 'flex', gap: '1rem' }}>
                <Button 
                  type="submit" 
                  variant="primary" 
                  style={{ flex: 1 }}
                  isLoading={saving}
                >
                  <DollarSign size={18} style={{ marginRight: '8px' }} />
                  Record Payment
                </Button>
                
                {lastPaymentId && (
                  <Button 
                    type="button"
                    variant="outline" 
                    style={{ flex: 1 }}
                    onClick={() => onPrintReceipt?.(lastPaymentId)}
                  >
                    <Printer size={18} style={{ marginRight: '8px' }} />
                    Print Receipt
                  </Button>
                )}
              </div>
            </form>
          </div>
        )}
      </div>
    );
  };
