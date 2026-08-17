import { pool } from "@/lib/db";
import { notFound } from "next/navigation";
import Participante from "./Participante";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const r = await pool.query(
    `select e.nombre, g.nombre as grupo from edicion e
       join grupo g on g.id = e.grupo_id where e.codigo_union = $1`, [codigo]);
  if (r.rowCount === 0) return { title: "Amigo secreto" };
  return { title: `${r.rows[0].nombre} · ${r.rows[0].grupo}` };
}

export default async function Page({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;

  const ed = await pool.query(
    `select e.id, e.nombre, e.fecha_intercambio, e.tope_monto, e.moneda, e.estado,
            g.nombre as grupo
       from edicion e join grupo g on g.id = e.grupo_id
      where e.codigo_union = $1`,
    [codigo],
  );
  if (ed.rowCount === 0) notFound();

  const roster = await pool.query(
    `select p.id, per.nombre_completo as nombre,
            p.email is not null as tiene_correo,
            p.escogido_en is not null as escogio
       from participacion p
       join persona per on per.id = p.persona_id
      where p.edicion_id = $1 and p.revocado_en is null
      order by per.nombre_completo`,
    [ed.rows[0].id],
  );

  const e = ed.rows[0];
  return (
    <Participante
      codigo={codigo}
      edicion={{
        nombre: e.nombre,
        grupo: e.grupo,
        estado: e.estado,
        // la fecha se serializa acá: un Date no cruza al cliente
        fecha: e.fecha_intercambio ? new Date(e.fecha_intercambio).toISOString() : null,
        tope: e.tope_monto ? Number(e.tope_monto) : null,
        moneda: e.moneda,
      }}
      roster={roster.rows}
    />
  );
}