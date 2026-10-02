import type { App, Screen } from '../app';
import { formatDateTime, h, ICONS, iconButton, openSheet, toast } from '../ui';
import { dayKey, formatDayHeading, metersToFeet } from '../../util/format';
import { accentHex } from '../../fieldlog/analyze';
import { parseTrip, tripCaptures, tripStats, type Trip, type TripStats } from '../../fieldlog/trip';
import { drawPoster, POSTER_SIZE, posterItems, type PosterLayout } from '../../fieldlog/poster';
import { randomSeed } from '../../util/prng';
import { shareFiles } from '../share';
import { logEvent, errorMessage } from '../../diagnostics/log';
import type { Capture } from '../../storage/types';

type View = 'timeline' | 'elevation' | 'constellation';

const ft = (m: number) => `${Math.round(metersToFeet(m)).toLocaleString()} ft`;

function dateRange(stats: TripStats): string {
  if (!stats.first || !stats.last) return '';
  const f = new Date(stats.first);
  const l = new Date(stats.last);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const a = f.toLocaleDateString(undefined, opts);
  const b = l.toLocaleDateString(undefined, { ...opts, year: 'numeric' });
  return dayKey(stats.first) === dayKey(stats.last) ? b : `${a} – ${b}`;
}

function elevationRange(stats: TripStats): string {
  if (stats.minAlt === null || stats.maxAlt === null) return '';
  return stats.minAlt === stats.maxAlt ? ft(stats.minAlt) : `${ft(stats.minAlt)} – ${ft(stats.maxAlt)}`;
}

