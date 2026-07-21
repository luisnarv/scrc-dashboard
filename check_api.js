const http = require('http');

http.get('http://localhost:3000/api/data/base', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('Meses en mesRecords:', parsed.mesRecords);
      const mRawC = {};
      parsed.rawRecords.forEach(r => {
        const m = r.Fecha ? String(r.Fecha).slice(0, 7) : r.Mes;
        if (m) mRawC[m] = (mRawC[m] || 0) + 1;
      });
      console.log('mRawC counts:', mRawC);
    } catch(e) {
      console.error(e.message);
    }
  });
}).on('error', console.error);
