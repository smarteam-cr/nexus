/**
 * components/gasto-ia/DetalleDe30Dias.tsx — «Últimos 30 días» de /integrations/gasto-ia: hoy, 7 y 30 días, quién lo
 * disparó, por agente y las corridas más caras. Es la pantalla de antes del 2026-10-18 tal cual (lee hasta 20.000
 * llamadas y suma en memoria, `resumirGasto`); la tendencia de meses, sin tope, está en «Por mes».
 */
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { formatearUsd } from "@/lib/ai/precios";
import { resumirGasto, type FilaDeGasto, type TotalesDeGasto } from "@/lib/ai/gasto";

/** Tope de filas leídas. Si se alcanza, la pantalla lo dice: un total recortado en silencio miente. */
export const TOPE_DE_FILAS = 20_000;

const miles = (n: number) => n.toLocaleString("es-CR");

function Numero({ etiqueta, total }: { etiqueta: string; total: TotalesDeGasto }) {
  return (
    <Card className="p-5">
      <p className="text-xs uppercase tracking-wide text-fg-muted">{etiqueta}</p>
      <p className="mt-1 text-3xl font-bold text-fg tabular-nums">{formatearUsd(total.costoUsd)}</p>
      <p className="mt-1 text-sm text-fg-muted">
        {miles(total.llamadas)} {total.llamadas === 1 ? "llamada" : "llamadas"}
        {total.fallidas > 0 && ` · ${miles(total.fallidas)} con error`}
      </p>
      {total.sinTarifa > 0 && (
        <p className="mt-2 text-xs text-warn-ink">
          ⚠ {miles(total.sinTarifa)} de esas llamadas usan un modelo sin tarifa cargada: su costo NO
          está en este número.
        </p>
      )}
    </Card>
  );
}

export default function DetalleDe30Dias({ filas, ahora }: { filas: FilaDeGasto[]; ahora: Date }) {
  const r = resumirGasto(filas, ahora);
  const recortado = filas.length >= TOPE_DE_FILAS;
  const total30 = r.ultimos30.costoUsd;
  const pct = (usd: number) => (total30 > 0 ? Math.round((usd / total30) * 100) : 0);

  return (
    <div>
      {recortado && (
        <Alert variant="warning" className="mb-4" title="La lectura llegó al tope">
          Se leyeron las {miles(TOPE_DE_FILAS)} llamadas más recientes de los últimos 30 días. Los
          totales de abajo cubren solo esas: el gasto real del período es mayor.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Numero etiqueta="Hoy" total={r.hoy} />
        <Numero etiqueta="Últimos 7 días" total={r.ultimos7} />
        <Numero etiqueta="Últimos 30 días" total={r.ultimos30} />
      </div>

      {/* ── El corte que decide contra qué presupuesto se cobra ──────────────── */}
      <Card className="mt-6 p-5">
        <p className="text-sm font-semibold text-fg">Quién lo disparó · últimos 30 días</p>
        <p className="mt-1 text-xs text-fg-muted">
          Lo automático es lo que puede dispararse solo (watchdog, post-proceso, crons). Lo que no
          quedó atribuido cuenta como automático a propósito: el olvido se cobra a la vara corta.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-fg-muted">Alguien apretó un botón</p>
            <p className="mt-1 text-xl font-bold text-fg tabular-nums">
              {formatearUsd(r.ultimos30.costoHumano)}{" "}
              <span className="text-sm font-normal text-fg-muted">
                ({pct(r.ultimos30.costoHumano)}%)
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-fg-muted">Lo disparó el sistema</p>
            <p className="mt-1 text-xl font-bold text-fg tabular-nums">
              {formatearUsd(r.ultimos30.costoAutomatico)}{" "}
              <span className="text-sm font-normal text-fg-muted">
                ({pct(r.ultimos30.costoAutomatico)}%)
              </span>
            </p>
          </div>
        </div>
      </Card>

      {/* ── Por agente ───────────────────────────────────────────────────────── */}
      <Card className="mt-6">
        <div className="border-b border-line px-5 py-4">
          <p className="text-sm font-semibold text-fg">Por agente · últimos 30 días</p>
        </div>
        {r.porAgente.length === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-muted">Todavía no se midió ninguna llamada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-fg-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-2 text-left font-medium">Agente</th>
                  <th className="px-5 py-2 text-right font-medium">Costo</th>
                  <th className="px-5 py-2 text-right font-medium">Llamadas</th>
                  <th className="px-5 py-2 text-right font-medium">Entrada</th>
                  <th className="px-5 py-2 text-right font-medium">Salida</th>
                </tr>
              </thead>
              <tbody>
                {r.porAgente.map((a) => (
                  <tr key={a.agentSlug ?? "__sin__"} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5 text-fg-secondary">
                      {a.agentSlug ?? <span className="text-fg-muted italic">sin atribuir</span>}
                      {a.sinTarifa > 0 && (
                        <span className="ml-2 text-xs text-warn-ink">
                          ⚠ {miles(a.sinTarifa)} sin tarifa
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-fg">
                      {formatearUsd(a.costoUsd)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-fg-muted">
                      {miles(a.llamadas)}
                      {a.fallidas > 0 && (
                        <span className="text-danger-ink"> · {miles(a.fallidas)} con error</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-fg-muted">
                      {miles(a.tokensEntrada)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-fg-muted">
                      {miles(a.tokensSalida)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Las corridas más caras ───────────────────────────────────────────── */}
      <Card className="mt-6">
        <div className="border-b border-line px-5 py-4">
          <p className="text-sm font-semibold text-fg">Las corridas más caras · últimos 30 días</p>
          {/* ⚠ Sin esta línea la tabla se lee como si fuera el gasto entero, y hoy la mayoría de
              los caminos que llaman a Claude no crean una corrida. */}
          <p className="mt-1 text-xs text-fg-muted">
            {r.llamadasSinCorrida > 0
              ? `⚠ Esta tabla NO cubre todo: ${formatearUsd(r.costoSinCorrida)} (${pct(r.costoSinCorrida)}%) salió de ${miles(r.llamadasSinCorrida)} llamadas que no cuelgan de ninguna corrida.`
              : "Todas las llamadas del período cuelgan de una corrida."}
          </p>
        </div>
        {r.corridasCaras.length === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-muted">Ninguna corrida medida todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-fg-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-2 text-left font-medium">Cuándo</th>
                  <th className="px-5 py-2 text-left font-medium">Agente</th>
                  <th className="px-5 py-2 text-left font-medium">Quién</th>
                  <th className="px-5 py-2 text-right font-medium">Llamadas</th>
                  <th className="px-5 py-2 text-right font-medium">Costo</th>
                </tr>
              </thead>
              <tbody>
                {r.corridasCaras.map((c) => (
                  <tr key={c.agentRunId} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5 whitespace-nowrap text-fg-muted">
                      {c.desde.toLocaleString("es-CR", {
                        timeZone: "America/Costa_Rica",
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-5 py-2.5 text-fg-secondary">
                      {c.agentSlug ?? <span className="text-fg-muted italic">sin atribuir</span>}
                    </td>
                    <td className="px-5 py-2.5 text-fg-muted">
                      {c.triggeredByEmail ?? <span className="italic">el sistema</span>}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-fg-muted">
                      {miles(c.llamadas)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-fg">
                      {formatearUsd(c.costoUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

    </div>
  );
}
