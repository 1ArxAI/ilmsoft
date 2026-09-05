import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, fetchAll } from '../lib/supabase';
import { Button } from './ui/Button';
import { Printer, X, Loader2, Search, Filter, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import './InvoicePrinter.css';

interface InvoiceData {
  parentId: string;
  parentName: string;
  contact: string;
  students: {
    name: string;
    className: string;
    grossFee: number;
    discountType: string | null;
    discountValue: number;
    discountAmount: number;
    netAmount: number;
  }[];
  currentMonthTotal: number;
  prevBalance: number; // Positive = arrears, Negative = advance (standard school convention: arrears are positive on bill usually, but our ledger uses negative for dues)
  totalDue: number;
}

interface InvoicePrinterProps {
  schoolId: string;
  month: string; // YYYY-MM
  onClose: () => void;
  parentId?: string; // Optional: if provided, only prints for this parent
}

export const InvoicePrinter: React.FC<InvoicePrinterProps> = ({ schoolId, month, onClose, parentId }) => {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [schoolName, setSchoolName] = useState('School Invoice');
  const [logo, setLogo] = useState<string | null>(null);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [classList, setClassList] = useState<{id: string, name: string}[]>([]);
  
  // Filtering states
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [batchSize, setBatchSize] = useState(20);
  const [currentBatch, setCurrentBatch] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // All five reads are independent: run them together.
      let parentQuery = supabase
        .from('parents')
        .select(`
          id, first_name, last_name, contact,
          parent_balances(balance)
        `)
        .eq('school_id', schoolId);
      if (parentId) parentQuery = parentQuery.eq('id', parentId);

      let feeQuery = supabase
        .from('student_monthly_fees')
        .select(`
          parent_id,
          net_amount,
          gross_amount,
          discount_type,
          discount_value,
          discount_amount,
          students:student_id(first_name, last_name),
          classes:class_id(name)
        `)
        .eq('school_id', schoolId)
        .eq('month', month);
      if (parentId) feeQuery = feeQuery.eq('parent_id', parentId);

      // Students are only needed as a fallback when a parent has no fee rows this month.
      let studentQuery = supabase
        .from('students')
        .select('parent_id, first_name, last_name, classes:current_class_id(name)')
        .eq('school_id', schoolId)
        .eq('active', true);
      if (parentId) studentQuery = studentQuery.eq('parent_id', parentId);

      const [schoolRes, classRes, parentRes, feeRes, studentRes] = await Promise.all([
        supabase.from('schools').select('school_name, logo_url').eq('id', schoolId).single(),
        supabase.from('classes').select('id, name').eq('school_id', schoolId).order('name'),
        fetchAll((from, to) => parentQuery.order('id').range(from, to)),
        fetchAll((from, to) => feeQuery.order('id').range(from, to)),
        fetchAll((from, to) => studentQuery.order('id').range(from, to)),
      ]);

      if (schoolRes.data) { setSchoolName(schoolRes.data.school_name); setLogo(schoolRes.data.logo_url); }
      if (classRes.data) setClassList(classRes.data);
      if (parentRes.error) throw parentRes.error;
      const parentData = parentRes.data;
      const monthlyFees = feeRes.data;
      const allStudents = studentRes.data;

      // Helper to group by parent
      const parentInvoices: InvoiceData[] = [];

      parentData.forEach(p => {
        const pFees = monthlyFees?.filter(f => f.parent_id === p.id) || [];
        
        // If no fees and no specific parentId provided, skip (avoids printing thousands of empty invoices in batch)
        // BUT if parentId IS provided, we MUST show the invoice/statement.
        if (pFees.length === 0 && !parentId) return;

        // Current real balance from DB
        const dbBalance = (p.parent_balances as any)?.[0]?.balance || 0;
        const arrearsTotal = -dbBalance; // Convert negative balance to positive arrears

        const currentMonthTotal = pFees.reduce((sum, f) => sum + f.net_amount, 0);
        const prevArrears = arrearsTotal - currentMonthTotal;
        
        // Get students either from fees or from the students table
        let invoiceStudents = pFees.map(f => ({
          name: `${(f.students as any).first_name} ${(f.students as any).last_name}`,
          className: (f.classes as any)?.name || 'Unassigned',
          grossFee: f.gross_amount,
          discountType: f.discount_type,
          discountValue: f.discount_value,
          discountAmount: f.discount_amount,
          netAmount: f.net_amount
        }));

        if (invoiceStudents.length === 0) {
          const pStudents = allStudents?.filter(s => s.parent_id === p.id) || [];
          invoiceStudents = pStudents.map(s => ({
            name: `${s.first_name} ${s.last_name}`,
            className: (s.classes as any)?.name || 'Unassigned',
            grossFee: 0,
            discountType: null,
            discountValue: 0,
            discountAmount: 0,
            netAmount: 0
          }));
        }

        // Only add if there's either a charge or a non-zero balance
        if (invoiceStudents.length > 0 || arrearsTotal !== 0) {
          parentInvoices.push({
            parentId: p.id,
            parentName: `${p.first_name} ${p.last_name}`,
            contact: p.contact,
            students: invoiceStudents,
            currentMonthTotal,
            prevBalance: prevArrears,
            totalDue: arrearsTotal
          });
        }
      });

      setInvoices(parentInvoices);
    } catch (err: any) {
      console.error('Error fetching invoice data:', err);
    } finally {
      setLoading(false);
    }
  }, [schoolId, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrint = () => {
    window.print();
  };

  const selectedClassName = useMemo(() => classList.find(c => c.id === selectedClass)?.name, [classList, selectedClass]);
  const filteredInvoices = useMemo(() => invoices.filter(inv => {
    const matchesSearch = inv.parentName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         inv.contact.includes(searchTerm);
    const matchesClass = selectedClass === 'all' || 
                        inv.students.some(s => s.className === selectedClassName);
    
    return matchesSearch && matchesClass;
  }), [invoices, searchTerm, selectedClass, selectedClassName]);

  if (loading) return (
    <div className="invoice-print-overlay">
      <div className="dash-loading"><Loader2 className="spin" /> Preparing Invoices...</div>
    </div>
  );

  const [year, monthNum] = month.split('-');
  const monthName = new Date(Number(year), Number(monthNum) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  const dueDate = `9th ${monthName}`;

  // Filtering Logic

  const totalBatches = Math.ceil(filteredInvoices.length / batchSize);
  const displayedInvoices = filteredInvoices.slice(
    currentBatch * batchSize, 
    (currentBatch * batchSize) + batchSize
  );

  return (
    <div className="invoice-print-overlay">
      <div className="print-controls no-print">
        <div className="main-actions">
          <Button 
            variant="primary" 
            size="lg" 
            onClick={handlePrint} 
            disabled={!!logo && !logoLoaded}
            title={!!logo && !logoLoaded ? "Waiting for logo to load..." : ""}
          >
            <Printer size={20} /> {parentId ? 'Print Invoice' : `Print Current Batch (${displayedInvoices.length})`}
          </Button>
          <Button variant="outline" size="lg" onClick={onClose}>
            <X size={20} /> Close Preview
          </Button>
        </div>

        {!parentId && (
          <div className="filter-toolbar">
          <div className="filter-group search">
            <Search size={16} />
            <input 
              type="text" 
              placeholder="Search parent..." 
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentBatch(0);
              }}
            />
          </div>

          <div className="filter-group">
            <Filter size={16} />
            <select 
              value={selectedClass} 
              onChange={(e) => {
                setSelectedClass(e.target.value);
                setCurrentBatch(0);
              }}
            >
              <option value="all">All Classes</option>
              {classList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <Layers size={16} />
            <select 
              value={batchSize} 
              onChange={(e) => {
                setBatchSize(Number(e.target.value));
                setCurrentBatch(0);
              }}
            >
              <option value={10}>10 per batch</option>
              <option value={20}>20 per batch</option>
              <option value={50}>50 per batch</option>
              <option value={100}>100 per batch</option>
              <option value={9999}>All (No batching)</option>
            </select>
          </div>

          {totalBatches > 1 && (
            <div className="batch-nav">
              <Button 
                variant="ghost" 
                size="sm" 
                disabled={currentBatch === 0}
                onClick={() => setCurrentBatch(prev => prev - 1)}
              >
                <ChevronLeft size={16} />
              </Button>
              <span>Batch {currentBatch + 1} of {totalBatches}</span>
              <Button 
                variant="ghost" 
                size="sm" 
                disabled={currentBatch === totalBatches - 1}
                onClick={() => setCurrentBatch(prev => prev + 1)}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </div>
        )}
      </div>

      <div className="invoice-page">
        {displayedInvoices.length === 0 ? (
          <div className="no-invoices-message">
            <p>No invoices matching your filters.</p>
          </div>
        ) : displayedInvoices.map((inv) => (
          <div key={inv.parentId} className="invoice-item">
            <div className="invoice-header">
              <div className="school-info">
                <h1>{schoolName}</h1>
                <div className="invoice-meta">
                  <span>{inv.currentMonthTotal > 0 ? `Fee Invoice - ${monthName}` : 'Outstanding Balance Statement'}</span>
                  <span className="separator">|</span>
                  <span>Parent Code: {inv.parentId.slice(0, 8)}</span>
                </div>
              </div>
              <div className="school-logo-wrap">
                {logo && (
                  <img 
                    src={logo} 
                    alt="Logo" 
                    className="school-logo" 
                    crossOrigin="anonymous"
                    onLoad={() => setLogoLoaded(true)}
                    onError={() => setLogoLoaded(true)} // Don't block print if logo fails
                  />
                )}
              </div>
            </div>

            <div className="parent-info">
              <table>
                <tbody>
                  <tr>
                    <td style={{ width: '15%', fontWeight: 700 }}>Parent:</td>
                    <td>{inv.parentName}</td>
                    <td style={{ width: '15%', fontWeight: 700 }}>Contact:</td>
                    <td>{inv.contact}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <table className="students-table">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Class</th>
                  <th style={{ textAlign: 'right' }}>Gross Fee</th>
                  <th style={{ textAlign: 'right' }}>Discount</th>
                  <th style={{ textAlign: 'right' }}>Net Fee</th>
                </tr>
              </thead>
              <tbody>
                {inv.students.map((s, idx) => (
                  <tr key={idx}>
                    <td>{s.name}</td>
                    <td>{s.className}</td>
                    <td style={{ textAlign: 'right' }}>Rs. {s.grossFee.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      {s.discountAmount > 0 ? `-Rs. ${s.discountAmount.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>Rs. {s.netAmount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

          <div className="invoice-footer">
            <div className="due-date-note">
              <strong>Due Date: {dueDate}</strong>
              <p style={{ margin: '2px 0 0 0', opacity: 0.8 }}>Please pay by the due date to avoid late payment surcharge.</p>
            </div>

            <div className="summary-box">
              <div className="summary-row">
                <span>Current Month Total:</span>
                <span>Rs. {inv.currentMonthTotal.toLocaleString()}</span>
              </div>
              <div className="summary-row">
                <span>{inv.prevBalance >= 0 ? 'Previous Arrears:' : 'Previous Advance:'}</span>
                <span>Rs. {Math.abs(inv.prevBalance).toLocaleString()}</span>
              </div>
              <div className="summary-row total">
                <span>TOTAL PAYABLE:</span>
                <span>Rs. {Math.max(0, inv.totalDue).toLocaleString()}</span>
              </div>
            </div>
          </div>
          </div>
        ))}
      </div>
    </div>
  );
};
