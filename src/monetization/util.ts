/** Resolve with `fallback` if `p` has not settled within `ms`, or rejects. Never rejects itself. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}

/** Inject a <script>. Resolves false on error/timeout/blocked (ad blockers). Only ever called for the selected platform. */
export function loadScript(src: string, ms: number): Promise<boolean> {
  return withTimeout(new Promise<boolean>((resolve) => {
    if (typeof document === 'undefined') { resolve(false); return; }
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  }), ms, false);
}

export const fmtEur = (cents: number): string => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
