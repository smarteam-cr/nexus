"use client";

/**
 * La simulación de Customer Success (2026-10-21): una persona (CSE o CSL) con sus ventas al 5 % fijo y sus
 * renovaciones, y el área entera con el bono de quien la lidera. Lo que se carga ya viene filtrado por quien mira
 * (lib/finanzas/modelo-comisiones/cargar.ts): un CSE ve lo suyo; quien lidera el área y Super Admin, también el área.
 */
import { useMemo } from "react";
import {
  BONO_DE_CUSTOMER_SUCCESS,
  DIAS_PARA_CAERSE,
  MINIMO_DE_LOS_BONOS,
  PORCENTAJE_DE_CUSTOMER_SUCCESS,
  RENOVACION,
  TOPE_DE_LOS_BONOS,
  bonoDelAreaDeCustomerSuccess,
  renovacionesDelAnio,
  simularVendedor,
  type AjusteDeVenta,
} from "@/lib/finanzas/modelo-comisiones/reglas";
import type { DatosDeLaSimulacion, PersonaDeCustomerSuccess } from "@/lib/finanzas/modelo-comisiones/cargar";
import { nombreDelMes, usd, usd2 } from "./formato";
import { BarraDeCumplimiento, Caja, Cifra, FilaDeServicio, FilaVacia, TablaDeRenovaciones, Td, Th } from "./PiezasDeLaSimulacion";

type Ajustar = (id: string, c: AjusteDeVenta) => void;

/** Una persona de Customer Success: el 5 % fijo de lo que vende y el bono de las renovaciones de sus cuentas. */
export function VistaDeCustomerSuccess({
  datos,
  persona,
  ajustes,
  ajustar,
}: {
  datos: DatosDeLaSimulacion;
  persona: PersonaDeCustomerSuccess;
  ajustes: Record<string, AjusteDeVenta>;
  ajustar: Ajustar;
}) {
  const sim = useMemo(
    () => simularVendedor({ anio: datos.anio, mesActual: datos.mesActual, ventas: persona.ventas, tramos: [], area: "customerSuccess", ajustes }),
    [persona, datos.anio, datos.mesActual, ajustes],
  );
  const renovaciones = useMemo(
    () =>
      renovacionesDelAnio({
        anio: datos.anio,
        mesActual: datos.mesActual,
        tratos: datos.customerSuccess.renovaciones.tratos.filter((v) => v.encargado?.id === persona.id),
        mensuales: datos.customerSuccess.renovaciones.mensuales.filter((s) => s.encargado?.id === persona.id),
        ajustes,
      }),
    [persona, datos, ajustes],
  );
  const porRenovaciones = renovaciones.reduce((a, r) => a + r.bono, 0);
  const total = sim.totalPorVentas + sim.totalPorLicencias + porRenovaciones;
  const servicios = sim.servicios;
  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs text-fg-muted">
        {persona.rol} · sus ventas de {datos.anio} (las suyas y las que comparte) y las renovaciones de las cuentas que lleva
      </span>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Cifra
          rotulo="Por sus ventas"
          valor={usd(sim.totalPorVentas)}
          nota={`El ${PORCENTAJE_DE_CUSTOMER_SUCCESS} % fijo; la mitad si se compartió${sim.totalADescontar ? ` · ${usd(sim.totalADescontar)} a descontar por ventas que se cayeron` : ""}`}
        />
        <Cifra rotulo="Por licencias" valor={usd(sim.totalPorLicencias)} nota={`${sim.licencias.length} licencia${sim.licencias.length === 1 ? "" : "s"}`} />
        <Cifra
          rotulo="Por renovaciones"
          valor={usd(porRenovaciones)}
          nota={`El ${RENOVACION.porcentaje} % de un año, a tiempo y sin descuento · ${renovaciones.length} renovaci${renovaciones.length === 1 ? "ón" : "ones"}`}
        />
        <Cifra rotulo={`Total en ${datos.anio}`} valor={usd(total)} nota={`Para la meta del área sumó ${usd(sim.vendidoEnServicios)}`} destacada />
      </div>

      <Caja titulo="Sus ventas del año" detalle={`Cada una cuenta completa para la meta del área. Una renovación no cuenta: la paga su bono. Una que se cae en sus primeros ${DIAS_PARA_CAERSE} días no cuenta.`}>
        <table className="w-full min-w-[900px] border-collapse text-[13px] leading-[19px]">
          <thead>
            <tr>
              <Th>Firma</Th>
              <Th>Venta</Th>
              <Th derecha>Monto</Th>
              <Th>Qué es</Th>
              <Th derecha>%</Th>
              <Th derecha>Comisión</Th>
            </tr>
          </thead>
          <tbody>
            {servicios.length === 0 && <FilaVacia columnas={6} texto="Sin ventas de servicios en el año." />}
            {servicios.map((s) => (
              <FilaDeServicio key={s.venta.id} s={s} anio={datos.anio} area="customerSuccess" ajuste={ajustes[s.venta.id]} onAjustar={(c) => ajustar(s.venta.id, c)} />
            ))}
          </tbody>
        </table>
      </Caja>

      <TablaDeRenovaciones
        renovaciones={renovaciones}
        anio={datos.anio}
        onATiempo={(id, aTiempo) => ajustar(id, { aTiempo })}
        detalle={`Las de las cuentas que lleva. No cuentan para ninguna meta. «A tiempo» no lo sabe Nexus: se supone que sí, cámbialo si no.`}
      />
    </div>
  );
}

