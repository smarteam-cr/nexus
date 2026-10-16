"use client";

/**
 * «Simulación» — se elige un vendedor y Nexus calcula lo que generaría con la propuesta: sus ventas ganadas del año
 * (`VentaGanada`), su meta de HubSpot tramo por tramo y, si lidera el equipo de ventas, el bono trimestral por las
 * personas que lidera. Lo que falta decidir y se puede probar (el tope del bono, la meta de alguien nuevo) son controles.
 *
 * Nada se guarda: corregir si una venta es licencia, escribir el valor mensual o cambiar una decisión vive en esta
 * pantalla y se pierde al recargar. El cálculo es lib/finanzas/modelo-comisiones/reglas.ts.
 */
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { EmptyState, Input, Segmentado } from "@/components/ui";
import { BotonBlanco, BotonEnlace, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import {
  BONO_DEL_LIDER,
  DECISIONES_DE_LA_PROPUESTA,
  LICENCIA,
  MESES_DE_VENTAS,
  PORCENTAJE_DE_HOY,
  baseDelBono,
  bonoDelLider,
  bonoTrimestral,
  metaDelMes,
  simularVendedor,
  type AjusteDeVenta,
  type AQuienLeCuenta,
  type Decisiones,
  type ServicioSimulado,
} from "@/lib/finanzas/modelo-comisiones/reglas";
import type { DatosDeLaSimulacion } from "@/lib/finanzas/modelo-comisiones/cargar";
import { CLASE_DE_PILDORA, PILDORA, fechaCorta, miles, nombreDelMes, pct, usd, usd2 } from "./formato";

export default function SimulacionDeComisiones({ datos }: { datos: DatosDeLaSimulacion }) {
  const [vendedorId, setVendedorId] = useState(datos.vendedores[0]?.id ?? "");
  const [decisiones, setDecisiones] = useState<Decisiones>(DECISIONES_DE_LA_PROPUESTA);
  const [ajustes, setAjustes] = useState<Record<string, AjusteDeVenta>>({});
  const [periodoElegido, setPeriodoElegido] = useState<string | null>(null);
  const [tope, setTope] = useState<number>(BONO_DEL_LIDER.tope);

  const vendedor = datos.vendedores.find((v) => v.id === vendedorId) ?? datos.vendedores[0];
  const sim = useMemo(
    () => (vendedor ? simularVendedor({ anio: datos.anio, mesActual: datos.mesActual, ventas: vendedor.ventas, tramos: vendedor.tramos, decisiones, ajustes, moneda: vendedor.moneda }) : null),
    [vendedor, datos.anio, datos.mesActual, decisiones, ajustes],
  );
  // Quien lidera cobra bono por las personas que lidera: sus propias ventas no cuentan.
  const lideradas = useMemo(() => (vendedor?.lidera ? datos.equipoDeVentas.filter((p) => p.id !== vendedor.id) : []), [vendedor, datos.equipoDeVentas]);
  const bono = useMemo(
    () =>
      vendedor?.lidera
        ? bonoDelLider(
            datos.anio,
            datos.mesActual,
            datos.vendedores.filter((v) => lideradas.some((p) => p.id === v.id)).map((v) => v.tramos),
            tope,
          )
        : [],
    [vendedor, datos, lideradas, tope],
  );

  if (!vendedor || !sim) {
    return (
      <EmptyState
        variant="dashed"
        title="Nadie tiene una meta de ventas en HubSpot"
        description={`La simulación usa la meta de ${datos.anio} de cada persona. Cuando haya una meta de ventas en HubSpot, aparece acá al día siguiente.`}
      />
    );
  }

  const ajustar = (id: string, cambio: AjusteDeVenta) => setAjustes((a) => ({ ...a, [id]: { ...a[id], ...cambio } }));
  const totalBono = bono.reduce((a, t) => a + (t.bono ?? 0), 0);
  const total = sim.totalPorVentas + sim.totalPorLicencias + totalBono;
  const porTrimestre = decisiones.medida === "trimestre";
  const etiquetaDe = (numero: number, enCurso: boolean) => `${porTrimestre ? `Trimestre ${numero}` : nombreDelMes(numero)}${enCurso ? " · en curso" : ""}`;
  const elegido = sim.periodos.find((p) => p.clave === periodoElegido) ?? null;
  const servicios = elegido ? sim.servicios.filter((s) => s.periodo === elegido.clave) : sim.servicios;
  const licenciasSinValor = sim.licencias.filter((l) => l.laTrajoSmarteam && !l.valorMensual).length;
  const sinMeta = datos.equipoDeVentas.filter((p) => !p.tieneMeta);
  const nombreCorto = (n: string) => n.split(" ")[0];
  const nombres = (ps: { nombre: string }[]) => ps.map((p) => nombreCorto(p.nombre)).join(" y ");
  const lideradasSinMeta = lideradas.filter((p) => !p.tieneMeta);
  const pagado = total;
  const sobreLoVendido = sim.vendidoEnServicios > 0 ? ` · el ${String(Math.round((pagado / sim.vendidoEnServicios) * 1000) / 10).replace(".", ",")} % de lo vendido` : "";
  const metaDelAnio = vendedor.tramos.filter((t) => t.desde.startsWith(`${datos.anio}-`)).reduce((a, t) => a + t.monto, 0);

  return (
    <div className="space-y-6">
      <MetasEnHubspot datos={datos} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className={ROTULO_DEL_SISTEMA}>Vendedor</span>
          <Segmentado
            tamano="grande"
            etiqueta="Vendedor"
            valor={vendedor.id}
            onCambio={(id) => {
              setVendedorId(id);
              setPeriodoElegido(null);
            }}
            opciones={[
              ...datos.vendedores.map((v) => ({ clave: v.id, etiqueta: v.nombre })),
              ...sinMeta.map((p) => ({ clave: p.id, etiqueta: p.nombre, deshabilitada: true, title: "Todavía no tiene meta de ventas en HubSpot" })),
            ]}
          />
          <span className="text-xs text-fg-muted">
            {vendedor.rol}
            {vendedor.lidera ? " · lidera el equipo de ventas" : datos.equipoDeVentas.some((p) => p.id === vendedor.id) ? " · equipo de ventas" : " · fuera del equipo de ventas"}
          </span>
        </div>
        <span className="text-xs text-fg-muted">
          Ventas ganadas y meta de HubSpot de {datos.anio}
          {datos.metasAl ? `, al ${fechaCorta(datos.metasAl)}` : ""}
        </span>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_720px] flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Cifra rotulo="Por sus ventas" valor={usd(sim.totalPorVentas)} nota={`Servicios, con el porcentaje de cada ${porTrimestre ? "trimestre" : "mes"}`} />
            <Cifra
              rotulo="Por licencias"
              valor={usd(sim.totalPorLicencias)}
              nota={`${sim.licencias.length} licencia${sim.licencias.length === 1 ? "" : "s"}${licenciasSinValor ? ` · ${licenciasSinValor} sin valor mensual` : ""}`}
            />
            <Cifra
              rotulo="Bono de líder"
              valor={vendedor.lidera ? usd(totalBono) : "No aplica"}
              nota={
                vendedor.lidera
                  ? lideradas.length === 0
                    ? "Todavía no lidera a nadie"
                    : lideradasSinMeta.length === lideradas.length
                      ? `${nombres(lideradasSinMeta)} todavía no ${lideradasSinMeta.length === 1 ? "tiene" : "tienen"} meta en HubSpot`
                      : `Por ${nombres(lideradas)}, trimestres cerrados`
                  : "No lidera un equipo"
              }
            />
            <Cifra
              rotulo={`Total en ${datos.anio}`}
              valor={usd(total)}
              nota={`Ventas, licencias${vendedor.lidera ? " y bono" : ""}${sobreLoVendido}. Hoy, con el ${PORCENTAJE_DE_HOY} % fijo: ${usd(sim.conElPorcentajeDeHoy)}`}
              destacada
            />
          </div>

          <Caja
            titulo={porTrimestre ? "Trimestre por trimestre" : "Mes a mes"}
            detalle={`Meta de HubSpot del año: ${usd(metaDelAnio)}${vendedor.avance != null && metaDelAnio > 0 ? ` · lleva el ${pct(vendedor.avance / metaDelAnio)} según HubSpot` : ""}`}
            derecha={<span className="text-xs text-fg-muted">Toca un {porTrimestre ? "trimestre" : "mes"} para ver sus ventas</span>}
          >
            <table className="w-full min-w-[820px] border-collapse text-[13px] leading-[19px]">
              <thead>
                <tr>
                  <Th>{porTrimestre ? "Trimestre" : "Mes"}</Th>
                  <Th derecha>Meta</Th>
                  <Th derecha>Vendido</Th>
                  <Th>Cumplimiento</Th>
                  <Th derecha>Porcentaje</Th>
                  <Th derecha>Comisión</Th>
                </tr>
              </thead>
              <tbody>
                {sim.periodos.map((p) => {
                  const on = p.clave === periodoElegido;
                  return (
                    <tr key={p.clave} className={cn(on && "bg-info-surface")}>
                      <Td>
                        <button type="button" aria-pressed={on} onClick={() => setPeriodoElegido(on ? null : p.clave)} className="text-left font-semibold text-fg transition-colors hover:text-brand">
                          {etiquetaDe(p.numero, p.enCurso)}
                        </button>
                      </Td>
                      <Td derecha className="text-fg-muted">{p.meta == null ? "Sin meta" : usd(p.meta)}</Td>
                      <Td derecha>{usd(p.vendido)}</Td>
                      <Td className="min-w-[200px]">
                        <BarraDeCumplimiento cumplimiento={p.cumplimiento} />
                      </Td>
                      <Td derecha>
                        <span className={cn(CLASE_DE_PILDORA, p.porcentaje === 5 ? PILDORA.info : p.porcentaje === 4 ? PILDORA.neutra : PILDORA.atencion)}>{p.porcentaje} %</span>
                      </Td>
                      <Td derecha className="font-semibold">{usd(p.comision)}</Td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-surface-muted font-semibold">
                  <Td pie>Año</Td>
                  <Td pie derecha className="font-normal text-fg-muted">{usd(metaDelAnio)}</Td>
                  <Td pie derecha>{usd(sim.vendidoEnServicios)}</Td>
                  <Td pie />
                  <Td pie />
                  <Td pie derecha>{usd(sim.totalPorVentas)}</Td>
                </tr>
              </tfoot>
            </table>
          </Caja>

          <Caja
            titulo={elegido ? `Ventas de ${etiquetaDe(elegido.numero, false)}` : "Ventas de servicios del año"}
            detalle="Nexus deduce del nombre del trato si es servicio o licencia; cámbialo si se equivocó."
            derecha={elegido ? <BotonEnlace onClick={() => setPeriodoElegido(null)}>Ver todo el año</BotonEnlace> : null}
          >
            <table className="w-full min-w-[900px] border-collapse text-[13px] leading-[19px]">
              <thead>
                <tr>
                  <Th>Firma</Th>
                  <Th>Venta</Th>
                  <Th derecha>Monto</Th>
                  <Th>A quién le cuenta</Th>
                  <Th derecha>%</Th>
                  <Th derecha>Comisión</Th>
                </tr>
              </thead>
              <tbody>
                {servicios.length === 0 && (
                  <tr>
                    <Td className="text-fg-muted">—</Td>
                    <Td className="text-fg-muted">Sin ventas de servicios en este período.</Td>
                    <Td />
                    <Td />
                    <Td />
                    <Td />
                  </tr>
                )}
                {servicios.map((s) => (
                  <FilaDeServicio key={s.venta.id} s={s} anio={datos.anio} onEsLicencia={() => ajustar(s.venta.id, { tipo: "licencia" })} />
                ))}
              </tbody>
            </table>
          </Caja>

          <Caja
            titulo="Licencias del año"
            detalle={`${LICENCIA.porcentaje} % del valor mensual durante ${LICENCIA.meses} meses. HubSpot no guarda el valor mensual en el trato: escríbelo para calcular.`}
          >
            <table className="w-full min-w-[900px] border-collapse text-[13px] leading-[19px]">
              <thead>
                <tr>
                  <Th>Firma</Th>
                  <Th>Licencia</Th>
                  <Th>¿Quién la trajo?</Th>
                  <Th derecha>Valor mensual</Th>
                  <Th derecha>Comisión</Th>
                </tr>
              </thead>
              <tbody>
                {sim.licencias.length === 0 && (
                  <tr>
                    <Td className="text-fg-muted">—</Td>
                    <Td className="text-fg-muted">Sin licencias en el año.</Td>
                    <Td />
                    <Td />
                    <Td />
                  </tr>
                )}
                {sim.licencias.map((l) => (
                  <tr key={l.venta.id}>
                    <Td className="whitespace-nowrap tabular-nums text-fg-muted">{fechaCorta(l.venta.fecha)}</Td>
                    <Td className="max-w-[320px]">
                      <NombreDeVenta nombre={l.venta.nombre} cliente={l.venta.cliente}>
                        <BotonCorregir onClick={() => ajustar(l.venta.id, { tipo: "servicio" })}>Es un servicio</BotonCorregir>
                      </NombreDeVenta>
                    </Td>
                    <Td>
                      <Segmentado
                        etiqueta={`Quién trajo ${l.venta.nombre}`}
                        valor={l.laTrajoSmarteam ? "smarteam" : "hubspot"}
                        onCambio={(k) => ajustar(l.venta.id, { laTrajoSmarteam: k === "smarteam" })}
                        opciones={[
                          { clave: "smarteam", etiqueta: "Smarteam" },
                          { clave: "hubspot", etiqueta: "La refirió HubSpot" },
                        ]}
                      />
                    </Td>
                    <Td derecha>
                      <div className="flex flex-col items-end gap-0.5">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          aria-label={`Valor mensual de ${l.venta.nombre}`}
                          value={l.valorMensual || ""}
                          placeholder="0"
                          onChange={(e) => ajustar(l.venta.id, { valorMensual: Math.max(0, Number(e.target.value) || 0) })}
                          className="h-[30px] w-24 px-2 py-0 text-right text-[13px] tabular-nums"
                        />
                        <span className="text-xs leading-4 text-fg-muted">{l.valorEscrito ? "Lo escribiste tú" : l.venta.monto ? `Supone que ${usd(l.venta.monto)} es el año` : "Sin monto en HubSpot"}</span>
                      </div>
                    </Td>
                    <Td derecha className={cn("font-semibold", l.laTrajoSmarteam && l.valorMensual ? "text-fg" : "text-fg-muted")}>
                      {!l.laTrajoSmarteam ? "No comisiona" : l.valorMensual ? usd2(l.comision) : "Falta el valor"}
                    </Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-muted font-semibold">
                  <Td pie>Total</Td>
                  <Td pie />
                  <Td pie />
                  <Td pie />
                  <Td pie derecha>{usd2(sim.totalPorLicencias)}</Td>
                </tr>
              </tfoot>
            </table>
          </Caja>

          {vendedor.lidera && (
            <Caja
              titulo="Bono de quien lidera el equipo de ventas"
              detalle={`Lidera a ${lideradas.length ? nombres(lideradas) : "nadie todavía"}. Gana ${usd(BONO_DEL_LIDER.porPersonaAlMes)} al mes por cada persona que llega a su meta, en proporción a lo que cumplió, desde el ${BONO_DEL_LIDER.minimo * 100} %. Sus propias ventas le dan comisión, no bono. Se paga el mes siguiente de cerrar el trimestre.`}
            >
              <table className="w-full min-w-[820px] border-collapse text-[13px] leading-[19px]">
                <thead>
                  <tr>
                    <Th>Trimestre</Th>
                    <Th derecha>Personas con meta</Th>
                    <Th derecha>Su meta</Th>
                    <Th derecha>Vendieron</Th>
                    <Th>Cumplimiento</Th>
                    <Th derecha>Bono</Th>
                    <Th derecha>Con el 2 % de cada venta</Th>
                  </tr>
                </thead>
                <tbody>
                  {bono.map((t) => (
                    <tr key={t.numero}>
                      <Td className="font-semibold">Trimestre {t.numero}</Td>
                      <Td derecha className="text-fg-muted">{t.personas}</Td>
                      <Td derecha className="text-fg-muted">{t.personas ? usd(t.meta) : "—"}</Td>
                      <Td derecha>{t.personas && t.vendido != null ? usd(t.vendido) : "—"}</Td>
                      <Td className="min-w-[200px]">
                        {t.personas ? <BarraDeCumplimiento cumplimiento={t.cumplimiento} escala={tope * 1.25} marca={BONO_DEL_LIDER.minimo} /> : <span className="text-xs text-fg-muted">Nadie con meta</span>}
                      </Td>
                      <Td derecha>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-semibold">{t.bono == null ? "En curso" : usd(t.bono)}</span>
                          <span className="text-xs leading-4 text-fg-muted">
                            {t.bono == null
                              ? "Se calcula al cerrar"
                              : !t.personas
                                ? "Sin personas con meta"
                                : (t.cumplimiento ?? 0) < BONO_DEL_LIDER.minimo
                                  ? `Bajo el mínimo del ${BONO_DEL_LIDER.minimo * 100} %`
                                  : (t.cumplimiento ?? 0) > tope
                                    ? `Con tope del ${tope * 100} %`
                                    : `${usd(t.base)} × ${pct(t.cumplimiento ?? 0)}`}
                          </span>
                        </div>
                      </Td>
                      <Td derecha className="text-fg-muted">{t.conElDosPorCiento == null || !t.personas ? "—" : usd(t.conElDosPorCiento)}</Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-muted font-semibold">
                    <Td pie>Año</Td>
                    <Td pie />
                    <Td pie />
                    <Td pie />
                    <Td pie />
                    <Td pie derecha>{usd(totalBono)}</Td>
                    <Td pie derecha className="font-normal text-fg-muted">{usd(bono.reduce((a, t) => a + (t.personas ? (t.conElDosPorCiento ?? 0) : 0), 0))}</Td>
                  </tr>
                </tfoot>
              </table>
              {lideradasSinMeta.length > 0 && (
                <SiAlguienNuevo nombre={nombreCorto(lideradasSinMeta[0].nombre)} lider={nombreCorto(vendedor.nombre)} tope={tope} />
              )}
            </Caja>
          )}
        </div>

        <aside className="flex min-w-[280px] max-w-[340px] flex-[1_1_300px] flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-xl border border-warn-line bg-surface p-4">
            <div className="flex flex-col gap-0.5">
              <span className={cn(ROTULO_DEL_SISTEMA, "text-warn-ink")}>Lo que falta decidir</span>
              <span className="text-xs leading-4 text-fg-muted">Lo que se puede probar acá. Cambia la respuesta y el cálculo se rehace.</span>
            </div>
            <div>
              <Decision
                pregunta="¿El bono de quien lidera deja de crecer en el 200 % o en el 150 %?"
                efecto="La comisión de quien vende no tiene tope: este tope es solo del bono de quien lidera."
              >
                <Segmentado
                  etiqueta="Tope del bono"
                  valor={tope === BONO_DEL_LIDER.topeAlternativo ? "150" : "200"}
                  onCambio={(k) => setTope(k === "150" ? BONO_DEL_LIDER.topeAlternativo : BONO_DEL_LIDER.tope)}
                  opciones={[
                    { clave: "200", etiqueta: "200 %" },
                    { clave: "150", etiqueta: "150 %" },
                  ]}
                />
              </Decision>
            </div>
            <BotonBlanco
              className="self-start"
              onClick={() => {
                setDecisiones(DECISIONES_DE_LA_PROPUESTA);
                setAjustes({});
                setPeriodoElegido(null);
                setTope(BONO_DEL_LIDER.tope);
              }}
            >
              Volver a lo de la propuesta
            </BotonBlanco>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
            <span className={ROTULO_DEL_SISTEMA}>Lo que el cálculo supone</span>
            <ul className="flex flex-col gap-1.5 text-[13px] leading-[19px] text-fg-secondary">
              <li>○ Muestra lo que genera cada venta. Finanzas la paga el mes siguiente a cada cobro.</li>
              <li>○ Una venta a un cliente pasados sus primeros {MESES_DE_VENTAS} meses es de quien creó el negocio: acá, quien es dueño del trato en HubSpot.</li>
              <li>○ Una venta sin empresa en Nexus cuenta como cliente nuevo.</li>
              <li>○ La meta es solo de servicios: las licencias no suman, aunque HubSpot cuente las que tienen monto en el avance de la meta.</li>
              <li>○ Una venta en otra moneda no se suma.</li>
              <li>○ La meta del mes es la del trimestre de HubSpot repartida por días, como su desglose mensual.</li>
              <li>○ Una licencia del pipeline «HubSpot Shared Selling» la refirió HubSpot.</li>
              <li>○ El equipo de ventas es quien tiene el rol de Ventas en Nexus. Lo lidera quien lleva más tiempo en él, y su bono sale de las metas de los demás.</li>
            </ul>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
            <span className={ROTULO_DEL_SISTEMA}>Para comparar</span>
            <div className="flex justify-between gap-3 text-[13px] leading-[19px]">
              <span>Con el {PORCENTAJE_DE_HOY} % fijo de hoy</span>
              <span className="font-semibold tabular-nums">{usd(sim.conElPorcentajeDeHoy)}</span>
            </div>
            <span className="text-xs leading-4 text-fg-muted">Las mismas ventas de servicios, con el {PORCENTAJE_DE_HOY} % parejo que se usa hoy.</span>
            {vendedor.pagadoEnElAnio > 0 && (
              <div className="flex justify-between gap-3 text-[13px] leading-[19px]">
                <span>Se le pagó en {datos.anio}</span>
                <span className="font-semibold tabular-nums">{usd(vendedor.pagadoEnElAnio)}</span>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Las piezas ─────────────────────────────────────────────────────────────────

function Cifra({ rotulo, valor, nota, destacada = false }: { rotulo: string; valor: string; nota: string; destacada?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-xl border px-4 py-3.5", destacada ? "border-info-line bg-info-surface" : "border-line bg-surface")}>
      <span className={cn(ROTULO_DEL_SISTEMA, destacada && "text-info-ink")}>{rotulo}</span>
      <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">{valor}</span>
      <span className={cn("text-xs leading-4", destacada ? "text-fg-secondary" : "text-fg-muted")}>{nota}</span>
    </div>
  );
}

function Caja({ titulo, detalle, derecha, children }: { titulo: string; detalle?: string; derecha?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-x-auto rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-4 pb-3 pt-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold text-fg">{titulo}</h2>
          {detalle && <span className="text-xs leading-4 text-fg-muted">{detalle}</span>}
        </div>
        {derecha}
      </div>
      {children}
    </section>
  );
}

function Th({ children, derecha = false }: { children?: ReactNode; derecha?: boolean }) {
  return <th className={cn("whitespace-nowrap border-b border-line bg-surface-muted px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted", derecha ? "text-right" : "text-left")}>{children}</th>;
}

function Td({ children, derecha = false, pie = false, className }: { children?: ReactNode; derecha?: boolean; pie?: boolean; className?: string }) {
  return <td className={cn("px-3 align-middle", pie ? "border-t border-line py-3" : "border-b border-line py-2.5", derecha && "whitespace-nowrap text-right tabular-nums", className)}>{children}</td>;
}

/** La barra de cumplimiento: llena hasta el doble de la meta, con una marca en la meta (o en `marca`). */
function BarraDeCumplimiento({ cumplimiento, escala = 2, marca = 1 }: { cumplimiento: number | null; escala?: number; marca?: number }) {
  if (cumplimiento == null) return <span className="text-xs text-fg-muted">Sin meta</span>;
  const tono = cumplimiento >= 1 ? "bg-brand" : cumplimiento >= 0.5 ? "bg-brand-light" : "bg-fg-muted";
  return (
    <div className="flex items-center gap-2">
      <span className="relative block h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <span className={cn("absolute inset-y-0 left-0", tono)} style={{ width: `${Math.min(100, (cumplimiento / escala) * 100)}%` }} />
        <span aria-hidden className="absolute inset-y-0 w-px bg-line" style={{ left: `${(marca / escala) * 100}%` }} />
      </span>
      <span className="min-w-[40px] text-right text-xs tabular-nums text-fg-secondary">{pct(cumplimiento)}</span>
    </div>
  );
}

function NombreDeVenta({ nombre, cliente, children }: { nombre: string; cliente: string | null; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-semibold text-fg">{nombre}</span>
      <span className="text-xs leading-4 text-fg-muted">{cliente ?? "Sin empresa en Nexus"}</span>
      {children}
    </div>
  );
}

function BotonCorregir({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="self-start py-0.5 text-xs text-fg-muted underline-offset-2 transition-colors hover:text-fg hover:underline">
      {children}
    </button>
  );
}

const COMO: Record<AQuienLeCuenta["como"], { texto: string; tono: keyof typeof PILDORA }> = {
  sinEmpresa: { texto: "Ventas", tono: "bien" },
  clienteNuevo: { texto: "Cliente nuevo · Ventas", tono: "bien" },
  primerosMeses: { texto: `Primeros ${MESES_DE_VENTAS} meses · Ventas`, tono: "bien" },
  expansion: { texto: "Expansión que inició Ventas", tono: "info" },
};

function FilaDeServicio({ s, anio, onEsLicencia }: { s: ServicioSimulado; anio: number; onEsLicencia: () => void }) {
  const v = s.venta;
  let pildora: { texto: string; tono: keyof typeof PILDORA };
  let motivo: string;
  if (s.tipo === "otraMoneda") {
    pildora = { texto: "No se suma", tono: "neutra" };
    motivo = `En ${v.moneda}: el cálculo es en dólares`;
  } else if (s.tipo === "sinMonto") {
    pildora = { texto: "Sin monto en HubSpot", tono: "atencion" };
    motivo = "Comisiona cuando tenga monto";
  } else {
    const a = s.aQuien!;
    pildora = a.como === "expansion" && a.parte < 1 ? { texto: "Expansión · 50 · 50 con CS", tono: "info" } : COMO[a.como];
    motivo =
      a.como === "sinEmpresa"
        ? "Sin empresa en Nexus: cliente nuevo"
        : a.como === "clienteNuevo"
          ? "Es su primera venta"
          : a.como === "primerosMeses"
            ? `Primera venta: ${fechaCorta(v.primeraVenta!, anio)}`
            : `Cliente desde ${v.primeraVenta!.slice(0, 4)}${a.parte < 1 ? " · la otra mitad es de Customer Success" : " · completa para quien la inició"}`;
  }
  return (
    <tr>
      <Td className="whitespace-nowrap tabular-nums text-fg-muted">{fechaCorta(v.fecha)}</Td>
      <Td className="max-w-[320px]">
        <NombreDeVenta nombre={v.nombre} cliente={v.cliente}>
          {s.tipo !== "otraMoneda" && <BotonCorregir onClick={onEsLicencia}>Es una licencia</BotonCorregir>}
        </NombreDeVenta>
      </Td>
      <Td derecha>{v.monto ? (v.moneda === "USD" ? usd(v.monto) : `${v.moneda} ${miles(v.monto)}`) : "—"}</Td>
      <Td>
        <div className="flex flex-col items-start gap-1">
          <span className={cn(CLASE_DE_PILDORA, PILDORA[pildora.tono])}>{pildora.texto}</span>
          <span className="text-xs leading-4 text-fg-muted">{motivo}</span>
        </div>
      </Td>
      <Td derecha className="text-fg-secondary">{s.porcentaje == null ? "—" : `${s.porcentaje} %${s.aQuien && s.aQuien.parte < 1 ? " × ½" : ""}`}</Td>
      <Td derecha className={cn("font-semibold", s.comision == null ? "text-fg-muted" : "text-fg")}>{s.comision == null ? "—" : usd2(s.comision)}</Td>
    </tr>
  );
}

function Decision({ pregunta, efecto, children }: { pregunta: string; efecto: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line py-3.5 first:pt-0 last:border-b-0 last:pb-0">
      <span className="text-[13px] font-semibold leading-[19px] text-fg">{pregunta}</span>
      {children}
      <span className="text-xs leading-4 text-fg-muted">{efecto}</span>
    </div>
  );
}

/**
 * Lo que cobraría quien lidera por alguien nuevo que todavía no tiene meta en HubSpot (Liz, octubre de 2026): se escribe su
 * meta del trimestre y lo que vende, y sale el bono. Sirve para ver qué pasa en su rampa con la meta completa o reducida.
 */
function SiAlguienNuevo({ nombre, lider, tope }: { nombre: string; lider: string; tope: number }) {
  const [meta, setMeta] = useState(90000);
  const [vendido, setVendido] = useState(63000);
  const base = baseDelBono(1);
  const cumplimiento = meta > 0 ? vendido / meta : 0;
  const bono = bonoTrimestral(base, cumplimiento, tope);
  const minimo = meta * BONO_DEL_LIDER.minimo;
  return (
    <div className="mx-4 mb-4 mt-3 flex flex-col gap-3 rounded-[10px] border border-line bg-surface-muted p-4">
      <div className="flex flex-col gap-0.5">
        <span className={ROTULO_DEL_SISTEMA}>Si {nombre} tuviera meta</span>
        <span className="text-xs leading-4 text-fg-muted">
          Prueba un trimestre de {nombre}. Con la meta completa de US$ 90.000, {lider} cobra algo recién cuando {nombre} vende {usd(90000 * BONO_DEL_LIDER.minimo)} (
          {usd((90000 * BONO_DEL_LIDER.minimo) / 3)} al mes). Para ver su rampa, baja la meta.
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13px] text-fg-secondary">
          Meta de {nombre} en el trimestre
          <Input
            type="number"
            min={0}
            step={1000}
            inputMode="numeric"
            value={meta || ""}
            onChange={(e) => setMeta(Math.max(0, Number(e.target.value) || 0))}
            className="h-8 px-2 py-0 text-[13px] tabular-nums"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="vendido-nuevo" className="text-[13px] text-fg-secondary">
              Lo que vende {nombre}
            </label>
            <span className="font-semibold tabular-nums text-fg">{usd(vendido)}</span>
          </div>
          <input id="vendido-nuevo" type="range" min={0} max={200000} step={1000} value={vendido} onChange={(e) => setVendido(Number(e.target.value))} className="w-full accent-brand" />
        </div>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[13px] leading-[19px]">
        <span>
          Cumplimiento <span className="font-semibold tabular-nums">{pct(cumplimiento)}</span>
        </span>
        <span>
          Bono de {lider} <span className="font-semibold tabular-nums">{usd(bono)}</span> en el trimestre
        </span>
        <span className="text-fg-muted">{cumplimiento < BONO_DEL_LIDER.minimo ? `Le faltan ${usd(minimo - vendido)} para el mínimo del ${BONO_DEL_LIDER.minimo * 100} %.` : `${usd(base)} × ${pct(Math.min(cumplimiento, tope))}`}</span>
      </div>
    </div>
  );
}

/** La meta de la empresa de la que se habló en la reunión del 2026-10-15: todavía no está decidida. */
const META_DE_LA_EMPRESA_EN_CONVERSACION = "US$ 80.000–90.000 al mes";

/**
 * «Las metas en HubSpot»: la meta de cada persona en el mes en curso y en el año, con lo que lleva. Lo del mes lo suma Nexus
 * con los negocios ganados, como el desglose mensual de HubSpot (con las licencias que tienen monto); lo del año es el
 * avance que da HubSpot. Al pie, lo que suman todas las metas contra la meta de la empresa, que todavía no está decidida.
 */
function MetasEnHubspot({ datos }: { datos: DatosDeLaSimulacion }) {
  const mes = `${datos.anio}-${String(datos.mesActual).padStart(2, "0")}`;
  const nombreMes = nombreDelMes(datos.mesActual);
  const filas = datos.vendedores.map((v) => {
    const metaMes = metaDelMes(v.tramos, mes) ?? 0;
    const vendidoMes = v.ventas.filter((x) => x.fecha.startsWith(mes) && x.moneda === v.moneda).reduce((a, x) => a + (x.monto ?? 0), 0);
    const metaAnio = v.tramos.filter((t) => t.desde.startsWith(`${datos.anio}-`)).reduce((a, t) => a + t.monto, 0);
    return { id: v.id, nombre: v.nombre, metaMes, vendidoMes, metaAnio, avanceAnio: v.avance };
  });
  const sinMeta = datos.equipoDeVentas.filter((p) => !p.tieneMeta);
  const total = filas.reduce(
    (a, f) => ({ metaMes: a.metaMes + f.metaMes, vendidoMes: a.vendidoMes + f.vendidoMes, metaAnio: a.metaAnio + f.metaAnio, avanceAnio: a.avanceAnio + (f.avanceAnio ?? 0) }),
    { metaMes: 0, vendidoMes: 0, metaAnio: 0, avanceAnio: 0 },
  );
  const parte = (x: number, de: number) => (de > 0 ? pct(x / de) : "—");
  return (
    <section className="overflow-x-auto rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-4 pb-3 pt-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold text-fg">Las metas en HubSpot</h2>
          <span className="text-xs leading-4 text-fg-muted">
            La meta de cada persona en {nombreMes} y en el año. Lo de {nombreMes} sale de los negocios ganados, como lo cuenta HubSpot; lo del año es el avance de su
            meta en HubSpot.
          </span>
        </div>
        {datos.metasAl && <span className="text-xs text-fg-muted">Al {fechaCorta(datos.metasAl)}</span>}
      </div>
      <table className="w-full min-w-[820px] border-collapse text-[13px] leading-[19px]">
        <thead>
          <tr>
            <Th>Persona</Th>
            <Th derecha>Meta de {nombreMes}</Th>
            <Th derecha>Vendido en {nombreMes}</Th>
            <Th derecha>%</Th>
            <Th derecha>Meta del año</Th>
            <Th derecha>Lleva en el año</Th>
            <Th derecha>%</Th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <Td className="font-semibold">{f.nombre}</Td>
              <Td derecha className="text-fg-muted">{f.metaMes ? usd(f.metaMes) : "—"}</Td>
              <Td derecha>{usd(f.vendidoMes)}</Td>
              <Td derecha className="text-fg-secondary">{parte(f.vendidoMes, f.metaMes)}</Td>
              <Td derecha className="text-fg-muted">{usd(f.metaAnio)}</Td>
              <Td derecha>{f.avanceAnio == null ? "—" : usd(f.avanceAnio)}</Td>
              <Td derecha className="text-fg-secondary">{f.avanceAnio == null ? "—" : parte(f.avanceAnio, f.metaAnio)}</Td>
            </tr>
          ))}
          {sinMeta.map((p) => (
            <tr key={p.id}>
              <Td className="font-semibold">{p.nombre}</Td>
              <Td className="text-fg-muted">Sin meta en HubSpot</Td>
              <Td />
              <Td />
              <Td />
              <Td />
              <Td />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-surface-muted font-semibold">
            <Td pie>Suman</Td>
            <Td pie derecha>{usd(total.metaMes)}</Td>
            <Td pie derecha>{usd(total.vendidoMes)}</Td>
            <Td pie derecha>{parte(total.vendidoMes, total.metaMes)}</Td>
            <Td pie derecha>{usd(total.metaAnio)}</Td>
            <Td pie derecha>{usd(total.avanceAnio)}</Td>
            <Td pie derecha>{parte(total.avanceAnio, total.metaAnio)}</Td>
          </tr>
        </tfoot>
      </table>
      <p className="px-4 py-3 text-xs leading-4 text-fg-muted">
        Meta de la empresa: por definir. En la reunión con Marco se habló de {META_DE_LA_EMPRESA_EN_CONVERSACION}; las metas de hoy suman {usd(total.metaMes)} en{" "}
        {nombreMes}.
      </p>
    </section>
  );
}
