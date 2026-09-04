import { describe, it, expect } from 'vitest';
import { sanitizeSearchTerm } from '../validation';

describe('sanitizeSearchTerm', () => {
  it('leaves ordinary names and numbers alone', () => {
    expect(sanitizeSearchTerm('Ahmed Khan')).toBe('Ahmed Khan');
    expect(sanitizeSearchTerm('0300-1234567')).toBe('0300-1234567');
  });
  it('removes PostgREST filter syntax and LIKE wildcards', () => {
    expect(sanitizeSearchTerm('x%,school_id.neq.00000000-0000-0000-0000-000000000000')).toBe('xschoolidneq00000000-0000-0000-0000-000000000000');
    expect(sanitizeSearchTerm('a),or(id.not.is.null')).toBe('aoridnotisnull');
    expect(sanitizeSearchTerm('  "quoted"  ')).toBe('quoted');
  });
});
