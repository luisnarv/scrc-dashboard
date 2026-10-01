const fs = require('fs');

const pagePath = 'src/app/cierre_diario/page.tsx';
let page = fs.readFileSync(pagePath, 'utf8');
if (!page.includes('fetchHorasDinamic')) {
  const effectCode = [
    '  // Cargar horas dinámicas según el filtro de fecha',
    '  useEffect(() => {',
    '    let isCancelled = false;',
    '    const fetchHorasDinamic = async () => {',
    '      try {',
    '        const fechaQuery = (!filters.fecha || filters.fecha === "ALL") ? "HOY" : filters.fecha;',
    '        const res = await fetch(`/api/data/cierre_diario_horas?fechas=${fechaQuery}`);',
    '        if (res.ok && !isCancelled) {',
    '          const json = await res.json();',
    '          setDataHoras(json.barriosHoras || []);',
    '        }',
    '      } catch (err) {}',
    '    };',
    '    fetchHorasDinamic();',
    '    return () => { isCancelled = true; };',
    '  }, [filters.fecha]);'
  ].join('\n');
  
  page = page.replace('  useEffect(() => {\n    fetchData();\n  }, [fetchData]);', '  useEffect(() => {\n    fetchData();\n  }, [fetchData]);\n\n' + effectCode);
  fs.writeFileSync(pagePath, page, 'utf8');
  console.log('Restored useEffect in page.tsx');
}
