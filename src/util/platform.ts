/** Platform and capability detection, for iPhone/Safari fallbacks and Diagnostics. */

export interface PlatformInfo {
  ios: boolean;
  android: boolean;
  /** WebKit-based (every iOS browser, and desktop Safari). */
  webkit: boolean;
  /** Launched from the home screen (installed web app). */
  standalone: boolean;
}

export function detectPlatform(env: { ua: string; maxTouchPoints?: number; standaloneMedia?: boolean; navigatorStandalone?: boolean }): PlatformInfo {
  const ua = env.ua;
  // iPadOS reports a Mac user agent; touch points give it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (env.maxTouchPoints ?? 0) > 1);
  const android = /Android/.test(ua);
  const webkit = ios || (/AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|Android/.test(ua));
  return { ios, android, webkit, standalone: env.standaloneMedia === true || env.navigatorStandalone === true };
}

export function platform(): PlatformInfo {
  if (typeof navigator === 'undefined') return { ios: false, android: false, webkit: false, standalone: false };
  return detectPlatform({
    ua: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standaloneMedia: typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches,
    navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
  });
}

/** Which optional browser features are present (for Diagnostics). */
export function capabilities(): Record<string, boolean> {
  const g = globalThis as unknown as Record<string, unknown>;
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Navigator & Record<string, unknown>;
  let webgl2 = false;
  try {
    webgl2 = typeof document !== 'undefined' && !!document.createElement('canvas').getContext('webgl2');
  } catch {
    webgl2 = false;
  }
  return {
    webgl2,
    offscreenCanvas: typeof g.OffscreenCanvas === 'function',
    imageCapture: typeof g.ImageCapture === 'function',
    mediaRecorder: typeof g.MediaRecorder === 'function',
    canvasCaptureStream: typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype,
    fileSystemAccess: typeof g.showDirectoryPicker === 'function',
    webShareFiles: typeof nav.canShare === 'function',
    wakeLock: 'wakeLock' in nav,
    requestVideoFrameCallback: typeof HTMLVideoElement !== 'undefined' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype,
    audioSession: 'audioSession' in nav,
    serviceWorker: 'serviceWorker' in nav,
  };
}
