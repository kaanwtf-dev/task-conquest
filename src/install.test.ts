import { describe, expect, it } from 'vitest';
import { installPlatform } from './install';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 355.0.0.0',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
};

describe('install platform', () => {
  it('tells the browsers apart, so each player gets the right steps', () => {
    expect(installPlatform(UA.iphoneSafari, 5)).toBe('ios-safari');
    expect(installPlatform(UA.iphoneChrome, 5)).toBe('ios-other');
    expect(installPlatform(UA.iphoneInstagram, 5)).toBe('ios-inapp');
    expect(installPlatform(UA.ipad, 5)).toBe('ios-safari'); // iPadOS says "Macintosh", but has a touch screen
    expect(installPlatform(UA.android, 5)).toBe('android');
    expect(installPlatform(UA.macSafari, 0)).toBe('mac-safari');
    expect(installPlatform(UA.macChrome, 0)).toBe('desktop');
    expect(installPlatform(UA.windowsEdge, 0)).toBe('desktop');
  });
});
