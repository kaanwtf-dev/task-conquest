// "Send feedback" in Options, once a feedback form link is set (src/links.ts).
import { FEEDBACK_URL } from '../../links';

export function SupportBox() {
  if (!FEEDBACK_URL) return null;
  return (
    <>
      <div className="section-label">Feedback</div>
      <div className="win support">
        <p>Found a bug or got an idea? Tell the developer!</p>
        <div className="support-actions">
          <button className="btn ghost" onClick={() => window.open(FEEDBACK_URL, '_blank', 'noopener,noreferrer')}>
            <span className="btn-emoji">💬</span> Send feedback
          </button>
        </div>
      </div>
    </>
  );
}
