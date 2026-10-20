import { createECDH, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import webpush from 'web-push';
// @ts-expect-error untyped helper of web-push
import ece from 'http_ece';
import { makeCloud, makeSender, type WebPushLib } from './backend';
import type { SubRow } from './sender';

const vapid = webpush.generateVAPIDKeys();
const device = createECDH('prime256v1');
device.generateKeys();
const authSecret = randomBytes(16).toString('base64url');
const sub = (endpoint: string): SubRow => ({
  endpoint,
  user_id: 'u',
  p256dh: device.getPublicKey('base64url'),
  auth: authSecret,
  tz: 'UTC',
  prefs: {},
  history: {},
});

/** A push service: answers with the given statuses in turn and keeps what it received. */
function service(...statuses: number[]) {
  const got: { url: string; headers: Record<string, string>; body: Buffer }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    got.push({ url, headers: init.headers as Record<string, string>, body: Buffer.from(init.body as Uint8Array) });
    return new Response('', { status: statuses.shift() ?? 201 });
  }) as unknown as typeof fetch;
  return { got, fetchFn };
}

const sender = (fetchFn: typeof fetch) =>
  makeSender(webpush as unknown as WebPushLib, { vapidPublic: vapid.publicKey, vapidPrivate: vapid.privateKey, subject: 'https://app/', fetchFn, retryDelayMs: 1 });

describe('sending a push', () => {
  it('posts an encrypted, signed push the device can read', async () => {
    const s = service(201);
    expect(await sender(s.fetchFn)(sub('https://web.push.apple.com/abc'), '{"hi":1}', { ttl: 600, topic: 'morning' })).toBe('ok');
    const [req] = s.got;
    expect(req.url).toBe('https://web.push.apple.com/abc');
    expect(req.headers.TTL).toBe('600');
    expect(req.headers.Topic).toBe('morning');
    expect(req.headers.Authorization).toMatch(/^vapid t=.+, k=/);
    expect(ece.decrypt(req.body, { version: 'aes128gcm', privateKey: device, authSecret }).toString()).toBe('{"hi":1}');
  });

  it('tells dead devices, refused keys and busy services apart', async () => {
    expect(await sender(service(410).fetchFn)(sub('https://web.push.apple.com/a'), 'x', { ttl: 1, topic: 't' })).toBe('gone');
    expect(await sender(service(403).fetchFn)(sub('https://web.push.apple.com/a'), 'x', { ttl: 1, topic: 't' })).toBe('config');
    const busy = service(503, 201);
    expect(await sender(busy.fetchFn)(sub('https://web.push.apple.com/a'), 'x', { ttl: 1, topic: 't' })).toBe('ok');
    expect(busy.got).toHaveLength(2); // one retry
    expect(await sender(service(503, 503).fetchFn)(sub('https://web.push.apple.com/a'), 'x', { ttl: 1, topic: 't' })).toBe('busy');
    expect(await sender(service(400).fetchFn)(sub('https://web.push.apple.com/a'), 'x', { ttl: 1, topic: 't' })).toBe('retry'); // refused, not busy
    // no answer in time: it may have arrived, so it is not one to put back and send again
    const slow = (async () => {
      throw new DOMException('timed out', 'TimeoutError');
    }) as unknown as typeof fetch;
    expect(await sender(slow)(sub('https://web.push.apple.com/a'), 'x', { ttl: 1, topic: 't' })).toBe('retry');
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect(await sender(down)(sub('https://web.push.apple.com/a'), 'x', { ttl: 1, topic: 't' })).toBe('busy');
  });

  it('sends normal urgency unless told otherwise (deadline notes go out high)', async () => {
    const s = service(201, 201);
    await sender(s.fetchFn)(sub('https://fcm.googleapis.com/fcm/send/a'), 'x', { ttl: 1, topic: 't' });
    await sender(s.fetchFn)(sub('https://fcm.googleapis.com/fcm/send/a'), 'x', { ttl: 1, topic: 't', urgency: 'high' });
    expect(s.got.map((r) => r.headers.Urgency)).toEqual(['normal', 'high']);
  });

  it('drops a device whose keys no browser would make, without a request', async () => {
    const s = service();
    expect(await sender(s.fetchFn)({ ...sub('https://web.push.apple.com/a'), p256dh: 'junk' }, 'x', { ttl: 1, topic: 't' })).toBe('gone');
    expect(s.got).toHaveLength(0);
  });
});

describe('the cloud', () => {
  it('sends the secret key the way each kind needs, and pages long tables', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      const offset = Number(new URL(url).searchParams.get('offset'));
      return new Response(JSON.stringify(offset === 0 ? Array.from({ length: 1000 }, (_, i) => ({ endpoint: `e${i}` })) : [{ endpoint: 'last' }]));
    }) as unknown as typeof fetch;
    expect(await makeCloud('https://x.supabase.co/', 'sb_secret_abc', fetchFn).subscriptions()).toHaveLength(1001);
    expect(calls[0].headers.apikey).toBe('sb_secret_abc');
    expect(calls[0].headers.Authorization).toBeUndefined();
    await makeCloud('https://x.supabase.co', 'eyJlegacy', fetchFn).lastStats().catch(() => undefined);
    expect(calls.at(-1)!.headers.Authorization).toBe('Bearer eyJlegacy');
  });
});
