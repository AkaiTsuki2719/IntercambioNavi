import { tx } from "@/lib/db";

/**
 * POST { participacionId }
 *
 * Suelta un nombre que reclamó quien no era. Borra la asignación y limpia
 * el correo, para que la persona correcta pueda entrar de nuevo.
 *
 * Ojo: el sorteo ya está hecho, así que al volver a reclamar le va a tocar
 * EL MISMO receptor. Eso es a propósito — soltar corrige la identidad, no
 * vuelve a sortear. Si el equivocado ya vio la carta, esa información ya
 * salió, y ningún botón la devuelve.
 */
export async function POST(req: Request) {
  const { participacionId } = await req.json();
  if (!participacionId) return Response.json({ error: "falta id" }, { status: 400 });

  try {
    await tx(async (c) => {
      const p = await c.query(
        `select edicion_id from participacion where id = $1`, [participacionId]);
      if (p.rowCount === 0) throw new Error("no_existe");

      await c.query(
        `update participacion
            set reclamado_en = null, escogido_en = null, abierto_en = null,
                email = null, email_verificado = false, email_origen = null
          where id = $1`,
        [participacionId],
      );

      // avisos encolados y todavía no enviados para esa persona: se descartan
      await c.query(
        `delete from notificacion
          where enviada_en is null
            and (destinatario_id = $1 or sobre_id = $1)`,
        [participacionId],
      );

      await c.query(
        `insert into reclamo (edicion_id, participacion_id, resultado)
         values ($1, $2, 'revocado_por_organizador')`,
        [p.rows[0].edicion_id, participacionId],
      );
    });
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}