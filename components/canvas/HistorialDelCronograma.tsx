"use client";

/**
 * components/canvas/HistorialDelCronograma.tsx — el historial de versiones del cronograma (21 nov), con el popup común.
 * Las versiones son las fotos que ya guardaba (cada cambio con motivo y cada publicación). Por ahora solo se miran:
 * «Usar esta versión» tiene que llegar como propuesta a la barra del Gantt sin tocar el avance, y es un paso aparte.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Skeleton } from "@/components/ui";
import { BOTON_DE_HERRAMIENTA } from "@/components/ui/sistema";
import HistorialDeVersiones, { type VersionParaElPopup } from "@/components/versiones/HistorialDeVersiones";
import { fetchJson } from "@/lib/api/fetch-json";
import type { CronogramaDeLaVersion, FaseDeLaVersion } from "@/lib/timeline/historial-del-cronograma";
import { jsonCanonico } from "@/lib/versiones/historial";

const FECHA = new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function VistaDelCronograma({ c, actual }: { c: CronogramaDeLaVersion; actual: CronogramaDeLaVersion | null }) {
  const porNombre = new Map((actual?.fases ?? []).map((f) => [f.nombre, f]));
  const distinta = (f: FaseDeLaVersion) => !!actual && jsonCanonico(f) !== jsonCanonico(porNombre.get(f.nombre) ?? null);
  const nDistintas = actual ? c.fases.filter(distinta).length : 0;
  const semanasTotales = c.fases.reduce((s, f) => s + f.semanas, 0);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-fg-muted">
        {c.arranque ? `Arranque: ${FECHA.format(new Date(`${c.arranque}T00:00:00Z`))}` : "Sin fecha de arranque"} · {c.fases.length} fases · {semanasTotales} semanas
        {actual && (c.arranque !== actual.arranque ? " · la fecha de arranque es otra" : "")}
        {actual ? (nDistintas ? ` · cambian ${nDistintas} de ${c.fases.length} fases frente a la actual` : " · las fases son iguales a la actual") : ""}
      </p>
      {c.fases.map((f, i) => {
        const d = distinta(f);
        return (
          <div key={`${i}-${f.nombre}`} className={`flex flex-col gap-1.5 rounded-[14px] border px-3.5 py-3 ${d ? "border-warn-line bg-warn-surface" : "border-line bg-surface"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-fg">{f.nombre || "(sin nombre)"}</span>
              <span className="text-xs text-fg-muted">
                {f.semanas} {f.semanas === 1 ? "semana" : "semanas"}
                {f.sesiones ? ` · ${f.sesiones} sesiones` : ""}
                {f.inicio !== null ? ` · arranca en la semana ${f.inicio + 1}` : ""}
              </span>
              {d && <span className="text-[11px] font-semibold text-warn-ink">{porNombre.has(f.nombre) ? "Distinta a la actual" : "No está en la actual"}</span>}
            </div>
            {f.tareas.length > 0 && (
              <ul className="flex flex-col gap-0.5 pl-1 text-[13px] leading-[19px] text-fg-secondary">
                {f.tareas.map((t, j) => (
                  <li key={j}>
                    <span className="text-fg-muted">Semana {t.semana + 1} · </span>
                    {t.titulo}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function VistaDeUnaVersion({ projectId, versionId, actual, cache }: { projectId: string; versionId: string; actual: CronogramaDeLaVersion | null; cache: Map<string, CronogramaDeLaVersion> }) {
  const [estado, setEstado] = useState<{ id: string; error: string | null } | null>(null);
  useEffect(() => {
    if (cache.has(versionId)) return;
    let vivo = true;
    fetchJson<{ cronograma: CronogramaDeLaVersion }>(`/api/projects/${projectId}/timeline/versiones/${encodeURIComponent(versionId)}`)
      .then((j) => {
        cache.set(versionId, j.cronograma);
        if (vivo) setEstado({ id: versionId, error: null });
      })
      .catch((e: unknown) => vivo && setEstado({ id: versionId, error: e instanceof Error ? e.message : "No se pudo abrir esta versión." }));
    return () => {
      vivo = false;
    };
  }, [projectId, versionId, cache]);
  const c = cache.get(versionId);
  if (c) return <VistaDelCronograma c={c} actual={actual} />;
  if (estado?.id === versionId && estado.error)
    return (
      <Alert variant="danger" title="No se pudo abrir esta versión">
        {estado.error}
      </Alert>
    );
  return <Skeleton className="h-[480px] w-full" rounded="lg" />;
}

export default function HistorialDelCronograma({ projectId }: { projectId: string }) {
  const [abierto, setAbierto] = useState(false);
  const actual = useRef<CronogramaDeLaVersion | null>(null);
  const [cache] = useState(() => new Map<string, CronogramaDeLaVersion>());
  const cargar = useCallback(async (): Promise<VersionParaElPopup[]> => {
    const j = await fetchJson<{ versiones: VersionParaElPopup[]; actual: CronogramaDeLaVersion | null }>(`/api/projects/${projectId}/timeline/versiones`);
    actual.current = j.actual;
    return j.versiones;
  }, [projectId]);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Las versiones del cronograma: cuál es la actual y cuál ve el cliente"
        className={BOTON_DE_HERRAMIENTA}
      >
        <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8M3 3v5h5M12 7v5l3 2" />
        </svg>
        Historial
      </button>
      <HistorialDeVersiones
        open={abierto}
        onClose={() => setAbierto(false)}
        documento="Cronograma"
        cargar={cargar}
        alCambiar={() => {}}
        porQueNoSeUsa="En el cronograma, por ahora las versiones solo se miran. Volver a una todavía no está: va a llegar como propuesta a la barra del Gantt, sin tocar el avance."
        vista={(v) =>
          v.esActual || !v.id ? (
            actual.current ? <VistaDelCronograma c={actual.current} actual={null} /> : <p className="text-sm text-fg-muted">El cronograma todavía no tiene fases.</p>
          ) : (
            <VistaDeUnaVersion projectId={projectId} versionId={v.id} actual={actual.current} cache={cache} />
          )
        }
      />
    </>
  );
}
