"use client";

/**
 * components/finanzas/equilibrio/ParaDecidir.tsx — «Para decidir en la reunión» (rediseño del punto de equilibrio,
 * 2026-10-05): lo que mueve los números y no se arregla registrando, cada cosa con quién la decide (CEO, CFO, RevOps).
 * La agenda la arma lib/finanzas/agenda-equilibrio.ts; acá solo se muestra y se filtra por rol.
 *
 * Como la lista de inconsistencias: nada se marca a mano. Un punto sale de acá cuando el dato se corrige o cuando se
 * decide.
 */
import Link from "next/link";
import { useState } from "react";
import { fmtMontoLibro } from "@/lib/cobranza/montos";
import { ROLES, type PuntoDeAgenda, type Rol } from "@/lib/finanzas/agenda-equilibrio";
import { Segmentado } from "@/components/ui";

const BOTON = "shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-fg-secondary hover:bg-surface-hover";

export default function ParaDecidir({
  agenda,
  moneda,
  onAbrirLinea,
  onDecidirAliados,
}: {
  agenda: PuntoDeAgenda[];
  moneda: string;
  onAbrirLinea: (codigo: string) => void;
  onDecidirAliados: () => void;
}) {
  const [rol, setRol] = useState<"todo" | Rol>("todo");
  const visibles = rol === "todo" ? agenda : agenda.filter((p) => p.rol === rol);
  const cuenta = (r: Rol) => agenda.filter((p) => p.rol === r).length;

  return (
    <section data-recorrido="fin.equilibrio.inconsistencias" aria-label="Para decidir" className="flex flex-col rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-5 pb-3 pt-4">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-0.5">
          <h2 className="text-lg font-semibold text-fg">Para decidir en la reunión</h2>
          <span className="text-xs text-fg-muted">Lo que mueve estos números y no se arregla registrando: lo decide alguien.</span>
        </div>
        <Segmentado
          etiqueta="Quién decide"
          valor={rol}
          onCambio={setRol}
          opciones={[{ clave: "todo" as const, etiqueta: `Todo · ${agenda.length}` }, ...ROLES.map((r) => ({ clave: r, etiqueta: `${r} · ${cuenta(r)}` }))]}
        />
      </div>
      {visibles.length === 0 ? (
        <p className="border-t border-line px-5 py-4 text-[13px] text-fg-muted">
          {agenda.length === 0 ? "Nada que decidir: los números no tienen preguntas abiertas." : "Nada para este rol."}
        </p>
      ) : (
        visibles.map((p) => (
          <div key={p.clave} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-line px-5 py-3">
            <span className="min-w-[58px] shrink-0 rounded-full border border-line bg-surface px-2.5 py-0.5 text-center text-xs font-semibold text-fg-secondary">
              {p.rol}
            </span>
            <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-0.5">
              <span className="text-[14.5px] font-semibold leading-[21px] text-fg">{p.pregunta}</span>
              <span className="text-[13px] leading-[19px] text-fg-secondary">{p.detalle}</span>
            </div>
            {p.monto !== null && <span className="shrink-0 text-[13px] tabular-nums text-fg-secondary">{fmtMontoLibro(Math.round(p.monto), moneda)}</span>}
            {p.accion.tipo === "decidir-aliados" ? (
              <button type="button" onClick={onDecidirAliados} className={BOTON}>
                Decidirlo
              </button>
            ) : p.accion.tipo === "linea" ? (
              <button type="button" onClick={() => onAbrirLinea((p.accion as { codigo: string }).codigo)} className={BOTON}>
                Ver el detalle
              </button>
            ) : (
              <Link href={p.accion.href} className={BOTON}>
                {p.accion.etiqueta}
              </Link>
            )}
          </div>
        ))
      )}
    </section>
  );
}
