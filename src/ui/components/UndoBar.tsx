// A short-lived "Undo" bar for quick, forgiving actions (like swiping a grocery off the list).
import { useEffect } from 'react';
import { create } from 'zustand';

interface Offer {
  key: number;
  text: string;
  undo: () => void;
}

const SHOW_MS = 5000;
const useUndo = create<{ offer: Offer | null }>(() => ({ offer: null }));
let seq = 0;

/** Show `text` with an Undo button for a few seconds; a newer offer replaces (and keeps) the previous action. */
export function offerUndo(text: string, undo: () => void) {
  useUndo.setState({ offer: { key: ++seq, text, undo } });
}

export default function UndoBar() {
  const offer = useUndo((s) => s.offer);

  useEffect(() => {
    if (!offer) return;
    const hide = window.setTimeout(() => useUndo.setState((s) => (s.offer?.key === offer.key ? { offer: null } : s)), SHOW_MS);
    // Cmd/Ctrl+Z undoes it too, unless a text field is handling its own undo
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key.toLowerCase() !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey || el.closest?.('input, textarea, [contenteditable]')) return;
      e.preventDefault();
      run(offer);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(hide);
      window.removeEventListener('keydown', onKey);
    };
  }, [offer]);

  return (
    <div className="undo-wrap" role="status" aria-live="polite">
      {offer && (
        <div key={offer.key} className="undo-bar win">
          <span>{offer.text}</span>
          {/* no focus change on press: closing the keyboard would move the bar out from under the finger */}
          <button className="btn small" onMouseDown={(e) => e.preventDefault()} onClick={() => run(offer)}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

function run(offer: Offer) {
  useUndo.setState({ offer: null });
  offer.undo();
}
