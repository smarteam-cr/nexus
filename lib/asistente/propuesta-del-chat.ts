/**
 * lib/asistente/propuesta-del-chat.ts — LO QUE EL CHAT ACUERDA CON UNA PROPUESTA ABIERTA (E3 P5).
 *
 * PURO. Sin Prisma, sin red, sin React. Lo usa `correrTurno` (turno.ts) en la rama del cronograma.
 *
 * ── QUÉ RESUELVE ─────────────────────────────────────────────────────────────
 * Con una propuesta del cronograma abierta y editable, lo que el chat acuerda no toca el cronograma:
 * edita la PROPUESTA (POST /timeline/borrador/operaciones). Este archivo arma ese acuerdo:
 *   · traduce lo que nombra el modelo a la forma canónica que se registra: los números de la barra
 *     («deja el 3 como estaba») y las tareas sueltas a CLAVES; «aplícala» a la versión y la huella de
 *     la lista que se leyó en ESTE turno; el identificador corto de una tarea a su ref completa;
 *   · valida EN SECO lo pendiente antes del modelo, y lo acordado después, con la MISMA función que
 *     escribe al hacer clic (`operarSobreElBorrador`): lo que no pasa no se registra y se dice. SIN
 *     reintento (D13): la rama del cronograma nunca reintentó;
 *   · «aplicar» y «descartar la propuesta entera» van SOLAS en su acuerdo. Aplicar, además, sin nada
 *     pendiente, sin una pregunta abierta, sin bloqueo y con algo marcado;
 *   · describe las líneas en modo propuesta: el MISMO traductor para el bloque de pendientes del modelo
 *     y para la cajita del CSE.
 *
 * ── LO QUE CAE POR LA PROPUESTA ──────────────────────────────────────────────
 * Cada acuerdo guarda el token de la propuesta para la que se acordó (`borrador`). Si en el turno
 * siguiente el token es otro, lo pendiente cae con un motivo visible (`motivoDeCaidaPorToken`), y el
 * turno escribe un acuerdo de cierre que corta el libro: la caída se dice UNA vez.
 */
import type { PorQueSoloLectura, PropuestaParaElChat } from "@/lib/timeline/propuesta-para-el-chat";
import {
  fraseDelCierre,
  huellaDeTitulo,
  resumenDeLaConfirmacion,
  textoDeLaConfirmacion,
  type EstadoDelCambio,
  type ItemDelPlan,
  type ResumenDelBorrador,
} from "@/lib/timeline/borrador";
import {
  describirOperaciones,
  OPERACIONES_VALIDAS,
  type OperacionDelChat,
} from "@/lib/timeline/operaciones";
import {
  fasesDeLaPropuesta,
  MAX_OPERACIONES,
  operarSobreElBorrador,
  type OperacionSobreLaPropuesta,
} from "@/lib/timeline/operar-sobre-el-borrador";
import { esOperacionSola } from "@/lib/timeline/dependencias-de-operaciones";
import { resolverHandle } from "@/lib/timeline/handle-de-tarea";
import { fusionarPendientes } from "./acuerdo-vivo";

/** La propuesta como la tiene el turno (`ctx.propuesta`): lo leído, los identificadores que vio el
 *  modelo (ref → identificador) y el cierre fijado a mano (YYYY-MM-DD), para la confirmación. */
