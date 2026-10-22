"use client";

/**
 * Los techos del modelo de comisiones (2026-10-21), SOLO SUPER ADMIN: por trimestre, lo que se pagaría a quienes atienden
 * al cliente (comisiones de servicios de todos, el bono de quien lidera Ventas, el del área de Customer Success y los
 * bonos de renovación) contra los servicios vendidos, sin licencias. Hasta el 7 % y hasta el 10 % en total; hoy nadie más
 * cobra comisión, así que los dos miden lo mismo. Si se pasa, se ajusta la versión siguiente: nunca se recorta lo ganado.
 */
import { useMemo } from "react";
import { cn } from "@/lib/cn";
import {
  TECHOS,
  bonoDelAreaDeCustomerSuccess,
  bonoDelLider,
  renovacionesDelAnio,
  simularVendedor,
  techoDelTrimestre,
} from "@/lib/finanzas/modelo-comisiones/reglas";
import type { DatosDeLaSimulacion } from "@/lib/finanzas/modelo-comisiones/cargar";
import { CLASE_DE_PILDORA, PILDORA, usd } from "./formato";
import { Caja, Td, Th } from "./PiezasDeLaSimulacion";

const trimestreDe = (mes: number) => Math.floor((mes - 1) / 3) + 1;

export default function TechosDeComisiones({ datos }: { datos: DatosDeLaSimulacion }) {
  const filas = useMemo(() => {
    const { anio, mesActual } = datos;
    const pagado = [0, 0, 0, 0];
    const sumarPorMes = (periodos: { numero: number; comision: number }[]) => {
      for (const p of periodos) pagado[trimestreDe(p.numero) - 1] += p.comision;
    };
    const sims = new Map(datos.vendedores.map((v) => [v.id, simularVendedor({ anio, mesActual, ventas: v.ventas, tramos: v.tramos, moneda: v.moneda })]));
    for (const s of sims.values()) sumarPorMes(s.periodos);
    const lider = datos.vendedores.find((v) => v.lidera);
    if (lider) {
      const lideradas = datos.vendedores.filter((v) => v.id !== lider.id && datos.equipoDeVentas.some((p) => p.id === v.id));
      for (const t of bonoDelLider(mesActual, lideradas.map((v) => ({ nombre: v.nombre, periodos: sims.get(v.id)!.periodos })))) pagado[t.numero - 1] += t.bono;
    }
    const enVentas = new Set(datos.vendedores.map((v) => v.id));
    for (const p of datos.customerSuccess.personas) {
      if (!enVentas.has(p.id)) sumarPorMes(simularVendedor({ anio, mesActual, ventas: p.ventas, tramos: [], area: "customerSuccess" }).periodos);
    }
    if (datos.customerSuccess.area) {
      const area = simularVendedor({ anio, mesActual, ventas: datos.customerSuccess.area, tramos: [], area: "customerSuccess" });
      for (const t of bonoDelAreaDeCustomerSuccess(mesActual, area.periodos)) pagado[t.numero - 1] += t.bono;
    }
    for (const r of renovacionesDelAnio({ anio, mesActual, tratos: datos.customerSuccess.renovaciones.tratos, mensuales: datos.customerSuccess.renovaciones.mensuales })) {
      pagado[trimestreDe(Number(r.fecha.slice(5, 7))) - 1] += r.bono;
    }
    const hoy = trimestreDe(mesActual);
    return Array.from({ length: hoy }, (_, i) => techoDelTrimestre(i + 1, i + 1 === hoy, datos.serviciosPorTrimestre?.[i] ?? 0, pagado[i]));
  }, [datos]);

  return (
    <Caja
      titulo="Techos"
      detalle={`Lo que se pagaría a quienes atienden al cliente contra los servicios vendidos, sin licencias: hasta el ${TECHOS.quienesAtienden} %, y hasta el ${TECHOS.total} % en total. Se mide por trimestre; si se pasa, se ajusta la versión siguiente.`}
      derecha={<span className={cn(CLASE_DE_PILDORA, PILDORA.neutra)}>Solo Super Admin</span>}
    >
      <table className="w-full min-w-[720px] border-collapse text-[13px] leading-[19px]">
        <thead>
          <tr>
            <Th>Trimestre</Th>
            <Th derecha>Servicios vendidos</Th>
            <Th derecha>Comisiones y bonos</Th>
            <Th derecha>Parte</Th>
            <Th>Techos</Th>
          </tr>
        </thead>
        <tbody>
          {filas.map((t) => (
            <tr key={t.numero}>
              <Td className="font-semibold">
                Trimestre {t.numero}
                {t.enCurso ? " · en curso" : ""}
              </Td>
              <Td derecha>{usd(t.vendido)}</Td>
              <Td derecha>{usd(t.pagado)}</Td>
              <Td derecha className="font-semibold">{t.porcentaje == null ? "—" : `${String(t.porcentaje).replace(".", ",")} %`}</Td>
              <Td>
                {t.porcentaje == null ? (
                  <span className="text-xs text-fg-muted">Sin ventas</span>
                ) : t.pasaElTotal ? (
                  <span className={cn(CLASE_DE_PILDORA, PILDORA.atencion)}>Pasa el {TECHOS.total} %</span>
                ) : t.pasaQuienesAtienden ? (
                  <span className={cn(CLASE_DE_PILDORA, PILDORA.atencion)}>Pasa el {TECHOS.quienesAtienden} %</span>
                ) : (
                  <span className={cn(CLASE_DE_PILDORA, PILDORA.bien)}>Dentro</span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-3 text-xs leading-4 text-fg-muted">
        Incluye la comisión de Marco aunque la done, y los bonos como si hubieran regido en el año. Los servicios vendidos salen del monto de HubSpot de cada trato.
      </p>
    </Caja>
  );
}
