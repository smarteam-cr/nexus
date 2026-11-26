/**
 * lib/chat-de-nexus/lista.ts — UNA SOLA CONVERSACIÓN (Elías, 24 nov: «quiero avanzar con eso»): lo que la persona le
 * PIDE a Nexus de la cuenta (una tarea, el siguiente paso, la guía de la próxima sesión, un documento) vive en el mismo hilo
 * que lo que cuenta y lo que pregunta. PURO y client-safe: lo comparten el servidor (./conversacion-server.ts), la pantalla
 * y las pruebas.
 *
 * Antes eran dos conversaciones: la de contar y preguntar (este módulo) y la de la cuenta (lib/nexus-chat), con su propio
 * hilo (`HiloDeChat` de la cuenta, el mismo de la ficha). Ninguna veía lo que se dijo en la otra. Ahora la parte de Nexus
 * que trabaja la cuenta (sus herramientas, sus operaciones, su lista que se aplica con un clic) corre como una MANO de esta
 * conversación: recibe estos mensajes como su historia, y lo que propone queda en la vuelta (`AgentRun`) de esta
 * conversación, como una «lista».
 *
 *   · `ListaGuardada`: lo que guarda la vuelta (con las operaciones ya acotadas a la cuenta, que nunca salen al navegador).
 *   · `estadosDeLasListas`: en qué quedó cada una (viva, aplicada, reemplazada, soltada), DERIVADO de las vueltas, sin
 *     columna. La pantalla usa la MISMA regla (`mueveALasDeAntes`) al sumar una lista nueva.
 *   · `listaPendiente`: lo propuesto y no aplicado, que la mano de la cuenta arrastra al pedido siguiente (como en la ficha).
 *   · `emparejarListas`: qué lista es la de cada mensaje, por la vuelta que lo dejó (nunca por el texto: Nexus repite su
 *     «Te dejé el cambio en la lista.»).
 *   · `ventanaParaLaCuenta`: la historia que ve la mano de la cuenta: esta conversación, con lo que propuso y lo aplicado.
 *
 * ⛔ Las operaciones las lee el SERVIDOR de su vuelta: el navegador manda solo qué lista aplicar y qué desmarcó.
 */
import { conTopeDeLaConversacion, esCortesia, TOPES, type MensajeDeLaConversacion } from "./conversacion";

/** Un cambio de la cuenta como lo guarda la vuelta: la operación de la capa y su entrada, ya acotada a la cuenta. */
export interface OperacionDeLaLista {
  nombre: string;
  entrada: unknown;
}

/**
 * En qué quedó una lista. «sin-cambios»: Nexus solo contestó. «reemplazada»: una lista posterior la lleva (lo que seguía
 * pendiente pasó a esa). «soltada»: ya no va (Nexus la soltó sin proponer otra, o la persona eligió guardarlo como nota).
 */
export const ESTADOS_DE_LA_LISTA = ["viva", "aplicada", "reemplazada", "soltada", "sin-cambios"] as const;
export type EstadoDeLaLista = (typeof ESTADOS_DE_LA_LISTA)[number];

/** Una lista como la ve la pantalla. */
export interface ListaEnLaConversacion {
  /** La vuelta que la dejó: con ella se aplica (`POST …/nexus/aplicar`). */
  id: string;
  /** Lo que contestó Nexus, sin marcadores. */
  texto: string;
  /** Un renglón por cambio, en castellano: lo que la persona lee es lo que se aplica. Vacío: solo contestó. */
  lineas: string[];
  /** Los renglones (por su lugar) que venían de una lista anterior sin aplicar. */
  arrastradas?: number[];
  /** Lo que salió de la lista anterior, con su motivo. */
  descartadas?: string[];
  /** Soltó lo pendiente sin proponer otra cosa: la anterior queda «soltada». */
  cierre?: true;
  estado: EstadoDeLaLista;
  /** Lo que pasó al aplicar («Listo: 2 tareas creadas»). */
  desenlace?: string;
  /** Los renglones (por su lugar) que se aplicaron; los demás se desmarcaron o no llegaron a aplicarse. */
  aplicados?: number[];
}

/** Lo que dejó el «Aplicar» de una lista. `ok`: algo se aplicó (la lista se cierra; lo que falló se pide de nuevo). */
export interface DesenlaceDeLaLista {
  ok: boolean;
  texto: string;
  aplicadas: number;
  /** Los renglones que se aplicaron, por su lugar en la lista. */
  renglones?: number[];
}

