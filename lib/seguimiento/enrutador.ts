/**
 * lib/seguimiento/enrutador.ts — EL ENRUTADOR de los hechos (memoria de la cuenta, etapa 6). PURO.
 *
 * «El modelo clasifica, el código rutea» (DECISIONS «Hechos, enrutador y novedades»). Recibe los hechos verificados de
 * una reunión (lib/seguimiento/hechos/salida.ts) y dice, con el registro de destinos (lib/seguimiento/destinos.ts), a
 * dónde va cada uno y qué hay que correr:
 *   · una reunión de puertas adentro, de un aliado o de Smarteam no deja nada (los hechos no se escriben);
 *   · en un prospecto no hay avance, etapa, alertas ni novedades de proyecto, y si tiene una preventa viva, la ficha la
 *     propone solo la preventa (los hechos de la cuenta no proponen ahí);
 *   · un hecho de un proyecto que no está vinculado a la reunión pasa a la cuenta (y si su tipo no tiene destino de
 *     cuenta, queda solo en la tarjeta de la reunión);
 *   · un hecho repetido (misma huella que uno todavía pendiente del mismo cliente y el mismo ámbito) se marca
 *     `mismoQueId` y no se vuelve a mandar a ningún lado. La queja y las señales sí siguen: una queja que vuelve en otra
 *     reunión es evidencia nueva para su alerta (que tiene su propia llave), y una señal es de ESTA reunión;
 *   · el avance corre solo con una señal de cronograma y solo para los proyectos que cumplen `linkFeedsAvance`; la etapa,
 *     solo con una señal de etapa del proyecto;
 *   · ⛔ nada va al handoff (no está en el registro, y el test del registro lo congela).
 *
 * El enrutador no escribe nada: lo aplica lib/seguimiento/hechos-server.ts, cada destino con su propio ciclo.
 */
import { DESTINOS, destinoParaElKind, type DestinoDeHecho, type SalidaDelDestino } from "./destinos";
import type { DestinoDelHecho } from "./hechos/estado";
import { esSenal, loDijoElCliente, type HechoVerificado } from "./hechos/tipos";

export interface ContextoDelRuteo {
  /** `Client.kind` del dueño de la reunión. */
  kind: string | null;
  /** Solo estuvo el equipo: lo dicho ahí no lo dijo el cliente. */
  puertasAdentro: boolean;
  /** El prospecto tiene una preventa viva: la ficha la propone la preventa, no los hechos. */
  preventaViva: boolean;
  /** Los proyectos vinculados a la reunión (incluidos, del mismo cliente). */
  proyectosVinculados: ReadonlySet<string>;
  /** De esos, los que cumplen `linkFeedsAvance` (los únicos que reciben avance). */
  proyectosQueAlimentanElAvance: ReadonlySet<string>;
  /** Los hechos todavía pendientes del mismo cliente, por `claveDeRepeticion` → su id. */
  hechosAbiertosPorHuella: ReadonlyMap<string, string>;
}

/** El hecho, con el ámbito corregido (un proyecto no vinculado pasa a la cuenta) y a dónde va. */
export interface HechoRuteado {
  hecho: HechoVerificado;
  /** Los destinos con su estado inicial (pendiente). Vacío = queda solo en la tarjeta de la reunión. */
  destinos: DestinoDelHecho[];
  /** El hecho pendiente que ya decía lo mismo (no se vuelve a mandar a ningún lado). */
  mismoQueId: string | null;
}

export interface AccionesDelRuteo {
  /** Índices (en `porHecho`) de los hechos que van a la ficha. */
  ficha: number[];
  /** Índices de las quejas que levantan una alerta. */
  alertas: number[];
  /** Índices de los riesgos que van al vigía como evidencia. */
  vigia: number[];
  /** Los proyectos a los que se les corre el avance (con una señal de cronograma). */
  avance: string[];
  /** Por proyecto, los índices de sus señales de etapa. */
  etapa: Map<string, number[]>;
  /** Hay hechos de cómo trabaja hoy el cliente: Procesos avisa «Volver a mapear». */
  procesos: boolean;
}

