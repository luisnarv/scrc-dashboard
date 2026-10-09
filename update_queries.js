const fs = require('fs');
let code = fs.readFileSync('src/lib/queries_v2.ts', 'utf8');

if (!code.includes('const perdidasRes = await query(`')) {
  const injection = `
    const perdidasRes = await query(\`
      SELECT 
        mo.fecha_cierre::text as "Fecha",
        mo.zona as "Zona",
        CASE WHEN UPPER(COALESCE(mo.zona,'')) LIKE '%SUR%' THEN 'Sur' ELSE 'Norte-Centro' END as "Proyecto",
        mo.brigada_homologada as "Brigada",
        mo.tecnico as "Tecnico",
        mo.accion as "Accion",
        mo.subaccion_homologada as "Subaccion",
        mo.observacion as "Observacion"
      FROM dbanalitica.historico_mo mo
      \${fechaCond} AND mo.estado_norm = 'Perdida'
    \`, params);
`;

  // We need to inject it before `return { ... }` in getDashboardDataV2
  code = code.replace(
    /(return\s*\{\s*mes: mes \|\| 'ALL',[\s\S]*?rawRecords: rawFinal,[\s\S]*?costos: costosFinal,[\s\S]*?emps: empsFinal,[\s\S]*?mesRecords: mesRes\.rows,[\s\S]*?dispDiaria: dispRes\.rows,[\s\S]*?horario: horRes\.rows,[\s\S]*?horarioTec: horTecRes\.rows,)/,
    (match) => {
      return injection + '\n    ' + match + '\n      perdidas: perdidasRes.rows,';
    }
  );
  fs.writeFileSync('src/lib/queries_v2.ts', code, 'utf8');
}
console.log('Queries updated');
