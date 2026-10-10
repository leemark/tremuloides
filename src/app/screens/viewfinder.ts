import type { App, Screen } from '../app';
import { h, ICONS, iconButton, openSheet, toast, type SheetHandle } from '../ui';
import { CameraSource, TestPatternSource, type FrameSource } from '../../camera/camera';
import { AdaptiveScale } from '../../gl/adaptive';
import { LENSES, adjacentLens, getLens } from '../../lenses/registry';
import { defaultParams } from '../../lenses/params';
import type { Lens, Params } from '../../lenses/types';
import type { OverlayConfig } from '../../gl/overlay';
import { currentLensState, currentOverlay, processAndSave, saveCaptureResult, saveClip } from '../capture';
import { makeThumb } from '../pipeline';
import { ClipRecorder, clock, nextDuration, videoSupported } from '../video';
import { formatEv, formatZoom, hasControls, pinchZoom, snap, viewToFrame, type ControlCaps } from '../../camera/controls';
import { pickPhotos } from '../import-ui';
import { overlayControls, paramControls, presetBar } from '../params-ui';
import { getPosition } from '../geo';
import { randomSeed } from '../../util/prng';
import { logEvent, errorMessage } from '../../diagnostics/log';

interface ClipState {
  rec: ClipRecorder;
  lens: Lens;
  params: Params;
  seed: number;
  seconds: number;
  createdAt: string;
  geo: ReturnType<typeof getPosition> | null;
  started: boolean;
  stopping: boolean;
  thumb: Promise<Blob | null> | null;
  overlay: OverlayConfig;
  endBusy: () => void;
}

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

