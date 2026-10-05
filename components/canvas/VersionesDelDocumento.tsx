"use client";

/**
 * components/canvas/VersionesDelDocumento.tsx — «Versiones anteriores» de un documento (2026-09-28).
 *
 * Cada vez que la IA va a reescribir un documento, Nexus guarda antes una foto (lib/canvas/versiones.ts).
 * Acá se consultan: a la izquierda las fotos por fecha, a la derecha las secciones de la elegida con
 * un vistazo de su texto y dos acciones —
 *   · «Traer al documento»: esa sección vuelve al documento actual (aunque ya no exista en su
 *     estructura, como la Escala de un diagnóstico viejo),
 *   · «Restaurar esta versión»: el documento entero vuelve a como estaba.
 * Las dos toman una foto antes, así que siempre se puede volver atrás.
 */
import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { BOTON_DE_HERRAMIENTA } from "@/components/ui/sistema";

interface Resumen {
  id: string;
  origen: string;
  creadaPor: string | null;
  createdAt: string;
}
interface Seccion {
  key: string;
  label: string;
  titleOverride: string | null;
  blocks: Array<{ blockType: string; content: string | null; data: unknown }>;
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleString("es-CR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Todo el texto de una sección, aplanado: para el vistazo, no para leerla entera. */
function textoDe(s: Seccion): string {
  const partes: string[] = [];
  const juntar = (v: unknown) => {
    if (typeof v === "string") {
      if (v.trim() && !/^https?:\/\//.test(v)) partes.push(v.trim());
    } else if (Array.isArray(v)) v.forEach(juntar);
    else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(juntar);
  };
  for (const b of s.blocks) {
    if (b.content) partes.push(b.content);
    juntar(b.data);
  }
  return partes.join(" · ");
}

export default function VersionesDelDocumento({
  projectId,
  canvasId,
  onCambio,
}: {
  projectId: string;
  canvasId: string;
  /** Después de traer o restaurar: el documento se vuelve a montar. */
  onCambio: () => void;
}) {
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [versiones, setVersiones] = useState<Resumen[] | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [secciones, setSecciones] = useState<Seccion[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargarLista = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/versiones?canvasId=${canvasId}`).catch(() => null);
    const j = r?.ok ? ((await r.json()) as { versiones: Resumen[] }) : { versiones: [] };
    setVersiones(j.versiones);
    setElegida((e) => e ?? j.versiones[0]?.id ?? null);
  }, [projectId, canvasId]);

  useEffect(() => {
    if (abierto) void cargarLista();
  }, [abierto, cargarLista]);

  useEffect(() => {
    if (!abierto || !elegida) return;
    let vivo = true;
    setSecciones(null);
    fetch(`/api/projects/${projectId}/versiones/${elegida}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { version?: { secciones: Seccion[] } } | null) => {
        if (vivo) setSecciones((j?.version?.secciones ?? []).filter((s) => s.blocks.length > 0));
      })
      .catch(() => vivo && setSecciones([]));
    return () => {
      vivo = false;
    };
  }, [abierto, elegida, projectId]);

  async function usar(body: { accion: "traer"; key: string } | { accion: "restaurar" }, etiqueta: string) {
    if (!elegida) return;
    setOcupado(body.accion === "traer" ? body.key : "__todo");
    try {
      const r = await fetch(`/api/projects/${projectId}/versiones/${elegida}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        toast.error(j.error ?? "No se pudo.");
        return;
      }
      toast.success(`${etiqueta}. Lo que había quedó guardado como versión.`);
      void cargarLista();
      onCambio();
    } finally {
      setOcupado(null);
    }
  }

  const versionElegida = versiones?.find((v) => v.id === elegida);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Cómo estaba este documento antes de cada regeneración: consúltalo, trae una sección o restáuralo"
        className={BOTON_DE_HERRAMIENTA}
      >
        {/* El reloj de «antes»: mismo botón blanco que «Asistente» y «Exportar PDF» (2026-10-04). */}
        <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8M3 3v5h5M12 7v5l3 2" />
        </svg>
        Versiones anteriores
      </button>
      <Modal open={abierto} onClose={() => setAbierto(false)} title="Versiones anteriores" size="xl">
        {versiones === null ? (
          <p className="text-sm text-fg-muted py-4">Cargando…</p>
        ) : versiones.length === 0 ? (
          <p className="text-sm text-fg-muted py-4">
            Todavía no hay versiones de este documento. Se guarda una cada vez que la IA lo regenera, antes de
            escribir.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 min-h-[320px]">
            <ul className="space-y-1 md:border-r md:border-line md:pr-3 max-h-[60vh] overflow-y-auto">
              {versiones.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setElegida(v.id)}
                    className={`w-full text-left rounded-lg px-2.5 py-2 text-xs transition-colors ${
                      v.id === elegida ? "bg-surface-hover text-fg" : "text-fg-secondary hover:bg-surface-hover"
                    }`}
                  >
                    <span className="block font-medium">{fecha(v.createdAt)}</span>
                    <span className="block text-[11px] text-fg-muted">
                      {v.origen}
                      {v.creadaPor ? ` · ${v.creadaPor}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="min-w-0 space-y-3">
              {versionElegida && (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-fg-muted">
                    Así estaba el documento el {fecha(versionElegida.createdAt)} ({versionElegida.origen.toLowerCase()}).
                  </p>
                  <button
                    type="button"
                    disabled={!!ocupado}
                    onClick={() => void usar({ accion: "restaurar" }, "Versión restaurada")}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-line text-fg-secondary hover:text-fg hover:bg-surface-hover disabled:opacity-50"
                  >
                    {ocupado === "__todo" ? "Restaurando…" : "Restaurar esta versión"}
                  </button>
                </div>
              )}
              {secciones === null ? (
                <p className="text-sm text-fg-muted">Cargando…</p>
              ) : (
                <ul className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                  {secciones.map((s) => {
                    const texto = textoDe(s);
                    return (
                      <li key={s.key} className="rounded-lg border border-line bg-surface px-3 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-fg">{s.titleOverride || s.label}</p>
                          <button
                            type="button"
                            disabled={!!ocupado}
                            onClick={() => void usar({ accion: "traer", key: s.key }, `«${s.titleOverride || s.label}» traída al documento`)}
                            className="flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-md border border-brand/30 bg-brand/15 text-brand hover:bg-brand/25 disabled:opacity-50"
                          >
                            {ocupado === s.key ? "Trayendo…" : "Traer al documento"}
                          </button>
                        </div>
                        <p className="text-xs text-fg-muted mt-1 line-clamp-3">{texto || "(sin texto)"}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
