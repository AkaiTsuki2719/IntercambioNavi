
#!/usr/bin/env bash
# ============================================================
#  Arranque del proyecto "amigo secreto".
#  Uso:  bash setup.sh          (crea todo e instala)
#        SKIP_INSTALL=1 bash setup.sh   (solo escribe archivos)
# ============================================================
set -euo pipefail

DIR="${1:-amigo-secreto}"
echo "→ creando $DIR"
mkdir -p "$DIR"/{db,lib,public,app/api/{reclamar,carta,deseos},app/api/cron/avisos,app/e/'[codigo]'}
cd "$DIR"

# ---------------------------------------------------------------- package
cat > package.json <<'EOF'
{
  "name": "amigo-secreto",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "db": "bash db/aplicar.sh",
    "sorteo:test": "node --experimental-strip-types lib/sorteo.test.mts"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "pg": "^8.13.0",
    "resend": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/pg": "^8.11.0",
    "@types/react": "^19.0.0",
    "typescript": "^5.6.0"
  }
}
EOF

cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "es2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "incremental": true,
    "noEmit": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

cat > next.config.mjs <<'EOF'
export default { experimental: { serverActions: { bodySizeLimit: "1mb" } } };
EOF

cat > .gitignore <<'EOF'
node_modules
.next
.env
.env.local
*.log
EOF

cat > .env.example <<'EOF'
# Neon: copiá la cadena "pooled" del dashboard
DATABASE_URL=postgres://usuario:clave@host/db?sslmode=require
# Resend: https://resend.com/api-keys
RESEND_API_KEY=re_xxxxxxxx
CORREO_DESDE="Amigo secreto <avisos@tudominio.com>"
# secreto que protege /api/cron/avisos
CRON_SECRET=cambiame
EOF

cat > vercel.json <<'EOF'
{
  "crons": [
    { "path": "/api/cron/avisos", "schedule": "*/15 * * * *" }
  ]
}
EOF

# ---------------------------------------------------------------- db
cat > db/aplicar.sh <<'EOF'
#!/usr/bin/env bash
# Aplica las migraciones en orden. Requiere psql y DATABASE_URL.
set -euo pipefail
: "${DATABASE_URL:?falta DATABASE_URL}"
for f in db/0*.sql; do
  echo "→ $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
echo "listo"
EOF
chmod +x db/aplicar.sh

echo "-- pegá aquí schema.sql"                      > db/001-schema.sql
echo "-- pegá aquí parche-001-correo-participante.sql" > db/002-correo.sql
echo "-- pegá aquí parche-002-link-generico.sql"    > db/003-link.sql
echo "-- pegá aquí parche-003-deseos-y-avisos.sql"  > db/004-deseos.sql

# ---------------------------------------------------------------- lib
cat > lib/db.ts <<'EOF'
import { Pool, type PoolClient } from "pg";

declare global { var _pool: Pool | undefined; }

export const pool =
  global._pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
if (process.env.NODE_ENV !== "production") global._pool = pool;

/** Corre fn dentro de una transacción. Rollback automático si tira. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
EOF

cat > lib/sorteo.ts <<'EOF'
/**
 * Sorteo completo con degradación por capas.
 * Duras: nadie se saca a sí mismo, nada de recíprocos, exclusiones declaradas.
 * Blandas: no repetir ediciones anteriores, con peso decreciente por antigüedad.
 * Si no hay solución, suelta lo MÍNIMO — nunca falla, nunca apaga la regla entera.
 */
export type Id = string;
export interface Concesion { dador: Id; receptor: Id; hace: number | null; }
export interface Resultado { asignacion: Map<Id, Id>; concesiones: Concesion[]; }

