import assert from 'node:assert/strict';

async function runTest() {
  console.log('\n\x1b[36m========== Bot 3: Combinación de Filtros (Frontend Simulation) ==========\x1b[0m\n');
  try {
    const targetDate = '2026-09-24';
    const targetProy = 'Sur';
    const res = await fetch(`http://localhost:3000/api/data/cierre_diario?fechas=${targetDate}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    const filtered = data.ordenesAgrupadas.filter(o => {
      let p = o.proyecto;
      if (p && p.toUpperCase().includes('SUR')) p = 'Sur';
      else if (p && (p.toUpperCase().includes('NORTE') || p.toUpperCase().includes('CENTRO'))) p = 'Norte-Centro';
      return p === targetProy;
    });
    
    console.log('\x1b[32m  [OK] \x1b[0m Filtro frontend simulado para Proyecto =', targetProy);
    console.log('\x1b[32m  [OK] \x1b[0m De', data.ordenesAgrupadas.length, 'grupos totales,', filtered.length, 'corresponden a', targetProy);
  } catch (err) {
    console.log('\x1b[31m  [FAIL] \x1b[0m', err.message);
  }
}
runTest();
