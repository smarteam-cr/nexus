/**
 * lib/cs/relacion-gestionada.ts — la relación de Smarteam con cada cuenta en HubSpot, en una línea y con qué hacer
 * (2026-10-09). Puro.
 *
 * HubSpot tiene dos relaciones con cada cliente de un partner (DECISIONS §La cartera de la CSL):
 * · VENDIDA: Smarteam vendió la suscripción. Dura mientras el cliente pague. Por ella el registro sigue apareciendo.
 * · GESTIONADA: Smarteam trabaja hoy en el portal del cliente. Solo con ésta HubSpot comparte el uso, la activación y
 *   las licencias, y cuenta el «managed MRR» de los puntos de partner. Cada cosa que alguien de Smarteam crea o edita
 *   en el portal cuenta 60 días; entrar sin hacer nada no cuenta. Sin trabajo en 60 días, termina sola.
 *   (knowledge.hubspot.com/partner-tools/earn-managed-mrr-credit; medido el 2026-10-09: en 34 de las 47 gestionadas
 *   el vencimiento cae 59 a 61 días después de la última actividad de Smarteam.)
 *
 * El 2026-10-09 había 20 clientes con la relación terminada sin que nadie lo notara (la copia diaria de Partner
 * estuvo apagada de julio a octubre) y 7 que vencían en un mes. Esto la vuelve un dato de cada cuenta.
 */
import { relacionTerminada, type LecturaDePartner } from "./lectura-partner";
import { diasEntre, fmtDia, plural } from "./formato";

/** La relación gestionada que vence dentro de esta ventana es motivo para llamar… */
export const VENTANA_DE_RELACION = 30;
/** …y dentro de esta, es urgente: le llega al CSE de la cuenta en «Para ti». */
export const VENTANA_DE_RELACION_URGENTE = 14;
/**
 * La relación gestionada que terminó hace esto o menos es motivo para llamar (alta los primeros
 * `VENTANA_DE_RELACION` días). Más atrás no: hay relaciones terminadas en 2021 con la cuenta todavía
 * activa en HubSpot, y la lista se llenaría de cosas viejas.
 */
export const VENTANA_DE_RELACION_TERMINADA = 90;

/** La regla, como la lee el equipo (va en el ⓘ de la cuenta y en la leyenda). */
export const REGLA_DE_LA_RELACION =
  "HubSpot comparte el uso de una cuenta solo mientras Smarteam la gestiona. Cada vez que alguien de Smarteam crea o edita algo en el portal del cliente, cuenta 60 días; entrar sin hacer nada no cuenta. Si pasan 60 días sin trabajo, la relación termina y se pierden el uso, el MRR gestionado y sus puntos de partner.";

export type EstadoDeRelacion =
  | "gestionada"
  | "por-vencer"
  | "urgente"
  | "terminada"
  | "vendida"
  | "sin-relacion"
  | "sin-partner";

/** Los estados en el orden en que se revisan (lo que se pierde primero). */
export const ESTADOS_DE_RELACION: ReadonlyArray<{ clave: EstadoDeRelacion; nombre: string }> = [
  { clave: "urgente", nombre: "Vence en 14 días o menos" },
  { clave: "por-vencer", nombre: "Vence en 30 días o menos" },
  { clave: "terminada", nombre: "Terminada" },
  { clave: "gestionada", nombre: "Gestionada" },
  { clave: "vendida", nombre: "Solo vendida" },
  { clave: "sin-relacion", nombre: "Sin relación vigente" },
  { clave: "sin-partner", nombre: "Sin HubSpot Partner" },
];

export interface RelacionConHubspot {
  estado: EstadoDeRelacion;
  /** AAAA-MM-DD en que vence, según HubSpot (solo gestionada). */
  vence: string | null;
  diasParaVencer: number | null;
  /** AAAA-MM-DD en que terminó (solo terminada). */
  termino: string | null;
  diasDesdeQueTermino: number | null;
  /** AAAA-MM-DD: la última vez que alguien de Smarteam hizo algo en el portal, según HubSpot. */
  ultimaActividad: string | null;
  /** Quién fue, si la copia de HubSpot lo pudo traducir. */
  quien: string | null;
  /** Para una celda: «Vence en 12 días», «Terminó hace 34 días». */
  corto: string;
  /** Una línea: qué pasa. */
  porque: string;
  /** Qué hacer, o null si no hay nada que hacer. */
  queHacer: string | null;
  /** ámbar: pide trabajo en el portal · verde: al día · gris: no aplica. */
  tono: "verde" | "ambar" | "gris";
}

