"use client";

/**
 * components/canvas/EstadoDelDocumento.tsx — borrador, presentado y aprobado (2026-10-02).
 *
 * La franja del equipo sobre el diagnóstico (fuera de `.stl`: tokens del tema, no la marca del
 * cliente). Sigue el flujo real: se PRESENTA (con el hilo cerrado y la política revisada), el cliente
 * agrega cosas y se regenera (eso abre la versión siguiente), y se REGISTRA LA APROBACIÓN que Caroline
 * pidió por correo — quién, cuándo y la evidencia. Aprobado = cerrado hasta reabrirlo con motivo.
 *
 * Las reglas viven en lib/canvas/estado-del-documento.ts; el servidor las vuelve a revisar siempre.
 * `motivosLocales` es lo que la pantalla ya sabe (el hilo y la política, en vivo) para no tener que
 * preguntarle al servidor en cada edición.
 */
import { useCallback, useEffect, useState } from "react";
import { ETIQUETA_DEL_ESTADO, type EstadoVista, type HitoVista } from "@/lib/canvas/estado-del-documento";
import { subirDirecto } from "@/lib/storage/subir-directo";

function fecha(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" });
}

function hoyLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const CHIP: Record<EstadoVista["estado"], string> = {
  borrador: "bg-surface-hover text-fg-secondary border border-line",
  presentado: "bg-brand/10 text-brand border border-brand/30",
  aprobado: "bg-success/10 text-success border border-success/30",
};

