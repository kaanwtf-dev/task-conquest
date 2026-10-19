// Task Conquest reminders, as a Supabase Edge Function. A pg_cron job (supabase/functions/reminders/cron.sql)
// calls it every half hour; it sends the reminder notifications that are due (src/push/sender.ts).
//
// Paste the bundled single file (npm run build:reminders → dist-functions/reminders.ts) into the Supabase
// dashboard as a function named "reminders". Function secrets it reads:
//   VAPID_PRIVATE_KEY  the private half of VITE_VAPID_PUBLIC_KEY
//   CRON_SECRET        any long random text; the cron job sends it in the x-cron-secret header
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Responses and logs hold counts only, never player data.
import webpush from 'npm:web-push@3.6.7';
import { runReminders, type Mode } from '../../../src/push/sender';
import { makeCloud, makeSender, type WebPushLib } from '../../../src/push/backend';
import { useZone, zonedDate } from '../../../src/push/zone';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

/** Where a tapped notification opens, and the contact the push services see for this sender. */
const APP_URL = 'https://taskconquest.netlify.app/';
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') || 'BMW8HKFT_4chlJTVKPqz8HXqT4Dv8k6p_a4qysL9WRb1wwvexfbgy75TiZ592AVPzSbvz4w8i3bU73l016bljSc';
/** Supabase ends a function call after 150 s: stop starting new devices well before that. */
const TIME_BUDGET_MS = 100_000;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const toB64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** True when the private key signs what the app's public key verifies (a mistyped key would fail every send). */
async function keysMatch(privateKey: string): Promise<boolean> {
  try {
    const pub = b64url(VAPID_PUBLIC);
    const d = b64url(privateKey);
    if (pub.length !== 65 || d.length !== 32) return false;
    const x = toB64url(pub.slice(1, 33));
    const y = toB64url(pub.slice(33));
    const alg = { name: 'ECDSA', namedCurve: 'P-256' };
    const priv = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x, y, d: toB64url(d) }, alg, false, ['sign']);
    const pubKey = await crypto.subtle.importKey('raw', pub, alg, false, ['verify']);
    const msg = new TextEncoder().encode('task-conquest');
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, msg);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, sig, msg);
  } catch {
    return false;
  }
}

/**
 * The reminders read each player's save in their own time zone. Supabase can't change TZ at run time, so a
 * zone-aware Date (src/push/zone.ts) stands in for the real one while each player is worked out.
 */
function zonesWork(): boolean {
  const t = Date.UTC(2026, 0, 15, 12, 0);
  return new (zonedDate('Asia/Tokyo'))(t).getHours() === 21 && new (zonedDate('America/New_York'))(t).getHours() === 7;
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    useZone(null);
    // only the error's own text (a failed request names a table and an HTTP status, never player data)
    const error = e instanceof Error ? e.message : String(e);
    console.error(`reminders failed: ${error}`);
    return json(500, { error });
  }
});

async function handle(req: Request): Promise<Response> {
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  if (cronSecret.length < 16 || req.headers.get('x-cron-secret') !== cronSecret) return json(401, { error: 'unauthorized' });

  const mode = (new URL(req.url).searchParams.get('mode') ?? 'run') as Mode;
  if (!['run', 'dry-run', 'test'].includes(mode)) return json(400, { error: `unknown mode "${mode}" (run, dry-run or test)` });

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const vapidPrivate = (Deno.env.get('VAPID_PRIVATE_KEY') ?? '').trim();
  if (!url || !secret) return json(500, { error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing' });
  if (!(await keysMatch(vapidPrivate)))
    return json(500, { error: 'VAPID_PRIVATE_KEY is missing or is not the private half of the app key. Paste only the bare key.' });
  if (!zonesWork()) return json(500, { error: 'time zones are not available in this runtime, so reminders would go out at the wrong hours' });

  const started = Date.now();
  const stats = await runReminders({
    cloud: makeCloud(url, secret),
    send: makeSender(webpush as unknown as WebPushLib, { vapidPublic: VAPID_PUBLIC, vapidPrivate, subject: APP_URL, log: console.log }),
    now: started,
    mode,
    appUrl: APP_URL,
    key: VAPID_PUBLIC,
    deadline: started + TIME_BUDGET_MS,
    setZone: (tz) => useZone(tz),
  });
  useZone(null);
  console.log(`mode=${mode} devices=${stats.devices} due=${stats.due} sent=${stats.sent} gone=${stats.gone} failed=${stats.failed} config=${stats.config}${stats.cut ? ' (stopped at the time limit)' : ''}`);
  if (stats.config) return json(500, { ...stats, error: 'a push service refused the VAPID keys' });
  return json(200, stats);
}