type Lectura = Pick<
  LecturaDePartner,
  "activa" | "gestionada" | "vendida" | "portalBorrado" | "relacionGestionadaVence" | "relacionGestionadaTermino" | "ultimaActividadDeSmarteam" | "ultimoQueTrabajo"
>;

const TRABAJAR = "que alguien de Smarteam cree o edite algo en su portal";

export function relacionConHubspot(p: Lectura | null | undefined, hoy: string): RelacionConHubspot {
  const base = {
    vence: null,
    diasParaVencer: null,
    termino: null,
    diasDesdeQueTermino: null,
    ultimaActividad: p?.ultimaActividadDeSmarteam ? p.ultimaActividadDeSmarteam.slice(0, 10) : null,
    quien: p?.ultimoQueTrabajo ?? null,
  };
  if (!p) {
    return { ...base, estado: "sin-partner", corto: "Sin HubSpot Partner", porque: "La cuenta no está en HubSpot Partner.", queHacer: null, tono: "gris" };
  }
  const ultima = base.ultimaActividad
    ? ` Lo último que hizo Smarteam en su portal fue el ${fmtDia(base.ultimaActividad, hoy)}${base.quien ? ` (${base.quien})` : ""}.`
    : "";

  if (p.gestionada) {
    const vence = p.relacionGestionadaVence;
    if (!vence) {
      return { ...base, estado: "gestionada", corto: "Gestionada", porque: `Smarteam la gestiona y HubSpot comparte su uso.${ultima}`, queHacer: null, tono: "verde" };
    }
    const dias = diasEntre(hoy, vence);
    const estado: EstadoDeRelacion = dias <= VENTANA_DE_RELACION_URGENTE ? "urgente" : dias <= VENTANA_DE_RELACION ? "por-vencer" : "gestionada";
    const cuando = dias < 0 ? `venció el ${fmtDia(vence, hoy)}` : dias === 0 ? "vence hoy" : `vence en ${plural(dias, "día", "días")}`;
    return {
      ...base,
      vence,
      diasParaVencer: dias,
      estado,
      corto: estado === "gestionada" ? `Gestionada · vence el ${fmtDia(vence, hoy)}` : dias < 0 ? "Vencida" : dias === 0 ? "Vence hoy" : `Vence en ${plural(dias, "día", "días")}`,
      porque: `La relación gestionada ${cuando}.${ultima}`,
      queHacer: estado === "gestionada" ? null : `Para que no se pierda, ${TRABAJAR} antes del ${fmtDia(vence, hoy)}.`,
      tono: estado === "gestionada" ? "verde" : "ambar",
    };
  }

  const termino = relacionTerminada(p, hoy);
  if (termino) {
    const hace = diasEntre(termino, hoy);
    const recupera = p.activa && !p.portalBorrado;
    return {
      ...base,
      termino,
      diasDesdeQueTermino: hace,
      estado: "terminada",
      corto: `Terminó hace ${plural(hace, "día", "días")}`,
      porque: `La relación gestionada terminó el ${fmtDia(termino, hoy)}: desde entonces HubSpot no comparte su uso.${ultima}`,
      queHacer: recupera ? `Para recuperarla, ${TRABAJAR}: la relación vuelve a empezar ese día.` : null,
      tono: recupera && hace <= VENTANA_DE_RELACION_TERMINADA ? "ambar" : "gris",
    };
  }

  if (p.vendida) {
    return {
      ...base,
      estado: "vendida",
      corto: "Solo vendida",
      porque: "Smarteam le vendió la suscripción, pero no la gestiona: HubSpot no comparte su uso.",
      queHacer: p.activa ? "Para gestionarla, alguien de Smarteam necesita usuario en su portal y trabajar ahí." : null,
      tono: "gris",
    };
  }
  return { ...base, estado: "sin-relacion", corto: "Sin relación vigente", porque: "HubSpot no registra una relación vigente con Smarteam.", queHacer: null, tono: "gris" };
}

/** ¿Pide trabajo en el portal ya? Lo que entra a «Para ti» del CSE de la cuenta. */
export function pideTrabajoEnElPortal(r: RelacionConHubspot): boolean {
  if (r.estado === "urgente") return true;
  return r.estado === "terminada" && r.queHacer !== null && (r.diasDesdeQueTermino ?? Infinity) <= VENTANA_DE_RELACION;
}
