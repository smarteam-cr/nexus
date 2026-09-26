/**
 * lib/asistente/textos-del-acuerdo.ts — LO QUE DICE EL BOTÓN DE UN ACUERDO SOBRE LA PROPUESTA (E3 P5).
 *
 * PURO. Sin React. Lo usan el cajón del chat (ChatDelAsistente.tsx), el cronograma (el motivo del botón,
 * `motivoParaElAcuerdo`) y el manejador (el texto del desenlace, `textoDelDesenlace`).
 *
 * Con una propuesta del cronograma abierta, lo acordado no se aplica al cronograma: pasa a la PROPUESTA
 * (o, si se pidió eso, la aplica entera o la descarta). El botón, la espera y la caja ya resuelta lo
 * dicen con esas palabras; «Aplicar al cronograma» sobre algo que va a la propuesta mentiría.
 * Sin propuesta (`borrador` null o ausente) todas devuelven null y el cajón usa sus textos de siempre.
 */
import type { CambioAcordado } from "./acuerdo";

export type ClaseDeAcuerdo = "pasar" | "aplicar" | "descartar";

/**
 * E4 (2026-09): un acuerdo del cronograma SIN operaciones es de una versión anterior (los hilos de antes
 * del 2026-08-20 guardaban solo una instrucción de texto, que ejecutaba «Pedir cambio con IA»). Ese
 * carril se retiró: el botón no aplica y dice esto (≤ 60 caracteres: va EN el botón).
 */
export const ACUERDO_DE_OTRA_VERSION = "Es de una versión anterior: pídemelo de nuevo";

/** Qué hace el botón de este acuerdo, o null si es de los de siempre (sin propuesta). */
export function claseDeAcuerdo(a: Pick<CambioAcordado, "borrador" | "operaciones">): ClaseDeAcuerdo | null {
  if (typeof a.borrador !== "string") return null;
  const ops = (a.operaciones ?? []) as Array<{ op?: unknown }>;
  if (ops.length === 1 && ops[0]?.op === "propuesta.aplicar") return "aplicar";
  if (ops.length === 1 && ops[0]?.op === "propuesta.descartar-entera") return "descartar";
  return "pasar";
}

/** El botón: «Pasar a la propuesta (N)» (N = lo que queda marcado), «Aplicar la propuesta al
 *  cronograma» o «Descartar la propuesta». */
export function textoDelBoton(a: Pick<CambioAcordado, "borrador" | "operaciones">, aceptadas: number): string | null {
  const clase = claseDeAcuerdo(a);
  if (clase === "aplicar") return "Aplicar la propuesta al cronograma";
  if (clase === "descartar") return "Descartar la propuesta";
  if (clase === "pasar") return `Pasar a la propuesta (${aceptadas})`;
  return null;
}

/** Mientras corre: «Pasando a la propuesta…», «Aplicando la propuesta…», «Descartando la propuesta…». */
export function textoMientrasAplica(a: Pick<CambioAcordado, "borrador" | "operaciones">): string | null {
  const clase = claseDeAcuerdo(a);
  if (clase === "aplicar") return "Aplicando la propuesta…";
  if (clase === "descartar") return "Descartando la propuesta…";
  if (clase === "pasar") return "Pasando a la propuesta…";
  return null;
}

/** La caja ya resuelta, en una línea. null = la de siempre («Aplicado. ¿Hay que cambiar algo más?»). */
export function textoDelAcuerdoAplicado(a: Pick<CambioAcordado, "borrador" | "operaciones">): string | null {
  const clase = claseDeAcuerdo(a);
  if (clase === "aplicar") return "Propuesta aplicada al cronograma.";
  if (clase === "descartar") return "Propuesta descartada.";
  if (clase === "pasar") return "Pasado a la propuesta. ¿Algo más, o la aplicas?";
  return null;
}

/** El rótulo de la caja ya resuelta. null = el de siempre (« · ya aplicado»). */
export function rotuloDelAcuerdoAplicado(a: Pick<CambioAcordado, "borrador" | "operaciones">): string | null {
  const clase = claseDeAcuerdo(a);
  if (clase === "aplicar") return " · propuesta aplicada";
  if (clase === "descartar") return " · propuesta descartada";
  if (clase === "pasar") return " · ya en la propuesta";
  return null;
}

/**
 * El desenlace que queda en el hilo cuando lo acordado fue a la PROPUESTA o se descartó la propuesta
 * (tuteo: es la voz del asistente y el modelo lo relee). null = los de siempre (lib/asistente/handler.ts:
 * el cronograma, o la vista previa del editor de un documento).
 */
