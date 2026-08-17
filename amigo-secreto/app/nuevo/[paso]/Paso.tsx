"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";
import { useBorrador, participantes } from "@/lib/borrador";

type Sesion = { id: string; email: string; nombre: string | null } | null;
const PASOS = 6;

export default function Paso({ n, sesion }: { n: number; sesion: Sesion }) {
  const router = useRouter();
  const { b, set, listo, limpiar } = useBorrador();
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [digitos, setDigitos] = useState(["", "", "", "", ""]);
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [verExclusiones, setVerExclusiones] = useState(false);

  const todas = participantes(b);
  const ir = (destino: number) => router.push(`/nuevo/${destino}`);

  if (!listo) return <main className="pantalla" />;

  const puedeSeguir =
    n === 1 ? b.miNombre.trim().length > 0 :
    n === 2 ? b.titulo.trim().length > 0 :
    n === 3 ? todas.length >= 3 :
    true;

  /* ---------- crear ---------- */
  async function crear() {
    setOcupado(true); setError(null);
    try {
      const r = await fetch("/api/edicion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grupo: b.grupoNombre.trim() || b.titulo.trim(),
          nombre: b.titulo.trim(),
          fecha: b.fecha || null,
          tope: b.tope.replace(/\D/g, "") || null,
          moneda: "CRC", memoria: 2, cadencia: "diaria",
          personas: todas,
          exclusiones: b.vetos.map(([x, y]) => [todas[x], todas[y]]),
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error === "sin_sesion" ? "Se venció la sesión." : d.error);
        return;
      }
      set({ resultado: d });
      ir(6);
    } catch { setError("Falló la conexión."); }
    finally { setOcupado(false); }
  }

  async function pedirCodigo() {
    setOcupado(true); setError(null);
    try {
      const r = await fetch("/api/acceso", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "pedir", email: b.email.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setError("No se pudo enviar el código: " + d.error); return; }
      setCodigoEnviado(true);
    } catch { setError("Falló la conexión."); }
    finally { setOcupado(false); }
  }

  async function verificar() {
    setOcupado(true); setError(null);
    try {
      const r = await fetch("/api/acceso", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "verificar", email: b.email.trim(),
          codigo: digitos.join(""), nombre: b.miNombre.trim(),
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(
          d.error === "codigo_incorrecto" ? "Ese código no es." :
          d.error === "vencido" ? "El código venció. Pedí otro." :
          d.error === "demasiados_intentos" ? "Demasiados intentos. Pedí uno nuevo." :
          d.error);
        return;
      }
      await crear();
    } catch { setError("Falló la conexión."); }
    finally { setOcupado(false); }
  }

  /* ================================================================ */
  return (
    <main className="pantalla">
      {n < 6 && (
        <div className="barra"><div style={{ width: `${(n / PASOS) * 100}%` }} /></div>
      )}

      <div className="tarjeta">
        {/* atrás va ARRIBA, lejos del botón principal */}
        {n > 1 && n < 6 && (
          <Link href={`/nuevo/${n - 1}`} className="atras-top">‹ Atrás</Link>
        )}

        {n === 1 && (
          <>
            <h1>¿Cómo te llamás?</h1>
            <input type="text" autoComplete="given-name" placeholder="Tu nombre"
              value={b.miNombre} onChange={(e) => set({ miNombre: e.target.value })} />
            <label className="check">
              <input type="checkbox" checked={b.participo}
                onChange={(e) => set({ participo: e.target.checked })} />
              <span>Yo también participo en el sorteo</span>
            </label>
          </>
        )}

        {n === 2 && (
          <>
            <h1>¿Qué sorteo es?</h1>
            <label htmlFor="tit">Nombre</label>
            <input id="tit" type="text" placeholder="Navidad 2026"
              value={b.titulo} onChange={(e) => set({ titulo: e.target.value })} />
            <label htmlFor="gr" style={{ marginTop: 16 }}>Grupo (para el histórico)</label>
            <input id="gr" type="text" placeholder="Familia, oficina, amigos…"
              value={b.grupoNombre} onChange={(e) => set({ grupoNombre: e.target.value })} />
            <p className="pista">
              Si repetís el mismo grupo el año que viene, nadie va a volver a sacar
              a quien ya le tocó.
            </p>
            <div className="dos">
              <div>
                <label htmlFor="f">Intercambio</label>
                <input id="f" type="date" value={b.fecha}
                  onChange={(e) => set({ fecha: e.target.value })} />
              </div>
              <div>
                <label htmlFor="t">Tope</label>
                <input id="t" type="text" inputMode="numeric" placeholder="15000"
                  value={b.tope} onChange={(e) => set({ tope: e.target.value })} />
              </div>
            </div>
          </>
        )}

        {n === 3 && (
          <>
            <h1>¿Con quiénes?</h1>
            {b.participo && b.miNombre.trim() && (
              <div className="fijo">{b.miNombre.trim()} <span>vos</span></div>
            )}
            <div className="campos">
              {b.gente.map((nom, i) => (
                <div key={i} className="fila">
                  <input type="text" placeholder={`Nombre ${i + 1}`} value={nom}
                    onChange={(e) => set({
                      gente: b.gente.map((x, j) => (j === i ? e.target.value : x)),
                    })} />
                  <button type="button" className="quitar" aria-label="Quitar"
                    onClick={() => set({ gente: b.gente.filter((_, j) => j !== i) })}>×</button>
                </div>
              ))}
            </div>
            <button type="button" className="mas-ancho"
              onClick={() => set({ gente: [...b.gente, ""] })}>
              + Agregar otro
            </button>
            <p className="pista">{todas.length} en total. Hacen falta al menos 3.</p>
          </>
        )}

        {n === 4 && (
          <>
            <h1>¿Alguien no se puede tocar?</h1>
            <p className="pista" style={{ marginTop: 0 }}>
              Parejas, hermanos, quien ya sepa el regalo del otro. La mayoría no
              necesita esto.
            </p>
            {verExclusiones && (
              <>
                <ParExcluir todas={todas} onAdd={(x, y) => set({
                  vetos: b.vetos.some(([p, q]) => (p === x && q === y) || (p === y && q === x))
                    ? b.vetos : [...b.vetos, [x, y]],
                })} />
                {b.vetos.length > 0 && (
                  <ul className="pares">
                    {b.vetos.map(([x, y], k) => (
                      <li key={k}>
                        <span>{todas[x]} ⇄ {todas[y]}</span>
                        <button type="button"
                          onClick={() => set({ vetos: b.vetos.filter((_, j) => j !== k) })}>×</button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {!verExclusiones && (
              <button type="button" className="secundario"
                onClick={() => setVerExclusiones(true)}>
                Quiero poner exclusiones
              </button>
            )}
          </>
        )}

        {n === 5 && (
          <>
            {sesion ? (
              <>
                <h1>Todo listo</h1>
                <p className="pista" style={{ marginTop: 0 }}>
                  {todas.length} personas · {b.titulo || "sin nombre"}
                  {b.vetos.length ? ` · ${b.vetos.length} exclusiones` : ""}
                </p>
              </>
            ) : !codigoEnviado ? (
              <>
                <h1>¿Cuál es tu correo?</h1>
                <p className="pista" style={{ marginTop: 0 }}>
                  Te mandamos un código para crear <b>{b.titulo || "el sorteo"}</b>. Sin
                  contraseñas: el correo es tu llave para volver.
                </p>
                <input type="email" inputMode="email" autoComplete="email"
                  placeholder="vos@ejemplo.com" value={b.email}
                  onChange={(e) => set({ email: e.target.value })} />
              </>
            ) : (
              <>
                <h1>Tu código</h1>
                <p className="pista" style={{ marginTop: 0 }}>
                  Lo mandamos a <b>{b.email}</b>. Vence en 15 minutos.
                </p>
                <Digitos valor={digitos} onChange={setDigitos} />
                <button type="button" className="enlace" onClick={pedirCodigo}
                  disabled={ocupado}>Reenviar código</button>
              </>
            )}
          </>
        )}

        {n === 6 && b.resultado && (
          <Repartir r={b.resultado} titulo={b.titulo} alTerminar={limpiar} />
        )}
        {n === 6 && !b.resultado && (
          <>
            <h1>No hay nada aquí</h1>
            <p className="pista">Ese sorteo ya se cerró o se perdió el borrador.</p>
            <Link className="principal" href="/"
              style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
              Volver al inicio
            </Link>
          </>
        )}

        {error && <p className="error">{error}</p>}

        {/* un solo botón, ancho completo, sin nada al lado */}
        {n < 5 && (
          <button type="button" className="principal" disabled={!puedeSeguir}
            onClick={() => ir(n + 1)}>Seguir</button>
        )}
        {n === 5 && sesion && (
          <button type="button" className="principal" onClick={crear} disabled={ocupado}>
            {ocupado ? "Sorteando…" : "Sortear y abrir"}
          </button>
        )}
        {n === 5 && !sesion && !codigoEnviado && (
          <button type="button" className="principal" onClick={pedirCodigo}
            disabled={ocupado || !b.email.includes("@")}>
            {ocupado ? "Enviando…" : "Mandame el código"}
          </button>
        )}
        {n === 5 && !sesion && codigoEnviado && (
          <button type="button" className="principal" onClick={verificar}
            disabled={ocupado || digitos.join("").length < 5}>
            {ocupado ? "Verificando…" : "Entrar y sortear"}
          </button>
        )}
      </div>
    </main>
  );
}

/* ---------- pareja a excluir ---------- */
function ParExcluir({ todas, onAdd }: { todas: string[]; onAdd: (a: number, b: number) => void }) {
  const [a, setA] = useState(0);
  const [z, setZ] = useState(1);
  return (
    <>
      <div className="dos">
        <select value={a} onChange={(e) => setA(+e.target.value)}>
          {todas.map((nom, i) => <option key={i} value={i}>{nom}</option>)}
        </select>
        <select value={z} onChange={(e) => setZ(+e.target.value)}>
          {todas.map((nom, i) => <option key={i} value={i}>{nom}</option>)}
        </select>
      </div>
      <button type="button" className="mas-ancho" disabled={a === z}
        onClick={() => onAdd(a, z)}>Excluir esta pareja</button>
    </>
  );
}

/* ---------- cinco casillas ---------- */
function Digitos({ valor, onChange }: { valor: string[]; onChange: (v: string[]) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  return (
    <div className="digitos">
      {valor.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }}
          inputMode="numeric" maxLength={1} value={d} autoFocus={i === 0}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(-1);
            onChange(valor.map((x, j) => (j === i ? v : x)));
            if (v && i < 4) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !valor[i] && i > 0) refs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 5);
            if (t.length) { e.preventDefault(); onChange(t.padEnd(5, " ").split("").slice(0, 5)); }
          }} />
      ))}
    </div>
  );
}

