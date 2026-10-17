"use client";

/**
 * LoQueImportaHoy — «Lo que importa hoy» en el inicio (fase 1.1 de docs/nexus-sistema-de-trabajo-plan.md; diseño «Para
 * ti · Ventas y CSE», ficha D 2026-10-17).
 *
 * Como mucho cinco, una por cuenta, numeradas: el riesgo en rojo, lo que dejó un agente en azul con la chispa, el resto
 * neutro. Lo demás de esa cuenta va plegado («+N en esta cuenta»). Abajo, «También para hoy», «Esta semana» y «Cuando
 * puedas», que se abren ahí mismo.
 */
import { useState } from "react";
import { cn } from "@/lib/cn";
import { IconoDeSugerencia } from "@/components/ui/sistema";
import PendienteDeTiempos from "@/components/tiempos/PendienteDeTiempos";
import { PENDIENTE_DE_TIEMPOS } from "@/lib/tiempos/reglas";
import { MAX_LO_QUE_IMPORTA, pesoDe, PESOS } from "@/lib/para-ti/importa";
import type { ParaTi, Pendiente } from "@/lib/para-ti/tipos";
import { ENLACE_BOTON, EnlaceDelInicio, TARJETA, TITULO } from "./piezas";

export default function LoQueImportaHoy({ medicion }: { medicion: ParaTi }) {
  const [abierta, setAbierta] = useState<"tambien" | "semana" | "luego" | null>(null);
  const listas = [
    { clave: "tambien" as const, nombre: "También para hoy", items: medicion.tambien },
    { clave: "semana" as const, nombre: "Esta semana", items: medicion.semana },
    { clave: "luego" as const, nombre: "Cuando puedas", items: medicion.luego },
  ].filter((l) => l.items.length > 0);
  const lista = listas.find((l) => l.clave === abierta) ?? null;

  return (
    <section className={cn(TARJETA, "flex flex-col gap-3 p-5")} aria-labelledby="importa-t">
      <div className="flex items-baseline gap-2.5">
        <h2 id="importa-t" className={TITULO}>
          Lo que importa hoy
        </h2>
        <span className="text-xs text-fg-muted">{MAX_LO_QUE_IMPORTA} como mucho, una por cuenta</span>
      </div>
      {medicion.importa.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface-muted px-4 py-3 text-[13px] text-fg-muted">
          Nada urgente por hoy. Lo que te toque hacer en Nexus va a aparecer acá, con el botón que lleva a donde se hace.
        </p>
      ) : (
        <ol className="flex flex-col border-t border-line">
          {medicion.importa.map((it, i) => (
            <FilaQueImporta key={it.clave} it={it} numero={i + 1} ultima={i === medicion.importa.length - 1} />
          ))}
        </ol>
      )}
      {listas.length > 0 && (
        <div className="flex flex-wrap gap-4 text-[13px]">
          {listas.map((l) => (
            <button
              key={l.clave}
              type="button"
              aria-expanded={abierta === l.clave}
              onClick={() => setAbierta((v) => (v === l.clave ? null : l.clave))}
              className={cn("font-medium transition-colors hover:text-brand-light", l.clave === "luego" ? "text-fg-muted" : "text-brand", abierta === l.clave && "underline underline-offset-4")}
            >
              {l.nombre} · {l.items.length}
            </button>
          ))}
        </div>
      )}
      {lista && (
        <div className="flex flex-col rounded-lg border border-line">
          {lista.items.map((it) => (
            <FilaDePendiente key={it.clave} it={it} />
          ))}
        </div>
      )}
      {medicion.sinMedir.length > 0 && (
        <p className="text-xs leading-[17px] text-warn-ink">
          No se pudo revisar ahora: {medicion.sinMedir.join(", ").toLowerCase()}. Vuelve a abrir la página en un rato.
        </p>
      )}
    </section>
  );
}

