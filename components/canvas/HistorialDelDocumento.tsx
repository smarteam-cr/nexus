"use client";

/**
 * components/canvas/HistorialDelDocumento.tsx — el historial de versiones de un canvas (21 nov; DECISIONS «Historial de
 * versiones»), con el popup común. Reemplaza a «Versiones anteriores» (VersionesDelDocumento, 2026-09-28) y al historial
 * de corridas del handoff: lo que hacían sigue acá.
 *   · «Usar esta versión» restaura el documento entero (antes: «Restaurar esta versión»).
 *   · «Traer solo esta sección», en la vista previa, en cada sección distinta a la actual (antes: «Traer al documento»).
 *   · Las corridas viejas del handoff se leen con su documento, sin poder usarlas.
 * Las rutas: las del proyecto (`/api/projects/[id]/versiones`) o las de la propuesta comercial (`/api/business-cases/[id]/versiones`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Skeleton, useToast } from "@/components/ui";
import { BOTON_DE_HERRAMIENTA } from "@/components/ui/sistema";
import DocumentoAgenteView from "@/components/canvas/DocumentoAgenteView";
import HistorialDeVersiones, { type VersionParaElPopup } from "@/components/versiones/HistorialDeVersiones";
import { fetchJson } from "@/lib/api/fetch-json";
import type { DocumentoDeCorrida } from "@/lib/canvas/agent-output-doc";
import { jsonCanonico } from "@/lib/versiones/historial";

interface Bloque {
  blockType: string;
  content: string | null;
  data: unknown;
}
interface Seccion {
  key: string;
  label: string;
  titleOverride: string | null;
  blocks: Bloque[];
}

const PREFIJO_DE_CORRIDA = "corrida:";

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

/** Lo que se compara de una sección: sus bloques (tipo, texto y datos), no su orden ni su id. */
function firmaDeSeccion(s: Seccion | undefined): string {
  return s ? jsonCanonico(s.blocks.map((b) => [b.blockType, b.content, b.data])) : "";
}

