
import { pool } from "@/lib/db";
import { sesion } from "@/lib/sesion";
import { notFound } from "next/navigation";
import Paso from "./Paso";
 
export const dynamic = "force-dynamic";
export const metadata = { title: "Nuevo sorteo · Amigo secreto" };
 
export default async function PaginaPaso({ params }: { params: Promise<{ paso: string }> }) {
  const { paso } = await params;
  const n = Number(paso);
  if (!Number.isInteger(n) || n < 1 || n > 6) notFound();
 
  const id = await sesion();
  let s = null;
  if (id) {
    const u = await pool.query(`select id, email, nombre from app_user where id = $1`, [id]);
    s = u.rows[0] ?? null;
  }
  return <Paso n={n} sesion={s} />;
}