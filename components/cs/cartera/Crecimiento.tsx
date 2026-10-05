"use client";

/**
 * «Crecimiento» — las señales de ingresos que HubSpot ya calcula (con su explicación y cómo
 * plantearlo) y los hubs que el cliente no tiene cuando usa bien otro. HubSpot no estima cuánto
 * valdría cada oportunidad: se muestra lo que la cuenta paga hoy, nunca un monto inventado.
 */
import { useState } from "react";
import Link from "next/link";
import { EmptyState, Segmentado } from "@/components/ui";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { fmtMonto } from "@/lib/cs/formato";
import type { Oportunidad } from "@/lib/cs/cartera-reglas";
import { Chip } from "../piezas";

type Filtro = "todas" | "senal" | "hubQueNoTiene";

export default function Crecimiento({ oportunidades }: { oportunidades: Oportunidad[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [abierta, setAbierta] = useState<string | null>(null);
  const visibles = oportunidades.filter((o) => filtro === "todas" || o.tipo === filtro);

  if (oportunidades.length === 0) {
    return <EmptyState title="Sin señales de crecimiento" description="HubSpot no marcó ninguna oportunidad y ninguna cuenta usa bien un hub sin tener otro de los principales." />;
  }

  return (
    <div className="space-y-3">
      <Segmentado<Filtro>
        etiqueta="Filtrar las oportunidades"
        valor={filtro}
        onCambio={setFiltro}
        opciones={[
          { clave: "todas", etiqueta: "Todas", cuenta: oportunidades.length },
          { clave: "senal", etiqueta: "Señales de HubSpot", cuenta: oportunidades.filter((o) => o.tipo === "senal").length },
          { clave: "hubQueNoTiene", etiqueta: "Hubs que no tienen", cuenta: oportunidades.filter((o) => o.tipo === "hubQueNoTiene").length },
        ]}
      />
      <div className="flex flex-col gap-2">
        {visibles.map((o) => {
          const clave = `${o.clientId}-${o.titulo}`;
          return (
            <div key={clave} className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-4 py-3.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-fg">{o.nombre}</span>
                    <Chip>{o.rotulo}</Chip>
                    {o.paga !== null && <span className="text-xs text-fg-muted">paga {fmtMonto(o.paga)} al mes</span>}
                  </div>
                  <span className="text-sm text-fg">{o.titulo}</span>
                  {o.detalle && <span className="text-xs text-fg-muted">{o.detalle}</span>}
                  {o.comoPlantearlo && (
                    <button
                      type="button"
                      onClick={() => setAbierta(abierta === clave ? null : clave)}
                      className="self-start text-xs font-medium text-brand hover:text-brand-light"
                      aria-expanded={abierta === clave}
                    >
                      {abierta === clave ? "Ocultar cómo plantearlo" : "Cómo plantearlo, según HubSpot"}
                    </button>
                  )}
                </div>
                <Link
                  href={`/customer-success/${o.clientId}`}
                  className="whitespace-nowrap rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
                >
                  Abrir la cuenta
                </Link>
              </div>
              {abierta === clave && o.comoPlantearlo && (
                <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface-muted px-3 py-2.5">
                  <span className={ROTULO_DEL_SISTEMA}>Cómo plantearlo, según HubSpot</span>
                  <span className="text-[13px] text-fg-secondary">{o.comoPlantearlo}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-fg-muted">HubSpot no dice cuánto valdría cada oportunidad: se muestra lo que la cuenta paga hoy.</p>
    </div>
  );
}
