const fs = require('fs');

let page = fs.readFileSync('src/app/components/AnalysisModal.tsx', 'utf8');

const buttonRegex = /<button[\s\S]*?key=\{cat\}[\s\S]*?onClick=\{\(\) => toggleCategory\(cat\)\}[\s\S]*?style=\{\{[\s\S]*?\}\}[\s\S]*?>[\s\S]*?<div style=\{\{[\s\S]*?\}\} \/>[\s\S]*?\{cat\}[\s\S]*?<\/button>/;

const newJSX = `
                  <label
                    key={cat}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'var(--text-title)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      userSelect: 'none',
                      background: 'var(--card)',
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)'
                    }}
                  >
                    <input
                      type={singleCategorySelect ? "radio" : "checkbox"}
                      checked={isActive}
                      onChange={() => toggleCategory(cat)}
                      style={{ cursor: 'pointer', accentColor: color }}
                    />
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, opacity: isActive ? 1 : 0.4 }} />
                    {cat}
                  </label>
`;

page = page.replace(buttonRegex, newJSX.trim());
fs.writeFileSync('src/app/components/AnalysisModal.tsx', page, 'utf8');
console.log('Replaced buttons with checkboxes in AnalysisModal');
