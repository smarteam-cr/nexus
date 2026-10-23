/**
 * lib/canvas/diagnostico-confirmado.ts — ¿CUÁNTO DE LO QUE LEE EL DIAGNÓSTICO LO CONFIRMÓ UNA PERSONA? PURO y client-safe.
 *
 * Pedido de Elías (2026-10-23, antes de la sesión de diagnóstico de CEMACO): el diagnóstico lee lo que Nexus propone
 * —la ficha del cliente, los resultados medibles del handoff, los procesos y lo que salió de la exploración— y mucho de
 * eso nadie lo revisó. Hay que decírselo a quien genera, para que revise las propuestas antes y el diagnóstico tenga
 * sentido; y si genera igual, avisarle que el documento sale de supuestos que no se validaron.
 *
 * Cuatro piezas, cada una con su estado:
 *   · `confirmado`    — una persona confirmó lo que hay;
 *   · `en-parte`      — hay algo confirmado y algo propuesto sin revisar;
 *   · `sin-confirmar` — solo hay lo que propuso Nexus;
 *   · `sin-datos`     — no hay nada (no cuenta para el veredicto).
 *
 * CASI NADA CONFIRMADO: de las piezas que tienen algo, menos de la mitad tienen algo confirmado (o ninguna tiene nada).
 * CEMACO el 23 oct: la ficha sin confirmar, los 5 resultados sin confirmar, los 2 procesos en borrador y la exploración
 * en parte → 1 de 4 → casi nada.
 *
 * Las reuniones no entran al veredicto: son lo que se dijo, no algo que alguien tenga que confirmar. Se informan.
 * Lo usan el panel «Antes de generar» del diagnóstico y `/analyze`, que pide confirmación (`SUPUESTOS_SIN_VALIDAR`).
 */

export type ClaveDeLoConfirmado = "ficha" | "resultados" | "procesos" | "exploracion";
export type EstadoDeLoConfirmado = "confirmado" | "en-parte" | "sin-confirmar" | "sin-datos";

export interface EntradaDeLoConfirmado {
  ficha: { confirmada: boolean; camposPropuestos: number };
  resultados: { total: number; confirmados: number };
  procesos: { total: number; validados: number };
  exploracionDelProyecto: { existe: boolean; confirmados: number; propuestos: number };
  /** Las reuniones que el diagnóstico va a leer enteras (las de la exploración más las elegidas). */
  reuniones: number;
}

export interface PiezaDeLoConfirmado {
  clave: ClaveDeLoConfirmado;
  nombre: string;
  estado: EstadoDeLoConfirmado;
  /** Una línea, en tuteo, con lo que hay y lo que falta. */
  texto: string;
  /** Dónde se revisa, para el enlace («Información del cliente»). */
  dondeSeRevisa: string;
}

