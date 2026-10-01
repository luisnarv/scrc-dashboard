const fs = require('fs');
let code = fs.readFileSync('src/app/operativo/page.tsx', 'utf8');
code = code.replace(/display: 'grid', flexDirection: 'column'/g, "display: 'flex', flexDirection: 'column'");
fs.writeFileSync('src/app/operativo/page.tsx', code, 'utf8');
console.log('Fixed flex container');
