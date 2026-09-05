import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY; // Using publishable or anon key

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * PostgREST returns at most 1,000 rows per request (Supabase "Max rows"). Lists that can grow past that
 * must page. `build(from, to)` returns a fresh query with `.range(from, to)` applied; pages are fetched
 * until one comes back short. Ordering in the query is required for stable pages.
 */
export const PAGE_ROWS = 1000;
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await build(from, from + PAGE_ROWS - 1);
    if (error) return { data: all, error };
    all.push(...(data || []));
    if (!data || data.length < PAGE_ROWS) return { data: all, error: null };
  }
}

export type Role = 'owner' | 'manager';

export type SchoolProfile = {
  id: string;
  user_id: string;
  school_name: string;
  contact: string;
  email: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  tertiary_color: string;
  total_credits: number;
  credit_expires_at: string | null;
  created_at: string;
};

export type SchoolMember = {
  id: string;
  school_id: string;
  user_id: string | null;
  email: string;
  role: Role;
  status: 'active' | 'pending' | 'removed';
  invite_token: string | null;
  created_at: string;
  updated_at: string;
};

export type CreditRequest = {
  id: string;
  school_id: string;
  credits: number;
  amount_pkr: number;
  payment_method: string;
  payment_reference: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
};

export type Class = {
  id: string;
  school_id: string;
  name: string;
  display_order: number;
  monthly_fee: number;
  admission_fee: number;
  active: boolean;
  subjects: string[];
  created_at: string;
  updated_at: string;
};

export type Teacher = {
  id: string;
  school_id: string;
  name: string;
  cnic: string;
  gender: 'Male' | 'Female';
  personal_contact: string;
  home_contact: string;
  address: string;
  education: string;
  salary: number;
  notes: string;
  is_active: boolean;
  created_at: string;
  type: 'Teacher' | 'Staff';
};

export type ExtraFee = {
  id: string;
  school_id: string;
  name: string;
  amount: number;
  classes: string[];
  due_date: string;
  is_active: boolean;
  created_at: string;
};

export type ExtraFeePayment = {
  id: string;
  school_id: string;
  extra_fee_id: string;
  student_id: string;
  parent_id: string;
  amount_paid: number;
  payment_method: string;
  payment_date: string;
  created_at: string;
};

export type Supplier = {
  id: string;
  school_id: string;
  name: string;
  business_name: string;
  contact: string;
  address: string;
  opening_balance: number;
  current_balance: number;
  total_billed: number;
  total_paid: number;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SupplierTransaction = {
  id: string;
  school_id: string;
  supplier_id: string;
  type: 'bill' | 'payment';
  amount: number;
  date: string;
  description: string;
  notes: string;
  payment_method?: string;
  bill_number?: string;
  balance_after: number;
  created_at: string;
};

export type Parent = {
  id: string;
  school_id: string;
  first_name: string; // Note: database has first_name/last_name but type had 'name'
  last_name: string;
  cnic: string;
  contact: string;
  address: string;
  notes: string;
  is_active: boolean;
  opening_balance: number;
  created_at: string;
  updated_at: string;
};

export type Student = {
  id: string;
  school_id: string;
  parent_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'Boy' | 'Girl';
  registration_number: string;
  date_of_admission: string;
  admission_class_id: string;
  current_class_id: string;
  discount_type: string | null;
  discount_value: number | null;
  current_monthly_fee: number;
  active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type FeeStructure = {
  id: string;
  school_id: string;
  class_id: string;
  monthly_amount: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
};

export type Discount = {
  id: string;
  school_id: string;
  student_id: string;
  discount_type: 'percentage' | 'amount' | 'fixed';
  discount_value: number;
  active_from: string;
  active_to: string | null;
  reason: string | null;
  created_at: string;
};

export type LedgerEntry = {
  id: string;
  school_id: string;
  parent_id: string;
  entry_type: 'debit' | 'credit';
  amount: number;
  reference_type: 'fee_generation' | 'payment' | 'opening_balance' | 'adjustment';
  reference_id: string | null;
  description: string | null;
  month: string | null;
  created_by: string | null;
  created_at: string;
};

export type FeeGeneration = {
  id: string;
  school_id: string;
  months_generated: string[];
  generated_by: string | null;
  student_count: number;
  total_amount: number;
  skipped_count: number;
  status: 'pending' | 'completed' | 'failed';
  generated_at: string;
};

export type StudentMonthlyFee = {
  id: string;
  school_id: string;
  student_id: string;
  parent_id: string;
  class_id: string;
  generation_id: string;
  month: string;
  gross_amount: number;
  discount_type: string | null;
  discount_value: number | null;
  discount_amount: number;
  net_amount: number;
  created_at: string;
};

export type Payment = {
  id: string;
  school_id: string;
  parent_id: string;
  received_amount: number;
  payment_method: 'cash' | 'bank' | 'cheque' | 'other';
  received_by: string | null;
  notes: string | null;
  received_at: string;
};

export type PaymentAllocation = {
  id: string;
  payment_id: string;
  student_monthly_fee_id: string;
  allocated_amount: number;
  created_at: string;
};


export type ExamTerm = {
  id: string;
  school_id: string;
  name: string;
  academic_year: string;
  start_date: string;
  end_date: string;
  class_ids: string[];
  created_at: string;
};

export type AdminSettings = {
  id: string;
  jazzcash_number: string;
  jazzcash_name: string;
  bank_name: string;
  bank_account_title: string;
  bank_iban: string;
  updated_at: string;
};

// === CUSTOM RECEIPT TYPES ===
export type CustomReceiptItem = {
  description: string;
  quantity: number;
  price: number;
  total: number;
};

export type CustomReceipt = {
  id: string;
  school_id: string;
  type: 'invoice' | 'receipt';
  receipt_no: string;
  recipient_name: string;
  parent_id: string | null;
  date: string;
  due_date: string | null;
  items: CustomReceiptItem[];
  total_amount: number;
  notes: string | null;
  created_at: string;
};
