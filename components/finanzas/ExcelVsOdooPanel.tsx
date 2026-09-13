/**
 * components/finanzas/ExcelVsOdooPanel.tsx
 *
 * El cuerpo de /finanzas/excel-vs-odoo. Se lee en dos minutos y en este orden: qué tan frescos están los dos
 * lados, cuánto queda por cobrar según cada uno (por moneda), y la lista de lo que no coincide.
 *
 * Sin "use client": es una página para leer. La lista es el mismo `InconsistenciasPanel` del reporte de
 * equilibrio —ordenada, con quién la resuelve y el filtro por dueño—: dos pantallas de «lo que no cuadra» con
 * dos formatos obligaban a aprender a leer cada una.
 *
 * ⚠ Los textos de negocio (los puntos, la nota al pie, los avisos) NO se escriben acá: salen armados de
 * lib/finanzas/excel-vs-odoo.ts, donde tienen sus pruebas.
 */
import Link from "next/link";
import { Alert, EmptyState, PageHeader, buttonVariants } from "@/components/ui";
import { fmtFecha, fmtMonto } from "@/components/cobranza/format";
import InconsistenciasPanel from "@/components/finanzas/equilibrio/InconsistenciasPanel";
import type { DatosExcelVsOdoo, PendienteEnMoneda } from "@/lib/finanzas/excel-vs-odoo";

const NOMBRE_MONEDA: Record<string, string> = { USD: "Dólares", CRC: "Colones" };

/** La diferencia dicha en palabras: un «−$45.644» obliga a pensar quién resta a quién. */
function diferencia(p: PendienteEnMoneda): string {
  const d = Math.round((p.segunOdoo - p.segunExcel) * 100) / 100;
  if (d === 0) return "Dicen lo mismo";
  return d > 0
    ? `Odoo deja ${fmtMonto(d, p.moneda)} más por cobrar`
    : `El Excel cuenta ${fmtMonto(-d, p.moneda)} más por cobrar`;
}

function Pendiente({ pendiente }: { pendiente: PendienteEnMoneda[] }) {
  if (pendiente.length === 0) return null;
  return (
    <section aria-label="Lo que queda por cobrar según cada uno" className="grid gap-2 md:grid-cols-2">
      {pendiente.map((p) => (
        <div key={p.moneda} className="rounded-lg border border-line bg-surface px-4 py-3">
          <p className="text-xs text-fg-muted">
            {NOMBRE_MONEDA[p.moneda] ?? p.moneda} · por cobrar en las {p.facturas}{" "}
            {p.facturas === 1 ? "factura que está" : "facturas que están"} en los dos
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-2xs text-fg-muted">Según el Excel</dt>
              <dd className="text-lg font-semibold tabular-nums text-fg">{fmtMonto(p.segunExcel, p.moneda)}</dd>
            </div>
            <div>
              <dt className="text-2xs text-fg-muted">Según Odoo</dt>
              <dd className="text-lg font-semibold tabular-nums text-fg">{fmtMonto(p.segunOdoo, p.moneda)}</dd>
            </div>
          </dl>
          <p className="mt-1 text-xs text-fg-secondary">{diferencia(p)}</p>
        </div>
      ))}
    </section>
  );
}

export default function ExcelVsOdooPanel({ datos }: { datos: DatosExcelVsOdoo }) {
  const { odoo, excel } = datos;
  return (
    <>
      <PageHeader
        title="Excel vs Odoo"
        description="Lo que el último Excel de cobranza y Odoo no dicen igual, factura por factura, y quién lo cierra."
      />

      <div className="max-w-4xl space-y-4">
        <p className="text-xs text-fg-muted">
          {excel && (
            <>
              Excel subido el <span className="text-fg-secondary">{fmtFecha(excel.subidoEl)}</span> por{" "}
              <span className="text-fg-secondary">{excel.subidoPor}</span> ·{" "}
            </>
          )}
          {odoo.copiadoEl ? (
            <span className={odoo.atrasado ? "text-warn-ink" : undefined}>
              Odoo copiado el <span className={odoo.atrasado ? undefined : "text-fg-secondary"}>{fmtFecha(odoo.copiadoEl)}</span>
            </span>
          ) : (
            <span className="text-warn-ink">Odoo todavía sin copiar</span>
          )}
        </p>

        {excel === null ? (
          <EmptyState
            variant="dashed"
            title="Todavía no hay un Excel de cobranza para comparar"
            description="Se sube en Cobranza › Importar: el libro de asientos tal como sale de Excel (.xlsx). Apenas esté, esta página lo compara factura por factura contra Odoo."
            action={
              <Link href="/cobranza/importar" className={buttonVariants({ variant: "primary", size: "sm" })}>
                Ir a Importar
              </Link>
            }
          />
        ) : (
          <>
            {excel.avisos.map((aviso) => (
              <Alert key={aviso} variant="warning">
                {aviso}
              </Alert>
            ))}
            {excel.filasIlegibles > 0 && (
              <Alert variant="warning">
                {excel.filasIlegibles === 1
                  ? "Un renglón del Excel no se pudo leer y quedó afuera de la comparación."
                  : `${excel.filasIlegibles} renglones del Excel no se pudieron leer y quedaron afuera de la comparación.`}{" "}
                Volver a subirlo desde Cobranza › Importar suele alcanzar.
              </Alert>
            )}

            <Pendiente pendiente={excel.comparacion.pendiente} />

            <InconsistenciasPanel
              inconsistencias={excel.comparacion.inconsistencias}
              moneda="USD"
              titulo="Lo que no coincide"
              vacio={`El Excel y Odoo dicen lo mismo en las ${excel.comparacion.comparados} facturas que comparten: mismo estado de pago, mismo total y misma moneda.`}
              explicacion={`Se compararon ${excel.comparacion.comparados} facturas. Cada punto va en una sola moneda —colones y dólares nunca se suman— y desaparece de acá cuando se corrige Odoo o se sube el Excel corregido.`}
            />

            {excel.notaAlPie && <p className="text-xs text-fg-muted">{excel.notaAlPie}</p>}
          </>
        )}
      </div>
    </>
  );
}
