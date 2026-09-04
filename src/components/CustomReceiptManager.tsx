import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, type CustomReceipt, type Parent } from '../lib/supabase';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { 
  Plus, Receipt, Search, FileText, Printer, Trash2, 
  ChevronLeft
} from 'lucide-react';
import { CustomReceiptPrinter } from './CustomReceiptPrinter';
import './managers.css';

interface CustomReceiptManagerProps {
  schoolId: string;
}

const EMPTY_ITEM = { description: '', quantity: 1, price: 0, total: 0 };

export const CustomReceiptManager: React.FC<CustomReceiptManagerProps> = ({ schoolId }) => {
  const [records, setRecords] = useState<CustomReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Form State
  const [type, setType] = useState<'invoice' | 'receipt'>('receipt');
  const [recipientName, setRecipientName] = useState('');
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [notes, setNotes] = useState('');
  const [receiptNo, setReceiptNo] = useState('');

  // Helpers
  const [parents, setParents] = useState<Parent[]>([]);
  const [printId, setPrintId] = useState<string | null>(null);
  const [view, setView] = useState<'history' | 'create'>('history');

  // Local styles injection
  useEffect(() => {
    const styleTag = document.createElement('style');
    styleTag.innerHTML = customReceiptStyles;
    document.head.appendChild(styleTag);
    return () => {
      if (document.head.contains(styleTag)) {
        document.head.removeChild(styleTag);
      }
    };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, parentRes] = await Promise.all([
        supabase.from('custom_receipts').select('id, school_id, type, receipt_no, recipient_name, parent_id, date, due_date, items, total_amount, notes, created_at').eq('school_id', schoolId).order('created_at', { ascending: false }),
        supabase.from('parents').select('id, school_id, first_name, last_name, relation, gender, cnic, contact, whatsapp, email, address, occupation, notes, is_active, opening_balance, created_at, updated_at').eq('school_id', schoolId).order('first_name')
      ]);

      if (recRes.error) throw recRes.error;
      setRecords(recRes.data || []);
      setParents(parentRes.data || []);
      
    } catch (err: any) {
      console.error('Error loading custom receipts:', err);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Next receipt number: type letter + YYMM + running count. Derived in memory; no refetch on type toggle.
  useEffect(() => {
    const today = new Date().toISOString().slice(2, 4) + new Date().toISOString().slice(5, 7);
    setReceiptNo(`${type.charAt(0).toUpperCase()}-${today}-${String(records.length + 1).padStart(3, '0')}`);
  }, [type, records.length]);

  // Handle Item Changes
  const updateItem = (idx: number, field: string, value: any) => {
    const newItems = [...items];
    const item = { ...newItems[idx], [field]: value };
    
    // Calculate row total
    if (field === 'quantity' || field === 'price') {
      item.total = Number(item.quantity) * Number(item.price);
    }
    
    newItems[idx] = item;
    setItems(newItems);
  };

  const addItem = () => setItems([...items, { ...EMPTY_ITEM }]);
  const removeItem = (idx: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== idx));
    }
  };

  const totalAmount = useMemo(() => items.reduce((sum, item) => sum + item.total, 0), [items]);

  const handleSave = async () => {
    if (!recipientName.trim() && !selectedParentId) return;
    if (items.some(i => !i.description.trim() || i.total <= 0)) return;

    setSaving(true);
    try {
      const finalName = selectedParentId 
          ? parents.find(p => p.id === selectedParentId)?.first_name + ' ' + parents.find(p => p.id === selectedParentId)?.last_name
          : recipientName;

      const { data, error } = await supabase.from('custom_receipts').insert({
        school_id: schoolId,
        type,
        receipt_no: receiptNo,
        recipient_name: finalName,
        parent_id: selectedParentId,
        date,
        due_date: type === 'invoice' ? (dueDate || null) : null,
        items,
        total_amount: totalAmount,
        notes: notes.trim() || null
      }).select().single();

      if (error) throw error;
      
      if (error) throw error;
      
      setView('history');
      resetForm();
      loadData();
      setPrintId(data.id); // Trigger print preview

    } catch (err: any) {
      alert('Error saving: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setType('receipt');
    setRecipientName('');
    setSelectedParentId(null);
    setDate(new Date().toISOString().split('T')[0]);
    setDueDate('');
    setItems([{ ...EMPTY_ITEM }]);
    setNotes('');
  };

  const filtered = records.filter(r => 
    r.recipient_name.toLowerCase().includes(search.toLowerCase()) ||
    r.receipt_no.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="manager-shell animate-fade-up">
      {view === 'history' ? (
        <>
          <div className="manager-toolbar">
            <div className="manager-title">
              <FileText size={24} />
              <div>
                <h3>Custom Invoices & Receipts</h3>
                <p>Manage and track generic school bills</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div className="manager-search-bar">
                <Search size={16} />
                <input 
                  placeholder="Search by name or number..." 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                />
              </div>
              <Button onClick={() => setView('create')}>
                <Plus size={18} /> New Bill
              </Button>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Number</th>
                  <th>Recipient</th>
                  <th style={{ textAlign: 'right' }}>Total Amount</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>Loading records...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No records found.</td></tr>
                ) : filtered.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontSize: '0.85rem' }}>{new Date(r.date).toLocaleDateString()}</td>
                    <td>
                      <span className={`rec-badge ${r.type}`}>
                        {r.type.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{r.receipt_no}</td>
                    <td style={{ fontWeight: 500 }}>{r.recipient_name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>Rs. {r.total_amount.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Button variant="outline" size="sm" onClick={() => setPrintId(r.id)}>
                        <Printer size={14} /> Print
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="create-view animate-fade-up">
          <div className="manager-toolbar">
            <div className="manager-title">
              <Button variant="ghost" size="sm" onClick={() => setView('history')} style={{ marginRight: '0.5rem' }}>
                <ChevronLeft size={18} /> Back
              </Button>
              <div className={`icon-circle ${type}`} style={{ width: '32px', height: '32px' }}>
                {type === 'receipt' ? <Receipt size={18} /> : <FileText size={18} />}
              </div>
              <h3 style={{ marginLeft: '0.5rem' }}>Step 1: Recipient & Step 2: Document Info</h3>
            </div>
          </div>

          <div className="manager-card card" style={{ padding: '2rem' }}>
            {/* STEP 1: RECIPIENT */}
            <div style={{ marginBottom: '2rem' }}>
              <div className="form-section-label" style={{ marginBottom: '1rem' }}>Step 1: Select or Add Recipient</div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Search System Parent</label>
                  <select 
                    className="form-select" 
                    value={selectedParentId || ''} 
                    onChange={e => {
                      setSelectedParentId(e.target.value || null);
                      if (e.target.value) setRecipientName('');
                    }}
                  >
                    <option value="">Select a Parent from system...</option>
                    {parents.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.cnic})</option>)}
                  </select>
                </div>
                <div style={{ padding: '0 0.5rem', display: 'flex', alignItems: 'flex-end', paddingBottom: '10px', color: 'var(--text-muted)' }}>OR</div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Manual Recipient Name</label>
                  <input 
                    className="form-input" 
                    placeholder="Type external person or entity name..." 
                    value={recipientName} 
                    onChange={e => {
                      setRecipientName(e.target.value);
                      setSelectedParentId(null);
                    }}
                    disabled={!!selectedParentId}
                  />
                </div>
              </div>
            </div>

            {/* STEP 2: Document Info */}
            <div style={{ marginBottom: '2rem' }}>
              <div className="form-section-label" style={{ marginBottom: '1rem' }}>Step 2: Document Details</div>
              <div className="form-row" style={{ display: 'flex', gap: '1.5rem', background: 'var(--surface)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Document Type</label>
                  <div className="pay-method-row" style={{ marginTop: '0.5rem' }}>
                    <button 
                      className={`pay-method-btn ${type === 'receipt' ? 'active' : ''}`} 
                      onClick={() => setType('receipt')}
                    >
                      Payment Receipt (PAID)
                    </button>
                    <button 
                      className={`pay-method-btn ${type === 'invoice' ? 'active' : ''}`} 
                      onClick={() => setType('invoice')}
                    >
                      Professional Invoice
                    </button>
                  </div>
                </div>
                <div style={{ width: '220px' }}>
                  <Input label="Receipt/Invoice #" value={receiptNo} onChange={e => setReceiptNo(e.target.value)} />
                </div>
                <div style={{ width: '180px' }}>
                  <label className="form-label">Date</label>
                  <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
                </div>
                {type === 'invoice' && (
                  <div style={{ width: '180px' }}>
                    <label className="form-label">Due Date</label>
                    <input type="date" className="form-input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                  </div>
                )}
              </div>
            </div>

            {/* STEP 3: Line Items */}
            <div style={{ marginBottom: '2rem' }}>
              <div className="form-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span>Step 3: Billable Items</span>
                <Button size="sm" variant="outline" onClick={addItem}><Plus size={12} /> Add Row</Button>
              </div>
              
              <div className="table-wrap worksheet-wrap" style={{ marginBottom: '2rem', overflowX: 'auto', background: 'var(--surface)' }}>
                <table className="data-table worksheet-table compact" style={{ minWidth: '700px', margin: 0 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                      <th style={{ paddingLeft: '1.5rem', color: 'var(--text-secondary)' }}>Item Description</th>
                      <th style={{ width: '100px', textAlign: 'center', color: 'var(--text-secondary)' }}>Qty</th>
                      <th style={{ width: '150px', color: 'var(--text-secondary)' }}>Price</th>
                      <th style={{ width: '150px', textAlign: 'right', paddingRight: '1.5rem', color: 'var(--text-secondary)' }}>Total</th>
                      <th style={{ width: '50px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ paddingLeft: '1.5rem' }}>
                          <input 
                            className="table-input" 
                            placeholder="What are you charging for?" 
                            value={item.description} 
                            onChange={e => updateItem(idx, 'description', e.target.value)}
                          />
                        </td>
                        <td>
                          <input 
                            type="number" 
                            className="table-input centered" 
                            value={item.quantity} 
                            onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 0)}
                          />
                        </td>
                        <td>
                          <input 
                            type="number" 
                            className="table-input" 
                            placeholder="0.00" 
                            value={item.price || ''} 
                            onChange={e => updateItem(idx, 'price', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, paddingRight: '1.5rem' }}>
                          Rs. {item.total.toLocaleString()}
                        </td>
                        <td>
                          <button 
                            className="icon-btn-danger" 
                            onClick={() => removeItem(idx)}
                            disabled={items.length === 1}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="form-grid" style={{ alignItems: 'flex-start' }}>
              <div className="span-2">
                <label className="form-label">Notes & Instructions</label>
                <textarea 
                  className="form-textarea" 
                  rows={2} 
                  placeholder="Additional information or internal notes..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
              <div className="span-2" style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ textAlign: 'right', marginRight: '3rem' }}>
                  <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Amount Payable</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)' }}>
                    Rs. {totalAmount.toLocaleString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                  <Button variant="secondary" size="lg" onClick={() => setView('history')}>Cancel</Button>
                  <Button 
                    size="lg"
                    onClick={handleSave} 
                    isLoading={saving}
                    disabled={(!recipientName.trim() && !selectedParentId) || items.some(i => i.total <= 0)}
                  >
                    Save & Generate Document
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Printer Overlay */}
      {printId && (
        <CustomReceiptPrinter 
          schoolId={schoolId} 
          receiptId={printId} 
          onClose={() => setPrintId(null)} 
        />
      )}
    </div>
  );
};

// Styles moved into a safe block
const customReceiptStyles = `
  .rec-badge {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .rec-badge.receipt {
    background: #dcfce7;
    color: #166534;
  }
  .rec-badge.invoice {
    background: #dbeafe;
    color: #1e40af;
  }
  .icon-circle.receipt { background: #dcfce7; color: #166534; }
  .icon-circle.invoice { background: #dbeafe; color: #1e40af; }
  
  /* Standardizing table inputs to work with data-table */
  .data-table .table-input {
    width: 100%;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    padding: 6px 12px;
    font-size: 0.85rem;
    border-radius: 6px;
    transition: all 0.2s;
  }
  .data-table .table-input:hover {
    border-color: var(--text-muted);
  }
  .data-table .table-input:focus {
    border-color: var(--primary);
    background: var(--surface);
    outline: none;
    box-shadow: 0 0 0 2px var(--primary-light);
  }
  .data-table.compact td { padding: 8px !important; }
  
  .worksheet-wrap {
    border: 1px solid var(--border) !important;
    border-radius: var(--radius-lg);
  }
  
  .worksheet-table td {
    border-bottom: 1px solid var(--border) !important;
  }
  
  .worksheet-table .table-input {
    width: 100%;
    border: 1.5px solid var(--border) !important;
    background: var(--bg) !important;
    color: var(--text) !important;
    padding: 8px 12px !important;
    font-size: 0.9rem !important;
    border-radius: 8px !important;
    transition: all 0.25s !important;
  }
  
  .worksheet-table .table-input:hover {
    border-color: var(--text-muted) !important;
  }
  
  .worksheet-table .table-input:focus {
    border-color: var(--primary) !important;
    background: var(--surface) !important;
    outline: none !important;
    box-shadow: 0 0 0 3px var(--primary-light) !important;
  }
  
  .icon-btn-danger {
    background: none;
    border: none;
    color: var(--danger);
    cursor: pointer;
    opacity: 0.6;
    transition: all 0.2s;
  }
  .icon-btn-danger:hover:not(:disabled) { opacity: 1; transform: scale(1.1); }
  .icon-btn-danger:disabled { opacity: 0.2; cursor: not-allowed; }
`;
