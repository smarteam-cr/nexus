"use client";

/**
 * components/finanzas/equilibrio/EquilibrioClient.tsx
 *
 * El contenedor del reporte anual. Dueño de estos estados y de nada más:
 *   · `escenario` — los meses que alguien movió a mano. NO SE GUARDA en ningún lado:
 *     ni fetch, ni localStorage, ni query param. Este componente **no recibe ningún
 *     callback hacia el servidor**, justamente para que no haya dónde enchufarle un
 *     "guardar" de paso. Mover el facturado de marzo es una pregunta, no un dato.
 *   · `pin` / `hover` — qué serie está enfocada. Nace acá porque los indicadores son
 *     React y el chart no expone eventos; el gráfico la recibe como prop.
 *   · `ocultas` — las series que se sacaron del reporte. Tampoco se guarda, por la misma
 *     razón que el escenario: qué se está mirando ahora no es un dato del negocio.
 *
 * Los indicadores se renderizan SIEMPRE recalculados sobre los meses efectivos, nunca
 * los del DTO: al simular, mostrar los del servidor haría que el encabezado dijera un
 * número y la tabla de abajo otro. Con el escenario vacío tienen que dar exactamente lo
 * mismo — hay un test que lo verifica al centavo.
 */
import { useMemo, useState } from "react";
import { PageHeader, Alert, EmptyState } from "@/components/ui";
import { fmtMonto, etiquetaMes } from "@/components/cobranza/format";
import {
  aplicarEscenario,
  igualarAlEquilibrio,
  indicadoresDe,
  limpiarFacturado,
  type OverrideEscenario,
} from "@/lib/cobranza/equilibrio-escenario";
import { VENTANA_EQUILIBRIO_LABEL } from "@/lib/cobranza/schema";
import type { ReporteAnualDTO } from "@/lib/cobranza";
import CurvaEquilibrio, { LABEL_SERIE, type SerieKey } from "./CurvaEquilibrio";
import DesgloseIngresos from "./DesgloseIngresos";
import TablaMeses from "./TablaMeses";
import EstructuraCostos from "./EstructuraCostos";
import ConfiabilidadDato from "./ConfiabilidadDato";
import InconsistenciasPanel from "./InconsistenciasPanel";

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function EquilibrioClient({ initialReporte }: { initialReporte: ReporteAnualDTO }) {
  const r = initialReporte;
  const [escenario, setEscenario] = useState<OverrideEscenario>({});
  const [pin, setPin] = useState<SerieKey | null>(null);
  const [hover, setHover] = useState<SerieKey | null>(null);
  /** Las series que se sacaron del reporte. Vacío = se ven todas. */
  const [ocultas, setOcultas] = useState<ReadonlySet<SerieKey>>(() => new Set());
  // Una serie que no está en el gráfico no puede quedar enfocada: si no, pasar el mouse
  // por su tag apagaría a las que sí están y el gráfico se vaciaría sin motivo visible.
  const enfoque = pin ?? (hover !== null && !ocultas.has(hover) ? hover : null);

  /**
   * El ciclo de tres pasos de un tag o un indicador: normal → marcada → fuera del
   * reporte → normal.
   *
   * Marcar es EXCLUSIVO —una sola serie a la vez— porque enfocar dos no enfoca nada.
   * Sacar del reporte es acumulativo: descartar de a una hasta quedarse con las dos que
   * se quieren comparar es justamente para lo que sirve.
   *
   * ⚠ Sacar una serie NO cambia ningún número del reporte. Es una decisión de qué mirar,
   * no de qué contar: el margen, el piso y la brecha siguen valiendo lo mismo con la
   * serie adentro o afuera.
   */
  const ciclar = (k: SerieKey) => {
    if (ocultas.has(k)) {
      setOcultas((prev) => {
        const next = new Set(prev);
        next.delete(k);
        return next;
      });
      return;
    }
    if (pin === k) {
      setPin(null);
      // Se suelta el hover a mano: el mouse queda encima del tag, así que sin esto la
      // serie recién sacada seguiría "enfocada" hasta mover el puntero.
      setHover(null);
      setOcultas((prev) => new Set(prev).add(k));
      return;
    }
    setPin(k);
  };

  const meses = useMemo(() => aplicarEscenario(r.meses, escenario), [r.meses, escenario]);
  const ind = useMemo(() => indicadoresDe(meses), [meses]);
  const hayEscenario = ind.mesesSimulados > 0;
  const moneda = r.monedaPresentacion;

  const editar = (periodo: string, valor: number | null) =>
    setEscenario((prev) => {
      // null = el campo quedó vacío ⇒ el mes vuelve al dato real (sale del override).
      // Sacarlo del mapa y no ponerlo en cero: un cero es un escenario ("no vendimos
      // nada"), y volver al dato real es lo contrario de eso.
      if (valor === null) {
        return Object.fromEntries(Object.entries(prev).filter(([k]) => k !== periodo));
      }
      return { ...prev, [periodo]: valor };
    });

  const sinDatos = r.indicadores.egresosTotales === 0 && r.indicadores.facturadoTotal === 0;

  // Sin tasa para meses que la necesitan, el total del año está incompleto por
  // construcción. Se dice arriba de todo, no en una nota al pie.
  const faltanTasas = r.fx.periodosSinTasa.length > 0;

  // El piso que manda es el VIGENTE (lo que cuesta la operación hoy). El promedio
  // histórico queda como segunda lectura: contesta otra pregunta.
  const piso = r.pisoVigente?.base ?? r.equilibrio.base;
  // La caja del año: lo que de verdad entró al banco. Casi un tercio del margen
  // facturado todavía no está, y sin este par de números eso no se ve.
  //
  // ⚠ Se resta `egresosDeCajaTotal`, NO `egresosTotales`. La versión anterior restaba el
  // egreso entero y con eso le descontaba a la caja $31.687 que nunca salieron del banco:
  // la reserva de aguinaldo (un devengo — nadie apartó esa plata) y los egresos de meses
  // que todavía no ocurrieron. Medía los ingresos con criterio de caja y los egresos con
  // criterio de devengo, así que el "margen en caja" no era ninguna de las dos cosas.
  const cajaTotal = round2(ind.cobradoTotal + r.indicadores.partnershipCobradoTotal);
  const margenCaja = round2(cajaTotal - ind.egresosDeCajaTotal);

  const TILES: Array<{ key: string; label: string; valor: string; nota: string; serie: SerieKey | null; simulado?: boolean }> = [
    {
      key: "equilibrio",
      label: "Piso mensual",
      valor: fmtMonto(piso, moneda),
      nota: r.pisoVigente ? `${r.pisoVigente.cuantos} costos vigentes` : `${r.equilibrio.mesesUsados.length} mes(es) medidos`,
      serie: "equilibrio",
    },
    {
      key: "facturado",
      label: "Facturado del año",
      valor: fmtMonto(ind.facturadoTotal, moneda),
      nota: "Servicios, sin IVA",
      serie: "facturado",
      simulado: hayEscenario,
    },
    {
      key: "cobrado",
      label: "Cobrado del año",
      valor: fmtMonto(ind.cobradoTotal, moneda),
      nota: r.indicadores.tasaCobro === null ? "sin facturación" : `${Math.round(r.indicadores.tasaCobro * 100)}% de cobro`,
      serie: "cobrado",
    },
    {
      key: "porCobrar",
      label: "Cuentas por cobrar",
      valor: fmtMonto(ind.porCobrarTotal, moneda),
      nota: "Facturado sin cobrar",
      serie: null,
    },
    {
      key: "margen",
      // ⚠ "a la fecha" y no "anual": el margen de los doce meses cuenta como ingreso la
      // comisión de aliado de noviembre —ya fechada— pero no la planilla de septiembre a
      // diciembre, que el libro de pagos todavía no tiene. Son 8 meses de ingreso contra
      // 12 de costo, y el año "ganaba" ~$32.000 de cobrar el futuro sin pagarlo. Lo que
      // viene se declara en la nota, no se suma.
      label: "Margen a la fecha",
      valor: fmtMonto(ind.margenAlDia, moneda),
      nota:
        ind.comprometidoPorVenir > 0
          ? `en caja ${fmtMonto(margenCaja, moneda)} · ${fmtMonto(ind.comprometidoPorVenir, moneda)} por venir`
          : `en caja: ${fmtMonto(margenCaja, moneda)}`,
      serie: "ingresosTotales",
      simulado: hayEscenario,
    },
    {
      key: "cubren",
      label: "Meses sobre egresos",
      valor: `${ind.mesesQueCubren} de 12`,
      nota: `${ind.mesesEgresoCompleto} meses con egreso completo`,
      serie: null,
      simulado: hayEscenario,
    },
    {
      key: "partnership",
      label: "Partnership",
      valor: fmtMonto(ind.partnershipTotal, moneda),
      nota:
        r.indicadores.partnershipCobradoTotal < ind.partnershipTotal
          ? `${fmtMonto(r.indicadores.partnershipCobradoTotal, moneda)} cobrado`
          : "Comisiones de aliados",
      serie: "partnership",
    },
  ];

  return (
    <>
      <PageHeader
        title="Punto de equilibrio"
        description={`La curva mensual de la operación en ${r.anio}: qué entra, qué sale y cuánto hay que facturar para no perder plata.`}
      />

      {/* La tasa se declara arriba Y al pie del gráfico: el chart es lo que se saca por
          captura y se pega en un chat, y ahí la nota de arriba no viaja. */}
      {r.fx.tasas.length > 0 && (
        <p className="text-[11px] text-fg-muted mb-3">
          Todo en {moneda}. Convertido con la tasa de cada mes ({r.fx.tasas[0]!.fuente}
          {r.fx.tasas.length > 1 ? ` y ${r.fx.tasas.length - 1} más` : ""}); {r.fx.convertidos} monto(s)
          convertidos.
        </p>
      )}

      {sinDatos ? (
        <EmptyState
          title={`Todavía no hay datos de ${r.anio}`}
          description="El reporte se arma con el libro de egresos, el libro de planilla y los cobros del año. Cargá el Excel de egresos para empezar."
        />
      ) : (
        <div className="space-y-4">
          {faltanTasas && (
            <Alert variant="warning" title="Falta el tipo de cambio de algunos meses">
              {r.fx.periodosSinTasa.map(etiquetaMes).join(" · ")}. Los montos en la otra moneda de esos
              meses NO están sumados en los totales — se listan abajo, en confiabilidad del dato.
            </Alert>
          )}

          {hayEscenario && (
            <Alert
              variant="warning"
              title="Escenario simulado"
              action={
                <button
                  type="button"
                  onClick={() => setEscenario({})}
                  className="px-2.5 py-1 text-[11px] rounded-md border border-warn-line text-warn-ink hover:bg-warn-surface whitespace-nowrap"
                >
                  Volver a lo real
                </button>
              }
            >
              Estás moviendo a mano el facturado de {ind.mesesSimulados} mes(es). Nada de esto se guarda:
              al recargar la página vuelven los datos reales.
            </Alert>
          )}

          {/* Indicadores. Los que mapean a una serie son botones y ciclan igual que los
              tags de la leyenda —enfocan, sacan del reporte, devuelven—; los que no, son
              texto: un tile que parece clickeable y no hace nada es peor que uno que no
              lo parece. */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
            {TILES.map((t) => {
              // El indicador enfocado se marca de verdad: número más pesado, borde de
              // acento y una barra de color arriba con el trazo de SU serie. Un ring
              // de 1px no se distinguía a un metro de la pantalla.
              const activo = t.serie !== null && enfoque === t.serie;
              const fijado = t.serie !== null && pin === t.serie;
              // El indicador y el tag de la leyenda son dos vistas del MISMO estado: si
              // uno mostrara la serie como fuera del reporte y el otro no, no habría
              // manera de saber cuál manda.
              const fuera = t.serie !== null && ocultas.has(t.serie);
              const contenido = (
                <>
                  {/* ⚠ El estado "fuera" se marca en el RÓTULO, nunca bajando la opacidad
                      del tile entero: a opacity-50 el número quedaba en 3,39:1 sobre fondo
                      claro —por debajo del mínimo de 4,5— y además atenuarlo contradecía lo
                      que la propia pantalla promete, que sacar una serie no cambia ningún
                      número. El número se queda en color pleno porque sigue valiendo. */}
                  <p
                    className={`text-[10px] uppercase tracking-wide text-fg-muted ${
                      fuera ? "line-through" : ""
                    }`}
                  >
                    {t.label}
                  </p>
                  <p
                    className={`tabular-nums mt-0.5 text-fg ${
                      activo ? "text-xl font-bold" : "text-lg font-semibold"
                    }`}
                  >
                    {t.valor}
                  </p>
                  <p className="text-[10px] text-fg-muted mt-0.5">
                    {t.nota}
                    {t.simulado && <span className="text-warn-ink"> · simulado</span>}
                  </p>
                </>
              );
              const base = "text-left rounded-xl border bg-surface px-3 py-2.5 min-h-[76px] transition-all";
              return t.serie === null ? (
                <div key={t.key} className={`${base} border-line`}>
                  {contenido}
                </div>
              ) : (
                <button
                  key={t.key}
                  type="button"
                  onMouseEnter={() => setHover(fuera ? null : t.serie)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(fuera ? null : t.serie)}
                  onBlur={() => setHover(null)}
                  onClick={() => ciclar(t.serie!)}
                  aria-pressed={fijado}
                  // ⚠ El nombre de la SERIE, no el del tile. «Margen a la fecha» mueve
                  // la línea «Ingresos totales» y «Piso mensual» mueve «Punto de
                  // equilibrio»: anunciar el título del tile prometía sacar del reporte
                  // una cosa y sacaba otra, con el número del tile intacto al lado.
                  title={
                    fuera
                      ? `Devolver ${LABEL_SERIE[t.serie]} al reporte`
                      : fijado
                        ? `Sacar ${LABEL_SERIE[t.serie]} del reporte`
                        : `Enfocar ${LABEL_SERIE[t.serie]}`
                  }
                  // M3: tres estados no caben en aria-pressed; el estado va en el nombre.
                  aria-label={fuera ? `${t.label} — ${LABEL_SERIE[t.serie]} fuera del reporte` : t.label}
                  className={`${base} ${
                    fuera
                      ? "border-line border-dashed hover:bg-surface-hover"
                      : fijado
                        ? "border-brand ring-2 ring-brand/40"
                        : activo
                          ? "border-brand/60 bg-surface-hover"
                          : "border-line hover:bg-surface-hover"
                  }`}
                >
                  {contenido}
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-line bg-surface overflow-hidden">
            <div className="px-4 py-2.5 bg-surface-muted border-b border-line flex flex-wrap items-center gap-2">
              <div>
                <h3 className="text-sm font-medium text-fg">La curva mensual de la operación</h3>
                <p className="text-[11px] text-fg-muted mt-0.5">
                  Pasá el mouse por un indicador para enfocarlo. Con clics sucesivos: lo marca, lo saca del
                  reporte y lo devuelve. Sacar una serie no cambia ningún número — solo qué se mira.
                </p>
              </div>
              {(pin !== null || ocultas.size > 0) && (
                <button
                  type="button"
                  // Devuelve TODO de una: con el ciclo de tres pasos, volver a cero a mano
                  // puede costar dos clics por serie.
                  onClick={() => {
                    setPin(null);
                    setHover(null);
                    setOcultas(new Set());
                  }}
                  className="ml-auto px-2.5 py-1 text-[11px] rounded-md border border-line text-fg-secondary hover:bg-surface-hover"
                >
                  {ocultas.size > 0 ? `Ver todas las series (${ocultas.size} fuera)` : "Ver todas las series"}
                </button>
              )}
            </div>
            <CurvaEquilibrio
              meses={meses}
              equilibrio={piso}
              moneda={moneda}
              enfoque={enfoque}
              pin={pin}
              ocultas={ocultas}
              haySimulacion={hayEscenario}
              onHover={setHover}
              onCiclar={ciclar}
            />
            <p className="px-4 py-2 text-[11px] text-fg-muted border-t border-line">
              {r.pisoVigente ? (
                <>
                  Piso mensual {fmtMonto(r.pisoVigente.base, moneda)}: lo que cuesta sostener la operación hoy,
                  sobre {r.pisoVigente.cuantos} costos vigentes. El promedio de los meses ya medidos daría{" "}
                  {fmtMonto(r.equilibrio.base, moneda)} ({r.equilibrio.mesesUsados.length} mes/es).
                </>
              ) : (
                <>
                  Piso mensual {fmtMonto(r.equilibrio.base, moneda)} ·{" "}
                  {VENTANA_EQUILIBRIO_LABEL[r.equilibrio.ventana]?.toLowerCase()} (
                  {r.equilibrio.mesesUsados.length} mes/es).
                </>
              )}
              {(r.pisoVigente?.metas ?? r.equilibrio.metas).length > 0 && (
                <>
                  {" "}
                  Meta sana:{" "}
                  {(r.pisoVigente?.metas ?? r.equilibrio.metas).map((m) => fmtMonto(m.monto, moneda)).join(" a ")}.
                </>
              )}
              {r.fx.tasas.length > 0 && <> Todo en {moneda}, convertido con la tasa de cada mes.</>}
            </p>
          </div>

          <DesgloseIngresos meses={meses} moneda={moneda} />

          <TablaMeses
            meses={meses}
            moneda={moneda}
            hayEscenario={hayEscenario}
            onEditar={editar}
            onReset={() => setEscenario({})}
            onIgualar={() => setEscenario(igualarAlEquilibrio(r.meses, piso))}
            onLimpiar={() => setEscenario(limpiarFacturado(r.meses))}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <EstructuraCostos estructura={r.estructura} moneda={moneda} />
            <ConfiabilidadDato calidad={r.calidad} imputacion={r.imputacion} />
          </div>

          {/* El cierre del reporte: la agenda para sentarse con el CFO. Va al final a
              propósito — primero se ve el año, después qué falta para creérselo. */}
          <InconsistenciasPanel inconsistencias={r.inconsistencias} moneda={moneda} />

          {r.equilibrio.mesesExcluidos.length > 0 && (
            <p className="text-[11px] text-fg-muted">
              Fuera del promedio:{" "}
              {r.equilibrio.mesesExcluidos
                .slice(0, 6)
                .map((m) => `${etiquetaMes(m.periodo)} (${m.motivo})`)
                .join(" · ")}
              {r.equilibrio.mesesExcluidos.length > 6 ? ` y ${r.equilibrio.mesesExcluidos.length - 6} más` : ""}.
            </p>
          )}
        </div>
      )}
    </>
  );
}
