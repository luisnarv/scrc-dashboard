const fs = require('fs');

let code = fs.readFileSync('src/lib/queries_v2.ts', 'utf8');

// 1. Update META_SUR for pesada
code = code.replace(
  /pesada:\s*\{\s*semana:\s*650_000,\s*sabado:\s*425_000\s*\}/,
  'pesada:  { semana: 780_000, sabado: 780_000 }'
);

// 2. Update Norte/Centro Sept 2026 onward
code = code.replace(
  /WHEN 'Brigada Pesada' THEN\s+\(CASE WHEN EXTRACT\(DOW FROM mo\.fecha_cierre\)=6 THEN 433723\.21\s+WHEN EXTRACT\(DOW FROM mo\.fecha_cierre\)=5 THEN 607212\.49\s+ELSE 693957\.14 END\)/,
  "WHEN 'Brigada Pesada' THEN 780000.00"
);

code = code.replace(
  /WHEN '\(D\) Brigada Pesada' THEN\s+\(CASE WHEN EXTRACT\(DOW FROM mo\.fecha_cierre\)=6 THEN 433723\.21\s+WHEN EXTRACT\(DOW FROM mo\.fecha_cierre\)=5 THEN 607212\.49\s+ELSE 693957\.14 END\)/,
  "WHEN '(D) Brigada Pesada' THEN 780000.00"
);

// To ensure it applies to all historical dates globally without messing up the other conditions,
// we can inject a catch-all at the top of META_DIARIA_SQL.
// Wait, no. META_SUR will catch Sur, and the Sept 2026 onward will catch the new ones.
// What about before Sept 2026 in Norte-Centro?
// Let's replace the historical block as well just to be thorough.
code = code.replace(
  /WHEN mo\.brigada_homologada IN \('Brigada Pesada','\(D\) Brigada Pesada','Brigada Liviana'\)/,
  "WHEN mo.brigada_homologada IN ('Brigada Liviana')"
);
// And insert the Pesada check for historical right before it
code = code.replace(
  /WHEN mo\.brigada_homologada IN \('Brigada Liviana'\)/,
  "WHEN mo.brigada_homologada IN ('Brigada Pesada', '(D) Brigada Pesada') THEN 780000.00\n            WHEN mo.brigada_homologada IN ('Brigada Liviana')"
);

fs.writeFileSync('src/lib/queries_v2.ts', code, 'utf8');
console.log('queries_v2.ts updated successfully');
