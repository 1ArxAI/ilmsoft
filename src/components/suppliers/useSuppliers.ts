import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { supabase } from '../../lib/supabase';
import type { Supplier, SupplierTransaction } from './types';

export const useSuppliers = (schoolId: string) => {
  const [transactions, setTransactions] = useState<SupplierTransaction[]>([]);

  // current_balance is maintained by a database trigger on supplier_transactions.
  const { data, isLoading, mutate } = useSWR(schoolId ? ['suppliers', schoolId] : null, async () => {
    const { data: rows, error } = await supabase
      .from('suppliers')
      .select('id, school_id, supplier_name, business_name, contact_number, address, opening_balance, current_balance, notes, created_at')
      .eq('school_id', schoolId)
      .order('supplier_name');
    if (error) throw error;
    return (rows || []) as Supplier[];
  });
  const suppliers = data || [];
  const loading = isLoading && !data;
  const loadSuppliers = useCallback(async () => { await mutate(); }, [mutate]);

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

    await Promise.all([loadSuppliers(), loadTransactions(supplier.id)]);
  };

  const addBill = async (supplier: Supplier, billData: any) => {
    const amount = parseInt(billData.amount);
    const newBalance = supplier.current_balance + amount;

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

    await Promise.all([loadSuppliers(), loadTransactions(supplier.id)]);
  };


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
