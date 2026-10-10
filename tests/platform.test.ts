import { describe, expect, it } from 'vitest';
import { detectPlatform } from '../src/util/platform';

describe('platform detection', () => {
  it('recognises iPhone Safari, iPadOS (Mac UA + touch) and Chrome on iOS as iOS/WebKit', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
    expect(detectPlatform({ ua: iphone })).toMatchObject({ ios: true, webkit: true, android: false });
    const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';
    expect(detectPlatform({ ua: ipad, maxTouchPoints: 5 }).ios).toBe(true);
    expect(detectPlatform({ ua: ipad, maxTouchPoints: 0 })).toMatchObject({ ios: false, webkit: true });
    const crios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1';
    expect(detectPlatform({ ua: crios })).toMatchObject({ ios: true, webkit: true });
  });

  it('recognises Chrome on Android and standalone mode', () => {
    const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';
    expect(detectPlatform({ ua: android, standaloneMedia: true })).toEqual({ ios: false, android: true, webkit: false, standalone: true });
    expect(detectPlatform({ ua: android, navigatorStandalone: true }).standalone).toBe(true);
  });
});
