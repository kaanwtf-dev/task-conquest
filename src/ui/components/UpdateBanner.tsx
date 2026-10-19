import { useState } from 'react';
import { create } from 'zustand';

/** Set by the service worker when a new deploy is waiting. */
export const useAppUpdate = create<{ update: (() => void) | null }>(() => ({ update: null }));

export default function UpdateBanner() {
  const update = useAppUpdate((s) => s.update);
  const [busy, setBusy] = useState(false);
  if (!update) return null;
  return (
    <div className="update-banner win" role="status">
      <span>{busy ? 'Updating…' : 'A new version of Task Conquest is ready.'}</span>
      <button
        className="btn small"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          update();
        }}
      >
        {busy ? '…' : 'Update'}
      </button>
      <button className="btn ghost small" onClick={() => useAppUpdate.setState({ update: null })} aria-label="Later">
        Later
      </button>
    </div>
  );
}
