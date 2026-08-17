import { pool } from "@/lib/db";
import { nuevoCodigo, hashCodigo, abrirSesion, sesion, cerrarSesion } from "@/lib/sesion";
import { Resend } from "resend";

const MINUTOS = 15;
const MAX_INTENTOS = 5;

/* ------------------------------------------------------------------ */
/*  GET — ¿hay sesión abierta?                                         */
/* ------------------------------------------------------------------ */
export async function GET() {
  const id = await sesion();
  if (!id) return Response.json({ sesion: null });
  const u = await pool.query(`select id, email, nombre from app_user where id = $1`, [id]);
  return Response.json({ sesion: u.rows[0] ?? null });
}

/* ------------------------------------------------------------------ */
/*  POST — pedir código, o verificarlo, o salir                        */
/* ------------------------------------------------------------------ */
export async function POST(req: Request) {
  const b = await req.json();

  if (b.accion === "salir") {
    await cerrarSesion();
    return Response.json({ ok: true });
  }

  const email = String(b.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: "correo_invalido" }, { status: 400 });
  }

  /* ---------- pedir ---------- */
  if (b.accion === "pedir") {
    const codigo = nuevoCodigo();
    await pool.query(
      `insert into codigo_acceso (email, hash, vence)
       values ($1, $2, now() + ($3 || ' minutes')::interval)`,
      [email, hashCodigo(codigo, email), String(MINUTOS)],
    );

    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.CORREO_DESDE!,
        to: email,
        subject: `${codigo} es tu código`,
        html: `<p>Tu código para entrar es:</p>
               <p style="font-size:30px;letter-spacing:.3em;font-weight:700">${codigo}</p>
               <p>Vence en ${MINUTOS} minutos. Si no lo pediste, ignorá este mensaje.</p>`,
      });
    } catch (e: any) {
      // el código quedó guardado; si el correo falla, se puede reintentar
      return Response.json({ error: "no_se_pudo_enviar", detalle: e.message }, { status: 502 });
    }

    return Response.json({ ok: true, minutos: MINUTOS });
  }

  /* ---------- verificar ---------- */
  if (b.accion === "verificar") {
    const codigo = String(b.codigo || "").trim();

    const r = await pool.query(
      `select id, hash, intentos from codigo_acceso
        where lower(email) = $1 and usado_en is null and vence > now()
        order by creado desc limit 1`,
      [email],
    );
    if (r.rowCount === 0) return Response.json({ error: "vencido" }, { status: 400 });

    const fila = r.rows[0];
    if (fila.intentos >= MAX_INTENTOS) {
      return Response.json({ error: "demasiados_intentos" }, { status: 429 });
    }

    if (fila.hash !== hashCodigo(codigo, email)) {
      await pool.query(
        `update codigo_acceso set intentos = intentos + 1 where id = $1`, [fila.id]);
      return Response.json({ error: "codigo_incorrecto" }, { status: 400 });
    }

    await pool.query(`update codigo_acceso set usado_en = now() where id = $1`, [fila.id]);

    // el usuario se crea la primera vez que entra
    const u = await pool.query(
      `insert into app_user (email, nombre, ultimo_ingreso)
       values ($1, $2, now())
       on conflict (lower(email)) do update
         set ultimo_ingreso = now(),
             nombre = coalesce(app_user.nombre, excluded.nombre)
       returning id, email, nombre`,
      [email, b.nombre || null],
    );

    await abrirSesion(u.rows[0].id);
    return Response.json({ sesion: u.rows[0] });
  }

  return Response.json({ error: "accion_desconocida" }, { status: 400 });
}