/** Lo que guarda la vuelta que dejó una lista (en su `output`, junto al tipo «lista»). */
export interface ListaGuardada {
  lista: Omit<ListaEnLaConversacion, "estado" | "desenlace" | "aplicados">;
  operaciones: OperacionDeLaLista[];
  desenlace?: DesenlaceDeLaLista;
  /** La persona eligió «Guardarlo como nota» debajo de esta lista: ya no va, y no se arrastra. */
  soltada?: true;
}

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const textos = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 600)).slice(0, max) : []);
const indices = (v: unknown, tope: number): number[] => (Array.isArray(v) ? v.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < tope) : []);

/** Cuántos renglones tiene una lista como mucho (el tope de la mano de la cuenta es 15). */
const MAX_LINEAS = 20;

/** La lista guardada de una vuelta, leída sin confiar en ella. null si esa vuelta no dejó una lista. */
export function leerListaGuardada(salida: unknown): ListaGuardada | null {
  const s = objeto(salida);
  if (!s || s.tipo !== "lista") return null;
  const l = objeto(s.lista);
  if (!l || typeof l.id !== "string" || typeof l.texto !== "string") return null;
  const leidas = (Array.isArray(s.operaciones) ? s.operaciones : [])
    .map((o) => objeto(o))
    .filter((o): o is Record<string, unknown> => !!o && typeof o.nombre === "string" && "entrada" in o)
    .map((o) => ({ nombre: o.nombre as string, entrada: o.entrada }))
    .slice(0, MAX_LINEAS);
  const todas = textos(l.lineas, MAX_LINEAS);
  // Un renglón por operación: si no cuadran, la lista no se puede aplicar (no se sabría qué dice cada una).
  const cuadran = todas.length === leidas.length;
  const lineas = cuadran ? todas : [];
  const operaciones = cuadran ? leidas : [];
  const arrastradas = indices(l.arrastradas, lineas.length);
  const descartadas = textos(l.descartadas, MAX_LINEAS);
  const d = objeto(s.desenlace);
  const renglones = d ? indices(d.renglones, lineas.length) : [];
  const desenlace =
    d && typeof d.ok === "boolean" && typeof d.texto === "string"
      ? { ok: d.ok, texto: d.texto, aplicadas: typeof d.aplicadas === "number" ? d.aplicadas : 0, ...(Array.isArray(d.renglones) ? { renglones } : {}) }
      : undefined;
  return {
    lista: {
      id: l.id,
      texto: l.texto,
      lineas,
      ...(arrastradas.length ? { arrastradas } : {}),
      ...(descartadas.length ? { descartadas } : {}),
      ...(l.cierre === true && !lineas.length ? { cierre: true as const } : {}),
    },
    operaciones,
    ...(desenlace ? { desenlace } : {}),
    ...(s.soltada === true ? { soltada: true as const } : {}),
  };
}

/**
 * ¿Una lista nueva mueve a las de antes? Sí si propone algo (lleva lo pendiente: la de antes queda «reemplazada») o si
 * soltó lo pendiente sin proponer nada (un cierre: la de antes queda «soltada»). Una que solo contestó, no. LA regla: la
 * usan el servidor (`estadosDeLasListas`) y la pantalla (`conLaListaNueva`).
 */
export function mueveALasDeAntes(l: Pick<ListaEnLaConversacion, "lineas" | "cierre">): EstadoDeLaLista | null {
  if (l.lineas.length > 0) return "reemplazada";
  return l.cierre ? "soltada" : null;
}

/**
 * En qué quedó cada lista de la conversación (de la vuelta más vieja a la más nueva): «aplicada» si su «Aplicar» dejó algo
 * escrito; «soltada» si la persona la guardó como nota o un cierre posterior la soltó; «reemplazada» si una lista posterior
 * la llevó (aplicar la vieja aplicaría dos veces); «sin-cambios» si solo contestó; si no, «viva». Por id de la vuelta.
 */
export function estadosDeLasListas(listas: readonly ListaGuardada[]): Map<string, EstadoDeLaLista> {
  const estados = new Map<string, EstadoDeLaLista>();
  listas.forEach((g, i) => {
    if (g.desenlace?.ok) return estados.set(g.lista.id, "aplicada");
    if (!g.lista.lineas.length) return estados.set(g.lista.id, "sin-cambios");
    if (g.soltada) return estados.set(g.lista.id, "soltada");
    const despues = listas.slice(i + 1).map((x) => mueveALasDeAntes(x.lista)).find((e) => e !== null);
    estados.set(g.lista.id, despues ?? "viva");
  });
  return estados;
}

/** La lista como la ve la pantalla, con su estado y los renglones que se aplicaron. */
export function listaParaLaPantalla(g: ListaGuardada, estado: EstadoDeLaLista): ListaEnLaConversacion {
  return {
    ...g.lista,
    estado,
    ...(g.desenlace ? { desenlace: g.desenlace.texto } : {}),
    ...(g.desenlace?.renglones ? { aplicados: g.desenlace.renglones } : {}),
  };
}

