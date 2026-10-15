"use client";

/**
 * Feedback › Encuestas › Automáticas › «¿Cuándo lo presentas?» (2026-10-14): las últimas respuestas de Customer
 * Success sobre cuándo se presenta cada documento, con quién respondió, y la exportación con TODAS las filas (también
 * las fechas que leyó Nexus y los «Ahora no»). Datos: GET /api/presentaciones. Reglas: lib/presentaciones/reglas.ts.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SkeletonPanel, SkeletonText } from "@/components/ui/Skeleton";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { urlDeProyecto } from "@/lib/agents/run-url";
import { fechaEnPalabras } from "@/lib/canvas/presentacion-del-diagnostico";
import { MOTIVO_EN_PALABRAS, nombreDelDocumento, PIEZA_DEL_DOCUMENTO, type MotivoParaResponder } from "@/lib/presentaciones/reglas";
import type { FilaDeLaLista } from "@/lib/presentaciones/servidor";

const EXPORTAR = "/api/presentaciones/exportar";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «9 oct, 14:05», en la hora de Costa Rica (UTC-6), armada a mano: así servidor y navegador dicen lo mismo. */
function momento(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 6 * 3_600_000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}, ${hh}:${mm}`;
}

function respuestaEnPalabras(f: FilaDeLaLista): string {
  const dia = f.fecha ? fechaEnPalabras(f.fecha) : "";
  switch (f.evento) {
    case "fecha":
      return `Se presenta el ${dia}`;
    case "sin-fecha":
      return "Todavía no sabe";
    case "presentado":
      return `Se presentó el ${dia}`;
    case "listo":
      return `Está listo para el ${dia}`;
    case "descarte":
      return `Descartó la fecha que leyó Nexus (${dia})`;
    case "propuesta":
      return `Nexus leyó el ${dia} en una reunión`;
    default:
      return f.evento;
  }
}

export default function PresentacionesDeFeedback() {
  const [filas, setFilas] = useState<FilaDeLaLista[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/presentaciones", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error ?? "No se pudieron cargar las fechas de presentación.");
        return j.respuestas as FilaDeLaLista[];
      })
      .then((f) => vivo && setFilas(f))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudieron cargar las fechas de presentación."));
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <section aria-label="¿Cuándo lo presentas?" className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold text-fg">¿Cuándo lo presentas?</h2>
            <span className="rounded-full border border-success-line bg-success-surface px-2 py-px text-[11px] font-semibold text-success-ink">Activa</span>
          </div>
          <p className="text-[13px] text-fg-muted">
            Cuando el kickoff, el diagnóstico, la planificación o la entrega ya están generados, se le pregunta a Customer Success
            cuándo se le presenta al cliente: al encargado del proyecto y a quien generó el documento (o a la CSL, si no hay nadie
            de Customer Success). Dirección ve las respuestas, pero no responde.
          </p>
          <p className="text-xs text-fg-muted">
            Con «Ya lo presenté» sale también «¿cuánto te tomó?», si el momento «Al publicar o presentar un documento» está activo.
          </p>
        </div>
        {/* Una descarga, no una página: va con <a download> (el CSV lo arma la ruta). */}
        <a
          href={EXPORTAR}
          download
          className="rounded-lg border border-line bg-surface px-3 py-[7px] text-[13px] font-semibold text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
        >
          Descargar CSV
        </a>
      </div>

      {error ? (
        <Alert variant="warning">{error}</Alert>
      ) : !filas ? (
        <SkeletonPanel minH="min-h-[160px]">
          <SkeletonText lines={4} />
        </SkeletonPanel>
      ) : filas.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Todavía nadie respondió. Las respuestas aparecen acá, con quién las dio.</p>
      ) : (
        <div className="space-y-2">
          <p className={ROTULO_DEL_SISTEMA}>Las últimas {filas.length}</p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {filas.map((f) => {
              const href = f.projectId && f.clientId ? `${urlDeProyecto(f.clientId, f.projectId)}&canvas=${PIEZA_DEL_DOCUMENTO[f.documento]}` : null;
              const doc = `${nombreDelDocumento(f.documento)} · ${f.empresa ? `${f.empresa} · ` : ""}${f.proyecto}`;
              return (
                <li key={f.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-[13px]">
                  <span className="w-[92px] flex-none text-xs tabular-nums text-fg-muted">{momento(f.createdAt)}</span>
                  <span className="min-w-[180px] flex-1">
                    <span className="font-semibold text-fg">{respuestaEnPalabras(f)}</span>
                    <span className="block text-xs text-fg-muted">
                      {href ? (
                        <Link href={href} className="hover:text-brand">
                          {doc}
                        </Link>
                      ) : (
                        doc
                      )}
                    </span>
                  </span>
                  <span className="text-xs text-fg-secondary">
                    {f.nombre ?? "Nexus"}
                    {f.rol ? ` · ${f.rol}` : ""}
                    {f.motivo && f.motivo in MOTIVO_EN_PALABRAS ? ` · ${MOTIVO_EN_PALABRAS[f.motivo as MotivoParaResponder]}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
