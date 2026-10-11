/**
 * lib/asistente/alcance.ts — LA LÍNEA DE ALCANCE QUE SE ANTEPONE AL MENSAJE DEL CSE. Puro.
 *
 * El chip del chat («Sobre «X»») viaja al modelo como una línea al principio del texto del turno. Vive
 * acá, fuera de `components/asistente/chat-de-seccion.tsx` (que la re-exporta), para poder probarla:
 * el project `unit` solo corre `lib/**`.
 *
 * ⚠ Va en el CONTENIDO del turno y no en un campo aparte porque el hilo se re-manda entero al modelo
 * en cada turno: lo que no está en el texto no existe dos mensajes después. Mismo mecanismo que el
 * bloque de pendientes, y misma razón.
 *
 * ⛔ Y por eso mismo hay que SACARLA al pintar: es una instrucción para el modelo, no algo que la
 * persona escribió. Verla entera arriba de su propia frase —repitiendo lo que el chip ya dice al
 * lado— se lee como ruido del sistema metido en su mensaje. Visto en pantalla el 2026-08-22.
 *
 * E4 P1: el «IA» de cada fase del Gantt abre el chat con la fase señalada (`tipo: "fase"`, la key
 * `fase:<id>`). Su línea es otra marca; la de una sección queda byte a byte igual, así los hilos
 * viejos se siguen limpiando.
 *
 * Etapa 6 de la memoria de la cuenta: «Cambiar con el chat» de una NOVEDAD (lo que una reunión le propone a una sección
 * de un documento) fija la sección con la novedad adentro (`novedad`). Sus líneas van DENTRO del bloque, antes de la
 * línea en blanco, así `mensajeSinAlcance` las saca al pintar; la marca `[NOVEDAD …]` dice qué hechos se usan cuando el
 * acuerdo de ese turno se aplica (`novedadesPorAplicar`). Sin novedad, la línea de una sección no cambia ni un byte.
 */

export interface SeccionReferida {
  key: string;
  label: string;
  /**
   * ⭐ El texto del ÍTEM que se señaló, cuando el pedido salió del 💬 de una tarjeta y no del
   * botón de la sección entera.
   *
   * Es la misma cuerda que el campo `cita` de las operaciones (`lib/canvas/citas-de-documento.ts`):
   * el modelo recibe el texto que la persona señaló y lo devuelve como identificador. Por eso
   * señalar en pantalla y escribir «cambia donde dice X» terminan en el MISMO mecanismo — no en
   * dos caminos que pueden divergir.
   */
  cita?: string;
  /** E4 P1: una FASE del cronograma, señalada con su «IA». La key es `fase:<id>`. */
  tipo?: "fase";
  /**
   * Etapa 6: la NOVEDAD de una reunión que se quiere llevar a esta sección («Cambiar con el chat» de la franja de
   * novedades). Viaja en el turno (en el mensaje, nunca en el prefijo cacheado) y, cuando el acuerdo se aplica, sus
   * hechos quedan usados.
   */
  novedad?: NovedadReferida;
}

/** Una novedad de una reunión, señalada desde la franja de arriba del documento. */
export interface NovedadReferida {
  /** El slug del documento («planning»). */
  pieza: string;
  /** El hecho que se muestra y los otros con la misma huella: se usan juntos. */
  hechoIds: string[];
  frase: string;
  cita: string;
  /** El título de la reunión. */
  reunion: string;
  /** AAAA-MM-DD. */
  fecha: string;
}

/** Etapa 6: la marca de una novedad dentro del bloque de alcance. */
export const MARCA_DE_NOVEDAD = "[NOVEDAD";

/** Una línea, sin saltos (un salto doble cerraría el bloque antes de tiempo) y con tope. */
function enUnaLinea(s: string, tope: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > tope ? `${t.slice(0, tope - 1).trimEnd()}…` : t;
}

/** Las líneas de la novedad, para el modelo. Van dentro del bloque: nunca una línea en blanco. */
function lineasDeLaNovedad(n: NovedadReferida): string {
  const ids = n.hechoIds.filter((id) => /^[A-Za-z0-9_-]+$/.test(id));
  if (!ids.length || !/^[a-z0-9-]+$/.test(n.pieza)) return "";
  return (
    `${MARCA_DE_NOVEDAD} ${n.pieza} ${ids.join(",")}]\n` +
    `Una reunión con el cliente («${enUnaLinea(n.reunion, 120)}», ${enUnaLinea(n.fecha, 10)}) dejó esto para esta sección: «${enUnaLinea(n.frase, 300)}». ` +
    `Lo que se dijo: «${enUnaLinea(n.cita, 400)}».\n` +
    "Propón cómo cambia la sección con esto; si no aplica, dilo. No copies la cita tal cual, no digas de dónde salió y no " +
    "pongas precios ni montos de lo que cobra Smarteam.\n"
  );
}

export const MARCA_DE_ALCANCE = "[SOBRE LA SECCIÓN";
/** E4 P1: la marca de una fase del cronograma. */
export const MARCA_DE_FASE = "[SOBRE LA FASE";
/** Las marcas que `mensajeSinAlcance` sabe sacar. */
export const MARCAS_DE_ALCANCE = [MARCA_DE_ALCANCE, MARCA_DE_FASE] as const;

