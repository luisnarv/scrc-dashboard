const fs = require('fs');
let page = fs.readFileSync('src/app/operativo/page.tsx', 'utf8');
page = page.replace(/isDark \?/g, "theme === 'dark' ?");
fs.writeFileSync('src/app/operativo/page.tsx', page, 'utf8');
console.log('Fixed theme error');
