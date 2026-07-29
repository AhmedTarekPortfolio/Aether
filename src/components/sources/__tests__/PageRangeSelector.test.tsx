import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  PageRangeSelector,
  pageRangeCount,
  parsePageRanges,
} from '../PageRangeSelector';

describe('PDF physical page-range selection', () => {
  it('parses inclusive pages/ranges, sorts, and merges overlaps deterministically', () => {
    expect(parsePageRanges('9, 2-4, 4-6, 1', 20)).toEqual([
      { start: 1, end: 6 },
      { start: 9, end: 9 },
    ]);
    expect(pageRangeCount(parsePageRanges('1-3, 8', 20))).toBe(4);
  });

  it('rejects reversed, out-of-bounds, malformed, and excessive ranges', () => {
    expect(() => parsePageRanges('5-2', 10)).toThrow();
    expect(() => parsePageRanges('0', 10)).toThrow();
    expect(() => parsePageRanges('11', 10)).toThrow();
    expect(() => parsePageRanges('all', 10)).toThrow();
    expect(() => parsePageRanges(
      Array.from({ length: 21 }, (_, index) => String(index + 1)).join(','),
      30,
    )).toThrow();
  });

  it('announces explicit selection and keeps it local to the component callback', () => {
    const onChange = vi.fn();
    render(
      <PageRangeSelector
        pageCount={12}
        currentPage={4}
        value={[]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Pages or ranges'), {
      target: { value: '2-4, 8' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply selection' }));
    expect(onChange).toHaveBeenCalledWith([
      { start: 2, end: 4 },
      { start: 8, end: 8 },
    ]);
    expect(screen.getByText(/No explicit page selection/)).toBeInTheDocument();
  });
});
