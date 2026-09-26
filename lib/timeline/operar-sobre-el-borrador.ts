/**
 * lib/timeline/operar-sobre-el-borrador.ts — LO QUE PIDE EL CHAT, ESCRITO EN LA PROPUESTA (E3 P2).
 *
 * PURO. Sin Prisma, sin red, sin React. Lo usa la ruta que edita la propuesta (POST
 * /timeline/borrador/operaciones) y, en seco, el chat al acordar: la MISMA función valida lo que se
 * acuerda y escribe lo que se aprueba.
 *
 * ── QUÉ HACE ─────────────────────────────────────────────────────────────────
 * Con una propuesta abierta, lo que acuerda el chat no toca el cronograma: edita la propuesta. Cada
 * operación del vocabulario de siempre (`fase.*`, `tarea.*`, `arranque`) se traduce a cambios del
 * borrador POR CLAVE, sobre la propuesta como se ve (`proyectar` con lo desmarcado), y las casillas
 * (`propuesta.dejar-como-estaba` / `propuesta.recuperar`) son lo desmarcado (`excluidos`).
 *
 * ── LOS `desde` NO SE RECALCULAN (D8) ────────────────────────────────────────
 * Lo que crea el chat toma su `desde` de lo vivo (lo de ahora). Cuando el chat escribe el campo F de un
 * cambio que ya existe:
 *   · `a[F] = v`, y si lo vivo de F ya no es su `desde` (el cambio chocaba o ya estaba), se re-ancla
 *     SOLO ese campo;
 *   · en una tarea que cambia, otro campo G del cambio que alguien editó a mano después sale del
 *     cambio: gana la edición a mano, y se avisa;
 *   · si `v` es lo vivo, el cambio sobra: se quita si es del chat, se deja fuera si es de la IA;
 *   · toda edición lo vuelve a marcar y lo deja como del chat (`porChat`).
 * Así aplicar nunca pisa una edición a mano que el chat no nombró.
 *
 * ── LA FORMA DE UNA FASE ARMADA (D9) ─────────────────────────────────────────
 * Si el chat cambia el nombre o las semanas de una fase cuyas tareas armó la IA, la forma nueva va en
 * `ajustadasPorElChat` (sin pisar `tareasArmadasPara`): sus tareas se acomodan sin recalcularse, y
 * desmarcar el cambio del chat vuelve a la forma armada.
 *
 * ── TODO O NADA ──────────────────────────────────────────────────────────────
 * Las operaciones corren en orden, cada una sobre el resultado de la anterior. Con una sola rechazada
 * no se registra nada: se devuelve lo de entrada, con todos los motivos (se siguen evaluando las demás
 * para decirlos juntos).
 */
import {
  CAMPOS_DE_TAREA,
  claveAleatoria,
  claveDeCampo,
  claveDeFaseNueva,
  claveDeFaseQueSeVa,
  claveDeTareaNueva,
  claveDeTareaQueCambia,
  claveDeTareaQueSeVa,
  esCambioDeTarea,
  fotoDeTarea,
  huellaDeTitulo,
  jsonCanonico,
  mismaForma,
  normalizarExcluidos,
  ordenConCambio,
  planDeAplicacion,
  proyectarConPlan,
  type Borrador,
  type Cambio,
  type CambioDeAncla,
  type CambioDeOrden,
  type CambioFaseCambia,
  type CambioFaseNueva,
  type CambioFaseSeVa,
  type CambioTareaCambia,
  type CambioTareaNueva,
  type CambioTareaSeVa,
  type CampoDeFase,
  type CampoDeTarea,
  type ContenidoDeTareaNueva,
  type FaseNuevaPropuesta,
  type FaseProyectada,
  type FaseViva,
  type FormaDeFase,
  type ItemDelPlan,
  type OperacionDeCasillas,
  type Party,
  type PlanDeAplicacion,
  type Proyeccion,
  type TareaDelVivo,
  type TipoDeTarea,
  type ValorDeCampo,
  type Vivo,
} from "./borrador";
import { resolverHandle } from "./handle-de-tarea";
import {
  aplicarOperaciones,
  DUENIOS_VALIDOS,
  esOperacionDePropuesta,
  motivoDeTareaAmbigua,
  motivoDeTareaProtegida,
  notaDeLaOperacion,
  OPERACIONES_VALIDAS,
  TIPOS_DE_ACTIVIDAD_VALIDOS,
  TIPOS_DE_TAREA_VALIDOS,
  type FaseActual,
  type Operacion,
} from "./operaciones";
import { esOperacionSola } from "./dependencias-de-operaciones";
import { fugaTrasEditar, isKept } from "./regen-columnas";

/** Lo que se puede pedir sobre la propuesta: el vocabulario de siempre y las casillas, ya con sus claves. */
export type OperacionSobreLaPropuesta =
  | Operacion
  | { op: "propuesta.dejar-como-estaba"; claves: string[] }
  | { op: "propuesta.recuperar"; claves: string[] };

// ─────────────────────────────────────────────────────────────────────────────
// ── EL PEDIDO DE LA RUTA (POST /timeline/borrador/operaciones), validado ─────
// ─────────────────────────────────────────────────────────────────────────────

/** Quién escribe: la barra (las casillas), el chat (lo acordado) o la apertura sola del chat. */
export type PedidoDeOperaciones =
  | { token: string; version: number; origen: "casillas"; operaciones: OperacionDeCasillas[] }
  | { token: string; version: number; origen: "chat"; operaciones: OperacionSobreLaPropuesta[] }
  | { token: string; version: number; origen: "apertura"; operaciones: Array<{ op: "chat-abierto" }> };

/** Cuántas operaciones acepta un pedido. El chat no acuerda más que esto (propuesta-del-chat.ts). */
export const MAX_OPERACIONES = 50;
const esClaves = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length >= 1 && v.length <= 2000 && v.every((k) => typeof k === "string" && k.length >= 1 && k.length <= 300);
const esObjetoPlano = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * El cuerpo de la ruta, validado (puro). `version` es informativa: la escritura se condiciona a la que se
 * lee. Aplicar y descartar la propuesta entera NO van por acá (tienen sus rutas): 400.
 */
