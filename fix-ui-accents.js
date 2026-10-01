const fs = require('fs');
const path = require('path');

const accentMap = {
  '\\bordenes\\b': 'órdenes',
  '\\borden\\b': 'orden', // avoid changing order
  '\\bgrafico\\b': 'gráfico',
  '\\bgraficos\\b': 'gráficos',
  '\\bgrafica\\b': 'gráfica',
  '\\bgraficas\\b': 'gráficas',
  '\\btecnico\\b': 'técnico',
  '\\btecnicos\\b': 'técnicos',
  '\\btecnica\\b': 'técnica',
  '\\basignacion\\b': 'asignación',
  '\\basignaciones\\b': 'asignaciones',
  '\\bejecucion\\b': 'ejecución',
  '\\brecoleccion\\b': 'recolección',
  '\\binformacion\\b': 'información',
  '\\bsuspension\\b': 'suspensión',
  '\\breconexion\\b': 'reconexión',
  '\\bproduccion\\b': 'producción',
  '\\bfacturacion\\b': 'facturación',
  '\\bdia\\b': 'día',
  '\\bdias\\b': 'días',
  '\\bsabado\\b': 'sábado',
  '\\bsabados\\b': 'sábados',
  '\\bmas\\b': 'más',
  '\\bultima\\b': 'última',
  '\\bultimo\\b': 'último',
  '\\bultimos\\b': 'últimos',
  '\\bhistorico\\b': 'histórico',
  '\\bhistoricos\\b': 'históricos',
  '\\bcumplimiento\\b': 'cumplimiento', // No accent
  '\\blinea\\b': 'línea',
  '\\bgestion\\b': 'gestión',
  '\\boperacion\\b': 'operación',
  '\\bconfiguracion\\b': 'configuración',
  '\\bubicacion\\b': 'ubicación',
  '\\bobservacion\\b': 'observación',
  '\\bobservaciones\\b': 'observaciones',
};

function fixUI(str) {
  let res = str;
  // Solo reemplazar si está dentro de texto de JSX >...< o strings simples entre comillas que parezcan texto
  for (const [bad, good] of Object.entries(accentMap)) {
    if (bad === '\\borden\\b' || bad === '\\bcumplimiento\\b') continue;
    
    // Replace in JSX text: > ... word ... <
    const regexJSX = new RegExp(`>([^<]*)${bad}([^<]*)<`, 'gi');
    let prev = '';
    while (res !== prev) {
      prev = res;
      res = res.replace(regexJSX, (m, p1, p2) => {
        // match the case of the first letter
        const matchStr = m.match(new RegExp(bad, 'i'))[0];
        const isUpper = matchStr[0] === matchStr[0].toUpperCase();
        let repl = isUpper ? good.charAt(0).toUpperCase() + good.slice(1) : good;
        // if all caps
        if (matchStr === matchStr.toUpperCase()) repl = repl.toUpperCase();
        return `>${p1}${repl}${p2}<`;
      });
    }

    // Replace in title="..." strings
    const regexTitle = new RegExp(`(title|description|narr|label)=["']([^"']*)${bad}([^"']*)["']`, 'gi');
    prev = '';
    while (res !== prev) {
      prev = res;
      res = res.replace(regexTitle, (m, attr, p1, p2) => {
        const matchStr = m.match(new RegExp(bad, 'i'))[0];
        const isUpper = matchStr[0] === matchStr[0].toUpperCase();
        let repl = isUpper ? good.charAt(0).toUpperCase() + good.slice(1) : good;
        if (matchStr === matchStr.toUpperCase()) repl = repl.toUpperCase();
        return `${attr}="${p1}${repl}${p2}"`;
      });
    }
    
    // Replace inside template literals that look like text: \`... word ...\`
    const regexTpl = new RegExp(`\\\`([^\\\`]*)${bad}([^\\\`]*)\\\``, 'gi');
    prev = '';
    while (res !== prev) {
      prev = res;
      res = res.replace(regexTpl, (m, p1, p2) => {
        // Only if it has spaces (looks like a sentence)
        if (!p1.includes(' ') && !p2.includes(' ')) return m;
        const matchStr = m.match(new RegExp(bad, 'i'))[0];
        const isUpper = matchStr[0] === matchStr[0].toUpperCase();
        let repl = isUpper ? good.charAt(0).toUpperCase() + good.slice(1) : good;
        if (matchStr === matchStr.toUpperCase()) repl = repl.toUpperCase();
        return `\`${p1}${repl}${p2}\``;
      });
    }
  }
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
    } else if(p.endsWith('.tsx') || p.endsWith('.ts')) {
      const original = fs.readFileSync(p, 'utf8');
      const fixed = fixUI(original);
      if (original !== fixed) {
        fs.writeFileSync(p, fixed, 'utf8');
        count++;
        console.log('Fixed UI accents in:', p);
      }
    }
  }
  return count;
}
console.log('Total files fixed:', scan('src'));
