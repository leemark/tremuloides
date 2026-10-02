import type { App, Screen } from '../app';
import { h, ICONS, iconButton, openSheet, toast, type SheetHandle } from '../ui';
import { CameraSource, TestPatternSource, type FrameSource } from '../../camera/camera';
import { AdaptiveScale } from '../../gl/adaptive';
import { LENSES, adjacentLens, getLens } from '../../lenses/registry';
import { defaultParams } from '../../lenses/params';
import type { Lens, Params } from '../../lenses/types';
import { currentLensState, processAndSave } from '../capture';
import { paramControls } from '../params-ui';
import { getPosition } from '../geo';
import { randomSeed } from '../../util/prng';
import { logEvent, errorMessage } from '../../diagnostics/log';

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

export function createViewfinder(app: App): Screen {
  const s = app.s;
  const renderer = s.renderer;
  let { lens, params } = currentLensState(s);
  let seed = randomSeed();

  let source: FrameSource | null = null;
  let raf = 0;
  let running = false;
  let dirty = true;
  let comparing = false;
  let taking = false;
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
  const stillBadge = h('div', { class: 'still-badge', text: 'Renders after capture', hidden: true });
  const notice = h('div', { class: 'notice', hidden: true });
  stage.append(flash, compareBadge, stillBadge, fpsEl, notice);

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
  const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) app.navigate({ name: 'editor', input: { blob: file, source: 'import', lensId: lens.id, params } });
  });
  const side = h(
    'div',
    { class: 'side-actions' },
    iconButton(ICONS.lenses, 'Choose lens', () => openLensPicker()),
    iconButton(ICONS.import, 'Import a photo', () => fileInput.click()),
  );
  const saving = h('div', { class: 'saving', hidden: true, role: 'status' });
  const bottombar = h('footer', { class: 'bottombar' }, thumb, shutter, side, fileInput);

  const el = h('div', { class: 'screen viewfinder' }, stage, topbar, bottombar, saving);

  function renderLensLabel() {
    lensName.textContent = lens.name;
    lensTagline.textContent = lens.tagline;
    stillBadge.hidden = lens.kind !== 'still';
    s.diag.lensId = lens.id;
  }

  function setLens(next: Lens) {
    lens = next;
    s.settings.set('currentLens', lens.id);
    ({ params } = currentLensState(s));
    seed = randomSeed();
    renderLensLabel();
    renderer?.trimInstances([lens.id]);
    dirty = true;
  }

  function setParams(next: Params) {
    params = next;
    s.settings.setLensParams(lens.id, params);
    dirty = true;
  }

  // ---------- Sheets ----------
  function openParams() {
    sheet?.close();
    const container = h('div');
    const build = () => {
      container.replaceChildren(
        paramControls(lens.params, params, setParams),
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
  let down: { x: number; y: number; id: number } | null = null;
  let holdTimer = 0;
  stage.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    stage.setPointerCapture(e.pointerId);
    holdTimer = window.setTimeout(() => {
      comparing = true;
      compareBadge.hidden = false;
      dirty = true;
    }, 220);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!down || comparing) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) clearTimeout(holdTimer);
  });
  const endPointer = (e: PointerEvent) => {
    clearTimeout(holdTimer);
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
    const fresh = source.update(now);
    if (!fresh && !dirty) return;
    try {
      if (fresh) renderer.setInput(source.element, source.width, source.height);
      renderer.drawPreview({ lens, params, seed, fit: 'cover', showOriginal: comparing, scale: adaptive.scale });
      dirty = false;
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
  async function capture() {
    if (!renderer) {
      toast('This device can’t render lenses (WebGL2 unavailable).');
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
    try {
      const still = await source.takeStill(s.settings.get().captureSource);
      s.diag.camera = source.info();
      void s.queue
        .add(async () => {
          await processAndSave(s, {
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
    saving.textContent = pending > 1 ? `Saving… (${pending})` : 'Saving…';
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
