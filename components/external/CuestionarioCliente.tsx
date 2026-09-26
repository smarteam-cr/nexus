"use client";

/**
 * components/external/CuestionarioCliente.tsx — el cuestionario previo que contesta el cliente.
 *
 * ── NO SE PIERDE NADA ────────────────────────────────────────────────────────
 * Lo escrito se guarda DOS veces: en el navegador (localStorage, al instante, en cada tecla) y en
 * Nexus (unos segundos después de dejar de escribir, y al salir de la página). Así:
 *   · si se corta internet o se cierra la pestaña, el borrador local sobrevive y se sube al volver;
 *   · si sigue otro día desde otra computadora, lo encuentra en Nexus;
 *   · y el CSE ve el avance mientras tanto.
 * Al abrir, gana el borrador local SOLO si tiene cambios que no llegaron a Nexus y es más nuevo
 * que lo guardado allá.
 *
 * ── ENVIAR BLOQUEA ───────────────────────────────────────────────────────────
 * «Enviar» cierra la pestaña. Después, el cliente no edita: escribe qué quiere cambiar y queda en
 * el registro que ve el CSE (que puede reabrírsela).
 *
 * Superficie EXTERNA: siempre clara y con la línea gráfica Smarteam, por eso colores fijos y no
 * los tokens del tema interno.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { avanceDePestana, porcentaje } from "@/lib/cuestionario/avance";
import type { CuestionarioDelCliente, PestanaDelCliente } from "@/lib/cuestionario/externo";
import { PREGUNTAS_DE_ETAPA } from "@/lib/cuestionario/plantilla";
import type { Etapa, Pregunta, Respuesta, Respuestas } from "@/lib/cuestionario/tipos";

const TINTA = "#0f1b3d";
const SUAVE = "#6b7a99";
const BORDE = "#e3e9f5";
const ROYAL = "#0B58D3";
const ACENTO = "#E8481C";

const AUTOGUARDADO_MS = 2500;

interface Borrador {
  respuestas: Respuestas;
  etapas: Etapa[];
  contextoAdicional: string;
  /** Cuándo lo tocó el cliente por última vez (reloj del navegador). */
  editadoAt: string;
  /** Hay cambios que todavía no llegaron a Nexus. */
  pendiente: boolean;
}

type EstadoGuardado = "listo" | "guardando" | "sin-conexion" | "error";

function claveLocal(token: string, key: string) {
  // El token entero no hace falta: el prefijo ya distingue enlaces en este navegador.
  return `nexus:cuestionario:${token.slice(0, 16)}:${key}`;
}

function leerLocal(token: string, key: string): Borrador | null {
  try {
    const raw = window.localStorage.getItem(claveLocal(token, key));
    if (!raw) return null;
    const b = JSON.parse(raw) as Borrador;
    return b && typeof b === "object" && b.respuestas && Array.isArray(b.etapas) ? b : null;
  } catch {
    return null;
  }
}

function escribirLocal(token: string, key: string, b: Borrador) {
  try {
    window.localStorage.setItem(claveLocal(token, key), JSON.stringify(b));
  } catch {
    /* modo privado o almacenamiento lleno: queda el guardado en Nexus */
  }
}

function borradorDe(p: PestanaDelCliente): Borrador {
  return {
    respuestas: p.respuestas,
    etapas: p.etapas,
    contextoAdicional: p.contextoAdicional ?? "",
    editadoAt: p.clienteActualizadoAt ?? new Date(0).toISOString(),
    pendiente: false,
  };
}