/** A passive colour diary of the trip: palettes over time, elevation and place. */
export function createFieldLog(app: App): Screen {
  const s = app.s;
  let trip: Trip = parseTrip(s.settings.flag('trip'));
  let caps: Capture[] = [];
  let view: View = 'timeline';
  const cleanups: (() => void)[] = [];

  const titleEl = h('h1', { text: trip.name });
  const header = h(
    'header',
    { class: 'screen-header' },
    iconButton(ICONS.back, 'Back', () => app.back()),
    titleEl,
    iconButton(ICONS.edit, 'Edit trip', () => editTrip()),
  );
  const statsEl = h('p', { class: 'fl-stats' });
  const progressEl = h('p', { class: 'fl-progress', hidden: true });
  const tabs = h('div', { class: 'segmented fl-tabs', role: 'tablist' });
  const body = h('div', { class: 'fl-body' });
  const posterBtn = h('button', { class: 'btn btn-primary btn-block', text: 'Make chromatograph poster', onclick: () => openPoster() });
  const el = h(
    'div',
    { class: 'screen fieldlog' },
    header,
    h('main', { class: 'fl-scroll' }, statsEl, progressEl, tabs, body),
    h('div', { class: 'fl-actions' }, posterBtn),
  );

  for (const [v, label] of [['timeline', 'Timeline'], ['elevation', 'Elevation'], ['constellation', 'Map']] as const) {
    tabs.append(
      h('button', {
        class: `seg ${v === view ? 'on' : ''}`,
        role: 'tab',
        text: label,
        onclick: (e: Event) => {
          view = v;
          for (const b of tabs.querySelectorAll('.seg')) b.classList.remove('on');
          (e.currentTarget as HTMLElement).classList.add('on');
          renderBody();
        },
      }),
    );
  }

  async function load() {
    try {
      caps = tripCaptures(await s.store.list(), trip);
    } catch (e) {
      logEvent('error', 'fieldlog', 'Could not read captures', e);
      return;
    }
    const st = tripStats(caps);
    titleEl.textContent = trip.name;
    const parts = [`${st.photos} photo${st.photos === 1 ? '' : 's'}`, `${st.days} day${st.days === 1 ? '' : 's'}`];
    const elev = elevationRange(st);
    if (elev) parts.push(elev);
    if (st.avgWarm !== null) parts.push(`${Math.round(st.avgWarm * 100)}% autumn color`);
    statsEl.textContent = parts.join(' · ');
    posterBtn.disabled = !caps.some((c) => c.fieldlog);
    renderBody();
  }

  function renderBody() {
    body.replaceChildren();
    if (caps.length === 0) {
      body.append(h('p', { class: 'muted fl-empty', text: 'No photos in this trip yet. Each photo you take adds its colors here.' }));
      return;
    }
    if (view === 'timeline') renderTimeline();
    else renderPlot(view);
  }

  function renderTimeline() {
    let day = '';
    for (const c of [...caps].reverse()) {
      const d = dayKey(c.createdAt);
      if (d !== day) {
        day = d;
        body.append(h('h2', { class: 'day-heading', text: formatDayHeading(d) }));
      }
      const stripe = h('div', { class: 'fl-stripe' });
      if (c.fieldlog) {
        for (const p of c.fieldlog.palette) stripe.append(h('span', { style: { flex: String(p.weight), background: p.hex } }));
      } else {
        stripe.classList.add('pending');
      }
      const meta = [new Date(c.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })];
      if (c.geo?.altitude != null) meta.push(ft(c.geo.altitude));
      if (c.fieldlog) meta.push(`${Math.round(c.fieldlog.warmIndex * 100)}% warm`);
      body.append(
        h(
          'button',
          { class: 'fl-row', 'aria-label': `Photo from ${formatDateTime(c.createdAt)}`, onclick: () => app.navigate({ name: 'detail', id: c.id }) },
          stripe,
          h('span', { class: 'fl-meta', text: meta.join(' · ') }),
        ),
      );
    }
  }

  function renderPlot(kind: 'elevation' | 'constellation') {
    const pts = caps.filter((c) => (kind === 'elevation' ? c.geo?.altitude != null : c.geo));
    const missing = caps.length - pts.length;
    if (pts.length === 0) {
      body.append(
        h('p', {
          class: 'muted fl-empty',
          text: kind === 'elevation' ? 'No photos with elevation yet. Turn on Location tagging in Settings.' : 'No photos with location yet. Turn on Location tagging in Settings.',
        }),
      );
      return;
    }
    const canvas = h('canvas', { class: 'fl-plot', role: 'img', 'aria-label': kind === 'elevation' ? 'Elevation over time' : 'Map of photo locations' });
    body.append(canvas);
    if (missing > 0) body.append(h('p', { class: 'muted small', text: `${missing} photo${missing === 1 ? '' : 's'} without ${kind === 'elevation' ? 'elevation' : 'location'} not shown.` }));
    requestAnimationFrame(() => drawPlot(canvas, pts, kind));
  }

  function drawPlot(canvas: HTMLCanvasElement, pts: Capture[], kind: 'elevation' | 'constellation') {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = canvas.clientWidth;
    const H = kind === 'elevation' ? 280 : Math.min(W * 1.1, 460);
    canvas.style.height = `${H}px`;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const pad = { l: kind === 'elevation' ? 62 : 16, r: 16, t: 16, b: kind === 'elevation' ? 30 : 16 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;
    let xy: [number, number][];
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#a7a59c';
    ctx.strokeStyle = 'rgba(243,242,236,0.12)';
    if (kind === 'elevation') {
      const t = pts.map((c) => new Date(c.createdAt).getTime());
      const a = pts.map((c) => c.geo?.altitude ?? 0);
      const [t0, t1] = [Math.min(...t), Math.max(...t)];
      let [a0, a1] = [Math.min(...a), Math.max(...a)];
      if (a1 - a0 < 30) {
        a0 -= 15;
        a1 += 15;
      }
      xy = pts.map((_, i) => [
        pad.l + (t1 > t0 ? ((t[i] ?? 0) - t0) / (t1 - t0) : 0.5) * pw,
        pad.t + (1 - ((a[i] ?? 0) - a0) / (a1 - a0)) * ph,
      ]);
      for (const [v, y] of [[a1, pad.t], [a0, pad.t + ph]] as const) {
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(W - pad.r, y);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(ft(v), pad.l - 6, y + 4);
      }
      ctx.textAlign = 'left';
      ctx.fillText(new Date(t0).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), pad.l, H - 8);
      ctx.textAlign = 'right';
      ctx.fillText(new Date(t1).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), W - pad.r, H - 8);
      ctx.textAlign = 'left';
    } else {
      const lat = pts.map((c) => c.geo?.lat ?? 0);
      const lon = pts.map((c) => c.geo?.lon ?? 0);
      const k = Math.cos(((Math.min(...lat) + Math.max(...lat)) / 2) * (Math.PI / 180));
      const xs = lon.map((v) => v * k);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...lat), Math.max(...lat)];
      const span = Math.max(x1 - x0, y1 - y0, 1e-4);
      const s2 = Math.min(pw, ph) / span;
      const ox = pad.l + (pw - (x1 - x0) * s2) / 2;
      const oy = pad.t + (ph - (y1 - y0) * s2) / 2;
      xy = pts.map((_, i) => [ox + ((xs[i] ?? 0) - x0) * s2, oy + (y1 - (lat[i] ?? 0)) * s2]);
      const km = (span * 111.32).toFixed(span * 111.32 < 10 ? 1 : 0);
      ctx.fillText(`${km} km across · north up`, pad.l, H - 4);
    }
    // Path in time order, then dots coloured by each photo's accent colour.
    ctx.strokeStyle = 'rgba(233,184,37,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    xy.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    xy.forEach(([x, y], i) => {
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = accentHex(pts[i]?.fieldlog);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0e0f11';
      ctx.stroke();
    });
  }

  function editTrip() {
    const name = h('input', { type: 'text', value: trip.name, maxlength: 60, 'aria-label': 'Trip name' });
    const start = h('input', { type: 'date', value: trip.start ?? '', 'aria-label': 'Start date' });
    const end = h('input', { type: 'date', value: trip.end ?? '', 'aria-label': 'End date' });
    const backdrop = h(
      'div',
      { class: 'dialog-backdrop' },
      h(
        'div',
        { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
        h('label', { class: 'fl-label', text: 'Trip name' }),
        name,
        h('label', { class: 'fl-label', text: 'Starts (blank = first photo)' }),
        start,
        h('label', { class: 'fl-label', text: 'Ends (blank = ongoing)' }),
        end,
        h(
          'div',
          { class: 'dialog-actions' },
          h('button', { class: 'btn', text: 'Cancel', onclick: () => backdrop.remove() }),
          h('button', {
            class: 'btn btn-primary',
            text: 'Save',
            onclick: () => {
              trip = parseTrip(JSON.stringify({ name: name.value, start: start.value || null, end: end.value || null }));
              s.settings.setFlag('trip', JSON.stringify(trip));
              backdrop.remove();
              void load();
            },
          }),
        ),
      ),
    );
    document.body.append(backdrop);
  }

  function openPoster() {
    let layout: PosterLayout = 'stripes-time';
    let seed = randomSeed();
    const preview = h('canvas', { class: 'fl-poster-preview', width: 300, height: 450 });
    const st = tripStats(caps);
    const text = () => ({ title: trip.name, dates: dateRange(st), elevation: elevationRange(st) });
    const draw = () => {
      const ctx = preview.getContext('2d');
      if (ctx) drawPoster(ctx, 300, 450, posterItems(caps, layout), layout, seed, text());
    };
    const seg = h('div', { class: 'segmented fl-layouts' });
    for (const [v, label] of [['stripes-time', 'Time'], ['stripes-elevation', 'Elevation'], ['rings', 'Rings'], ['grid', 'Grid']] as const) {
      seg.append(
        h('button', {
          class: `seg ${v === layout ? 'on' : ''}`,
          text: label,
          onclick: (e: Event) => {
            layout = v;
            for (const b of seg.querySelectorAll('.seg')) b.classList.remove('on');
            (e.currentTarget as HTMLElement).classList.add('on');
            draw();
          },
        }),
      );
    }
    const exportBtn = h('button', {
      class: 'btn btn-primary',
      text: 'Export PNG',
      onclick: async () => {
        exportBtn.disabled = true;
        exportBtn.textContent = 'Rendering…';
        const end = s.busy.begin();
        try {
          const blob = await renderPoster(layout, seed, text());
          const safe = trip.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'trip';
          const r = await shareFiles([new File([blob], `tremuloides_chromatograph_${safe}_${layout}.png`, { type: 'image/png' })]);
          if (r === 'downloaded') toast('Poster saved to Downloads');
        } catch (e) {
          logEvent('error', 'fieldlog', 'Poster export failed', e);
          toast(`Poster export failed: ${errorMessage(e)}`);
        } finally {
          end();
          exportBtn.disabled = false;
          exportBtn.textContent = 'Export PNG';
        }
      },
    });
    const noGeo = caps.filter((c) => c.fieldlog && c.geo?.altitude == null).length;
    openSheet(
      'Chromatograph',
      h(
        'div',
        { class: 'fl-poster' },
        seg,
        preview,
        noGeo ? h('p', { class: 'muted small', text: `Elevation layout leaves out ${noGeo} photo${noGeo === 1 ? '' : 's'} without elevation.` }) : null,
        h(
          'div',
          { class: 'sheet-actions' },
          h('button', {
            class: 'btn',
            html: `${ICONS.dice}<span>New seed</span>`,
            onclick: () => {
              seed = randomSeed();
              draw();
            },
          }),
          exportBtn,
        ),
      ),
    );
    draw();
  }

  async function renderPoster(layout: PosterLayout, seed: number, text: { title: string; dates: string; elevation: string }): Promise<Blob> {
    const items = posterItems(caps, layout);
    // Full print size first; fall back to 2/3 size on devices that can't allocate it.
    for (const scale of [1, 2 / 3]) {
      const W = Math.round(POSTER_SIZE.width * scale);
      const H = Math.round(POSTER_SIZE.height * scale);
      try {
        const c = new OffscreenCanvas(W, H);
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('2D canvas unavailable');
        drawPoster(ctx, W, H, items, layout, seed, text);
        return await c.convertToBlob({ type: 'image/png' });
      } catch (e) {
        logEvent('warn', 'fieldlog', `Poster at ${W}×${H} failed`, e);
      }
    }
    throw new Error('Not enough memory for the poster');
  }

  return {
    el,
    mount() {
      void load();
      cleanups.push(
        s.fieldlog.onProgress((remaining) => {
          progressEl.hidden = remaining === 0;
          progressEl.textContent = `Analyzing colors… ${remaining} to go`;
          if (remaining === 0) void load();
        }),
      );
      void s.fieldlog.run();
    },
    unmount() {
      for (const c of cleanups) c();
    },
  };
}
