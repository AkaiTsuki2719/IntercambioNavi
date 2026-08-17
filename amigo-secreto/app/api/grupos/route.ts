import { pool } from "@/lib/db";
import { sesion } from "@/lib/sesion";

/**
 * GET — los grupos de QUIEN TIENE LA SESIÓN. De nadie más.
 *
 * Sin este filtro, listar grupos filtraría los nombres de la familia de
 * una persona a cualquiera que abriera la página.
 */
export async function GET() {
  const ownerId = await sesion();
  if (!ownerId) return Response.json({ grupos: [] });

  const g = await pool.query(
    `select g.id, g.nombre,
            (select count(*) from persona p where p.grupo_id = g.id)  as personas,
            (select count(*) from edicion e where e.grupo_id = g.id)  as ediciones
       from grupo g
      where g.owner_id = $1
      order by g.creado desc`,
    [ownerId],
  );

  // nombres de cada grupo, para poder reusarlos al armar un sorteo nuevo
  const ids = g.rows.map((x: any) => x.id);
  const personas = ids.length
    ? await pool.query(
        `select grupo_id, nombre_completo from persona
          where grupo_id = any($1::uuid[]) order by nombre_completo`,
        [ids],
      )
    : { rows: [] as any[] };

  return Response.json({
    grupos: g.rows.map((x: any) => ({
      ...x,
      personas: Number(x.personas),
      ediciones: Number(x.ediciones),
      nombres: personas.rows
        .filter((p: any) => p.grupo_id === x.id)
        .map((p: any) => p.nombre_completo),
    })),
  });
}