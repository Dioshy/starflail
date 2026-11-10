/** Tiny DOM helpers. All screens live under #ui and use theme.css classes (.btn .panel .card .toggle .slider ...). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text: string | null = null, attrs: Record<string, string> = {}): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== null) e.textContent = text;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export function clear(e: Element): void { while (e.firstChild) e.removeChild(e.firstChild); }

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function uiRoot(): HTMLElement {
  let r = document.getElementById('ui');
  if (!r) { r = h('div', '', null, { id: 'ui' }); document.body.appendChild(r); }
  return r;
}
