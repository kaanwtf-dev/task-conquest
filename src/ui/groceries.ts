import { useStore } from '../state/store';
import { sfx } from '../audio/sfx';
import type { Task } from '../core/types';
import { offerUndo } from './components/UndoBar';
import { t } from '../i18n';

/** Take a grocery off the shopping list (no XP) and offer to undo it. False when there was nothing to take off. */
export function takeOffList(task: Task): boolean {
  const s = useStore.getState();
  const r = s.unlistItem(task.id);
  if (!r) return false;
  if (s.settings.sfx > 0) sfx.uncheck();
  offerUndo(r.forgot ? t('Removed {title}', { title: task.title }) : t('{title} went back to the pantry', { title: task.title }), r.undo);
  return true;
}