function Marca({ it, numero }: { it: Pendiente; numero: number }) {
  if (it.delAgente) {
    return (
      <span title="Lo dejó un agente para que decidas" className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md border border-info-line bg-info-surface text-brand">
        <IconoDeSugerencia className="h-[13px] w-[13px]" />
      </span>
    );
  }
  const riesgo = it.error || pesoDe(it) >= PESOS.riesgo;
  return (
    <span
      className={cn(
        "flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md border text-[11px] font-semibold",
        riesgo ? "border-danger-line bg-danger-surface text-danger-ink" : "border-line bg-surface-muted text-fg-secondary",
      )}
    >
      {numero}
    </span>
  );
}

function FilaQueImporta({ it, numero, ultima }: { it: Pendiente; numero: number; ultima: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const otros = it.otrosEnLaCuenta ?? [];
  if (it.fuente === PENDIENTE_DE_TIEMPOS) {
    return (
      <li className={cn(!ultima && "border-b border-line")}>
        <PendienteDeTiempos item={it} />
      </li>
    );
  }
  return (
    <li className={cn(!ultima && "border-b border-line")}>
      <div className="flex items-center gap-3.5 px-1 py-3 transition-colors hover:bg-surface-muted">
        <Marca it={it} numero={numero} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-fg-muted">
            {it.meta}
            {otros.length > 0 && (
              <>
                {" · "}
                <button type="button" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)} className="text-brand hover:text-brand-light">
                  {abierto ? "Ocultar" : `+${otros.length} en esta cuenta`}
                </button>
              </>
            )}
          </p>
          <p className={cn("text-sm font-medium leading-5", it.delAgente ? "text-brand" : "text-fg")}>{it.titulo}</p>
          {it.detalle && <p className="line-clamp-2 text-xs leading-[17px] text-fg-muted">{it.detalle}</p>}
          <Enlaces it={it} />
        </div>
        {it.plata && <span className="flex-none text-[13px] tabular-nums text-fg-secondary">{it.plata}</span>}
        <EnlaceDelInicio href={it.href} className={ENLACE_BOTON}>
          {it.accion}
        </EnlaceDelInicio>
      </div>
      {abierto && (
        <div className="mb-2 flex flex-col rounded-lg border border-line bg-surface-muted">
          {otros.map((o) => (
            <FilaDePendiente key={o.clave} it={o} />
          ))}
        </div>
      )}
    </li>
  );
}

/** Cuando un pendiente junta varios lugares (alertas de distintas cuentas): cada uno con su enlace directo. */
function Enlaces({ it }: { it: Pendiente }) {
  if (!it.enlaces?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-4">
      {it.enlaces.map((e) => (
        <EnlaceDelInicio key={e.href} href={e.href} className="text-brand hover:text-brand-light">
          {e.texto}
          {/^https?:\/\//.test(e.href) ? " ↗" : ""}
        </EnlaceDelInicio>
      ))}
    </div>
  );
}

/** Una fila de las listas de abajo y de «+N en esta cuenta». */
export function FilaDePendiente({ it }: { it: Pendiente }) {
  if (it.fuente === PENDIENTE_DE_TIEMPOS) return <PendienteDeTiempos item={it} />;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-3.5 py-2.5 first:border-t-0">
      {it.delAgente ? (
        <span title="Lo dejó un agente para que decidas" className="flex-none text-brand">
          <IconoDeSugerencia className="h-[13px] w-[13px]" />
        </span>
      ) : (
        <span aria-hidden className={cn("h-2 w-2 flex-none rounded-full", it.error ? "bg-destructive" : "bg-warning")} />
      )}
      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
        <span className="text-[13px] font-semibold leading-[19px] text-fg">{it.titulo}</span>
        {it.detalle && <span className="text-xs leading-[17px] text-fg-secondary">{it.detalle}</span>}
        <Enlaces it={it} />
        <span className={cn("text-xs leading-4", it.error ? "text-danger-ink" : it.delAgente ? "text-brand" : "text-fg-muted")}>{it.meta}</span>
      </div>
      {it.plata && <span className="flex-none text-[13px] tabular-nums text-fg-secondary">{it.plata}</span>}
      <EnlaceDelInicio href={it.href} className={ENLACE_BOTON}>
        {it.accion}
      </EnlaceDelInicio>
    </div>
  );
}
