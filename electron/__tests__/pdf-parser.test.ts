import { describe, expect, it } from 'vitest';
import {
  mapPdfJsError,
  textItemsToPage,
} from '../services/sources/pdf/pdf-parser';

function item(
  str: string,
  dir: 'ltr' | 'rtl',
  x: number,
  y = 10,
): Record<string, unknown> {
  return {
    str,
    dir,
    transform: [1, 0, 0, 12, x, y],
    width: str.length * 5,
    height: 12,
    hasEOL: false,
  };
}

describe('PDF.js extraction adapter', () => {
  it('reconstructs RTL runs without reversing characters inside each item', () => {
    const page = textItemsToPage([
      item('العربية', 'rtl', 60),
      item('لغة ', 'rtl', 20),
    ], true);
    expect(page.text).toBe('لغة العربية');
    expect(page.boxes).toHaveLength(2);
  });

  it('keeps mixed-language logical sections usable and normalized', () => {
    const page = textItemsToPage([
      item('Physics', 'ltr', 0, 20),
      { ...item('العربية', 'rtl', 20, 5), hasEOL: true },
      item('لغة ', 'rtl', 0, 5),
    ], false);
    expect(page.text).toContain('Physics');
    expect(page.text).toContain('لغة العربية');
    expect(page.boxes).toEqual([]);
  });

  it('maps password, invalid, missing, and malformed parser failures to stable codes', () => {
    const password = new Error('Password required');
    password.name = 'PasswordException';
    const invalid = new Error('Invalid structure');
    invalid.name = 'InvalidPDFException';
    const missing = new Error('missing');
    missing.name = 'MissingPDFException';
    expect(mapPdfJsError(password)).toBe('PDF_PASSWORD_PROTECTED');
    expect(mapPdfJsError(invalid)).toBe('PDF_INVALID_FORMAT');
    expect(mapPdfJsError(missing)).toBe('PDF_ASSET_MISSING');
    expect(mapPdfJsError(new Error('broken xref'))).toBe('PDF_CORRUPT');
  });
});
