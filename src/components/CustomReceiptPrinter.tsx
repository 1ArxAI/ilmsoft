import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/Button';
import { Printer, X, Loader2 } from 'lucide-react';
import './PaymentReceipt.css'; 

interface CustomReceiptItem {
  description: string;
  quantity: number;
  price: number;
  total: number;
}

interface CustomReceiptData {
  id: string;
  type: 'invoice' | 'receipt';
  receipt_no: string;
  recipient_name: string;
  date: string;
  due_date: string | null;
  items: CustomReceiptItem[];
  total_amount: number;
  notes: string | null;
}

interface CustomReceiptPrinterProps {
  schoolId: string;
  receiptId: string;
  onClose: () => void;
}

export const CustomReceiptPrinter: React.FC<CustomReceiptPrinterProps> = ({ receiptId, onClose }) => {
  // School name and logo are already in the signed-in profile; no extra query.
  const { profile } = useAuth();
  const school = { name: profile?.school_name || 'School', logo: profile?.logo_url || '' };
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CustomReceiptData | null>(null);
  const [logoLoaded, setLogoLoaded] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: recRes, error } = await supabase
        .from('custom_receipts')
        .select('id, type, receipt_no, recipient_name, date, due_date, items, total_amount, notes, school_id')
        .eq('id', receiptId)
        .single();

      if (error) throw error;
      setData(recRes);

    } catch (err: any) {
      console.error('Error loading custom receipt:', err);
    } finally {
      setLoading(false);
    }
  }, [receiptId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return createPortal(
    <div className="receipt-print-overlay printer-preview-theme" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: 'white' }}>
        <Loader2 className="spin" size={48} style={{ marginBottom: '1rem', margin: '0 auto' }} />
        <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>Preparing Document...</div>
      </div>
    </div>,
    document.body
  );

  if (!data) return createPortal(
    <div className="receipt-print-overlay printer-preview-theme">
      <div className="no-invoices-message" style={{ textAlign: 'center', padding: '5rem', color: 'white' }}>
        <p style={{ fontSize: '1.2rem', marginBottom: '1.5rem' }}>Could not load document data.</p>
        <Button onClick={onClose} variant="secondary">Close Preview</Button>
      </div>
    </div>,
    document.body
  );

  return createPortal(
    <div className="receipt-print-overlay printer-preview-theme" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
      <style>{`
        .printer-preview-theme {
          background: #334155 !important;
          color: #f8fafc !important;
          overflow-y: auto !important;
        }
        .printer-preview-theme .receipt-page {
          background: white !important;
          color: black !important;
          box-shadow: 0 0 50px rgba(0,0,0,0.3);
        }
        .printer-preview-theme .receipt-page * {
          color: black !important;
        }
        .printer-preview-theme .payment-status-watermark {
          color: rgba(0, 0, 0, 0.05) !important;
        }
        .printer-preview-theme .receipt-details-table th {
          background-color: #f1f5f9 !important;
          border-color: #000 !important;
        }
        .printer-preview-theme .receipt-details-table td {
          border-color: #e2e8f0 !important;
        }
        .printer-preview-theme .summary-row.total {
          border-top: 2px solid #000 !important;
        }
        .printer-preview-theme .receipt-header {
           border-bottom: 2px solid #000 !important;
        }
        @media print {
          .printer-preview-theme { background: none !important; }
          .printer-preview-theme .receipt-page { box-shadow: none !important; }
        }
      `}</style>

      <div className="print-controls no-print">
        <Button 
          variant="primary" 
          size="lg" 
          onClick={() => window.print()}
          disabled={!!school.logo && !logoLoaded}
          title={!!school.logo && !logoLoaded ? "Waiting for logo to load..." : ""}
        >
          <Printer size={20} /> Print {data.type === 'invoice' ? 'Invoice' : 'Receipt'}
        </Button>
        <Button variant="outline" size="lg" onClick={onClose}>
          <X size={20} /> Close Preview
        </Button>
      </div>

      <div className="receipt-page">
        {data.type === 'receipt' && <div className="payment-status-watermark">PAID</div>}
        
        <div className="receipt-item">
          <div className="receipt-header">
            <div className="school-info">
              <h1 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{school.name}</h1>
              <div className="receipt-meta">
                <span style={{ textTransform: 'uppercase', fontWeight: 800, fontSize: '1rem', color: 'var(--primary)' }}>
                  {data.type}
                </span>
                <span className="separator">|</span>
                <span style={{ fontWeight: 600 }}>No: {data.receipt_no}</span>
              </div>
            </div>
            <div className="school-logo-wrap">
              {school.logo && (
                <img 
                  src={school.logo} 
                  alt="Logo" 
                  className="school-logo" 
                  crossOrigin="anonymous"
                  onLoad={() => setLogoLoaded(true)}
                  onError={() => setLogoLoaded(true)}
                />
              )}
            </div>
          </div>

          <div className="parent-info" style={{ marginTop: '20px' }}>
            <table style={{ width: '100%', marginBottom: '20px', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ width: '15%', fontWeight: 700, padding: '8px 0' }}>Recipient:</td>
                  <td style={{ width: '35%', borderBottom: '1px solid #eee' }}>{data.recipient_name}</td>
                  <td style={{ width: '15%', fontWeight: 700, padding: '8px 0', paddingLeft: '20px' }}>Date:</td>
                  <td style={{ width: '35%', borderBottom: '1px solid #eee' }}>{new Date(data.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</td>
                </tr>
                {data.type === 'invoice' && data.due_date && (
                  <tr>
                    <td colSpan={2}></td>
                    <td style={{ fontWeight: 700, padding: '8px 0', paddingLeft: '20px', color: '#ef4444' }}>Due Date:</td>
                    <td style={{ color: '#ef4444', fontWeight: 700, borderBottom: '1px solid #fee2e2' }}>
                      {new Date(data.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <table className="receipt-details-table" style={{ marginTop: '10px' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px', textAlign: 'left' }}>Description of Service/Items</th>
                <th style={{ width: '80px', padding: '12px', textAlign: 'center' }}>Qty</th>
                <th style={{ width: '120px', padding: '12px', textAlign: 'right' }}>Unit Price</th>
                <th style={{ width: '140px', padding: '12px', textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ padding: '10px 12px' }}>{item.description}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>Rs. {item.price.toLocaleString()}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>Rs. {item.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="receipt-footer" style={{ marginTop: '30px' }}>
            <div className="receipt-note" style={{ flex: 1 }}>
              {data.notes ? (
                <>
                  <p style={{ fontWeight: 700, marginBottom: '4px', fontStyle: 'normal' }}>Notes & Instructions:</p>
                  <p style={{ lineHeight: 1.4 }}>{data.notes}</p>
                </>
              ) : (
                <p>This is a computer generated {data.type}.</p>
              )}
            </div>

            <div className="summary-box" style={{ width: '250px' }}>
              <div className="summary-row total" style={{ padding: '10px 0' }}>
                <span style={{ fontSize: '1.1rem' }}>Total Amount:</span>
                <span style={{ fontSize: '1.25rem' }}>Rs. {data.total_amount.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
