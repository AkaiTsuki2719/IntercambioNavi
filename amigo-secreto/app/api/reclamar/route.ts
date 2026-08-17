import { tx } from "@/lib/db";

/**
 * POST { codigo, participacionId, email? } -> { receptor, ... }
 *
 * Sin login. El primer reclamo gana, y eso lo garantiza el
 * `where reclamado_en is null` del update: si dos personas tocan el mismo
 * nombre a la vez, una actualiza la fila y la otra recibe 0 filas.
 */
export async function POST(req: Request) {
  const { codigo, participacionId, email } = await req.json();
  if (!codigo || !participacionId) {
    return Response.json({ error: "faltan datos" }, { status: 400 });
  }

  try {
    const r = await tx(async (c) => {
      const ed = await c.query(
        `select id, estado from edicion where codigo_union = $1 for update`, [codigo]);
      if (ed.rowCount === 0) throw new Error("no_existe");
      if (ed.rows[0].estado !== "abierta") throw new Error("edicion_cerrada");

      const tomado = await c.query(
        `update participacion
            set reclamado_en = now(),
                abierto_en   = coalesce(abierto_en, now()),
                email        = coalesce($3, email),
                email_origen = case when $3 is null then email_origen else 'manual' end
          where id = $1 and edicion_id = $2
            and reclamado_en is null and revocado_en is null
          returning id`,
        [participacionId, ed.rows[0].id, email || null],
      );

      await c.query(
        `insert into reclamo (edicion_id, participacion_id, email_intento, resultado)
         values ($1,$2,$3,$4)`,
        [ed.rows[0].id, participacionId, email || null,
         tomado.rowCount ? "ok" : "nombre_ya_tomado"],
      );

      if (tomado.rowCount === 0) throw new Error("nombre_ya_tomado");

      const a = await c.query(
        `select per.nombre_completo as receptor
           from asignacion a
           join participacion pr on pr.id = a.receptor_id
           join persona per      on per.id = pr.persona_id
          where a.dador_id = $1`,
        [participacionId],
      );
      if (a.rowCount === 0) throw new Error("sin_asignacion");

      await c.query(
        `update participacion set escogido_en = coalesce(escogido_en, now()) where id = $1`,
        [participacionId],
      );

      return { receptor: a.rows[0].receptor };
    });
    return Response.json(r);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 409 });
  }
}