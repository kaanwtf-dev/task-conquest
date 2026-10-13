import { create } from 'zustand';

/** Set by the service worker when a new deploy is waiting. */
export const useAppUpdate = create<{ update: (() => void) | null }>(() => ({ update: null }));

export default function UpdateBanner() {
  const update = useAppUpdate((s) => s.update);
  if (!update) return null;
  return (
    <div className="update-banner win">
      <span>A new version of Questlog is ready.</span>
      <button className="btn small" onClick={update}>
        Update
      </button>
      <button className="btn ghost small" onClick={() => useAppUpdate.setState({ update: null })} aria-label="Later">
        Later
      </button>
    </div>
  );
}
