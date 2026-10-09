const fs = require('fs');

let page = fs.readFileSync('src/app/components/AnalysisModal.tsx', 'utf8');

const oldButton = `                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    style={{
                      background: isActive ? 'var(--hover-bg, var(--ok-bg))' : 'var(--card)',
                      border: \`1.5px solid \${isActive ? color : 'var(--border)'}\`,
                      color: isActive ? 'var(--text-title)' : 'var(--text-muted)',
                      padding: '6px 14px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      height: 32,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      opacity: (!isActive && singleCategorySelect) ? 0.6 : 1,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    {cat}
                  </button>
                );`;

const newJSX = `                return (
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
                      border: \`1px solid \${isActive ? color : 'var(--border)'}\`,
                      opacity: (!isActive && singleCategorySelect) ? 0.6 : 1,
                      transition: 'all 0.2s ease'
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
                );`;

page = page.replace(oldButton, newJSX);
fs.writeFileSync('src/app/components/AnalysisModal.tsx', page, 'utf8');
console.log('Replaced correctly');
