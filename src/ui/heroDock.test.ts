import { describe, expect, it } from 'vitest';
import { settle } from './heroDock';

describe('settle', () => {
  const W = 390;
  it('snaps to the nearer side', () => {
    expect(settle(20, 150, W, 0, 300)).toEqual({ side: 'left', lift: 0, tucked: false });
    expect(settle(220, 150, W, 0, 300)).toEqual({ side: 'right', lift: 0, tucked: false });
  });
  it('keeps the lift inside the allowed range', () => {
    expect(settle(220, 150, W, 120.4, 300).lift).toBe(120);
    expect(settle(220, 150, W, -40, 300).lift).toBe(0);
    expect(settle(220, 150, W, 900, 300).lift).toBe(300);
  });
  it('tucks only when pushed well past an edge', () => {
    expect(settle(W - 150 + 50, 150, W, 0, 300).tucked).toBe(false); // a third off: just snaps back
    expect(settle(W - 150 + 70, 150, W, 0, 300)).toEqual({ side: 'right', lift: 0, tucked: true });
    expect(settle(-70, 150, W, 0, 300)).toEqual({ side: 'left', lift: 0, tucked: true });
  });
});
