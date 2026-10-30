/**
 * lib/cs/proyecto-en-marcha.ts — ¿este proyecto cuenta para el riesgo de la cuenta? PURO (2026-10-29).
 *
 * Pedido de Elías del 29 oct: «que las alertas de riesgo solo tomen proyectos activos. Hoy aparecen proyectos
 * bloqueados o que nunca arrancaron, como Kaizen, que está creado pero no ha pagado». Kamalio salía en rojo, arriba de
 * CEMACO, solo porque su único proyecto dice «Bloqueado» en HubSpot (el cliente no responde hace casi un año y nunca
 * hubo kickoff ni fecha de arranque).
 *
 * UNA regla, la usan la cartera (el color, los motivos para llamar, la entrega de la ficha y las alertas que se ven) y
 * el vigía (no tría ni levanta alertas de un proyecto que no está en marcha). Un proyecto está:
 *
 *   · EN MARCHA siempre que el freno sea nuestro («Atraso por Smarteam», «Proveedor»), arrancara o no: el riesgo es de
 *     Smarteam y sigue contando, como en «en espera del cliente» (lib/cs/ajustes-de-salud.ts). Es lo primero que se mira:
 *     la etapa «Bloqueado» borra la etapa anterior, y un proyecto trabado por nosotros no puede quedar callado.
 *   · SIN ARRANCAR si no hay nada que diga que empezó: ni el kickoff publicado, ni una fecha de arranque CONFIRMADA que
 *     ya llegó (`ProjectTimeline.anchorStartDate`: solo se escribe con un clic humano; la fecha estimada nunca va ahí,
 *     KNOWN-ERRORS), ni una etapa de HubSpot de trabajo (cualquiera que no sea «Handoff» ni «Bloqueado»: el equipo la
 *     mueve cuando el trabajo empieza). Con la etapa «Bloqueado», HubSpot ya no dice en qué etapa estaba: valen el
 *     kickoff y la fecha.
 *   · DETENIDO si arrancó y HubSpot lo tiene bloqueado (estado «blocked» o etapa «Bloqueado»), con el motivo que sea o
 *     sin motivo (Elías: «solo proyectos activos»): sin que HubSpot diga que el freno es nuestro, no cuenta.
 *   · EN MARCHA, todo lo demás. Sin ningún dato (un proyecto sin etapa de HubSpot), cuenta: no saber no esconde riesgo.
 *
 * ⚠ El pago NO entra: medido el 2026-10-29, 3 de los 97 proyectos activos de HubSpot tienen un servicio en Cobranza
 * ligado al proyecto. «Creado sin pago» se lee como lo que es en los datos: sin kickoff, sin fecha y sin etapa de
 * trabajo.
 */

import { fmtDia } from "./formato";

export type MarchaDelProyecto = "en-marcha" | "sin-arrancar" | "detenido";

export interface ProyectoParaMarcha {
  /** El rótulo de la etapa de HubSpot (`hubspotPipelineStageLabel`), o null. */
  etapaHubspot: string | null;
  /** `hubspotStatus` («blocked», «on_track»…), o null. */
  estadoHubspot: string | null;
  /** `hubspotBlockReason`, o null. */
  motivoBloqueo: string | null;
  kickoffPublicado: boolean;
  /** AAAA-MM-DD de la fecha de arranque confirmada, o null. */
  arranqueConfirmado: string | null;
}

