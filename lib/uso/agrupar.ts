/**
 * lib/uso/agrupar.ts — lo que propone Nexus (lib/lo-propuesto), agrupado por cliente, por proceso de IA y por equipo
 * para «Uso de Nexus». PURO.
 *
 * Misma población que lib/lo-propuesto/conteo.ts: lo que NACIÓ en la ventana, con su estado de hoy. Lo decidido en la
 * ventana de algo que nació antes no entra (así nada se cuenta dos veces y los números cuadran con «Para qué se usa»).
 *
 * Por equipo se cuenta QUIÉN decidió (el equipo de quien usó o desestimó), no a quién le llegó: es lo único que se
 * guarda. Lo que se cerró sin una persona no tiene equipo.
 */
import type { ItemParaContar, Ventana } from "@/lib/lo-propuesto/conteo";
import { MODULO_DEL_TIPO, type ClaveDeTipo, type ModuloDeLoPropuesto } from "@/lib/lo-propuesto/tipos";
import { procesoDeLaPropuesta, usoVacio, type ClaveDeProceso, type UsoDeLoQuePropone } from "./ia";

type PorTipo = ReadonlyMap<ClaveDeTipo, readonly ItemParaContar[]>;

const nacioEnLaVentana = (it: ItemParaContar, v: Ventana): boolean => {
  const t = new Date(it.nacioEn).getTime();
  return t >= v.desde.getTime() && t < v.hasta.getTime();
};

function anotar(u: UsoDeLoQuePropone, it: ItemParaContar): void {
  u.nacieron++;
  if (it.estado === "usado") u.usados++;
  else if (it.estado === "desestimado") u.desestimados++;
  else if (it.estado === "vencido") u.vencidos++;
  else u.pendientes++;
}

/** Agrupa lo nacido en la ventana por la clave que dé `clave` (null = no entra). */
export function agruparLoPropuesto(
  porTipo: PorTipo,
  v: Ventana,
  clave: (tipo: ClaveDeTipo, it: ItemParaContar) => string | null,
): Map<string, UsoDeLoQuePropone> {
  const out = new Map<string, UsoDeLoQuePropone>();
  for (const [tipo, items] of porTipo) {
    for (const it of items) {
      if (!nacioEnLaVentana(it, v)) continue;
      const k = clave(tipo, it);
      if (!k) continue;
      const u = out.get(k) ?? usoVacio();
      anotar(u, it);
      out.set(k, u);
    }
  }
  return out;
}

/** Por cliente. Lo que no guarda su cliente no entra. */
export const loPropuestoPorCliente = (porTipo: PorTipo, v: Ventana) => agruparLoPropuesto(porTipo, v, (_t, it) => it.clientId ?? null);

/** Por proceso de IA. Lo que propone una regla (una alerta de regla) no es de ningún proceso. */
export function loPropuestoPorProceso(porTipo: PorTipo, v: Ventana): Map<ClaveDeProceso, UsoDeLoQuePropone> {
  return agruparLoPropuesto(porTipo, v, (t, it) => procesoDeLaPropuesta(t, it.fuente)) as Map<ClaveDeProceso, UsoDeLoQuePropone>;
}

export interface DecisionesDelEquipo {
  equipo: string;
  porModulo: Partial<Record<ModuloDeLoPropuesto, { usados: number; desestimados: number }>>;
  usados: number;
  desestimados: number;
}

/**
 * Por equipo y módulo: cuánto usó y cuánto desestimó la gente de cada equipo. `equipoDe` da el NOMBRE del equipo de un
 * correo (null = no es del equipo de Smarteam: no entra). Los equipos van en el orden en que aparecen en `orden`.
 */
export function decisionesPorEquipo(
  porTipo: PorTipo,
  v: Ventana,
  equipoDe: (email: string) => string | null,
  orden: readonly string[],
): DecisionesDelEquipo[] {
  const por = new Map<string, DecisionesDelEquipo>();
  for (const [tipo, items] of porTipo) {
    const modulo = MODULO_DEL_TIPO[tipo];
    for (const it of items) {
      if (!nacioEnLaVentana(it, v)) continue;
      if (it.estado !== "usado" && it.estado !== "desestimado") continue;
      if (!it.decididoPor) continue;
      const equipo = equipoDe(it.decididoPor.toLowerCase());
      if (!equipo) continue;
      const d = por.get(equipo) ?? { equipo, porModulo: {}, usados: 0, desestimados: 0 };
      const m = (d.porModulo[modulo] ??= { usados: 0, desestimados: 0 });
      if (it.estado === "usado") {
        m.usados++;
        d.usados++;
      } else {
        m.desestimados++;
        d.desestimados++;
      }
      por.set(equipo, d);
    }
  }
  const pos = (e: string) => {
    const i = orden.indexOf(e);
    return i === -1 ? orden.length : i;
  };
  return [...por.values()].sort((a, b) => pos(a.equipo) - pos(b.equipo) || a.equipo.localeCompare(b.equipo));
}
