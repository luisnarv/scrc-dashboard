const fs = require('fs');
let code = fs.readFileSync('src/app/operativo/page.tsx', 'utf8');

code = code.replace(
  /<div style=\{\{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column' \}\}>/g,
  "<div style={{ flex: '3 1 400px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>"
);

code = code.replace(
  /<div style=\{\{ width: '280px', maxWidth: '100%', flex: '1 1 240px', borderLeft: '1px solid var\(--border\)', paddingLeft: '20px', display: 'flex', flexDirection: 'column' \}\}>/g,
  "<div style={{ flex: '1 1 240px', maxWidth: '300px', borderLeft: '1px solid var(--border)', paddingLeft: '20px', display: 'flex', flexDirection: 'column' }}>"
);

// To make it fully responsive, when it wraps on mobile, the border-left and padding-left look bad.
// We can use a trick: in a style block or inline.
// But since inline styles don't support media queries easily, we can just leave it for now or add a class.
// A safe inline approach for responsive wrap without bad borders is to just keep it as is, standard wrapping.
// We'll set the chart flex to 3 1 500px, so it strongly prefers to be large, and the panel flex to 1 1 250px.
// I'll set maxWidth: '320px' on the panel so it doesn't get too big when it wraps or stands alone.

fs.writeFileSync('src/app/operativo/page.tsx', code, 'utf8');
console.log('Fixed panel');