export interface LecturaDeMarcha {
  estado: MarchaDelProyecto;
  /** Una frase, sin punto final: por qué no cuenta (o «en marcha»). */
  porque: string;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** HubSpot lo tiene bloqueado: el estado o la etapa. La misma lectura que la cartera usaba para pintar rojo. */
export function bloqueadoEnHubspot(p: Pick<ProyectoParaMarcha, "etapaHubspot" | "estadoHubspot">): boolean {
  return p.estadoHubspot === "blocked" || /bloquead/i.test(p.etapaHubspot ?? "");
}

/** El freno lo pone Smarteam (o un proveedor nuestro): el riesgo es nuestro. */
export function frenoNuestro(motivo: string | null | undefined): boolean {
  return !!motivo && /atraso por smarteam|proveedor/i.test(motivo);
}

/** Las etapas de HubSpot que no dicen que el trabajo empezó. */
function etapaDeArranque(etapa: string): boolean {
  const e = sinTildes(etapa);
  return e === "handoff" || e === "hand off" || /bloquead/.test(e);
}

export function marchaDelProyecto(p: ProyectoParaMarcha, hoy: string): LecturaDeMarcha {
  if (frenoNuestro(p.motivoBloqueo)) return { estado: "en-marcha", porque: "en marcha" };
  const etapa = p.etapaHubspot?.trim() || null;
  const arranco =
    p.kickoffPublicado ||
    (!!p.arranqueConfirmado && p.arranqueConfirmado <= hoy) ||
    (!!etapa && !etapaDeArranque(etapa)) ||
    // Sin etapa de HubSpot no hay cómo saberlo: cuenta, salvo que diga bloqueado.
    (!etapa && !bloqueadoEnHubspot(p));
  if (!arranco) {
    const futura = p.arranqueConfirmado && p.arranqueConfirmado > hoy ? `; arranca el ${fmtDia(p.arranqueConfirmado, hoy)}` : "";
    return { estado: "sin-arrancar", porque: `no ha arrancado (sin kickoff publicado ni fecha de arranque confirmada${futura})` };
  }
  if (bloqueadoEnHubspot(p)) {
    const motivo = p.motivoBloqueo?.trim();
    return { estado: "detenido", porque: `está bloqueado en HubSpot${motivo ? ` (${motivo.toLowerCase()})` : ""}` };
  }
  return { estado: "en-marcha", porque: "en marcha" };
}

/** ¿Cuenta para el riesgo? Solo lo que está en marcha. */
export function cuentaParaElRiesgo(p: ProyectoParaMarcha, hoy: string): boolean {
  return marchaDelProyecto(p, hoy).estado === "en-marcha";
}

/** Las categorías que son de la CUENTA y no de un proyecto: dedupean por cliente aunque el vigía les guarde un proyecto. */
export const ALERTAS_DE_LA_CUENTA: ReadonlySet<string> = new Set([
  "ADOPTION_RISK", "LICENSE_UNUSED", "RENEWAL_RISK", "CHURN_RISK",
  "ENGAGEMENT_COLD", "SUPPORT_TICKETS", "EXPANSION_OPPORTUNITY", "QUEJA",
  // El aviso del equipo (2026-10-29) nace de una QUEJA que dijo alguien de Smarteam: es de la cuenta, como la queja.
  "AVISO_DEL_EQUIPO",
]);

/** Lo que dijo una persona o lo que está en juego con la plata de la cuenta (una oportunidad no es un riesgo): no depende de ningún proyecto. */
const NUNCA_SE_APAGAN: ReadonlySet<string> = new Set(["QUEJA", "AVISO_DEL_EQUIPO", "RENEWAL_RISK", "CHURN_RISK", "EXPANSION_OPPORTUNITY"]);

/**
 * ¿Esta alerta abierta se apaga porque su proyecto no está en marcha? El vigía le guarda un proyecto a TODA alerta,
 * también a las de la cuenta, así que el proyecto solo no alcanza:
 *   · una alerta de proyecto se apaga con su proyecto;
 *   · una de la cuenta, solo si a la cuenta no le queda NINGÚN proyecto en marcha (Kamalio: «sin contacto hace un año»);
 *   · una queja, un aviso del equipo, el riesgo de renovación o de cancelación y una oportunidad no se apagan nunca.
 */
export function alertaApagadaPorMarcha(a: { category: string; proyectoFuera: boolean; cuentaConMarcha: boolean }): boolean {
  if (!a.proyectoFuera || NUNCA_SE_APAGAN.has(a.category)) return false;
  return !ALERTAS_DE_LA_CUENTA.has(a.category) || !a.cuentaConMarcha;
}

/** Las alertas abiertas que se apagan, con los proyectos de cartera de sus cuentas y la lectura de cada proyecto. PURO. */
export function alertasQueSeApagan<A extends { clientId: string; projectId: string; category: string }>(
  abiertas: readonly A[],
  deCartera: ReadonlyArray<{ id: string; clientId: string }>,
  estadoDe: (projectId: string) => MarchaDelProyecto | undefined,
): A[] {
  const conMarcha = new Set(deCartera.filter((p) => estadoDe(p.id) === "en-marcha").map((p) => p.clientId));
  return abiertas.filter((a) => {
    const estado = estadoDe(a.projectId);
    if (!estado || estado === "en-marcha") return false;
    return alertaApagadaPorMarcha({ category: a.category, proyectoFuera: true, cuentaConMarcha: conMarcha.has(a.clientId) });
  });
}

/** La nota con que se cierra una alerta abierta de un proyecto que no está en marcha (la firma el sistema). */
export function notaDeCierrePorMarcha(nombre: string, m: LecturaDeMarcha): string {
  return `Se cerró sola: «${nombre}» ${m.porque}, y las alertas de riesgo solo miran proyectos en marcha (2026-10-29). Vuelve si el proyecto arranca o se desbloquea.`;
}
