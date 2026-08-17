import { pool, tx } from "@/lib/db";
import { sortear } from "@/lib/sorteo";
import { sesion } from "@/lib/sesion";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const codigo = () =>
  Array.from({ length: 8 }, () =>
    "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 32)]).join("");

/* ------------------------------------------------------------------ */
/*  GET ?codigo=xxxx — lo que necesita la pantalla del participante    */
/* ------------------------------------------------------------------ */
export async function GET(req: Request) {
  const c = new URL(req.url).searchParams.get("codigo");
  if (!c) return Response.json({ error: "falta codigo" }, { status: 400 });

  const ed = await pool.query(
    `select e.id, e.nombre, e.fecha_intercambio, e.tope_monto, e.moneda,
            e.estado, g.nombre as grupo
       from edicion e join grupo g on g.id = e.grupo_id
      where e.codigo_union = $1`,
    [c],
  );
  if (ed.rowCount === 0) return Response.json({ error: "no existe" }, { status: 404 });

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

  return Response.json({ edicion: ed.rows[0], roster: roster.rows });
}

/* ------------------------------------------------------------------ */
/*  POST — crea la edición, sortea y graba. Devuelve el link.          */
/* ------------------------------------------------------------------ */
export async function POST(req: Request) {
  const b = await req.json();
  const personas: string[] = b.personas ?? [];
  if (personas.length < 3) {
    return Response.json({ error: "hacen falta al menos 3 personas" }, { status: 400 });
  }

  const ownerId = await sesion();
  if (!ownerId) return Response.json({ error: "sin_sesion" }, { status: 401 });

  try {
    const r = await tx(async (c) => {
      /* --- grupo: del organizador con sesión, no del primero que aparezca --- */
      let g = await c.query(
        `select id from grupo where owner_id = $1 and lower(nombre) = lower($2)`,
        [ownerId, b.grupo],
      );
      if (g.rowCount === 0) {
        g = await c.query(
          `insert into grupo (owner_id, nombre) values ($1,$2) returning id`,
          [ownerId, b.grupo],
        );
      }
      const grupoId = g.rows[0].id;

      /* --- personas: se reusan por nombre canónico, se crean si son nuevas --- */
      const idDe = new Map<string, string>();
      for (const nombre of personas) {
        const partes = nombre.trim().split(/\s+/);
        const ya = await c.query(
          `select id from persona where grupo_id = $1 and nombre_completo = $2`,
          [grupoId, nombre.trim()],
        );
        if (ya.rowCount! > 0) { idDe.set(nombre, ya.rows[0].id); continue; }

        const nueva = await c.query(
          `insert into persona (grupo_id, clave_pila, apellidos, nombre_completo)
           values ($1,$2,$3,$4) returning id`,
          [grupoId, norm(partes[0]), partes.slice(1), nombre.trim()],
        );
        idDe.set(nombre, nueva.rows[0].id);
      }

      /* --- exclusiones declaradas: viven en el grupo, no en la edición --- */
      for (const [a, z] of (b.exclusiones ?? []) as [string, string][]) {
        const ia = idDe.get(a), iz = idDe.get(z);
        if (!ia || !iz) continue;
        await c.query(
          `insert into exclusion (grupo_id, a_id, b_id) values ($1,$2,$3),($1,$3,$2)
           on conflict do nothing`,
          [grupoId, ia, iz],
        );
      }

      /* --- la edición --- */
      const cod = codigo();
      const ed = await c.query(
        `insert into edicion (grupo_id, nombre, fecha_intercambio, tope_monto, moneda,
                              estado, memoria_ediciones, cadencia_avisos, codigo_union)
         values ($1,$2,$3,$4,$5,'abierta',$6,$7,$8) returning id`,
        [grupoId, b.nombre, b.fecha || null, b.tope || null, b.moneda || "CRC",
         b.memoria ?? 2, b.cadencia || "diaria", cod],
      );
      const edicionId = ed.rows[0].id;

      /* --- participaciones --- */
      const partDe = new Map<string, string>();
      for (const nombre of personas) {
        const p = await c.query(
          `insert into participacion (edicion_id, persona_id) values ($1,$2) returning id`,
          [edicionId, idDe.get(nombre)],
        );
        partDe.set(idDe.get(nombre)!, p.rows[0].id);
      }

      /* --- historial: las últimas N ediciones del grupo --- */
      const h = await c.query(
        `select e.id as ed, pd.persona_id as d, pr.persona_id as r
           from edicion e
           join asignacion a      on a.edicion_id = e.id
           join participacion pd  on pd.id = a.dador_id
           join participacion pr  on pr.id = a.receptor_id
          where e.grupo_id = $1 and e.id <> $2
          order by e.creado desc`,
        [grupoId, edicionId],
      );
      const porEdicion: Map<string, Map<string, string>> = new Map();
      for (const row of h.rows) {
        if (!porEdicion.has(row.ed)) porEdicion.set(row.ed, new Map());
        porEdicion.get(row.ed)!.set(row.d, row.r);
      }
      const historial = [...porEdicion.values()];

      /* --- exclusiones del grupo, en ids de persona --- */
      const ex = await c.query(
        `select a_id, b_id from exclusion where grupo_id = $1`, [grupoId]);
      const exclusiones = new Set<string>(
        ex.rows.map((x: any) => `${x.a_id}|${x.b_id}`));

      /* --- el sorteo --- */
      const ids = personas.map((n) => idDe.get(n)!);
      const res = sortear(ids, exclusiones, historial, b.memoria ?? 2);

      for (const [d, r] of res.asignacion) {
        await c.query(
          `insert into asignacion (edicion_id, dador_id, receptor_id) values ($1,$2,$3)`,
          [edicionId, partDe.get(d), partDe.get(r)],
        );
      }

      /* --- las concesiones, con nombres para mostrar --- */
      const nombreDe = new Map([...idDe].map(([n, i]) => [i, n]));
      return {
        codigo: cod,
        edicionId,
        concesiones: res.concesiones.map((x) => ({
          dador: nombreDe.get(x.dador),
          receptor: nombreDe.get(x.receptor),
          hace: x.hace,
        })),
      };
    });

    return Response.json(r);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}