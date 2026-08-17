import { pool } from "@/lib/db";

/** GET ?p=  ·  POST { p, deseos: string[], nota } — reemplaza la lista completa.
 *  El trigger de la base encola el aviso; acá no se manda ningún correo. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams.get("p");
  const r = await pool.query(
    `select texto, url from deseo where participacion_id = $1 order by orden`, [p]);
  const n = await pool.query(`select nota_lista from participacion where id = $1`, [p]);
  return Response.json({ deseos: r.rows, nota: n.rows[0]?.nota_lista ?? null });
}

export async function POST(req: Request) {
  const { p, deseos, nota } = await req.json();
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`update participacion set nota_lista = $2 where id = $1`, [p, nota ?? null]);
    await c.query(`delete from deseo where participacion_id = $1`, [p]);
    for (const [i, d] of (deseos ?? []).entries()) {
      await c.query(
        `insert into deseo (participacion_id, texto, orden) values ($1,$2,$3)`,
        [p, typeof d === "string" ? d : d.texto, i],
      );
    }
    await c.query("commit");
    return Response.json({ ok: true });
  } catch (e: any) {
    await c.query("rollback");
    return Response.json({ error: e.message }, { status: 500 });
  } finally {
    c.release();
  }
}
