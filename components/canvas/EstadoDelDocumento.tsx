"use client";

/**
 * components/canvas/EstadoDelDocumento.tsx — borrador y presentado (2026-10-02).
 *
 * La franja del equipo sobre el diagnóstico (fuera de `.stl`: tokens del tema, no la marca del
 * cliente). Se PRESENTA (lo que falta revisar es aviso, no frena) y lo que cambia después abre la
 * versión siguiente. La aprobación se quitó entera el 2026-10-28 (Elías): ni el equipo la registra
 * ni el cliente la da desde su enlace.
 *
 * Las reglas viven en lib/canvas/estado-del-documento.ts; el servidor las vuelve a revisar siempre.
 * `motivosLocales` es lo que la pantalla ya sabe (el hilo, el desafío y el enfoque, en vivo) para no tener que
 * preguntarle al servidor en cada edición. Cada motivo lleva a su sección (L2, 2026-10-24).
 */
import { useCallback, useEffect, useState } from "react";
import { ETIQUETA_DEL_ESTADO, type EstadoVista, type HitoVista, type MotivoParaPresentar } from "@/lib/canvas/estado-del-documento";

/** Lleva a la sección del documento (el índice del panel salta igual: `data-seccion`, LandingView). */
function irALaSeccion(key: string): void {
  const destino = document.querySelector(`[data-seccion="${CSS.escape(key)}"]`);
  destino?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fecha(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" });
}

const CHIP: Record<EstadoVista["estado"], string> = {
  borrador: "bg-surface-hover text-fg-secondary border border-line",
  presentado: "bg-brand/10 text-brand border border-brand/30",
  aprobado: "bg-success/10 text-success border border-success/30",
};

function textoDelHito(h: HitoVista): string {
  if (h.tipo === "presentado") return `Se presentó la v${h.version}${h.porEmail ? ` (${h.porEmail})` : ""}.`;
  if (h.tipo === "aprobado") {
    // Registros anteriores al 2026-10-28: sin quién lo registró = lo aprobó el cliente desde su enlace.
    const como = h.porEmail ? ` (lo registró ${h.porEmail})` : " desde su enlace";
    return `El cliente aprobó la v${h.version}${como}: ${h.aprobadoPorNombre ?? "—"}${h.aprobadoPorEmail ? ` (${h.aprobadoPorEmail})` : ""}, el ${fecha(h.aprobadoEl)}.`;
  }
  return `Se abrió la v${h.version}${h.motivo ? `: ${h.motivo}` : "."}`;
}

export default function EstadoDelDocumento({
  projectId,
  canvasId,
  motivosLocales,
  onEstado,
}: {
  projectId: string;
  canvasId: string;
  /** Lo que hoy impide presentar, calculado en vivo por la pantalla (hilo, desafío y enfoque), con su sección. */
  motivosLocales: MotivoParaPresentar[];
  /** Avisa cada vez que el estado cambia (la portada lo muestra y el editor se cierra al aprobar). */
  onEstado: (estado: EstadoVista) => void;
}) {
  const [estado, setEstado] = useState<EstadoVista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [motivosDelServidor, setMotivosDelServidor] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState<"reabrir" | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);
  const [sinTabla, setSinTabla] = useState(false);

  const aplicar = useCallback(
    (e: EstadoVista) => {
      setEstado(e);
      onEstado(e);
    },
    [onEstado],
  );

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/estado-del-documento?canvasId=${encodeURIComponent(canvasId)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!vivo) return;
        if (r.status === 503) setSinTabla(true);
        else if (r.ok && j) aplicar(j as EstadoVista);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [projectId, canvasId, aplicar]);

  const pedir = async (cuerpo: Record<string, unknown>) => {
    setOcupado(true);
    setError(null);
    setMotivosDelServidor([]);
    try {
      const r = await fetch(`/api/projects/${projectId}/estado-del-documento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasId, ...cuerpo }),
      });
      const j = (await r.json().catch(() => null)) as (EstadoVista & { error?: string; motivos?: string[] }) | null;
      if (!r.ok) {
        setError(j?.error ?? "No se pudo cambiar el estado. Vuelve a intentarlo.");
        setMotivosDelServidor(Array.isArray(j?.motivos) ? j!.motivos! : []);
        return false;
      }
      if (j) aplicar(j);
      setForm(null);
      return true;
    } catch {
      setError("No hay conexión. Revisa tu internet e inténtalo de nuevo.");
      return false;
    } finally {
      setOcupado(false);
    }
  };

  if (sinTabla) {
    return (
      <div className="rounded-xl border border-warn-line bg-warn-surface text-warn-ink mx-4 mt-3 px-4 py-2.5 text-xs">
        El estado del documento (borrador y presentado) todavía no está disponible: falta aplicar su migración en la base.
      </div>
    );
  }
  if (!estado) return null;

  const motivos = motivosLocales;
  // Solo bloquea lo marcado así (aprobado, sin contenido); el resto es aviso (2026-10-28).
  const puedePresentar = estado.estado !== "aprobado" && !motivos.some((m) => m.bloquea);

  return (
    <div className="rounded-xl border border-line bg-surface mx-4 mt-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={`text-[11px] font-bold uppercase tracking-wide rounded-full px-2.5 py-0.5 ${CHIP[estado.estado]}`}>
          {ETIQUETA_DEL_ESTADO[estado.estado]} · v{estado.version}
        </span>
        <span className="text-xs text-fg-secondary flex-1 min-w-[200px]">
          {estado.estado === "aprobado"
            ? "Aprobado (registro anterior). Para cambiarlo, reábrelo."
            : estado.estado === "presentado"
              ? estado.cambiosDesdeLaPresentacion
                ? "Cambió desde que se presentó: preséntalo de nuevo para que el enlace muestre la versión nueva."
                : "Presentado al cliente. Ya puedes compartirle el enlace."
              : motivos.length
                ? "Borrador. Antes de presentarlo, conviene revisar lo de abajo (no es obligatorio)."
                : "Borrador: listo para presentar."}
        </span>
        <div className="flex flex-wrap gap-2">
          {estado.estado !== "aprobado" && (estado.estado === "borrador" || estado.cambiosDesdeLaPresentacion) && (
            <button
              type="button"
              disabled={!puedePresentar || ocupado}
              onClick={() => void pedir({ accion: "presentar" })}
              title={motivos.length ? motivos.map((m) => m.texto).join("\n") : "Deja guardado lo que vio el cliente"}
              className="text-xs font-semibold text-primary-fg bg-brand hover:bg-brand-dark disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              {estado.estado === "presentado" ? `Presentar la v${estado.version + 1}` : "Presentar al cliente"}
            </button>
          )}
          {estado.estado !== "borrador" && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => setForm(form === "reabrir" ? null : "reabrir")}
              className="text-xs font-semibold text-fg-secondary border border-line hover:bg-surface-hover disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              Reabrir
            </button>
          )}
          {estado.hitos.length > 0 && (
            <button
              type="button"
              onClick={() => setVerHistorial((v) => !v)}
              className="text-xs font-medium text-fg-muted hover:text-fg px-2 py-1.5"
            >
              Historial {verHistorial ? "▾" : "▸"}
            </button>
          )}
        </div>
      </div>

      {estado.estado !== "aprobado" && motivos.length > 0 && (estado.estado === "borrador" || estado.cambiosDesdeLaPresentacion) && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-fg-muted list-disc pl-5">
          {motivos.map((m, i) => (
            <li key={i}>
              {m.texto}
              {m.seccion && (
                <>
                  {" "}
                  <button type="button" className="font-semibold text-brand hover:underline" onClick={() => irALaSeccion(m.seccion!)}>
                    Ir a la sección →
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mt-2 text-xs text-danger-ink">
          {error}
          {motivosDelServidor.length > 0 && (
            <ul className="list-disc pl-5 mt-1">
              {motivosDelServidor.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {form === "reabrir" && <FormularioDeReapertura ocupado={ocupado} onEnviar={(motivo) => pedir({ accion: "reabrir", motivo })} />}

      {verHistorial && (
        <ul className="mt-3 border-t border-line pt-2 space-y-1.5">
          {estado.hitos.map((h) => (
            <li key={h.id} className="text-[11px] text-fg-secondary">
              <span className="text-fg-muted">{fecha(h.createdAt)} · </span>
              {textoDelHito(h)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FormularioDeReapertura({ ocupado, onEnviar }: { ocupado: boolean; onEnviar: (motivo: string) => Promise<boolean> }) {
  const [motivo, setMotivo] = useState("");
  return (
    <div className="mt-3 border-t border-line pt-3 flex flex-wrap gap-2 items-start">
      <input
        className="flex-1 min-w-[240px] px-2.5 py-1.5 text-xs bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand"
        placeholder="Por qué se reabre (queda en el historial)…"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
      />
      <button
        type="button"
        disabled={ocupado || motivo.trim().length < 3}
        onClick={() => void onEnviar(motivo)}
        className="text-xs font-semibold text-fg border border-line hover:bg-surface-hover disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
      >
        Reabrir (abre la versión siguiente)
      </button>
    </div>
  );
}
