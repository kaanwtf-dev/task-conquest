import { useStore } from '../state/store';
import { sfx } from '../audio/sfx';
import type { Task } from '../core/types';
import { offerUndo } from './components/UndoBar';

/** Take a grocery off the shopping list (no XP) and offer to undo it. False when there was nothing to take off. */
export function takeOffList(task: Task): boolean {
  const s = useStore.getState();
  const r = s.unlistItem(task.id);
  if (!r) return false;
  if (s.settings.sfx > 0) sfx.uncheck();
  offerUndo(r.forgot ? `Removed ${task.title}` : `${task.title} went back to the pantry`, r.undo);
  return true;
}