/** El área de Customer Success: lo que creció la cartera por trimestre contra el escalón de la meta, y el bono de quien la lidera. */
export function VistaDelArea({ datos, ajustes, ajustar }: { datos: DatosDeLaSimulacion; ajustes: Record<string, AjusteDeVenta>; ajustar: Ajustar }) {
  const area = datos.customerSuccess.area;
  const sim = useMemo(
    () => simularVendedor({ anio: datos.anio, mesActual: datos.mesActual, ventas: area ?? [], tramos: [], area: "customerSuccess", ajustes }),
    [area, datos.anio, datos.mesActual, ajustes],
  );
  const trimestres = useMemo(() => bonoDelAreaDeCustomerSuccess(datos.mesActual, sim.periodos), [datos.mesActual, sim]);
  const renovaciones = useMemo(
    () => renovacionesDelAnio({ anio: datos.anio, mesActual: datos.mesActual, tratos: datos.customerSuccess.renovaciones.tratos, mensuales: datos.customerSuccess.renovaciones.mensuales, ajustes }),
    [datos, ajustes],
  );
  const totalBono = trimestres.reduce((a, t) => a + t.bono, 0);
  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs text-fg-muted">
        Todas las ventas de Customer Success de {datos.anio}: las de los CSE y quien lidera, y las compartidas con Ventas. El escalón 1 de la meta se aplica al primer
        trimestre del año, para ver cómo habría sido; rige desde enero de 2027.
      </span>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Cifra rotulo="Lo que creció la cartera" valor={usd(sim.vendidoEnServicios)} nota="Expansiones y ventas nuevas del área, sin renovaciones ni lo que se cayó" />
        <Cifra
          rotulo="Bono de quien lidera"
          valor={usd(totalBono)}
          nota={`El ${BONO_DE_CUSTOMER_SUCCESS.porcentajeDeLaMeta} % de la meta de cada trimestre, desde el ${MINIMO_DE_LOS_BONOS * 100} % y hasta el ${TOPE_DE_LOS_BONOS * 100} %`}
          destacada
        />
        <Cifra rotulo="Bonos por renovaciones" valor={usd(renovaciones.reduce((a, r) => a + r.bono, 0))} nota={`El ${RENOVACION.porcentaje} % de un año, para el CSE de cada cuenta`} />
      </div>

      <Caja titulo="Trimestre por trimestre" detalle="La meta del área sube por escalones. Lo vendido es lo mismo que cuenta cada venta, una sola vez aunque se haya compartido.">
        <table className="w-full min-w-[820px] border-collapse text-[13px] leading-[19px]">
          <thead>
            <tr>
              <Th>Trimestre</Th>
              <Th derecha>Meta del área</Th>
              <Th derecha>Creció</Th>
              <Th>Cumplimiento</Th>
              <Th derecha>Bono</Th>
            </tr>
          </thead>
          <tbody>
            {trimestres.map((t) => (
              <tr key={t.numero}>
                <Td className="font-semibold">
                  Trimestre {t.numero}
                  {t.enCurso ? " · en curso" : ""}
                </Td>
                <Td derecha className="text-fg-muted">{usd(t.meta)}</Td>
                <Td derecha>{usd(t.vendido)}</Td>
                <Td className="min-w-[200px]">
                  <BarraDeCumplimiento cumplimiento={t.vendido / t.meta} escala={TOPE_DE_LOS_BONOS * 1.25} marca={MINIMO_DE_LOS_BONOS} />
                </Td>
                <Td derecha className="font-semibold">{usd2(t.bono)}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-surface-muted font-semibold">
              <Td pie>Año</Td>
              <Td pie />
              <Td pie derecha>{usd(sim.vendidoEnServicios)}</Td>
              <Td pie />
              <Td pie derecha>{usd2(totalBono)}</Td>
            </tr>
          </tfoot>
        </table>
      </Caja>

      <Caja titulo="Mes a mes" detalle="Lo que creció la cartera cada mes.">
        <table className="w-full min-w-[620px] border-collapse text-[13px] leading-[19px]">
          <thead>
            <tr>
              <Th>Mes</Th>
              <Th derecha>Creció</Th>
              <Th derecha>Comisiones del {PORCENTAJE_DE_CUSTOMER_SUCCESS} %</Th>
            </tr>
          </thead>
          <tbody>
            {sim.periodos.map((p) => (
              <tr key={p.clave}>
                <Td className="font-semibold">
                  {nombreDelMes(p.numero)}
                  {p.enCurso ? " · en curso" : ""}
                </Td>
                <Td derecha>{usd(p.vendido)}</Td>
                <Td derecha>{usd2(p.comision)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Caja>

      <TablaDeRenovaciones
        renovaciones={renovaciones}
        anio={datos.anio}
        onATiempo={(id, aTiempo) => ajustar(id, { aTiempo })}
        detalle="Todas las de la cartera, con el CSE de cada cuenta. No cuentan para la meta del área."
      />
    </div>
  );
}