export function createViewfinder(app: App): Screen {
  const s = app.s;
  const renderer = s.renderer;
  let { lens, params } = currentLensState(s);
  let seed = randomSeed();
  let overlay = currentOverlay(s);

  let source: FrameSource | null = null;
  let raf = 0;
  let running = false;
  let dirty = true;
  let comparing = false;
  let taking = false;
  /** Temporal recording in progress (Quake bursts and slit-scans). */
  let recording: {
    lens: Lens;
    params: Params;
    seed: number;
    style: 'burst' | 'toggle';
    createdAt: string;
    geo: ReturnType<typeof getPosition> | null;
    started: number;
    endBusy: () => void;
  } | null = null;
  /** Lens video clip in progress (live lenses in Video mode). */
  let clip: ClipState | null = null;
  const canVideo = videoSupported();
  let wakeLock: WakeLockSentinelLike | null = null;
  let sheet: SheetHandle | null = null;
  let thumbUrl: string | null = null;
  const adaptive = new AdaptiveScale();
  const cleanups: (() => void)[] = [];

  // ---------- DOM ----------
  const stage = h('div', { class: 'stage' });
  const flash = h('div', { class: 'flash' });
  const fpsEl = h('div', { class: 'fps-overlay', hidden: true });
  const compareBadge = h('div', { class: 'compare-badge', text: 'Original', hidden: true });
  const stillBadge = h('div', { class: 'still-badge', text: 'Full detail paints after capture', hidden: true });
  const notice = h('div', { class: 'notice', hidden: true });
  const focusRing = h('div', { class: 'focus-ring', hidden: true });
  stage.append(flash, compareBadge, stillBadge, fpsEl, notice, focusRing);

  // ---------- Camera controls: pinch zoom, tap to focus, exposure ----------
  let caps: ControlCaps | null = null;
  let zoom = 1;
  let ev = 0;
  let evHideTimer = 0;
  const zoomChip = h('button', { class: 'zoom-chip', hidden: true, 'aria-label': 'Zoom', onclick: () => void quickZoom() });
  const evValue = h('button', { class: 'ev-value', 'aria-label': 'Reset exposure', onclick: () => void setEv(0) });
  const evInput = h('input', { type: 'range', class: 'ev-range', 'aria-label': 'Exposure' });
  evInput.addEventListener('input', () => void setEv(Number(evInput.value)));
  const evBar = h('div', { class: 'ev-bar', hidden: true }, h('span', { class: 'ev-sun', text: '☀' }), evInput, evValue);

  const lensName = h('span', { class: 'lens-name' });
  const lensTagline = h('span', { class: 'lens-tagline' });
  const lensButton = h(
    'button',
    { class: 'lens-button', 'aria-label': 'Lens settings', onclick: () => openParams() },
    lensName,
    lensTagline,
  );
  const topbar = h('header', { class: 'topbar' }, lensButton, iconButton(ICONS.gear, 'Settings', () => app.navigate({ name: 'settings' })));

  const thumb = h('button', { class: 'thumb-btn', 'aria-label': 'Gallery', onclick: () => app.navigate({ name: 'gallery' }) });
  const shutter = h('button', { class: 'shutter', 'aria-label': 'Take photo', onclick: () => void capture() }, h('span', { class: 'shutter-inner' }));
  const side = h(
    'div',
    { class: 'side-actions' },
    iconButton(ICONS.lenses, 'Choose lens', () => openLensPicker()),
    iconButton(ICONS.import, 'Import photos', () => pickPhotos(app, { lensId: lens.id, params })),
  );
  const saving = h('div', { class: 'saving', hidden: true, role: 'status' });
  const recordingEl = h('div', { class: 'rec-indicator', hidden: true, role: 'status' });
  const photoBtn = h('button', { class: 'mode-btn', role: 'radio', text: 'Photo', onclick: () => setMode('photo') });
  const videoBtn = h('button', { class: 'mode-btn', role: 'radio', text: 'Video', onclick: () => setMode('video') });
  const durBtn = h('button', {
    class: 'mode-dur',
    'aria-label': 'Clip length',
    onclick: () => {
      s.settings.set('videoSeconds', nextDuration(s.settings.get().videoSeconds));
      renderMode();
    },
  });
  const modeBar = h('div', { class: 'mode-bar', hidden: true }, h('div', { class: 'mode-seg', role: 'radiogroup', 'aria-label': 'Capture mode' }, photoBtn, videoBtn), durBtn);
  const bottombar = h('footer', { class: 'bottombar' }, thumb, shutter, side);

  const el = h('div', { class: 'screen viewfinder' }, stage, topbar, evBar, zoomChip, modeBar, bottombar, saving, recordingEl);

  function setupControls() {
    caps = source?.controls?.() ?? null;
    zoom = caps?.zoom?.min ?? 1;
    ev = 0;
    zoomChip.hidden = !caps?.zoom;
    zoomChip.textContent = formatZoom(zoom);
    evBar.hidden = true;
    if (caps?.exposure) {
      evInput.min = String(caps.exposure.min);
      evInput.max = String(caps.exposure.max);
      evInput.step = String(caps.exposure.step);
      evInput.value = '0';
      evValue.textContent = formatEv(0);
    }
    s.diag.cameraControls = caps && hasControls(caps) ? { zoom: caps.zoom, exposure: caps.exposure, focusPoint: caps.focusPoint } : null;
  }

  let zoomPending = false;
  function applyZoom(z: number) {
    if (!caps?.zoom) return;
    zoom = snap(z, caps.zoom);
    zoomChip.textContent = formatZoom(zoom);
    if (zoomPending) return; // one applyConstraints in flight at a time; the latest value wins
    zoomPending = true;
    void (async () => {
      let sent = NaN;
      while (sent !== zoom) {
        sent = zoom;
        await source?.setZoom?.(sent);
      }
      zoomPending = false;
      dirty = true;
    })();
  }

  async function quickZoom() {
    if (!caps?.zoom) return;
    const two = Math.min(caps.zoom.max, caps.zoom.min * 2);
    applyZoom(zoom < two - 0.05 ? two : caps.zoom.min);
  }

  async function setEv(v: number) {
    if (!caps?.exposure) return;
    ev = snap(v, caps.exposure);
    evInput.value = String(ev);
    evValue.textContent = formatEv(ev);
    showEv();
    await source?.setExposure?.(ev);
    dirty = true;
  }

  function showEv() {
    if (!caps?.exposure) return;
    evBar.hidden = false;
    clearTimeout(evHideTimer);
    evHideTimer = window.setTimeout(() => (evBar.hidden = true), 4000);
  }
  evBar.addEventListener('pointerdown', () => clearTimeout(evHideTimer));
  evBar.addEventListener('pointerup', () => showEv());

  async function tapFocus(clientX: number, clientY: number) {
    if (!caps?.focusPoint || !source) return;
    const r = stage.getBoundingClientRect();
    const vx = (clientX - r.left) / r.width;
    const vy = (clientY - r.top) / r.height;
    focusRing.style.left = `${clientX - r.left}px`;
    focusRing.style.top = `${clientY - r.top}px`;
    focusRing.hidden = false;
    focusRing.classList.remove('go');
    void focusRing.offsetWidth;
    focusRing.classList.add('go');
    window.setTimeout(() => (focusRing.hidden = true), 1200);
    showEv();
    const p = viewToFrame(vx, vy, source.width / source.height, r.width / r.height);
    await source.focusAt?.(p.x, p.y);
    dirty = true;
  }

  function renderLensLabel() {
    lensName.textContent = lens.name;
    lensTagline.textContent = lens.tagline;
    stillBadge.hidden = lens.kind !== 'still';
    s.diag.lensId = lens.id;
    renderMode();
  }

  /** Video clips are offered for live (realtime) lenses when the browser can record a canvas. */
  function videoMode(): boolean {
    return canVideo && lens.kind === 'realtime' && s.settings.get().captureMode === 'video';
  }

  function renderMode() {
    modeBar.hidden = !canVideo || lens.kind !== 'realtime' || clip !== null || recording !== null;
    const vid = videoMode();
    photoBtn.classList.toggle('on', !vid);
    videoBtn.classList.toggle('on', vid);
    photoBtn.setAttribute('aria-checked', String(!vid));
    videoBtn.setAttribute('aria-checked', String(vid));
    durBtn.hidden = !vid;
    durBtn.textContent = `${s.settings.get().videoSeconds} s`;
    shutter.classList.toggle('video', vid || clip !== null);
    if (!recording) shutter.setAttribute('aria-label', clip ? 'Stop recording' : vid ? 'Record video' : 'Take photo');
  }

  function setMode(mode: 'photo' | 'video') {
    if (clip) return;
    s.settings.set('captureMode', mode);
    renderMode();
  }

  function setLens(next: Lens) {
    cancelRecording();
    lens = next;
    s.settings.set('currentLens', lens.id);
    ({ params } = currentLensState(s));
    seed = randomSeed();
    renderLensLabel();
    renderer?.trimInstances([lens.id]);
    dirty = true;
  }

  function setParams(next: Params) {
    cancelRecording();
    params = next;
    s.settings.setLensParams(lens.id, params);
    dirty = true;
  }

  // ---------- Sheets ----------
  function openParams() {
    sheet?.close();
    const container = h('div');
    const build = () => {
      const bar = presetBar(s.presets, lens, () => params, (next) => {
        setParams(next);
        build();
      });
      container.replaceChildren(
        bar,
        paramControls(lens.params, params, (next) => {
          setParams(next);
          bar.refresh();
        }),
        h('h3', { class: 'sheet-subhead', text: 'Overlay (any lens)' }),
        overlayControls(overlay, (next) => {
          overlay = next;
          s.settings.set('overlayKind', next.kind);
          s.settings.set('overlayStrength', next.strength);
          dirty = true;
        }),
        h(
          'div',
          { class: 'sheet-actions' },
          h('button', {
            class: 'btn',
            text: 'Reset',
            onclick: () => {
              setParams(defaultParams(lens.params));
              build();
            },
          }),
          lens.seeded
            ? h('button', {
                class: 'btn',
                html: `${ICONS.dice}<span>New seed</span>`,
                onclick: () => {
                  seed = randomSeed();
                  dirty = true;
                },
              })
            : null,
        ),
      );
    };
    build();
    sheet = openSheet(lens.name, container, { onClose: () => (sheet = null) });
  }

  function openLensPicker() {
    sheet?.close();
    const list = h('div', { class: 'lens-list' });
    for (const l of LENSES) {
      list.append(
        h(
          'button',
          {
            class: `lens-item ${l.id === lens.id ? 'on' : ''}`,
            onclick: () => {
              setLens(l);
              sheet?.close();
            },
          },
          h('span', { class: 'lens-item-name', text: l.name }),
          h('span', { class: 'lens-item-tagline', text: l.tagline }),
        ),
      );
    }
    sheet = openSheet('Lenses', list, { onClose: () => (sheet = null) });
  }

  // ---------- Gestures: swipe = change lens, hold = show original ----------
  // Gestures: swipe = change lens, hold = show original, tap = focus, pinch = zoom.
  let down: { x: number; y: number; id: number; t: number } | null = null;
  let holdTimer = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; zoom: number } | null = null;
  let pinched = false; // suppress tap/swipe until every finger lifts
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  stage.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.setPointerCapture(e.pointerId);
    if (pointers.size === 2) {
      clearTimeout(holdTimer);
      down = null;
      pinched = true;
      if (comparing) {
        comparing = false;
        compareBadge.hidden = true;
        dirty = true;
      }
      if (caps?.zoom) pinch = { dist: spread(), zoom };
      return;
    }
    if (pointers.size > 2) return;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now() };
    holdTimer = window.setTimeout(() => {
      comparing = true;
      compareBadge.hidden = false;
      dirty = true;
    }, 220);
  });
  stage.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && caps?.zoom && pointers.size >= 2) {
      applyZoom(pinchZoom(pinch.zoom, pinch.dist, spread(), caps.zoom));
      return;
    }
    if (!down || comparing) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) clearTimeout(holdTimer);
  });
  const endPointer = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    clearTimeout(holdTimer);
    if (pinched) {
      if (pointers.size === 0) pinched = false;
      down = null;
      return;
    }
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (comparing) {
      comparing = false;
      compareBadge.hidden = true;
      dirty = true;
    } else if (e.type === 'pointerup' && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setLens(adjacentLens(lens.id, dx < 0 ? 1 : -1));
      toast(lens.name, { duration: 900 });
    } else if (e.type === 'pointerup' && Math.hypot(dx, dy) < 10 && performance.now() - down.t < 300) {
      void tapFocus(e.clientX, e.clientY);
    }
    down = null;
  };
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- Source + render loop ----------
  async function startSource(): Promise<void> {
    stopSource();
    const demo = new URLSearchParams(location.search).has('demo');
    const portrait = innerHeight >= innerWidth;
    notice.hidden = true;
    if (!demo) {
      const result = await CameraSource.start();
      if (!running) {
        if (result.ok) result.source.stop();
        return;
      }
      if (result.ok) {
        source = result.source;
        s.diag.camera = source.info();
        setupControls();
        return;
      }
      showNotice(
        result.reason === 'denied'
          ? 'Camera permission is off, so this is a demo scene. You can still import photos.'
          : `Camera unavailable (${result.message}). Showing a demo scene.`,
      );
    }
    source = new TestPatternSource(portrait);
    s.diag.camera = source.info();
    setupControls();
  }

  function showNotice(message: string) {
    notice.replaceChildren(
      h('span', { text: message }),
      h('button', { class: 'btn btn-small', text: 'Retry camera', onclick: () => void startSource() }),
    );
    notice.hidden = false;
  }

  function stopSource() {
    source?.stop();
    source = null;
  }

  let lastFpsUpdate = 0;
  function frame(now: number) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (!renderer || !source) return;
    if (clip?.started) tickClip();
    const fresh = source.update(now);
    if (!fresh && !dirty) return;
    try {
      if (fresh) renderer.setInput(source.element, source.width, source.height);
      renderer.drawPreview({ lens, params, seed, fit: 'cover', showOriginal: comparing, scale: adaptive.scale, overlay });
      dirty = false;
      // Thumbnail: grab a frame ~half a second in, right after drawing (the WebGL buffer is valid now).
      if (clip?.started && !clip.thumb && clip.rec.elapsed > 0.5) {
        const cv = renderer.canvas;
        clip.thumb = makeThumb(cv, cv.width, cv.height).catch(() => null);
      }
      if (recording && fresh) feedRecording(now);
    } catch (e) {
      logEvent('error', 'lens', `Preview failed for ${lens.id}`, e);
      if (lens.id !== 'original') {
        toast(`${lens.name} failed to render. Switched to Original.`);
        setLens(getLens('original'));
      }
    }
    adaptive.tick(now);
    s.diag.fps = adaptive.fps;
    s.diag.previewScale = adaptive.scale;
    if (s.settings.get().fpsOverlay && now - lastFpsUpdate > 500) {
      lastFpsUpdate = now;
      const [w, hgt] = renderer.lastPreviewSize;
      fpsEl.textContent = `${adaptive.fps.toFixed(0)} fps · ${w}×${hgt} · ${(adaptive.scale * 100).toFixed(0)}%`;
    }
  }

  async function resume() {
    if (running) return;
    running = true;
    adaptive.reset();
    fpsEl.hidden = !s.settings.get().fpsOverlay;
    await startSource();
    dirty = true;
    if (running) raf = requestAnimationFrame(frame);
    void requestWakeLock();
  }

  function pause() {
    cancelRecording();
    if (clip?.started) void stopClip(); // keep what was recorded
    else if (clip) {
      clip.rec.cancel();
      clip.endBusy();
      clip = null;
      resetRecordingUi();
    }
    running = false;
    cancelAnimationFrame(raf);
    stopSource();
    void releaseWakeLock();
  }

  async function requestWakeLock() {
    if (!s.settings.get().keepScreenOn) return;
    const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!wl) return;
    try {
      wakeLock = await wl.request('screen');
    } catch {
      /* not allowed right now (e.g. low battery); harmless */
    }
  }

  async function releaseWakeLock() {
    const w = wakeLock;
    wakeLock = null;
    await w?.release().catch(() => undefined);
  }

  // ---------- Capture ----------
  // ---------- Temporal recording (burst / toggle) ----------
  function startRecording(style: 'burst' | 'toggle') {
    if (!renderer || !source) return;
    try {
      renderer.beginCapture(lens, params, seed);
    } catch (e) {
      logEvent('error', 'capture', 'Could not start recording', e);
      toast(`Couldn’t start recording: ${errorMessage(e)}`);
      return;
    }
    navigator.vibrate?.(12);
    recording = {
      lens,
      params: { ...params },
      seed,
      style,
      createdAt: new Date().toISOString(),
      geo: s.settings.get().locationTagging ? getPosition() : null,
      started: performance.now(),
      endBusy: s.busy.begin(),
    };
    shutter.classList.add('recording');
    shutter.setAttribute('aria-label', style === 'toggle' ? 'Stop recording' : 'Recording');
    recordingEl.hidden = false;
    recordingEl.textContent = style === 'toggle' ? 'Recording · tap to stop' : 'Recording… hold still';
  }

  function feedRecording(now: number) {
    if (!renderer || !recording) return;
    let progress: number | null;
    try {
      progress = renderer.feedCapture(recording.lens);
    } catch (e) {
      logEvent('error', 'capture', 'Recording failed', e);
      toast(`Recording failed: ${errorMessage(e)}`);
      cancelRecording();
      return;
    }
    if (progress === null) return;
    const secs = ((now - recording.started) / 1000).toFixed(1);
    recordingEl.textContent =
      recording.style === 'toggle' ? `● ${secs} s · tap to stop` : `Recording… ${Math.round(progress * 100)}%`;
    if (progress >= 1) void finishRecording();
  }

  async function finishRecording() {
    if (!renderer || !recording) return;
    const rec = recording;
    recording = null;
    resetRecordingUi();
    try {
      const result = renderer.finishCapture(rec.lens);
      navigator.vibrate?.([10, 40, 10]);
      void s.queue
        .add(async () => {
          await saveCaptureResult(s, { result, lens: rec.lens, params: rec.params, seed: rec.seed, createdAt: rec.createdAt, geo: rec.geo });
          await refreshThumb();
        })
        .catch((e: unknown) => toast(`Couldn’t save: ${errorMessage(e)}`));
    } catch (e) {
      logEvent('error', 'capture', 'Finishing the recording failed', e);
      toast(`Recording failed: ${errorMessage(e)}`);
    } finally {
      rec.endBusy();
    }
  }

  function cancelRecording() {
    if (!recording) return;
    const rec = recording;
    recording = null;
    renderer?.cancelCapture(rec.lens);
    rec.endBusy();
    resetRecordingUi();
  }

  function resetRecordingUi() {
    shutter.classList.remove('recording');
    shutter.setAttribute('aria-label', 'Take photo');
    recordingEl.hidden = true;
    renderMode();
  }

  // ---------- Lens video clips ----------
  async function startClip() {
    if (!renderer || !source || clip) return;
    let rec: ClipRecorder;
    try {
      rec = new ClipRecorder(renderer.canvas);
    } catch (e) {
      toast(`Can’t record video here: ${errorMessage(e)}`);
      return;
    }
    const c: ClipState = {
      rec,
      lens,
      params: { ...params },
      seed,
      seconds: s.settings.get().videoSeconds,
      createdAt: new Date().toISOString(),
      geo: s.settings.get().locationTagging ? getPosition() : null,
      started: false,
      stopping: false,
      thumb: null,
      overlay: { ...overlay },
      endBusy: s.busy.begin(),
    };
    clip = c;
    shutter.classList.add('recording');
    renderMode();
    recordingEl.hidden = false;
    recordingEl.textContent = 'Starting…';
    try {
      const { sound } = await rec.start(s.settings.get().videoSound);
      if (clip !== c) {
        rec.cancel();
        return;
      }
      c.started = true;
      navigator.vibrate?.(12);
      if (s.settings.get().videoSound && !sound) toast('Microphone unavailable: recording without sound');
      logEvent('info', 'video', `Recording ${c.seconds} s clip (${rec.type}${sound ? ', sound' : ''})`);
      dirty = true;
      tickClip();
    } catch (e) {
      logEvent('error', 'video', 'Could not start recording', e);
      toast(`Couldn’t start video: ${errorMessage(e)}`);
      rec.cancel();
      c.endBusy();
      if (clip === c) clip = null;
      resetRecordingUi();
    }
  }

  function tickClip() {
    if (!clip?.started || clip.stopping) return;
    const t = clip.rec.elapsed;
    recordingEl.textContent = `● ${clock(t)} / ${clock(clip.seconds)} · tap to stop`;
    if (t >= clip.seconds) void stopClip();
  }

  async function stopClip() {
    const c = clip;
    if (!c || !c.started || c.stopping) return;
    c.stopping = true;
    recordingEl.textContent = 'Saving clip…';
    try {
      const result = await c.rec.stop();
      const thumb = c.thumb ? await c.thumb : null;
      navigator.vibrate?.([10, 40, 10]);
      void s.queue
        .add(async () => {
          await saveClip(s, { ...result, thumb, lens: c.lens, params: c.params, seed: c.seed, createdAt: c.createdAt, geo: c.geo, overlay: c.overlay });
          await refreshThumb();
        })
        .catch((e: unknown) => toast(`Couldn’t save the clip: ${errorMessage(e)}`));
    } catch (e) {
      logEvent('error', 'video', 'Recording failed', e);
      toast(`Video failed: ${errorMessage(e)}`);
    } finally {
      c.endBusy();
      if (clip === c) clip = null;
      resetRecordingUi();
    }
  }

  async function capture() {
    // Uses this tap to re-approve album folder access if Android asks (no-op when not needed).
    void s.album.ensurePermission();
    if (!renderer) {
      toast('This device can’t render lenses (WebGL2 unavailable).');
      return;
    }
    if (clip) {
      void stopClip();
      return;
    }
    if (!recording && videoMode()) {
      void startClip();
      return;
    }
    if (recording) {
      if (recording.style === 'toggle') void finishRecording();
      return; // bursts finish on their own
    }
    const style = lens.captureStyle?.(params) ?? 'still';
    if (style !== 'still') {
      startRecording(style);
      return;
    }
    if (!source || taking) return;
    taking = true;
    navigator.vibrate?.(12);
    flash.classList.remove('go');
    void flash.offsetWidth;
    flash.classList.add('go');
    const geo = s.settings.get().locationTagging ? getPosition() : null;
    const createdAt = new Date().toISOString();
    const shotLens = lens;
    const shotParams = { ...params };
    const shotSeed = seed;
    const shotOverlay = { ...overlay };
    try {
      const still = await source.takeStill(s.settings.get().captureSource);
      s.diag.camera = source.info();
      void s.queue
        .add(async () => {
          await processAndSave(s, {
            overlay: shotOverlay,
            bitmap: still.bitmap,
            originalBlob: still.blob,
            lens: shotLens,
            params: shotParams,
            seed: shotSeed,
            source: 'camera',
            method: still.method,
            createdAt,
            geo,
          });
          await refreshThumb();
        })
        .catch((e: unknown) => toast(`Couldn’t save that photo: ${errorMessage(e)}`));
      if (shotLens.seeded) seed = randomSeed();
    } catch (e) {
      logEvent('error', 'capture', 'Still capture failed', e);
      toast(`Capture failed: ${errorMessage(e)}`);
    } finally {
      taking = false;
    }
  }

  async function refreshThumb() {
    const latest = await s.store.latest().catch(() => undefined);
    const blob = latest ? await s.store.blob(latest.thumbKey).catch(() => undefined) : undefined;
    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    thumbUrl = blob ? URL.createObjectURL(blob) : null;
    thumb.style.backgroundImage = thumbUrl ? `url("${thumbUrl}")` : '';
    thumb.classList.toggle('empty', !thumbUrl);
  }

  function updateSaving(pending: number) {
    saving.hidden = pending === 0;
    const pct = s.busy.progress;
    const what = pct !== null ? `Painting… ${Math.round(pct * 100)}%` : 'Saving…';
    saving.textContent = pending > 1 ? `${what} (${pending})` : what;
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') pause();
    else void resume();
  };

  return {
    el,
    mount() {
      renderLensLabel();
      if (renderer) {
        stage.prepend(renderer.canvas);
      } else {
        notice.replaceChildren(h('span', { text: `Lenses can’t run here: ${s.rendererError ?? 'WebGL2 unavailable'}.` }));
        notice.hidden = false;
      }
      cleanups.push(s.queue.onChange(updateSaving));
      cleanups.push(s.busy.onProgress(() => updateSaving(s.queue.size)));
      updateSaving(s.queue.size);
      document.addEventListener('visibilitychange', onVisibility);
      cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));
      void refreshThumb();
      if (document.visibilityState === 'visible') void resume();
    },
    unmount() {
      pause();
      sheet?.close();
      for (const c of cleanups) c();
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    },
  };
}
