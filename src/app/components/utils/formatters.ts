export function fmtCOP(v: number | string | undefined | null): string {
  const n = Number(v);
  if (!v || isNaN(n)) return '$0';
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(3) + 'M';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
}

export function fmtN(v: number | string | undefined | null): string {
  const n = Number(v);
  if (!v || isNaN(n)) return '0';
  return new Intl.NumberFormat('es-CO').format(Math.round(n));
}

export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return (v * 100).toFixed(1) + '%';
}

export function deltaPct(a: number, b: number): number | null {
  if (!b || b === 0) return null;
  return (a - b) / Math.abs(b);
}