export function sortear(
  personas: Id[],
  exclusiones: Set<string>,      // "a|b" = a no le puede regalar a b
  historial: Map<Id, Id>[],      // de más reciente a más vieja
  memoria: number,
): Resultado {
  const n = personas.length;
  if (n < 3) throw new Error("hacen falta al menos 3 personas");

  const costo = new Map<string, number>();
  const tope = Math.min(memoria, historial.length);
  for (let k = 0; k < tope; k++) {
    const peso = tope - k;
    for (const [d, r] of historial[k]) {
      const c = `${d}|${r}`;
      costo.set(c, (costo.get(c) ?? 0) + peso);
    }
  }

  const duro = (d: Id, r: Id) => d !== r && !exclusiones.has(`${d}|${r}`);

  const mezclar = <T,>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const intentar = (techo: number): Map<Id, Id> | null => {
    const orden = mezclar([...personas]);
    const usado = new Set<Id>();
    const asig = new Map<Id, Id>();

    const paso = (i: number, acum: number): boolean => {
      if (acum > techo) return false;
      if (i === n) return true;
      const d = orden[i];
      const cands = personas
        .filter((r) => !usado.has(r) && duro(d, r) && asig.get(r) !== d)
        .map((r) => ({ r, c: costo.get(`${d}|${r}`) ?? 0 }));
      mezclar(cands).sort((a, b) => a.c - b.c);
      for (const { r, c } of cands) {
        if (acum + c > techo) break;
        usado.add(r); asig.set(d, r);
        if (paso(i + 1, acum + c)) return true;
        usado.delete(r); asig.delete(d);
      }
      return false;
    };
    return paso(0, 0) ? asig : null;
  };

  const max = [...costo.values()].reduce((a, b) => a + b, 0) + 1;
  for (let techo = 0; techo <= max; techo++) {
    const asig = intentar(techo);
    if (!asig) continue;
    const concesiones: Concesion[] = [];
    for (const [d, r] of asig) {
      if ((costo.get(`${d}|${r}`) ?? 0) > 0) {
        let hace: number | null = null;
        for (let k = 0; k < historial.length; k++)
          if (historial[k].get(d) === r) { hace = k + 1; break; }
        concesiones.push({ dador: d, receptor: r, hace });
      }
    }
    return { asignacion: asig, concesiones };
  }
  throw new Error("las restricciones duras son imposibles");
}
EOF

# ---------------------------------------------------------------- rutas
cat > app/api/reclamar/route.ts <<'EOF'
import { tx } from "@/lib/db";

/** POST { codigo, personaId?, email? } -> { participacionId } */
export async function POST(req: Request) {
  const { codigo, personaId, email } = await req.json();
  try {
    const id = await tx(async (c) => {
      const r = await c.query(`select reclamar($1, null, $2) as id`, [codigo, personaId ?? null]);
      const pid = r.rows[0].id;
      if (email) {
        await c.query(
          `update participacion set email = $2, email_origen = 'manual' where id = $1`,
          [pid, email],
        );
      }
      return pid;
    });
    return Response.json({ participacionId: id });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 409 });
  }
}
EOF

cat > app/api/carta/route.ts <<'EOF'
import { pool } from "@/lib/db";

