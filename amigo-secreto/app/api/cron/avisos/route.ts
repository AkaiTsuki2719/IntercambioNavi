import { pool } from "@/lib/db";
import { enviar, escapar } from "@/lib/correo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("no", { status: 401 });
  }

  const { rows } = await pool.query(`select * from avisos_por_enviar limit 50`);
  let enviados = 0, fallados = 0;

  for (const a of rows) {
    try {
      // el cuerpo se arma AL ENVIAR, con el estado actual de la lista
      const d = await pool.query(
        `select texto from deseo where participacion_id = $1 order by orden`, [a.sobre_id]);
      const n = await pool.query(
        `select nota_lista from participacion where id = $1`, [a.sobre_id]);

      const asunto = a.tipo === "asignacion"
        ? "Ya tenés tu amigo secreto"
        : `${a.sobre_quien} puso lo que le gustaría`;

      const items = d.rows.map((x: any) => `<li>${escapar(x.texto)}</li>`).join("");
      const nota = n.rows[0]?.nota_lista;

      const html = a.tipo === "asignacion"
        ? `<p>Hola ${escapar(a.para_nombre)}, te tocó regalarle a
             <b>${escapar(a.sobre_quien)}</b>.</p>`
        : `<p>Hola ${escapar(a.para_nombre)}. Esto es lo que
             ${escapar(a.sobre_quien)} tiene en su lista:</p>
           <ul>${items || "<li>(todavía nada)</li>"}</ul>
           ${nota ? `<p>${escapar(nota)}</p>` : ""}`;

      await enviar({
        para: a.para,
        asunto,
        html: html +
          `<p style="color:#777;font-size:12px">${escapar(a.edicion)}</p>`,
      });

      await pool.query(`update notificacion set enviada_en = now() where id = $1`, [a.id]);
      enviados++;
    } catch (e: any) {
      // Se reprograma con espera creciente en vez de morir en el intento.
      // A los 5 intentos la vista deja de traerlo y queda para revisar.
      await pool.query(
        `update notificacion
            set intentos = intentos + 1,
                error = $2,
                programada_para = now() + (power(3, intentos) || ' minutes')::interval
          where id = $1`,
        [a.id, String(e.message).slice(0, 500)],
      );
      fallados++;
    }
  }

  return Response.json({ pendientes: rows.length, enviados, fallados });
}