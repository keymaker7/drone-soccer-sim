import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountTactics } from './view';
import { deserializeBoard } from './board';

// A deliberately small DOM/canvas double: checks real view handlers and storage,
// without claiming browser layout or rasterization coverage.
class ElementDouble {
  listeners = new Map<string, ((event: any) => void)[]>();
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  style: Record<string, string> = {};
  textContent = '';
  value = 'blue-S';
  clientWidth = 1000;
  parentElement: ElementDouble | null = null;
  addEventListener(name: string, callback: (event: any) => void) { this.listeners.set(name, [...this.listeners.get(name) ?? [], callback]); }
  emit(name: string, event: Record<string, unknown> = {}) { for (const fn of this.listeners.get(name) ?? []) fn({ preventDefault() {}, ...event }); }
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  closest() { return this; }
}
class CanvasDouble extends ElementDouble {
  width = 0;
  height = 0;
  captured: number | null = null;
  context = new Proxy<Record<string, any>>({}, { get(target, property: string) { return target[property] ?? (() => {}); } });
  getContext() { return this.context; }
  setPointerCapture(id: number) { this.captured = id; }
  hasPointerCapture(id: number) { return this.captured === id; }
  releasePointerCapture() { this.captured = null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.parentElement!.clientWidth, height: parseFloat(this.style.height) }; }
}
class ContainerDouble extends ElementDouble {
  canvas = new CanvasDouble();
  status = new ElementDouble();
  select = new ElementDouble();
  size = new ElementDouble();
  wrap = new ElementDouble();
  buttons: ElementDouble[] = [];
  constructor() { super(); this.canvas.parentElement = this.wrap; }
  set innerHTML(html: string) {
    this.buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(match => {
      const element = new ElementDouble(); element.textContent = match[2];
      for (const attr of match[1].matchAll(/data-([a-z]+)="([^"]*)"/g)) element.dataset[attr[1]] = attr[2];
      return element;
    });
  }
  querySelector(selector: string) { return selector === 'canvas' ? this.canvas : selector === 'select' ? this.select : selector === '.tactics-status' ? this.status : this.size; }
  querySelectorAll(selector: string) { const key = selector.slice(6, -1); return this.buttons.filter(button => key in button.dataset); }
  click(key: string, value: string) { const target = this.buttons.find(button => button.dataset[key] === value); if (!target) throw new Error('Missing button'); this.emit('click', { target }); }
}
function setup() {
  const stored = new Map<string, string>();
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  vi.stubGlobal('ResizeObserver', class { observe() {} });
  vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => stored.set(key, value), getItem: (key: string) => stored.get(key) ?? null });
  const container = new ContainerDouble();
  let arena = { length: 24, width: 10.5, height: 6 };
  const view = mountTactics(container as unknown as HTMLElement, () => arena);
  const pointer = (name: string, x: number, y: number) => {
    const height = parseFloat(container.canvas.style.height);
    container.canvas.emit(name, { pointerId: 1, button: 0, clientX: 32 + x * (container.wrap.clientWidth - 64), clientY: 32 + y * (height - 64) });
  };
  const saved = () => { container.click('save', '1'); return deserializeBoard(stored.get('drone-tactics-slot-1')!)!; };
  return { container, view, pointer, saved, stored, setArena: (value: typeof arena) => { arena = value; } };
}
afterEach(() => vi.unstubAllGlobals());
describe('tactics view handlers', () => {
  it('drags a token, saves it, and restores the same position', () => {
    const { view, pointer, container, saved } = setup(); view.setActive(true);
    pointer('pointerdown', .34, .5); pointer('pointermove', .73, .64); pointer('pointerup', .73, .64);
    const dragged = saved();
    expect(dragged.tokens[0].x).toBeCloseTo(.73);
    expect(dragged.tokens[0].y).toBeCloseTo(.64);
    container.click('formation', 'defend'); container.click('load', '1');
    expect(saved()).toEqual(dragged);
    expect(container.status.textContent).toContain('저장');
  });
  it('draws a colored arrow and erases the entire stroke', () => {
    const { view, pointer, container, saved } = setup(); view.setActive(true);
    container.click('tool', 'arrow'); container.click('color', '#63e69a');
    pointer('pointerdown', .2, .3); pointer('pointermove', .5, .3); pointer('pointerup', .8, .3);
    expect(saved().strokes).toEqual([{ arrow: true, color: '#63e69a', points: [{ x: .2, y: .3 }, { x: .5, y: .3 }, { x: .8, y: .3 }] }]);
    container.click('tool', 'erase'); pointer('pointerdown', .5, .3); pointer('pointerup', .5, .3);
    expect(saved().strokes).toEqual([]);
  });
  it('updates arena ratio and keeps narrow canvas physical and CSS widths aligned', () => {
    const { view, container, setArena } = setup(); view.setActive(true);
    expect(container.canvas.height).toBe(Math.round((1000 - 64) * 10.5 / 24 + 64));
    setArena({ length: 16, width: 7, height: 4.5 }); container.wrap.clientWidth = 280; view.refresh();
    expect(container.canvas.width).toBe(280);
    expect(container.canvas.height).toBe(Math.round((280 - 64) * 7 / 16 + 64));
    expect(container.size.textContent).toContain('16 × 7');
  });
  it('ignores pointer input when inactive and cancels gestures when leaving', () => {
    const { view, pointer, saved } = setup(); view.setActive(true); view.setActive(false);
    pointer('pointerdown', .34, .5); pointer('pointermove', .7, .2); pointer('pointerup', .7, .2);
    expect(saved().tokens[0]).toMatchObject({ x: .34, y: .5 });
    view.setActive(true); pointer('pointerdown', .34, .5); view.setActive(false);
    pointer('pointermove', .7, .2); pointer('pointerup', .7, .2);
    expect(saved().tokens[0]).toMatchObject({ x: .34, y: .5 });
  });
  it('reports storage failure without throwing or losing the board', () => {
    const { view, container } = setup(); view.setActive(true);
    vi.stubGlobal('localStorage', { setItem() { throw new Error('blocked'); }, getItem() { throw new Error('blocked'); } });
    expect(() => container.click('save', '1')).not.toThrow(); expect(container.status.textContent).toContain('사용할 수 없어요');
    expect(() => container.click('load', '1')).not.toThrow(); expect(container.status.textContent).toContain('읽을 수 없어요');
  });
});
