"use client";

/**
 * components/exploraciones/HistorialDelResumen.tsx — el historial de versiones del Resumen de La escala (21 nov), con el
 * popup común (components/versiones/HistorialDeVersiones.tsx). La vista previa es la misma página del Resumen, armada
 * con esa versión en el servidor y sin edición. Reemplaza a «Volver a la versión anterior».
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Skeleton } from "@/components/ui";
import { PESTANA_DEL_RESUMEN } from "@/components/external/test/ArribaDeLaEscala";
import ResumenDeLaEscalaVista from "@/components/external/test/ResumenDeLaEscalaVista";
import HistorialDeVersiones, { type VersionParaElPopup } from "@/components/versiones/HistorialDeVersiones";
import type { PaginaParaElCse } from "@/lib/exploraciones/escala-para-el-cliente-server";

function VistaDeLaPagina({ pagina }: { pagina: PaginaParaElCse }) {
  return (
    <div className="pointer-events-none overflow-hidden rounded-xl border border-line" aria-label="Vista previa del Resumen">
      <ResumenDeLaEscalaVista
        resumen={pagina.resumen}
        empresa={pagina.empresa}
        dominio={pagina.dominio}
        logo={pagina.logo}
        fecha={pagina.fecha}
        pestanas={[{ id: PESTANA_DEL_RESUMEN, nombre: "Resumen", href: "#" }, ...pagina.areas.map((a) => ({ ...a, href: "#", oculta: !pagina.alCliente.includes(a.id) }))]}
        textos={pagina.textos}
        // Quieta y del alto de su contenido (25 nov, Elías: «más grande de lo que debería, un gran espacio en blanco al final»).
        vistaPrevia
      />
    </div>
  );
}

/** La página de una versión guardada: se pide al elegirla y se recuerda mientras el popup está abierto. */
function VistaDeUnaVersion({ exploracionId, versionId, cache }: { exploracionId: string; versionId: string; cache: Map<string, PaginaParaElCse> }) {
  const [estado, setEstado] = useState<{ id: string; pagina: PaginaParaElCse | null; error: string | null } | null>(null);
  useEffect(() => {
    if (cache.has(versionId)) return;
    const ctrl = new AbortController();
    fetch(`/api/sales/exploraciones/${exploracionId}/escala/resumen/versiones/${versionId}`, { cache: "no-store", signal: ctrl.signal })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as { pagina?: PaginaParaElCse; error?: string };
        if (!r.ok || !data.pagina) throw new Error(data.error ?? "No se pudo armar la vista previa.");
        cache.set(versionId, data.pagina);
        setEstado({ id: versionId, pagina: data.pagina, error: null });
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setEstado({ id: versionId, pagina: null, error: e instanceof Error ? e.message : "No se pudo armar la vista previa." });
      });
    return () => ctrl.abort();
  }, [exploracionId, versionId, cache]);
  const pagina = cache.get(versionId) ?? (estado?.id === versionId ? estado.pagina : null);
  if (pagina) return <VistaDeLaPagina pagina={pagina} />;
  if (estado?.id === versionId && estado.error)
    return (
      <Alert variant="danger" title="No se pudo armar la vista previa">
        {estado.error}
      </Alert>
    );
  return <Skeleton className="h-[640px] w-full" rounded="lg" />;
}

export default function HistorialDelResumen({
  open,
  onClose,
  exploracionId,
  empresa,
  paginaDeHoy,
  puedeEditar,
  frenado,
  alCambiar,
  descartados,
}: {
  open: boolean;
  onClose: () => void;
  exploracionId: string;
  empresa: string;
  /** La página que está en pantalla: es la vista previa de la actual. */
  paginaDeHoy: PaginaParaElCse;
  puedeEditar: boolean;
  /** Por qué no se puede usar ahora (Nexus lo está rehaciendo, o hay un texto guardándose). */
  frenado: string | null;
  alCambiar: () => void;
  /** Lo que Nexus escribió y no pasó la verificación la última vez que lo generó (27 nov: estaba arriba de la página). */
  descartados?: readonly string[] | null;
}) {
  const firma = useRef<string | null>(null);
  const [cache] = useState(() => new Map<string, PaginaParaElCse>());

  const cargar = useCallback(async (): Promise<VersionParaElPopup[]> => {
    const r = await fetch(`/api/sales/exploraciones/${exploracionId}/escala/resumen/versiones`, { cache: "no-store" });
    const data = (await r.json().catch(() => ({}))) as { versiones?: VersionParaElPopup[]; firma?: string | null; error?: string };
    if (!r.ok || !data.versiones) throw new Error(data.error ?? "No se pudo cargar el historial.");
    firma.current = data.firma ?? null;
    return data.versiones;
  }, [exploracionId]);

  const usar = async (versionId: string): Promise<string | null> => {
    const r = await fetch(`/api/sales/exploraciones/${exploracionId}/escala/resumen/versiones/${versionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firma: firma.current }),
    }).catch(() => null);
    const data = ((await r?.json().catch(() => ({}))) ?? {}) as { error?: string };
    if (!r?.ok) {
      // Un 409 es que cambió: lo de la pantalla se pone al día igual.
      alCambiar();
      return data.error ?? "No se pudo usar esa versión.";
    }
    return null;
  };

  return (
    <HistorialDeVersiones
      open={open}
      onClose={onClose}
      documento={`Resumen del Diagnóstico de rendimiento · ${empresa}`}
      cargar={cargar}
      usar={puedeEditar ? usar : undefined}
      frenado={frenado}
      alCambiar={alCambiar}
      alPie={
        descartados && descartados.length > 0 ? (
          <details className="px-2 text-xs text-fg-muted">
            <summary className="cursor-pointer font-semibold text-fg-secondary">Lo que Nexus escribió y no pasó la verificación ({descartados.length})</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {descartados.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </details>
        ) : null
      }
      vista={(v: VersionParaElPopup) =>
        v.esActual || !v.id ? <VistaDeLaPagina pagina={paginaDeHoy} /> : <VistaDeUnaVersion exploracionId={exploracionId} versionId={v.id} cache={cache} />
      }
    />
  );
}
