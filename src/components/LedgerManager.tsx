import { sanitizeSearchTerm } from '../lib/validation';
import { useState, useEffect, useCallback, useRef } from 'react';
import useSWR from 'swr';
import { supabase } from '../lib/supabase';
import { Button } from './ui/Button';
import {
  Search, ArrowLeft, Loader2, FileText, AlertCircle, CheckCircle,
  Settings, Check, Users, Gift, Printer
} from 'lucide-react';
import { useFlashMessage } from '../hooks/useFlashMessage';
import { useDebounce } from '../hooks/useDebounce';
import './managers.css';

interface ParentWithBalance {
  id: string;
  first_name: string;
  last_name: string;
  contact: string;
  total_charged: number;
  total_paid: number;
  balance: number;
  child_count: number;
  monthly_discount: number;
}

interface LedgerEntry {
  id: string;
  entry_type: 'debit' | 'credit';
  amount: number;
  reference_type: string;
  reference_id: string; // Add this to the interface if missing
  description: string;
  month: string;
  created_at: string;
}

export const LedgerManager = ({ 
  schoolId,
  initialParentId,
  onPrintReceipt,
  onClearInitialParent,
  onBack
}: { 
  schoolId: string;
  initialParentId?: string;
  onPrintReceipt?: (pid: string) => void;
  onClearInitialParent?: () => void;
  onBack?: () => void;
}) => {
  const { flash, showFlash } = useFlashMessage();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [parents, setParents] = useState<ParentWithBalance[]>([]);
  const [selectedParent, setSelectedParent] = useState<ParentWithBalance | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [hideZeroBalance, setHideZeroBalance] = useState(true);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    name: true,
    contact: true,
    children: true,
    discount: false,
    balance: true,
    actions: true
  });

  const toggleColumn = (col: string) => {
    setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
  };

  const term = sanitizeSearchTerm(debouncedSearch);
  const fetchParents = useCallback(async () => {
    {
      const { data, error } = await supabase
        .from('parents')
        .select(`
          id, first_name, last_name, contact,
          students (
            id,
            active,
            current_monthly_fee,
            discount_type,
            discount_value,
            admission_class_id
          ),
          parent_balances!inner (
            total_charged,
            total_paid,
            balance
          )
        `)
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,contact.ilike.%${term}%`)
        .order('first_name');

      if (error) throw error;

      const formatted = data.map(p => {
        const activeStudents = (p.students as any[])?.filter(s => s.active) || [];
        const child_count = activeStudents.length;

        // Calculate monthly discount
        // Since current_monthly_fee is already class_fee - discount_amount,
        // we can find discount_amount if we know the base fee.
        // For simplicity, we'll calculate it based on the discount_type/value
        let monthly_discount = 0;
        activeStudents.forEach(s => {
          if (s.discount_type === 'percentage') {
            const baseFee = s.current_monthly_fee / (1 - (s.discount_value / 100));
            monthly_discount += baseFee - s.current_monthly_fee;
          } else if (s.discount_type === 'amount') {
            monthly_discount += s.discount_value;
          }
        });

        return {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          contact: p.contact,
          total_charged: p.parent_balances[0]?.total_charged || 0,
          total_paid: p.parent_balances[0]?.total_paid || 0,
          balance: p.parent_balances[0]?.balance || 0,
          child_count,
          monthly_discount: Math.round(monthly_discount)
        };
      });

      // Filter logic logic
      let finalData = formatted;
      if (hideZeroBalance && !debouncedSearch.trim()) {
        finalData = formatted.filter(p => p.balance !== 0);
      }

      return finalData;
    }
  }, [schoolId, term, debouncedSearch, hideZeroBalance]);

  // Cached per school / search / filter: returning to this tab shows the last list instantly, then refreshes.
  const { data: parentData, isLoading: parentsLoading } = useSWR(
    schoolId ? ['ledger-parents', schoolId, term, hideZeroBalance] : null,
    fetchParents,
    { onError: (err: Error) => showFlash('Error loading ledger data: ' + err.message) }
  );
  useEffect(() => { if (parentData) setParents(parentData); }, [parentData]);
  useEffect(() => { setLoading(parentsLoading && !parentData); }, [parentsLoading, parentData]);

  // Deep link: select the requested parent once, when the list that contains it arrives.
  const deepLinkedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialParentId || deepLinkedRef.current === initialParentId) return;
    const target = parents.find(p => p.id === initialParentId);
    if (target) { deepLinkedRef.current = initialParentId; setSelectedParent(target); }
  }, [parents, initialParentId]);

  const loadLedger = async (parentId: string) => {
    setEntriesLoading(true);
    try {
      const { data, error } = await supabase
        .from('ledger')
        .select('id, entry_type, amount, reference_type, reference_id, description, month, created_at')
        .eq('parent_id', parentId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLedgerEntries(data || []);
    } catch (err: any) {
      showFlash('Error: ' + err.message);
    } finally {
      setEntriesLoading(false);
    }
  };


  useEffect(() => {
    if (selectedParent) {
      loadLedger(selectedParent.id);
    }
  }, [selectedParent]);

  const handleSelectParent = (parent: ParentWithBalance) => {
    setSelectedParent(parent);
  };

  return (
    <div className="manager">
      <div className="manager-toolbar">
        <div className="manager-title">
          <FileText size={24} />
          <div>
            <h3>Financial Ledger</h3>
            <p>View statement of accounts for parents</p>
          </div>
        </div>
        {!selectedParent && (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="manager-search-bar">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search parent name or contact..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Button
              variant={hideZeroBalance ? 'primary' : 'outline'}
              onClick={() => setHideZeroBalance(!hideZeroBalance)}
            >
              <AlertCircle size={18} /> {hideZeroBalance ? 'Showing Active Balances' : 'Showing All'}
            </Button>

            <div style={{ position: 'relative' }}>
              <Button variant="outline" onClick={() => setShowColumnSettings(!showColumnSettings)}>
                <Settings size={18} /> Columns
              </Button>

              {showColumnSettings && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)', padding: '0.75rem', zIndex: 50,
                  boxShadow: 'var(--shadow-xl)', minWidth: '200px',
                  display: 'flex', flexDirection: 'column', gap: '4px'
                }}>
                  <div style={{ fontSize: 'var(--font-xs)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                    Show / Hide Columns
                  </div>
                  {[
                    { id: 'name', label: 'Parent Name', icon: FileText },
                    { id: 'contact', label: 'Contact', icon: Search },
                    { id: 'children', label: 'Children', icon: Users },
                    { id: 'discount', label: 'Monthly Discount', icon: Gift },
                    { id: 'balance', label: 'Balance / Advance', icon: AlertCircle }
                  ].map(col => (
                    <div
                      key={col.id}
                      onClick={() => toggleColumn(col.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)',
                        cursor: 'pointer', transition: 'all 0.15s',
                        background: visibleColumns[col.id] ? 'var(--primary-light)' : 'transparent',
                        color: visibleColumns[col.id] ? 'var(--primary)' : 'var(--text)'
                      }}
                    >
                      <col.icon size={16} />
                      <span style={{ flex: 1, fontSize: 'var(--font-sm)', fontWeight: 600 }}>{col.label}</span>
                      {visibleColumns[col.id] && <Check size={14} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {flash && (
        <div className={`flash ${flash.startsWith('Error') ? 'error' : 'success'}`}>
          {flash.startsWith('Error') ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
          {flash}
        </div>
      )}

      {!selectedParent ? (
        <div className="table-wrap animate-fade-up">
          <table className="data-table">
            <thead>
              <tr>
                {visibleColumns.name && <th>Parent Name</th>}
                {visibleColumns.contact && <th>Contact</th>}
                {visibleColumns.children && <th style={{ textAlign: 'center' }}>Children</th>}
                {visibleColumns.discount && <th style={{ textAlign: 'right' }}>Monthly Discount</th>}
                {visibleColumns.balance && <th style={{ textAlign: 'right' }}>Balance / Advance</th>}
                {visibleColumns.actions && <th style={{ textAlign: 'center' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={Object.values(visibleColumns).filter(Boolean).length} className="manager-loading">
                    <Loader2 className="spin" /> Loading parents...
                  </td>
                </tr>
              ) : parents.length === 0 ? (
                <tr>
                  <td colSpan={Object.values(visibleColumns).filter(Boolean).length} className="empty-state">
                    {hideZeroBalance && !search ? "All parents are cleared. No active balances found." : "No parents found."}
                  </td>
                </tr>
              ) : (
                parents.map(p => (
                  <tr key={p.id}>
                    {visibleColumns.name && (
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div className="record-avatar" style={{ width: '32px', height: '32px', fontSize: '0.8rem' }}>
                            {p.first_name[0]}{p.last_name[0]}
                          </div>
                          <span style={{ fontWeight: 600 }}>{p.first_name} {p.last_name}</span>
                        </div>
                      </td>
                    )}
                    {visibleColumns.contact && <td>{p.contact}</td>}
                    {visibleColumns.children && (
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '99px', background: 'var(--bg-alt)',
                          fontSize: 'var(--font-xs)', fontWeight: 700, color: 'var(--text)'
                        }}>
                          {p.child_count} child{p.child_count !== 1 ? 'ren' : ''}
                        </span>
                      </td>
                    )}
                    {visibleColumns.discount && (
                      <td style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>
                        {p.monthly_discount > 0 ? `Rs. ${p.monthly_discount.toLocaleString()}` : '—'}
                      </td>
                    )}
                    {visibleColumns.balance && (
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <span style={{
                            fontWeight: 700,
                            color: p.balance < 0 ? 'var(--danger)' : p.balance > 0 ? 'var(--success)' : 'var(--text-muted)'
                          }}>
                            Rs. {Math.abs(p.balance).toLocaleString()}
                          </span>
                          <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, opacity: 0.6 }}>
                            {p.balance < 0 ? 'Arrears' : p.balance > 0 ? 'Advance' : 'Cleared'}
                          </span>
                        </div>
                      </td>
                    )}
                    {visibleColumns.actions && (
                      <td style={{ textAlign: 'center' }}>
                        <Button size="sm" variant="outline" onClick={() => handleSelectParent(p)}>
                          View Statement
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="record-card" style={{ gridColumn: 'span 3', display: 'block' }}>
          <Button variant="ghost" onClick={() => {
            setSelectedParent(null);
            if (onClearInitialParent) onClearInitialParent();
            if (onBack) onBack();
          }} style={{ marginBottom: '1rem' }}>
            <ArrowLeft size={18} /> {onBack ? 'Back to Fee Stats' : 'Back to List'}
          </Button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', padding: '1rem', background: 'var(--bg)', borderRadius: 'var(--radius-lg)' }}>
            <div>
              <h3 style={{ margin: 0 }}>{selectedParent!.first_name} {selectedParent!.last_name}</h3>
              <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0' }}>{selectedParent!.contact}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Current Balance</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: selectedParent!.balance < 0 ? 'var(--danger)' : 'var(--success)' }}>
                Rs. {selectedParent!.balance.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {entriesLoading ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center' }}>Loading ledger...</td></tr>
                ) : ledgerEntries.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center' }}>No transactions found.</td></tr>
                ) : (
                  ledgerEntries.map(entry => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.created_at).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div>
                            {entry.description}
                            {entry.month && <span style={{ marginLeft: '8px', opacity: 0.6 }}>({entry.month})</span>}
                          </div>
                          {entry.reference_type === 'payment' && (
                            <button 
                              onClick={() => onPrintReceipt?.(entry.reference_id)}
                              className="fss-action-btn print"
                              style={{ padding: '4px', height: 'auto' }}
                              title="Print Receipt"
                            >
                              <Printer size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${entry.entry_type === 'credit' ? 'active' : 'inactive'}`}>
                          {entry.entry_type.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        Rs. {entry.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
