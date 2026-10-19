// The reminder sender's connections, for any runtime with fetch (the Supabase function in
// supabase/functions/reminders): the cloud it reads the saves from, and the push services it posts to.
import type { RemoteRow } from '../sync/types';
import type { Cloud, RunStats, SendResult, Sender } from './sender';

type Fetch = typeof fetch;

/** The cloud as the sender needs it, through PostgREST with the project's secret (service role) key. */
export function makeCloud(baseUrl: string, secret: string, fetchFn: Fetch = fetch): Cloud {
  const url = baseUrl.replace(/\/+$/, '');
  // new-style sb_secret_ keys go in apikey only; legacy service_role keys are JWTs and go in both
  const headers: Record<string, string> = { apikey: secret, 'Content-Type': 'application/json' };
  if (secret.startsWith('eyJ')) headers.Authorization = `Bearer ${secret}`;

  async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetchFn(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
    if (!res.ok) {
      const hint = res.status === 404 ? ' (has the latest supabase/schema.sql been run?)' : res.status === 401 ? ' (check the secret key)' : '';
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

  return {
    subscriptions: () => all('push_subscriptions?select=endpoint,user_id,p256dh,auth,tz,prefs,history,updated_at&order=endpoint'),
    async lastStats() {
      const rows = await rest<{ stats: RunStats | null }[]>('push_status?select=stats&id=eq.1');
      return rows?.[0]?.stats ?? null;
    },
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
}

/** The parts of the web-push package used here: VAPID headers, and the encrypted request for one push. */
export interface WebPushLib {
  getVapidHeaders(audience: string, subject: string, publicKey: string, privateKey: string, encoding: 'aes128gcm', expiration: number): Record<string, string>;
  generateRequestDetails(
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    opts: { headers: Record<string, string>; contentEncoding: 'aes128gcm'; TTL: number; urgency: 'normal'; topic: string },
  ): { endpoint: string; method: string; headers: Record<string, string | number>; body: Uint8Array | null };
}

/**
 * Posts one push with fetch. web-push builds the encrypted request (it is not used to send: its Node https
 * client is the part other runtimes support least).
 */
export function makeSender(
  webpush: WebPushLib,
  opts: { vapidPublic: string; vapidPrivate: string; subject: string; log?: (msg: string) => void; fetchFn?: Fetch; retryDelayMs?: number },
): Sender {
  const fetchFn = opts.fetchFn ?? fetch;
  // one signed VAPID token per push service per run (Apple asks senders not to mint them more than hourly)
  const auth = new Map<string, Record<string, string>>();
  return async (sub, body, { ttl, topic }) => {
    const audience = new URL(sub.endpoint).origin;
    let vapid = auth.get(audience);
    if (!vapid) {
      vapid = webpush.getVapidHeaders(audience, opts.subject, opts.vapidPublic, opts.vapidPrivate, 'aes128gcm', Math.floor(Date.now() / 1000) + 12 * 3600);
      auth.set(audience, vapid);
    }
    let req: ReturnType<WebPushLib['generateRequestDetails']>;
    try {
      req = webpush.generateRequestDetails({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
        headers: vapid,
        contentEncoding: 'aes128gcm',
        TTL: ttl,
        urgency: 'normal',
        topic,
      });
    } catch {
      return 'gone'; // keys no browser would make (wrong length, not a curve point): drop them
    }
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)]));
    // a busy push service (429, 5xx, no answer) gets one more try a moment later
    for (let attempt = 1; ; attempt++) {
      let status: number | undefined;
      try {
        const res = await fetchFn(req.endpoint, { method: 'POST', headers, body: req.body as BodyInit | null, signal: AbortSignal.timeout(15_000) });
        await res.arrayBuffer().catch(() => undefined);
        status = res.status;
        if (status >= 200 && status < 300) return 'ok';
      } catch {
        status = undefined;
      }
      const result: SendResult = status === 404 || status === 410 ? 'gone' : status === 401 || status === 403 ? 'config' : 'retry';
      const busy = result === 'retry' && (!status || status === 429 || status >= 500);
      if (busy && attempt < 2) {
        await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 3000));
        continue;
      }
      opts.log?.(`push service answered ${status ?? 'no response'} (${result})`);
      return result;
    }
  };
}
