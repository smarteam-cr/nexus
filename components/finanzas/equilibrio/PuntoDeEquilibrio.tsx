"use client";

/**
 * components/finanzas/equilibrio/PuntoDeEquilibrio.tsx — el punto de equilibrio para revisar entre RevOps, el CFO y el
 * CEO (rediseño 2026-10-05, diseño aprobado en el lienzo «Rediseño de Finanzas»).
 *
 * Se lee como la reunión: arriba la respuesta (¿alcanza lo que se factura para lo que cuesta operar?), después el año
 * mes a mes, de la venta a la caja, qué tan firmes son los números, y al final lo que hay que decidir, con quién lo
 * decide. Todo sale del mismo reporte anual (`loadReporteAnual`); lo que la página contesta se arma en
 * lib/finanzas/lectura-equilibrio.ts y la agenda en lib/finanzas/agenda-equilibrio.ts.
 *
 * Reemplaza a EquilibrioClient (indicadores que se tocaban en tres pasos, la tabla editable y la lista de
 * inconsistencias al pie): el escenario editable pasó a «¿Y si…?» de lo que queda del año, y la lista, a la agenda y al
 * detalle de cada punto.
 */
import { useMemo, useState } from "react";
import { Alert, Button, EmptyState, PageHeader } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { avisoDeActualizacion, type FuenteActualizada } from "@/lib/finanzas/actualizar-tablero";
import type { ReporteAnualDTO } from "@/lib/cobranza";
import {
  desgloseDelMargen,
  estadoDelMes,
  loQueViene,
  nombreDelMes,
  pisoDe,
  porQueEsPreliminar,
  respuestaDelAnio,
} from "@/lib/finanzas/lectura-equilibrio";
import { armarAgenda } from "@/lib/finanzas/agenda-equilibrio";
import LaRespuesta from "./LaRespuesta";
import MesAMes from "./MesAMes";
import DeLaVentaALaCaja from "./DeLaVentaALaCaja";
import Firmeza from "./Firmeza";
import ParaDecidir from "./ParaDecidir";
import RendimientoCobranza from "./RendimientoCobranza";
import { DecidirAliados, DetalleDeLinea, DetalleDelMes, SimularLoQueQueda } from "./PanelesDelEquilibrio";
import { Drawer } from "@/components/ui";

