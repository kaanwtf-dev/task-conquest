// iPhone keyboards shrink only the visual viewport: fixed, bottom-anchored sheets would sit behind them.
// The keyboard's height is published as --kb on :root so sheets can lift their Save row above it.

/**
 * Height the on-screen keyboard covers at the bottom of the layout viewport, in CSS px. Zero unless a
 * text field has focus (pinch zoom and toolbars shrink the visual viewport too) and the gap is big
 * enough to be a keyboard.
 */
export function keyboardInset(innerHeight: number, vvHeight: number, vvOffsetTop: number, vvScale: number, typing: boolean): number {
  if (!typing || vvScale > 1.01) return 0;
  const gap = innerHeight - vvHeight - vvOffsetTop;
  return gap > 60 ? Math.round(gap) : 0;
}

const isTyping = (el: Element | null) =>
  !!el && (el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable) || (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes(el.type)));

/** Call once at startup. */
export function trackKeyboard(): void {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return;
  let last = -1;
  const update = () => {
    const kb = keyboardInset(window.innerHeight, vv.height, vv.offsetTop, vv.scale, isTyping(document.activeElement));
    if (kb === last) return;
    last = kb;
    document.documentElement.style.setProperty('--kb', `${kb}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  // focus changes don't always resize the viewport (iOS 26 can leave it stale after the keyboard closes)
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', () => requestAnimationFrame(update));
  update();
}
