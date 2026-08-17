import { Pool, type PoolClient } from "pg";

declare global { var _pool: Pool | undefined; }

export const pool =
  global._pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
if (process.env.NODE_ENV !== "production") global._pool = pool;

/** Corre fn dentro de una transacción. Rollback automático si tira. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
