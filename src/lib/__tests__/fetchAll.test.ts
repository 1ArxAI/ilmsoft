import { describe, it, expect } from 'vitest';
import { fetchAll, PAGE_ROWS } from '../supabase';

const table = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));
const fake = (n: number) => (from: number, to: number) => Promise.resolve({ data: table(n).slice(from, to + 1), error: null });

describe('fetchAll', () => {
  it('returns everything past the 1,000-row cap, in order', async () => {
    const { data, error } = await fetchAll(fake(2500));
    expect(error).toBeNull();
    expect(data.length).toBe(2500);
    expect(data[0].id).toBe(0);
    expect(data[2499].id).toBe(2499);
  });
  it('stops after one short page and handles exact multiples', async () => {
    expect((await fetchAll(fake(0))).data.length).toBe(0);
    expect((await fetchAll(fake(PAGE_ROWS))).data.length).toBe(PAGE_ROWS);
    expect((await fetchAll(fake(999))).data.length).toBe(999);
  });
  it('surfaces the error of the page that failed and keeps earlier rows', async () => {
    let calls = 0;
    const { data, error } = await fetchAll<{ id: number }>((from, to) => { calls++; return Promise.resolve(calls === 2 ? { data: null, error: { message: 'boom' } } : { data: table(1000).slice(from, to + 1), error: null }); });
    expect(error?.message).toBe('boom');
    expect(data.length).toBe(1000);
  });
});
