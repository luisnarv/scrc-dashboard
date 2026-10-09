// Colores de los gráficos de los modales: la paleta sale de las variables CSS de globals.css para que
// funcione en modo claro y oscuro. Chart.js dibuja en <canvas> y no entiende var(--x): por eso las
// configuraciones llevan tokens 'var(--ok)' o 'var(--ok|0.22)' (con transparencia) y ModalChart los
// resuelve al crear el gráfico y los vuelve a resolver cuando cambia el tema.

/**
 * Valor computado de una variable CSS.
 * Las variables de tema se declaran en `.theme-light` / `.theme-dark`, clases que ThemeProvider pone
 * en <body>; por eso se lee de body (en <html> solo existe el respaldo claro de :root).
 */
export function cssVar(name: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

/**
 * Colores que NO cambian con el tema (identidad de la serie, no del tema).
 * Única fuente: no repetir estos hex en las pantallas.
 */
export const CHART_FIXED = {
  META: '#F57C00',
  PROMEDIO: '#78909C',
} as const;

const TOKEN = /^var\((--[\w-]+)(?:\|([\d.]+))?\)$/;

/** Convierte '#rgb', '#rrggbb' o 'rgb(...)' en 'rgba(r,g,b,a)'. Otros formatos se devuelven igual. */
export function withAlpha(color: string, alpha: number): string {
  const c = color.trim();
  let m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const [r, g, b] = m[1].split('').map(h => parseInt(h + h, 16));
    return `rgba(${r},${g},${b},${alpha})`;
  }
  m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }
  m = c.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`;
  return c;
}

/** Resuelve un token 'var(--x)' / 'var(--x|0.3)'; si no es token lo devuelve tal cual. */
export function resolveColor(value: string): string {
  const t = value.match(TOKEN);
  if (!t) return value;
  const base = cssVar(t[1]);
  if (!base) return value;
  return t[2] !== undefined ? withAlpha(base, Number(t[2])) : base;
}

/**
 * Copia profunda de una configuración de Chart.js que resuelve los tokens de color y CONSERVA las
 * funciones (callbacks de tooltip, etc.). JSON.parse(JSON.stringify()) las perdía.
 */
export function resolveChartConfig<T>(input: T): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return resolveColor(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = walk(x);
      return o;
    }
    return v; // number, boolean, null, function
  };
  return walk(input) as T;
}

/** Copia profunda que conserva funciones (sin resolver colores). */
export function cloneConfig<T>(input: T): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = walk(x);
      return o;
    }
    return v;
  };
  return walk(input) as T;
}

/** Luminancia relativa WCAG de un color 'rgb(...)' o '#hex'. */
export function luminancia(color: string): number {
  const c = withAlpha(color, 1).match(/rgba\((\d+),(\d+),(\d+)/);
  if (!c) return 0;
  const [r, g, b] = [c[1], c[2], c[3]].map(x => {
    const s = Number(x) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Relación de contraste WCAG entre dos colores. */
export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
