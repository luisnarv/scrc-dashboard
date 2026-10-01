const fs = require('fs');

// Add to globals.css
let css = fs.readFileSync('src/app/globals.css', 'utf8');
if (!css.includes('.panel-lateral')) {
  css += `
.panel-lateral {
  flex: 1 1 240px;
  max-width: 300px;
  border-left: 1px solid var(--border);
  padding-left: 20px;
  display: flex;
  flex-direction: column;
}

@media (max-width: 768px) {
  .panel-lateral {
    max-width: 100%;
    border-left: none;
    border-top: 1px solid var(--border);
    padding-left: 0;
    padding-top: 20px;
  }
}
`;
  fs.writeFileSync('src/app/globals.css', css, 'utf8');
}

// Update page.tsx
let code = fs.readFileSync('src/app/operativo/page.tsx', 'utf8');
code = code.replace(
  /<div style=\{\{ flex: '1 1 240px', maxWidth: '300px', borderLeft: '1px solid var\(--border\)', paddingLeft: '20px', display: 'flex', flexDirection: 'column' \}\}>/g,
  '<div className="panel-lateral">'
);
fs.writeFileSync('src/app/operativo/page.tsx', code, 'utf8');
console.log('Fixed responsive');
