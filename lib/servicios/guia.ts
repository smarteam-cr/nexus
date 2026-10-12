/**
 * lib/servicios/guia.ts — la guía del CSE para el ciclo abierto, con lo que Nexus puede comprobar. PURO.
 *
 * Toma la guía del servicio (lib/servicios/smartloop.ts) y el estado del ciclo, y dice por cada cosa que
 * tiene que quedar producida si ya está (`true`), si falta (`false`) o si Nexus todavía no lo puede saber
 * (`null`: se muestra sin marca, nunca como hecho). La señal de que la etapa se saltó se prende solo
 * cuando Nexus la puede comprobar. Las etapas que vienen suman comprobaciones (el diagnóstico guardado,
 * la versión aprobada, la sesión de aprendizaje).
 */
import type { EtapaDelCiclo } from "./ciclo";
import type { GuiaDeServicio, GuiaDeEtapa } from "./tipos";

export interface EstadoParaLaGuia {
  etapa: EtapaDelCiclo;
  meta: string | null;
  desde: string | null;
  hasta: string | null;
  /** Los casos de uso del ciclo (sin los descartados). */
  casos: ReadonlyArray<{ titulo: string; criterio: string | null }>;
}

export interface ProducidoConEstado {
  clave: string;
  texto: string;
  /** true hecho · false falta · null Nexus no lo puede comprobar todavía. */
  hecho: boolean | null;
}

export interface GuiaDelCiclo {
  etapa: EtapaDelCiclo;
  guia: GuiaDeEtapa;
  producido: ProducidoConEstado[];
  /** La señal de que la etapa se saltó, si Nexus la ve. null = no se ve. */
  senalVista: string | null;
  /** Lo primero que falta y Nexus sabe que falta (para «Qué sigue»). null = nada comprobable pendiente. */
  primeroQueFalta: string | null;
}

const lleno = (s: string | null | undefined) => !!s && s.trim() !== "";

function comprobar(clave: string, e: EstadoParaLaGuia): boolean | null {
  switch (clave) {
    case "casos-con-criterio":
      return e.casos.length > 0 && e.casos.every((c) => lleno(c.criterio));
    case "meta":
      return lleno(e.meta);
    case "fechas":
      return !!e.desde && !!e.hasta;
    default:
      return null;
  }
}

export function guiaDelCiclo(servicio: GuiaDeServicio, e: EstadoParaLaGuia): GuiaDelCiclo {
  const guia = servicio.etapas[e.etapa];
  const producido = guia.producido.map((p) => ({ ...p, hecho: comprobar(p.clave, e) }));
  /* La señal de Planificación («nadie puede decir qué dimensión se va a mover, qué métrica…») se ve sola:
     un caso de uso sin criterio de aceptación DESPUÉS de planificar. En Planificación todavía se está
     escribiendo: ahí es lo que falta, no una señal. */
  const sinCriterio = e.casos.filter((c) => !lleno(c.criterio));
  const despuesDePlanificar = e.etapa === "implementacion" || e.etapa === "adopcion" || e.etapa === "aprendizaje";
  const senalVista =
    despuesDePlanificar && (e.casos.length === 0 || sinCriterio.length > 0)
      ? e.casos.length === 0
        ? "El ciclo avanzó sin casos de uso: nadie puede decir qué se va a mover ni cómo se sabrá si funcionó."
        : `${sinCriterio.length === 1 ? "Un caso de uso no tiene" : `${sinCriterio.length} casos de uso no tienen`} criterio de aceptación: no se va a poder medir si funcionó.`
      : null;
  const falta = producido.find((p) => p.hecho === false);
  return { etapa: e.etapa, guia, producido, senalVista, primeroQueFalta: falta ? falta.texto : null };
}
