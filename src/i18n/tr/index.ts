// Turkish, keyed by the English text. One file per area of the app.
import { TR_COMPONENTS } from './components';
import { TR_GAME } from './game';
import { TR_PARTY } from './party';
import { TR_SCREENS } from './screens';
import { TR_STATE } from './state';
import { TR_WORDS } from './words';
import { TR_CORE } from './core';

export const TR: Record<string, string> = { ...TR_CORE, ...TR_GAME, ...TR_SCREENS, ...TR_PARTY, ...TR_COMPONENTS, ...TR_STATE, ...TR_WORDS };
