"use client";

/**
 * components/external/AprobarDiagnostico.tsx — el cliente APRUEBA el diagnóstico desde su enlace
 * (2026-10-04). Molde: la aprobación de la propuesta (PropuestaAprobacion.tsx).
 *
 * Fuera del motor de landing, a propósito: no aparece en el PDF (un botón impreso sería un botón
 * muerto) ni en el editor. Tres estados, que decide el servidor (`aprobacionEnElEnlace`):
 *   · por aprobar — nombre, correo y la casilla «Leí este diagnóstico y lo apruebo…».
 *   · aprobado — quién y cuándo.
 *   · en revisión — el equipo está ajustando: se aprueba la versión nueva cuando la presenten.
 *
 * Campos NO controlados (se leen del FormData al enviar), igual que la propuesta: no pelean con el
 * autocompletado del navegador. Solo React + estilos inline, como el resto de /external.
 */
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AprobacionEnElEnlace } from "@/lib/canvas/estado-del-documento";
import { TEXTO_DE_APROBACION_DEL_CLIENTE } from "@/lib/canvas/estado-del-documento";
import type { AprobarDiagnosticoResult } from "@/app/external/diagnostico/actions";

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const AZUL = "#0B58D3";
const NARANJA = "#E8481C";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Sin `toLocaleDateString`: este texto lo pinta también el servidor (ver PropuestaAprobacion.tsx). */
function fechaLarga(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : null;
}

export default function AprobarDiagnostico({
  aprobacion,
  aprobar,
}: {
  aprobacion: AprobacionEnElEnlace;
  aprobar: (nombre: string, email: string, acepto: boolean) => Promise<AprobarDiagnosticoResult>;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecha, setHecha] = useState<{ nombre: string | null; fecha: string | null } | null>(
    aprobacion.estado === "aprobado" ? { nombre: aprobacion.nombre, fecha: aprobacion.fecha } : null,
  );

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (enviando) return;
    const datos = new FormData(e.currentTarget);
    const nombre = String(datos.get("nombre") ?? "").trim();
    const email = String(datos.get("email") ?? "").trim();
    const acepto = datos.get("acepto") === "si";
    if (nombre.length < 2) return setError("Escribe tu nombre.");
    if (!CORREO.test(email)) return setError("Revisa tu correo: no parece válido.");
    if (!acepto) return setError("Marca la casilla para confirmar que lo apruebas.");
    setError(null);
    setEnviando(true);
    try {
      const r = await aprobar(nombre, email, acepto);
      if (r.ok) {
        setHecha({ nombre: r.nombre, fecha: r.fecha });
        // La línea de la portada pasa a «Estado: Aprobado».
        router.refresh();
      } else {
        setError(r.error);
      }
    } catch {
      setError("No se pudo registrar la aprobación. Vuelve a intentarlo en un momento.");
    } finally {
      setEnviando(false);
    }
  };

  if (hecha) {
    const fecha = fechaLarga(hecha.fecha);
    return (
      <section style={wrap} aria-live="polite">
        <div style={{ ...card, borderColor: "#a7f3d0", background: "#f0fdf9" }}>
          <h2 style={{ ...titulo, color: "#065f46" }}>✓ Diagnóstico aprobado</h2>
          <p style={{ ...bajada, color: "#047857" }}>
            {/* Neutro: quien mira el enlace puede no ser quien aprobó (o lo registró el equipo con su correo). */}
            {["Aprobado", fecha ? `el ${fecha}` : "", hecha.nombre ? `por ${hecha.nombre}` : ""].filter(Boolean).join(" ")}.
            {" "}Con esto pasamos a la planificación: cómo queda configurado en HubSpot lo que acordamos aquí.
          </p>
        </div>
      </section>
    );
  }

  if (aprobacion.estado === "en-revision") {
    return (
      <section style={wrap}>
        <div style={card}>
          <h2 style={titulo}>Estamos ajustando este diagnóstico</h2>
          <p style={bajada}>
            Estamos incorporando lo que conversamos. Cuando presentemos la versión nueva, la vas a ver aquí y vas a poder aprobarla.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section style={wrap}>
      <form onSubmit={enviar} style={card}>
        <h2 style={titulo}>¿Lo aprobamos?</h2>
        <p style={bajada}>
          Si este diagnóstico refleja lo que conversamos, apruébalo aquí y pasamos a la planificación. Si algo no calza,
          escríbenos y lo ajustamos antes.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
          <label htmlFor="aprob-diag-nombre" style={{ flex: "1 1 220px", minWidth: 0 }}>
            <span style={rotulo}>Tu nombre</span>
            <input id="aprob-diag-nombre" name="nombre" type="text" autoComplete="name" required maxLength={160} defaultValue="" disabled={enviando} style={input} />
          </label>
          <label htmlFor="aprob-diag-email" style={{ flex: "1 1 220px", minWidth: 0 }}>
            <span style={rotulo}>Tu correo</span>
            <input id="aprob-diag-email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={160} defaultValue="" disabled={enviando} style={input} />
          </label>
        </div>

        <label htmlFor="aprob-diag-acepto" style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 16, fontSize: 14, color: "#0b1f44", lineHeight: 1.5 }}>
          <input id="aprob-diag-acepto" name="acepto" type="checkbox" value="si" disabled={enviando} style={{ marginTop: 3, width: 16, height: 16, flex: "none" }} />
          <span>{TEXTO_DE_APROBACION_DEL_CLIENTE}</span>
        </label>

        {error && (
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "#b91c1c" }} role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={enviando} style={{ ...boton, opacity: enviando ? 0.6 : 1 }}>
          {enviando ? "Registrando…" : "Aprobar el diagnóstico"}
        </button>
      </form>
    </section>
  );
}

// ── Estilos (inline: esta superficie no comparte hoja con la app interna) ──────
const wrap: React.CSSProperties = {
  maxWidth: "var(--stl-w-pagina, 1280px)",
  margin: "0 auto",
  padding: "40px 24px 56px",
  fontFamily: "var(--font-jakarta), system-ui, sans-serif",
};
const card: React.CSSProperties = {
  border: "1px solid #dbe6f7",
  borderRadius: 18,
  background: "#fff",
  padding: "28px 26px",
  boxShadow: "0 1px 2px rgba(11,88,211,0.05)",
};
const titulo: React.CSSProperties = { margin: 0, fontSize: 20, fontWeight: 700, color: "#0b1f44" };
const bajada: React.CSSProperties = { margin: "8px 0 0", fontSize: 14, lineHeight: 1.6, color: "#41527a" };
const rotulo: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#6b7a99",
  marginBottom: 6,
};
const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd8ee",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  color: "#0b1f44",
  background: "#fff",
  fontFamily: "inherit",
};
const boton: React.CSSProperties = {
  marginTop: 18,
  border: "none",
  borderRadius: 10,
  padding: "12px 22px",
  fontSize: 14,
  fontWeight: 700,
  color: "#fff",
  cursor: "pointer",
  fontFamily: "inherit",
  background: `linear-gradient(90deg, ${NARANJA}, ${AZUL})`,
};