function idEtapa() {
  return `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export default function CuestionarioCliente({ token, inicial }: { token: string; inicial: CuestionarioDelCliente }) {
  const [pestanas, setPestanas] = useState(inicial.pestanas);
  const [activa, setActiva] = useState(inicial.pestanas[0]?.key ?? "");
  const [borradores, setBorradores] = useState<Record<string, Borrador>>(() =>
    Object.fromEntries(inicial.pestanas.map((p) => [p.key, borradorDe(p)])),
  );
  const [estado, setEstado] = useState<Record<string, EstadoGuardado>>({});
  const [guardadoAt, setGuardadoAt] = useState<Record<string, string>>({});
  const temporizadores = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const borradoresRef = useRef(borradores);
  useEffect(() => {
    borradoresRef.current = borradores;
  }, [borradores]);

  const sincronizar = useCallback(
    async (key: string, opts: { keepalive?: boolean } = {}) => {
      const b = borradoresRef.current[key];
      if (!b?.pendiente) return true;
      setEstado((s) => ({ ...s, [key]: "guardando" }));
      try {
        const res = await fetch("/api/external/cuestionario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: opts.keepalive,
          body: JSON.stringify({
            token,
            accion: "guardar",
            key,
            guardado: { respuestas: b.respuestas, etapas: b.etapas, contextoAdicional: b.contextoAdicional },
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          setEstado((s) => ({ ...s, [key]: "error" }));
          return false;
        }
        // Solo se marca como sincronizado si no hubo cambios mientras viajaba el guardado.
        setBorradores((prev) => {
          const actual = prev[key];
          if (!actual || actual.editadoAt !== b.editadoAt) return prev;
          const listo = { ...actual, pendiente: false };
          escribirLocal(token, key, listo);
          return { ...prev, [key]: listo };
        });
        setGuardadoAt((s) => ({ ...s, [key]: data.actualizadoAt }));
        setEstado((s) => ({ ...s, [key]: "listo" }));
        return true;
      } catch {
        setEstado((s) => ({ ...s, [key]: "sin-conexion" }));
        return false;
      }
    },
    [token],
  );

  // Al abrir: si este navegador tiene un borrador que no llegó a Nexus y es más nuevo, gana él.
  useEffect(() => {
    const recuperados: Record<string, Borrador> = {};
    for (const p of inicial.pestanas) {
      if (p.enviadaAt || inicial.cerrado) continue;
      const local = leerLocal(token, p.key);
      const servidor = p.clienteActualizadoAt ?? new Date(0).toISOString();
      if (local?.pendiente && local.editadoAt > servidor) recuperados[p.key] = local;
    }
    if (Object.keys(recuperados).length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación de localStorage (no existe en SSR)
      setBorradores((prev) => ({ ...prev, ...recuperados }));
      borradoresRef.current = { ...borradoresRef.current, ...recuperados };
      for (const k of Object.keys(recuperados)) void sincronizar(k);
    }
  }, [inicial, token, sincronizar]);

  // Al salir o esconder la página: último intento de subir lo pendiente.
  useEffect(() => {
    const alSalir = () => {
      for (const k of Object.keys(borradoresRef.current)) {
        if (borradoresRef.current[k]?.pendiente) void sincronizar(k, { keepalive: true });
      }
    };
    const alEsconder = () => {
      if (document.visibilityState === "hidden") alSalir();
    };
    const alVolverLaRed = () => {
      for (const k of Object.keys(borradoresRef.current)) if (borradoresRef.current[k]?.pendiente) void sincronizar(k);
    };
    window.addEventListener("pagehide", alSalir);
    document.addEventListener("visibilitychange", alEsconder);
    window.addEventListener("online", alVolverLaRed);
    return () => {
      window.removeEventListener("pagehide", alSalir);
      document.removeEventListener("visibilitychange", alEsconder);
      window.removeEventListener("online", alVolverLaRed);
    };
  }, [sincronizar]);

  const cambiar = useCallback(
    (key: string, f: (b: Borrador) => Borrador) => {
      setBorradores((prev) => {
        const nuevo = { ...f(prev[key]), editadoAt: new Date().toISOString(), pendiente: true };
        escribirLocal(token, key, nuevo);
        return { ...prev, [key]: nuevo };
      });
      clearTimeout(temporizadores.current[key]);
      temporizadores.current[key] = setTimeout(() => void sincronizar(key), AUTOGUARDADO_MS);
    },
    [token, sincronizar],
  );

  const pestana = pestanas.find((p) => p.key === activa) ?? pestanas[0];
  const nombre = inicial.responsable.nombre.split(" ")[0];

  if (pestanas.length === 0) {
    return (
      <Contenedor>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: TINTA }}>Hola, {nombre}</h1>
        <p style={{ color: SUAVE }}>Todavía no tienes preguntas asignadas. Tu asesor de Smarteam te avisará cuando estén listas.</p>
      </Contenedor>
    );
  }

  return (
    <Contenedor>
      <header style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: ACENTO, margin: 0 }}>
          Cuestionario previo
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: TINTA, margin: "6px 0 8px" }}>Hola, {nombre}</h1>
        <p style={{ color: SUAVE, margin: 0, lineHeight: 1.6, maxWidth: 680 }}>
          {inicial.cerrado
            ? "Este cuestionario ya se cerró. Aquí puedes revisar lo que respondiste. ¡Gracias por tu ayuda!"
            : "Queremos entender cómo trabaja tu equipo antes de las sesiones, para aprovecharlas al máximo. Lo que escribas se guarda solo: puedes cerrar la página y seguir cuando quieras. Cuando termines una sección, envíala."}
        </p>
      </header>

      {pestanas.length > 1 && (
        <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {pestanas.map((p) => {
            const b = borradores[p.key];
            const a = avanceDePestana({ tipo: p.tipo, preguntas: p.preguntas, respuestas: b.respuestas, etapas: b.etapas });
            const sel = p.key === pestana.key;
            return (
              <button
                key={p.key}
                onClick={() => setActiva(p.key)}
                style={{
                  borderRadius: 999,
                  padding: "8px 14px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: `1px solid ${sel ? ROYAL : BORDE}`,
                  background: sel ? ROYAL : "#fff",
                  color: sel ? "#fff" : TINTA,
                }}
              >
                {p.titulo}
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, opacity: 0.8 }}>
                  {p.enviadaAt ? "✓ Enviada" : a.sinEtapas ? "" : `${porcentaje(a)}%`}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      <Pestana
        key={pestana.key}
        token={token}
        p={pestana}
        b={borradores[pestana.key]}
        soloLectura={!!pestana.enviadaAt || inicial.cerrado}
        cerrado={inicial.cerrado}
        estado={estado[pestana.key] ?? "listo"}
        guardadoAt={guardadoAt[pestana.key] ?? pestana.clienteActualizadoAt}
        onCambio={(f) => cambiar(pestana.key, f)}
        onSincronizar={() => sincronizar(pestana.key)}
        onActualizar={(np) => setPestanas((prev) => prev.map((x) => (x.key === np.key ? np : x)))}
      />
    </Contenedor>
  );
}

function Contenedor({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        maxWidth: 860,
        margin: "0 auto",
        padding: "40px 20px 64px",
        fontFamily: "var(--font-jakarta), system-ui, sans-serif",
        color: TINTA,
      }}
    >
      {children}
    </div>
  );
}

const cajaTexto: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${BORDE}`,
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 15,
  lineHeight: 1.5,
  color: TINTA,
  background: "#fff",
  fontFamily: "inherit",
  resize: "vertical",
};