/**
 * Lo propuesto en la conversación que sigue sin aplicar: la última lista que mueve a las de antes, si está viva. La mano de
 * la cuenta lo vuelve a preparar contra hoy y lo arrastra a la lista nueva (o lo suelta). Vacío si no hay.
 */
export function listaPendiente(listas: readonly ListaGuardada[]): Array<OperacionDeLaLista & { linea: string }> {
  const estados = estadosDeLasListas(listas);
  for (let i = listas.length - 1; i >= 0; i--) {
    const g = listas[i];
    // Una que solo contestó no mueve nada: la pendiente es la de antes.
    if (!mueveALasDeAntes(g.lista)) continue;
    if (estados.get(g.lista.id) !== "viva") return [];
    return g.operaciones.map((o, k) => ({ ...o, linea: g.lista.lineas[k] ?? o.nombre }));
  }
  return [];
}

/**
 * Qué lista es la de cada mensaje «lista» de la conversación (por su lugar en `mensajes`). Primero por la vuelta que lo
 * dejó (`mensaje.vuelta`, que la pantalla guarda y devuelve); lo que no la trae se empareja por ORDEN desde el final con las
 * listas que quedan. Nunca por el texto: la mano de la cuenta repite su «Te dejé el cambio en la lista.», y dos listas con
 * el mismo texto se pisaban (revisión del 24 nov). Solo las listas de ESTA conversación, que lee el servidor.
 */
export function emparejarListas<G extends Pick<ListaGuardada, "lista">>(mensajes: readonly MensajeDeLaConversacion[], listas: readonly G[]): Map<number, G> {
  const porId = new Map(listas.map((g) => [g.lista.id, g] as const));
  const out = new Map<number, G>();
  const usadas = new Set<string>();
  const sinId: number[] = [];
  mensajes.forEach((m, i) => {
    if (m.de !== "nexus" || m.es !== "lista") return;
    const g = m.vuelta ? porId.get(m.vuelta) : undefined;
    if (g && !usadas.has(g.lista.id)) {
      out.set(i, g);
      usadas.add(g.lista.id);
    } else sinId.push(i);
  });
  const quedan = listas.filter((g) => !usadas.has(g.lista.id));
  for (let k = 1; k <= sinId.length && k <= quedan.length; k++) out.set(sinId[sinId.length - k], quedan[quedan.length - k]);
  return out;
}

/** Cuántos turnos de la conversación ve la mano de la cuenta (los mismos que en la ficha). */
export const TURNOS_PARA_LA_CUENTA = 12;

/**
 * La historia que ve la mano de la cuenta: los mensajes de ESTA conversación hasta antes del pedido, con quién habló. Lo
 * que Nexus propuso para la cuenta lleva sus renglones al final («[La lista que propuse: …]») y, si se aplicó, lo que
 * quedó: el modelo tiene que saber qué propuso para no repetirlo ni contradecirlo. Mensajes seguidos del mismo lado se
 * juntan (la API pide alternar) y empieza por la persona. `listas`: las de las vueltas de esta conversación.
 * `limpiar`: saca los marcadores del acuerdo (lib/nexus-chat/textos.ts › `sinMarcadores`): nada del navegador se lee como
 * una lista de verdad.
 */
export function ventanaParaLaCuenta(
  mensajes: readonly MensajeDeLaConversacion[],
  listas: readonly ListaGuardada[],
  limpiar: (t: string) => string,
  tope = TURNOS_PARA_LA_CUENTA,
  /** Cuántas letras, como mucho (25 nov): lo más viejo se recorta primero (`conTopeDeLaConversacion`). */
  letras: number = TOPES.largoDeLaConversacion,
): Array<{ rol: "user" | "assistant"; texto: string }> {
  const deCadaMensaje = emparejarListas(mensajes, listas);
  const turnos: Array<{ rol: "user" | "assistant"; texto: string }> = [];
  mensajes.forEach((m, i) => {
    const rol = m.de === "persona" ? ("user" as const) : ("assistant" as const);
    let texto = limpiar(m.texto).trim();
    const g = deCadaMensaje.get(i);
    if (g?.lista.lineas.length) texto = `${texto}\n\n[La lista que propuse: ${g.lista.lineas.join(" · ")}]`;
    if (g?.desenlace?.ok) texto = `${texto}\n[La persona la aplicó: ${g.desenlace.texto}]`;
    else if (g?.soltada) texto = `${texto}\n[La persona no la quiso: la guardó como nota]`;
    if (!texto) return;
    const ultimo = turnos[turnos.length - 1];
    if (ultimo && ultimo.rol === rol) ultimo.texto = `${ultimo.texto}\n\n${texto}`;
    else turnos.push({ rol, texto });
  });
  const ultimos = conTopeDeLaConversacion(turnos.slice(-tope), letras);
  const desde = ultimos.findIndex((t) => t.rol === "user");
  return desde < 0 ? [] : ultimos.slice(desde);
}