function VistaDeSecciones({
  secciones,
  actual,
  traer,
}: {
  secciones: Seccion[];
  actual: Seccion[] | null;
  traer?: (s: Seccion) => Promise<void>;
}) {
  const [trayendo, setTrayendo] = useState<string | null>(null);
  const porKey = new Map((actual ?? []).map((s) => [s.key, s]));
  const conTexto = secciones.filter((s) => s.blocks.length > 0);
  const distintas = actual ? conTexto.filter((s) => firmaDeSeccion(s) !== firmaDeSeccion(porKey.get(s.key))).length : 0;
  if (!conTexto.length) return <p className="text-sm text-fg-muted">Esta versión no tiene contenido.</p>;
  return (
    <div className="flex flex-col gap-2.5">
      {actual && traer && (
        <p className="text-xs text-fg-muted">
          {distintas
            ? `Frente a la actual cambian ${distintas} de ${conTexto.length} secciones. Puedes traer solo las que quieras.`
            : "Igual a la actual en todas sus secciones."}
        </p>
      )}
      {conTexto.map((s) => {
        const distinta = !!actual && firmaDeSeccion(s) !== firmaDeSeccion(porKey.get(s.key));
        return (
          <div key={s.key} className={`flex flex-col gap-1.5 rounded-[14px] border px-3.5 py-3 ${distinta && traer ? "border-warn-line bg-warn-surface" : "border-line bg-surface"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-fg">{s.titleOverride || s.label}</span>
                {distinta && traer && <span className="text-[11px] font-semibold text-warn-ink">Distinta a la actual</span>}
              </div>
              {distinta && traer && (
                <button
                  type="button"
                  disabled={!!trayendo}
                  onClick={async () => {
                    setTrayendo(s.key);
                    await traer(s);
                    setTrayendo(null);
                  }}
                  className="rounded-[10px] border border-line bg-surface px-3 py-1 text-xs font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg disabled:opacity-50"
                >
                  {trayendo === s.key ? "Trayendo…" : "Traer solo esta sección"}
                </button>
              )}
            </div>
            <p className="line-clamp-4 text-[13px] leading-[19px] text-fg-secondary">{textoDe(s) || "(sin texto)"}</p>
          </div>
        );
      })}
    </div>
  );
}

/** Lo que devolvió Nexus en una corrida vieja del handoff, para leer. */
function VistaDeCorrida({ projectId, runId }: { projectId: string; runId: string }) {
  const [estado, setEstado] = useState<{ id: string; documento: DocumentoDeCorrida | null; error: string | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    fetchJson<{ documento: DocumentoDeCorrida }>(`/api/projects/${projectId}/agent-runs/${runId}`)
      .then((d) => vivo && setEstado({ id: runId, documento: d.documento, error: null }))
      .catch((e: unknown) => vivo && setEstado({ id: runId, documento: null, error: e instanceof Error ? e.message : "No se pudo abrir esta corrida." }));
    return () => {
      vivo = false;
    };
  }, [projectId, runId]);
  if (estado?.id !== runId) return <Skeleton className="h-[480px] w-full" rounded="lg" />;
  if (!estado.documento)
    return (
      <Alert variant="danger" title="No se pudo abrir esta corrida">
        {estado.error}
      </Alert>
    );
  return (
    <>
      <DocumentoAgenteView documento={estado.documento} />
      <p className="mt-5 border-t border-line pt-3 text-[11px] leading-relaxed text-fg-muted">
        Es lo que devolvió Nexus esa vez. El documento pudo haberse editado a mano desde entonces.
      </p>
    </>
  );
}

/** Una versión guardada: se pide al elegirla y se recuerda mientras el popup está abierto. */
function VistaDeUnaVersion({
  base,
  versionId,
  actual,
  cache,
  traer,
}: {
  base: string;
  versionId: string;
  actual: Seccion[] | null;
  cache: Map<string, Seccion[]>;
  traer?: (s: Seccion) => Promise<void>;
}) {
  const [estado, setEstado] = useState<{ id: string; error: string | null } | null>(null);
  useEffect(() => {
    if (cache.has(versionId)) return;
    let vivo = true;
    fetchJson<{ version: { secciones: Seccion[] } }>(`${base}/versiones/${versionId}`)
      .then((j) => {
        cache.set(versionId, j.version.secciones);
        if (vivo) setEstado({ id: versionId, error: null });
      })
      .catch((e: unknown) => vivo && setEstado({ id: versionId, error: e instanceof Error ? e.message : "No se pudo abrir esta versión." }));
    return () => {
      vivo = false;
    };
  }, [base, versionId, cache]);
  const secciones = cache.get(versionId);
  if (secciones) return <VistaDeSecciones secciones={secciones} actual={actual} traer={traer} />;
  if (estado?.id === versionId && estado.error)
    return (
      <Alert variant="danger" title="No se pudo abrir esta versión">
        {estado.error}
      </Alert>
    );
  return <Skeleton className="h-[480px] w-full" rounded="lg" />;
}

export function HistorialDelDocumentoPopup({
  open,
  onClose,
  base,
  projectId,
  canvasId,
  documento,
  onCambio,
  verboDePublicar,
}: {
  open: boolean;
  onClose: () => void;
  /** `/api/projects/<id>` o `/api/business-cases/<id>` */
  base: string;
  /** Para leer las corridas viejas del handoff (solo en proyectos). */
  projectId?: string;
  canvasId: string;
  documento: string;
  onCambio: () => void;
  verboDePublicar?: string;
}) {
  const toast = useToast();
  const actual = useRef<Seccion[] | null>(null);
  const [enVivo, setEnVivo] = useState(false);
  const [cache, setCache] = useState(() => new Map<string, Seccion[]>());

  const cargar = useCallback(async (): Promise<VersionParaElPopup[]> => {
    const j = await fetchJson<{ versiones: VersionParaElPopup[]; actual: Seccion[]; enVivo?: boolean }>(`${base}/versiones?canvasId=${encodeURIComponent(canvasId)}`);
    actual.current = j.actual;
    setEnVivo(!!j.enVivo);
    return j.versiones;
  }, [base, canvasId]);

  const pedir = async (versionId: string, body: { accion: "restaurar" } | { accion: "traer"; key: string }): Promise<string | null> => {
    const r = await fetch(`${base}/versiones/${versionId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = ((await r?.json().catch(() => ({}))) ?? {}) as { error?: string; message?: string };
    return r?.ok ? null : (j.error ?? j.message ?? "No se pudo.");
  };

  return (
    <HistorialDeVersiones
      open={open}
      onClose={onClose}
      documento={documento}
      cargar={cargar}
      usar={(id) => pedir(id, { accion: "restaurar" })}
      alCambiar={() => {
        // Lo que estaba en caché sigue valiendo (una versión no cambia); lo que cambia es la actual.
        setCache((c) => new Map(c));
        onCambio();
      }}
      verboDePublicar={verboDePublicar}
      enVivo={enVivo}
      vista={(v, o) => {
        if (v.id?.startsWith(PREFIJO_DE_CORRIDA) && projectId) return <VistaDeCorrida projectId={projectId} runId={v.id.slice(PREFIJO_DE_CORRIDA.length)} />;
        if (v.esActual || !v.id) return <VistaDeSecciones secciones={actual.current ?? []} actual={null} />;
        const id = v.id;
        return (
          <VistaDeUnaVersion
            base={base}
            versionId={id}
            actual={actual.current}
            cache={cache}
            traer={async (s) => {
              const err = await pedir(id, { accion: "traer", key: s.key });
              if (err) toast.error(err);
              else {
                toast.success(`«${s.titleOverride || s.label}» volvió al documento. Lo que había quedó guardado como versión.${enVivo ? " El cliente ya lo ve: este documento se comparte en vivo." : ""}`);
                o.alCambiar();
              }
            }}
          />
        );
      }}
    />
  );
}

/** El botón de la barra del documento + su popup. */
export default function HistorialDelDocumento(p: Omit<Parameters<typeof HistorialDelDocumentoPopup>[0], "open" | "onClose">) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Las versiones de este documento: cuál es la actual, cuál ve el cliente, y volver a otra"
        className={BOTON_DE_HERRAMIENTA}
      >
        <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8M3 3v5h5M12 7v5l3 2" />
        </svg>
        Historial
      </button>
      <HistorialDelDocumentoPopup {...p} open={abierto} onClose={() => setAbierto(false)} />
    </>
  );
}
