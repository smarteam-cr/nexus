"use client";

/**
 * AvisosDeLaReunion — lo que conviene saber de una reunión antes de usar lo que dejó (ficha G, 2026-10-17): el estado
 * de la reunión (esperando la transcripción, sin cliente, sin proyecto…) y los avisos de «Para ti» que llevan acá. Cada
 * uno dice qué hacer. Las reglas: lib/seguimiento/reunion/avisos.ts.
 */
import Link from "next/link";
import { cn } from "@/lib/cn";
import { BotonEnlace } from "@/components/ui/sistema";
import { BotonAgregarReunion } from "@/components/sessions/AgregarReunion";
import { diaCortoCR } from "@/lib/seguimiento/reunion/agenda";
import type { AvisoDeLaReunion } from "@/lib/seguimiento/reunion/avisos";

export function AvisosDeLaReunion({
  avisos,
  cliente,
  onAbrirMeta,
}: {
  avisos: AvisoDeLaReunion[];
  cliente: { id: string; nombre: string } | null;
  onAbrirMeta: () => void;
}) {
  if (avisos.length === 0) return null;
  return (
    <section aria-label="Avisos de la reunión" className="space-y-2">
      <h2 className="text-sm font-semibold text-fg">Avisos</h2>
      <ul className="space-y-1.5">
        {avisos.map((a) => (
          <li
            key={a.clave}
            className={cn(
              "flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-lg border px-3.5 py-2.5 text-[13px] leading-[19px]",
              a.tono === "atencion" ? "border-warn-line bg-warn-surface text-warn-ink" : "border-line bg-surface-muted text-fg-secondary",
            )}
          >
            <p className="min-w-0 flex-1">
              {a.texto}
              {a.llego && (
                <span className="ml-1 text-xs opacity-80">
                  · te llegó el {diaCortoCR(a.llego.en)}
                  {a.llego.leido ? "" : " · sin leer"}
                </span>
              )}
            </p>
            {a.accion?.tipo === "enlace" && (
              <Link href={a.accion.href} className="flex-shrink-0 text-xs font-semibold text-brand hover:text-brand-light">
                {a.accion.texto}
              </Link>
            )}
            {a.accion?.tipo === "meta" && <BotonEnlace onClick={onAbrirMeta}>{a.accion.texto}</BotonEnlace>}
            {a.accion?.tipo === "agregar-reunion" && cliente && (
              <BotonAgregarReunion clienteFijo={cliente} etiqueta={a.accion.texto} className="flex-shrink-0" />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
