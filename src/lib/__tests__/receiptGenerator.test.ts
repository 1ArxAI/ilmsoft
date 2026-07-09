import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateReceiptData, formatCurrency, formatMonth } from '../receiptGenerator';
import { supabase } from '../supabase';

// Mock supabase client
vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('generateReceiptData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSupabaseChain = (data: any, error: any = null) => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data, error }),
      limit: vi.fn().mockResolvedValue({ data, error }),
      then: function (resolve: any) {
        resolve({ data, error });
      }
    };
    return chain;
  };

  it('calculates proper receipt data given mocked DB responses', async () => {
    // 1. Payment
    const paymentChain = mockSupabaseChain({ 
      id: 'pay1', parent_id: 'p1', received_amount: 5000, 
      received_at: '2026-04-16T12:00:00Z', payment_month: '2026-04' 
    });
    
    // 2. Multi-fetch: School, Parent, Balance
    const schoolChain = mockSupabaseChain({ school_name: 'Test School', contact: '123', logo_url: '' });
    const parentChain = mockSupabaseChain({ id: 'p1', first_name: 'John', last_name: 'Doe' });
    const balanceChain = mockSupabaseChain({ balance: 2000 }); // positive means they owe

    // 3. Current active students
    const studentsChain = mockSupabaseChain([
      { id: 's1', first_name: 'Alice', current_monthly_fee: 3000, active: true },
      { id: 's2', first_name: 'Bob', current_monthly_fee: 2500, active: true }
    ]);
    // For students we want it to return an array, not single


    // Multi-returns from supabase.from
    (supabase.from as any).mockImplementation((table: string) => {
      switch (table) {
        case 'payments': return paymentChain;
        case 'schools': return schoolChain;
        case 'parents': return parentChain;
        case 'parent_balances': return balanceChain;
        case 'students': return studentsChain;
        default: return mockSupabaseChain(null);
      }
    });

    const receipt = await generateReceiptData('pay1', 'sch1');
    
    expect(receipt).not.toBeNull();
    // Paid 5000, current balance 2000 (they still owe 2000)
    // Pre-payment balance would be 2000 + 5000 = 7000
    expect(receipt?.summary?.previous_balance).toBe(7000);
    expect(receipt?.summary?.payment_received).toBe(5000);
    expect(receipt?.summary?.new_balance).toBe(2000);
    
    // Total monthly fee: 3000 + 2500 = 5500
    expect(receipt?.summary?.net_monthly).toBe(5500);
    expect(receipt?.students).toHaveLength(2);
  });

  it('handles invalid inputs gracefully', async () => {
    const receipt1 = await generateReceiptData('', 'sch1');
    expect(receipt1).toBeNull();
    
    const receipt2 = await generateReceiptData('pay1', '');
    expect(receipt2).toBeNull();
  });
});

describe('format helpers', () => {
  it('formats a number as Pakistani Rupees', () => {
    expect(formatCurrency(100)).toBe('Rs 100');
  });

  it('formats a YYYY-MM string as a short month and year', () => {
    expect(formatMonth('2026-04')).toBe('Apr 2026');
  });
});
