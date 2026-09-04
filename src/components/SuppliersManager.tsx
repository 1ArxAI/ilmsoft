import { useState, useEffect } from 'react';
import type { Role } from '../lib/supabase';
import { useFlashMessage } from '../hooks/useFlashMessage';
import { Button } from './ui/Button';
import { Trash2 } from 'lucide-react';
import './SuppliersManager.css';

// Sub-components
import { SupplierTable } from './suppliers/SupplierTable';
import { SupplierForm } from './suppliers/SupplierForm';
import { PaymentForm } from './suppliers/PaymentForm';
import { BillForm } from './suppliers/BillForm';
import { SupplierLedger } from './suppliers/SupplierLedger';

// Hook and types
import { useSuppliers } from './suppliers/useSuppliers';
import type { Supplier, ViewType } from './suppliers/types';

export const SuppliersManager = ({ schoolId, role }: { schoolId: string; role?: Role }) => {
  const isOwner = role === 'owner';
  const { flash, showFlash } = useFlashMessage(4000);
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('list');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  const {
    suppliers,
    transactions,
    loading,
    addSupplier,
    deleteSupplier,
    addPayment,
    addBill,
    loadTransactions
  } = useSuppliers(schoolId);

  useEffect(() => {
    if (selectedSupplier && currentView === 'ledger') {
      loadTransactions(selectedSupplier.id);
    }
  }, [selectedSupplier, currentView, loadTransactions]);

  const handleAddSupplier = async (data: any) => {
    try {
      await addSupplier(data);
      showFlash('Supplier added successfully');
      setCurrentView('list');
    } catch (err: any) {
      showFlash('Error adding supplier: ' + err.message);
    }
  };

  const handleAddPayment = async (data: any) => {
    if (!selectedSupplier) return;
    try {
      await addPayment(selectedSupplier, data);
      showFlash('Payment recorded successfully');
      setCurrentView('list');
      setSelectedSupplier(null);
    } catch (err: any) {
      showFlash('Error recording payment: ' + err.message);
    }
  };

  const handleAddBill = async (data: any) => {
    if (!selectedSupplier) return;
    try {
      await addBill(selectedSupplier, data);
      showFlash('Bill recorded successfully');
      setCurrentView('list');
      setSelectedSupplier(null);
    } catch (err: any) {
      showFlash('Error recording bill: ' + err.message);
    }
  };

  const handleDeleteSupplier = (id: string) => {
    setConfirmAction({
      message: 'Delete this supplier?',
      onConfirm: async () => {
        try {
          await deleteSupplier(id);
          showFlash('Supplier deleted');
        } catch (err: any) {
          showFlash('Error deleting supplier: ' + err.message);
        }
        setConfirmAction(null);
      }
    });
  };

  const selectSupplier = (supplier: Supplier, view: ViewType) => {
    setSelectedSupplier(supplier);
    setCurrentView(view);
  };

  const goBack = () => {
    setSelectedSupplier(null);
    setCurrentView('list');
  };

  if (loading && currentView === 'list') {
    return <div className="suppliers-manager"><div className="loading">Loading suppliers...</div></div>;
  }

  const flashAndConfirm = (
    <>
      {flash && <div className={`flash ${flash.startsWith('Error') ? 'error' : 'success'}`}>{flash}</div>}
      {confirmAction && (
        <div className="modal-backdrop" onClick={() => setConfirmAction(null)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <Trash2 size={40} color="var(--danger)" />
            <h3>{confirmAction.message}</h3>
            <div className="confirm-box-btns">
              <Button variant="secondary" onClick={() => setConfirmAction(null)}>Cancel</Button>
              <Button variant="danger" onClick={confirmAction.onConfirm}>Confirm</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {currentView === 'list' && (
        <SupplierTable 
          suppliers={suppliers} 
          isOwner={isOwner} 
          onAddClick={() => setCurrentView('add')}
          onActionClick={selectSupplier}
          onDeleteClick={handleDeleteSupplier}
        />
      )}

      {currentView === 'add' && (
        <SupplierForm 
          onSubmit={handleAddSupplier} 
          onCancel={goBack} 
        />
      )}

      {currentView === 'payment' && selectedSupplier && (
        <PaymentForm 
          supplier={selectedSupplier} 
          onSubmit={handleAddPayment} 
          onCancel={goBack} 
        />
      )}

      {currentView === 'bill' && selectedSupplier && (
        <BillForm 
          supplier={selectedSupplier} 
          onSubmit={handleAddBill} 
          onCancel={goBack} 
        />
      )}

      {currentView === 'ledger' && selectedSupplier && (
        <SupplierLedger 
          supplier={selectedSupplier} 
          transactions={transactions} 
          onBack={goBack} 
        />
      )}

      {flashAndConfirm}
    </>
  );
};