export function textoDelDesenlaceDeLaPropuesta(
  destino: "cronograma" | "propuesta" | "descarte" | undefined,
  detalle: string,
): string | null {
  if (destino === "descarte") return "✅ Listo, se descartó la propuesta: el cronograma queda como estaba.";
  if (destino !== "propuesta") return null;
  return detalle
    ? `⚠ Pasó a la propuesta, pero con una parte hice algo distinto:\n\n${detalle}\n\nRevísala arriba del Gantt.`
    : "✅ Listo, quedó en la propuesta (arriba del Gantt). El cronograma no cambia hasta que la apliques.";
}

/**
 * Lo que el hilo dice además, sin que el editor haya hecho nada distinto (revisión de E3, #10/#15): aplicar
 * la propuesta desde el chat creó o quitó tareas, y el avance se vuelve a evaluar solo. Iba como AVISO, y el
 * hilo quedaba con «⚠ el editor hizo algo distinto», que el modelo relee como un desvío que no hubo.
 */
export const NOTA_AVANCE_REEVALUANDOSE =
  "Además estoy volviendo a evaluar el avance con el cronograma nuevo: cuando termine, confírmalo abajo del Gantt.";

/* Un fallo cuyo motivo ya dice qué hacer (pedirlo otra vez, o revisar la propuesta que llegó) no deja nada
   que reintentar con el mismo botón: «puedes aplicarlos de nuevo» lo contradecía (revisión de E3, #11). */
const SIN_REINTENTO = /pídemelo de nuevo|llegó otra propuesta/i;

/**
 * El texto del desenlace que el manejador escribe en el hilo, después de su marca. Puro. Vivía adentro de
 * lib/asistente/handler.ts; salió para que sus casos se CORRAN (revisión de E3, #10, #11 y #15).
 * ⚠ Es la voz del asistente y el modelo la relee: tuteo neutro.
 *  · `detalle`: lo que el editor hizo DISTINTO de lo pedido (rescates, semanas acomodadas).
 *  · `notas`: lo que se hizo además, sin desvío: van después, como línea aparte.
 */
export function textoDelDesenlace(i: {
  ok: boolean;
  detalle: string;
  destino?: "cronograma" | "propuesta" | "descarte";
  vistaPrevia: boolean;
  /** «el cronograma» o «el documento». */
  elDocumento: string;
  notas?: readonly string[];
}): string {
  if (!i.ok) {
    /* El punto final del motivo se saca: el motivo de la pantalla ya puede traerlo, y el hilo —que el
       modelo vuelve a leer— quedaba con «(arriba del Gantt)..». */
    const motivo = (i.detalle || "el editor rechazó el cambio").replace(/[\s.]+$/, "");
    if (SIN_REINTENTO.test(motivo)) return `⛔ No se pudo aplicar: ${motivo}.`;
    return `⛔ No se pudo aplicar: ${motivo}. Los cambios siguen pendientes: puedes aplicarlos de nuevo, o dime qué ajustamos.`;
  }
  const principal =
    textoDelDesenlaceDeLaPropuesta(i.destino, i.detalle) ??
    (i.detalle
      ? `⚠ Se aplicó, pero el editor hizo algo distinto con una parte:\n\n${i.detalle}\n\n${
          i.vistaPrevia ? "Revisa la vista previa antes de aceptar." : `Ya quedó guardado en ${i.elDocumento}: revísalo.`
        }`
      : i.vistaPrevia
        ? "✅ Se aplicó. Revisa la vista previa en el documento y acepta los cambios que quieras conservar."
        : /* ⛔ EL CARRIL DE OPERACIONES NO DEJA VISTA PREVIA: escribe directo, en ~1 ms. Mandar a la persona a
             «aceptar los cambios» la deja buscando un banner que no existe —y peor, sugiere que lo que ya está
             guardado todavía se puede descartar. */
          `✅ Listo, ${i.elDocumento} ya quedó actualizado. Si algo no está como esperabas, dímelo y lo ajustamos.`);
  const notas = (i.notas ?? []).map((n) => n.trim()).filter((n) => n.length > 0);
  return notas.length > 0 ? `${principal}\n\n${notas.join("\n")}` : principal;
}

/** A dónde fue lo acordado: lo lee el desenlace del hilo (`destino`). null = sin propuesta (se deduce). */
export function destinoDelAcuerdo(
  a: Pick<CambioAcordado, "borrador" | "operaciones">,
): "cronograma" | "propuesta" | "descarte" | null {
  const clase = claseDeAcuerdo(a);
  if (clase === "aplicar") return "cronograma";
  if (clase === "descartar") return "descarte";
  if (clase === "pasar") return "propuesta";
  return null;
}

