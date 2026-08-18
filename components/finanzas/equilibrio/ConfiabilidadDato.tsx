"use client";

/**
 * components/finanzas/equilibrio/ConfiabilidadDato.tsx
 *
 * Qué hay que saber antes de usar estos números para decidir.
 *
 * La sección NO se esconde cuando no hay avisos: "no hay hallazgos abiertos" es
 * información, y su ausencia se leería como que nadie miró.
 */
import type { AvisoCalidad, ReporteEquilibrio } from "@/lib/finanzas/equilibrio";
import { etiquetaMes } from "@/components/cobranza/format";

const SEVERIDAD: Record<AvisoCalidad["severidad"], { label: string; cls: string }> = {
  ALTA: { label: "Alto", cls: "text-red-600 bg-red-500/10 border-red-500/30" },
  MEDIA: { label: "Medio", cls: "text-warn-ink bg-warn-surface border-warn-line" },
  BAJA: { label: "Nota", cls: "text-fg-muted bg-surface-muted border-line" },
};

export default function ConfiabilidadDato({
  calidad,
  imputacion,
}: {
  calidad: ReporteEquilibrio["calidad"];
  imputacion?: { cobradosSinFechaDeCobro: number; cobradosTotales: number };
}) {
  // El aviso de imputación se arma acá y no en el módulo puro porque depende de CÓMO
  // se leyó la base, no del cálculo: es una propiedad del loader.
  const avisoImputacion =
    imputacion && imputacion.cobradosSinFechaDeCobro > 0
      ? {
          codigo: "IMPUTACION" as const,
          severidad:
            imputacion.cobradosSinFechaDeCobro / Math.max(1, imputacion.cobradosTotales) > 0.15
              ? ("ALTA" as const)
              : ("MEDIA" as const),
          mensaje: `${imputacion.cobradosSinFechaDeCobro} de ${imputacion.cobradosTotales} cobros marcados como cobrados no tienen fecha de cobro: se imputaron por su mes de facturación. En esa proporción, la línea «cobrado» no es estrictamente una curva de caja.`,
          periodos: [] as string[],
          conceptos: [] as string[],
        }
      : null;

  const avisos = [...(avisoImputacion ? [avisoImputacion] : []), ...calidad.avisos];

  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden">
      <div className="px-4 py-2.5 bg-surface-muted border-b border-line">
        <h3 className="text-sm font-medium text-fg">Confiabilidad del dato</h3>
        <p className="text-[11px] text-fg-muted mt-0.5">
          {calidad.mesesCompletos} de 12 meses con el egreso completo · {calidad.mesesParciales} parciales.
        </p>
      </div>
      <div className="divide-y divide-line">
        {avisos.length === 0 ? (
          <p className="px-4 py-3 text-xs text-fg-muted">
            Sin hallazgos abiertos en el dato de este año.
          </p>
        ) : (
          avisos.map((a, i) => {
            const sev = SEVERIDAD[a.severidad];
            return (
              <div key={`${a.codigo}-${i}`} className="px-4 py-3">
                <div className="flex items-start gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${sev.cls}`}>
                    {sev.label}
                  </span>
                  <p className="text-xs text-fg-secondary leading-relaxed">{a.mensaje}</p>
                </div>
                {a.periodos.length > 0 && (
                  <p className="text-[11px] text-fg-muted mt-1.5 ml-11">
                    {a.periodos.slice(0, 6).map(etiquetaMes).join(" · ")}
                    {a.periodos.length > 6 ? ` y ${a.periodos.length - 6} más` : ""}
                  </p>
                )}
                {a.conceptos.length > 0 && (
                  <p className="text-[11px] text-fg-muted mt-1 ml-11">{a.conceptos.join(" · ")}</p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
