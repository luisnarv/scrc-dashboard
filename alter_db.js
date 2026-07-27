const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

async function run() {
  try {
    await pool.query(`
      ALTER TABLE dbanalitica.ordenes
      ADD COLUMN IF NOT EXISTS latitud FLOAT,
      ADD COLUMN IF NOT EXISTS longitud FLOAT,
      ADD COLUMN IF NOT EXISTS municipio TEXT,
      ADD COLUMN IF NOT EXISTS barrio TEXT;
    `);
    console.log('Columnas agregadas exitosamente.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    pool.end();
  }
}
run();
