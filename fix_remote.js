const fs = require('fs');
let remote = fs.readFileSync('src/app/lib/cache/remoteSource.ts', 'utf8');
remote = remote.replace(/horarioTec:\s*data\.horarioTec\s*\|\|\s*\[\],/, 'horarioTec: data.horarioTec || [],\n      perdidas: data.perdidas || [],');
fs.writeFileSync('src/app/lib/cache/remoteSource.ts', remote, 'utf8');
console.log('Fixed remoteSource');
