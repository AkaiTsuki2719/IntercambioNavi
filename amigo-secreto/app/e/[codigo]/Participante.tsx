"use client";

import { useEffect, useRef, useState } from "react";
import { Figura, FIGURAS } from "./Figuras";

type Persona = { id: string; nombre: string; tiene_correo: boolean; escogio: boolean };
type Edicion = {
  nombre: string; grupo: string; estado: string;
  fecha: string | null; tope: number | null; moneda: string;
};
type Pantalla = "quien" | "correo" | "volver" | "cartas" | "micarta" | "deseos";

const N_CARTAS = 7;

const fmtFecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-CR",
    { day: "numeric", month: "long", timeZone: "UTC" }) : "";
const fmtTope = (t: number | null, m: string) =>
  t ? (m === "CRC" ? "₡" : "$") + t.toLocaleString("es-CR") : "";

export default function Participante(
  { codigo, edicion, roster: rosterInicial }:
  { codigo: string; edicion: Edicion; roster: Persona[] },
) {
  const [roster, setRoster] = useState(rosterInicial);
  const [pantalla, setPantalla] = useState<Pantalla>("quien");
  const [yo, setYo] = useState<Persona | null>(null);
  const [receptor, setReceptor] = useState<string | null>(null);
  const [correo, setCorreo] = useState("");
  const [llave, setLlave] = useState("");
  const [errorLlave, setErrorLlave] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const corto = yo?.nombre.split(" ")[0] ?? "";
  const detalle = (
    <>
      {edicion.fecha && <>Se abren el <b>{fmtFecha(edicion.fecha)}</b></>}
      {edicion.tope ? <> · Tope <b>{fmtTope(edicion.tope, edicion.moneda)}</b></> : null}
    </>
  );

  const ir = (p: Pantalla) => { setPantalla(p); window.scrollTo({ top: 0 }); };

  function elegirNombre(p: Persona) {
    setYo(p); setErrorLlave(false); setLlave(""); setAviso(null);
    ir(p.escogio ? "volver" : "correo");
  }

  /* ---------- reclamar ---------- */
  async function reclamar(email: string) {
    if (!yo) return;
    setCargando(true); setAviso(null);
    try {
      const r = await fetch("/api/reclamar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, participacionId: yo.id, email: email || null }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.error === "nombre_ya_tomado") {
          setAviso("Alguien acabó de tomar ese nombre.");
          setRoster((rs) => rs.map((x) => x.id === yo.id ? { ...x, escogio: true } : x));
          ir("quien");
        } else {
          setAviso("No se pudo entrar: " + d.error);
        }
        return;
      }
      setReceptor(d.receptor);
      setRoster((rs) => rs.map((x) => x.id === yo.id ? { ...x, escogio: true } : x));
      ir("cartas");
    } catch {
      setAviso("Falló la conexión. Intentá de nuevo.");
    } finally { setCargando(false); }
  }

  /* ---------- volver a ver la carta ---------- */
  async function traerCarta(email: string) {
    if (!yo) return;
    setCargando(true);
    try {
      const q = `/api/carta?p=${encodeURIComponent(yo.id)}` +
        (email ? `&correo=${encodeURIComponent(email)}` : "");
      const r = await fetch(q);
      if (!r.ok) { setErrorLlave(true); return; }
      const d = await r.json();
      setReceptor(d.receptor);
      ir("micarta");
    } catch { setErrorLlave(true); }
    finally { setCargando(false); }
  }

  /* ================= pantallas ================= */

  if (edicion.estado !== "abierta") {
    return (
      <main className="pantalla">
        <p className="grupo">{edicion.grupo}</p>
        <h1>{edicion.nombre}</h1>
        <p className="lede">Este sorteo no está abierto todavía. Preguntale a quien organiza.</p>
      </main>
    );
  }

  if (pantalla === "quien") return (
    <main className="pantalla">
      <p className="grupo">{edicion.grupo}{edicion.fecha ? ` · ${fmtFecha(edicion.fecha)}` : ""}</p>
      <h1>¿Quién sos?</h1>
      <p className="lede">Tocá tu nombre para entrar al sorteo.</p>
      {aviso && <p className="error">{aviso}</p>}
      <ul className="nombres">
        {roster.map((p) => (
          <li key={p.id}>
            <button type="button" className={p.escogio ? "tomado" : ""}
              onClick={() => elegirNombre(p)}>
              <span>{p.nombre}</span>
              {p.escogio && <span className="marca-tomado">ya escogió</span>}
            </button>
          </li>
        ))}
      </ul>
      <p className="aviso-pie">
        Si tu nombre aparece <b>ya escogido</b> y no fuiste vos, avisale a quien organiza:
        puede soltarlo para que lo tomés.
      </p>
    </main>
  );

  if (pantalla === "correo") return (
    <main className="pantalla">
      <p className="grupo">Paso 2 de 2</p>
      <h1>Bien, {corto}</h1>
      <label htmlFor="correo">Tu correo</label>
      <input id="correo" type="email" inputMode="email" autoComplete="email"
        placeholder="vos@ejemplo.com" enterKeyHint="go"
        value={correo} onChange={(e) => setCorreo(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") reclamar(correo); }} />
      <div className="porque">
        Sirve para dos cosas: te llega tu carta por si perdés esta página, y
        <b> te avisamos cuando la persona que te tocó escriba lo que le gustaría.</b>
      </div>
      {aviso && <p className="error">{aviso}</p>}
      <button className="principal" disabled={cargando}
        onClick={() => {
          if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return;
          reclamar(correo);
        }}>
        {cargando ? "Un momento…" : "Seguir"}
      </button>
      <button className="secundario" disabled={cargando} onClick={() => reclamar("")}>
        Seguir sin correo
      </button>
    </main>
  );

  if (pantalla === "volver") return (
    <main className="pantalla">
      <p className="grupo">Tu carta ya está escogida</p>
      <h1>Hola de nuevo, {corto}</h1>
      {yo?.tiene_correo ? (
        <>
          <p className="lede">Confirmá el correo que dejaste y te la muestro.</p>
          <label htmlFor="llave">Tu correo</label>
          <input id="llave" type="email" inputMode="email" autoComplete="email"
            placeholder="vos@ejemplo.com" enterKeyHint="go"
            value={llave} onChange={(e) => setLlave(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") traerCarta(llave); }} />
          {errorLlave && (
            <p className="error">
              Ese no es el correo que quedó guardado con este nombre. Si alguien más tomó
              tu nombre por error, avisale a quien organiza.
            </p>
          )}
          <button className="principal" disabled={cargando}
            onClick={() => traerCarta(llave)}>
            {cargando ? "Buscando…" : "Ver mi carta"}
          </button>
        </>
      ) : (
        <>
          <p className="lede">
            No dejaste correo la primera vez, así que no puedo confirmar que seas vos.
            Si este nombre no es tuyo, salite de aquí.
          </p>
          <button className="principal" disabled={cargando} onClick={() => traerCarta("")}>
            Sí, soy yo — ver mi carta
          </button>
        </>
      )}
      <button className="secundario" onClick={() => ir("quien")}>Volver a la lista</button>
    </main>
  );

  if (pantalla === "cartas") return (
    <Abanico receptor={receptor ?? ""} detalle={detalle} grupo={edicion.grupo}
      corto={corto} alSeguir={() => ir("deseos")} />
  );

  if (pantalla === "micarta") return (
    <main className="pantalla">
      <p className="grupo">{edicion.grupo}{edicion.fecha ? ` · ${fmtFecha(edicion.fecha)}` : ""}</p>
      <h1>Le regalás a</h1>
      <div className="carta-fija">
        <Figura nombre="cipres" className="sello-fijo" />
        <p className="quien-fijo">{receptor}</p>
      </div>
      <p className="lede" style={{ marginTop: 22 }}>{detalle}</p>
      <button className="principal" onClick={() => ir("deseos")}>
        Escribir o cambiar mi lista
      </button>
    </main>
  );

  return <Deseos participacionId={yo!.id} />;
}

/* ================================================================= */
/*  El abanico                                                        */
/* ================================================================= */
function Abanico(
  { receptor, detalle, grupo, corto, alSeguir }:
  { receptor: string; detalle: React.ReactNode; grupo: string; corto: string; alSeguir: () => void },
) {
  const [elegida, setElegida] = useState<number | null>(null);
  const [abierta, setAbierta] = useState(false);
  const [cierre, setCierre] = useState(false);
  const [medidas, setMedidas] = useState({ ancho: 104, alto: 148, R: 280, vw: 380 });
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [centro, setCentro] = useState<string | null>(null);

  useEffect(() => {
    const vw = Math.min(window.innerWidth, 460);
    const ancho = Math.min(112, vw * 0.275);
    setMedidas({ ancho, alto: ancho * 1.42, R: Math.min(300, vw * 0.82), vw });
  }, []);

  const base = (i: number) => {
    const t = (i - (N_CARTAS - 1) / 2) * 8.5;
    const rad = (t * Math.PI) / 180;
    return {
      t,
      tx: Math.sin(rad) * medidas.R,
      ty: (1 - Math.cos(rad)) * medidas.R,
    };
  };

  function escoger(i: number) {
    if (elegida !== null) return;
    const el = refs.current[i];
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = window.innerWidth / 2 - (r.left + r.width / 2);
    const dy = window.innerHeight * 0.4 - (r.top + r.height / 2);
    const escala = Math.min(2.05, (medidas.vw * 0.64) / medidas.ancho);
    setCentro(`translate(${dx}px, ${dy}px) rotate(0deg) scale(${escala})`);
    setElegida(i);

    setTimeout(() => {
      setAbierta(true);
      if (navigator.vibrate) navigator.vibrate([12, 55, 22]);
      setTimeout(() => { chispas(); setCierre(true); }, 640);
    }, 800);
  }

  const palabra = receptor.split(" ").reduce((a, b) => (a.length > b.length ? a : b)).length;
  const tam = palabra <= 6 ? 1.6 : palabra <= 8 ? 1.32 : palabra <= 11 ? 1.06 : 0.88;

  return (
    <main className="mesa-pantalla">
      <div className={"tope-cartas" + (elegida !== null ? " fuera" : "")}>
        <p className="grupo">{grupo}</p>
        <h1>Escogé una,<br />{corto}</h1>
        <p className="pide">La que se te antoje. Solo una.</p>
      </div>

      <div className="mesa">
        {Array.from({ length: N_CARTAS }, (_, i) => {
          const b = base(i);
          const esta = elegida === i;
          const fuera = elegida !== null && !esta;
          return (
            <div key={i} ref={(el) => { refs.current[i] = el; }}
              className={"carta" + (fuera ? " descartada" : "")}
              style={{
                width: medidas.ancho, height: medidas.alto,
                marginLeft: -medidas.ancho / 2, zIndex: esta ? 40 : 10 + i,
                transform: esta && centro
                  ? centro
                  : `translate(${b.tx.toFixed(1)}px, ${b.ty.toFixed(1)}px) rotate(${b.t.toFixed(1)}deg)`,
              }}
              role="button" tabIndex={0} aria-label={`Carta ${i + 1}`}
              onClick={() => escoger(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); escoger(i); }
              }}>
              <div className="dealer" style={{ animationDelay: `${90 + i * 85}ms` }}>
                <div className={"flip" + (esta && abierta ? " abierta" : "")
                  + (elegida === null ? " flota" : "")}
                  style={{ animationDelay: `${(i * 0.35).toFixed(2)}s` }}>
                  <div className="cara atras">
                    <Figura nombre={FIGURAS[i % FIGURAS.length]} className="fig" />
                  </div>
                  <div className="cara frente">
                    <Figura nombre={FIGURAS[i % FIGURAS.length]} className="marca" />
                    <p className="rot">Le regalás a</p>
                    <p className="quien" style={{ fontSize: `${tam}rem` }}>{receptor}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={"cierre" + (cierre ? " on" : "")}>
        <p className="datos">{detalle}</p>
        <button className="principal" onClick={alSeguir}>Escribir mi lista</button>
      </div>
    </main>
  );
}

function chispas() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const x = window.innerWidth / 2, y = window.innerHeight * 0.4;
  for (let i = 0; i < 20; i++) {
    const s = document.createElement("span");
    s.className = "chispa";
    const a = Math.random() * Math.PI * 2, d = 100 + Math.random() * 170;
    s.style.left = x + "px"; s.style.top = y + "px";
    s.style.setProperty("--dx", `${(Math.cos(a) * d).toFixed(0)}px`);
    s.style.setProperty("--dy", `${(Math.sin(a) * d).toFixed(0)}px`);
    s.style.animationDelay = `${(Math.random() * 0.25).toFixed(2)}s`;
    if (i % 3 === 0) s.style.background = "#F2ECDD";
    if (i % 5 === 0) s.style.background = "#C0533A";
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1500);
  }
}

/* ================================================================= */
/*  Lista de deseos                                                   */
/* ================================================================= */
function Deseos({ participacionId }: { participacionId: string }) {
  const [items, setItems] = useState<string[]>([]);
  const [nota, setNota] = useState("");
  const [texto, setTexto] = useState("");
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/deseos?p=${encodeURIComponent(participacionId)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setItems((d.deseos ?? []).map((x: any) => x.texto));
        setNota(d.nota ?? "");
      })
      .catch(() => {});
  }, [participacionId]);

  function agregar() {
    const v = texto.trim();
    if (!v) return;
    setItems((x) => [...x, v]); setTexto(""); setGuardado(false);
  }

  async function guardar() {
    setGuardando(true); setError(null);
    try {
      const r = await fetch("/api/deseos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p: participacionId, deseos: items, nota: nota.trim() }),
      });
      if (!r.ok) throw new Error();
      setGuardado(true);
    } catch { setError("No se pudo guardar. Intentá de nuevo."); }
    finally { setGuardando(false); }
  }

  return (
    <main className="pantalla">
      <p className="grupo">Tu lista</p>
      <h1>¿Qué te gustaría?</h1>
      <p className="lede">Solo lo ve quien te va a regalar. Vos nunca vas a saber quién es.</p>

      <div className="fila">
        <input type="text" placeholder="Algo que te gustaría" enterKeyHint="done"
          value={texto} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") agregar(); }} />
        <button className="mas" onClick={agregar} aria-label="Agregar">+</button>
      </div>

      {items.length > 0 ? (
        <ul className="deseos">
          {items.map((d, i) => (
            <li key={i}>
              <span>{d}</span>
              <button onClick={() => { setItems((x) => x.filter((_, j) => j !== i)); setGuardado(false); }}
                aria-label={`Quitar ${d}`}>×</button>
            </li>
          ))}
        </ul>
      ) : <p className="vacio">Todavía no has puesto nada.</p>}

      <label htmlFor="nota" style={{ marginTop: 24 }}>Algo más que sirva saber</label>
      <textarea id="nota" rows={3} placeholder="Talla M. No como chocolate."
        value={nota} onChange={(e) => { setNota(e.target.value); setGuardado(false); }} />

      {error && <p className="error">{error}</p>}
      <button className="principal" onClick={guardar} disabled={guardando}>
        {guardando ? "Guardando…" : "Guardar mi lista"}
      </button>
      {guardado && (
        <div className="ok">
          Guardada. Le avisamos a quien te va a regalar, sin decirle nada al resto.
          Podés volver a cambiarla cuando querás.
        </div>
      )}
    </main>
  );
}