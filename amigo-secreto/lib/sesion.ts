import { createHmac, timingSafeEqual, randomInt, createHash } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "as_sesion";
const DIAS = 60;

function secreto() {
  const s = process.env.SESSION_SECRET || process.env.CRON_SECRET;
  if (!s) throw new Error("falta SESSION_SECRET");
  return s;
}

/* ------------------------------------------------------------------ */
/*  Firma                                                              */
/* ------------------------------------------------------------------ */
const firmar = (dato: string) =>
  createHmac("sha256", secreto()).update(dato).digest("base64url");

function verificar(token: string): string | null {
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const dato = token.slice(0, i), firma = token.slice(i + 1);
  const esperada = firmar(dato);
  // comparación en tiempo constante: no filtra por dónde difieren
  const a = Buffer.from(firma), b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [id, vence] = dato.split("|");
  if (!id || !vence || Number(vence) < Date.now()) return null;
  return id;
}

/* ------------------------------------------------------------------ */
/*  Sesión                                                             */
/* ------------------------------------------------------------------ */
export async function abrirSesion(userId: string) {
  const vence = Date.now() + DIAS * 86400_000;
  const dato = `${userId}|${vence}`;
  const c = await cookies();
  c.set(COOKIE, `${dato}.${firmar(dato)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DIAS * 86400,
  });
}

export async function cerrarSesion() {
  (await cookies()).delete(COOKIE);
}

/** id del organizador con sesión, o null. */
export async function sesion(): Promise<string | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  return t ? verificar(t) : null;
}

/* ------------------------------------------------------------------ */
/*  Códigos de acceso                                                  */
/* ------------------------------------------------------------------ */

/** 5 dígitos, con randomInt criptográfico y no Math.random */
export const nuevoCodigo = () => String(randomInt(10000, 100000));

/** El código se guarda hasheado con el secreto, nunca en claro. */
export const hashCodigo = (codigo: string, email: string) =>
  createHash("sha256")
    .update(`${codigo}:${email.trim().toLowerCase()}:${secreto()}`)
    .digest("hex");