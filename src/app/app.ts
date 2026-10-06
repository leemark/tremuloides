import type { Services } from './services';
import type { Capture } from '../storage/types';
import type { Params } from '../lenses/types';
import { logEvent } from '../diagnostics/log';
import { createViewfinder } from './screens/viewfinder';
import { createGallery } from './screens/gallery';
import { createDetail } from './screens/detail';
import { createEditor } from './screens/editor';
import { createSettings } from './screens/settings';
import { createFieldLog } from './screens/fieldlog';

export interface EditorInput {
  blob: Blob;
  source: 'import' | 'derived';
  parent?: Capture;
  lensId?: string;
  params?: Params;
  seed?: number;
  overlay?: { kind: string; strength: number };
}

export type Route =
  | { name: 'viewfinder' }
  | { name: 'gallery' }
  | { name: 'detail'; id: string }
  | { name: 'editor'; input: EditorInput }
  | { name: 'settings' }
  | { name: 'fieldlog' };

export interface Screen {
  el: HTMLElement;
  mount?(): void;
  unmount?(): void;
}

/** Minimal stack router that keeps Android's back button working. */
export class App {
  private stack: Route[] = [];
  private current: Screen | null = null;

  constructor(
    readonly root: HTMLElement,
    readonly s: Services,
  ) {}

  start(): void {
    this.stack = [{ name: 'viewfinder' }];
    history.replaceState({ depth: 1 }, '');
    window.addEventListener('popstate', (e) => {
      const depth = typeof (e.state as { depth?: unknown } | null)?.depth === 'number' ? (e.state as { depth: number }).depth : 1;
      this.stack = this.stack.slice(0, Math.max(1, depth));
      this.show(this.stack[this.stack.length - 1] ?? { name: 'viewfinder' });
    });
    this.show(this.stack[0] as Route);
  }

  navigate(route: Route): void {
    this.stack.push(route);
    history.pushState({ depth: this.stack.length }, '');
    this.show(route);
  }

  /** Replaces the current screen (no new history entry). */
  replace(route: Route): void {
    this.stack[this.stack.length - 1] = route;
    this.show(route);
  }

  back(): void {
    if (this.stack.length > 1) history.back();
    else this.replace({ name: 'viewfinder' });
  }

  /** Back to the viewfinder, dropping intermediate screens. */
  home(): void {
    const extra = this.stack.length - 1;
    if (extra > 0) history.go(-extra);
  }

  private show(route: Route): void {
    try {
      this.current?.unmount?.();
    } catch (e) {
      logEvent('error', 'app', 'Screen unmount failed', e);
    }
    const screen = this.create(route);
    this.current = screen;
    this.root.replaceChildren(screen.el);
    try {
      screen.mount?.();
    } catch (e) {
      logEvent('error', 'app', `Screen mount failed: ${route.name}`, e);
    }
  }

  private create(route: Route): Screen {
    switch (route.name) {
      case 'viewfinder':
        return createViewfinder(this);
      case 'gallery':
        return createGallery(this);
      case 'detail':
        return createDetail(this, route.id);
      case 'editor':
        return createEditor(this, route.input);
      case 'settings':
        return createSettings(this);
      case 'fieldlog':
        return createFieldLog(this);
    }
  }
}
