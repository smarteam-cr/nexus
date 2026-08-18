"use client";

/**
 * components/finanzas/equilibrio/EstructuraCostos.tsx
 *
 * De qué se compone el piso mensual: una barra por rubro con su peso.
 *
 * ⚠ Los montos son AGREGADOS por rubro ("planilla: $21.004"), nunca por persona. Si
 * algún día esto se abre a nivel individual, pasa a ser información salarial y hay que
 * meterle la máscara de `fmtMontoVisible` como en CostosPanel.
 *
 * La calidad de cada rubro se muestra al lado: la reserva de aguinaldo es un DEVENGO
 * (nadie apartó esa plata) y decirlo al lado del número evita que se lea como gasto.
 */
import { fmtMonto } from "@/components/cobranza/format";
import { etiquetaRubro, type ReporteEquilibrio } from "@/lib/finanzas/equilibrio";

const CALIDAD_LABEL: Record<string, string> = {
  MEDIDO: "medido",
  PLANIFICADO: "de plan",
  ESTIMADO: "estimado",
  MIXTO: "mixto",
};

export default function EstructuraCostos({
  estructura,
  moneda,
}: {
  estructura: ReporteEquilibrio["estructura"];
  moneda: string;
}) {
  const conDatos = estructura.filter((e) => e.montoAnual > 0);
  const maximo = Math.max(...conDatos.map((e) => e.montoMensualPromedio), 1);

  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden">
      <div className="px-4 py-2.5 bg-surface-muted border-b border-line">
        <h3 className="text-sm font-medium text-fg">Estructura de costos</h3>
        <p className="text-[11px] text-fg-muted mt-0.5">
          Qué rubros explican el costo mensual. Cifras estimadas — referencia para dirección, no
          contabilidad.
        </p>
      </div>
      <div className="p-4 space-y-3">
        {conDatos.length === 0 ? (
          <p className="text-xs text-fg-muted">Todavía no hay egresos cargados en el año.</p>
        ) : (
          conDatos.map((e) => (
            <div key={e.rubro}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-xs text-fg capitalize">
                  {etiquetaRubro(e.rubro)}
                  {e.calidad !== "MEDIDO" && (
                    <span className="ml-1.5 text-[10px] text-fg-muted">({CALIDAD_LABEL[e.calidad]})</span>
                  )}
                </span>
                <span className="text-xs tabular-nums text-fg-secondary whitespace-nowrap">
                  {fmtMonto(e.montoMensualPromedio, moneda)}
                  <span className="text-fg-muted"> · {e.pctDelTotal}%</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${Math.max(2, (e.montoMensualPromedio / maximo) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
        {estructura.some((e) => e.montoAnual === 0) && (
          <p className="text-[11px] text-fg-muted pt-1">
            Sin datos este año:{" "}
            {estructura
              .filter((e) => e.montoAnual === 0)
              .map((e) => etiquetaRubro(e.rubro))
              .join(", ")}
            .
          </p>
        )}
      </div>
    </div>
  );
}
