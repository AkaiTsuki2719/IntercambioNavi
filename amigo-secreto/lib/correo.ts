/**
 * Envío de correo, con dos proveedores detrás de la misma función.
 *
 * BREVO: no exige dominio propio. Cuando el dominio no está autenticado,
 * Brevo reemplaza el remitente por uno suyo (@brevosend.com) para que
 * Gmail y Yahoo lo acepten. Funciona hoy, sin comprar nada, pero el
 * destinatario ve un remitente que no es vos.
 *
 * RESEND: exige dominio verificado. Mejor a largo plazo.
 *
 * Se cambia de uno a otro con la variable PROVEEDOR_CORREO, sin tocar
 * el resto del código.
 */

export type Correo = { para: string; asunto: string; html: string };

/** "Amigo secreto <navidad@algo.com>" -> { nombre, email } */
function remitente() {
  const raw = process.env.CORREO_DESDE || "Amigo secreto <no-reply@brevosend.com>";
  const m = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m
    ? { nombre: m[1] || "Amigo secreto", email: m[2] }
    : { nombre: "Amigo secreto", email: raw.trim() };
}

export class ErrorCorreo extends Error {}

export async function enviar({ para, asunto, html }: Correo): Promise<void> {
  const cual = (process.env.PROVEEDOR_CORREO || "brevo").toLowerCase();
  return cual === "resend" ? porResend({ para, asunto, html })
                           : porBrevo({ para, asunto, html });
}

/* ------------------------------------------------------------------ */
/*  Brevo                                                              */
/* ------------------------------------------------------------------ */
async function porBrevo({ para, asunto, html }: Correo) {
  const clave = process.env.BREVO_API_KEY;
  if (!clave) throw new ErrorCorreo("falta BREVO_API_KEY");
  const de = remitente();

  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": clave,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: de.nombre, email: de.email },
      to: [{ email: para }],
      subject: asunto,
      htmlContent: `<!doctype html><html lang="es"><body>${html}</body></html>`,
    }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new ErrorCorreo(`brevo ${r.status}: ${t.slice(0, 300)}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Resend                                                             */
/* ------------------------------------------------------------------ */
async function porResend({ para, asunto, html }: Correo) {
  const clave = process.env.RESEND_API_KEY;
  if (!clave) throw new ErrorCorreo("falta RESEND_API_KEY");

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.CORREO_DESDE,
      to: [para],
      subject: asunto,
      html: `<!doctype html><html lang="es"><body>${html}</body></html>`,
    }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new ErrorCorreo(`resend ${r.status}: ${t.slice(0, 300)}`);
  }
}

export const escapar = (s: string) =>
  String(s).replace(/[<>&"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));