export default function PuntoDeEquilibrio({
  initialReporte,
  hoyISO,
  etiquetasDeServicio,
  nombres,
}: {
  initialReporte: ReporteAnualDTO;
  hoyISO: string;
  /** «IMPLEMENTACION» → «Implementación». Se resuelve en el servidor para no traer el esquema al navegador. */
  etiquetasDeServicio: Record<string, string>;
  /** Email → nombre de pila, para firmar decisiones. */
  nombres: Record<string, string>;
}) {
  const toast = useToast();
  const [r, setReporte] = useState(initialReporte);
  const [actualizando, setActualizando] = useState(false);
  const [mesAbierto, setMesAbierto] = useState<string | null>(null);
  const [simulando, setSimulando] = useState(false);
  const [lineaAbierta, setLineaAbierta] = useState<string | null>(null);
  const [decidiendo, setDecidiendo] = useState(false);
  const [viendoExcel, setViendoExcel] = useState(false);
  const moneda = r.monedaPresentacion;

  /** «Actualizar»: vuelve a traer HubSpot, Odoo y Mercury y recarga el reporte, sin recargar la página. */
  const actualizar = async () => {
    setActualizando(true);
    try {
      const d = await fetchJson<{ reporte: ReporteAnualDTO; fuentes: FuenteActualizada[] }>("/api/cobranza/costos/equilibrio/actualizar", { method: "POST" });
      setReporte(d.reporte);
      const aviso = avisoDeActualizacion(d.fuentes);
      if (aviso.todoBien) toast.success(`Al día. ${aviso.texto}`);
      else toast.error(`Se recargó, pero no todo se pudo actualizar. ${aviso.texto}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar.");
    } finally {
      setActualizando(false);
    }
  };

  /** Después de decidir lo de los aliados: el reporte se vuelve a armar con la decisión (sin copiar nada de afuera). */
  const recargar = async () => {
    try {
      const d = await fetchJson<{ reporte: ReporteAnualDTO }>(`/api/cobranza/costos/equilibrio?anio=${r.anio}`);
      setReporte(d.reporte);
    } catch {
      /* Si falla, queda lo que había: la decisión ya está guardada y se ve al recargar. */
    }
  };

  const lectura = useMemo(() => {
    const cerradosFirmes = new Set(r.cierres.filter((c) => c.cambio !== true).map((c) => c.periodo));
    const tasas = [...new Set(r.fx.tasas.map((t) => t.crcPorUsd))];
    const cierrePorMes = new Map(r.cierres.map((c) => [c.periodo, c]));
    const estados = r.meses.map((m) => estadoDelMes(m, cierrePorMes.get(m.periodo), hoyISO));
    const respuesta = respuestaDelAnio(r, hoyISO);
    return {
      respuesta,
      margen: desgloseDelMargen(r),
      preliminar: porQueEsPreliminar(r, hoyISO, cerradosFirmes, new Set(r.tasasConfirmadas), tasas.length === 1 ? tasas[0]! : null),
      viene: loQueViene(r, hoyISO),
      estados,
      agenda: armarAgenda({
        inconsistencias: r.inconsistencias,
        aliadosDecidido: r.decisionAliados !== null,
        aliadosDecidenElResultado: respuesta ? respuesta.promedioFacturado < respuesta.piso && respuesta.promedioConAliados >= respuesta.piso : null,
        mesesParaCerrar: r.meses.filter((_, i) => estados[i]!.clave === "sinCerrar").map((m) => m.periodo),
      }),
    };
  }, [r, hoyISO]);

  const { piso } = pisoDe(r);
  const sinDatos = r.indicadores.egresosTotales === 0 && r.indicadores.facturadoTotal === 0;
  const iMes = mesAbierto ? r.meses.findIndex((m) => m.periodo === mesAbierto) : -1;
  const linea = lineaAbierta ? (r.inconsistencias.find((l) => l.codigo === lineaAbierta) ?? null) : null;
  const queda = r.meses
    .filter((m) => m.periodo >= hoyISO.slice(0, 7))
    .map((m) => ({ periodo: m.periodo, facturado: m.facturado + m.pendienteFacturar, estimadoAliados: m.partnershipProyectado }));
  const aliados = {
    cuentan: r.criterios.partnershipCubreElPiso,
    decidido: r.decisionAliados ? { por: nombres[r.decisionAliados.decididoPor.toLowerCase()] ?? r.decisionAliados.decididoPor, en: r.decisionAliados.decididoEn } : null,
  };
  const avisoDeArriba = lectura.preliminar.razones.filter((t) => !t.startsWith("Solo cuenta"));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Punto de equilibrio · ${r.anio}`}
        description="Si lo que se factura alcanza para lo que cuesta operar, cómo se convierte la venta en plata y qué tan firmes son los números. Para revisarlo entre RevOps, el CFO y el CEO."
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void actualizar()}
            disabled={actualizando}
            title="Vuelve a traer ahora las ventas ganadas de HubSpot, las facturas de Odoo y lo de Mercury, que normalmente se copian una vez por día. Los cobros, el gasto y la planilla ya se leen al abrir."
          >
            {actualizando ? "Actualizando…" : "Actualizar"}
          </Button>
        }
      />

      {sinDatos ? (
        <EmptyState
          title={`Todavía no hay datos de ${r.anio}`}
          description="El reporte se arma con el gasto (el Excel de egresos hasta septiembre de 2026, Nexus desde octubre), la planilla y los cobros del año."
        />
      ) : (
        <>
          {r.fx.periodosSinTasa.length > 0 && (
            <Alert variant="warning" title="Falta el tipo de cambio de algunos meses">
              {r.fx.periodosSinTasa.map(nombreDelMes).join(", ")}: lo que está en la otra moneda no está sumado. Se pone en el cierre de cada mes.
            </Alert>
          )}
          {lectura.preliminar.preliminar && (
            <div role="status" className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[10px] border border-warn-line bg-warn-surface px-3.5 py-2.5 text-[13px] leading-[19px] text-warn-ink">
              <span className="min-w-0 flex-[1_1_520px]">
                <span className="font-semibold">● Números preliminares.</span> {avisoDeArriba.join(" ")}
              </span>
              <a href="#firmeza" className="font-semibold underline">
                Qué falta
              </a>
            </div>
          )}

          <LaRespuesta
            anio={r.anio}
            moneda={moneda}
            respuesta={lectura.respuesta}
            margen={lectura.margen}
            preliminar={lectura.preliminar}
            viene={lectura.viene}
            aliados={aliados}
            onSimular={() => setSimulando(true)}
            onDecidirAliados={() => setDecidiendo(true)}
          />
          <MesAMes
            meses={r.meses}
            estados={lectura.estados}
            piso={piso}
            moneda={moneda}
            etiquetasDeServicio={etiquetasDeServicio}
            onAbrirMes={setMesAbierto}
          />
          <DeLaVentaALaCaja
            moneda={moneda}
            hoyISO={hoyISO}
            indicadores={r.indicadores}
            meses={r.meses}
            porServicio={r.ingresosPorServicio}
            inconsistencias={r.inconsistencias}
            etiquetasDeServicio={etiquetasDeServicio}
            onAbrirLinea={setLineaAbierta}
          />
          <Firmeza
            moneda={moneda}
            hoyISO={hoyISO}
            cobranza={r.cobranzaPorMoneda}
            excel={r.cobranzaContraExcel}
            piso={r.pisoVigente}
            meses={r.meses}
            inconsistencias={r.inconsistencias}
            onVerExcel={() => setViendoExcel(true)}
            onAbrirLinea={setLineaAbierta}
          />
          <ParaDecidir agenda={lectura.agenda} moneda={moneda} onAbrirLinea={setLineaAbierta} onDecidirAliados={() => setDecidiendo(true)} />
        </>
      )}

      <DetalleDelMes
        m={iMes >= 0 ? r.meses[iMes]! : null}
        estado={iMes >= 0 ? lectura.estados[iMes]! : null}
        moneda={moneda}
        etiquetasDeServicio={etiquetasDeServicio}
        anterior={iMes > 0 ? r.meses[iMes - 1]!.periodo : null}
        siguiente={iMes >= 0 && iMes < r.meses.length - 1 ? r.meses[iMes + 1]!.periodo : null}
        onIr={setMesAbierto}
        onClose={() => setMesAbierto(null)}
      />
      {simulando && queda.length > 0 && <SimularLoQueQueda open base={queda} piso={piso} moneda={moneda} onClose={() => setSimulando(false)} />}
      <DetalleDeLinea linea={linea} moneda={moneda} onClose={() => setLineaAbierta(null)} />
      {decidiendo && (
        <DecidirAliados
          open
          actual={r.criterios.partnershipCubreElPiso}
          onClose={() => setDecidiendo(false)}
          onDecidido={() => {
            setDecidiendo(false);
            void recargar();
          }}
        />
      )}
      <Drawer open={viendoExcel} onClose={() => setViendoExcel(false)} size="xl" title={`La cobranza de ${r.anio} contra el Excel de Alex`}>
        <RendimientoCobranza anio={r.anio} cobranza={r.cobranzaPorMoneda} deAniosAnteriores={r.porCobrarDeAniosAnteriores} excel={r.cobranzaContraExcel} />
      </Drawer>
    </div>
  );
}
