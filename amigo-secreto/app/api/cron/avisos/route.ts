import { pool } from "@/lib/db";
import { Resend } from "resend";

export const dynamic = "force-dynamic";
const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("no", { status: 401 });
  }

  const { rows } = await pool.query(`select * from avisos_por_enviar limit 50`);
  let enviados = 0;

  for (const a of rows) {
    try {
      // el cuerpo se arma AL ENVIAR, con el estado actual de la lista
      const d = await pool.query(
        `select texto from deseo where participacion_id = $1 order by orden`, [a.sobre_id]);
      const n = await pool.query(
        `select nota_lista from participacion where id = $1`, [a.sobre_id]);

      const items = d.rows.map((x: any) => `<li>${escapar(x.texto)}</li>`).join("");
      const asunto =
        a.tipo === "asignacion"
          ? `Ya tenés tu amigo secreto`
          : `${a.sobre_quien} puso lo que le gustaría`;

      const html =
        a.tipo === "asignacion"
          ? `<p>Hola ${escapar(a.para_nombre)}, te tocó regalarle a <b>${escapar(a.sobre_quien)}</b>.</p>`
          : `<p>Hola ${escapar(a.para_nombre)}. Esto es lo que ${escapar(a.sobre_quien)} tiene en su lista:</p>
             <ul>${items || "<li>(todavía nada)</li>"}</ul>
             ${n.rows[0]?.nota_lista ? `<p>${escapar(n.rows[0].nota_lista)}</p>` : ""}`;

      await resend.emails.send({
        from: process.env.CORREO_DESDE!,
        to: a.para,
        subject: asunto,
        html: html + `<p style="color:#777;font-size:12px">${escapar(a.edicion)}</p>`,
      });

      await pool.query(`update notificacion set enviada_en = now() where id = $1`, [a.id]);
      enviados++;
    } catch (e: any) {
      await pool.query(
        `update notificacion set intentos = intentos + 1, error = $2 where id = $1`,
        [a.id, String(e.message).slice(0, 500)],
      );
    }
  }
  return Response.json({ pendientes: rows.length, enviados });
}

const escapar = (s: string) =>
  String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
