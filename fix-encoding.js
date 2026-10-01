const fs = require('fs');
const path = require('path');

const replacements = {
  'Ã¡': 'á',
  'Ã©': 'é',
  'Ã­': 'í',
  'Ã³': 'ó',
  'Ãº': 'ú',
  'Ã±': 'ñ',
  'Ã ': 'Á',
  'Ã‰': 'É',
  'Ã\\xAD': 'Í',
  'Ã“': 'Ó',
  'Ãš': 'Ú',
  'Ã‘': 'Ñ',
  'Â¿': '¿',
  'Â¡': '¡',
  'Â°': '°',
  'Ã¼': 'ü',
  'â€¢': '•',
  'â€œ': '“',
  'â€ ': '”',
  'â€™': '’',
  'â€”': '—',
  'â€“': '–',
  'â˜…': '★'
};

function fixContent(str) {
  let res = str;
  for (const [bad, good] of Object.entries(replacements)) {
    res = res.split(bad).join(good);
  }
  // Remove standalone Â
  res = res.split('Â').join('');
  return res;
}

function scan(dir) {
  let count = 0;
  const files = fs.readdirSync(dir);
  for(let f of files) {
    if(f === 'node_modules' || f === '.next' || f === '.git') continue;
    const p = path.join(dir, f);
    if(fs.statSync(p).isDirectory()) {
      count += scan(p);
    } else if(p.endsWith('.tsx') || p.endsWith('.ts') || p.endsWith('.js') || p.endsWith('.css') || p.endsWith('.md')) {
      const original = fs.readFileSync(p, 'utf8');
      const fixed = fixContent(original);
      if (original !== fixed) {
        fs.writeFileSync(p, fixed, 'utf8');
        count++;
        console.log('Fixed:', p);
      }
    }
  }
  return count;
}
const fixedCount = scan('src');
console.log('Total files fixed:', fixedCount);