export function leerPedidoDeOperaciones(raw: unknown): PedidoDeOperaciones | { error: string } {
  if (!esObjetoPlano(raw)) return { error: "El cuerpo tiene que ser un objeto." };
  const { token, version, origen, operaciones } = raw;
  if (typeof token !== "string" || token.length < 1 || token.length > 200) return { error: "Falta el token de la propuesta." };
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) return { error: "Falta la versión de la propuesta." };
  if (!Array.isArray(operaciones) || operaciones.length < 1 || operaciones.length > MAX_OPERACIONES) {
    return { error: `Van de 1 a ${MAX_OPERACIONES} operaciones.` };
  }
  if (!operaciones.every(esObjetoPlano)) return { error: "Cada operación tiene que ser un objeto." };
  switch (origen) {
    case "casillas": {
      if (!operaciones.every((o) => (o.op === "excluir" || o.op === "incluir") && esClaves(o.claves))) {
        return { error: "Las casillas son «excluir» o «incluir» con sus claves." };
      }
      return {
        token,
        version,
        origen,
        operaciones: operaciones.map((o) => ({ op: o.op as OperacionDeCasillas["op"], claves: [...(o.claves as string[])] })),
      };
    }
    case "chat": {
      const out: OperacionSobreLaPropuesta[] = [];
      for (const o of operaciones) {
        if (esOperacionSola(o)) return { error: "Aplicar o descartar la propuesta entera no va por acá." };
        if (o.op === "propuesta.dejar-como-estaba" || o.op === "propuesta.recuperar") {
          if (!esClaves(o.claves)) return { error: "«Dejar como estaba» y «recuperar» van con sus claves." };
          out.push({ op: o.op, claves: [...o.claves] });
          continue;
        }
        if (esOperacionDePropuesta(o) || typeof o.op !== "string" || !(OPERACIONES_VALIDAS as readonly string[]).includes(o.op)) {
          return { error: `«${String(o.op)}» no es una operación válida.` };
        }
        out.push(o as unknown as Operacion);
      }
      return { token, version, origen, operaciones: out };
    }
    case "apertura":
      if (!operaciones.every((o) => o.op === "chat-abierto")) return { error: "La apertura es «chat-abierto»." };
      return { token, version, origen, operaciones: operaciones.map(() => ({ op: "chat-abierto" as const })) };
    default:
      return { error: "`origen` tiene que ser «casillas», «chat» o «apertura»." };
  }
}

export interface ResultadoSobreLaPropuesta {
  /** El borrador editado, con la MISMA versión (la sube quien lo escribe). Con un rechazo, el de entrada. */
  borrador: Borrador;
  /** Lo desmarcado después de las operaciones (limpio: `normalizarExcluidos`). */
  excluidos: string[];
  /** Las operaciones que no se pueden registrar y por qué (tuteo, en minúscula: van después de «…: »). */
  rechazadas: Array<{ indice: number; motivo: string }>;
  /** Lo que pasó además de lo pedido (lo editado a mano que se respetó, lo que salió con una fase). */
  avisos: string[];
  /** ¿Cambió algo? Sin cambio, no se escribe nada. */
  cambio: boolean;
}

// ── Los rechazos (van en «⚠ No registré N de los cambios: …») ─────────────────
export const RECHAZO_FASE_NO_ESTA = "esa fase no está en la propuesta";
export const RECHAZO_FASE_SE_QUITA = "esa fase se quita en la propuesta: primero déjala como estaba";
export const RECHAZO_FASE_NUEVA_FUERA = "esa fase nueva está fuera de la propuesta: recupérala primero";
export const RECHAZO_TAREA_SE_QUITA = "la propuesta ya quita esa tarea: primero déjala como estaba";
export const RECHAZO_TAREA_NUEVA_FUERA = "esa tarea nueva está fuera de la propuesta: recupérala primero";
export const RECHAZO_TAREA_NO_ESTA = "esa tarea no está en la propuesta";
export const RECHAZO_TAREA_REPETIDA = "ya hay una tarea igual en esa semana";
export const RECHAZO_LUGAR = "no pude ubicar la fase en ese lugar";
export const RECHAZO_CLAVE_NO_ESTA = "ese cambio ya no está en la propuesta";
export const rechazoNombreRepetido = (nombre: string): string => `ya hay una fase «${nombre}» en la propuesta`;

/** Cómo se nombra cada campo en el aviso de lo que se respetó. */
const NOMBRE_DEL_CAMPO: Record<CampoDeTarea | "fase", string> = {
  title: "título",
  weekIndex: "semana",
  party: "dueño",
  type: "tipo",
  fase: "fase",
};
const avisoEditadaAMano = (titulo: string, campo: CampoDeTarea | "fase") =>
  `Dejé lo que editaste a mano en «${NOMBRE_DEL_CAMPO[campo]}» de «${titulo}».`;

/** Una fase de la propuesta como la ve el ejecutor de operaciones: ids = los de la barra (vivo o `n:…`,
 *  y el de la tarea viva o `t:…`). La usan las semanas (se reusa `aplicarOperaciones`) y el chat. */
export function faseActualDeLaPropuesta(f: FaseProyectada): FaseActual {
  return {
    id: f.clave,
    name: f.name,
    durationWeeks: f.durationWeeks,
    startWeek: f.startWeek,
    sessionCount: f.sessionCount,
    notes: f.notes,
    activityType: f.activityType,
    tasks: f.tareas.map((t, k) => ({
      id: t.clave,
      title: t.title,
      weekIndex: t.weekIndex,
      order: k,
      notes: t.notes,
      party: t.party,
      type: t.type,
      status: t.status,
      source: t.source,
    })),
  };
}

/** La propuesta entera como `FaseActual[]` (para `describirOperaciones` en modo propuesta). */
export const fasesDeLaPropuesta = (p: Proyeccion): FaseActual[] => p.fases.map(faseActualDeLaPropuesta);

type FaseResuelta = { tipo: "viva"; id: string; viva: FaseViva } | { tipo: "nueva"; clave: string; cambio: CambioFaseNueva };
type TareaResuelta = { tipo: "viva"; tarea: TareaDelVivo; faseId: string } | { tipo: "nueva"; cambio: CambioTareaNueva };
/** Lo que el chat escribe de una tarea viva: sus campos y, al mudarla, la fase (id vivo o `n:…`). */
type EdicionDeTarea = Partial<{ title: string; weekIndex: number; party: Party | null; type: TipoDeTarea | null; fase: string }>;

/** Lo que se mira antes de cada operación: el plan y la propuesta como se ve, del estado corriente. */
interface Mirada {
  plan: PlanDeAplicacion;
  proy: Proyeccion;
  items: Map<string, ItemDelPlan>;
  /** Las fases vivas que se quitan (su `fase-se-va` marcado). */
  fasesQueSeVan: Set<string>;
  /** Las tareas vivas que se borran con su fase. */
  conSuFase: Set<string>;
}

const entero = (v: unknown): number | null => {
  const n = typeof v === "number" ? Math.floor(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const textoDe = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const acotar = (semana: number, duracion: number) => Math.min(Math.max(semana, 0), Math.max(duracion - 1, 0));
const normalizarNombre = (s: string) => s.trim().toLowerCase();
const mismaLista = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, k) => x === b[k]);
const valorDeFase = (f: FaseViva, campo: CampoDeFase): ValorDeCampo => {
  const v = f[campo];
  return v === undefined ? null : v;
};
const valorDeTarea = (t: TareaDelVivo, campo: CampoDeTarea): string | number | null =>
  campo === "title" ? t.title : campo === "weekIndex" ? t.weekIndex : campo === "party" ? (t.party ?? null) : (t.type ?? null);