export type PropuestaEnElTurno = PropuestaParaElChat & {
  handles: ReadonlyMap<string, string>;
  cierreFijado?: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// ── LOS TEXTOS (tuteo: los lee el CSE y los relee el modelo en el hilo) ──────
// ─────────────────────────────────────────────────────────────────────────────

/** Por qué cae lo pendiente cuando la propuesta del turno no es aquella para la que se acordó. */
export function motivoDeCaidaPorToken(antes: string | null, ahora: string | null): string {
  if (antes === null) return "apareció una propuesta del cronograma y esto se había acordado para el cronograma de hoy";
  if (ahora === null) return "la propuesta ya se aplicó o se descartó";
  return "llegó otra propuesta del cronograma";
}

/** La línea de lo que cae entero por la propuesta (va en `descartadas`). */
export const lineaDeLoQueNoVa = (n: number, motivo: string): string =>
  `Lo acordado antes (${n === 1 ? "1 cambio" : `${n} cambios`}) ya no va: ${motivo}`;

/** El resumen del acuerdo de cierre (no lleva botón). */
export const RESUMEN_DEL_CIERRE = "Lo acordado ya no va.";

/** Lo que suma la respuesta cuando se escribe el acuerdo de cierre. */
export const avisoDeCierre = (motivo: string): string =>
  `⚠ Lo que habíamos acordado ya no va: ${motivo}. Si lo quieres, pídemelo de nuevo.`;

/** Por qué no se registra nada mientras la propuesta es de solo lectura. */
const POR_QUE_NO_SE_REGISTRA: Record<PorQueSoloLectura, string> = {
  // E4: lo que no es un v1 ya no se lee; la pantalla solo ofrece descartarlo.
  ilegible: "la propuesta guardada no se puede leer; se descarta arriba del Gantt",
  "version-nueva": "la propuesta de arriba del Gantt se resuelve en su barra",
  "vacio-armando": "la IA está armando las tareas del cronograma",
  "vacio-fallido": "hay una propuesta vacía arriba del Gantt: primero hay que sacarla con «Descartar»",
  "tareas-armando": "la IA está armando las tareas de la propuesta",
  recalculando: "la IA está recalculando tareas de la propuesta",
};

/** «⚠ Ahora no registré cambios: …». Lo acordado antes queda como estaba (congelado). */
export function avisoDeSoloLectura(porQue: PorQueSoloLectura | null): string {
  const espera = porQue === "tareas-armando" || porQue === "recalculando" || porQue === "vacio-armando";
  const que = porQue ? POR_QUE_NO_SE_REGISTRA[porQue] : "ahora no se puede cambiar la propuesta";
  return `⚠ Ahora no registré cambios: ${que}. Pídemelo cuando ${espera ? "termine" : "se resuelva"}.`;
}

/** Sin propuesta abierta, lo que era sobre ella no se registra. */
export const AVISO_SIN_PROPUESTA_ABIERTA =
  "⚠ Hoy no hay una propuesta abierta del cronograma: no registré lo que era sobre ella (dejar como estaba, recuperar, aplicarla o descartarla).";

// ── Los rechazos de la traducción (van en «⚠ No registré N de los cambios: …») ──
export const rechazoFueraDeRango = (pedido: string, ultimo: number): string =>
  ultimo > 0 ? `No hay un cambio ${pedido}: la lista llega hasta el ${ultimo}.` : `No hay un cambio ${pedido}: la propuesta no tiene cambios.`;
export const rechazoYaFuera = (quien: string): string => `${quien} ya está fuera.`;
/** Revisión de E3 (#13): con el porqué del choque (el de la barra); no todo choque es una edición a mano. */
export const rechazoChoca = (quien: string, porques: readonly string[]): string =>
  porques.length === 1
    ? `${quien} no se aplica igual. ${porques[0]}`
    : porques.length > 1
      ? `${quien} no se aplica igual: sus tareas chocan con el cronograma de hoy, cada una por lo que dice la barra.`
      : `${quien} no se aplica igual: el cronograma cambió desde la propuesta.`;
export const rechazoYaEsta = (quien: string): string => `${quien} ya está así en el cronograma.`;
export const rechazoYaMarcado = (quien: string): string => `${quien} ya está en la propuesta.`;
export const rechazoTareaNoEsta = (pedido: string): string => `No encontré «${pedido}» entre las tareas que cambian.`;
export const rechazoTareaAmbigua = (pedido: string, n: number): string =>
  `Hay ${n} tareas «${pedido}» entre las que cambian: nómbrala por su identificador.`;
export const RECHAZO_SIN_CUALES = "Falta decir qué cambio: su número en la lista o la tarea.";
/** Lo que sobra del tope de la ruta (revisión de E3, #9). */
export const avisoDelTope = (sobran: number): string =>
  `⚠ No registré ${sobran === 1 ? "1 de los cambios" : `${sobran} de los cambios`}: pasan a la propuesta de a ${MAX_OPERACIONES} por vez. ` +
  "Pídemelos después de pasar estos.";
/** Una operación que va SOLA llegó mezclada con otras. */
export const rechazoNoVaSola = (que: string): string => `⚠ No registré «${que}»: va sola, en un pedido aparte.`;

const NOMBRE_DE_LA_SOLA: Record<string, string> = {
  "propuesta.aplicar": "aplicar la propuesta",
  "propuesta.descartar-entera": "descartar la propuesta",
};

// ─────────────────────────────────────────────────────────────────────────────
// ── LA LISTA DE LA BARRA, POR NÚMERO Y POR TAREA ─────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Un renglón que se puede dejar como estaba o recuperar. */
interface Fila {
  clave: string;
  estado: EstadoDelCambio;
  /** Marcado para el CSE: aplica, o espera un recálculo que nadie desmarcó (D6). */
  marcado: boolean;
  /** Desmarcado a mano: se puede volver a marcar. */
  recuperable: boolean;
  /** Fuera porque su padre está fuera (heredado): vuelve con ese cambio. */
  padre: string | null;
  /** «El 3» o «Título», para decir por qué no. */
  quien: string;
  /** Por qué choca (el texto del plan), solo en un choque. */
  choque: string | null;
}

interface IndiceDeLaBarra {
  ultimo: number;
  porNumero: Map<number, Fila[]>;
  /** Todas las filas de tareas, con su ref (id vivo o clave `t:`) y su título. */
  tareas: Array<Fila & { ref: string; titulo: string; numero: number }>;
  numeroDeClave: Map<string, number>;
  tituloDeClave: Map<string, string>;
}

function indiceDeLaBarra(r: ResumenDelBorrador, plan: readonly ItemDelPlan[]): IndiceDeLaBarra {
  const delPlan = new Map(plan.map((it) => [it.cambio.clave, it]));
  const porNumero = new Map<number, Fila[]>();
  const numeroDeClave = new Map<string, number>();
  const tituloDeClave = new Map<string, string>();
  const tareas: IndiceDeLaBarra["tareas"] = [];
  let ultimo = 0;
  for (const it of r.items) {
    ultimo = Math.max(ultimo, it.numero);
    numeroDeClave.set(it.clave, it.numero);
    tituloDeClave.set(it.clave, it.titulo);
    const heredado = it.estado === "excluido" ? (delPlan.get(it.clave)?.dependeDe ?? null) : null;
    porNumero.set(it.numero, [
      {
        clave: it.clave,
        estado: it.estado,
        marcado: it.estado === "aplica",
        recuperable: it.estado === "excluido" && heredado === null,
        padre: heredado,
        quien: `El ${it.numero}`,
        choque: it.estado === "choque" ? (delPlan.get(it.clave)?.choque ?? null) : null,
      },
    ]);
  }
  for (const g of r.grupos) {
    ultimo = Math.max(ultimo, g.numero);
    const filas: Fila[] = [];
    for (const t of g.tareas) {
      numeroDeClave.set(t.clave, g.numero);
      tituloDeClave.set(t.clave, t.titulo);
      const heredado = t.estado === "excluido" && !t.seMarca ? (delPlan.get(t.clave)?.dependeDe ?? null) : null;
      const fila: Fila = {
        clave: t.clave,
        estado: t.estado,
        marcado: t.estado === "aplica" || !!t.enEspera,
        recuperable: t.estado === "excluido" && !t.enEspera && t.seMarca,
        padre: heredado,
        quien: `El ${g.numero}`,
        choque: t.estado === "choque" ? (delPlan.get(t.clave)?.choque ?? null) : null,
      };
      filas.push(fila);
      tareas.push({ ...fila, quien: `«${t.titulo}»`, ref: t.ref, titulo: t.titulo, numero: g.numero });
    }
    porNumero.set(g.numero, filas);
  }
  return { ultimo, porNumero, tareas, numeroDeClave, tituloDeClave };
}

/** Las claves que toma «dejar como estaba» o «recuperar» de unas filas, o el porqué de que no tome ninguna. */
function clavesDe(filas: readonly Fila[], dejar: boolean, quien: string): string[] | { motivo: string } {
  const claves = dejar
    ? filas.filter((f) => f.marcado).map((f) => f.clave)
    : [
        ...filas.filter((f) => f.recuperable).map((f) => f.clave),
        // Un heredado vuelve con su padre: van los dos (la línea dice «con el cambio N»).
        ...filas.filter((f) => f.padre !== null).flatMap((f) => [f.padre!, f.clave]),
      ];
  if (claves.length > 0) return [...new Set(claves)];
  if (dejar && filas.some((f) => f.recuperable || f.padre !== null)) return { motivo: rechazoYaFuera(quien) };
  if (!dejar && filas.some((f) => f.marcado)) return { motivo: rechazoYaMarcado(quien) };
  const choques = filas.filter((f) => f.estado === "choque");
  if (choques.length > 0) {
    const porques = [...new Set(choques.map((f) => f.choque).filter((c): c is string => !!c))];
    return { motivo: rechazoChoca(quien, porques) };
  }
  return { motivo: rechazoYaEsta(quien) };
}

/** «3», «#3» o «3.» → 3. Cualquier otra cosa (P3 incluido: no es un número de la barra), null. */
function numeroDeLaBarra(raw: unknown): number | null {
  const m = /^\s*#?\s*(\d+)\s*\.?\s*$/.exec(String(raw ?? ""));
  return m ? Number(m[1]) : null;
}

/** Una tarea suelta: por su identificador (o su ref completa), si no por su título exacto, si es único. */
function filasDeLaTarea(
  pedido: string,
  idx: IndiceDeLaBarra,
): Array<IndiceDeLaBarra["tareas"][number]> | { motivo: string } {
  const refs = [...new Set(idx.tareas.map((t) => t.ref))];
  const r = resolverHandle(pedido, refs);
  if (r.tipo === "una") return idx.tareas.filter((t) => t.ref === r.id);
  if (r.tipo === "ambigua") return { motivo: rechazoTareaAmbigua(pedido, r.cuantas) };
  const h = huellaDeTitulo(pedido);
  const porTitulo = idx.tareas.filter((t) => huellaDeTitulo(t.titulo) === h);
  const distintas = new Set(porTitulo.map((t) => t.ref));
  if (distintas.size === 1) return porTitulo;
  if (distintas.size > 1) return { motivo: rechazoTareaAmbigua(pedido, distintas.size) };
  return { motivo: rechazoTareaNoEsta(pedido) };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LA TRADUCCIÓN: lo que emite el modelo → la forma que se registra ─────────
// ─────────────────────────────────────────────────────────────────────────────

export interface Traduccion {
  /** En el orden del modelo, con su índice de origen. */
  canonicas: Array<{ indice: number; op: OperacionDelChat }>;
  /** Lo que no se pudo traducir (un número o una tarea que no están, algo que ya está así…). Un mismo
   *  índice puede venir más de una vez: «deja el 3 y el 12» registra el 3 y dice por qué no el 12. */
  rechazadas: Array<{ indice: number; motivo: string }>;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const textos = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string | number => typeof x === "string" || typeof x === "number").map(String) : [];

/**
 * ⭐ Traduce contra la propuesta DE ESTE TURNO (la que leyó el modelo): los números de la barra, el plan
 * (estado y padre por clave) y los identificadores de las tareas.
 */
export function traducirOperaciones(ops: readonly unknown[], p: PropuestaEnElTurno): Traduccion {
  const canonicas: Traduccion["canonicas"] = [];
  const rechazadas: Traduccion["rechazadas"] = [];
  const idx = p.resumen ? indiceDeLaBarra(p.resumen, p.plan?.items ?? []) : null;
  const refsDeTareas = [
    ...new Set([
      ...p.vivo.fases.flatMap((f) => (f.tareas ?? []).map((t) => t.id)),
      ...(p.resumen?.proyeccion.fases.flatMap((f) => f.tareas.map((t) => t.clave)) ?? []),
      ...(p.resumen?.grupos.flatMap((g) => g.tareas.map((t) => t.ref)) ?? []),
    ]),
  ];

  ops.forEach((raw, indice) => {
    const op = esObjeto(raw) && typeof raw.op === "string" ? raw.op : null;
    if (!op || !esObjeto(raw)) {
      rechazadas.push({ indice, motivo: `«${String(esObjeto(raw) ? raw.op : raw)}» no es una operación válida` });
      return;
    }
    if (op === "propuesta.dejar-como-estaba" || op === "propuesta.recuperar") {
      const dejar = op === "propuesta.dejar-como-estaba";
      const claves: string[] = [];
      const noVan: string[] = [];
      const numeros = textos(raw.cambios);
      const tareas = textos(raw.tareas);
      if (numeros.length === 0 && tareas.length === 0) noVan.push(RECHAZO_SIN_CUALES);
      for (const n of numeros) {
        const numero = numeroDeLaBarra(n);
        const filas = numero === null ? undefined : idx?.porNumero.get(numero);
        if (!filas) {
          noVan.push(rechazoFueraDeRango(n.trim(), idx?.ultimo ?? 0));
          continue;
        }
        const r = clavesDe(filas, dejar, `El ${numero}`);
        if ("motivo" in r) noVan.push(r.motivo);
        else claves.push(...r);
      }
      for (const t of tareas) {
        const filas = idx ? filasDeLaTarea(t, idx) : { motivo: rechazoTareaNoEsta(t) };
        if ("motivo" in filas) {
          noVan.push(filas.motivo);
          continue;
        }
        const r = clavesDe(filas, dejar, filas[0].quien);
        if ("motivo" in r) noVan.push(r.motivo);
        else claves.push(...r);
      }
      for (const motivo of noVan) rechazadas.push({ indice, motivo });
      if (claves.length > 0) canonicas.push({ indice, op: { op, claves: [...new Set(claves)] } });
      return;
    }
    if (op === "propuesta.aplicar") {
      // La lista que se leyó en ESTE turno: su versión y su huella (la de la barra, sin nada forzado).
      canonicas.push({ indice, op: { op, version: p.version ?? 0, huella: p.resumen?.huella ?? "" } });
      return;
    }
    if (op === "propuesta.descartar-entera") {
      canonicas.push({ indice, op: { op } });
      return;
    }
    if (!(OPERACIONES_VALIDAS as readonly string[]).includes(op)) {
      rechazadas.push({ indice, motivo: `«${op}» no es una operación válida` });
      return;
    }
    // El vocabulario de siempre: sin los campos de la propuesta, y la tarea por su ref COMPLETA (con la
    // propuesta de ahora; si entre el turno y el clic aparece otra que termina igual, no se confunden).
    const { cambios: _c, tareas: _t, claves: _k, ...limpia } = raw;
    void _c;
    void _t;
    void _k;
    if (typeof limpia.taskId === "string") {
      const r = resolverHandle(limpia.taskId, refsDeTareas);
      if (r.tipo === "una") limpia.taskId = r.id;
    }
    canonicas.push({ indice, op: limpia as unknown as OperacionDelChat });
  });
  return { canonicas, rechazadas };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LAS LÍNEAS: el mismo traductor para el modelo y para el CSE ──────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que dice la confirmación de aplicar (la de la barra): lo marcado, el cierre y, si algo se borra
 *  o faltan tareas, qué se toca y qué no. La línea del chat ES esa confirmación (D10). */
export function confirmacionDeLaPropuesta(r: ResumenDelBorrador, cierreFijado: string | null): string {
  const partes = [resumenDeLaConfirmacion(r), fraseDelCierre(r, cierreFijado)];
  if (r.borraAlgo || r.faltanTareas) partes.push(textoDeLaConfirmacion(r));
  return partes.filter(Boolean).join(" ");
}

/** El traductor de las líneas en modo propuesta: `actuales` es la propuesta como se ve (sus ids son los
 *  de la barra) y cada clave se nombra con su número de la barra. */
export function describirSobreLaPropuesta(p: PropuestaEnElTurno): (ops: readonly OperacionDelChat[]) => string[] {
  const r = p.resumen;
  if (!r) return (ops) => describirOperaciones([], ops);
  const idx = indiceDeLaBarra(r, p.plan?.items ?? []);
  const delPlan = new Map((p.plan?.items ?? []).map((it) => [it.cambio.clave, it]));
  const actuales = fasesDeLaPropuesta(r.proyeccion);
  const confirmacion = confirmacionDeLaPropuesta(r, p.cierreFijado ?? null);
  const tituloDeClave = (clave: string) => {
    const numero = idx.numeroDeClave.get(clave);
    if (numero === undefined) return null;
    const padre = delPlan.get(clave)?.dependeDe;
    const conElCambio = padre ? idx.numeroDeClave.get(padre) : undefined;
    return {
      numero,
      titulo: idx.tituloDeClave.get(clave) ?? clave,
      ...(conElCambio !== undefined ? { conElCambio } : {}),
    };
  };
  return (ops) =>
    ops.length === 0 ? [] : describirOperaciones(actuales, ops, { propuesta: { vivo: p.vivo, tituloDeClave, confirmacion } });
}

// ─────────────────────────────────────────────────────────────────────────────
// ── EL LIBRO (antes del modelo) Y EL ACUERDO (después) ───────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que cae de lo pendiente y por qué (el motivo, para la línea «— …» y para el aviso del cierre). */
export interface Caida {
  operacion: unknown;
  motivo: string;
}

/** Por qué no se registra «aplicar la propuesta», o null si se puede. */
function porQueNoAplicar(p: PropuestaEnElTurno, pendientes: number, preguntaAbierta: boolean): string | null {
  if (pendientes > 0) return "primero hay que pasar a la propuesta lo que quedó pendiente.";
  if (preguntaAbierta) return "hay una pregunta sin contestar.";
  if (p.resumen?.bloqueo) return p.resumen.bloqueo;
  if ((p.resumen?.marcadas ?? 0) === 0) return "no queda nada marcado en la propuesta.";
  return null;
}

/** «aplicar» que quedó pendiente de un turno anterior: vale mientras la lista sea la misma que se leyó. */
const MOTIVO_APLICAR_VIEJO = "la propuesta cambió desde que se acordó";

/** Un «descartar la propuesta» pendiente, cuando ahora se pide «aplícala» (un «aplicar» de otra lista ya
 *  cayó al revalidar lo pendiente, con `MOTIVO_APLICAR_VIEJO`). */
const MOTIVO_OTRA_SOLA = "ahora pediste aplicar la propuesta";

/**
 * ⭐ Lo pendiente, revalidado EN SECO contra la propuesta de ahora (antes del modelo): lo que ya no pasa
 * cae, con su motivo. `operarSobreElBorrador` corre el lote en orden y vuelve atrás cada operación que
 * rechaza, así que UNA pasada dice exactamente cuáles no pasan (las demás no dependían de ellas).
 */
export function libroSobreLaPropuesta(
  p: PropuestaEnElTurno,
  pendientes: readonly unknown[],
): { vivas: OperacionDelChat[]; caidas: Caida[] } {
  const fuera = new Map<unknown, string>();
  const aOperar: OperacionDelChat[] = [];
  for (const o of pendientes) {
    if (!esObjeto(o) || typeof o.op !== "string") {
      fuera.set(o, "no se entiende qué era");
      continue;
    }
    if (o.op === "propuesta.aplicar") {
      const r = p.resumen;
      const vale =
        !!r && o.version === (p.version ?? 0) && o.huella === r.huella && !r.bloqueo && r.marcadas > 0;
      if (!vale) fuera.set(o, MOTIVO_APLICAR_VIEJO);
      continue;
    }
    if (!esOperacionSola(o)) aOperar.push(o as unknown as OperacionDelChat);
  }
  if (aOperar.length > 0 && p.borrador) {
    const r = operarSobreElBorrador({
      vivo: p.vivo,
      borrador: p.borrador,
      excluidos: p.excluidos,
      operaciones: aOperar as OperacionSobreLaPropuesta[],
    });
    for (const x of r.rechazadas) fuera.set(aOperar[x.indice], x.motivo);
  }
  // En el orden de lo pendiente: lo que cae se nombra como se leyó.
  const vivas: OperacionDelChat[] = [];
  const caidas: Caida[] = [];
  for (const o of pendientes) {
    const motivo = fuera.get(o);
    if (motivo) caidas.push({ operacion: o, motivo });
    else vivas.push(o as OperacionDelChat);
  }
  return { vivas, caidas };
}

export interface AcuerdoSobreLaPropuesta {
  /** Lo que se registra (vacío = no hay acuerdo nuevo). */
  operaciones: OperacionDelChat[];
  /** Los índices (dentro de `operaciones`) que vienen de turnos anteriores. */
  arrastradas: number[];
  /** Lo pendiente que cae por lo que se pidió en este turno (no a pedido del modelo): se dice. */
  caidas: Array<{ operacion: OperacionDelChat; motivo: string }>;
  /** Lo que se suma a la respuesta: lo que no se registró, y por qué. */
  avisos: string[];
}

/**
 * ⭐ El acuerdo del turno con la propuesta abierta (después del modelo). Los pasos:
 *   1. traducir lo que emitió el modelo a la forma canónica (números y tareas → claves; aplicar → la
 *      versión y la huella de este turno);
 *   2. «aplicar» y «descartar la propuesta entera», solas: aplicar además sin nada pendiente (después
 *      del `descartar` del modelo), sin pregunta abierta, sin bloqueo y con algo marcado. Descartar
 *      la propuesta entera suelta lo pendiente;
 *   3. fusionar lo pendiente con lo nuevo (el descarte se pide con la P: «3» es un número de la barra);
 *   4. validar EN SECO la fusión: lo que no pasa sale y se dice. Sin reintento;
 *   5. el tope de la ruta (`MAX_OPERACIONES`): lo que pasa de ahí no se registra y se dice.
 */
export function acuerdoSobreLaPropuesta(i: {
  propuesta: PropuestaEnElTurno;
  vivas: readonly OperacionDelChat[];
  /** Lo que se registra de lo que emitió el modelo (sin las notas que no leyó: `notasDelLote`). */
  opsNuevas: readonly unknown[];
  /** Revisión de E4 (#6): cuántas operaciones EMITIÓ el modelo, antes de cualquier filtro. «Aplicar» y
   *  «descartar la propuesta» van solas contra ESTE número: una nota que no se registró no las deja solas. */
  emitidas: number;
  descartar: readonly unknown[];
  preguntaAbierta: boolean;
}): AcuerdoSobreLaPropuesta {
  const p = i.propuesta;
  const { canonicas, rechazadas } = traducirOperaciones(i.opsNuevas, p);
  const avisos: string[] = [];
  const noRegistradas: string[] = rechazadas.map((r) => r.motivo);
  const decir = () => {
    if (noRegistradas.length === 0) return;
    const motivos = [...new Set(noRegistradas.map((m) => m.replace(/\.\s*$/, "")))].join(" · ");
    avisos.push(
      `⚠ No registré ${noRegistradas.length === 1 ? "1 de los cambios" : `${noRegistradas.length} de los cambios`}: ${motivos}. ` +
        "Pídemelo de otra forma si lo quieres igual.",
    );
  };

  // Lo pendiente que sigue en pie después del `descartar` del modelo.
  const enPie = fusionarPendientes(i.vivas, [], i.descartar, { exigirP: true }).operaciones;

  // ── 2 · Aplicar y descartar la propuesta entera: solas ──
  const solas = canonicas.filter((c) => esOperacionSola(c.op));
  const otras = canonicas.filter((c) => !esOperacionSola(c.op)).map((c) => c.op);
  if (solas.length > 0) {
    // Mezclada con cualquier otra cosa que emitió el modelo (aunque esa otra no se haya podido traducir, o
    // no se registre porque era una nota que no leyó entera: revisión de E4, #6).
    if (solas.length > 1 || Math.max(i.emitidas, i.opsNuevas.length) > 1) {
      for (const s of solas) avisos.push(rechazoNoVaSola(NOMBRE_DE_LA_SOLA[s.op.op] ?? s.op.op));
    } else {
      const sola = solas[0].op;
      if (sola.op === "propuesta.aplicar") {
        /* Revisión de E3 (#13): otra sola que quedó pendiente (un «aplicar» o «descartar la propuesta») no es
           algo por pasar a la propuesta: la reemplaza este pedido. Si es el mismo «aplicar», sigue (arrastrado);
           si no, cae con su motivo. Antes se decía «primero pasa lo pendiente» y volvía el botón de descartar. */
        const porPasar = enPie.filter((o) => !esOperacionSola(o));
        const porQue = porQueNoAplicar(p, porPasar.length, i.preguntaAbierta);
        if (!porQue) {
          decir();
          const mismo = (o: OperacionDelChat) => JSON.stringify(o) === JSON.stringify(sola);
          return {
            operaciones: [sola],
            arrastradas: enPie.some(mismo) ? [0] : [],
            caidas: enPie
              .filter((o) => esOperacionSola(o) && !mismo(o))
              .map((o) => ({ operacion: o, motivo: MOTIVO_OTRA_SOLA })),
            avisos,
          };
        }
        avisos.push(`⚠ No registré «aplicar la propuesta»: ${porQue}`);
      } else {
        // Descartar la propuesta entera: lo pendiente cae con ella (se dice cuál).
        decir();
        return {
          operaciones: [sola],
          arrastradas: [],
          caidas: enPie.map((o) => ({ operacion: o, motivo: "se descarta la propuesta entera" })),
          avisos,
        };
      }
    }
  }

  // ── 3 · Lo pendiente + lo nuevo ──
  const fusion = fusionarPendientes(i.vivas, otras, i.descartar, { exigirP: true });
  let ops = fusion.operaciones.map((op, k) => ({ op, arrastrada: k < fusion.arrastradas.length }));
  const caidas: AcuerdoSobreLaPropuesta["caidas"] = [];
  // Un «aplicar» o «descartar» pendiente no se mezcla con lo que se pidió después: cae.
  if (ops.length > 1 && ops.some((x) => esOperacionSola(x.op))) {
    for (const x of ops) {
      if (esOperacionSola(x.op)) caidas.push({ operacion: x.op, motivo: "lo que pediste después cambia la propuesta" });
    }
    ops = ops.filter((x) => !esOperacionSola(x.op));
  }

  // ── 4 · En seco, con la misma función que escribe al hacer clic ──
  const aOperar = ops.filter((x) => !esOperacionSola(x.op));
  if (aOperar.length > 0 && p.borrador) {
    const r = operarSobreElBorrador({
      vivo: p.vivo,
      borrador: p.borrador,
      excluidos: p.excluidos,
      operaciones: aOperar.map((x) => x.op) as OperacionSobreLaPropuesta[],
    });
    const fuera = new Set(r.rechazadas.map((x) => aOperar[x.indice]));
    for (const x of r.rechazadas) noRegistradas.push(x.motivo);
    ops = ops.filter((x) => !fuera.has(x));
  }
  decir();
  // ── 5 · El tope del pedido (revisión de E3, #9): la ruta recibe hasta MAX_OPERACIONES por vez, y un acuerdo
  // más largo fallaría al apretar el botón, una y otra vez. Se registran las primeras (lo pendiente va
  // primero) y lo que sobra se dice. Cortar la cola no invalida lo anterior: el lote corre en orden.
  if (ops.length > MAX_OPERACIONES) {
    avisos.push(avisoDelTope(ops.length - MAX_OPERACIONES));
    ops = ops.slice(0, MAX_OPERACIONES);
  }
  return {
    operaciones: ops.map((x) => x.op),
    arrastradas: ops.flatMap((x, k) => (x.arrastrada ? [k] : [])),
    caidas,
    avisos,
  };
}
