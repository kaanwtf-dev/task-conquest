import { describe, expect, it } from 'vitest';
import { keyboardInset } from './keyboard';

describe('keyboard inset', () => {
  it('is the covered height while typing with the keyboard up', () => {
    expect(keyboardInset(800, 464, 0, 1, true)).toBe(336);
    // iOS pans the visual viewport to the focused field: the pan is not keyboard
    expect(keyboardInset(800, 464, 40, 1, true)).toBe(296);
  });
  it('is zero when nothing is being typed, when zoomed, or for small toolbar-sized gaps', () => {
    expect(keyboardInset(800, 464, 0, 1, false)).toBe(0);
    expect(keyboardInset(800, 400, 0, 2, true)).toBe(0);
    expect(keyboardInset(800, 770, 0, 1, true)).toBe(0);
    expect(keyboardInset(800, 820, 0, 1, true)).toBe(0);
  });
});
