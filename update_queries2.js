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

  code = code.replace(
    /return \{\s*mes: mes \|\| 'ALL',\s*rawRecords,\s*costos: costosFinal,\s*emps,\s*mesRecords: mesRes\.rows,\s*dispDiaria: dispRes\.rows,\s*horario: horarioRes\.rows,\s*horarioTec: horarioTecRes\.rows,\s*\};/g,
    (match) => {
      return injection + '\n    ' + match.replace('};', '  perdidas: perdidasRes.rows,\n    };');
    }
  );
  
  // Update the fallback return at the beginning
  code = code.replace(
    /dispDiaria: \[\],\s*horario: \[\],/g,
    'dispDiaria: [],\n        horario: [],\n        perdidas: [],'
  );

  fs.writeFileSync('src/lib/queries_v2.ts', code, 'utf8');
}
console.log('Queries updated');
