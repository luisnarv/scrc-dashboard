// Descargas de los modales: CSV (compatible con Excel) y PNG del gráfico.

export type Celda = string | number | null | undefined;

export function descargarBlob(nombre: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const esc = (c: Celda) => {
  const s = c === null || c === undefined ? '' : String(c);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Texto CSV con `;` como separador y BOM UTF-8: Excel en español lo abre con tildes y columnas bien. */
export function tablaACsv(columnas: string[], filas: Celda[][]): string {
  return '﻿' + [columnas, ...filas].map(f => f.map(esc).join(';')).join('\r\n');
}

export function descargarCsv(nombre: string, columnas: string[], filas: Celda[][]) {
  descargarBlob(nombre.endsWith('.csv') ? nombre : nombre + '.csv', new Blob([tablaACsv(columnas, filas)], { type: 'text/csv;charset=utf-8' }));
}

/** Aplana filas jerárquicas (padre + hijos) en filas planas para exportar. */
export function aplanarJerarquia(
  h: { row: Celda[]; children?: { row: Celda[] }[] }[] | undefined,
): Celda[][] {
  const out: Celda[][] = [];
  (h || []).forEach(p => {
    out.push(p.row);
    (p.children || []).forEach(c => out.push(c.row));
  });
  return out;
}

/** Descarga el <canvas> como PNG con fondo sólido (el canvas es transparente por defecto). */
export function descargarPngDeCanvas(canvas: HTMLCanvasElement | null, nombre: string, fondo: string): boolean {
  if (!canvas) return false;
  const tmp = document.createElement('canvas');
  tmp.width = canvas.width;
  tmp.height = canvas.height;
  const ctx = tmp.getContext('2d');
  if (!ctx) return false;
  ctx.fillStyle = fondo || '#ffffff';
  ctx.fillRect(0, 0, tmp.width, tmp.height);
  ctx.drawImage(canvas, 0, 0);
  tmp.toBlob(b => { if (b) descargarBlob(nombre.endsWith('.png') ? nombre : nombre + '.png', b); }, 'image/png');
  return true;
}

export const nombreArchivo = (base: string) =>
  base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