/** El prefijo de la key de una fase señalada: `fase:<id>` (el id vivo, o `n:…` de una fase nueva). */
export const PREFIJO_DE_FASE = "fase:";

export function lineaDeAlcance(seccion: SeccionReferida | null): string {
  if (!seccion) return "";
  if (seccion.tipo === "fase") {
    return (
      `${MARCA_DE_FASE} «${seccion.label}» [${seccion.key.slice(PREFIJO_DE_FASE.length)}]]\n` +
      "La persona la señaló con «IA» en el Gantt: es de dónde vino el pedido, no un límite; si habla de otra fase, atiéndelo igual.\n\n"
    );
  }
  /* ⚠ La línea de la cita va DENTRO del bloque, antes de la línea en blanco que lo cierra: si
     quedara después, `mensajeSinAlcance` cortaría en el primer «\n\n» y el marcador se pintaría
     crudo arriba del mensaje de la persona — el bug que ya se vio en pantalla el 2026-08-22. */
  const cita = seccion.cita?.trim()
    ? `Señaló el punto que dice: «${seccion.cita.trim()}». Úsalo como \`cita\` para identificarlo.\n`
    : "";
  const novedad = seccion.novedad ? lineasDeLaNovedad(seccion.novedad) : "";
  return (
    `${MARCA_DE_ALCANCE} «${seccion.label}» (${seccion.key})]\n` +
    cita +
    novedad +
    "Es de dónde vino el pedido, no un límite: si lo que sigue habla de otra sección, atiéndelo igual.\n\n"
  );
}

/** Una novedad que viajó en un turno: de qué documento y qué hechos. */
export interface NovedadEnElTurno {
  pieza: string;
  hechoIds: string[];
}

/** Las novedades que lleva el texto de un turno (las marcas `[NOVEDAD pieza id,id]` de su bloque de alcance). */
export function novedadesDelTexto(texto: string): NovedadEnElTurno[] {
  if (!MARCAS_DE_ALCANCE.some((m) => texto.startsWith(m))) return [];
  const corte = texto.indexOf("\n\n");
  const bloque = corte === -1 ? texto : texto.slice(0, corte);
  const out: NovedadEnElTurno[] = [];
  for (const m of bloque.matchAll(/^\[NOVEDAD ([a-z0-9-]+) ([A-Za-z0-9_,-]+)\]$/gm)) {
    out.push({ pieza: m[1], hechoIds: m[2].split(",").filter(Boolean) });
  }
  return out;
}

/**
 * La frase y la cita de cada novedad que lleva el texto de un turno (la segunda línea de `lineasDeLaNovedad`): lo que el
 * chat leyó de una reunión. Con esto el turno arma las huellas de la frontera del documento (una línea del acuerdo que
 * copia la cita queda con «⚠ revisa…») y sabe si la novedad trae un monto. No se guarda nada nuevo: sale del texto.
 */
export function textosDeLasNovedades(texto: string): string[] {
  if (!MARCAS_DE_ALCANCE.some((m) => texto.startsWith(m))) return [];
  const corte = texto.indexOf("\n\n");
  const bloque = corte === -1 ? texto : texto.slice(0, corte);
  const out: string[] = [];
  for (const m of bloque.matchAll(/dejó esto para esta sección: «(.+)»\. Lo que se dijo: «(.+)»\.$/gm)) out.push(m[1], m[2]);
  return out;
}

/**
 * Las novedades que se usan al aplicar el acuerdo de `turnoId`: las que llevaron los mensajes de la persona desde el
 * último acuerdo aplicado hasta ese turno (el acuerdo acumula lo que se acordó y no se aplicó, así que una novedad dicha
 * dos turnos antes entra igual). Sin repetir hechos.
 */
export function novedadesPorAplicar(
  turnos: readonly { id: string; rol: string; texto: string; estado?: string | null }[],
  turnoId: string,
): NovedadEnElTurno[] {
  const hasta = turnos.findIndex((t) => t.id === turnoId);
  if (hasta < 0) return [];
  let desde = 0;
  for (let i = hasta - 1; i >= 0; i--) {
    if (turnos[i].estado === "aplicado") {
      desde = i + 1;
      break;
    }
  }
  const vistos = new Set<string>();
  const out: NovedadEnElTurno[] = [];
  for (const t of turnos.slice(desde, hasta)) {
    if (t.rol !== "CSE") continue;
    for (const n of novedadesDelTexto(t.texto)) {
      const nuevos = n.hechoIds.filter((id) => !vistos.has(`${n.pieza}|${id}`));
      nuevos.forEach((id) => vistos.add(`${n.pieza}|${id}`));
      if (nuevos.length) out.push({ pieza: n.pieza, hechoIds: nuevos });
    }
  }
  return out;
}

/**
 * El texto del CSE tal como lo escribió, sin la línea de alcance.
 *
 * ⚠ Se corta por la línea en blanco que cierra el bloque, no por el largo del texto: el marcador
 * tiene dos líneas y el mensaje puede empezar con lo que sea. Si el bloque no está, devuelve el
 * mensaje intacto — un turno viejo, o uno mandado sin alcance.
 */
export function mensajeSinAlcance(texto: string): string {
  if (!MARCAS_DE_ALCANCE.some((m) => texto.startsWith(m))) return texto;
  const corte = texto.indexOf("\n\n");
  return corte === -1 ? texto : texto.slice(corte + 2);
}
