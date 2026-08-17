import { pool } from "@/lib/db";

/**
 * GET ?p=<participacionId>&correo=<opcional>
 *
 * Para volver a ver una carta ya escogida. Si esa participación tiene correo
 * guardado, el correo es la llave: sin coincidencia, 403. Si no dejó correo,
 * no hay con qué negarse — y bloquear dejaría a esa persona sin acceso para
 * siempre, que es peor.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const p = u.searchParams.get("p");
  const correo = (u.searchParams.get("correo") || "").trim().toLowerCase();
  if (!p) return Response.json({ error: "falta p" }, { status: 400 });

  const part = await pool.query(
    `select email from participacion where id = $1 and revocado_en is null`, [p]);
  if (part.rowCount === 0) return Response.json({ error: "no_existe" }, { status: 404 });

  const guardado = (part.rows[0].email || "").trim().toLowerCase();
  if (guardado && guardado !== correo) {
    return Response.json({ error: "correo_no_coincide" }, { status: 403 });
  }

  const r = await pool.query(
    `select per.nombre_completo as receptor,
            e.nombre as edicion, e.fecha_intercambio, e.tope_monto, e.moneda
       from asignacion a
       join participacion pr on pr.id = a.receptor_id
       join persona per      on per.id = pr.persona_id
       join edicion e        on e.id = a.edicion_id
      where a.dador_id = $1`,
    [p],
  );
  if (r.rowCount === 0) return Response.json({ error: "sin_asignacion" }, { status: 404 });

  return Response.json(r.rows[0]);
}