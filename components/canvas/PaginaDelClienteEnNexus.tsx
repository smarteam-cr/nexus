"use client";

/**
 * components/canvas/PaginaDelClienteEnNexus.tsx — «Lo que ve el cliente», dentro de Nexus (2026-11-27, opción B de
 * Elías). La página del cronograma tal como la verá el cliente al publicar, y editable encima: el título en su lugar, el
 * logo, la bienvenida y qué se muestra (components/external/TimelineLanding.tsx con `edicion`).
 *
 * La vista sale del MISMO chokepoint que la foto que se publica (GET de la ruta), así que el equipo ve exactamente lo
 * que el cliente va a ver. Guardar no publica: deja el cambio «sin subir» y `onGuardado` le avisa a la pantalla que lo
 * monta (el plan general relee su «Publicar»; el cronograma de un proyecto, su barra de «Subir al cliente»).
 *
 * La usan el plan general (`/api/clients/[id]/plan-general/pagina-del-cliente`) y el cronograma de cada proyecto
 * (`/api/projects/[projectId]/timeline/pagina-del-cliente`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui";
import { SkeletonPanel } from "@/components/ui/Skeleton";
import TimelineLanding from "@/components/external/TimelineLanding";
import type { PaginaDelCliente } from "@/lib/external/pagina-del-cliente";
import type { ExternalTimelineData } from "@/lib/external/timeline-view-types";

interface Vista {
  clientName: string;
  clientLogoUrl: string | null;
  clientLogoScale: number | null;
  timeline: ExternalTimelineData;
}

export default function PaginaDelClienteEnNexus({
  url,
  tituloDeSiempre,
  textoVacio,
  puedeEditar,
  onGuardado,
  recargarCon,
}: {
  /** La ruta de la vista previa (GET) y de guardar (PUT). */
  url: string;
  /** El titular de siempre de esa página: «Plan de trabajo» o «Cronograma de proyecto». */
  tituloDeSiempre?: string;
  textoVacio?: string;
  puedeEditar: boolean;
  /** Después de guardar: la pantalla que lo monta relee su estado de publicación. */
  onGuardado?: () => void;
  /** Cuando cambia, la vista se vuelve a leer (el cronograma terminó de guardar algo: lo que se ve sería viejo). */
  recargarCon?: string | null;
}) {
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<"quieto" | "guardando" | "guardado">("quieto");
  /* Los guardados van EN FILA, uno detrás del otro: dos cambios seguidos (apagar dos cosas en un segundo) mandados a la
     vez podían llegar al servidor al revés y dejar guardado el viejo con la pantalla diciendo «Guardado» (/revisar, 27
     nov). Cada uno manda la página entera, así que el último en llegar es el último que se hizo. */
  const cola = useRef<Promise<void>>(Promise.resolve());
  const pendientes = useRef(0);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo cargar la página del cliente.");
      setVista(data as Vista);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la página del cliente.");
    }
  }, [url]);

  useEffect(() => {
    void cargar();
  }, [cargar, recargarCon]);

  const guardar = (pagina: PaginaDelCliente) => {
    if (!vista) return;
    // Se ve al instante. Si un guardado falla, se relee lo que de verdad quedó guardado.
    setVista({ ...vista, timeline: { ...vista.timeline, pagina } });
    setEstado("guardando");
    pendientes.current++;
    cola.current = cola.current.then(async () => {
      try {
        const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pagina) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "No se pudo guardar.");
        setError(null);
        onGuardado?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
        await cargar();
      } finally {
        if (--pendientes.current === 0) setEstado((s) => (s === "guardando" ? "guardado" : s));
      }
    });
  };

  if (!vista) {
    return error ? (
      <Alert variant="danger">{error}</Alert>
    ) : (
      <SkeletonPanel minH="min-h-[420px]">
        <span className="sr-only">Cargando la página del cliente</span>
      </SkeletonPanel>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-muted" aria-live="polite">
        {estado === "guardando"
          ? "Guardando…"
          : estado === "guardado"
            ? "Guardado. El cliente lo ve cuando publiques."
            : puedeEditar
              ? "Así la verá el cliente al publicar. Escribe el título en su lugar y usa los botones para ocultar lo que no va."
              : "Así la verá el cliente al publicar."}
      </p>
      {error && <Alert variant="danger">{error}</Alert>}
      {/* La página del cliente es de tema claro fijo (hex literal): va en su propia hoja blanca. */}
      <div className="overflow-hidden rounded-xl border border-line" style={{ background: "#ffffff" }}>
        <TimelineLanding
          clientName={vista.clientName}
          clientLogoUrl={vista.clientLogoUrl}
          clientLogoScale={vista.clientLogoScale}
          timeline={vista.timeline}
          titulo={tituloDeSiempre}
          textoVacio={textoVacio}
          edicion={puedeEditar ? { onCambio: guardar } : undefined}
        />
      </div>
    </div>
  );
}
