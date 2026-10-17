/**
 * lib/sessions/analisis-ajeno.ts — qué hacer con lo que dejó la lectura de una reunión (la minuta, las propuestas de
 * Tarea, los pedidos fuera de alcance y los hechos) cuando el texto del que salió ya no es el de esa reunión. PURO: lo
 * usan el enriquecimiento (vía lib/sessions/reanalizar.ts), el script de limpieza y las pruebas.
 *
 * ── POR QUÉ EXISTE (2026-10-05, adaptado a la lectura de seguimiento el 2026-10-17) ─────────────────────────────
 * «Recurrente - CAV» se enriqueció primero con las notas de «FACO Recurrente» (Honda): la lectura escribió una minuta y
 * un compromiso de Honda en Club de Amantes del Vino. 25 minutos después el documento correcto reemplazó el texto,
 * pero la lectura respondió «ya tiene minuta» y no hizo nada. En 120 días hubo 85 minutas escritas antes del último
 * cambio de texto de su reunión. Desde la etapa 2 de la memoria de la cuenta la lectura vive en una cola
 * (lib/lecturas): una lectura `lista` no se vuelve a tomar sola, así que el problema seguía igual.
 *
 * ── LA REGLA ──────────────────────────────────────────────────────────────────────────────────
 * Cuando el texto de una reunión ya leída CAMBIA (no cuando se vuelve a leer igual):
 *   · nadie tocó lo que dejó la lectura y la reunión es reciente → se REHACE: se borra lo que escribió la lectura
 *     anterior (la minuta en borrador, los pedidos de esa corrida), se retiran sus hechos pendientes y se vuelve a
 *     encolar con el texto nuevo;
 *   · alguien ya revisó la minuta, decidió una tarea propuesta, decidió un pedido o usó un hecho → NO se pisa: se
 *     AVISA a quien lo trabajó;
 *   · la reunión es vieja → nada (la lectura automática no corre sobre reuniones viejas: se rehace a mano).
 *
 * ⚠ Las propuestas de Tarea no decididas NO se borran desde acá: las escribe un solo módulo (lib/tareas, su guarda lo
 * vigila) y hoy no tiene cómo retirar las de una reunión. Se cuentan (`propuestasSinDecidir`) y vencen solas a los 14
 * días; la lectura nueva las recibe como «YA SON TAREAS» y no las repite.
 */
import { createHash } from "node:crypto";
import { DIAS_DE_FRESCURA } from "@/lib/lecturas/reglas";

/** Hasta cuándo se rehace sola la lectura de una reunión: la misma frescura que la cola (14 días). */
export const ANALISIS_AUTOMATICO_HASTA_MS = DIAS_DE_FRESCURA * 86_400_000;

/** Lo que importa de una minuta. */
export interface MinutaGuardada {
  id: string;
  status: string;
  reviewedAt: Date | null;
  reviewedByEmail: string | null;
  createdAt: Date;
}

/** Lo que importa de una tarea que salió de la reunión (Tarea con `sessionId`). */
export interface TareaGuardada {
  id: string;
  estado: string;
  /** `l:<lectura>:<línea>` cuando la propuso una lectura; otra cosa (o null) si la creó una persona o el chat. */
  origenId: string | null;
  responsableEmail: string | null;
  decididaAt: Date | null;
}

/** Lo que importa de un pedido fuera de alcance que apunta a la reunión. */
export interface PedidoGuardado {
  id: string;
  estado: string;
  decididoAt: Date | null;
  createdAt: Date;
}

/** Lo que importa de un hecho de la reunión (memoria de la cuenta, etapa 6). */
export interface HechoGuardado {
  id: string;
  /** pendiente | usado | desestimado | delegado… (lib/seguimiento). */
  estado: string;
  decididoPorEmail: string | null;
}

export interface AnalisisGuardado {
  minuta: MinutaGuardada | null;
  /** Cuándo corrió la lectura que escribió la minuta (su AgentRun); null si no se sabe. */
  corridaAt: Date | null;
  tareas: TareaGuardada[];
  pedidos: PedidoGuardado[];
  hechos: HechoGuardado[];
}

export interface PlanDeLimpieza {
  /** La minuta a borrar; null si no hay o si está revisada (esa no se borra nunca acá). */
  minutaABorrar: string | null;
  minutaRevisada: boolean;
  pedidosABorrar: string[];
  /** Los hechos pendientes: se retiran (quedan desestimados con su nota), no se borran. */
  hechosARetirar: string[];
  /** Las propuestas de la lectura que nadie decidió: no se tocan desde acá (ver el encabezado). */
  propuestasSinDecidir: TareaGuardada[];
  /** Lo que una persona ya trabajó: se queda, y se lista para que decida. */
  tareasDecididas: TareaGuardada[];
  pedidosDecididos: PedidoGuardado[];
  hechosUsados: HechoGuardado[];
}

/** ¿La tarea la propuso una lectura de la reunión? (el `origenId` de `escribirPropuestasDeLectura`). */
export function esDeLaLectura(t: Pick<TareaGuardada, "origenId">): boolean {
  return !!t.origenId && t.origenId.startsWith("l:");
}

