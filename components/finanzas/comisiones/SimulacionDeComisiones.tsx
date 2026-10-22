"use client";

/**
 * «Simulación» — se elige una persona y Nexus calcula lo que generaría con el modelo cerrado con Marco (2026-10-21): sus
 * ventas ganadas del año (`VentaGanada`), su meta de HubSpot tramo por tramo y, si lidera el equipo de ventas, el bono
 * por lo que vendieron las personas que lidera. Las personas de Customer Success y el área tienen su propia vista
 * (./SimulacionDeCustomerSuccess.tsx). Super Admin ve a todos, las metas de HubSpot y los techos; cada persona, lo suyo
 * (el servidor ya cargó solo eso: lib/finanzas/modelo-comisiones/cargar.ts).
 *
 * «Descuento y valor de 12 meses» compara cada venta de servicios con el antes (el descuento dentro de la base): las dos
 * salen de `simularVendedor`.
 *
 * Nada se guarda: corregir si una venta es licencia, si se cayó, el valor mensual o si una renovación fue a tiempo vive
 * en esta pantalla y se pierde al recargar. El cálculo es lib/finanzas/modelo-comisiones/reglas.ts.
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { EmptyState, Input, Segmentado } from "@/components/ui";
import { BotonEnlace, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import {
  BONO_DEL_LIDER,
  DIAS_PARA_CAERSE,
  LICENCIA,
  MESES_DEL_VALOR,
  MESES_DE_VENTAS,
  PORCENTAJE_DE_HOY,
  TOPE_DE_LOS_BONOS,
  bonoDelLider,
  bonoDelLiderPorPersona,
  metaDelMes,
  simularVendedor,
  type AjusteDeVenta,
} from "@/lib/finanzas/modelo-comisiones/reglas";
import type { DatosDeLaSimulacion, VendedorParaSimular } from "@/lib/finanzas/modelo-comisiones/cargar";
import { CLASE_DE_PILDORA, PILDORA, fechaCorta, nombreDelMes, pct, usd, usd2 } from "./formato";
import { BarraDeCumplimiento, BotonCorregir, Caja, Cifra, FilaDeServicio, FilaDeValor, FilaVacia, NombreDeVenta, Td, Th } from "./PiezasDeLaSimulacion";
import { VistaDeCustomerSuccess, VistaDelArea } from "./SimulacionDeCustomerSuccess";
import TechosDeComisiones from "./TechosDeComisiones";

type Ajustes = Record<string, AjusteDeVenta>;

export default function SimulacionDeComisiones({ datos }: { datos: DatosDeLaSimulacion }) {
  const enVentas = new Set(datos.vendedores.map((v) => v.id));
  const personasCs = datos.customerSuccess.personas.filter((p) => !enVentas.has(p.id));
  const opciones = [
    ...datos.vendedores.map((v) => ({ clave: `v:${v.id}`, etiqueta: v.nombre })),
    ...datos.equipoDeVentas.filter((p) => !p.tieneMeta).map((p) => ({ clave: `sin:${p.id}`, etiqueta: p.nombre, deshabilitada: true, title: "Todavía no tiene meta de ventas en HubSpot" })),
    ...personasCs.map((p) => ({ clave: `cs:${p.id}`, etiqueta: p.nombre })),
    ...(datos.customerSuccess.area ? [{ clave: "area", etiqueta: "Área de Customer Success" }] : []),
  ];
  const inicial = opciones.find((o) => !("deshabilitada" in o) && o.clave.endsWith(`:${datos.quienMira}`))?.clave ?? opciones.find((o) => !("deshabilitada" in o))?.clave ?? "";
  const [quien, setQuien] = useState(inicial);
  const [ajustes, setAjustes] = useState<Ajustes>({});
  const ajustar = (id: string, cambio: AjusteDeVenta) => setAjustes((a) => ({ ...a, [id]: { ...a[id], ...cambio } }));

  const vendedor = quien.startsWith("v:") ? datos.vendedores.find((v) => `v:${v.id}` === quien) : undefined;
  const personaCs = quien.startsWith("cs:") ? personasCs.find((p) => `cs:${p.id}` === quien) : undefined;

  if (!quien) {
    return (
      <EmptyState
        variant="dashed"
        title={datos.todo ? "Nadie tiene una meta de ventas en HubSpot" : "Todavía no tienes una meta de ventas en HubSpot"}
        description={`La simulación usa la meta de ${datos.anio} de cada persona. Cuando esté en HubSpot, aparece acá al día siguiente.`}
      />
    );
  }

  return (
    <div className="space-y-6">
      {datos.todo && <MetasEnHubspot datos={datos} />}
      {datos.todo && <TechosDeComisiones datos={datos} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {opciones.length > 1 && (
            <>
              <span className={ROTULO_DEL_SISTEMA}>Persona</span>
              <Segmentado tamano="grande" etiqueta="Persona" valor={quien} onCambio={setQuien} opciones={opciones} />
            </>
          )}
        </div>
        <span className="text-xs text-fg-muted">
          Rige desde el 1 de noviembre de 2026: lo de antes se calcula como si hubiera regido, para comparar.
        </span>
      </div>

      {vendedor ? (
        <VistaDeVendedor key={vendedor.id} datos={datos} vendedor={vendedor} ajustes={ajustes} ajustar={ajustar} />
      ) : personaCs ? (
        <VistaDeCustomerSuccess key={personaCs.id} datos={datos} persona={personaCs} ajustes={ajustes} ajustar={ajustar} />
      ) : (
        <VistaDelArea datos={datos} ajustes={ajustes} ajustar={ajustar} />
      )}
    </div>
  );
}

/** Quien vende: su comisión mes a mes, sus ventas y, si lidera, el bono por las personas que lidera. */
function VistaDeVendedor({ datos, vendedor, ajustes, ajustar }: { datos: DatosDeLaSimulacion; vendedor: VendedorParaSimular; ajustes: Ajustes; ajustar: (id: string, c: AjusteDeVenta) => void }) {
  const [periodoElegido, setPeriodoElegido] = useState<string | null>(null);
  const sim = useMemo(
    () => simularVendedor({ anio: datos.anio, mesActual: datos.mesActual, ajustes, moneda: vendedor.moneda, ventas: vendedor.ventas, tramos: vendedor.tramos }),
    [vendedor, datos.anio, datos.mesActual, ajustes],
  );
  // El antes: el descuento dentro de la base.
  const simAntes = useMemo(
    () => simularVendedor({ anio: datos.anio, mesActual: datos.mesActual, ajustes, moneda: vendedor.moneda, ventas: vendedor.ventas, tramos: vendedor.tramos, descuentoDentro: true }),
    [vendedor, datos.anio, datos.mesActual, ajustes],
  );
  // Quien lidera cobra bono por lo que venden las personas que lidera: sus propias ventas no cuentan.
  const lideradas = vendedor.lidera ? datos.equipoDeVentas.filter((p) => p.id !== vendedor.id) : [];
  const bono = useMemo(() => {
    if (!vendedor.lidera) return [];
    const ids = new Set(datos.equipoDeVentas.filter((p) => p.id !== vendedor.id).map((p) => p.id));
    return bonoDelLider(
      datos.mesActual,
      datos.vendedores
        .filter((v) => ids.has(v.id))
        .map((v) => ({ nombre: v.nombre, periodos: simularVendedor({ anio: datos.anio, mesActual: datos.mesActual, ajustes, moneda: v.moneda, ventas: v.ventas, tramos: v.tramos }).periodos })),
    );
  }, [vendedor, datos, ajustes]);

  const totalBono = bono.reduce((a, t) => a + t.bono, 0);
  const total = sim.totalPorVentas + sim.totalPorLicencias + totalBono;
  const elegido = sim.periodos.find((p) => p.clave === periodoElegido) ?? null;
  const servicios = elegido ? sim.servicios.filter((s) => s.periodo === elegido.clave) : sim.servicios;
  const licenciasSinValor = sim.licencias.filter((l) => l.laTrajoSmarteam && !l.valorMensual).length;
  const nombreCorto = (n: string) => n.split(" ")[0];
  const nombres = (ps: { nombre: string }[]) => ps.map((p) => nombreCorto(p.nombre)).join(" y ");
  const lideradasSinMeta = lideradas.filter((p) => !p.tieneMeta);
  const sobreLoVendido = sim.vendidoEnServicios > 0 ? ` · el ${String(Math.round((total / sim.vendidoEnServicios) * 1000) / 10).replace(".", ",")} % de lo vendido` : "";
  const comisionAntesDe = new Map(simAntes.servicios.map((x) => [x.venta.id, x.comision ?? 0]));
  const conValor = servicios.filter((x) => x.valor && x.partes && !x.seCayo && x.aQuien?.como !== "renovacion");
  const diferencia = sim.totalPorVentas - simAntes.totalPorVentas;
  const metaDelAnio = vendedor.tramos.filter((t) => t.desde.startsWith(`${datos.anio}-`)).reduce((a, t) => a + t.monto, 0);
  const hayADescontar = sim.totalADescontar > 0;

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[999_1_720px] flex-col gap-4">
        <span className="text-xs text-fg-muted">
          {vendedor.rol}
          {vendedor.lidera ? " · lidera el equipo de ventas" : datos.equipoDeVentas.some((p) => p.id === vendedor.id) ? " · equipo de ventas" : " · fuera del equipo de ventas"} · Ventas
          ganadas y meta de HubSpot de {datos.anio}
          {datos.metasAl ? `, al ${fechaCorta(datos.metasAl)}` : ""}
        </span>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Cifra
            rotulo="Por sus ventas"
            valor={usd(sim.totalPorVentas)}
            nota={`Servicios, con el porcentaje de cada mes${diferencia !== 0 ? ` · ${diferencia > 0 ? "+" : "−"}${usd(Math.abs(diferencia)).replace("−", "")} por los descuentos` : ""}${hayADescontar ? ` · ${usd(sim.totalADescontar)} a descontar por ventas que se cayeron` : ""}`}
          />
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
                    : `Por ${nombres(lideradas)}, rige desde enero de 2027`
                : "No lidera un equipo"
            }
          />
          <Cifra
            rotulo={`Total en ${datos.anio}`}
            valor={usd(total)}
            nota={`Ventas, licencias${vendedor.lidera ? " y bono" : ""}${sobreLoVendido}. Con el ${PORCENTAJE_DE_HOY} % fijo de antes: ${usd(sim.conElPorcentajeDeHoy)}`}
            destacada
          />
        </div>

        <Caja
          titulo="Mes a mes"
          detalle={`Meta de HubSpot del año: ${usd(metaDelAnio)}${vendedor.avance != null && metaDelAnio > 0 ? ` · lleva el ${pct(vendedor.avance / metaDelAnio)} según HubSpot` : ""}`}
          derecha={<span className="text-xs text-fg-muted">Toca un mes para ver sus ventas</span>}
        >
          <table className="w-full min-w-[820px] border-collapse text-[13px] leading-[19px]">
            <thead>
              <tr>
                <Th>Mes</Th>
                <Th derecha>Meta</Th>
                <Th derecha>Vendido</Th>
                <Th>Cumplimiento</Th>
                <Th derecha>Porcentaje</Th>
                <Th derecha>Comisión</Th>
                {hayADescontar && <Th derecha>A descontar</Th>}
              </tr>
            </thead>
            <tbody>
              {sim.periodos.map((p) => {
                const on = p.clave === periodoElegido;
                return (
                  <tr key={p.clave} className={cn(on && "bg-info-surface")}>
                    <Td>
                      <button type="button" aria-pressed={on} onClick={() => setPeriodoElegido(on ? null : p.clave)} className="text-left font-semibold text-fg transition-colors hover:text-brand">
                        {nombreDelMes(p.numero)}
                        {p.enCurso ? " · en curso" : ""}
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
                    {hayADescontar && <Td derecha className="text-fg-secondary">{p.aDescontar ? `−${usd2(p.aDescontar)}` : "—"}</Td>}
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
                {hayADescontar && <Td pie derecha>−{usd2(sim.totalADescontar)}</Td>}
              </tr>
            </tfoot>
          </table>
          {hayADescontar && (
            <p className="px-4 py-3 text-xs leading-4 text-fg-muted">
              «A descontar» es lo que se habría pagado de más en ese mes por las ventas que se cayeron en sus primeros {DIAS_PARA_CAERSE} días: se descuenta de las
              próximas comisiones, nunca se pide de vuelta.
            </p>
          )}
        </Caja>

        <Caja
          titulo={elegido ? `Ventas de ${nombreDelMes(elegido.numero)}` : "Ventas de servicios del año"}
          detalle="Nexus deduce del nombre del trato si es servicio o licencia, y de HubSpot si es nuevo, expansión o renovación; cámbialo si se equivocó."
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
              {servicios.length === 0 && <FilaVacia columnas={6} texto="Sin ventas de servicios en este período." />}
              {servicios.map((s) => (
                <FilaDeServicio key={s.venta.id} s={s} anio={datos.anio} ajuste={ajustes[s.venta.id]} onAjustar={(c) => ajustar(s.venta.id, c)} />
              ))}
            </tbody>
          </table>
        </Caja>

        <Caja
          titulo="Descuento y valor de 12 meses"
          detalle={`Un servicio mensual vale ${MESES_DEL_VALOR} meses y cuenta eso para la meta; el descuento, contra la primera propuesta del negocio, sale de lo que comisiona. Sin propuesta, cámbialo acá.`}
        >
          <table className="w-full min-w-[1040px] border-collapse text-[13px] leading-[19px]">
            <thead>
              <tr>
                <Th>Venta</Th>
                <Th>Tipo</Th>
                <Th derecha>Al mes</Th>
                <Th derecha>Valor 12 meses</Th>
                <Th derecha>Descuento 12 meses</Th>
                <Th derecha>Para la meta</Th>
                <Th derecha>Comisión antes → ahora</Th>
              </tr>
            </thead>
            <tbody>
              {conValor.length === 0 && <FilaVacia columnas={7} texto="Sin ventas de servicios en este período." />}
              {conValor.map((x) => (
                <FilaDeValor key={x.venta.id} s={x} antes={comisionAntesDe.get(x.venta.id) ?? 0} ajuste={ajustes[x.venta.id]} onAjustar={(c) => ajustar(x.venta.id, c)} />
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-muted font-semibold">
                <Td pie>{elegido ? nombreDelMes(elegido.numero) : "Año"}</Td>
                <Td pie />
                <Td pie />
                <Td pie derecha>{usd(conValor.reduce((a, x) => a + x.valor!.valor, 0))}</Td>
                <Td pie derecha>{usd(conValor.reduce((a, x) => a + x.partes!.descontado, 0))}</Td>
                <Td pie derecha>{usd(conValor.reduce((a, x) => a + x.valor!.paraLaMeta, 0))}</Td>
                <Td pie derecha>
                  {usd2(conValor.reduce((a, x) => a + (comisionAntesDe.get(x.venta.id) ?? 0), 0))} → {usd2(conValor.reduce((a, x) => a + (x.comision ?? 0), 0))}
                </Td>
              </tr>
            </tfoot>
          </table>
          <p className="px-4 py-3 text-xs leading-4 text-fg-muted">«Antes» es con el descuento dentro de la base. Un cambio en una venta puede mover el porcentaje de todo su mes.</p>
        </Caja>

        <Caja titulo="Licencias del año" detalle={`${LICENCIA.porcentaje} % del valor mensual durante ${LICENCIA.meses} meses. HubSpot no guarda el valor mensual en el trato: escríbelo para calcular.`}>
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
              {sim.licencias.length === 0 && <FilaVacia columnas={5} texto="Sin licencias en el año." />}
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
            detalle={`Lidera a ${lideradas.length ? nombres(lideradas) : "nadie todavía"}. Gana ${usd(BONO_DEL_LIDER.paga)} por cada ${usd(BONO_DEL_LIDER.porCada)} que vende cada persona, en los meses en que llega al ${BONO_DEL_LIDER.minimo * 100} % de su meta, hasta el ${TOPE_DE_LOS_BONOS * 100} %. Sus propias ventas le dan comisión, no bono. Se paga cada trimestre.`}
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
                </tr>
              </thead>
              <tbody>
                {bono.map((t) => {
                  const notas = [t.enCurso ? "En curso" : null, t.mesesBajoElMinimo ? `${t.mesesBajoElMinimo} ${t.mesesBajoElMinimo === 1 ? "mes" : "meses"} bajo el ${BONO_DEL_LIDER.minimo * 100} %` : null, t.mesesConTope ? `${t.mesesConTope} con tope` : null].filter(Boolean);
                  return (
                    <tr key={t.numero}>
                      <Td className="font-semibold">Trimestre {t.numero}</Td>
                      <Td derecha className="text-fg-muted">{t.personas}</Td>
                      <Td derecha className="text-fg-muted">{t.personas ? usd(t.meta) : "—"}</Td>
                      <Td derecha>{t.personas ? usd(t.vendido) : "—"}</Td>
                      <Td className="min-w-[200px]">
                        {t.personas ? (
                          <BarraDeCumplimiento cumplimiento={t.meta > 0 ? t.vendido / t.meta : null} escala={TOPE_DE_LOS_BONOS * 1.25} marca={BONO_DEL_LIDER.minimo} />
                        ) : (
                          <span className="text-xs text-fg-muted">Nadie con meta</span>
                        )}
                      </Td>
                      <Td derecha>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-semibold">{usd(t.bono)}</span>
                          {notas.length > 0 && <span className="text-xs leading-4 text-fg-muted">{notas.join(" · ")}</span>}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-surface-muted font-semibold">
                  <Td pie>Año</Td>
                  <Td pie />
                  <Td pie />
                  <Td pie />
                  <Td pie />
                  <Td pie derecha>{usd(totalBono)}</Td>
                </tr>
              </tfoot>
            </table>
            {lideradasSinMeta.length > 0 && <SiAlguienNuevo nombre={nombreCorto(lideradasSinMeta[0].nombre)} lider={nombreCorto(vendedor.nombre)} />}
          </Caja>
        )}
      </div>

      <aside className="flex min-w-[280px] max-w-[340px] flex-[1_1_300px] flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
          <span className={ROTULO_DEL_SISTEMA}>Lo que el cálculo supone</span>
          <ul className="flex flex-col gap-1.5 text-[13px] leading-[19px] text-fg-secondary">
            <li>○ Muestra lo que genera cada venta. Finanzas la paga el mes siguiente a cada cobro.</li>
            <li>○ Una venta a un cliente pasados sus primeros {MESES_DE_VENTAS} meses es de quien creó el negocio: acá, quien es dueño del trato en HubSpot.</li>
            <li>○ Una venta compartida (marcada en HubSpot antes de la firma) paga la mitad y cuenta completa para la meta.</li>
            <li>○ Si HubSpot no dice si es nuevo, expansión o renovación, Nexus lo deduce de la primera venta del cliente.</li>
            <li>○ Una venta que pasó a perdida o se reabrió en HubSpot en sus primeros {DIAS_PARA_CAERSE} días se cayó. Si el cliente dejó de pagar sin que eso pase, márcala.</li>
            <li>○ Una venta sin empresa en Nexus cuenta como cliente nuevo.</li>
            <li>○ La meta es solo de servicios: las licencias no suman, aunque HubSpot cuente las que tienen monto en el avance de la meta.</li>
            <li>○ Una venta en otra moneda no se suma.</li>
            <li>○ La meta del mes es la del trimestre de HubSpot repartida por días, como su desglose mensual.</li>
            <li>○ Una licencia del pipeline «HubSpot Shared Selling» la refirió HubSpot.</li>
            <li>○ Una venta sin propuesta ni cambio es de una vez y vale su monto de HubSpot. Marcada recurrente, supone que el monto es el año.</li>
            <li>○ El descuento es lo que bajó contra la primera propuesta del negocio. El de las licencias no cuenta.</li>
            <li>○ El equipo de ventas es quien tiene el rol de Ventas en Nexus. Lo lidera quien lleva más tiempo en él, y su bono sale de lo que venden los demás.</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
          <span className={ROTULO_DEL_SISTEMA}>Para comparar</span>
          <div className="flex justify-between gap-3 text-[13px] leading-[19px]">
            <span>Con el {PORCENTAJE_DE_HOY} % fijo de antes</span>
            <span className="font-semibold tabular-nums">{usd(sim.conElPorcentajeDeHoy)}</span>
          </div>
          <span className="text-xs leading-4 text-fg-muted">Las mismas ventas de servicios, con el {PORCENTAJE_DE_HOY} % parejo del esquema anterior.</span>
          <div className="flex justify-between gap-3 text-[13px] leading-[19px]">
            <span>Con el descuento dentro</span>
            <span className="font-semibold tabular-nums">{usd(simAntes.totalPorVentas)}</span>
          </div>
          <span className="text-xs leading-4 text-fg-muted">Las mismas ventas, sin sacar de la comisión lo descontado.</span>
          {vendedor.pagadoEnElAnio > 0 && (
            <div className="flex justify-between gap-3 text-[13px] leading-[19px]">
              <span>Se le pagó en {datos.anio}</span>
              <span className="font-semibold tabular-nums">{usd(vendedor.pagadoEnElAnio)}</span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

/**
 * Lo que cobraría quien lidera por alguien nuevo que todavía no tiene meta en HubSpot (Liz, octubre de 2026): se escribe
 * su meta del mes y lo que vende, y sale el bono de ese mes. Sirve para ver qué pasa en su rampa.
 */
function SiAlguienNuevo({ nombre, lider }: { nombre: string; lider: string }) {
  const [meta, setMeta] = useState(10000);
  const [vendido, setVendido] = useState(8000);
  const bono = bonoDelLiderPorPersona(vendido, meta);
  const cumplimiento = meta > 0 ? vendido / meta : 0;
  return (
    <div className="mx-4 mb-4 mt-3 flex flex-col gap-3 rounded-[10px] border border-line bg-surface-muted p-4">
      <div className="flex flex-col gap-0.5">
        <span className={ROTULO_DEL_SISTEMA}>Si {nombre} tuviera meta</span>
        <span className="text-xs leading-4 text-fg-muted">
          Prueba un mes de {nombre}. En sus primeros meses su meta es más baja; {lider} cobra desde que {nombre} llega al {BONO_DEL_LIDER.minimo * 100} % de esa meta.
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13px] text-fg-secondary">
          Meta de {nombre} en el mes
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
          <input id="vendido-nuevo" type="range" min={0} max={90000} step={500} value={vendido} onChange={(e) => setVendido(Number(e.target.value))} className="w-full accent-brand" />
        </div>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[13px] leading-[19px]">
        <span>
          Cumplimiento <span className="font-semibold tabular-nums">{pct(cumplimiento)}</span>
        </span>
        <span>
          Bono de {lider} <span className="font-semibold tabular-nums">{usd(bono)}</span> ese mes
        </span>
        {cumplimiento < BONO_DEL_LIDER.minimo && <span className="text-fg-muted">Le faltan {usd(meta * BONO_DEL_LIDER.minimo - vendido)} para el mínimo.</span>}
      </div>
    </div>
  );
}

/** La meta de la empresa de la que se habló en la reunión del 2026-10-15: todavía no está decidida. */
const META_DE_LA_EMPRESA_EN_CONVERSACION = "US$ 80.000–90.000 al mes";

/**
 * «Las metas en HubSpot» (solo Super Admin): la meta de cada persona en el mes en curso y en el año, con lo que lleva. Lo
 * del mes lo suma Nexus con los negocios ganados, como el desglose mensual de HubSpot (con las licencias que tienen
 * monto); lo del año es el avance que da HubSpot. Al pie, lo que suman contra la meta de la empresa, que está pendiente.
 */
function MetasEnHubspot({ datos }: { datos: DatosDeLaSimulacion }) {
  const mes = `${datos.anio}-${String(datos.mesActual).padStart(2, "0")}`;
  const nombreMes = nombreDelMes(datos.mesActual);
  const filas = datos.vendedores.map((v) => {
    const metaMes = metaDelMes(v.tramos, mes) ?? 0;
    const vendidoMes = v.ventas.filter((x) => x.fecha.startsWith(mes) && x.moneda === v.moneda && !x.caida).reduce((a, x) => a + (x.monto ?? 0), 0);
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
    <Caja
      titulo="Las metas en HubSpot"
      detalle={`La meta de cada persona en ${nombreMes} y en el año. Lo de ${nombreMes} sale de los negocios ganados, como lo cuenta HubSpot; lo del año es el avance de su meta en HubSpot.`}
      derecha={datos.metasAl ? <span className="text-xs text-fg-muted">Al {fechaCorta(datos.metasAl)}</span> : null}
    >
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
        Meta de la empresa: pendiente con Marco. Se habló de {META_DE_LA_EMPRESA_EN_CONVERSACION}; las metas de hoy suman {usd(total.metaMes)} en {nombreMes}.
      </p>
    </Caja>
  );
}
