import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { Supplier, SupplierTransaction } from './types';

export const useSuppliers = (schoolId: string) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [transactions, setTransactions] = useState<SupplierTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    
    // Fetch suppliers
    const { data: suppliersData, error: suppliersError } = await supabase
      .from('suppliers')
      .select('id, school_id, supplier_name, business_name, contact_number, address, opening_balance, current_balance, notes, created_at')
      .eq('school_id', schoolId)
      .order('supplier_name');
    
    if (suppliersError) console.error('Error loading suppliers:', suppliersError);

    // Fetch all transaction totals for this school
    const { data: txData, error: txError } = await supabase
      .from('supplier_transactions')
      .select('supplier_id, type, amount')
      .eq('school_id', schoolId);

    if (txError) console.error('Error loading transaction totals:', txError);

    // Compute balances: Opening + Sum(Bills) - Sum(Payments)
    const processedSuppliers = (suppliersData || []).map(s => {
      const supplierTxs = (txData || []).filter(tx => tx.supplier_id === s.id);
      const totalBills = supplierTxs.filter(tx => tx.type === 'bill').reduce((acc, tx) => acc + (tx.amount || 0), 0);
      const totalPayments = supplierTxs.filter(tx => tx.type === 'payment').reduce((acc, tx) => acc + (tx.amount || 0), 0);
      
      return {
        ...s,
        current_balance: (s.opening_balance || 0) + totalBills - totalPayments
      };
    });

    setSuppliers(processedSuppliers);
    setLoading(false);
  }, [schoolId]);

  const loadTransactions = useCallback(async (supplierId: string) => {
    const { data, error } = await supabase
      .from('supplier_transactions')
      .select('id, school_id, supplier_id, type, amount, date, description, notes, payment_method, bill_number, balance_after, created_at')
      .eq('supplier_id', supplierId)
      .eq('school_id', schoolId)
      .order('date', { ascending: false });
    
    if (error) console.error('Error loading transactions:', error);
    setTransactions(data || []);
  }, [schoolId]);

  const addSupplier = async (supplierData: any) => {
    const { error } = await supabase.from('suppliers').insert({
      school_id: schoolId,
      ...supplierData,
      current_balance: supplierData.opening_balance
    });
    if (error) throw error;
    await loadSuppliers();
  };

  const deleteSupplier = async (id: string) => {
    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', id)
      .eq('school_id', schoolId);
    if (error) throw error;
    await loadSuppliers();
  };

  const addPayment = async (supplier: Supplier, paymentData: any) => {
    const amount = parseInt(paymentData.amount);
    const newBalance = supplier.current_balance - amount;

    // Update supplier balance
    const { error: supplierUpdateError } = await supabase
      .from('suppliers')
      .update({ 
        current_balance: newBalance
      })
      .eq('id', supplier.id);

    if (supplierUpdateError) throw supplierUpdateError;

    // Insert transaction
    const { error: txError } = await supabase.from('supplier_transactions').insert({
      supplier_id: supplier.id,
      school_id: schoolId,
      type: 'payment',
      amount: amount,
      date: paymentData.date,
      description: paymentData.description,
      payment_method: paymentData.payment_method,
      balance_after: newBalance
    });

    if (txError) throw txError;

    await loadSuppliers();
    await loadTransactions(supplier.id);
  };

  const addBill = async (supplier: Supplier, billData: any) => {
    const amount = parseInt(billData.amount);
    const newBalance = supplier.current_balance + amount;

    // Update supplier balance
    const { error: supplierUpdateError } = await supabase
      .from('suppliers')
      .update({ 
        current_balance: newBalance
      })
      .eq('id', supplier.id);

    if (supplierUpdateError) throw supplierUpdateError;

    // Insert transaction
    const { error: txError } = await supabase.from('supplier_transactions').insert({
      supplier_id: supplier.id,
      school_id: schoolId,
      type: 'bill',
      amount: amount,
      date: billData.date,
      bill_number: billData.bill_number,
      description: billData.description,
      balance_after: newBalance
    });

    if (txError) throw txError;

    await loadSuppliers();
    await loadTransactions(supplier.id);
  };

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  return {
    suppliers,
    transactions,
    loading,
    addSupplier,
    deleteSupplier,
    addPayment,
    addBill,
    loadTransactions,
    refreshSuppliers: loadSuppliers
  };
};