/** GET ?p=<participacionId> -> la carta ya sorteada. Idempotente por diseño. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams.get("p");
  if (!p) return Response.json({ error: "falta p" }, { status: 400 });

  const r = await pool.query(
    `select per.nombre_completo as receptor,
            e.nombre as edicion, e.fecha_intercambio, e.tope_monto, e.moneda
       from asignacion a
       join participacion pr on pr.id = a.receptor_id
       join persona per      on per.id = pr.persona_id
       join edicion e        on e.id = a.edicion_id
      where a.dador_id = $1`,
    [p],
  );
  if (r.rowCount === 0) return Response.json({ error: "sin asignacion" }, { status: 404 });

  // primera vez que la abre
  await pool.query(
    `update participacion set escogido_en = coalesce(escogido_en, now()) where id = $1`,
    [p],
  );
  return Response.json(r.rows[0]);
}
EOF

cat > app/api/deseos/route.ts <<'EOF'
import { pool } from "@/lib/db";

/** GET ?p=  ·  POST { p, deseos: string[], nota } — reemplaza la lista completa.
 *  El trigger de la base encola el aviso; acá no se manda ningún correo. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams.get("p");
  const r = await pool.query(
    `select texto, url from deseo where participacion_id = $1 order by orden`, [p]);
  const n = await pool.query(`select nota_lista from participacion where id = $1`, [p]);
  return Response.json({ deseos: r.rows, nota: n.rows[0]?.nota_lista ?? null });
}

export async function POST(req: Request) {
  const { p, deseos, nota } = await req.json();
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`update participacion set nota_lista = $2 where id = $1`, [p, nota ?? null]);
    await c.query(`delete from deseo where participacion_id = $1`, [p]);
    for (const [i, d] of (deseos ?? []).entries()) {
      await c.query(
        `insert into deseo (participacion_id, texto, orden) values ($1,$2,$3)`,
        [p, typeof d === "string" ? d : d.texto, i],
      );
    }
    await c.query("commit");
    return Response.json({ ok: true });
  } catch (e: any) {
    await c.query("rollback");
    return Response.json({ error: e.message }, { status: 500 });
  } finally {
    c.release();
  }
}
EOF

cat > app/api/cron/avisos/route.ts <<'EOF'
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
EOF

# ---------------------------------------------------------------- app mínima
cat > app/layout.tsx <<'EOF'
export const metadata = { title: "Amigo secreto" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body style={{ margin: 0, background: "#0B2620" }}>{children}</body></html>;
}
EOF

cat > app/page.tsx <<'EOF'
export default function Home() {
  return (
    <main style={{ color: "#F2ECDD", fontFamily: "system-ui", padding: 30 }}>
      <h1>Amigo secreto</h1>
      <p>Los prototipos están en <code>/panel.html</code> y <code>/participante.html</code>.</p>
    </main>
  );
}
EOF

cat > "app/e/[codigo]/page.tsx" <<'EOF'
export default async function Edicion({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  return (
    <main style={{ color: "#F2ECDD", fontFamily: "system-ui", padding: 30 }}>
      <p>Edición <b>{codigo}</b> — acá va el flujo del participante.</p>
    </main>
  );
}
EOF

echo "<!-- copiá aquí panel-organizador.html -->"  > public/panel.html
echo "<!-- copiá aquí flujo-participante.html -->" > public/participante.html

# ---------------------------------------------------------------- prueba del motor
cat > lib/sorteo.test.mts <<'EOF'
/* Prueba del motor con las ediciones reales del grupo.
   node lo corre sin transpilar:  npm run sorteo:test  */
import { sortear } from "./sorteo.ts";

const e2025 = new Map(Object.entries({ Argenis:"Ivannia", Brittany:"Siviany", Damaris:"Thiago",
  Hazel:"Jonathan", Ivannia:"Hazel", Jonathan:"Oscar", Meylin:"Damaris", Oscar:"Argenis",
  Siviany:"Meylin", Thiago:"Brittany" }));
const e2023 = new Map(Object.entries({ Argenis:"Raquel", Brittany:"Ivannia", Damaris:"Siviany",
  Hazel:"Oscar", Ivannia:"Hazel", Jonathan:"Argenis", Meylin:"Thiago", Oscar:"Brittany",
  Siviany:"Meylin", Thiago:"Reychel" }));

const personas = [...e2025.keys()];
const r = sortear(personas, new Set<string>(), [e2025, e2023], 2);

for (const [d, x] of r.asignacion) console.log(`${d.padEnd(10)} -> ${x}`);
console.log("concesiones:", r.concesiones.length || "ninguna");

// ninguna asignacion puede repetir 2025 ni 2023
for (const [d, x] of r.asignacion) {
  if (e2025.get(d) === x || e2023.get(d) === x) throw new Error("repitio: " + d + "->" + x);
  if (r.asignacion.get(x) === d) throw new Error("reciproco: " + d + "<->" + x);
  if (d === x) throw new Error("se saco a si mismo: " + d);
}
console.log("verificado: sin repeticiones, sin reciprocos, sin autoasignacion");
EOF

# ---------------------------------------------------------------- final
if [ "${SKIP_INSTALL:-0}" != "1" ]; then
  echo "→ instalando dependencias"
  npm install
fi

cat <<'FIN'

  listo. lo que sigue:

  1. pegá los 4 .sql en db/001..004
  2. pegá los 2 .html en public/
  3. cp .env.example .env  y llenalo (Neon + Resend)
  4. npm run db        aplica las migraciones
  5. npm run dev       y abrí /panel.html

FIN