const boton = (primario = false): React.CSSProperties => ({
  borderRadius: 10,
  padding: "9px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  border: primario ? "none" : `1px solid ${BORDE}`,
  background: primario ? ROYAL : "#fff",
  color: primario ? "#fff" : TINTA,
});

function Pestana({
  token,
  p,
  b,
  soloLectura,
  cerrado,
  estado,
  guardadoAt,
  onCambio,
  onSincronizar,
  onActualizar,
}: {
  token: string;
  p: PestanaDelCliente;
  b: Borrador;
  soloLectura: boolean;
  cerrado: boolean;
  estado: EstadoGuardado;
  guardadoAt: string | null;
  onCambio: (f: (b: Borrador) => Borrador) => void;
  onSincronizar: () => Promise<boolean>;
  onActualizar: (p: PestanaDelCliente) => void;
}) {
  const avance = avanceDePestana({ tipo: p.tipo, preguntas: p.preguntas, respuestas: b.respuestas, etapas: b.etapas });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setRespuesta = (id: string, r: Partial<Respuesta>) =>
    onCambio((x) => ({ ...x, respuestas: { ...x.respuestas, [id]: { ...base(x.respuestas[id]), ...r } } }));

  const enviar = async () => {
    const faltan = avance.total - avance.contestadas;
    const aviso =
      faltan > 0
        ? `Quedan ${faltan} preguntas sin responder. Puedes enviarla igual: las conversamos en las sesiones. ¿Enviar «${p.titulo}»?`
        : `¿Enviar «${p.titulo}»? Después no podrás editarla, pero sí pedirnos cambios.`;
    if (!window.confirm(aviso)) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/external/cuestionario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          accion: "enviar",
          key: p.key,
          guardado: { respuestas: b.respuestas, etapas: b.etapas, contextoAdicional: b.contextoAdicional },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "No pudimos enviarla. Revisa tu conexión e inténtalo de nuevo.");
        return;
      }
      onCambio((x) => ({ ...x, pendiente: false }));
      onActualizar({
        ...p,
        respuestas: b.respuestas,
        etapas: b.etapas,
        contextoAdicional: b.contextoAdicional,
        enviadaAt: data.enviadaAt,
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{p.titulo}</h2>
        {p.descripcion && <p style={{ color: SUAVE, margin: "6px 0 0" }}>{p.descripcion}</p>}
      </div>

      {p.enviadaAt && !cerrado && (
        <div style={{ border: "1px solid #bfe3cc", background: "#eefaf2", borderRadius: 12, padding: "12px 16px", marginBottom: 20, color: "#17603a", fontSize: 14 }}>
          ¡Gracias! Enviaste esta sección. Si quieres cambiar algo, cuéntanos al final de la página.
        </div>
      )}

      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 18 }}>
        {p.preguntas.map((q, i) => (
          <PreguntaCliente
            key={q.id}
            numero={i + 1}
            q={q}
            r={b.respuestas[q.id]}
            soloLectura={soloLectura}
            onCambio={(r) => setRespuesta(q.id, r)}
          />
        ))}
      </ol>

      {p.tipo === "etapas" && (
        <Etapas
          etapas={b.etapas}
          soloLectura={soloLectura}
          onCambio={(etapas) => onCambio((x) => ({ ...x, etapas }))}
        />
      )}

      <div style={{ marginTop: 28 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>¿Algo más que debamos saber?</h3>
        <p style={{ color: SUAVE, fontSize: 14, margin: "0 0 8px" }}>
          Cualquier detalle de cómo trabajan que no entró en las preguntas: excepciones, problemas, ideas.
        </p>
        {soloLectura ? (
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{b.contextoAdicional || <span style={{ color: SUAVE }}>—</span>}</p>
        ) : (
          <textarea
            style={cajaTexto}
            rows={4}
            value={b.contextoAdicional}
            onChange={(e) => onCambio((x) => ({ ...x, contextoAdicional: e.target.value }))}
          />
        )}
      </div>

      <Adjuntos token={token} p={p} soloLectura={soloLectura} onActualizar={onActualizar} />

      {!soloLectura && (
        <footer
          style={{
            position: "sticky",
            bottom: 0,
            marginTop: 32,
            padding: "14px 0",
            background: "rgba(255,255,255,0.96)",
            borderTop: `1px solid ${BORDE}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 13, color: SUAVE }}>
            <EstadoDeGuardado estado={estado} pendiente={b.pendiente} guardadoAt={guardadoAt} onReintentar={onSincronizar} />
            <div>
              {avance.sinEtapas
                ? "Agrega al menos una etapa de tu proceso."
                : `${avance.contestadas} de ${avance.total} preguntas respondidas`}
            </div>
          </div>
          <button style={boton(true)} disabled={enviando} onClick={enviar}>
            {enviando ? "Enviando…" : "Enviar esta sección"}
          </button>
          {error && <p style={{ width: "100%", color: "#b42318", fontSize: 14, margin: 0 }}>{error}</p>}
        </footer>
      )}

      {p.enviadaAt && !cerrado && <PedirCambio token={token} p={p} onActualizar={onActualizar} />}
    </section>
  );
}

function base(r: Respuesta | undefined): Respuesta {
  return r ?? { valor: "", origen: "cliente", actualizadoAt: new Date(0).toISOString() };
}

function EstadoDeGuardado({
  estado,
  pendiente,
  guardadoAt,
  onReintentar,
}: {
  estado: EstadoGuardado;
  pendiente: boolean;
  guardadoAt: string | null;
  onReintentar: () => Promise<boolean>;
}) {
  if (estado === "guardando") return <div>Guardando…</div>;
  if (estado === "sin-conexion") {
    return <div style={{ color: "#8a5a00" }}>Sin conexión: lo guardamos en este navegador y lo subimos al volver.</div>;
  }
  if (estado === "error") {
    return (
      <div style={{ color: "#b42318" }}>
        No pudimos guardarlo en línea (sigue guardado en este navegador).{" "}
        <button style={{ ...boton(), padding: "2px 8px", fontSize: 12 }} onClick={() => void onReintentar()}>
          Reintentar
        </button>
      </div>
    );
  }
  if (pendiente) return <div>Cambios guardados en este navegador…</div>;
  if (!guardadoAt || guardadoAt.startsWith("1970")) return <div>Se guarda automáticamente mientras escribes.</div>;
  return (
    <div>
      Guardado ·{" "}
      {new Date(guardadoAt).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
    </div>
  );
}

function PreguntaCliente({
  numero,
  q,
  r,
  soloLectura,
  onCambio,
}: {
  numero: number;
  q: Pregunta;
  r: Respuesta | undefined;
  soloLectura: boolean;
  onCambio: (r: Partial<Respuesta>) => void;
}) {
  const prellenada = r?.origen === "prellenado" && !!r.valor.trim();
  return (
    <li style={{ border: `1px solid ${BORDE}`, borderRadius: 16, padding: 18, background: "#fff" }}>
      {q.categoria && (
        <div style={{ fontSize: 12, fontWeight: 600, color: SUAVE, textTransform: "uppercase", letterSpacing: 0.4 }}>
          {q.categoria}
        </div>
      )}
      <label style={{ display: "block", fontSize: 16, fontWeight: 600, margin: "4px 0 6px" }}>
        {numero}. {q.texto}
      </label>
      {q.ejemplo && !soloLectura && <p style={{ fontSize: 13, color: SUAVE, margin: "0 0 10px" }}>Por ejemplo: {q.ejemplo}</p>}

      {prellenada && !soloLectura && (
        <div style={{ background: "#f3f7ff", border: "1px solid #d4e2fb", borderRadius: 12, padding: "10px 12px", marginBottom: 10, fontSize: 14 }}>
          <strong>Esto es lo que entendimos.</strong> {r!.confirmada ? "Lo confirmaste. ✓" : "¿Es correcto? Corrígelo si hace falta."}
          {!r!.confirmada && (
            <button style={{ ...boton(), marginLeft: 8, padding: "3px 10px", fontSize: 13 }} onClick={() => onCambio({ confirmada: true })}>
              Sí, es correcto
            </button>
          )}
        </div>
      )}

      {soloLectura ? (
        <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>
          {r?.valor?.trim() || (r?.enSesion ? <em style={{ color: SUAVE }}>Lo vemos en sesión</em> : <span style={{ color: SUAVE }}>—</span>)}
        </p>
      ) : (
        <>
          <textarea
            style={{ ...cajaTexto, opacity: r?.enSesion && !r.valor ? 0.6 : 1 }}
            rows={3}
            value={r?.valor ?? ""}
            onChange={(e) => onCambio({ valor: e.target.value, confirmada: false })}
          />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13, color: SUAVE, cursor: "pointer" }}>
            <input type="checkbox" checked={!!r?.enSesion} onChange={(e) => onCambio({ enSesion: e.target.checked })} />
            Prefiero conversarlo en una sesión
          </label>
        </>
      )}
    </li>
  );
}

function Etapas({
  etapas,
  soloLectura,
  onCambio,
}: {
  etapas: Etapa[];
  soloLectura: boolean;
  onCambio: (e: Etapa[]) => void;
}) {
  const [abierta, setAbierta] = useState<string | null>(etapas[0]?.id ?? null);
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= etapas.length) return;
    const copia = [...etapas];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    onCambio(copia);
  };

  return (
    <div style={{ marginTop: 32 }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>Etapas del proceso</h3>
      <p style={{ color: SUAVE, fontSize: 14, margin: "0 0 14px" }}>
        Agrega una etapa por cada paso, en orden. Para cada una te hacemos las mismas {PREGUNTAS_DE_ETAPA.length} preguntas.
      </p>

      {etapas.length > 0 && <Recorrido etapas={etapas} activa={abierta} onElegir={setAbierta} />}

      <div style={{ display: "grid", gap: 12 }}>
        {etapas.map((e, i) => {
          const abiertaEsta = abierta === e.id;
          const contestadas = PREGUNTAS_DE_ETAPA.filter((q) => (e.respuestas[q.id]?.valor ?? "").trim() || e.respuestas[q.id]?.enSesion).length;
          return (
            <div key={e.id} style={{ border: `1px solid ${abiertaEsta ? ROYAL : BORDE}`, borderRadius: 16, background: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", flexWrap: "wrap" }}>
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: ROYAL,
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                {soloLectura ? (
                  <strong style={{ flex: 1 }}>{e.nombre || "(sin nombre)"}</strong>
                ) : (
                  <input
                    style={{ ...cajaTexto, flex: 1, minWidth: 160, padding: "7px 10px" }}
                    placeholder="Nombre de la etapa (ej.: Calificación)"
                    value={e.nombre}
                    onChange={(ev) => onCambio(etapas.map((x) => (x.id === e.id ? { ...x, nombre: ev.target.value } : x)))}
                  />
                )}
                <span style={{ fontSize: 12, color: SUAVE }}>
                  {contestadas}/{PREGUNTAS_DE_ETAPA.length}
                </span>
                <button style={{ ...boton(), padding: "5px 10px" }} onClick={() => setAbierta(abiertaEsta ? null : e.id)}>
                  {abiertaEsta ? "Cerrar" : soloLectura ? "Ver" : "Completar"}
                </button>
                {!soloLectura && (
                  <>
                    <button style={{ ...boton(), padding: "5px 9px" }} onClick={() => mover(i, -1)} disabled={i === 0} title="Subir">
                      ↑
                    </button>
                    <button style={{ ...boton(), padding: "5px 9px" }} onClick={() => mover(i, 1)} disabled={i === etapas.length - 1} title="Bajar">
                      ↓
                    </button>
                    <button
                      style={{ ...boton(), padding: "5px 10px", color: "#b42318" }}
                      onClick={() => {
                        if (window.confirm(`¿Quitar la etapa ${i + 1}${e.nombre ? ` «${e.nombre}»` : ""}?`)) {
                          onCambio(etapas.filter((x) => x.id !== e.id));
                        }
                      }}
                    >
                      Quitar
                    </button>
                  </>
                )}
              </div>
              {abiertaEsta && (
                <ol style={{ listStyle: "none", margin: 0, padding: "0 14px 14px", display: "grid", gap: 12 }}>
                  {PREGUNTAS_DE_ETAPA.map((q, n) => (
                    <PreguntaCliente
                      key={q.id}
                      numero={n + 1}
                      q={q}
                      r={e.respuestas[q.id]}
                      soloLectura={soloLectura}
                      onCambio={(r) =>
                        onCambio(
                          etapas.map((x) =>
                            x.id === e.id ? { ...x, respuestas: { ...x.respuestas, [q.id]: { ...base(x.respuestas[q.id]), ...r } } } : x,
                          ),
                        )
                      }
                    />
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>

      {!soloLectura && etapas.length < 40 && (
        <button
          style={{ ...boton(), marginTop: 12, borderStyle: "dashed", width: "100%" }}
          onClick={() => {
            const nueva = { id: idEtapa(), nombre: "", respuestas: {} };
            onCambio([...etapas, nueva]);
            setAbierta(nueva.id);
          }}
        >
          + Agregar etapa {etapas.length + 1}
        </button>
      )}
    </div>
  );
}

/**
 * El proceso dibujado mientras se describe: una fila de etapas numeradas con flechas. Es el
 * primer paso del «proceso vivo» — ver el camino completo ayuda a notar la etapa que falta.
 */
function Recorrido({ etapas, activa, onElegir }: { etapas: Etapa[]; activa: string | null; onElegir: (id: string) => void }) {
  return (
    <div style={{ overflowX: "auto", marginBottom: 16, paddingBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: "min-content" }}>
        {etapas.map((e, i) => (
          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => onElegir(e.id)}
              style={{
                border: `1.5px solid ${activa === e.id ? ROYAL : "#c9d6f0"}`,
                background: activa === e.id ? "#eaf1ff" : "#f7f9fe",
                borderRadius: 12,
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 600,
                color: TINTA,
                cursor: "pointer",
                whiteSpace: "nowrap",
                maxWidth: 200,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={e.nombre || `Etapa ${i + 1}`}
            >
              <span style={{ color: ROYAL, marginRight: 6 }}>{i + 1}</span>
              {e.nombre || "Sin nombre"}
            </button>
            {i < etapas.length - 1 && <span style={{ color: "#9fb1d6", fontSize: 16 }}>→</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function tamano(bytes: number | null): string {
  if (!bytes) return "";
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function Adjuntos({
  token,
  p,
  soloLectura,
  onActualizar,
}: {
  token: string;
  p: PestanaDelCliente;
  soloLectura: boolean;
  onActualizar: (p: PestanaDelCliente) => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  if (soloLectura && p.adjuntos.length === 0) return null;

  const subir = async () => {
    if (!archivo || !descripcion.trim()) return;
    setSubiendo(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("token", token);
      form.set("key", p.key);
      form.set("descripcion", descripcion);
      form.set("file", archivo);
      const res = await fetch("/api/external/cuestionario/adjunto", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "No pudimos subir el archivo. Inténtalo de nuevo.");
        return;
      }
      onActualizar({ ...p, adjuntos: [...p.adjuntos, data.adjunto] });
      setArchivo(null);
      setDescripcion("");
      if (input.current) input.current.value = "";
    } finally {
      setSubiendo(false);
    }
  };

  const quitar = async (id: string) => {
    if (!window.confirm("¿Quitar este documento?")) return;
    const res = await fetch("/api/external/cuestionario/adjunto", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, documentoId: id }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      setError(data?.error ?? "No pudimos quitarlo.");
      return;
    }
    onActualizar({ ...p, adjuntos: p.adjuntos.filter((a) => a.id !== id) });
  };

  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Documentos</h3>
      {!soloLectura && (
        <p style={{ color: SUAVE, fontSize: 14, margin: "0 0 10px" }}>
          ¿Tienes algo que nos ayude a entender? Un flujo, un reporte, una plantilla, el Excel que usan hoy. Súbelo y
          cuéntanos qué es.
        </p>
      )}
      {p.adjuntos.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "grid", gap: 8 }}>
          {p.adjuntos.map((a) => (
            <li key={a.id} style={{ border: `1px solid ${BORDE}`, borderRadius: 12, padding: "10px 12px", display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>
                  📎 {a.titulo} <span style={{ fontWeight: 400, color: SUAVE, fontSize: 12 }}>{tamano(a.fileSize)}</span>
                </div>
                <div style={{ fontSize: 13, color: SUAVE }}>{a.descripcion}</div>
              </div>
              {!soloLectura && (
                <button style={{ ...boton(), padding: "4px 10px", fontSize: 13 }} onClick={() => quitar(a.id)}>
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!soloLectura && (
        <div style={{ border: `1px dashed #c9d6f0`, borderRadius: 14, padding: 14, display: "grid", gap: 10 }}>
          <input
            ref={input}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.webp"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
          {archivo && (
            <>
              <input
                style={{ ...cajaTexto, padding: "8px 10px" }}
                placeholder="¿Qué es este documento? (ej.: el Excel donde hoy registramos las ventas)"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
              <div>
                <button style={boton(true)} disabled={subiendo || !descripcion.trim()} onClick={subir}>
                  {subiendo ? "Subiendo…" : "Subir documento"}
                </button>
              </div>
            </>
          )}
          <span style={{ fontSize: 12, color: SUAVE }}>PDF, Word, Excel, PowerPoint, texto o imágenes · hasta 10 MB.</span>
        </div>
      )}
      {error && <p style={{ color: "#b42318", fontSize: 14 }}>{error}</p>}
    </div>
  );
}

function PedirCambio({
  token,
  p,
  onActualizar,
}: {
  token: string;
  p: PestanaDelCliente;
  onActualizar: (p: PestanaDelCliente) => void;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const solicitudes = useMemo(() => p.solicitudes, [p.solicitudes]);

  return (
    <div style={{ marginTop: 32, borderTop: `1px solid ${BORDE}`, paddingTop: 20 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>¿Quieres cambiar algo?</h3>
      <p style={{ color: SUAVE, fontSize: 14, margin: "0 0 10px" }}>
        Cuéntanos qué cambió o qué quieres corregir. Queda registrado y tu asesor lo tiene en cuenta.
      </p>
      {solicitudes.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "grid", gap: 6 }}>
          {solicitudes.map((s, i) => (
            <li key={i} style={{ background: "#f7f9fe", borderRadius: 10, padding: "8px 12px", fontSize: 14 }}>
              <span style={{ color: SUAVE, fontSize: 12 }}>
                {new Date(s.createdAt).toLocaleDateString("es", { day: "numeric", month: "short" })} ·{" "}
              </span>
              {s.mensaje}
            </li>
          ))}
        </ul>
      )}
      <textarea style={cajaTexto} rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej.: en la etapa 2 somos 3 vendedores, no 5." />
      <button
        style={{ ...boton(true), marginTop: 8 }}
        disabled={enviando || !texto.trim()}
        onClick={async () => {
          setEnviando(true);
          setError(null);
          try {
            const res = await fetch("/api/external/cuestionario", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, accion: "pedir_cambio", key: p.key, mensaje: texto }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.ok) {
              setError(data?.error ?? "No pudimos registrarlo. Inténtalo de nuevo.");
              return;
            }
            onActualizar({ ...p, solicitudes: [...p.solicitudes, { mensaje: texto.trim(), createdAt: new Date().toISOString() }] });
            setTexto("");
          } finally {
            setEnviando(false);
          }
        }}
      >
        {enviando ? "Enviando…" : "Enviar el cambio"}
      </button>
      {error && <p style={{ color: "#b42318", fontSize: 14 }}>{error}</p>}
    </div>
  );
}
