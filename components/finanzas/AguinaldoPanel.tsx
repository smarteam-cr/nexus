"use client";

/**
 * components/finanzas/AguinaldoPanel.tsx
 *
 * El aguinaldo por colaborador, derivado del libro de planilla.
 *
 * ⚠ DOS LÍNEAS, y Nexus NO elige: se muestra el aguinaldo de SOLO SALARIO (que
 * es lo que calcula la hoja de Alex, y por eso es la columna comparable) y el
 * que INCLUYE las comisiones liquidadas. Cuál se paga lo decide dirección.
 *
 * ⚠ La COBERTURA va al lado de cada número, no escondida en un tooltip: un
 * aguinaldo calculado sobre 9 de 24 quincenas no es un aguinaldo incompleto
 * disimulado. Quien entró a mitad de año sale proporcional y eso es correcto —
 * la fórmula CR lo maneja sola.
 */

import type { AguinaldoResultado } from "@/lib/finanzas/aguinaldo";
import { PageHeader, EmptyState } from "@/components/ui";
import { fmtFecha, fmtMonto } from "@/components/cobranza/format";

const TH = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-fg-muted";
const TD = "px-3 py-2 text-xs text-fg";

export default function AguinaldoPanel({ initial }: { initial: AguinaldoResultado }) {
  const { anio, periodos, personas, totales } = initial;
  const ventana = `${periodos[0] ?? "—"} → ${periodos[periodos.length - 1] ?? "—"}`;
  const hayComisiones = personas.some((p) => p.sumaConComisiones !== p.sumaSalario);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Aguinaldo ${anio}`}
        description="Suma de lo REGISTRADO en el libro de planilla, de diciembre a noviembre, ÷ 12. Es un dato observado, no una tasa."
      />

      <div className="rounded-lg border border-line bg-surface-muted px-3 py-2 space-y-0.5">
        <p className="text-[11px] text-fg-muted">
          Ventana: <span className="text-fg-secondary">{ventana}</span> · solo quincenas PAGADAS
        </p>
        <p className="text-[11px] text-fg-muted">
          Totales por moneda:{" "}
          {Object.keys(totales).length === 0 ? (
            <span className="text-fg-secondary">—</span>
          ) : (
            <span className="text-fg-secondary tabular-nums">
              {Object.entries(totales)
                .map(([m, v]) => fmtMonto(v, m as "CRC" | "USD"))
                .join(" · ")}
            </span>
          )}{" "}
          (línea de solo salario; CRC y USD nunca se suman entre sí)
        </p>
      </div>

      {personas.length === 0 ? (
        <EmptyState
          title="Todavía no hay nada que calcular"
          description="El aguinaldo sale del libro de planilla. Registrá quincenas como pagadas y aparece solo."
        />
      ) : (
        <div className="rounded-xl border border-line bg-surface overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-surface-muted border-b border-line">
              <tr>
                <th className={TH}>Colaborador</th>
                <th className={TH}>Desde</th>
                <th className={TH}>Cobertura</th>
                <th className={`${TH} text-right`}>Sumado</th>
                <th className={`${TH} text-right`}>Aguinaldo</th>
                {hayComisiones && <th className={`${TH} text-right`}>Con comisiones</th>}
              </tr>
            </thead>
            <tbody>
              {personas.map((p) => {
                const moneda = p.moneda as "CRC" | "USD";
                const parcial = p.cobertura.registradas < p.cobertura.posibles;
                return (
                  <tr key={p.clave} className="border-b border-line last:border-b-0">
                    <td className={TD}>
                      {p.nombre}
                      <span className="ml-1.5 text-[10px] font-medium px-1 py-0.5 rounded border border-line text-fg-muted">
                        {p.moneda}
                      </span>
                    </td>
                    <td className={`${TD} text-fg-secondary whitespace-nowrap`}>
                      {p.desde ? fmtFecha(p.desde) : "—"}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <span className={parcial ? "text-warn-ink" : "text-fg-muted"}>
                        {p.cobertura.texto}
                      </span>
                    </td>
                    <td className={`${TD} text-right tabular-nums text-fg-secondary whitespace-nowrap`}>
                      {fmtMonto(p.sumaSalario, moneda)}
                    </td>
                    <td className={`${TD} text-right tabular-nums font-medium whitespace-nowrap`}>
                      {fmtMonto(p.aguinaldoSalario, moneda)}
                    </td>
                    {hayComisiones && (
                      <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>
                        {p.aguinaldoConComisiones !== p.aguinaldoSalario ? (
                          fmtMonto(p.aguinaldoConComisiones, moneda)
                        ) : (
                          <span className="text-fg-muted">igual</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-fg-muted">
        La fecha «Desde» sale del propio libro (su quincena más vieja), no de un campo cargado a
        mano. Quien entró a mitad de año sale proporcional sin que nadie configure nada.
      </p>
    </div>
  );
}