/* ---------- repartir ---------- */
function Repartir(
  { r, titulo, alTerminar }:
  { r: { codigo: string; concesiones: any[] }; titulo: string; alTerminar: () => void },
) {
  const [copiado, setCopiado] = useState(false);
  const url = typeof window !== "undefined" ? `${location.origin}/e/${r.codigo}` : "";
  const texto = `🎄 ${titulo || "Amigo secreto"}\n\nEntrá acá, escogé tu nombre y sacá tu carta:\n${url}`;

  return (
    <>
      <h1>Listo</h1>
      {r.concesiones.length === 0 ? (
        <p className="pista" style={{ marginTop: 0 }}>
          Sorteo hecho, sin repetir a nadie de años anteriores.
        </p>
      ) : (
        <div className="cedio">
          Hubo {r.concesiones.length} {r.concesiones.length === 1 ? "repetición" : "repeticiones"} que
          no se pudo evitar:
          <ul>{r.concesiones.map((c, i) => (
            <li key={i}>{c.dador} → {c.receptor}</li>
          ))}</ul>
        </div>
      )}

      <p className="pista">Un solo link para todos. Cada quien escoge su nombre al entrar.</p>
      <div className="link">{url}</div>

      <a className="principal wa" href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
        target="_blank" rel="noopener noreferrer">Mandar por WhatsApp</a>
      <button type="button" className="secundario" onClick={() => {
        navigator.clipboard?.writeText(url); setCopiado(true);
      }}>{copiado ? "Link copiado" : "Copiar el link"}</button>
      <Link className="enlace" href={`/e/${r.codigo}`} onClick={alTerminar}>Ir al sorteo</Link>
    </>
  );
}