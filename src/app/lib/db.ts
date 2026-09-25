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
  ssl: { rejectUnauthorized: false },
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 60000,
});

// Helper for queries
export const query = (text: string, params?: unknown[]) => {
  return pool.query(text, params);
};