function textoDelHito(h: HitoVista): string {
  if (h.tipo === "presentado") return `Se presentó la v${h.version}${h.porEmail ? ` (${h.porEmail})` : ""}.`;
  if (h.tipo === "aprobado") {
    return `El cliente aprobó la v${h.version}: ${h.aprobadoPorNombre ?? "—"}${h.aprobadoPorEmail ? ` (${h.aprobadoPorEmail})` : ""}, el ${fecha(h.aprobadoEl)}.`;
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
  /** Lo que hoy impide presentar, calculado en vivo por la pantalla (hilo + política). */
  motivosLocales: string[];
  /** Avisa cada vez que el estado cambia (la portada lo muestra y el editor se cierra al aprobar). */
  onEstado: (estado: EstadoVista) => void;
}) {
  const [estado, setEstado] = useState<EstadoVista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [motivosDelServidor, setMotivosDelServidor] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState<"aprobar" | "reabrir" | null>(null);
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
        El estado del documento (presentado y aprobado) todavía no está disponible: falta aplicar su migración en la base.
      </div>
    );
  }
  if (!estado) return null;

  const motivos = motivosLocales;
  const puedePresentar = estado.estado !== "aprobado" && motivos.length === 0;
  const aprobado = estado.hitos.find((h) => h.tipo === "aprobado" && h.version === estado.version);

  return (
    <div className="rounded-xl border border-line bg-surface mx-4 mt-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={`text-[11px] font-bold uppercase tracking-wide rounded-full px-2.5 py-0.5 ${CHIP[estado.estado]}`}>
          {ETIQUETA_DEL_ESTADO[estado.estado]} · v{estado.version}
        </span>
        <span className="text-xs text-fg-secondary flex-1 min-w-[200px]">
          {estado.estado === "aprobado" && aprobado
            ? `Aprobado por ${aprobado.aprobadoPorNombre ?? "el cliente"} el ${fecha(aprobado.aprobadoEl)}. Está cerrado: para cambiarlo, reábrelo.`
            : estado.estado === "presentado"
              ? estado.cambiosDesdeLaPresentacion
                ? "Cambió desde que se presentó: preséntalo de nuevo (será la versión siguiente) antes de registrar la aprobación."
                : "Presentado al cliente. Cuando llegue su aprobación por correo, regístrala acá."
              : "Borrador: se presenta cuando el hilo está cerrado y la política rectora revisada."}
        </span>
        <div className="flex flex-wrap gap-2">
          {estado.estado !== "aprobado" && (estado.estado === "borrador" || estado.cambiosDesdeLaPresentacion) && (
            <button
              type="button"
              disabled={!puedePresentar || ocupado}
              onClick={() => void pedir({ accion: "presentar" })}
              title={motivos.length ? motivos.join("\n") : "Deja guardado lo que vio el cliente"}
              className="text-xs font-semibold text-primary-fg bg-brand hover:bg-brand-dark disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              {estado.estado === "presentado" ? `Presentar la v${estado.version + 1}` : "Presentar al cliente"}
            </button>
          )}
          {estado.estado === "presentado" && !estado.cambiosDesdeLaPresentacion && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => setForm(form === "aprobar" ? null : "aprobar")}
              className="text-xs font-semibold text-primary-fg bg-brand hover:bg-brand-dark disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              Registrar aprobación
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
            <li key={i}>{m}</li>
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

      {form === "aprobar" && <FormularioDeAprobacion projectId={projectId} ocupado={ocupado} onEnviar={(d) => pedir({ accion: "aprobar", ...d })} />}
      {form === "reabrir" && <FormularioDeReapertura ocupado={ocupado} onEnviar={(motivo) => pedir({ accion: "reabrir", motivo })} />}

      {verHistorial && (
        <ul className="mt-3 border-t border-line pt-2 space-y-1.5">
          {estado.hitos.map((h) => (
            <li key={h.id} className="text-[11px] text-fg-secondary">
              <span className="text-fg-muted">{fecha(h.createdAt)} · </span>
              {textoDelHito(h)}
              {h.tipo === "aprobado" && h.hubspotError && <span className="text-warn-ink"> ({h.hubspotError})</span>}
              {h.tipo === "aprobado" && h.hubspotNotaId && <span className="text-fg-muted"> · Nota en HubSpot</span>}
              {h.tipo === "aprobado" && h.evidencia && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-fg-muted">Ver la evidencia</summary>
                  <p className="whitespace-pre-wrap mt-1 text-fg-secondary">{h.evidencia}</p>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FormularioDeAprobacion({
  projectId,
  ocupado,
  onEnviar,
}: {
  projectId: string;
  ocupado: boolean;
  onEnviar: (d: { nombre: string; email: string; fecha: string; evidencia: string; evidenciaDocumentoId: string | null }) => Promise<boolean>;
}) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [dia, setDia] = useState(hoyLocal());
  const [evidencia, setEvidencia] = useState("");
  const [adjunto, setAdjunto] = useState<{ id: string; nombre: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [errorAdjunto, setErrorAdjunto] = useState<string | null>(null);

  const adjuntar = async (archivo: File) => {
    setSubiendo(true);
    setErrorAdjunto(null);
    // Queda como documento del proyecto: la misma subida directa que el resto de los documentos.
    const r = await subirDirecto<{ id?: string; title?: string }>({ ruta: `/api/projects/${projectId}/documents/upload`, archivo });
    setSubiendo(false);
    if (!r.ok || !r.data.id) setErrorAdjunto(r.ok ? "No se pudo registrar el archivo." : r.error);
    else setAdjunto({ id: r.data.id, nombre: r.data.title ?? archivo.name });
  };

  const campo = "w-full px-2.5 py-1.5 text-xs bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand";
  return (
    <div className="mt-3 border-t border-line pt-3 grid gap-2">
      <p className="text-[11px] text-fg-muted">
        Registra la aprobación formal que pidió el equipo por correo. Queda en el historial y como nota en la empresa en HubSpot.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input className={campo} placeholder="Quién aprobó (nombre)" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input className={campo} placeholder="Su correo (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={campo} type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
      </div>
      <textarea
        className={`${campo} min-h-[90px] resize-y`}
        placeholder="Pega acá el correo de aprobación (o describe la evidencia adjunta)…"
        value={evidencia}
        onChange={(e) => setEvidencia(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-fg-secondary border border-line hover:bg-surface-hover px-3 py-1.5 rounded-lg cursor-pointer">
          {subiendo ? "Subiendo…" : adjunto ? `Adjunto: ${adjunto.nombre}` : "Adjuntar el correo (PDF, .eml…)"}
          <input
            type="file"
            className="hidden"
            disabled={subiendo}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void adjuntar(f);
              e.target.value = "";
            }}
          />
        </label>
        {errorAdjunto && <span className="text-xs text-danger-ink">{errorAdjunto}</span>}
        <button
          type="button"
          disabled={ocupado || subiendo}
          onClick={() => void onEnviar({ nombre, email, fecha: dia, evidencia, evidenciaDocumentoId: adjunto?.id ?? null })}
          className="ml-auto text-xs font-semibold text-primary-fg bg-brand hover:bg-brand-dark disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
        >
          {ocupado ? "Guardando…" : "Registrar aprobación"}
        </button>
      </div>
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
