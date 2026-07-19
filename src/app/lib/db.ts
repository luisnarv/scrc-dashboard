import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }, // Supabase requiere SSL incluso en desarrollo
});

// Helper for queries
export const query = (text: string, params?: unknown[]) => {
  return pool.query(text, params);
};
