/**
 * lib/seguimiento/destinos.ts — EL REGISTRO DE DESTINOS de los hechos (memoria de la cuenta, etapa 6, pieza 3 del
 * circuito). PURO y client-safe.
 *
 * Cada módulo declara qué hechos le sirven y dónde los muestra; el enrutador (lib/seguimiento/enrutador.ts) reparte. Ver
 * docs/DECISIONS.md «Hechos, enrutador y novedades» (los tipos, con su prueba de admisión: quién actúa · dónde aterriza ·
 * qué pasa si nadie lo hace).
 *
 * Reglas que congela lib/seguimiento/destinos.test.ts contra las definiciones REALES de cada documento:
 *   · cada (pieza, sección) existe en su def y no es una sección retirada (Ejecución › pipelines se mudó a la
 *     Planificación el 2026-10-02: una decisión nunca va a Ejecución);
 *   · ningún destino es el handoff (se congela: lo nuevo nunca lo reescribe);
 *   · un resultado va a los documentos (diagnóstico › objetivos, kickoff › métricas), nunca a la ficha: «Resultados que
 *     persigue» sale de los resultados confirmados de cada proyecto (lib/clients/ficha.ts, `deLosResultados`);
 *   · todo tipo tiene al menos un destino o una exclusión escrita;
 *   · un aliado y una empresa de Smarteam no tienen destinos.
 *
 * ⛔ Sumar un destino es decidirlo: el test guarda la foto de las claves.
 */
import type { TemaDeAcuerdo, TipoDeHecho } from "./hechos/tipos";

/** Las empresas que reciben hechos. Un aliado (ALIADO) o Smarteam (INTERNO) no: lo que se dijo ahí no es de un cliente. */
export const KINDS_CON_DESTINOS = ["CLIENTE", "PROSPECTO"] as const;
export type KindConDestinos = (typeof KINDS_CON_DESTINOS)[number];

/**
 * Qué hace el código con el hecho:
 *   · ficha    — una propuesta a la ficha del cliente (`proponerFichaDesdeHechos`); queda delegado en la propuesta.
 *   · alerta   — una `CsAlert` QUEJA verificada (el detector de la lectura, lib/cs/alertas-de-la-lectura.ts).
 *   · vigia    — evidencia para el juicio del vigía (lo lee lib/cs/watchdog-context.ts); nunca una alerta sola.
 *   · procesos — avisa «Volver a mapear» (Procesos conserva su lectura propia, por paso y con Opus).
 *   · avance   — el borrador de avance del cronograma de ese proyecto.
 *   · etapa    — la sugerencia de etapa de la encuesta (nada se escribe en HubSpot).
 *   · novedad  — una novedad en la sección de un documento que ya tiene contenido. Se calcula, no se guarda.
 */
export type SalidaDelDestino = "ficha" | "alerta" | "vigia" | "procesos" | "avance" | "etapa" | "novedad";

/** De quién tiene que ser el hecho: de la cuenta, de un proyecto vinculado, o cualquiera de los dos. */
export type AmbitoDelDestino = "cuenta" | "proyecto" | "cualquiera";

export interface DestinoDeHecho {
  /** Estable: se guarda en `HechoDeReunion.destinos[].clave`. «pieza.seccion» en los documentos. */
  clave: string;
  /** Qué módulo lo recibe (para leer la tabla y el reporte del sondeo). */
  modulo: "ficha" | "cs" | "procesos" | "cronograma" | "etapa" | "kickoff" | "planificacion" | "integraciones" | "diagnostico";
  tipos: readonly TipoDeHecho[];
  /** Solo en un acuerdo: los temas que le sirven. Sin temas, cualquiera. */
  temas?: readonly TemaDeAcuerdo[];
  ambito: AmbitoDelDestino;
  kinds: readonly KindConDestinos[];
  salida: SalidaDelDestino;
  /** El slug de la pieza (lib/pieces/registry.ts) y la sección donde aterriza. */
  pieza?: string;
  seccion?: string;
  /** Integraciones se lee en vivo desde afuera: aplicar una novedad ahí es publicarla. */
  publicaEnVivo?: boolean;
  /**
   * Solo si la cita la dijo alguien del cliente, comprobado por el turno de la transcripción (`loDijoElCliente`): una
   * queja dicha por Smarteam, o sacada de las notas de Gemini, no es una queja del cliente.
   */
  soloSiLoDijoElCliente?: boolean;
  /** Lo contrario: solo si NO se comprobó que la dijo el cliente (la queja va como evidencia al vigía, que la juzga). */
  soloSiNoLoDijoElCliente?: boolean;
  /** Cómo se lee en la tarjeta de la reunión, en la novedad y en el reporte del sondeo. */
  rotulo: string;
}

