import useSWR from 'swr';
import { supabase } from '../lib/supabase';

export type ClassRow = {
  id: string; name: string; display_order: number; monthly_fee: number; admission_fee: number;
  active: boolean; subjects: string[]; created_at: string;
};

const fetchClasses = async (schoolId: string): Promise<ClassRow[]> => {
  const { data, error } = await supabase
    .from('classes')
    .select('id, name, display_order, monthly_fee, admission_fee, active, subjects, created_at')
    .eq('school_id', schoolId)
    .order('display_order')
    .order('name');
  if (error) throw error;
  return (data || []) as ClassRow[];
};

/** One cached list of the school's classes, shared by every screen that needs it. `mutate` after a write. */
export const useClasses = (schoolId: string) => {
  const { data, isLoading, mutate } = useSWR(schoolId ? ['classes', schoolId] : null, () => fetchClasses(schoolId));
  return { classes: data || [], loading: isLoading, mutate };
};
