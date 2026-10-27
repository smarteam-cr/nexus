"use client";

/**
 * components/external/test/TestDelDiagnostico.tsx — EL TEST PÚBLICO del diagnóstico de rendimiento, del lado del
 * prospecto (área O, 2026-10-26). Página del cliente: tema claro con hex literal (§1-WEB de ARCHITECTURE.md), en tuteo.
 *
 * La experiencia de la app de hoy (O1 etapa 3): el formulario primero, una pregunta por pantalla con su «matiz»
 * opcional, el avance guardado en cada paso (si cierra la pestaña, al volver retoma donde quedó: el token vive en este
 * navegador) y el aviso de que todavía no terminó si intenta irse. Quien responde nunca ve niveles ni nombres de la
 * escala: las opciones son las del banco aprobado, con ids que solo sirven para este intento.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";

const ACENTO = "#E8481C";
const ROYAL = "#0B58D3";
const TINTA = "#0f1b3d";
const TINTA_SUAVE = "#5b6a8a";
const BORDE = "#dfe5f1";
const FONDO_SUAVE = "#f6f8fc";
const NO_LO_SE = "no-se";

interface PreguntaPublica {
  id: string;
  texto: string;
  ayuda: string | null;
  opciones: { id: string; texto: string }[];
}

interface Vista {
  token: string;
  estado: "en_curso" | "terminado" | "abandonado";
  paso: number;
  preguntas: PreguntaPublica[];
  respuestas: Record<string, { opcion: string; matiz?: string }>;
}


const fuente = "var(--font-jakarta), system-ui, sans-serif";
const caja: CSSProperties = { maxWidth: 720, margin: "0 auto", padding: "40px 20px 64px", fontFamily: fuente, color: TINTA };
const etiqueta: CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: TINTA };
const campo: CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 10,
  border: `1px solid ${BORDE}`,
  fontSize: 15,
  color: TINTA,
  background: "#fff",
  fontFamily: fuente,
};
const botonPrincipal = (activo: boolean): CSSProperties => ({
  padding: "12px 22px",
  borderRadius: 10,
  border: "none",
  background: activo ? ACENTO : "#f3b9a8",
  color: "#fff",
  fontWeight: 700,
  fontSize: 15,
  cursor: activo ? "pointer" : "not-allowed",
  fontFamily: fuente,
});
const botonSecundario: CSSProperties = {
  padding: "12px 18px",
  borderRadius: 10,
  border: `1px solid ${BORDE}`,
  background: "#fff",
  color: TINTA,
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer",
  fontFamily: fuente,
};

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export default function TestDelDiagnostico({
  area,
  areaNombre,
  version,
  total,
  industrias,
  conversionGoogleAds = null,
}: {
  area: string;
  areaNombre: string;
  version: "marketing" | "web";
  total: number;
  /** Las industrias de Smarteam (la misma lista de «Datos de la empresa»): la industria elige la edición de la escala. */
  industrias: { valor: string; etiqueta: string }[];
  /** La conversión de Google Ads que se dispara al empezar (O6 etapa 2: como la página vieja). Null = no hay etiqueta. */
  conversionGoogleAds?: string | null;
}) {
  const clave = `nexus:test-diagnostico:${area}:${version}`;
  const [vista, setVista] = useState<Vista | null>(null);
  const [indice, setIndice] = useState(0);
  const [respuestas, setRespuestas] = useState<Vista["respuestas"]>({});
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Retomar donde quedó: el token de este navegador, si el intento sigue sin terminar.
  useEffect(() => {
    let token: string | null = null;
    try {
      token = window.localStorage.getItem(clave);
    } catch {
      token = null;
    }
    if (!token) return;
    let vivo = true;
    fetch(`/api/external/test/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Vista>) : null))
      .then((v) => {
        if (!vivo || !v || v.estado === "terminado") return;
        setVista(v);
        setRespuestas(v.respuestas);
        setIndice(Math.min(v.paso, Math.max(0, v.preguntas.length - 1)));
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [clave]);

  // Contar la visita (O6 etapa 3): una vez por pestaña, para medir cuántos de los que abren el test lo terminan.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(`${clave}:visita`)) return;
      window.sessionStorage.setItem(`${clave}:visita`, "1");
    } catch {
      // Sin almacenamiento (modo privado estricto): se cuenta igual; el servidor no deja que una recarga sume dos.
    }
    void fetch("/api/external/test/visita", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ area, version }),
      keepalive: true,
    }).catch(() => undefined);
  }, [clave, area, version]);

  // El aviso de abandono: con el test empezado y sin terminar, el navegador pregunta antes de irse.
  const enCurso = !!vista && vista.estado !== "terminado";
  useEffect(() => {
    if (!enCurso) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [enCurso]);

  const empezar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const origen: Record<string, string> = {};
    const params = new URLSearchParams(window.location.search);
    for (const [k, v] of params) if (k.startsWith("utm_") || k === "gclid" || k === "fbclid") origen[k] = v.slice(0, 300);
    if (document.referrer) origen.referrer = document.referrer.slice(0, 300);
    const hutk = leerCookie("hubspotutk");
    if (hutk) origen.hutk = hutk.slice(0, 300);
    origen.pagina = window.location.href.split("#")[0].slice(0, 300);
    const cuerpo = {
      area,
      version,
      nombre: String(f.get("nombre") ?? ""),
      email: String(f.get("email") ?? ""),
      telefono: String(f.get("telefono") ?? ""),
      puesto: String(f.get("puesto") ?? ""),
      empresa: String(f.get("empresa") ?? ""),
      dominio: String(f.get("dominio") ?? ""),
      industria: String(f.get("industria") ?? ""),
      sitio: String(f.get("sitio") ?? ""),
      origen,
    };
    setOcupado(true);
    try {
      const r = await fetch("/api/external/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const j = (await r.json().catch(() => null)) as (Vista & { error?: string }) | null;
      if (!r.ok || !j?.token) {
        setError(j?.error ?? "No se pudo empezar el test. Vuelve a intentarlo.");
        return;
      }
      try {
        window.localStorage.setItem(clave, j.token);
      } catch {
        // Sin almacenamiento (navegación privada): el test funciona igual, solo que no se retoma.
      }
      // La conversión de Google Ads: el lead se gana aquí, cuando deja sus datos (igual que la página vieja).
      const gtag = (window as { gtag?: (...a: unknown[]) => void }).gtag;
      if (conversionGoogleAds && typeof gtag === "function") {
        try {
          gtag("event", "conversion", { send_to: conversionGoogleAds });
        } catch {
          // El seguimiento nunca rompe el test.
        }
      }
      setVista(j);
      setRespuestas({});
      setIndice(0);
    } catch {
      setError("No hay conexión. Revisa tu internet y vuelve a intentarlo.");
    } finally {
      setOcupado(false);
    }
  };

  const pregunta = vista?.preguntas[indice] ?? null;
  const elegida = pregunta ? respuestas[pregunta.id]?.opcion : undefined;
  const esLaUltima = !!vista && indice === vista.preguntas.length - 1;

  const elegir = (opcion: string) => {
    if (!pregunta) return;
    setRespuestas((r) => ({ ...r, [pregunta.id]: { ...r[pregunta.id], opcion } }));
  };
  const escribirMatiz = (matiz: string) => {
    if (!pregunta) return;
    setRespuestas((r) => ({ ...r, [pregunta.id]: { opcion: r[pregunta.id]?.opcion ?? "", matiz } }));
  };

  /** Solo las respuestas con una opción elegida (un matiz sin opción no se manda). */
  const paraMandar = useMemo(() => Object.fromEntries(Object.entries(respuestas).filter(([, r]) => r.opcion)), [respuestas]);

  const guardar = useCallback(
    async (paso: number) => {
      if (!vista) return true;
      const r = await fetch(`/api/external/test/${encodeURIComponent(vista.token)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respuestas: paraMandar, paso }),
      }).catch(() => null);
      return !!r?.ok;
    },
    [vista, paraMandar],
  );

  const siguiente = async () => {
    if (!vista || !elegida) return;
    setError(null);
    setOcupado(true);
    try {
      if (!esLaUltima) {
        // Guardar al avanzar: si se corta la conexión, igual se sigue (se guarda en el próximo paso).
        await guardar(indice + 1);
        setIndice((i) => i + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const r = await fetch(`/api/external/test/${encodeURIComponent(vista.token)}/terminar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respuestas: paraMandar }),
      }).catch(() => null);
      const j = (await r?.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!r?.ok || !j?.url) {
        setError(j?.error ?? "No se pudo calcular tu resultado. Vuelve a intentarlo.");
        return;
      }
      try {
        window.localStorage.removeItem(clave);
      } catch {
        // nada
      }
      setVista({ ...vista, estado: "terminado" });
      window.location.assign(j.url);
    } finally {
      setOcupado(false);
    }
  };

  if (!vista) {
    return (
      <div style={caja}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: ACENTO }}>Diagnóstico de Rendimiento</p>
        <h1 style={{ margin: "8px 0 10px", fontSize: 30, lineHeight: 1.2 }}>¿Qué tan bien funciona tu área de {areaNombre}?</h1>
        <p style={{ margin: "0 0 28px", fontSize: 16, color: TINTA_SUAVE, lineHeight: 1.6 }}>
          {total} preguntas sobre cómo funciona hoy tu equipo, unos {Math.max(3, Math.round(total * 0.75))} minutos. Al terminar ves tu resultado: dónde
          está hoy tu área, lo que más la frena y por dónde empezar.
        </p>
        {/* `data-hs-do-not-collect`: con el seguimiento de HubSpot prendido (O6), su «recoger formularios que no son de
            HubSpot» mandaría este formulario por su cuenta, saltándose el job y la decisión de qué correos van. */}
        <form onSubmit={empezar} data-hs-do-not-collect="true" style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <div>
              <label style={etiqueta} htmlFor="t-nombre">Tu nombre</label>
              <input id="t-nombre" name="nombre" required minLength={2} maxLength={120} autoComplete="name" style={campo} />
            </div>
            <div>
              <label style={etiqueta} htmlFor="t-email">Tu correo de trabajo</label>
              <input id="t-email" name="email" type="email" required maxLength={200} autoComplete="email" style={campo} />
            </div>
            <div>
              <label style={etiqueta} htmlFor="t-empresa">Tu empresa</label>
              <input id="t-empresa" name="empresa" maxLength={160} autoComplete="organization" style={campo} />
            </div>
            <div>
              <label style={etiqueta} htmlFor="t-dominio">El sitio web de tu empresa</label>
              <input id="t-dominio" name="dominio" maxLength={160} placeholder="tuempresa.com" style={campo} />
            </div>
            <div>
              <label style={etiqueta} htmlFor="t-puesto">Tu puesto</label>
              <input id="t-puesto" name="puesto" maxLength={120} autoComplete="organization-title" style={campo} />
            </div>
            <div>
              <label style={etiqueta} htmlFor="t-telefono">Tu teléfono (opcional)</label>
              <input id="t-telefono" name="telefono" maxLength={40} autoComplete="tel" style={campo} />
            </div>
            <div>
              <label style={etiqueta} htmlFor="t-industria">Tu industria</label>
              <select id="t-industria" name="industria" defaultValue="" required style={campo}>
                <option value="" disabled>
                  Elige una
                </option>
                {industrias.map((i) => (
                  <option key={i.valor} value={i.valor}>
                    {i.etiqueta}
                  </option>
                ))}
                <option value="Otra">Otra</option>
              </select>
            </div>
          </div>
          {/* El campo trampa: una persona no lo ve ni lo alcanza con el teclado. */}
          <div aria-hidden="true" style={{ position: "absolute", left: -10000, width: 1, height: 1, overflow: "hidden" }}>
            <label htmlFor="t-sitio">No llenes este campo</label>
            <input id="t-sitio" name="sitio" tabIndex={-1} autoComplete="off" />
          </div>
          {error && <p style={{ margin: 0, color: "#b42318", fontSize: 14 }}>{error}</p>}
          <div>
            <button type="submit" disabled={ocupado} style={botonPrincipal(!ocupado)}>
              {ocupado ? "Un momento…" : "Empezar el test"}
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: TINTA_SUAVE }}>
            Usamos tus datos para mandarte tu resultado y, si quieres, conversarlo en una sesión. No los compartimos con nadie.
          </p>
        </form>
      </div>
    );
  }

  if (!pregunta) return null;
  const n = vista.preguntas.length;
  const avance = Math.round((indice / n) * 100);
  return (
    <div style={caja}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: TINTA_SUAVE, marginBottom: 8 }}>
        <span>Diagnóstico de Rendimiento · {areaNombre}</span>
        <span>
          Pregunta {indice + 1} de {n}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: FONDO_SUAVE, overflow: "hidden", marginBottom: 28 }}>
        <div style={{ width: `${avance}%`, height: "100%", background: `linear-gradient(90deg, ${ACENTO}, ${ROYAL})`, transition: "width 200ms ease" }} />
      </div>
      <h1 style={{ margin: "0 0 8px", fontSize: 24, lineHeight: 1.3 }}>{pregunta.texto}</h1>
      {pregunta.ayuda && <p style={{ margin: "0 0 18px", color: TINTA_SUAVE, fontSize: 15, lineHeight: 1.5 }}>{pregunta.ayuda}</p>}
      <p style={{ margin: "0 0 14px", fontSize: 13, color: TINTA_SUAVE }}>Elige la que mejor describe cómo funciona HOY, no cómo debería.</p>
      <div role="radiogroup" aria-label={pregunta.texto} style={{ display: "grid", gap: 10 }}>
        {[...pregunta.opciones, { id: NO_LO_SE, texto: "No lo sé" }].map((o) => {
          const activa = elegida === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => elegir(o.id)}
              style={{
                textAlign: "left",
                padding: "14px 16px",
                borderRadius: 12,
                border: `2px solid ${activa ? ROYAL : BORDE}`,
                background: activa ? "#eef4ff" : "#fff",
                color: TINTA,
                fontSize: 15,
                lineHeight: 1.5,
                cursor: "pointer",
                fontFamily: fuente,
                fontStyle: o.id === NO_LO_SE ? "italic" : "normal",
              }}
            >
              {o.texto}
            </button>
          );
        })}
      </div>
      <label style={{ ...etiqueta, marginTop: 20 }} htmlFor="t-matiz">
        Si quieres, cuéntanos un poco más (opcional)
      </label>
      <textarea
        id="t-matiz"
        rows={3}
        maxLength={1000}
        value={respuestas[pregunta.id]?.matiz ?? ""}
        onChange={(e) => escribirMatiz(e.target.value)}
        disabled={!elegida}
        placeholder={elegida ? "Un ejemplo de cómo lo hacen hoy…" : "Primero elige una opción"}
        style={{ ...campo, resize: "vertical" }}
      />
      {error && <p style={{ margin: "14px 0 0", color: "#b42318", fontSize: 14 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "space-between" }}>
        <button type="button" style={{ ...botonSecundario, visibility: indice === 0 ? "hidden" : "visible" }} onClick={() => setIndice((i) => Math.max(0, i - 1))}>
          Atrás
        </button>
        <button type="button" disabled={!elegida || ocupado} style={botonPrincipal(!!elegida && !ocupado)} onClick={() => void siguiente()}>
          {ocupado ? "Un momento…" : esLaUltima ? "Ver mi resultado" : "Siguiente"}
        </button>
      </div>
    </div>
  );
}