const CLIENTE: readonly KindConDestinos[] = ["CLIENTE"];
const AMBOS: readonly KindConDestinos[] = ["CLIENTE", "PROSPECTO"];

export const DESTINOS: readonly DestinoDeHecho[] = [
  // ── La ficha (la cuenta) ──
  { clave: "ficha", modulo: "ficha", tipos: ["cuenta"], ambito: "cualquiera", kinds: AMBOS, salida: "ficha", rotulo: "Información del cliente" },
  { clave: "ficha.stakeholders", modulo: "ficha", tipos: ["persona"], ambito: "cuenta", kinds: AMBOS, salida: "ficha", rotulo: "Información del cliente › Personas" },

  // ── Kickoff ──
  { clave: "kickoff.equipo", modulo: "kickoff", tipos: ["persona"], ambito: "proyecto", kinds: CLIENTE, salida: "novedad", pieza: "kickoff", seccion: "equipo", rotulo: "Kickoff › Equipo del proyecto" },
  { clave: "kickoff.alcance", modulo: "kickoff", tipos: ["acuerdo"], temas: ["alcance"], ambito: "proyecto", kinds: CLIENTE, salida: "novedad", pieza: "kickoff", seccion: "alcance", rotulo: "Kickoff › Alcance" },
  { clave: "kickoff.metricas_exito", modulo: "kickoff", tipos: ["resultado"], ambito: "proyecto", kinds: CLIENTE, salida: "novedad", pieza: "kickoff", seccion: "metricas_exito", rotulo: "Kickoff › Cómo mediremos el éxito" },

  // ── Diagnóstico ──
  { clave: "diagnosis.objetivos", modulo: "diagnostico", tipos: ["resultado"], ambito: "proyecto", kinds: CLIENTE, salida: "novedad", pieza: "diagnosis", seccion: "objetivos", rotulo: "Diagnóstico › Objetivos" },
  { clave: "diagnosis.alcance_acordado", modulo: "diagnostico", tipos: ["acuerdo"], temas: ["alcance"], ambito: "proyecto", kinds: CLIENTE, salida: "novedad", pieza: "diagnosis", seccion: "alcance_acordado", rotulo: "Diagnóstico › Alcance acordado" },

  // ── Planificación (lo que va a quedar configurado en HubSpot) ──
  { clave: "planning.definicion_procesos", modulo: "planificacion", tipos: ["acuerdo"], temas: ["proceso_despues"], ambito: "proyecto", kinds: CLIENTE, salida: "novedad", pieza: "planning", seccion: "definicion_procesos", rotulo: "Planificación › Cómo van a funcionar tus procesos" },
  { clave: "planning.arquitectura_solucion", modulo: "planificacion", tipos: ["acuerdo"], temas: ["integracion"], ambito: "proyecto", kinds: CLIENTE, salida: "novedad", pieza: "planning", seccion: "arquitectura_solucion", rotulo: "Planificación › Arquitectura de la solución" },
  { clave: "planning.propiedades", modulo: "planificacion", tipos: ["acuerdo"], temas: ["propiedades"], ambito: "proyecto", kinds: CLIENTE, salida: "novedad", pieza: "planning", seccion: "propiedades", rotulo: "Planificación › Propiedades" },
  { clave: "planning.pipelines", modulo: "planificacion", tipos: ["acuerdo"], temas: ["pipeline"], ambito: "proyecto", kinds: CLIENTE, salida: "novedad", pieza: "planning", seccion: "pipelines", rotulo: "Planificación › Pipelines" },
  { clave: "planning.automatizaciones", modulo: "planificacion", tipos: ["acuerdo"], temas: ["automatizacion"], ambito: "proyecto", kinds: CLIENTE, salida: "novedad", pieza: "planning", seccion: "automatizaciones", rotulo: "Planificación › Automatizaciones" },
  { clave: "planning.conversaciones", modulo: "planificacion", tipos: ["acuerdo"], temas: ["conversaciones"], ambito: "proyecto", kinds: CLIENTE, salida: "novedad", pieza: "planning", seccion: "conversaciones", rotulo: "Planificación › Conversaciones" },

  // ── Integraciones (se lee en vivo desde afuera) ──
  { clave: "tech-requirements.requerimiento", modulo: "integraciones", tipos: ["acuerdo"], temas: ["integracion", "alcance"], ambito: "proyecto", kinds: CLIENTE, salida: "novedad", pieza: "tech-requirements", seccion: "requerimiento", publicaEnVivo: true, rotulo: "Integraciones › Requerimiento" },
  { clave: "tech-requirements.propiedades", modulo: "integraciones", tipos: ["acuerdo"], temas: ["propiedades"], ambito: "proyecto", kinds: CLIENTE, salida: "novedad", pieza: "tech-requirements", seccion: "propiedades", publicaEnVivo: true, rotulo: "Integraciones › Propiedades" },
  { clave: "tech-requirements.comunicacion", modulo: "integraciones", tipos: ["acuerdo"], temas: ["integracion"], ambito: "proyecto", kinds: CLIENTE, salida: "novedad", pieza: "tech-requirements", seccion: "comunicacion", publicaEnVivo: true, rotulo: "Integraciones › Comunicación" },

  // ── Procesos (la cuenta): conserva su lectura propia; el hecho solo avisa «Volver a mapear» ──
  { clave: "procesos", modulo: "procesos", tipos: ["proceso_hoy"], ambito: "cualquiera", kinds: AMBOS, salida: "procesos", pieza: "client-info", seccion: "procesos", rotulo: "Procesos › Volver a mapear" },

  // ── Éxito del cliente: un solo sistema de alertas ──
  { clave: "alerta.queja", modulo: "cs", tipos: ["queja"], ambito: "cualquiera", kinds: CLIENTE, salida: "alerta", soloSiLoDijoElCliente: true, rotulo: "Alerta de queja del cliente" },
  { clave: "vigia.riesgo", modulo: "cs", tipos: ["riesgo"], ambito: "cualquiera", kinds: CLIENTE, salida: "vigia", rotulo: "Evidencia para el vigía" },
  { clave: "vigia.queja", modulo: "cs", tipos: ["queja"], ambito: "cualquiera", kinds: CLIENTE, salida: "vigia", soloSiNoLoDijoElCliente: true, rotulo: "Evidencia para el vigía" },

  // ── Las señales: cada una dispara lo suyo, solo cuando hay algo que decir ──
  { clave: "cronograma.avance", modulo: "cronograma", tipos: ["senal_cronograma"], ambito: "proyecto", kinds: CLIENTE, salida: "avance", rotulo: "Avance del cronograma" },
  { clave: "etapa.encuesta", modulo: "etapa", tipos: ["senal_etapa"], ambito: "proyecto", kinds: CLIENTE, salida: "etapa", rotulo: "Encuesta de la etapa" },
];

/**
 * Los tipos que no tienen destino, con el porqué. Hoy todos tienen al menos uno; la lista existe para que sumar un
 * tipo sin destino sea una decisión escrita y no un olvido (el test lo exige).
 */
export const EXCLUSIONES: Partial<Readonly<Record<TipoDeHecho, string>>> = {};

/** Los destinos de un documento (una pieza): para las novedades de esa pieza. */
export function destinosDeLaPieza(pieza: string): DestinoDeHecho[] {
  return DESTINOS.filter((d) => d.pieza === pieza && d.salida === "novedad");
}

export function destinoPorClave(clave: string): DestinoDeHecho | null {
  return DESTINOS.find((d) => d.clave === clave) ?? null;
}

/** ¿Este destino recibe hechos de esta empresa? */
export function destinoParaElKind(d: DestinoDeHecho, kind: string | null | undefined): boolean {
  return !!kind && (d.kinds as readonly string[]).includes(kind);
}