/** ¿Una tarea de la lectura sigue sin decidir? Una propuesta que nadie usó, descartó ni dejó vencer. */
export function propuestaSinDecidir(t: TareaGuardada): boolean {
  return esDeLaLectura(t) && t.estado === "propuesta" && t.decididaAt === null;
}

/** ¿Una persona ya decidió la tarea? (la usó, la descartó, la empezó…). Lo vencido solo no cuenta como decidido. */
export function tareaDecidida(t: TareaGuardada): boolean {
  return esDeLaLectura(t) && t.decididaAt !== null && t.estado !== "vencida";
}

export function minutaRevisada(m: Pick<MinutaGuardada, "status" | "reviewedAt">): boolean {
  return m.status !== "DRAFT" || m.reviewedAt !== null;
}

/**
 * Un pedido fuera de alcance se identifica por (cliente, huella), así que una reunión posterior puede apuntarlo a sí
 * misma. Solo es de ESTA lectura si nació en la corrida (unos segundos después del AgentRun, que se crea antes que los
 * pedidos) y nadie lo decidió.
 */
export function pedidoDeLaCorrida(p: PedidoGuardado, corridaAt: Date): boolean {
  const t = p.createdAt.getTime() - corridaAt.getTime();
  return p.decididoAt === null && p.estado === "PEDIDO" && t >= -2 * 60_000 && t <= 15 * 60_000;
}

/** ¿Una persona usó el hecho? Los que siguen pendientes, los delegados y los que retiró el sistema no cuentan. */
export function hechoUsado(h: HechoGuardado): boolean {
  return h.estado === "usado" && !!h.decididoPorEmail && h.decididoPorEmail !== "sistema";
}

/** Qué se borra de lo que dejó la lectura de una reunión cuyo texto no era el suyo. Lo trabajado por una persona se queda. */
export function planDeLimpieza(a: AnalisisGuardado): PlanDeLimpieza {
  const revisada = a.minuta ? minutaRevisada(a.minuta) : false;
  const referencia = a.corridaAt ?? a.minuta?.createdAt ?? null;
  return {
    minutaABorrar: a.minuta && !revisada ? a.minuta.id : null,
    minutaRevisada: revisada,
    pedidosABorrar: referencia ? a.pedidos.filter((p) => pedidoDeLaCorrida(p, referencia)).map((p) => p.id) : [],
    hechosARetirar: a.hechos.filter((h) => h.estado === "pendiente").map((h) => h.id),
    propuestasSinDecidir: a.tareas.filter(propuestaSinDecidir),
    tareasDecididas: a.tareas.filter(tareaDecidida),
    pedidosDecididos: a.pedidos.filter((p) => p.decididoAt !== null),
    hechosUsados: a.hechos.filter(hechoUsado),
  };
}

export type DecisionTrasCambio =
  | { accion: "leer"; motivo: string }
  | { accion: "rehacer"; motivo: string }
  | { accion: "avisar"; motivo: string }
  | { accion: "nada"; motivo: string };

/** Qué hacer cuando el texto de una reunión cambió. Ver la regla en el encabezado. */
export function decidirTrasCambioDeTexto(a: AnalisisGuardado, opts: { reciente: boolean }): DecisionTrasCambio {
  const algoEscrito = !!a.minuta || a.tareas.some(esDeLaLectura) || a.pedidos.length > 0 || a.hechos.length > 0;
  if (!algoEscrito) return { accion: "leer", motivo: "la lectura no había dejado nada: se lee como siempre" };
  const plan = planDeLimpieza(a);
  const trabajado: string[] = [];
  if (plan.minutaRevisada) trabajado.push("la minuta ya estaba revisada");
  if (plan.tareasDecididas.length) trabajado.push(`alguien ya decidió ${plan.tareasDecididas.length} tarea(s) propuesta(s)`);
  if (plan.pedidosDecididos.length) trabajado.push(`alguien ya decidió ${plan.pedidosDecididos.length} pedido(s) fuera de alcance`);
  if (plan.hechosUsados.length) trabajado.push(`alguien ya usó ${plan.hechosUsados.length} hecho(s)`);
  if (trabajado.length) return { accion: "avisar", motivo: `${trabajado.join("; ")}: no se pisa` };
  if (!opts.reciente) return { accion: "nada", motivo: "reunión vieja: la lectura automática no corre; se rehace a mano" };
  return { accion: "rehacer", motivo: "nadie tocó lo que dejó la lectura: se rehace con el texto nuevo" };
}

/** La huella de un texto: md5 de sus bytes UTF-8, la misma que da `md5(transcript)` en Postgres. */
export function huellaDeTexto(texto: string): string {
  return createHash("md5").update(texto, "utf8").digest("hex");
}

/** ¿Cambió el texto? Solo si había uno guardado y el nuevo es distinto. Volver a leer lo mismo no es un cambio. */
export function textoCambio(huellaGuardada: string | null, nuevo: string | null): boolean {
  return huellaGuardada !== null && nuevo !== null && huellaGuardada !== huellaDeTexto(nuevo);
}
