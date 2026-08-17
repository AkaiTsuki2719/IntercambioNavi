
import { pool as pool } from "@/lib/db";
import { sesion as sesion } from "@/lib/sesion";
import Link from "next/link";
 
export const dynamic = "force-dynamic";
 
export default async function Home() {
  const id = await sesion();
 
  // sin sesión: nada que mostrar de nadie
  if (!id) {
    return (
      <main className="pantalla" style={{ justifyContent: "center" }}>
        <p className="grupo">Amigo secreto</p>
        <h1>Sorteá sin que se repita nadie.</h1>
        <p className="lede">
          Un link para todo el grupo. Cada quien escoge su nombre, saca su carta y
          escribe lo que le gustaría. El año que viene, nadie vuelve a sacar a quien
          ya le tocó.
        </p>
        <Link className="principal" href="/nuevo" style={{ textAlign: "center", textDecoration: "none" }}>
          Armar un sorteo
        </Link>
        <p className="aviso-pie">
          ¿Te invitaron? Abrí el link que te pasaron. Esta página no lleva a tu sorteo.
        </p>
      </main>
    );
  }
 
  // con sesión: SOLO lo tuyo
  const ed = await pool.query(
    `select e.nombre, e.codigo_union, e.fecha_intercambio, e.estado, g.nombre as grupo,
            (select count(*) from participacion p where p.edicion_id = e.id) as gente,
            (select count(*) from participacion p
              where p.edicion_id = e.id and p.escogido_en is not null) as escogieron
       from edicion e join grupo g on g.id = e.grupo_id
      where g.owner_id = $1
      order by e.creado desc`,
    [id],
  );
 
  return (
    <main className="pantalla">
      <p className="grupo">Tus sorteos</p>
      <h1>Hola de nuevo.</h1>
      {ed.rowCount === 0 && <p className="lede">Todavía no has armado ninguno.</p>}
      <ul className="nombres">
        {ed.rows.map((e: any) => (
          <li key={e.codigo_union}>
            <Link href={`/e/${e.codigo_union}`} style={{ textDecoration: "none" }}>
              <span>
                {e.nombre}
                <small>{e.grupo} · {e.escogieron}/{e.gente} ya escogieron</small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link className="principal" href="/nuevo"
        style={{ textAlign: "center", textDecoration: "none" }}>
        Armar otro sorteo
      </Link>
    </main>
  );
}