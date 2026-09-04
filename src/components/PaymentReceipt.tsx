import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from './ui/Button';
import { Printer, X, Loader2 } from 'lucide-react';
import './PaymentReceipt.css';

interface PaymentData {
  id: string;
  parentId: string;
  parentName: string;
  contact: string;
  amount: number;
  method: string;
  notes: string;
  receivedAt: string;
  students: string[];
  remainingBalance: number;
}

interface PaymentReceiptProps {
  schoolId: string;
  paymentId: string;
  onClose: () => void;
}

export const PaymentReceipt: React.FC<PaymentReceiptProps> = ({ schoolId, paymentId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<PaymentData | null>(null);
  const [schoolName, setSchoolName] = useState('School Receipt');
  const [logo, setLogo] = useState<string | null>(null);
  const [logoLoaded, setLogoLoaded] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [schoolRes, payRes] = await Promise.all([
        supabase.from('schools').select('school_name, logo_url').eq('id', schoolId).single(),
        supabase
          .from('payments')
          .select(`
            id, parent_id, received_amount, payment_method, notes, received_at,
            parents:parent_id(first_name, last_name, contact, students(first_name, last_name), parent_balances(balance))
          `)
          .eq('id', paymentId)
          .single(),
      ]);
      if (schoolRes.data) { setSchoolName(schoolRes.data.school_name); setLogo(schoolRes.data.logo_url); }
      if (payRes.error) throw payRes.error;
      const paymentData = payRes.data as any;
      const studentData = (paymentData.parents?.students || []) as { first_name: string; last_name: string }[];
      const balData = (paymentData.parents?.parent_balances?.[0] ?? paymentData.parents?.parent_balances) as { balance: number } | undefined;

      setReceipt({
        id: paymentData.id,
        parentId: paymentData.parent_id,
        parentName: `${paymentData.parents.first_name} ${paymentData.parents.last_name}`,
        contact: paymentData.parents.contact,
        amount: paymentData.received_amount,
        method: paymentData.payment_method,
        notes: paymentData.notes || '—',
        receivedAt: paymentData.received_at,
        students: studentData?.map(s => `${s.first_name} ${s.last_name}`) || [],
        remainingBalance: balData?.balance || 0
      });

    } catch (err: any) {
      console.error('Error fetching receipt data:', err);
    } finally {
      setLoading(false);
    }
  }, [schoolId, paymentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) return (
    <div className="receipt-print-overlay">
      <div className="dash-loading"><Loader2 className="spin" /> Preparing Receipt...</div>
    </div>
  );

  if (!receipt) return (
    <div className="receipt-print-overlay">
      <div className="no-invoices-message">
        <p>Could not load receipt data.</p>
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );

  const dateStr = new Date(receipt.receivedAt).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  return (
    <div className="receipt-print-overlay">
      <div className="print-controls no-print">
        <Button 
          variant="primary" 
          size="lg" 
          onClick={handlePrint}
          disabled={!!logo && !logoLoaded}
          title={!!logo && !logoLoaded ? "Waiting for logo to load..." : ""}
        >
          <Printer size={20} /> Print Receipt
        </Button>
        <Button variant="outline" size="lg" onClick={onClose}>
          <X size={20} /> Close Preview
        </Button>
      </div>

      <div className="receipt-page">
        <div className="payment-status-watermark">PAID</div>
        
        <div className="receipt-item">
          <div className="receipt-header">
            <div className="school-info">
              <h1>{schoolName}</h1>
              <div className="receipt-meta">
                <span>Payment Receipt</span>
                <span className="separator">|</span>
                <span>ID: {receipt.id.slice(0, 8)}</span>
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
                  onError={() => setLogoLoaded(true)}
                />
              )}
            </div>
          </div>

          <div className="parent-info">
            <table>
              <tbody>
                <tr>
                  <td style={{ width: '15%', fontWeight: 700 }}>Parent:</td>
                  <td>{receipt.parentName}</td>
                  <td style={{ width: '15%', fontWeight: 700 }}>Contact:</td>
                  <td>{receipt.contact}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700, paddingTop: '8px' }}>Students:</td>
                  <td colSpan={3} style={{ paddingTop: '8px' }}>{receipt.students.join(', ')}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <table className="receipt-details-table">
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ textAlign: 'center' }}>Method</th>
                <th style={{ textAlign: 'right' }}>Amount Paid</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div><strong>School Fee Payment</strong></div>
                  <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '2px' }}>
                    Date: {dateStr}
                  </div>
                  {receipt.notes !== '—' && (
                    <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '2px' }}>
                      Ref/Notes: {receipt.notes}
                    </div>
                  )}
                </td>
                <td style={{ textAlign: 'center', textTransform: 'capitalize' }}>{receipt.method}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>Rs. {receipt.amount.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <div className="receipt-footer">
            <div className="receipt-note">
              <p>This is a computer-generated proof of payment. Thank you for your continued support.</p>
            </div>

            <div className="summary-box">
              <div className="summary-row">
                <span><strong>Balance/advance:</strong></span>
                <span>Rs. {Math.abs(receipt.remainingBalance).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
