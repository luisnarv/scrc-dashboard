import { Pool } from 'pg';

let connStr = process.env.POSTGRES_URL || '';
if (connStr.includes('1q?YLKduq3r5')) {
  connStr = connStr.replace('1q?YLKduq3r5', '1q%3FYLKduq3r5');
}
if (connStr.endsWith('?')) {
  connStr = connStr.slice(0, -1);
}

const pool = new Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false }, // Supabase / RDS requiere SSL incluso en desarrollo
  // El default de pg (max=10) se queda corto: varios endpoints disparan 9-10 queries en paralelo
  // por request (Promise.all), y con más de una pestaña/usuario a la vez el pool se satura y todo
  // el sitio se pone lento (verificado: la RDS admite hasta 838 conexiones, iban solo 61 activas).
  max: 30,
  idleTimeoutMillis: 30000,
  // Algunas consultas (ej. el cruce con v_ordenes_mes) legítimamente tardan 40-80s -- con el pool
  // lleno, esperar una conexión libre puede tomar más que eso. 10s cortaba de más; 60s da margen.
  connectionTimeoutMillis: 60000,
});

// Helper for queries
export const query = (text: string, params?: unknown[]) => {
  return pool.query(text, params);
};