export interface Ruteo {
  /** false = la reunión no deja hechos (puertas adentro, un aliado, Smarteam o sin dueño): no se escribe nada. */
  seEscriben: boolean;
  porHecho: HechoRuteado[];
  acciones: AccionesDelRuteo;
}

/** La clave con que se busca un hecho repetido: el ámbito (proyecto o cuenta) y la huella. */
export function claveDeRepeticion(projectId: string | null, huella: string): string {
  return `${projectId ?? "cuenta"}|${huella}`;
}

const accionesVacias = (): AccionesDelRuteo => ({ ficha: [], alertas: [], vigia: [], avance: [], etapa: new Map(), procesos: false });

/** ¿Este destino recibe este hecho? (tipo, tema, ámbito, empresa y quién lo dijo). */
function recibe(d: DestinoDeHecho, h: HechoVerificado, ctx: ContextoDelRuteo): boolean {
  if (!d.tipos.includes(h.tipo)) return false;
  if (d.temas && (!h.tema || !d.temas.includes(h.tema))) return false;
  if (!destinoParaElKind(d, ctx.kind)) return false;
  if (d.ambito === "cuenta" && h.projectId) return false;
  if (d.ambito === "proyecto" && !h.projectId) return false;
  if (d.soloSiLoDijoElCliente && !loDijoElCliente(h)) return false;
  if (d.soloSiNoLoDijoElCliente && loDijoElCliente(h)) return false;
  if (d.salida === "ficha" && ctx.kind === "PROSPECTO" && ctx.preventaViva) return false;
  if (d.salida === "avance" && (!h.projectId || !ctx.proyectosQueAlimentanElAvance.has(h.projectId))) return false;
  return true;
}

/** Los destinos que siguen aunque el hecho sea repetido: tienen su propia llave o son de esta reunión. */
const SIGUEN_AUNQUE_SE_REPITA: ReadonlySet<SalidaDelDestino> = new Set(["alerta", "avance", "etapa"]);

export function rutear(hechos: readonly HechoVerificado[], ctx: ContextoDelRuteo): Ruteo {
  const acciones = accionesVacias();
  if (ctx.puertasAdentro || !ctx.kind || (ctx.kind !== "CLIENTE" && ctx.kind !== "PROSPECTO")) {
    return { seEscriben: false, porHecho: [], acciones };
  }
  const porHecho: HechoRuteado[] = hechos.map((original) => {
    // Un proyecto que no está vinculado a la reunión (o un P# que se coló) pasa a la cuenta.
    const vinculado = !!original.projectId && ctx.proyectosVinculados.has(original.projectId);
    const hecho: HechoVerificado = vinculado ? original : { ...original, projectId: null, ambito: "cuenta" };
    const mismoQueId = esSenal(hecho.tipo) ? null : (ctx.hechosAbiertosPorHuella.get(claveDeRepeticion(hecho.projectId, hecho.huella)) ?? null);
    const destinos = DESTINOS.filter((d) => recibe(d, hecho, ctx))
      .filter((d) => !mismoQueId || SIGUEN_AUNQUE_SE_REPITA.has(d.salida))
      .map((d): DestinoDelHecho => ({ clave: d.clave, estado: "pendiente" }));
    return { hecho, destinos, mismoQueId };
  });

  porHecho.forEach((r, i) => {
    const salidas = new Set(r.destinos.map((d) => DESTINOS.find((x) => x.clave === d.clave)!.salida));
    if (salidas.has("ficha")) acciones.ficha.push(i);
    if (salidas.has("alerta")) acciones.alertas.push(i);
    if (salidas.has("vigia")) acciones.vigia.push(i);
    if (salidas.has("procesos")) acciones.procesos = true;
    if (salidas.has("avance") && r.hecho.projectId && !acciones.avance.includes(r.hecho.projectId)) acciones.avance.push(r.hecho.projectId);
    if (salidas.has("etapa") && r.hecho.projectId) acciones.etapa.set(r.hecho.projectId, [...(acciones.etapa.get(r.hecho.projectId) ?? []), i]);
  });
  return { seEscriben: true, porHecho, acciones };
}

/** La salida de un destino por su clave (para el escritor y las pantallas). */
export function salidaDe(clave: string): SalidaDelDestino | null {
  return DESTINOS.find((d) => d.clave === clave)?.salida ?? null;
}
