import { useMemo } from 'react';
import useSWR from 'swr';
import { supabase, fetchAll } from '../lib/supabase';
import { fetchSchoolData } from './useStudents';

export type Parent = {
  id: string;
  school_id: string;
  first_name: string;
  last_name: string;
  relation?: 'Father' | 'Mother' | 'Guardian';
  gender?: string;
  cnic: string;
  contact: string;
  address: string | null;
  notes: string | null;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
};

export type Class = { id: string; name: string; monthly_fee: number; };

export const useParents = (schoolId: string, showFlash?: (msg: string) => void) => {
  const { data, isLoading, mutate } = useSWR(
    schoolId ? ['school-data', schoolId] : null,
    () => fetchSchoolData(schoolId),
    {
      onError: (err) => {
        if (showFlash) showFlash('Error loading parents: ' + (err instanceof Error ? err.message : String(err)));
      }
    }
  );

  // Outstanding dues per parent (ledger balance < 0 means the family owes the school).
  const { data: duesData } = useSWR(schoolId ? ['parent-dues', schoolId] : null, async () => {
    const { data, error } = await fetchAll((from, to) => supabase
      .from('parent_balances').select('parent_id, balance')
      .eq('school_id', schoolId).lt('balance', 0).order('parent_id').range(from, to));
    if (error) throw new Error(error.message);
    const dues: Record<string, number> = {};
    for (const b of data as { parent_id: string; balance: number }[]) dues[b.parent_id] = Math.round(-Number(b.balance));
    return dues;
  });
  const dues = duesData || {};

  const records = (data?.parents || []) as Parent[];
  const students = data?.students || [];
  const classes = data?.classes || [];
  const loading = isLoading;

  const { studentCounts, monthlyTotals, discountTotals, globalStats } = useMemo(() => {
    const counts: Record<string, number> = {};
    const mTotals: Record<string, number> = {};
    const dTotals: Record<string, number> = {};
    
    let gChildren = 0;
    let gNet = 0;
    let gScholarships = 0;

    // Only process active students
    students.filter(s => s.active).forEach(s => {
      if (!s.parent_id) return;
      
      counts[s.parent_id] = (counts[s.parent_id] || 0) + 1;
      const netFee = Number(s.current_monthly_fee) || 0;
      const grossFee = Number(s.monthly_fee) || netFee;
      const discount = grossFee - netFee;
      
      mTotals[s.parent_id] = (mTotals[s.parent_id] || 0) + netFee;
      dTotals[s.parent_id] = (dTotals[s.parent_id] || 0) + discount;

      gChildren++;
      gNet += netFee;
      gScholarships += discount;
    });

    return {
      studentCounts: counts,
      monthlyTotals: mTotals,
      discountTotals: dTotals,
      globalStats: { totalChildren: gChildren, totalNet: gNet, totalScholarships: gScholarships }
    };
  }, [students]);

  const parentStats = useMemo(() => {
    return { 
      totalFamilies: records.length, 
      totalChildren: globalStats.totalChildren, 
      totalPotential: globalStats.totalNet,
      totalScholarships: globalStats.totalScholarships,
      fathers: 0,
      mothers: 0,
      guardians: 0
    };
  }, [records, globalStats]);

  return {
    records,
    loading,
    classes,
    studentCounts,
    monthlyTotals,
    discountTotals,
    dues,
    globalStats,
    parentStats,
    load: mutate,
    loadClasses: mutate
  };
};
