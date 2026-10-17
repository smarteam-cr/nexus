"use client";

/**
 * TareasDeLaReunion — las tareas que dejó la reunión, con su responsable (ficha G, 2026-10-17). Son las de Tareas que
 * ve quien mira (nunca lo privado de otros), por `compromisosDeLaReunion`. Tus tareas propuestas no van acá: se deciden
 * arriba, en «Lo que dejó esta reunión». Cada una abre en Tareas.
 */
import Link from "next/link";
import { cn } from "@/lib/cn";
import { diaCortoCR } from "@/lib/seguimiento/reunion/agenda";
import type { CompromisoEnTarjeta } from "@/lib/seguimiento/tarjeta";

/** «22 oct» de un día AAAA-MM-DD (al mediodía, para que la zona no lo corra de día). */
const dia = (d: string) => diaCortoCR(`${d}T18:00:00.000Z`);

export function TareasDeLaReunion({ tareas, tuyasPorDecidir }: { tareas: CompromisoEnTarjeta[]; tuyasPorDecidir: number }) {
  const abiertas = tareas.filter((t) => !t.hecho).length;
  return (
    <section aria-label="Tareas de la reunión" className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="border-b border-line px-[18px] py-3.5">
        <h2 className="text-sm font-semibold text-fg">
          Tareas de esta reunión{tareas.length > 0 && <span className="font-normal text-fg-muted"> · {abiertas} abiertas de {tareas.length}</span>}
        </h2>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">Lo que quedó en Tareas, con quién lo lleva. Cada persona decide las suyas.</p>
      </header>
      {tareas.length === 0 ? (
        <p className="px-[18px] py-4 text-[13px] text-fg-muted">No dejó tareas que puedas ver.</p>
      ) : (
        <ul className="divide-y divide-line">
          {tareas.map((t) => (
            <li key={t.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-[18px] py-2.5">
              <span aria-hidden className={cn("h-2 w-2 flex-shrink-0 translate-y-[-1px] rounded-full", t.hecho ? "bg-success-ink" : "border border-fg-muted bg-surface")} />
              <Link
                href={`/tareas?t=${encodeURIComponent(t.id)}`}
                className={cn("min-w-0 flex-1 text-[13px] text-fg hover:text-brand", t.hecho && "text-fg-muted line-through")}
              >
                {t.texto}
              </Link>
              <span className="text-xs text-fg-secondary">{t.responsable ?? "Por asignar"}</span>
              {t.lado && <span className="text-xs text-fg-muted">{t.lado === "CLIENTE" ? "lo prometió el cliente" : "de Smarteam"}</span>}
              {t.vence && !t.hecho && <span className="text-xs text-fg-muted">vence el {dia(t.vence)}</span>}
              {t.hecho && <span className="text-xs text-fg-muted">hecha</span>}
            </li>
          ))}
        </ul>
      )}
      {tuyasPorDecidir > 0 && (
        <p className="border-t border-line bg-surface-muted px-[18px] py-2.5 text-xs text-fg-secondary">
          {tuyasPorDecidir === 1 ? "Tu tarea propuesta se decide" : `Tus ${tuyasPorDecidir} tareas propuestas se deciden`} arriba, en «Lo que dejó esta reunión».
        </p>
      )}
    </section>
  );
}