/** ¿El pedido habla de la guía de la próxima sesión? Entonces la mano de la cuenta la tiene a la vista (sus preguntas). */
export function hablaDeLaGuia(texto: string): boolean {
  return /(^|[^\p{L}])gu[ií]a([^\p{L}]|$)/iu.test(texto) || /(^|[^\p{L}])repreguntas?([^\p{L}]|$)/iu.test(texto);
}

// ── La pantalla ─────────────────────────────────────────────────────────────────

/** Un mensaje de la conversación en la pantalla, con su lista si la trae. */
type ConLista = MensajeDeLaConversacion & { lista?: ListaEnLaConversacion };

/**
 * La conversación con lo que contestó la mano de la cuenta: lo último que escribió la persona queda como «pedido» (no va a
 * la nota), va la respuesta con su lista (y su vuelta, para reconocerla al volver) y las listas vivas de antes quedan como
 * las deja el servidor (`mueveALasDeAntes`): su «Aplicar» se apaga.
 */
export function conLaListaNueva<M extends ConLista>(m: readonly M[], lista: ListaEnLaConversacion): M[] {
  const mueve = mueveALasDeAntes(lista);
  const antes = m.map((x, i) => {
    if (i === m.length - 1 && x.de === "persona" && !x.es) return { ...x, es: "pedido" as const };
    if (mueve && x.lista?.estado === "viva") return { ...x, lista: { ...x.lista, estado: mueve } };
    return x;
  });
  return [...antes, { de: "nexus", es: "lista", texto: lista.texto, vuelta: lista.id, lista } as M];
}

/** La conversación con la lista `lista.id` como quedó después de «Aplicar» (lo que respondió el servidor). */
export function conLaListaAplicada<M extends ConLista>(m: readonly M[], lista: ListaEnLaConversacion): M[] {
  return m.map((x) => (x.lista?.id === lista.id ? { ...x, lista } : x));
}

/**
 * ¿Debajo de esta lista se ofrece «Guardarlo como nota»? Solo si no se aplicó nada (viva o sin cambios) y no lleva lo
 * pendiente de otra: soltarla se llevaría también lo que la persona pidió antes (revisión del 24 nov).
 */
export function seGuardaComoNota(l: ListaEnLaConversacion | undefined): boolean {
  if (!l) return true;
  return (l.estado === "viva" || l.estado === "sin-cambios") && !l.arrastradas?.length;
}

/**
 * El cuerpo de una vuelta (`POST …/nexus`), como lo arma la pantalla. Cada mensaje con su marca y, si es una lista, su
 * vuelta (con ella el servidor la reconoce). `listas` solo si quien conversa puede pedir lo de la cuenta. Con la guía como
 * lugar, lo que se escribe es un pedido sobre ella (`pedir`), salvo «Guardarlo como nota» o «Respóndela» (ganan) y un
 * «gracias» u «ok» (se contesta corto, sin la IA: revisión del 24 nov).
 */
export function cuerpoDeLaVuelta(o: {
  conversacion: string;
  mensajes: readonly MensajeDeLaConversacion[];
  modo: "normal" | "contar" | "preguntar";
  pedidosDeLaCuenta: boolean;
  lugar?: "guia";
  soltar?: string;
  /** El chip de La escala (25 nov): a qué página y sección va un cambio. Solo en un envío normal. */
  escala?: { lugar: { pagina: "resumen" } | { pagina: "area"; areaId: string }; foco: string | null } | null;
}): Record<string, unknown> {
  const mensajes = o.mensajes.map(({ de, texto, es, vuelta }) => ({ de, texto, ...(es ? { es } : {}), ...(vuelta ? { vuelta } : {}) }));
  const ultimo = o.mensajes[o.mensajes.length - 1];
  const pedir = o.lugar === "guia" && o.modo === "normal" && !!ultimo && ultimo.de === "persona" && !esCortesia(ultimo.texto);
  return {
    conversacion: o.conversacion,
    mensajes,
    ...(o.pedidosDeLaCuenta ? { listas: true, ...(o.lugar ? { lugar: o.lugar } : {}), ...(o.soltar ? { soltar: o.soltar } : {}), ...(pedir ? { pedir: true } : {}) } : {}),
    ...(o.modo === "contar" ? { contar: true } : o.modo === "preguntar" ? { preguntar: true } : {}),
    ...(o.escala && o.modo === "normal" ? { escala: o.escala } : {}),
  };
}
