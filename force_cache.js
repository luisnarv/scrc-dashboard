const fs = require('fs');
let code = fs.readFileSync('src/lib/queries_v2.ts', 'utf8');
code = code.replace(/MAX\(fecha_carga\)::text as "version"/, 'MAX(fecha_carga)::text || \'-v2\' as "version"');
fs.writeFileSync('src/lib/queries_v2.ts', code, 'utf8');
console.log('Cache version updated');
