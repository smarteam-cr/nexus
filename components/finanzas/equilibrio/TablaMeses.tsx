"use client";

/**
 * components/finanzas/equilibrio/TablaMeses.tsx
 *
 * El año mes a mes, con la columna FACTURADO editable para simular.
 *
 * ⚠ Lo que se teclea acá NO SE GUARDA: vive en el estado del contenedor y se muere al
 * recargar. Por eso el input no tiene `onSave` ni debounce contra el servidor — no hay
 * servidor al que mandarle nada (ver lib/cobranza/equilibrio-escenario.ts).
 *
 * ⚠ La columna ESTADO dice "—" cuando el mes es PARCIAL, en vez de "Cubre egresos" o
 * "Déficit". Afirmar que un mes cubre habiendo contado la mitad de los costos es la
 * mentira más fácil de esta pantalla, y la que peor se ve en una captura.
 *
 * `type="text"` con `inputMode="decimal"` y no `type="number"`: la rueda del mouse le
 * cambia el valor a un input numérico cuando se hace scroll sobre la tabla.
 */
import { useState } from "react";
import { etiquetaMes, fmtMonto } from "@/components/cobranza/format";
import { parseMonto, type MesEfectivo } from "@/lib/cobranza/equilibrio-escenario";

const TH_CLS =
  "px-3 py-2.5 text-left text-[11px] font-semibold text-fg-muted uppercase tracking-wide whitespace-nowrap";
const TD_NUM = "px-3 py-2 text-right tabular-nums whitespace-nowrap";

interface Props {
  meses: MesEfectivo[];
  moneda: string;
  hayEscenario: boolean;
  onEditar: (periodo: string, valor: number | null) => void;
  onReset: () => void;
  onIgualar: () => void;
  onLimpiar: () => void;
}

/**
 * La celda editable, con su propio estado.
 *
 * ⚠ EXISTE POR UN BUG: antes el input era no controlado y llevaba
 * `key={periodo + facturadoEfectivo}`. Al teclear un dígito subía el valor, cambiaba el
 * `key`, React DESMONTABA el input y montaba otro — con el foco perdido. Efecto: no se
 * podía escribir un número de más de una cifra. Se sentía como que la tabla "se traba".
 *
 * La regla que lo evita: mientras la persona escribe, el texto crudo manda y NADIE lo
 * pisa desde afuera. Los botones de arriba (Reset / Igualar / Limpiar) sí tienen que
 * pisarlo, y para eso el padre sube `generacion`: eso remonta las celdas a propósito,
 * que es la única vez que remontar es lo correcto.
 */
function CeldaFacturado({
  m,
  onEditar,
}: {
  m: MesEfectivo;
  onEditar: (periodo: string, valor: number | null) => void;
}) {
  const [texto, setTexto] = useState(m.facturadoEfectivo > 0 ? String(m.facturadoEfectivo) : "");
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={`Facturado simulado de ${etiquetaMes(m.periodo)}`}
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        onEditar(m.periodo, parseMonto(e.target.value));
      }}
      placeholder={m.facturado > 0 ? String(m.facturado) : "—"}
      className={`w-24 px-2 py-1 text-right tabular-nums rounded-md border bg-surface text-fg ${
        m.simulado ? "border-warn-line text-warn-ink" : "border-line"
      }`}
    />
  );
}

