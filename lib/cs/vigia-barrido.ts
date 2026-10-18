/**
 * lib/cs/vigia-barrido.ts — QUÉ PROYECTOS DEL BARRIDO DIARIO DEL VIGÍA VALE LA PENA VOLVER A TRIAR. PURO: lo usa
 * lib/cs/watchdog.ts (`runWatchdogSweep`) y lo prueba lib/cs/vigia-barrido.test.ts.
 *
 * Un proyecto entra al barrido por una NOVEDAD (eventos del cronograma sin procesar, un riesgo nuevo de una reunión) o
 * por un RIESGO que sigue ahí (atrasos, frialdad, renovación cerca, deuda…). Lo nuevo se tría siempre y en el momento.
 * Lo que sigue igual tenía un costo escondido: si la corrida anterior no dejó alerta, el proyecto volvía a entrar cada
 * día con los mismos motivos y el agente volvía a leer lo mismo. La huella de los motivos lo evita
 * (`VIGIA_NO_REPITE_SIN_CAMBIOS`, lib/ai/ahorro.ts).
 */
import { createHash } from "node:crypto";

/** Los motivos de riesgo de un proyecto en el barrido, ya calculados. Solo lo que cambia cuando cambia algo de verdad. */
export interface MotivosDelBarrido {
  cronograma: boolean;
  fasesVencidas: number;
  tareasVencidas: number;
  estancado: boolean;
  alarmasDeEtapa: readonly string[];
  alcanceExcedido: boolean;
  frio: boolean;
  ticketsAbiertos: number;
  renovacionCerca: boolean;
  relacionPorVencer: boolean;
  deuda: boolean;
  bloqueadoEnHubspot: boolean;
  estadoEnHubspot: string | null;
  cancelacion: boolean;
  senalDeIngresos: boolean;
  usoBajoConRenovacion: boolean;
  licenciasSinUsarConRenovacion: boolean;
}

/** La huella de los motivos: 16 caracteres que cambian si cambia cualquiera. Las alarmas se ordenan (el orden no importa). */
export function huellaDelBarrido(m: MotivosDelBarrido): string {
  const normal = { ...m, alarmasDeEtapa: [...m.alarmasDeEtapa].sort() };
  const texto = JSON.stringify(Object.keys(normal).sort().map((k) => [k, normal[k as keyof typeof normal]]));
  return createHash("sha1").update(texto).digest("hex").slice(0, 16);
}

/**
 * ¿Hay que volver a triar un proyecto que entra solo por riesgo? Sí, salvo que la última vez que se trió en el barrido
 * tuviera la misma huella y haya sido hace menos de `dias`.
 */
export function debeVolverATriar(o: { huella: string; anterior: { huella: string | null; at: Date } | null; ahora: Date; dias: number }): boolean {
  if (!o.anterior?.huella) return true;
  if (o.anterior.huella !== o.huella) return true;
  return o.ahora.getTime() - o.anterior.at.getTime() >= o.dias * 86_400_000;
}

/** La huella que guardó una corrida del barrido en su `output` (JSON), o null. */
export function huellaDeLaCorrida(output: string | null): string | null {
  if (!output) return null;
  try {
    const h = (JSON.parse(output) as { huellaDelBarrido?: unknown }).huellaDelBarrido;
    return typeof h === "string" ? h : null;
  } catch {
    return null;
  }
}