/* ── POR QUÉ EL BOTÓN DE UN ACUERDO DEL CRONOGRAMA NO APLICA AHORA (revisión de E3, #24) ──────────────
   Vivía adentro del cronograma (CronogramaCanvas.tsx, `motivoDelChat`), donde ninguna prueba la corría:
   sin la comparación del token, el «Descartar la propuesta» acordado para una propuesta A quedaba vivo
   cuando llegaba otra B, y la borraba. Ahora es pura y su tabla la corre. */

/** Los motivos del botón del chat (≤ 60 caracteres: van EN el botón). */
export const MOTIVOS_DEL_CHAT = {
  hayPropuesta: "Hay una propuesta abierta: pídemelo de nuevo",
  cambio: "La propuesta cambió: pídemelo de nuevo",
  enSuBarra: "Resuelve la propuesta en su barra",
  armando: "Espera: la IA está armando las tareas",
  recalcular: "Faltan recalcular tareas: mira la barra",
} as const;

/** Lo que el cronograma tiene en pantalla, leído en el momento. */
export interface LaPropuestaEnPantalla {
  /** Hay una propuesta que esta versión sabe leer (`borrador-v1`). */
  hayBorrador: boolean;
  /** Hay algo guardado que NO es un v1: se resuelve en su línea («Descartarla»). */
  ilegible: boolean;
  /** El token de la propuesta en pantalla (null sin propuesta). */
  token: string | null;
  /** Su versión: sube con cada casilla y con cada cambio que el chat pasa. Nunca baja. */
  version: number | null;
  /** Trae cambios que esta versión no sabe leer: solo se descarta en su barra. */
  conDesconocidos: boolean;
  /** La IA está armando o recalculando sus tareas. */
  tareasArmando: boolean;
  /** Aplicar está frenado (tareas por recalcular: lo dice la barra). */
  bloqueada: boolean;
}

/**
 * Por qué el botón del chat no aplica ESTE acuerdo ahora (va en el botón), o null si puede. Puro.
 *  · Sin operaciones: es de una versión anterior (E4).
 *  · Sin propuesta en el acuerdo (`borrador` null): con una propuesta en pantalla, el PUT respondería 409.
 *  · Acordado para una propuesta: tiene que ser LA de la pantalla (mismo token), en las tres clases. Si es
 *    otra, «cambio»: el acuerdo era para la de antes.
 *  · «Aplícala»: si la pantalla ya va DESPUÉS de la versión acordada (se desmarcó algo, o el chat pasó otro
 *    cambio), la lista acordada ya no es la que se ve: «cambio» (revisión de E3, #11: el botón seguía vivo y
 *    cada clic fallaba). Si la pantalla va ATRÁS, se deja: aplicar trae la guardada y compara otra vez.
 */
export function motivoParaElAcuerdo(
  a: Pick<CambioAcordado, "borrador" | "operaciones">,
  p: LaPropuestaEnPantalla,
): string | null {
  // E4: un acuerdo sin operaciones es de antes del 2026-08-20 (solo una instrucción): ya no tiene carril.
  if (!Array.isArray(a.operaciones)) return ACUERDO_DE_OTRA_VERSION;
  const enSuBarra = p.hayBorrador && p.conDesconocidos;
  const token = a.borrador ?? null;
  if (token === null) {
    /* E4: lo que no es un v1 ya no es `hayBorrador`, pero sigue guardado: el PUT con motivo respondería 409.
       Se resuelve en su línea («Descartarla»). */
    if (p.ilegible) return MOTIVOS_DEL_CHAT.enSuBarra;
    if (!p.hayBorrador) return null;
    if (enSuBarra) return MOTIVOS_DEL_CHAT.enSuBarra;
    if (p.tareasArmando) return MOTIVOS_DEL_CHAT.armando;
    return MOTIVOS_DEL_CHAT.hayPropuesta;
  }
  if (!p.hayBorrador || token !== p.token) return MOTIVOS_DEL_CHAT.cambio;
  if (enSuBarra) return MOTIVOS_DEL_CHAT.enSuBarra;
  if (p.tareasArmando) return MOTIVOS_DEL_CHAT.armando;
  if (claseDeAcuerdo(a) === "aplicar") {
    const acordada = (a.operaciones[0] as { version?: unknown } | undefined)?.version;
    if (typeof acordada !== "number") return MOTIVOS_DEL_CHAT.cambio;
    if (p.version !== null && p.version > acordada) return MOTIVOS_DEL_CHAT.cambio;
    if (p.bloqueada) return MOTIVOS_DEL_CHAT.recalcular;
  }
  return null;
}
