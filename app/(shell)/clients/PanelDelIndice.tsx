"use client";

/**
 * PanelDelIndice — la columna derecha del índice de clientes (rediseño del 2026-10-04, sistema
 * «Nexus · interfaz interna», como la bandeja del listado de la preventa):
 *
 *  · «Qué sigue»: el aviso más importante dicho como una frase (`queSigueDelIndice`).
 *  · «Necesitan atención»: las propuestas de cronograma sin decidir, las altas a medio hacer y las
 *    reuniones que asignó la IA sin revisar — lo que hasta acá solo se veía entrando a cada ficha.
 *  · «Falta traer de HubSpot»: la bandeja que reemplaza al botón con modal.
 *
 * Presentacional: los avisos los arma el servidor (ClientsTable.tsx) con las reglas de la ficha.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { queSigueDelIndice, type AvisoDeCartera } from "@/lib/clients/indice";
import { IconoDeSugerencia, QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";

function TarjetaDeAviso({ aviso }: { aviso: AvisoDeCartera }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold text-fg">{aviso.empresa}</span>
        <span className="truncate text-xs text-fg-muted">{aviso.proyecto}</span>
      </div>
      <p className="text-[13px] leading-[1.45] text-fg-secondary">{aviso.detalle}</p>
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 whitespace-nowrap rounded-full border py-px text-[11px] font-semibold",
            aviso.delAgente
              ? "border-info-line bg-info-surface pl-1.5 pr-2 text-brand"
              : "border-warn-line bg-warn-surface px-2 text-warn-ink",
          )}
        >
          {aviso.delAgente && <IconoDeSugerencia className="h-[13px] w-[13px]" />}
          {aviso.chip}
        </span>
        <Link
          href={aviso.href}
          className="flex-shrink-0 rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
        >
          {aviso.accion}
        </Link>
      </div>
    </div>
  );
}

export default function PanelDelIndice({
  avisos,
  alcance,
  bandeja,
}: {
  avisos: AvisoDeCartera[];
  alcance: "tuyas" | "cartera";
  /** La bandeja de HubSpot con su cabecera, ya envuelta en su propio <Suspense> por el servidor. */
  bandeja: ReactNode;
}) {
  const sigue = queSigueDelIndice(avisos, alcance);
  return (
    <div className="flex flex-col gap-4">
      <QueSigue
        accion={
          sigue.href && sigue.enlace ? (
            <Link href={sigue.href} className="text-[13px] font-semibold text-brand hover:text-brand-light">
              {sigue.enlace}
            </Link>
          ) : undefined
        }
      >
        {sigue.texto}
      </QueSigue>

      {avisos.length > 0 && (
        <section data-recorrido="clientes.atencion" className="flex flex-col gap-2">
          <div className="space-y-1">
            <p className={ROTULO_DEL_SISTEMA}>Necesitan atención · {avisos.length}</p>
            <p className="text-xs text-fg-muted">
              {alcance === "tuyas" ? "De tus cuentas" : "De la cartera"}: lo que hoy solo se ve entrando a cada ficha.
            </p>
          </div>
          {avisos.map((a) => (
            <TarjetaDeAviso key={`${a.tipo}-${a.projectId}`} aviso={a} />
          ))}
        </section>
      )}

      {/* La bandeja trae su propia cabecera: la cuenta y el denominador los sabe ella. */}
      <div className="mt-2">{bandeja}</div>
    </div>
  );
}
