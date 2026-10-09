const fs = require('fs');
let code = fs.readFileSync('src/app/components/DashboardProvider.tsx', 'utf8');

if (!code.includes('perdidas: meses.flatMap(m => m.perdidas || [])')) {
  code = code.replace(
    /det: \[\],/,
    'perdidas: meses.flatMap(m => m.perdidas || []),'
  );
  fs.writeFileSync('src/app/components/DashboardProvider.tsx', code, 'utf8');
}
console.log('Provider updated');
