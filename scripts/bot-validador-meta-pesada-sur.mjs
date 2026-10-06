import pg from 'pg';
import assert from 'assert';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/scrc' // Ajustar segn entorno
});

async function run() {
  console.log('Iniciando bot validador de metas de valorizacin (ZONA SUR) para Brigadas Pesadas...');
  try {
    // Validamos slo sintaxis o esperamos hasta que se aplique la lgica en la API (simulacin)
    // Aqu verificaremos si la cadena 780000 o 780_000 existe en el archivo base
    const fs = await import('fs');
    const path = await import('path');
    const queriesFile = fs.readFileSync(path.resolve('./src/lib/queries_v2.ts'), 'utf8');
    
    // Verificamos si META_SUR fue actualizada a 780_000
    if (queriesFile.includes('semana: 780_000') || queriesFile.includes('780000')) {
      console.log('[32m[PASS][0m Se detect la meta de $780.000 para Brigada Pesada en el cdigo.');
    } else {
      console.log('[33m[WARN][0m An no se ha aplicado el cambio de meta a $780.000 en el cdigo (Esperando confirmacin).');
    }
  } catch (e) {
    console.error('[31m[FAIL][0m Error en validador SUR:', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