export interface LoConfirmado {
  piezas: PiezaDeLoConfirmado[];
  casiNada: boolean;
  /** Cuántas de las piezas con algo tienen algo confirmado, y de cuántas («1 de 4»). */
  conAlgoConfirmado: number;
  conAlgo: number;
  reuniones: number;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function pieza(clave: ClaveDeLoConfirmado, nombre: string, dondeSeRevisa: string, estado: EstadoDeLoConfirmado, texto: string): PiezaDeLoConfirmado {
  return { clave, nombre, estado, texto, dondeSeRevisa };
}

function deLaFicha(f: EntradaDeLoConfirmado["ficha"]): PiezaDeLoConfirmado {
  const p = (e: EstadoDeLoConfirmado, t: string) => pieza("ficha", "La ficha del cliente", "Información del cliente", e, t);
  if (f.confirmada && f.camposPropuestos > 0) {
    return p("en-parte", `Está confirmada, y Nexus propone cambios en ${plural(f.camposPropuestos, "campo", "campos")} que nadie revisó.`);
  }
  if (f.confirmada) return p("confirmado", "Está confirmada.");
  if (f.camposPropuestos > 0) {
    return p("sin-confirmar", `No está confirmada: Nexus propuso ${plural(f.camposPropuestos, "campo", "campos")} y el diagnóstico los lee como supuestos.`);
  }
  return p("sin-datos", "Todavía está vacía.");
}

function deLosResultados(r: EntradaDeLoConfirmado["resultados"]): PiezaDeLoConfirmado {
  const p = (e: EstadoDeLoConfirmado, t: string) => pieza("resultados", "Los resultados medibles del handoff", "Información del cliente", e, t);
  if (r.total === 0) return p("sin-datos", "El handoff no tiene resultados medibles: los objetivos salen de lo que se conversó.");
  if (r.confirmados >= r.total) return p("confirmado", `Los ${plural(r.total, "resultado está confirmado", "resultados están confirmados")}.`);
  if (r.confirmados === 0) {
    return p(
      "sin-confirmar",
      `${r.total === 1 ? "El único resultado no está confirmado" : `Ninguno de los ${r.total} está confirmado`}: los objetivos cuantitativos van a salir «Por validar».`,
    );
  }
  return p("en-parte", `${r.confirmados} de ${r.total} están confirmados; los objetivos de los demás salen «Por validar».`);
}

function deLosProcesos(r: EntradaDeLoConfirmado["procesos"]): PiezaDeLoConfirmado {
  const p = (e: EstadoDeLoConfirmado, t: string) => pieza("procesos", "Los procesos del cliente", "Procesos", e, t);
  if (r.total === 0) return p("sin-datos", "No hay procesos mapeados.");
  if (r.validados >= r.total) return p("confirmado", `${r.total === 1 ? "El proceso está validado" : `Los ${r.total} están validados`} con el cliente.`);
  if (r.validados === 0) {
    return p("sin-confirmar", `${r.total === 1 ? "El proceso es un borrador" : `Los ${r.total} son borradores`} de la IA: el cliente no los validó.`);
  }
  return p("en-parte", `${r.validados} de ${r.total} están validados con el cliente; los demás son borradores de la IA.`);
}

function deLaExploracion(r: EntradaDeLoConfirmado["exploracionDelProyecto"]): PiezaDeLoConfirmado {
  const p = (e: EstadoDeLoConfirmado, t: string) => pieza("exploracion", "La exploración del proyecto", "Exploración", e, t);
  if (!r.existe || (r.confirmados === 0 && r.propuestos === 0)) return p("sin-datos", "Todavía no tiene nada.");
  if (r.confirmados > 0 && r.propuestos > 0) {
    return p("en-parte", `Tiene ${plural(r.confirmados, "cosa confirmada", "cosas confirmadas")} y ${plural(r.propuestos, "propuesta", "propuestas")} de Nexus sin revisar.`);
  }
  if (r.confirmados > 0) return p("confirmado", `Tiene ${plural(r.confirmados, "cosa confirmada", "cosas confirmadas")}.`);
  return p("sin-confirmar", `Solo tiene lo que propuso Nexus (${plural(r.propuestos, "propuesta", "propuestas")}): nadie lo revisó.`);
}

export function loConfirmadoDelDiagnostico(e: EntradaDeLoConfirmado): LoConfirmado {
  const piezas = [deLaFicha(e.ficha), deLosResultados(e.resultados), deLosProcesos(e.procesos), deLaExploracion(e.exploracionDelProyecto)];
  const conAlgo = piezas.filter((p) => p.estado !== "sin-datos").length;
  const conAlgoConfirmado = piezas.filter((p) => p.estado === "confirmado" || p.estado === "en-parte").length;
  return {
    piezas,
    casiNada: conAlgo === 0 || conAlgoConfirmado * 2 < conAlgo,
    conAlgoConfirmado,
    conAlgo,
    reuniones: e.reuniones,
  };
}

/** El error con que `/analyze` pide confirmación antes de generar sobre supuestos. */
export const ERROR_SUPUESTOS_SIN_VALIDAR = "SUPUESTOS_SIN_VALIDAR";

/** Lo que dice el aviso antes de generar igual (el diálogo de confirmación y el 409 de `/analyze`). */
export function mensajeDeSupuestos(r: LoConfirmado): string {
  if (r.conAlgo === 0) {
    return "Nexus todavía no tiene nada confirmado de este cliente: el diagnóstico va a salir de supuestos que nadie validó.";
  }
  const pendientes = r.piezas.filter((p) => p.estado === "sin-confirmar").map((p) => p.nombre.toLowerCase());
  const lista = pendientes.length > 1 ? `${pendientes.slice(0, -1).join(", ")} y ${pendientes[pendientes.length - 1]}` : pendientes[0] ?? "";
  return (
    `Solo ${r.conAlgoConfirmado} de ${r.conAlgo} fuentes tienen algo confirmado${lista ? ` (sin confirmar: ${lista})` : ""}. ` +
    "El diagnóstico va a salir de supuestos que nadie validó."
  );
}