/**
 * `pedido` (las fases vivas que se ven, en el orden pedido) con las vivas que no se ven (se van enteras),
 * cada una detrás de la que tiene delante en `deHoy`, o al principio si no tiene ninguna.
 */
function conLasQueNoSeVen(pedido: readonly string[], deHoy: readonly string[]): string[] {
  const out = [...pedido];
  deHoy.forEach((id, j) => {
    if (out.includes(id)) return;
    let k = j - 1;
    while (k >= 0 && !out.includes(deHoy[k])) k--;
    out.splice(k < 0 ? 0 : out.indexOf(deHoy[k]) + 1, 0, id);
  });
  return out;
}

/**
 * ⭐ Edita la propuesta con lo que acordó el chat. `vivo`: el cronograma de ahora, CON tareas y el estado
 * de cada fase; `borrador`: el guardado, sin cambios desconocidos; `excluidos`: lo desmarcado guardado.
 * `nuevaClave`: el generador de las claves nuevas (los tests inyectan uno determinista).
 */
export function operarSobreElBorrador(i: {
  vivo: Vivo;
  borrador: Borrador;
  excluidos: readonly string[];
  operaciones: readonly OperacionSobreLaPropuesta[];
  nuevaClave?: () => string;
}): ResultadoSobreLaPropuesta {
  const nuevaClave = i.nuevaClave ?? claveAleatoria;
  const { vivo } = i;
  const fasePorId = new Map(vivo.fases.map((f) => [f.id, f]));
  const tareaPorId = new Map<string, { tarea: TareaDelVivo; faseId: string }>();
  for (const f of vivo.fases) for (const t of f.tareas ?? []) tareaPorId.set(t.id, { tarea: t, faseId: f.id });

  // ── El estado de trabajo. Los cambios son inmutables: se REEMPLAZAN, nunca se editan en el lugar. ──
  const { excluidos: _excluidosDelBorrador, ajustadasPorElChat: ajustadasDeEntrada, ...resto } = i.borrador;
  void _excluidosDelBorrador;
  let cambios: Cambio[] = [...i.borrador.cambios];
  let ajustadas: Record<string, FormaDeFase> = { ...(ajustadasDeEntrada ?? {}) };
  let excl: string[] = [...i.excluidos];
  let avisos: string[] = [];
  let refs = new Map<string, string>(); // el `ref` de un `fase.crear` del lote → su clave `n:…`

  const actual = (): Borrador => ({
    ...resto,
    cambios,
    ...(Object.keys(ajustadas).length > 0 ? { ajustadasPorElChat: ajustadas } : {}),
  });
  const mirar = (): Mirada => {
    const plan = planDeAplicacion(vivo, actual(), excl);
    const items = new Map<string, ItemDelPlan>();
    for (const it of plan.items) if (!items.has(it.cambio.clave)) items.set(it.cambio.clave, it);
    const fasesQueSeVan = new Set(
      plan.items.flatMap((it) => (it.estado === "aplica" && it.cambio.tipo === "fase-se-va" ? [it.cambio.faseId] : [])),
    );
    return {
      plan,
      proy: proyectarConPlan(vivo, plan),
      items,
      fasesQueSeVan,
      conSuFase: new Set((plan.escrituras.fasesQueSeVan ?? []).flatMap((f) => f.borrar)),
    };
  };
  /** Marcado para el CSE: aplica, o espera un recálculo sin que el CSE lo haya desmarcado (D6). */
  const marcado = (it: ItemDelPlan | undefined): boolean =>
    !!it && (it.estado === "aplica" || (!!it.recalcula && !excl.includes(it.cambio.clave)));

  // ── Escribir en el borrador ──
  const reemplazar = (viejo: Cambio, nuevo: Cambio) => {
    cambios = cambios.map((c) => (c === viejo ? nuevo : c));
  };
  const excluir = (clave: string) => {
    if (!excl.includes(clave)) excl = [...excl, clave];
  };
  const incluir = (clave: string) => {
    excl = excl.filter((k) => k !== clave);
  };
  const quitar = (c: Cambio) => {
    cambios = cambios.filter((x) => x !== c);
    incluir(c.clave);
  };
  /** Un cambio de estructura nuevo va detrás de los de estructura (antes de las tareas): así los números
   *  de la barra que ya existían no se corren entre sí. */
  const agregarEstructura = (c: Cambio) => {
    const k = cambios.findIndex(esCambioDeTarea);
    cambios = k < 0 ? [...cambios, c] : [...cambios.slice(0, k), c, ...cambios.slice(k)];
  };
  const agregarTarea = (c: Cambio) => {
    cambios = [...cambios, c];
  };
  const faseNuevaDe = (clave: string) =>
    cambios.find((c): c is CambioFaseNueva => c.tipo === "fase-nueva" && c.clave === clave);
  const tareaNuevaDe = (clave: string) =>
    cambios.find((c): c is CambioTareaNueva => c.tipo === "tarea-nueva" && c.clave === clave);
  const seVaDe = (tareaId: string) =>
    cambios.find((c): c is CambioTareaSeVa => c.tipo === "tarea-se-va" && c.tareaId === tareaId);
  const cambiaDe = (tareaId: string) =>
    cambios.find((c): c is CambioTareaCambia => c.tipo === "tarea-cambia" && c.tareaId === tareaId);

  // ── Resolver lo que nombra el chat ──
  /** Una fase: un id vivo que no se va, un `n:…` que no está fuera, o el `ref` de un `fase.crear` anterior. */
  const resolverFase = (ref: unknown, m: Mirada, paraQuitar = false): FaseResuelta | string => {
    const pedido = textoDe(ref);
    if (!pedido) return RECHAZO_FASE_NO_ESTA;
    const id = refs.get(pedido) ?? pedido;
    const viva = fasePorId.get(id);
    if (viva) {
      if (!paraQuitar && m.fasesQueSeVan.has(id)) return RECHAZO_FASE_SE_QUITA;
      return { tipo: "viva", id, viva };
    }
    const nueva = faseNuevaDe(id);
    if (!nueva) return RECHAZO_FASE_NO_ESTA;
    if (!paraQuitar && m.items.get(id)?.estado === "excluido") return RECHAZO_FASE_NUEVA_FUERA;
    return { tipo: "nueva", clave: id, cambio: nueva };
  };
  const claveDeLaFase = (f: FaseResuelta) => (f.tipo === "viva" ? f.id : f.clave);
  /** Una tarea: por su id (o su handle) entre las vivas, o por su clave `t:…` entre las nuevas. Ante dos
   *  candidatas no elige (el mismo rechazo que el ejecutor de siempre). */
  const resolverTarea = (ref: unknown): TareaResuelta | string => {
    if (typeof ref !== "string") return RECHAZO_TAREA_NO_ESTA;
    const nuevas = cambios.filter((c): c is CambioTareaNueva => c.tipo === "tarea-nueva");
    const r = resolverHandle(ref, [...tareaPorId.keys(), ...nuevas.map((c) => c.clave)]);
    if (r.tipo === "ambigua") return motivoDeTareaAmbigua(r.cuantas);
    if (r.tipo === "ninguna") return RECHAZO_TAREA_NO_ESTA;
    const viva = tareaPorId.get(r.id);
    if (viva) return { tipo: "viva", tarea: viva.tarea, faseId: viva.faseId };
    return { tipo: "nueva", cambio: nuevas.find((c) => c.clave === r.id)! };
  };
  /** Dónde queda una tarea viva en la propuesta: el destino de su mudanza marcada, o su fase. */
  const faseEnLaPropuesta = (tareaId: string, faseViva: string, m: Mirada): string => {
    const c = cambiaDe(tareaId);
    return c && m.items.get(c.clave)?.estado === "aplica" && c.a.fase !== undefined ? c.a.fase : faseViva;
  };
  /** Por qué no se edita una tarea viva: la propuesta ya la quita, o se va con su fase. */
  const vetoDeTareaViva = (t: TareaResuelta & { tipo: "viva" }, m: Mirada, mudanza: boolean): string | null => {
    const seVa = seVaDe(t.tarea.id);
    if (seVa && marcado(m.items.get(seVa.clave))) return RECHAZO_TAREA_SE_QUITA;
    if (!mudanza && m.fasesQueSeVan.has(faseEnLaPropuesta(t.tarea.id, t.faseId, m))) return RECHAZO_FASE_SE_QUITA;
    return null;
  };
  const vetoDeTareaNueva = (c: CambioTareaNueva, m: Mirada): string | null => {
    const it = m.items.get(c.clave);
    if (it?.estado === "excluido" && !marcado(it)) return RECHAZO_TAREA_NUEVA_FUERA;
    if (m.fasesQueSeVan.has(c.fase)) return RECHAZO_FASE_SE_QUITA;
    return null;
  };
  const duracionEnLaPropuesta = (clave: string, m: Mirada): number | null =>
    m.proy.fases.find((f) => f.clave === clave)?.durationWeeks ?? null;
  /** ¿Otra fase de la propuesta (o del cronograma) ya se llama así? */
  const nombreRepetido = (nombre: string, excepto: string | null, m: Mirada): boolean => {
    const n = normalizarNombre(nombre);
    return (
      m.proy.fases.some((f) => f.clave !== excepto && normalizarNombre(f.name) === n) ||
      vivo.fases.some((f) => f.id !== excepto && normalizarNombre(f.name) === n) ||
      cambios.some((c) => c.tipo === "fase-nueva" && c.clave !== excepto && normalizarNombre(c.fase.name) === n)
    );
  };

  // ── Los helpers de D8 y D9 ──
  /** El campo F de una fase viva (D8): crea el cambio, lo re-ancla, o lo quita / deja fuera si es lo vivo. */
  const upsertCampoDeFase = (f: FaseViva, campo: CampoDeFase, v: ValorDeCampo) => {
    const hoy = valorDeFase(f, campo);
    const c = cambios.find((x): x is CambioFaseCambia => x.tipo === "fase-cambia" && x.faseId === f.id && x.campo === campo);
    if (!c) {
      if (v === hoy) return;
      agregarEstructura({ tipo: "fase-cambia", clave: claveDeCampo(f.id, campo), faseId: f.id, fase: f.name, campo, desde: hoy, a: v, porChat: true });
      return;
    }
    if (v === hoy) {
      if (c.porChat) quitar(c);
      else excluir(c.clave);
      return;
    }
    /* Se re-ancla SOLO este campo (si lo vivo ya no era su `desde`). El motivo de la IA no explica el
       valor que pidió el chat: sale. */
    const { motivo: _motivo, ...sinMotivo } = c;
    void _motivo;
    reemplazar(c, { ...sinMotivo, desde: hoy, a: v, porChat: true });
    incluir(c.clave);
  };
  /** El contenido de una fase nueva (sin `desde`: se edita tal cual). */
  const editarFaseNueva = (c: CambioFaseNueva, campos: Partial<FaseNuevaPropuesta>) => {
    reemplazar(c, { ...c, fase: { ...c.fase, ...campos } });
  };
  /**
   * D9: con el nombre o las semanas que le dio el chat a una fase ARMADA, su forma ajustada (tomada de la
   * propuesta como se ve). La Semana 0 se copia de la armada. Si vuelve a ser la armada, no hace falta.
   */
  const ajustar = (clave: string) => {
    const armada = i.borrador.tareasArmadasPara[clave];
    if (!armada) return;
    const f = mirar().proy.fases.find((x) => x.clave === clave);
    if (!f) return;
    const ajustada: FormaDeFase = { ...armada, nombre: f.name, semanas: f.durationWeeks, sesiones: f.sessionCount ?? null };
    const { [clave]: _vieja, ...otras } = ajustadas;
    void _vieja;
    ajustadas = mismaForma(ajustada, armada) ? otras : { ...otras, [clave]: ajustada };
  };
  /**
   * D8 para una tarea VIVA: la fila única de su `tarea-cambia`. `edicion` lleva lo que se escribe (y `fase`
   * al mudarla). `conCambio` (D17): la clave del cambio de duración con el que va la semana.
   */
  const upsertTarea = (t: TareaDelVivo, faseViva: string, edicion: EdicionDeTarea, conCambio?: string) => {
    const c = cambiaDe(t.id);
    const escritos = Object.keys(edicion) as Array<keyof EdicionDeTarea>;
    const a: CambioTareaCambia["a"] = c ? { ...c.a } : {};
    let desde = c ? { ...c.desde } : fotoDeTarea(t);
    let faseId = c ? c.faseId : faseViva;
    if (c) {
      // Lo que alguien editó a mano después, en un campo que el chat no está escribiendo: gana la mano.
      for (const g of CAMPOS_DE_TAREA) {
        if (escritos.includes(g) || a[g] === undefined) continue;
        const hoy = valorDeTarea(t, g);
        if (hoy === c.desde[g]) continue;
        if (hoy !== a[g]) avisos.push(avisoEditadaAMano(t.title, g));
        delete a[g];
      }
      if (!escritos.includes("fase") && faseViva !== c.faseId) {
        // La movieron a mano: su origen pasa a ser donde está, y la mudanza pedida sale.
        if (a.fase !== undefined && a.fase !== faseViva) avisos.push(avisoEditadaAMano(t.title, "fase"));
        delete a.fase;
        faseId = faseViva;
      }
    }
    for (const campo of escritos) {
      if (campo === "fase") {
        faseId = faseViva; // re-anclar el origen: donde está hoy
        if (edicion.fase === faseViva) delete a.fase;
        else a.fase = edicion.fase;
        continue;
      }
      const v = edicion[campo];
      const hoy = valorDeTarea(t, campo);
      if (v === hoy || v === undefined) {
        delete a[campo];
        continue;
      }
      (a as Record<string, unknown>)[campo] = v;
      if (desde[campo] !== hoy) desde = { ...desde, [campo]: hoy };
    }
    if (a.fase !== undefined && a.fase === faseId) delete a.fase;
    // D17: `conCambio` solo tiene sentido con una semana pedida; una semana pedida a mano no va con nada.
    const conQue = a.weekIndex === undefined ? undefined : escritos.includes("weekIndex") ? conCambio : c?.conCambio;
    if (Object.keys(a).length === 0) {
      if (c) quitar(c); // las tareas que cambian son siempre del chat: sobra, se quita
      return;
    }
    const nuevo: CambioTareaCambia = {
      tipo: "tarea-cambia",
      clave: c?.clave ?? claveDeTareaQueCambia(t.id),
      tareaId: t.id,
      faseId,
      desde,
      a,
      ...(conQue ? { conCambio: conQue } : {}),
      porChat: true,
    };
    if (c) {
      reemplazar(c, nuevo);
      incluir(c.clave);
    } else {
      agregarTarea(nuevo);
    }
  };
  /**
   * Una mudanza del chat cuya fase de destino se quita: la tarea se queda en su origen. Sale la mudanza
   * (la fase, la semana en el destino y el cambio con el que iba); lo demás que pidió el chat (un renombre)
   * sigue. Sin nada más, el cambio se quita.
   */
  const sinLaMudanza = (c: CambioTareaCambia) => {
    const { fase: _fase, weekIndex: _semana, ...queda } = c.a;
    void _fase;
    void _semana;
    if (Object.keys(queda).length === 0) {
      quitar(c);
      return;
    }
    const { conCambio: _conCambio, ...sinConCambio } = c;
    void _conCambio;
    reemplazar(c, { ...sinConCambio, a: queda });
  };
  /** El contenido de una tarea NUEVA. Una de la IA que el chat edita queda `retocada` (nace MODIFIED). */
  const editarTareaNueva = (c: CambioTareaNueva, campos: Partial<ContenidoDeTareaNueva>, validada: boolean) => {
    const tarea: ContenidoDeTareaNueva = { ...c.tarea, ...campos };
    if (campos.title !== undefined) tarea.fuga = fugaTrasEditar(c.tarea.fuga, { title: campos.title });
    const deLaIa = !c.porChat;
    if (deLaIa && validada) {
      tarea.needsValidation = false;
      tarea.motivoPorValidar = null;
    }
    reemplazar(c, { ...c, tarea, ...(deLaIa ? { retocada: true as const } : {}) });
  };
  /** Un campo de tarea (semana, título, dueño, tipo) sobre lo que resuelva el chat. */
  const campoDeTarea = (
    ref: unknown,
    m: Mirada,
    campo: "title" | "weekIndex" | "party" | "type",
    valor: (duracion: number) => string | number | null,
  ): string | null => {
    const r = resolverTarea(ref);
    if (typeof r === "string") return r;
    if (r.tipo === "viva") {
      const veto = vetoDeTareaViva(r, m, false);
      if (veto) return veto;
      const dur = duracionEnLaPropuesta(faseEnLaPropuesta(r.tarea.id, r.faseId, m), m) ?? fasePorId.get(r.faseId)?.durationWeeks ?? 1;
      upsertTarea(r.tarea, r.faseId, { [campo]: valor(dur) } as EdicionDeTarea);
      return null;
    }
    const veto = vetoDeTareaNueva(r.cambio, m);
    if (veto) return veto;
    const dur = duracionEnLaPropuesta(r.cambio.fase, m) ?? 1;
    editarTareaNueva(r.cambio, { [campo]: valor(dur) } as Partial<ContenidoDeTareaNueva>, true);
    return null;
  };

  // ── Cada operación ──
  const operar = (o: OperacionSobreLaPropuesta): string | null => {
    const m = mirar();
    switch (o.op) {
      case "fase.duracion": {
        const f = resolverFase(o.phaseId, m);
        if (typeof f === "string") return f;
        if (!Number.isInteger(o.semanas) || o.semanas < 1) return "una fase tiene que durar al menos 1 semana";
        if (f.tipo === "viva") upsertCampoDeFase(f.viva, "durationWeeks", o.semanas);
        else editarFaseNueva(f.cambio, { durationWeeks: o.semanas });
        ajustar(claveDeLaFase(f));
        return null;
      }
      case "fase.renombrar": {
        const f = resolverFase(o.phaseId, m);
        if (typeof f === "string") return f;
        const nombre = textoDe(o.nombre);
        if (!nombre) return "el nombre no puede quedar vacío";
        if (nombreRepetido(nombre, claveDeLaFase(f), m)) return rechazoNombreRepetido(nombre);
        if (f.tipo === "viva") upsertCampoDeFase(f.viva, "name", nombre);
        else editarFaseNueva(f.cambio, { name: nombre });
        ajustar(claveDeLaFase(f));
        return null;
      }
      case "fase.tipo": {
        const f = resolverFase(o.phaseId, m);
        if (typeof f === "string") return f;
        if (!(TIPOS_DE_ACTIVIDAD_VALIDOS as readonly string[]).includes(o.tipo)) return `«${String(o.tipo)}» no es un tipo de actividad`;
        if (f.tipo === "viva") upsertCampoDeFase(f.viva, "activityType", o.tipo);
        else editarFaseNueva(f.cambio, { activityType: o.tipo });
        return null;
      }
      case "fase.nota": {
        // E4 P1: la misma validación que el ejecutor del cronograma. Sin `ajustar`: la nota no es parte
        // de la forma de la fase (no mueve sus tareas).
        const f = resolverFase(o.phaseId, m);
        if (typeof f === "string") return f;
        const r = notaDeLaOperacion(o);
        if ("rechazo" in r) return r.rechazo;
        if (f.tipo === "viva") upsertCampoDeFase(f.viva, "notes", r.nota);
        else editarFaseNueva(f.cambio, { notes: r.nota });
        return null;
      }
      case "fase.arranque-relativo": {
        const f = resolverFase(o.phaseId, m);
        if (typeof f === "string") return f;
        const semana = o.semana === null ? null : Math.max(entero(o.semana) ?? 0, 0);
        if (f.tipo === "viva") upsertCampoDeFase(f.viva, "startWeek", semana);
        else editarFaseNueva(f.cambio, { startWeek: semana });
        return null;
      }
      case "fase.crear": {
        const nombre = textoDe(o.nombre);
        if (!nombre) return "una fase sin nombre no se puede crear";
        if (!Number.isInteger(o.semanas) || o.semanas < 1) return "una fase dura al menos 1 semana";
        if (nombreRepetido(nombre, null, m)) return rechazoNombreRepetido(nombre);
        const ref = textoDe(o.ref);
        if (ref && (refs.has(ref) || fasePorId.has(ref) || faseNuevaDe(ref))) return `ya hay una fase con la referencia «${ref}» en este cambio`;
        /* Detrás del lugar `posicion − 1` de la propuesta como se ve (o de la última). */
        const lugares = m.proy.fases.map((f) => f.clave);
        const p = entero(o.posicion);
        const destino = p === null ? lugares.length : Math.min(Math.max(p, 0), lugares.length);
        const despuesDe = destino === 0 ? null : lugares[destino - 1];
        const usadas = new Set(cambios.flatMap((c) => (c.tipo === "fase-nueva" ? [c.clave] : [])));
        const clave = claveDeFaseNueva(nuevaClave, usadas);
        agregarEstructura({
          tipo: "fase-nueva",
          clave,
          fase: { name: nombre, durationWeeks: o.semanas, startWeek: null, sessionCount: null, notes: null, activityType: null },
          despuesDe,
          porChat: true,
        });
        if (ref) refs = new Map(refs).set(ref, clave);
        if (mirar().proy.fases.findIndex((f) => f.clave === clave) !== destino) return RECHAZO_LUGAR;
        return null;
      }
      case "fase.mover":
        return moverFase(o, m);
      case "fase.borrar": {
        const f = resolverFase(o.phaseId, m, true);
        if (typeof f === "string") return f;
        return f.tipo === "viva" ? quitarFaseViva(f.viva, m) : quitarFaseNueva(f.cambio, m);
      }
      case "fase.quitar-semana":
      case "fase.insertar-semana":
      case "fase.redistribuir":
        return semanasDeLaFase(o, m);
      case "tarea.mover-semana":
        if (entero(o.semana) === null) return "hace falta decir a qué semana se mueve";
        return campoDeTarea(o.taskId, m, "weekIndex", (dur) => acotar(entero(o.semana)!, dur));
      case "tarea.renombrar": {
        const titulo = textoDe(o.titulo);
        if (!titulo) return "una tarea no puede quedarse sin título";
        return campoDeTarea(o.taskId, m, "title", () => titulo);
      }
      case "tarea.duenio":
        if (!(DUENIOS_VALIDOS as readonly string[]).includes(o.duenio)) return `«${String(o.duenio)}» no es un dueño válido`;
        return campoDeTarea(o.taskId, m, "party", () => o.duenio);
      case "tarea.tipo":
        if (!(TIPOS_DE_TAREA_VALIDOS as readonly string[]).includes(o.tipo)) return `«${String(o.tipo)}» no es un tipo de tarea`;
        return campoDeTarea(o.taskId, m, "type", () => o.tipo);
      case "tarea.mover-fase":
        return moverTarea(o, m);
      case "tarea.borrar":
        return quitarTarea(o, m);
      case "tarea.crear":
        return crearTarea(o, m);
      case "arranque": {
        if (typeof o.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(o.fecha)) return "la fecha de arranque tiene que ser AAAA-MM-DD";
        const fecha = o.fecha.slice(0, 10);
        const hoy = vivo.ancla ? vivo.ancla.slice(0, 10) : null;
        const c = cambios.find((x): x is CambioDeAncla => x.tipo === "ancla");
        if (!c) {
          if (fecha !== hoy) agregarEstructura({ tipo: "ancla", clave: "ancla", desde: hoy, a: fecha, porChat: true });
          return null;
        }
        if (fecha === hoy) {
          if (c.porChat) quitar(c);
          else excluir(c.clave);
          return null;
        }
        reemplazar(c, { ...c, desde: hoy, a: fecha, porChat: true });
        incluir(c.clave);
        return null;
      }
      case "propuesta.dejar-como-estaba":
      case "propuesta.recuperar": {
        const claves = Array.isArray(o.claves) ? o.claves : [];
        if (claves.length === 0 || claves.some((k) => !cambios.some((c) => c.clave === k))) return RECHAZO_CLAVE_NO_ESTA;
        for (const k of claves) {
          if (o.op === "propuesta.dejar-como-estaba") excluir(k);
          else incluir(k);
        }
        return null;
      }
      default:
        return `«${String((o as { op?: unknown }).op)}» no es una operación válida`;
    }
  };

  /** `fase.mover`: el orden de las existentes y el lugar de cada fase nueva; se VERIFICA con la proyección. */
  const moverFase = (o: Extract<Operacion, { op: "fase.mover" }>, m: Mirada): string | null => {
    const f = resolverFase(o.phaseId, m);
    if (typeof f === "string") return f;
    const p = entero(o.posicion);
    if (p === null) return "hace falta decir a qué posición se mueve la fase";
    const clave = claveDeLaFase(f);
    const antes = m.proy.fases.map((x) => x.clave);
    const destino = Math.min(Math.max(p, 0), antes.length - 1);
    const pedido = antes.filter((k) => k !== clave);
    pedido.splice(destino, 0, clave);
    if (mismaLista(pedido, antes)) return null; // ya está ahí
    const idsVivos = vivo.fases.map((x) => x.id);
    const orden = cambios.find((c): c is CambioDeOrden => c.tipo === "orden");
    /* Revisión de E3: el orden nombra TODAS las fases vivas. Una que se va entera no está en la propuesta
       como se ve; si al final se queda (se deja como estaba, o se rescata una tarea suya), sin nombrarla
       iría al final del cronograma. Va en su lugar de ahora: detrás de la que tiene delante en el orden
       que se ve hoy (el cambio de orden marcado, o el vivo). */
    const deHoy = orden && m.items.get(orden.clave)?.estado === "aplica" ? ordenConCambio(idsVivos, orden) : idsVivos;
    const existentes = conLasQueNoSeVen(pedido.filter((k) => fasePorId.has(k)), deHoy);
    if (mismaLista(existentes, idsVivos.filter((id) => existentes.includes(id)))) {
      // Las existentes quedan en el orden de hoy: el cambio de orden sobra.
      if (orden) {
        if (orden.porChat) quitar(orden);
        else excluir(orden.clave);
      }
    } else if (orden) {
      const { motivos: _motivos, ...sinMotivos } = orden;
      void _motivos;
      reemplazar(orden, { ...sinMotivos, desde: mismaLista(orden.desde, idsVivos) ? orden.desde : idsVivos, a: existentes, porChat: true });
      incluir(orden.clave);
    } else {
      agregarEstructura({ tipo: "orden", clave: "orden", desde: idsVivos, a: existentes, porChat: true });
    }
    // Cada fase nueva que se ve va detrás de la que tiene antes en el orden pedido.
    pedido.forEach((k, j) => {
      const nueva = faseNuevaDe(k);
      if (!nueva) return;
      const despuesDe = j === 0 ? null : pedido[j - 1];
      if (nueva.despuesDe !== despuesDe) reemplazar(nueva, { ...nueva, despuesDe });
    });
    if (!mismaLista(mirar().proy.fases.map((x) => x.clave), pedido)) return RECHAZO_LUGAR;
    return null;
  };

  /**
   * `fase.borrar` de una fase viva: nace (o se re-incluye) su `fase-se-va`, con la foto de ahora. Lo demás
   * cuyo sujeto es esa fase sale: lo del chat se quita (una mudanza HACIA ella deja la tarea en su origen)
   * y lo de la IA queda fuera. Una mudanza que SALE de ella se conserva.
   */
  const quitarFaseViva = (f: FaseViva, m: Mirada): string | null => {
    if (f.tareas === undefined) return "no se leyeron las tareas de esa fase";
    const desde: CambioFaseSeVa["desde"] = {
      name: f.name,
      durationWeeks: f.durationWeeks,
      startWeek: f.startWeek,
      sessionCount: f.sessionCount,
      notes: f.notes,
      activityType: f.activityType,
      status: f.status ?? "PENDING",
      tareas: f.tareas.map((t) => ({ id: t.id, foto: fotoDeTarea(t) })),
    };
    const ya = cambios.find((c): c is CambioFaseSeVa => c.tipo === "fase-se-va" && c.faseId === f.id);
    if (ya) {
      // Se incluye, pasa a ser del chat y, si chocaba (la editaron después), se re-ancla a la foto de ahora.
      reemplazar(ya, { ...ya, ...(m.items.get(ya.clave)?.estado === "choque" ? { desde } : {}), porChat: true });
      incluir(ya.clave);
    } else {
      agregarEstructura({ tipo: "fase-se-va", clave: claveDeFaseQueSeVa(f.id), faseId: f.id, desde, porChat: true });
    }
    let salen = 0;
    for (const c of [...cambios]) {
      if (c.tipo === "fase-se-va") continue;
      if (c.tipo === "tarea-cambia" && c.faseId !== f.id && c.a.fase === f.id) {
        // Una mudanza HACIA la fase que se va: la tarea se queda en su origen (lo demás del cambio sigue).
        if (!c.porChat && excl.includes(c.clave)) continue;
        salen++;
        if (c.porChat) sinLaMudanza(c);
        else excluir(c.clave);
        continue;
      }
      const sujeto =
        c.tipo === "fase-cambia" || c.tipo === "tarea-se-va"
          ? c.faseId
          : c.tipo === "tarea-nueva"
            ? c.fase
            : c.tipo === "tarea-cambia" && (c.a.fase === undefined || c.a.fase === c.faseId)
              ? c.faseId
              : null;
      if (sujeto !== f.id || (!c.porChat && excl.includes(c.clave))) continue;
      salen++;
      if (c.porChat) quitar(c);
      else excluir(c.clave);
    }
    if (salen > 0) {
      avisos.push(`${salen === 1 ? "Sale de la propuesta 1 cambio" : `Salen de la propuesta ${salen} cambios`} de «${f.name}»: se van con la fase.`);
    }
    /* Una fase que no se puede quitar (ya arrancó, o todo lo suyo se queda) no se registra: quedaría con
       ⚠ en la barra justo después de que el chat dijera que la quitó. Se dice el porqué del choque. */
    const it = mirar().items.get(claveDeFaseQueSeVa(f.id));
    if (it?.estado === "choque" && it.choque) return `${it.choque.charAt(0).toLowerCase()}${it.choque.slice(1).replace(/\.$/, "")}`;
    return null;
  };

  /** `fase.borrar` de una fase NUEVA: la del chat se quita con lo que cuelga de ella; la de la IA queda fuera. */
  const quitarFaseNueva = (c: CambioFaseNueva, m: Mirada): string | null => {
    if (!c.porChat) {
      if (m.items.get(c.clave)?.estado === "excluido") avisos.push(`La fase nueva «${c.fase.name}» ya estaba fuera de la propuesta.`);
      excluir(c.clave);
      return null;
    }
    quitar(c);
    for (const x of [...cambios]) {
      if (x.tipo === "tarea-nueva" && x.fase === c.clave) quitar(x);
      else if (x.tipo === "fase-nueva" && x.despuesDe === c.clave) reemplazar(x, { ...x, despuesDe: c.despuesDe });
      // La mudanza hacia la fase que se quita: la tarea se queda en su origen.
      else if (x.tipo === "tarea-cambia" && x.a.fase === c.clave) sinLaMudanza(x);
    }
    const { [c.clave]: _vieja, ...otras } = ajustadas;
    void _vieja;
    ajustadas = otras;
    refs = new Map([...refs].filter(([, k]) => k !== c.clave));
    return null;
  };

  /**
   * Quitar, insertar o redistribuir semanas: se REUSA `aplicarOperaciones` sobre la fase como se ve en la
   * propuesta (ids = los de la barra). La duración nueva va a su campo (+ D9) y cada tarea cuya semana
   * cambia, a su cambio: una viva con `conCambio` = la clave de la duración (D17, no al redistribuir).
   */
  const semanasDeLaFase = (
    o: Extract<Operacion, { op: "fase.quitar-semana" | "fase.insertar-semana" | "fase.redistribuir" }>,
    m: Mirada,
  ): string | null => {
    const f = resolverFase(o.phaseId, m);
    if (typeof f === "string") return f;
    const clave = claveDeLaFase(f);
    const vista = m.proy.fases.find((x) => x.clave === clave);
    if (!vista) return RECHAZO_FASE_NO_ESTA;
    const r = aplicarOperaciones([faseActualDeLaPropuesta(vista)], null, [{ ...o, phaseId: clave } as Operacion]);
    if (r.rechazadas.length > 0) return r.rechazadas[0].motivo;
    const salida = r.payload.phases[0];
    if (salida.durationWeeks !== vista.durationWeeks) {
      if (f.tipo === "viva") upsertCampoDeFase(f.viva, "durationWeeks", salida.durationWeeks);
      else editarFaseNueva(f.cambio, { durationWeeks: salida.durationWeeks });
      ajustar(clave);
    }
    // D17: van con el cambio de duración solo si quedó marcado (si sobró, cada semana va sola).
    const claveDeDuracion = f.tipo === "viva" && o.op !== "fase.redistribuir" ? claveDeCampo(f.id, "durationWeeks") : null;
    const conCambio =
      claveDeDuracion !== null && mirar().items.get(claveDeDuracion)?.estado === "aplica" ? claveDeDuracion : undefined;
    const semanas = new Map((salida.tasks ?? []).map((t) => [t.id, t.weekIndex]));
    for (const t of vista.tareas) {
      const w = semanas.get(t.clave);
      if (w === undefined || w === t.weekIndex) continue;
      if (t.id !== null) {
        const viva = tareaPorId.get(t.id);
        if (viva) upsertTarea(viva.tarea, viva.faseId, { weekIndex: w }, conCambio);
      } else {
        const nueva = tareaNuevaDe(t.clave);
        if (nueva) editarTareaNueva(nueva, { weekIndex: w }, false);
      }
    }
    return null;
  };

  /** `tarea.mover-fase`: una viva se MUDA (conserva su estado); una nueva cambia de fase y semana (una de
   *  la IA sigue siendo de la IA: `retocada` + `mudadaPorElChat`). A su misma fase, es mover de semana. */
  const moverTarea = (o: Extract<Operacion, { op: "tarea.mover-fase" }>, m: Mirada): string | null => {
    const r = resolverTarea(o.taskId);
    if (typeof r === "string") return r;
    const d = resolverFase(o.phaseId, m);
    if (typeof d === "string") return d;
    const destino = claveDeLaFase(d);
    const dur = duracionEnLaPropuesta(destino, m);
    if (dur === null) return RECHAZO_FASE_NO_ESTA;
    const semana = acotar(Math.max(entero(o.semana ?? 0) ?? 0, 0), dur);
    if (r.tipo === "viva") {
      const veto = vetoDeTareaViva(r, m, true);
      if (veto) return veto;
      // Vuelve a su fase: sin mudanza, y sin semana si no la pidió (queda en la suya).
      const vuelve = destino === r.faseId;
      upsertTarea(r.tarea, r.faseId, { fase: destino, weekIndex: vuelve && o.semana === undefined ? r.tarea.weekIndex : semana });
      return null;
    }
    const veto = vetoDeTareaNueva(r.cambio, m);
    if (veto) return veto;
    // A su misma fase es mover de semana (sin semana pedida, se queda donde está).
    if (destino === r.cambio.fase) {
      if (o.semana !== undefined) editarTareaNueva(r.cambio, { weekIndex: semana }, true);
      return null;
    }
    const mudada = { ...r.cambio, fase: destino, tarea: { ...r.cambio.tarea, weekIndex: semana } };
    /* Revisión de E3: una nueva de la IA que el chat muda de fase SIGUE SIENDO DE LA IA —pide su vara al
       aplicar y conserva «por validar»—; queda `retocada` (nace MODIFIED) y `mudadaPorElChat`, que la saca
       del cierre de E2c: ya no es de la forma para la que se armó (chocaría en una fase sin forma armada).
       Hasta la revisión pasaba a `porChat`, y con eso se aplicaba sin la vara de la IA. */
    reemplazar(r.cambio, r.cambio.porChat ? mudada : { ...mudada, retocada: true, mudadaPorElChat: true });
    return null;
  };

  /** `tarea.borrar`: una viva pendiente se va (con su `tarea-se-va`, uno solo por tarea); una nueva sale. */
  const quitarTarea = (o: Extract<Operacion, { op: "tarea.borrar" }>, m: Mirada): string | null => {
    const r = resolverTarea(o.taskId);
    if (typeof r === "string") return r;
    if (r.tipo === "nueva") {
      const it = m.items.get(r.cambio.clave);
      if (r.cambio.porChat) quitar(r.cambio);
      else if (it?.estado === "excluido" && !marcado(it)) avisos.push(`«${r.cambio.tarea.title}» ya estaba fuera de la propuesta.`);
      else excluir(r.cambio.clave);
      return null;
    }
    const t = r.tarea;
    if (isKept(t)) return motivoDeTareaProtegida(t);
    if (m.conSuFase.has(t.id)) {
      avisos.push(`«${t.title}» ya se quita con su fase.`);
      return null;
    }
    if (m.fasesQueSeVan.has(faseEnLaPropuesta(t.id, r.faseId, m))) return RECHAZO_FASE_SE_QUITA;
    const ya = seVaDe(t.id);
    if (ya) {
      // La misma clave, incluida y del chat; si chocaba, con la foto (y la fase) de ahora.
      const choca = m.items.get(ya.clave)?.estado === "choque";
      reemplazar(ya, { ...ya, ...(choca ? { desde: fotoDeTarea(t), faseId: r.faseId } : {}), porChat: true });
      incluir(ya.clave);
    } else {
      agregarTarea({ tipo: "tarea-se-va", clave: claveDeTareaQueSeVa(t.id), tareaId: t.id, faseId: r.faseId, desde: fotoDeTarea(t), porChat: true });
    }
    const cambia = cambiaDe(t.id);
    if (cambia) quitar(cambia);
    return null;
  };

  /** `tarea.crear`: una `tarea-nueva` del chat, salvo que ya sobreviva una igual en esa semana. */
  const crearTarea = (o: Extract<Operacion, { op: "tarea.crear" }>, m: Mirada): string | null => {
    const f = resolverFase(o.phaseId, m);
    if (typeof f === "string") return f;
    const titulo = textoDe(o.titulo);
    if (!titulo) return "una tarea sin título no se puede crear";
    const semanaPedida = entero(o.semana);
    if (semanaPedida === null) return `hace falta decir en qué semana va «${titulo}»`;
    if (o.duenio && !(DUENIOS_VALIDOS as readonly string[]).includes(o.duenio)) return `«${String(o.duenio)}» no es un dueño válido`;
    if (o.tipo && !(TIPOS_DE_TAREA_VALIDOS as readonly string[]).includes(o.tipo)) return `«${String(o.tipo)}» no es un tipo de tarea`;
    const clave = claveDeLaFase(f);
    const vista = m.proy.fases.find((x) => x.clave === clave);
    if (!vista) return RECHAZO_FASE_NO_ESTA;
    const semana = acotar(Math.max(semanaPedida, 0), vista.durationWeeks);
    const huella = huellaDeTitulo(titulo);
    if (vista.tareas.some((t) => t.weekIndex === semana && huellaDeTitulo(t.title) === huella)) return RECHAZO_TAREA_REPETIDA;
    agregarTarea({
      tipo: "tarea-nueva",
      clave: claveDeTareaNueva(nuevaClave),
      fase: clave,
      tarea: {
        title: titulo,
        weekIndex: semana,
        notes: null,
        party: o.duenio ?? null,
        type: o.tipo ?? null,
        needsValidation: false,
        motivoPorValidar: null,
        fuga: null,
      },
      porChat: true,
    });
    return null;
  };

  // ── El lote, en orden y todo o nada ──
  const rechazadas: ResultadoSobreLaPropuesta["rechazadas"] = [];
  i.operaciones.forEach((o, indice) => {
    const antes = { cambios, ajustadas, excl, avisos: [...avisos], refs };
    let motivo: string | null;
    try {
      motivo = operar(o);
    } catch {
      // Un campo con una forma que el modelo inventó no tira el lote: se rechaza con nombre.
      motivo = `«${String((o as { op?: unknown }).op)}» no se pudo entender`;
    }
    if (motivo !== null) {
      ({ cambios, ajustadas, excl, avisos, refs } = antes);
      rechazadas.push({ indice, motivo });
    }
  });
  if (rechazadas.length > 0) {
    return { borrador: i.borrador, excluidos: [...i.excluidos], rechazadas, avisos: [], cambio: false };
  }
  const excluidos = normalizarExcluidos({ cambios }, excl);
  const borrador: Borrador = { ...actual(), excluidos };
  const firma = (c: readonly Cambio[], a: Record<string, FormaDeFase> | undefined, e: readonly string[]) =>
    jsonCanonico({ c, a: a ?? {}, e });
  const cambio =
    firma(i.borrador.cambios, i.borrador.ajustadasPorElChat, normalizarExcluidos(i.borrador, i.excluidos)) !==
    firma(cambios, ajustadas, excluidos);
  return { borrador, excluidos, rechazadas: [], avisos: [...new Set(avisos)], cambio };
}
