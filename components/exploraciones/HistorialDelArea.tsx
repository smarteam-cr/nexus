"use client";

/**
 * components/exploraciones/HistorialDelArea.tsx — el historial de versiones de la página de un área de La escala (23 nov),
 * con el popup común (components/versiones/HistorialDeVersiones.tsx). Guarda lo que escribe el equipo en esa página: la
 * descripción de «Resultado general», lo que dice la tarjeta de cada parte y los textos (lib/exploraciones/versiones-del-area.ts).
 * La vista previa es la lista de esos textos; «Usar esta versión» los vuelve a poner y nunca publica.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Skeleton } from "@/components/ui";
import HistorialDeVersiones, { type VersionParaElPopup } from "@/components/versiones/HistorialDeVersiones";

type Linea = { que: string; texto: string };

function Lineas({ lineas }: { lineas: Linea[] }) {
  if (!lineas.length) return <p className="text-sm text-fg-muted">En esta versión nadie había escrito nada en la página: todo es el texto de la escala.</p>;
  return (
    <dl className="flex flex-col gap-3">
      {lineas.map((l, i) => (
        <div key={`${l.que}-${i}`}>
          <dt className="text-xs text-fg-muted">{l.que}</dt>
          <dd className="whitespace-pre-line text-sm text-fg">{l.texto}</dd>
        </div>
      ))}
    </dl>
  );
}

function VistaDeUnaVersion({ base, versionId }: { base: string; versionId: string }) {
  const [estado, setEstado] = useState<{ id: string; lineas: Linea[] | null; error: string | null } | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${base}/${versionId}`, { cache: "no-store", signal: ctrl.signal })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as { lineas?: Linea[]; error?: string };
        if (!r.ok || !data.lineas) throw new Error(data.error ?? "No se pudo leer esa versión.");
        setEstado({ id: versionId, lineas: data.lineas, error: null });
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setEstado({ id: versionId, lineas: null, error: e instanceof Error ? e.message : "No se pudo leer esa versión." });
      });
    return () => ctrl.abort();
  }, [base, versionId]);
  if (estado?.id !== versionId) return <Skeleton className="h-10 w-full" rounded="lg" />;
  if (estado.error || !estado.lineas)
    return (
      <Alert variant="danger" title="No se pudo leer esa versión">
        {estado.error}
      </Alert>
    );
  return <Lineas lineas={estado.lineas} />;
}

export default function HistorialDelArea({
  open,
  onClose,
  exploracionId,
  areaId,
  areaNombre,
  empresa,
  puedeEditar,
  alCambiar,
}: {
  open: boolean;
  onClose: () => void;
  exploracionId: string;
  areaId: string;
  areaNombre: string;
  empresa: string;
  puedeEditar: boolean;
  alCambiar: () => void;
}) {
  const firma = useRef<string | null>(null);
  const base = `/api/sales/exploraciones/${exploracionId}/escala/areas/${encodeURIComponent(areaId)}/versiones`;

  const cargar = useCallback(async (): Promise<VersionParaElPopup[]> => {
    const r = await fetch(base, { cache: "no-store" });
    const data = (await r.json().catch(() => ({}))) as { versiones?: VersionParaElPopup[]; firma?: string; error?: string };
    if (!r.ok || !data.versiones) throw new Error(data.error ?? "No se pudo cargar el historial.");
    firma.current = data.firma ?? null;
    return data.versiones;
  }, [base]);

  const usar = async (versionId: string): Promise<string | null> => {
    const r = await fetch(`${base}/${versionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firma: firma.current }),
    }).catch(() => null);
    const data = ((await r?.json().catch(() => ({}))) ?? {}) as { error?: string };
    if (!r?.ok) {
      alCambiar();
      return data.error ?? "No se pudo usar esa versión.";
    }
    return null;
  };

  return (
    <HistorialDeVersiones
      open={open}
      onClose={onClose}
      documento={`Página de ${areaNombre} · La escala de ${empresa}`}
      cargar={cargar}
      usar={puedeEditar ? usar : undefined}
      alCambiar={alCambiar}
      vista={(v: VersionParaElPopup) =>
        v.esActual || !v.id ? <p className="text-sm text-fg-muted">Es lo que ves ahora en la página de {areaNombre}.</p> : <VistaDeUnaVersion base={base} versionId={v.id} />
      }
    />
  );
}