export default function TablaMeses({ meses, moneda, hayEscenario, onEditar, onReset, onIgualar, onLimpiar }: Props) {
  // Sube cuando una acción de arriba reescribe la columna entera. Es lo único que puede
  // pisar lo que alguien está tecleando.
  const [generacion, setGeneracion] = useState(0);
  const enBloque = (fn: () => void) => () => {
    fn();
    setGeneracion((g) => g + 1);
  };
  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden">
      <div className="px-4 py-2.5 bg-surface-muted border-b border-line flex flex-wrap items-center gap-2">
        <div>
          <h3 className="text-sm font-medium text-fg">Ingresos facturados · escenario editable</h3>
          <p className="text-[11px] text-fg-muted mt-0.5">
            La columna Facturado parte de lo real y se puede cambiar para simular. La curva de arriba se
            actualiza en vivo; nada de esto se guarda.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={enBloque(onReset)}
            disabled={!hayEscenario}
            className="px-2.5 py-1 text-[11px] rounded-md border border-line text-fg-secondary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Ingresos reales
          </button>
          <button
            type="button"
            onClick={enBloque(onIgualar)}
            className="px-2.5 py-1 text-[11px] rounded-md border border-line text-fg-secondary hover:bg-surface-hover"
          >
            Igualar al equilibrio
          </button>
          <button
            type="button"
            onClick={enBloque(onLimpiar)}
            className="px-2.5 py-1 text-[11px] rounded-md border border-line text-fg-secondary hover:bg-surface-hover"
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface-muted border-b border-line">
            <tr>
              <th className={TH_CLS}>Mes</th>
              <th className={`${TH_CLS} text-right`}>Egresos</th>
              <th className={`${TH_CLS} text-right`}>Facturado</th>
              <th className={`${TH_CLS} text-right`}>Cobrado</th>
              <th className={`${TH_CLS} text-right`}>Por cobrar</th>
              <th className={`${TH_CLS} text-right`}>Partnership</th>
              <th className={`${TH_CLS} text-right`}>Ingresos totales</th>
              <th className={`${TH_CLS} text-right`}>Brecha</th>
              <th className={TH_CLS}>Estado</th>
              <th className={TH_CLS}>Dato del egreso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {meses.map((m) => {
              const sinDato = m.egresos === 0 && m.facturado === 0 && m.partnership === 0;
              return (
                <tr
                  key={m.periodo}
                  className={`${m.simulado ? "bg-warn-surface" : ""} ${sinDato ? "opacity-60" : ""}`}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-fg">
                    {etiquetaMes(m.periodo)}
                    {m.simulado && (
                      <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-warn-surface text-warn-ink border border-warn-line">
                        simulado
                      </span>
                    )}
                  </td>
                  <td className={`${TD_NUM} text-fg-secondary`}>
                    {m.egresos > 0 ? fmtMonto(m.egresos, moneda) : "—"}
                  </td>
                  <td className={TD_NUM}>
                    <CeldaFacturado key={`${m.periodo}-${generacion}`} m={m} onEditar={onEditar} />
                  </td>
                  <td className={`${TD_NUM} text-fg-secondary`}>{m.cobrado > 0 ? fmtMonto(m.cobrado, moneda) : "—"}</td>
                  <td className={`${TD_NUM} text-fg-secondary`}>{m.porCobrar > 0 ? fmtMonto(m.porCobrar, moneda) : "—"}</td>
                  <td className={`${TD_NUM} text-fg-secondary`}>
                    {m.partnership > 0 ? fmtMonto(m.partnership, moneda) : "—"}
                  </td>
                  <td className={`${TD_NUM} text-fg font-medium`}>
                    {m.ingresosTotales > 0 ? fmtMonto(m.ingresosTotales, moneda) : "—"}
                  </td>
                  <td className={`${TD_NUM} ${m.brecha >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {sinDato ? "—" : fmtMonto(m.brecha, moneda)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {m.cubreEgresos === null ? (
                      <span className="text-fg-muted">—</span>
                    ) : m.cubreEgresos ? (
                      <span className="text-emerald-600">Cubre egresos</span>
                    ) : (
                      <span className="text-red-600">Déficit</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {m.estado === "COMPLETO" ? (
                      <span className="text-fg-muted">Completo</span>
                    ) : (
                      <span
                        className="text-warn-ink"
                        title={m.faltantes.length > 0 ? `Falta ${m.faltantes.join(", ")}` : undefined}
                      >
                        Parcial
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
