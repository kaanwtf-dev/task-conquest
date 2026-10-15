// Sends the reminder notifications that are due (run by .github/workflows/reminders.yml).
// usage: SUPABASE_SECRET_KEY=... VAPID_PRIVATE_KEY=... npx vite-node scripts/push/send.ts [run|dry-run|test]
// The cloud URL and the public VAPID key come from .env.production (they are public); only the two
// secrets come from the environment. Logs show counts only: a public repository's Actions logs are public.
import { readFileSync } from 'node:fs';
import webpush from 'web-push';
import { runReminders, type Cloud, type Mode, type SendResult, type Sender } from '../../src/push/sender';
import type { RemoteRow } from '../../src/sync/types';

const APP_URL = process.env.APP_URL ?? 'https://kaanwtf-dev.github.io/TODOLIST/';

function envFile(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(new URL('../../.env.production', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2];
    }
    return out;
  } catch {
    return {};
  }
}

function fail(msg: string): never {
  console.error(`::error::${msg}`);
  process.exit(1);
}

const file = envFile();
const url = (process.env.SUPABASE_URL || file.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const secret = (process.env.SUPABASE_SECRET_KEY ?? '').trim();
const vapidPublic = (process.env.VAPID_PUBLIC_KEY || file.VITE_VAPID_PUBLIC_KEY || '').trim();
const vapidPrivate = (process.env.VAPID_PRIVATE_KEY ?? '').trim();
const mode = (process.argv[2] ?? process.env.MODE ?? 'run') as Mode;

if (!['run', 'dry-run', 'test'].includes(mode)) fail(`Unknown mode "${mode}" (run, dry-run or test).`);
if (!secret || !vapidPrivate) {
  // not set up yet: nothing to do, and nothing to fail (the schedule runs on every fork too)
  console.log('Reminders are not set up: add the SUPABASE_SECRET_KEY and VAPID_PRIVATE_KEY repository secrets.');
  process.exit(0);
}
if (!url || !vapidPublic) fail('VITE_SUPABASE_URL or VITE_VAPID_PUBLIC_KEY is missing from .env.production.');
if (secret.startsWith('sb_publishable_') || /"role"\s*:\s*"anon"/.test(Buffer.from(secret.split('.')[1] ?? '', 'base64').toString())) {
  fail('SUPABASE_SECRET_KEY holds the public (anon/publishable) key. It needs the secret (service_role / sb_secret_) key.');
}

// new-style sb_secret_ keys go in apikey only; legacy service_role keys are JWTs and go in both
const headers: Record<string, string> = { apikey: secret, 'Content-Type': 'application/json' };
if (secret.startsWith('eyJ')) headers.Authorization = `Bearer ${secret}`;

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  if (!res.ok) {
    const hint = res.status === 404 ? ' (has the latest supabase/schema.sql been run?)' : res.status === 401 ? ' (check SUPABASE_SECRET_KEY)' : '';
    throw new Error(`Supabase ${init.method ?? 'GET'} ${path.split('?')[0]}: HTTP ${res.status}${hint}`);
  }
  // writes with Prefer: return=minimal answer 201/204 with an empty body
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

const PAGE = 1000; // PostgREST returns at most this many rows per request
async function all<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = (await rest<T[]>(`${path}&limit=${PAGE}&offset=${offset}`)) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** A PostgREST in.() filter; ids are client-chosen text, so quotes and backslashes are escaped, not dropped. */
const inList = (ids: string[]) => `in.(${ids.map((id) => `"${id.replace(/["\\]/g, '\\$&')}"`).join(',')})`;

const enc = encodeURIComponent;
const DOC_COLS = 'id,kind,list_id,data,updated_at,deleted,owner';

const cloud: Cloud = {
  subscriptions: () => all('push_subscriptions?select=endpoint,user_id,p256dh,auth,tz,prefs,history,updated_at&order=endpoint'),
  // exactly what the player's app sees (as the row-level security rules allow): their own hero, and every
  // list they are a member of (their own included) with all its tasks, whoever wrote them
  async docs(userId) {
    const hero = (await rest<RemoteRow[]>(`docs?select=${DOC_COLS}&id=eq.${enc(`hero:${userId}`)}&owner=eq.${enc(userId)}&deleted=is.false`)) ?? [];
    const lists = (await all<{ list_id: string }>(`list_members?select=list_id&user_id=eq.${enc(userId)}&order=list_id`)).map((m) => m.list_id);
    const member = new Set(lists);
    const rows: RemoteRow[] = [];
    for (let i = 0; i < lists.length; i += 40) {
      const chunk = lists.slice(i, i + 40); // keeps each URL short
      rows.push(...(await all<RemoteRow>(`docs?select=${DOC_COLS}&list_id=${enc(inList(chunk))}&deleted=is.false&kind=in.(list,task)&order=id`)));
    }
    return [...hero, ...rows.filter((r) => r.list_id !== null && member.has(r.list_id))];
  },
  async saveHistory(endpoint, history) {
    await rest(`push_subscriptions?endpoint=eq.${enc(endpoint)}`, { method: 'PATCH', body: JSON.stringify({ history }), headers: { Prefer: 'return=minimal' } });
  },
  async forget(endpoint) {
    await rest(`push_subscriptions?endpoint=eq.${enc(endpoint)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  },
  async heartbeat(stats) {
    await rest('push_status?on_conflict=id', {
      method: 'POST',
      body: JSON.stringify({ id: 1, last_run: new Date().toISOString(), stats }),
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
  },
};

// one signed VAPID token per push service per run (Apple asks senders not to mint them more than hourly)
const auth = new Map<string, Record<string, string>>();
const send: Sender = async (sub, body, { ttl, topic }) => {
  const audience = new URL(sub.endpoint).origin;
  let vapid = auth.get(audience);
  if (!vapid) {
    vapid = webpush.getVapidHeaders(audience, APP_URL, vapidPublic, vapidPrivate, 'aes128gcm', Math.floor(Date.now() / 1000) + 12 * 3600) as Record<string, string>;
    auth.set(audience, vapid);
  }
  // a busy push service (429, 5xx, no answer) gets one more try a moment later
  for (let attempt = 1; ; attempt++) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
        TTL: ttl,
        urgency: 'normal',
        topic,
        contentEncoding: 'aes128gcm',
        headers: vapid,
        vapidDetails: undefined,
        timeout: 15_000,
      });
      return 'ok';
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      const result: SendResult = status === 404 || status === 410 ? 'gone' : status === 401 || status === 403 ? 'config' : 'retry';
      const busy = result === 'retry' && (!status || status === 429 || status >= 500);
      if (busy && attempt < 2) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      console.log(`push service answered ${status ?? 'no response'} (${result})`);
      return result;
    }
  }
};

const stats = await runReminders({
  cloud,
  send,
  now: Date.now(),
  mode,
  appUrl: APP_URL,
  setZone: (tz) => {
    process.env.TZ = tz; // Node re-reads it: Date then works in the player's local time
  },
});
console.log(`mode=${mode} devices=${stats.devices} due=${stats.due} sent=${stats.sent} gone=${stats.gone} failed=${stats.failed} config=${stats.config}`);
if (stats.config) fail('A push service refused the VAPID keys: check VAPID_PRIVATE_KEY matches VITE_VAPID_PUBLIC_KEY in .env.production.');
