"use client";

/**
 * components/finanzas/AguinaldoPanel.tsx
 *
 * El aguinaldo por colaborador, derivado del libro de planilla.
 *
 * ⚠ EL DEFECTO QUE ESTA PANTALLA TENÍA (2026-08-17): mostraba un número correcto
 * con el rótulo equivocado. La columna se llamaba «Sumado» —de qué, de cuándo,
 * nadie sabía— y «Aguinaldo» afirmaba el monto final cuando en realidad era **lo
 * devengado hasta hoy**: la ventana dic→nov todavía no cerró, así que ese número
 * va a seguir subiendo hasta noviembre. En una pantalla de plata, un número bien
 * calculado y mal rotulado es lo mismo que un número mal calculado.
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

import Link from "next/link";
import type { AguinaldoResultado } from "@/lib/finanzas/aguinaldo";
import { PageHeader, EmptyState, buttonVariants } from "@/components/ui";
import { etiquetaMes, fmtFecha, fmtMonto } from "@/components/cobranza/format";

const TH = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-fg-muted";
const TD = "px-3 py-2 text-xs text-fg";

export default function AguinaldoPanel({
  initial,
  anioActual,
}: {
  initial: AguinaldoResultado;
  anioActual: number;
}) {
  const {
    anio,
    periodos,
    personas,
    totales,
    totalesProyectado,
    quincenasPorVenir,
    periodoAbierto,
    cierraEn,
    faltantes,
  } = initial;
  const hayComisiones = personas.some((p) => p.sumaConComisiones !== p.sumaSalario);

  // El rango en palabras: «diciembre 2025 → noviembre 2026». El rótulo de la
  // columna lo repite porque una columna de plata tiene que decir de qué período
  // es sin obligar a subir la vista hasta el encabezado.
  const desde = periodos[0] ? etiquetaMes(periodos[0]) : "—";
  const hasta = periodos[periodos.length - 1] ? etiquetaMes(periodos[periodos.length - 1]!) : "—";

  // Los años que se pueden mirar: el corriente y los dos anteriores. Sin ir más
  // atrás de 2025, que es cuando arranca el libro.
  const anios = [anioActual, anioActual - 1, anioActual - 2].filter((a) => a >= 2025);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Aguinaldo ${anio}`}
        description={`Todo lo que se le pagó a cada persona entre ${desde} y ${hasta}, dividido entre 12. Es un dato observado del historial de planilla, no una tasa: si a alguien le subieron el salario a mitad de año, su aguinaldo sube solo.`}
        action={
          anios.length > 1 ? (
            <div className="flex gap-1">
              {anios.map((a) => (
                <Link
                  key={a}
                  href={`/finanzas/costos/aguinaldo?anio=${a}`}
                  className={buttonVariants({
                    variant: a === anio ? "primary" : "secondary",
                    size: "sm",
                  })}
                >
                  {a}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      />

      {/* ⚠ Lo primero que hay que saber: si el número es final o va a seguir
          subiendo. Antes esto no estaba en ningún lado y la pantalla se leía
          como si el aguinaldo de diciembre ya estuviera calculado. */}
      {periodoAbierto && (
        <div className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2">
          <p className="text-xs text-warn-ink">
            <span className="font-medium">El período todavía no cierra.</span> «Acumulado» es lo que
            se devengó hasta hoy; «total estimado» es a cuánto llega en {etiquetaMes(cierraEn)} si
            cada quien sigue con el salario que tiene hoy — faltan {quincenasPorVenir} quincena
            {quincenasPorVenir === 1 ? "" : "s"} por pagar. Es una estimación, no una promesa: si hay
            un aumento o una salida, el número se mueve solo.
          </p>
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface-muted px-3 py-2 space-y-0.5">
        <p className="text-[11px] text-fg-muted">
          Se suma de <span className="text-fg-secondary">{desde}</span> a{" "}
          <span className="text-fg-secondary">{hasta}</span> · solo las quincenas ya pagadas
        </p>
        <p className="text-[11px] text-fg-muted">
          Provisionado hasta hoy:{" "}
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
        {/* El número que sirve para planear diciembre: lo de hoy no alcanza para
            saber cuánta plata hay que tener. */}
        {periodoAbierto && (
          <p className="text-[11px] text-fg-muted">
            Estimado a pagar en {etiquetaMes(cierraEn)}:{" "}
            <span className="text-fg tabular-nums font-medium">
              {Object.entries(totalesProyectado)
                .map(([m, v]) => fmtMonto(v, m as "CRC" | "USD"))
                .join(" · ") || "—"}
            </span>
          </p>
        )}
      </div>

      {personas.length === 0 ? (
        <EmptyState
          title="Todavía no hay nada que calcular"
          description="El aguinaldo sale del historial de planilla. Registrá quincenas como pagadas y aparece solo."
        />
      ) : (
        <div className="rounded-xl border border-line bg-surface overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="bg-surface-muted border-b border-line">
              <tr>
                <th className={TH}>Colaborador</th>
                <th className={TH}>Primera quincena</th>
                <th className={TH}>Quincenas contadas</th>
                <th className={`${TH} text-right`}>Salario pagado en el período</th>
                <th className={`${TH} text-right`}>
                  {periodoAbierto ? "Aguinaldo acumulado" : "Aguinaldo del año"}
                </th>
                {periodoAbierto && (
                  <th className={`${TH} text-right`}>Total estimado en diciembre</th>
                )}
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
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      <div className="tabular-nums font-medium">
                        {fmtMonto(p.aguinaldoSalario, moneda)}
                      </div>
                      {/* La cuenta a la vista: sin esto, «Aguinaldo» es un número
                          que hay que creer. Con esto se puede rehacer de cabeza. */}
                      <div className="text-[10px] text-fg-muted">
                        = {fmtMonto(p.sumaSalario, moneda)} ÷ 12
                      </div>
                    </td>
                    {periodoAbierto && (
                      <td className={`${TD} text-right whitespace-nowrap`}>
                        <div className="tabular-nums font-medium">
                          {fmtMonto(p.aguinaldoProyectado, moneda)}
                        </div>
                        {/* De dónde sale el número: sin esto es un pronóstico
                            que hay que creer. Con esto se puede discutir. */}
                        <div className="text-[10px] text-fg-muted">
                          {p.sigueEnPlanilla ? (
                            <>
                              + {p.quincenasProyectadas} quincena
                              {p.quincenasProyectadas === 1 ? "" : "s"} a{" "}
                              {fmtMonto(p.montoQuincenaActual, moneda)}
                            </>
                          ) : (
                            "ya no está en planilla"
                          )}
                        </div>
                      </td>
                    )}
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

      {/* ⚠ Quién NO aparece. Antes, una persona con salario activo y sin ninguna
          quincena en el libro simplemente no se pintaba: ni en cero ni con aviso.
          El total se leía como si estuviera completo. Nunca se le estima un
          aguinaldo desde el monto del costo — sin libro no hay nada observado. */}
      {faltantes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-fg">Sin quincenas registradas</h2>
          <p className="text-[11px] text-fg-muted">
            Tienen salario activo pero no aparecen arriba, así que su aguinaldo no está en el total.
            No se les estima un monto: sin quincenas en el historial no hay nada que dividir.
          </p>
          <ul className="rounded-lg border border-line bg-surface divide-y divide-line">
            {faltantes.map((f) => (
              <li
                key={`${f.nombre}::${f.moneda}`}
                className="px-3 py-2 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <span className="text-xs text-fg">{f.nombre}</span>
                  <span className="ml-1.5 text-[10px] font-medium px-1 py-0.5 rounded border border-line text-fg-muted">
                    {f.moneda}
                  </span>
                  <p className="text-[11px] text-fg-muted mt-0.5">
                    {f.motivo === "SIN_PERSONA_LIGADA"
                      ? "Su salario no está ligado a una persona del equipo, así que generar la quincena nunca lo va a incluir."
                      : "Nadie le registró ninguna quincena en el historial de planilla."}
                  </p>
                </div>
                <Link
                  href={
                    f.motivo === "SIN_PERSONA_LIGADA"
                      ? "/finanzas/costos/planillas"
                      : "/finanzas/costos/planillas/historial"
                  }
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  {f.motivo === "SIN_PERSONA_LIGADA" ? "Ver el salario" : "Ir al historial"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[11px] text-fg-muted">
        «Primera quincena» sale del propio historial (la más vieja de esa persona), no de un campo
        cargado a mano. Quien entró a mitad de año sale proporcional sin que nadie configure nada.
      </p>
    </div>
  );
}
