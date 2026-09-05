import { useMemo } from 'react';
import useSWR from 'swr';
import { supabase, fetchAll } from '../lib/supabase';

export type Student = {
  id: string;
  school_id: string;
  first_name: string;
  last_name: string;
  gender?: 'Boy' | 'Girl';
  cnic: string;
  date_of_birth: string | null;
  date_of_admission: string | null;
  admission_class_id: string;
  current_class_id: string;
  monthly_fee: number;
  current_monthly_fee: number;
  discount_type: string | null;
  discount_value: number | null;
  active: boolean;
  parent_id: string;
};

export type Class = { id: string; name: string; monthly_fee: number; active: boolean; };
export type Parent = {
  id: string;
  first_name: string;
  last_name: string;
  cnic?: string;
  contact?: string;
  address?: string | null;
  notes?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export const fetchSchoolData = async (schoolId: string) => {
  if (!schoolId) return { students: [], classes: [], parents: [] };
  
  const [
    { data: sData, error: sErr },
    { data: cData, error: cErr },
    { data: pData, error: pErr },
  ] = await Promise.all([
    fetchAll((from, to) => supabase.from('students').select('id, school_id, first_name, last_name, gender, cnic, date_of_birth, date_of_admission, admission_class_id, current_class_id, monthly_fee, current_monthly_fee, discount_type, discount_value, active, parent_id').eq('school_id', schoolId).order('first_name').order('id').range(from, to)),
    supabase.from('classes').select('id, name, monthly_fee, active').eq('school_id', schoolId).eq('active', true).order('name'),
    fetchAll((from, to) => supabase.from('parents').select('id, first_name, last_name, cnic, contact, address, notes, is_active, created_at, updated_at').eq('school_id', schoolId).eq('is_active', true).order('first_name').order('id').range(from, to)),
  ]);

  if (sErr) throw sErr;
  if (cErr) throw cErr;
  if (pErr) throw pErr;

  return {
    students: (sData || []) as Student[],
    classes: (cData || []) as Class[],
    parents: (pData || []) as Parent[]
  };
};

export const useStudents = (schoolId: string, showFlash?: (msg: string) => void) => {
  const { data, isLoading, mutate } = useSWR(
    schoolId ? ['school-data', schoolId] : null,
    () => fetchSchoolData(schoolId),
    {
      onError: (err) => {
        if (showFlash) showFlash('Error loading student data: ' + (err instanceof Error ? err.message : String(err)));
      }
    }
  );

  const students = data?.students || [];
  const classes = data?.classes || [];
  const parents = data?.parents || [];
  const loading = isLoading;

  const stats = useMemo(() => {
    const active = students.filter(s => s.active);
    
    const sysRevenue = active.reduce((sum, s) => sum + (Number(s.current_monthly_fee) || 0), 0);

    const manRevenue = active.reduce((sum, s) => {
        const final = s.discount_type && s.discount_value !== null
          ? (s.discount_type === 'percentage' 
              ? Math.round(s.monthly_fee * (100 - (s.discount_value ?? 0)) / 100) 
              : s.monthly_fee - (s.discount_value ?? 0))
          : s.monthly_fee;
        return sum + Math.max(0, final);
    }, 0);

    const scholarshipCount = active.filter(s => (Number(s.current_monthly_fee) || 0) === 0).length;
    const currentMonth = new Date().toISOString().slice(0, 7);
    const newEnrollments = active.filter(s => s.date_of_admission && s.date_of_admission.startsWith(currentMonth)).length;

    const boys = active.filter(s => s.gender === 'Boy').length;
    const girls = active.filter(s => s.gender === 'Girl').length;

    return {
      activeCount: active.length,
      sysRevenue,
      manRevenue,
      revenueMismatch: sysRevenue !== manRevenue,
      scholarshipCount,
      newEnrollments,
      boys,
      girls
    };
  }, [students]);

  return {
    students,
    classes,
    parents,
    loading,
    stats,
    load: mutate, // Re-fetch or update cache
    setStudents: () => {} // Kept for backwards compatibility
  };
};
