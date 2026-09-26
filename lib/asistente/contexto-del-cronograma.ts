/**
 * lib/asistente/contexto-del-cronograma.ts — EL CONTEXTO DEL CHAT CUANDO HAY UNA PROPUESTA ABIERTA (E3 P4).
 *
 * PURO. Sin Prisma, sin red, sin React: lo lee la propuesta ya armada (`leerPropuestaParaElChat`) y
 * devuelve el texto que va al prefijo cacheado del turno (`contextoDeCronograma`, contexto.ts).
 *
 * ── POR QUÉ REEMPLAZA AL CRONOGRAMA DE HOY ───────────────────────────────────────────────────
 * Con una propuesta abierta, lo que el CSE tiene enfrente es la PROPUESTA (arriba del Gantt) y su
 * lista numerada. Si el chat viera solo el cronograma de hoy, no podría explicar «el 3», ni nombrar una
 * tarea que la propuesta crea. Así que van las dos cosas que ve la pantalla:
 *   · LA PROPUESTA: el cronograma como quedaría con lo marcado (`resumen.proyeccion`), con los ids de
 *     las fases (`n:…` las nuevas) y las tareas por semana con su identificador;
 *   · LOS CAMBIOS: la lista de la barra, con SUS números (`resumen.items` y `resumen.grupos`).
 * ⛔ Van SIN las REGLAS DURAS del modificador (son de «Pedir cambio con IA», no de la propuesta) y SIN
 * las notas de las tareas: son contenido, y el chat no las necesita para conversar sobre la estructura.
 *
 * ── EL TECHO, Y QUÉ SE RECORTA ───────────────────────────────────────────────────────────────
 * Una propuesta de «Regenerar todo» puede pasar el techo del prefijo (`TECHO_DEL_PREFIJO_CHARS`). Si
 * pasa, se recorta en dos niveles, y cada nivel lo dice con una línea «RECORTADO POR ESPACIO»:
 *   1. fuera los «antes → después» y los motivos (están en la barra);
 *   2. los títulos de las tareas se cortan a 32 caracteres con «…», con su identificador ENTERO.
 * ⛔ EL ÍNDICE NUNCA SE RECORTA: cada número de la barra aparece una vez, igual con o sin recorte. Sin
 * él, «deja el 3 como estaba» sería adivinar. Si aun así no entra, va igual y avisa (`excede`): cuesta
 * más caché, no falla. Ninguna fila sale.
 *
 * Determinista: las mismas entradas dan el mismo texto (sin la hora, sin la fase de la corrida).
 */
import { ADVERTENCIAS_SOBRE_LA_PROPUESTA } from "@/lib/timeline/capacidades";
import { fraseDelCierre, type EstadoDelCambio, type GrupoDeTareas, type ItemDeTarea, type ResumenDelBorrador } from "@/lib/timeline/borrador";
import { handlesSinChoque } from "@/lib/timeline/handle-de-tarea";
import type { PropuestaParaElChat } from "@/lib/timeline/propuesta-para-el-chat";
import { plural } from "@/lib/timeline/weeks";

/** Los estados como los nombra la pantalla. Se omite «pendiente»: es el caso mayoritario. */
function estadoCorto(status: string): string {
  if (status === "DONE") return "hecha";
  if (status === "IN_PROGRESS") return "en curso";
  if (status === "SUSPENDED") return "suspendida";
  return status.toLowerCase();
}

/**
 * ⭐ LO QUE EL MODELO NECESITA PARA NO PROMETER UN BORRADO QUE SE VA A RECHAZAR.
 *
 * El ejecutor rechaza `tarea.borrar` sobre lo que `isKept` protege: estado distinto de pendiente
 * **o** `source === "HUMAN"`. El estado ya se mostraba; la procedencia no — así que una tarea
 * pendiente cargada a mano se le veía idéntica a una pendiente escrita por la IA, y el chat
 * proponía borrarla para que el ejecutor la rechazara después. Peor todavía: las tareas que crea
 * el propio chat nacen `HUMAN`, o sea que el chat no podía deshacer lo que acababa de hacer, y no
 * tenía cómo saberlo antes de intentarlo.
 * E3 P4: vive acá (puro) y la usan los dos contextos del cronograma, con y sin propuesta.
 */
export function marcaDe(t: { status: string; source: string | null }): string {
  if (t.status && t.status !== "PENDING") return estadoCorto(t.status);
  return t.source === "HUMAN" ? "cargada a mano" : "";
}

/** A cuántos caracteres se corta un título en el nivel 2 del recorte (con «…»). */
export const LARGO_DEL_TITULO_RECORTADO = 32;

/** La línea de arriba cuando el chat PUEDE editar la propuesta. */
export const LINEA_DE_LA_PROPUESTA_EDITABLE =
  "Lo que acuerdes EDITA ESTA PROPUESTA, no el cronograma: el cronograma no cambia hasta que se aplique, y el cliente lo ve recién cuando se sube («Subir al cliente»).";

/** La línea de arriba cuando no, y nadie dijo por qué (no debería pasar: quien llama pasa el porqué). */
const LINEA_SIN_PERMISO =
  "Ahora no se puede cambiar esta propuesta desde el chat. Puedes conversarlo, pero no lo registres.";

/**
 * Por qué no se puede cambiar la propuesta mientras la IA trabaja sobre ella. Los otros casos de solo
 * lectura (una ilegible, una versión nueva, el borrador vacío) usan el contexto de hoy con su línea.
 */
export function lineaDeSoloLectura(porQue: "tareas-armando" | "recalculando"): string {
  const que = porQue === "tareas-armando" ? "ARMANDO LAS TAREAS DE ESTA PROPUESTA" : "RECALCULANDO TAREAS DE ESTA PROPUESTA";
  return (
    `⏳ LA IA ESTÁ ${que} (se ve arriba del Gantt). Mientras tanto no se puede cambiar ni aplicar: si te ` +
    "piden un cambio, dilo ANTES de armar la lista. Puedes conversarlo, pero no lo registres: pídelo cuando termine."
  );
}

export const RECORTE_NIVEL_1 =
  "RECORTADO POR ESPACIO: la lista de cambios va sin los «antes → después» ni los motivos (están en la barra).";
export const RECORTE_NIVEL_2 =
  `RECORTADO POR ESPACIO: los títulos de las tareas van cortados a ${LARGO_DEL_TITULO_RECORTADO} caracteres («…»); ` +
  "su identificador va entero.";

export interface EntradaDelContextoConPropuesta {
  proyecto: string;
  cliente: string;
  /** La propuesta con su resumen: sin resumen no hay nada que mostrar (quien llama usa el contexto de hoy). */
  propuesta: PropuestaParaElChat & { resumen: ResumenDelBorrador };
  /** El cierre fijado a mano (YYYY-MM-DD), o null. */
  cierreFijado: string | null;
  /** La línea «PARA REHACER TODO» (`lineaParaRehacerTodo`), tal cual. */
  paraRehacerTodo: string;
  puedeEditar: boolean;
  /** Sin `puedeEditar`: la línea que dice por qué. */
  porQue?: string | null;
}

export interface ContextoConPropuesta {
  texto: string;
  /** ref de la tarea (id de una viva o clave `t:` de una nueva) → el identificador que ve el modelo. */
  handles: Map<string, string>;
  nivel: 0 | 1 | 2;
  /** Ni con el nivel 2 entra en el techo: va igual (quien llama avisa en el log). */
  excede: boolean;
  medidas: { propuesta: number; indice: number; detalle: number; total: number };
}

type Nivel = 0 | 1 | 2;

const SIMBOLO: Record<EstadoDelCambio, string> = { aplica: "✓", excluido: "☐", choque: "⚠", "ya-esta": "=" };

function acortar(titulo: string): string {
  if (titulo.length <= LARGO_DEL_TITULO_RECORTADO) return titulo;
  return `${titulo.slice(0, LARGO_DEL_TITULO_RECORTADO - 1).trimEnd()}…`;
}

const fecha = (s: string | null | undefined): string | null => (s ? s.slice(0, 10) : null);

/**
 * La casilla del grupo como la pinta la barra (TareasDeLaPropuesta.tsx): cuenta solo las que se pueden
 * marcar, y una que espera el recálculo cuenta como marcada (E2c).
 */
function simboloDelGrupo(g: GrupoDeTareas): string {
  const marcables = g.tareas.filter((t) => t.seMarca);
  if (marcables.length === 0) return g.estado === "choque" ? "⚠" : g.estado === "ya-esta" ? "=" : "☐";
  const marcadas = marcables.filter((t) => t.estado === "aplica" || t.enEspera).length;
  if (marcadas === marcables.length) return "✓";
  return marcadas === 0 ? "☐" : "◐";
}

/** Los handles de todo lo que el chat puede nombrar: lo vivo, lo proyectado y lo que cambia. */
function handlesDeLaPropuesta(p: EntradaDelContextoConPropuesta["propuesta"]): Map<string, string> {
  const refs: string[] = [];
  for (const f of p.vivo.fases) for (const t of f.tareas ?? []) refs.push(t.id);
  for (const f of p.resumen.proyeccion.fases) for (const t of f.tareas) refs.push(t.clave);
  for (const g of p.resumen.grupos) for (const t of g.tareas) refs.push(t.ref);
  return handlesSinChoque(refs);
}

interface Render {
  texto: string;
  medidas: ContextoConPropuesta["medidas"];
}

function renderizar(d: EntradaDelContextoConPropuesta, handles: ReadonlyMap<string, string>, nivel: Nivel): Render {
  const p = d.propuesta;
  const r = p.resumen;
  const h = (ref: string) => handles.get(ref) ?? ref;
  const titulo = (s: string) => (nivel >= 2 ? acortar(s) : s);
  const lista = (items: string[]) => items.join(" · ");

  // ── 1-2 · De qué proyecto y qué se puede hacer con la propuesta ──
  const linea = d.puedeEditar ? LINEA_DE_LA_PROPUESTA_EDITABLE : d.porQue?.trim() || LINEA_SIN_PERMISO;
  const cabeza = [
    `PROYECTO: ${d.proyecto} — cliente ${d.cliente}`,
    "",
    `PROPUESTA ABIERTA ${p.desde}. ${linea}`,
    ...(r.bloqueo ? [`⚠ Hoy no se puede aplicar: ${r.bloqueo}`] : []),
    ...(nivel >= 1 ? [RECORTE_NIVEL_1] : []),
    ...(nivel >= 2 ? [RECORTE_NIVEL_2] : []),
  ];

  // ── 3 · LA PROPUESTA: cómo quedaría el cronograma con lo marcado ──
  const propuesta: string[] = [
    "LA PROPUESTA: el cronograma como quedaría si se aplica lo marcado. Cada fase trae su ID entre corchetes",
    "([n:…] = fase nueva de la propuesta) y, debajo, sus tareas por semana (S1, S2…) con su identificador",
    "entre corchetes: es lo que va en `taskId`. «+» = tarea nueva · «~» = cambia · «→» = llega de otra fase.",
    "Sin nada entre paréntesis = pendiente y escrita por la IA; las que dicen «hecha», «en curso»,",
    "«suspendida» o «cargada a mano» no se pueden quitar.",
  ];
  r.proyeccion.fases.forEach((f, i) => {
    const semanas = Math.max(f.durationWeeks, 1);
    const porSemana = Array.from({ length: semanas }, () => 0);
    let hechas = 0;
    for (const t of f.tareas) {
      if (t.weekIndex >= 0 && t.weekIndex < semanas) porSemana[t.weekIndex]++;
      if (t.status === "DONE") hechas++;
    }
    const vacias = porSemana.filter((n) => n === 0).length;
    const etiquetas = f.marca?.etiquetas.length ? ` · (${f.marca.etiquetas.join(", ")})` : "";
    propuesta.push(
      `${i + 1}. ${f.name} [${f.clave}] — ${f.durationWeeks} sem` +
        (f.activityType ? ` · ${f.activityType.toLowerCase()}` : "") +
        ` · ${plural(f.tareas.length, "tarea", "tareas")}` +
        (vacias > 0 ? ` — ${vacias} ${vacias === 1 ? "semana VACÍA" : "semanas VACÍAS"}` : "") +
        (hechas > 0 ? ` · ${hechas} hecha${hechas === 1 ? "" : "s"}` : "") +
        etiquetas,
    );
    const renglon = (t: (typeof f.tareas)[number]) => {
      const signo = t.id === null ? "+" : t.llega ? "→" : t.cambia ? "~" : "";
      const marca = marcaDe(t);
      return `${signo}${titulo(t.title)} [${h(t.clave)}]${marca ? ` (${marca})` : ""}`;
    };
    for (let w = 0; w < semanas; w++) {
      const suyas = f.tareas.filter((t) => t.weekIndex === w);
      propuesta.push(`   S${w + 1}: ${suyas.length === 0 ? "(vacía)" : lista(suyas.map(renglon))}`);
    }
    const fuera = f.tareas.filter((t) => t.weekIndex < 0 || t.weekIndex >= semanas);
    if (fuera.length > 0) propuesta.push(`   ⚠ fuera de rango: ${lista(fuera.map((t) => `${renglon(t)} (S${t.weekIndex + 1})`))}`);
  });
  if (r.proyeccion.fases.length === 0) propuesta.push("(sin fases)");

  // ── 4 · Las fechas, con lo marcado ──
  const anclaHoy = fecha(p.vivo.ancla);
  const ancla = fecha(r.proyeccion.ancla);
  const anchoHoy = r.cierreAntes.spanWeeks;
  const ancho = r.cierreDespues.spanWeeks;
  const fechas = [
    `Arranque: ${ancla ?? "SIN FECHA DE ARRANQUE"}${ancla !== anclaHoy ? ` (hoy ${anclaHoy ?? "sin fecha"})` : ""}`,
    `Cierre: ${fraseDelCierre(r, d.cierreFijado)}`,
    `Ancho de calendario: ${plural(ancho, "semana", "semanas")}${ancho !== anchoHoy ? ` (hoy ${anchoHoy})` : ""}`,
  ];

  // ── 5 · LOS CAMBIOS: la lista de la barra, con sus números ──
  const indice: string[] = [];
  const detalle: string[] = [];
  const cambios: string[] = [
    "LOS CAMBIOS CONTRA EL CRONOGRAMA DE HOY (los mismos números que la barra). ✓ = marcado · ☐ = desmarcado:",
    "queda como está hoy · ◐ = marcado en parte · ⚠ = no se aplica, y dice por qué · = = ya está así. Las tareas",
    "de cada fase van juntas en un número; debajo de cada uno, su detalle.",
  ];
  const numerado = (l: string) => {
    indice.push(l);
    cambios.push(l);
  };
  const debajo = (l: string) => {
    detalle.push(`   ${l}`);
    cambios.push(`   ${l}`);
  };
  const porClave = new Map((p.borrador?.cambios ?? []).map((c) => [c.clave, c]));
  const tareaViva = new Map(p.vivo.fases.flatMap((f) => (f.tareas ?? []).map((t) => [t.id, t] as const)));
  for (const it of r.items) {
    const c = porClave.get(it.clave);
    const id =
      c?.tipo === "fase-se-va" ? c.faseId : c?.tipo === "fase-nueva" && it.estado === "excluido" ? c.clave : null;
    const choque = it.estado === "choque" && it.aviso ? ` · ${it.aviso}` : "";
    numerado(`${it.numero}. ${SIMBOLO[it.estado]} ${it.titulo}${id ? ` [${id}]` : ""}${choque}`);
    if (nivel === 0) {
      if (it.motivo) debajo(`motivo: ${it.motivo}`);
      for (const f of it.detalle) debajo(`${f.etiqueta}: «${f.antes}» → «${f.despues}»`);
    }
    if (it.nota) debajo(it.nota);
    if (c?.tipo === "fase-se-va" && it.estado === "aplica") {
      const borrar = p.plan?.escrituras.fasesQueSeVan?.find((f) => f.id === c.faseId)?.borrar ?? [];
      const filas = borrar.flatMap((tid) => {
        const t = tareaViva.get(tid);
        return t ? [`S${t.weekIndex + 1} ${titulo(t.title)} [${h(t.id)}]`] : [];
      });
      if (filas.length > 0) debajo(`se van con la fase: ${lista(filas)}`);
    }
  }
  const fila = (t: ItemDeTarea, conSigno: boolean) =>
    `${conSigno ? `${t.signo} ` : ""}S${t.semana} ${titulo(t.titulo)} [${h(t.ref)}]`;
  for (const g of r.grupos) {
    const partes = [
      ...(g.nuevas > 0 ? [`+${g.nuevas} ${g.nuevas === 1 ? "nueva" : "nuevas"}`] : []),
      ...(g.seVan > 0 ? [`−${g.seVan} ${g.seVan === 1 ? "se va" : "se van"}`] : []),
      ...(g.cambian > 0 ? [`~${g.cambian} ${g.cambian === 1 ? "cambia" : "cambian"}`] : []),
    ];
    const extra = [
      ...(g.dependeDe !== null ? [`va con el cambio ${g.dependeDe}`] : []),
      ...(g.desfasada ? ["se recalculan"] : []),
      ...(g.aviso?.startsWith("⚠") ? [g.aviso] : []),
    ];
    numerado(
      `${g.numero}. ${simboloDelGrupo(g)} Tareas de «${g.nombre}»: ${partes.length > 0 ? lista(partes) : "ya está así"}` +
        extra.map((e) => ` · ${e}`).join(""),
    );
    const seVan = g.tareas.filter((t) => t.signo === "−" && t.estado === "aplica");
    if (seVan.length > 0) debajo(`se van: ${lista(seVan.map((t) => fila(t, false)))}`);
    if (nivel === 0) {
      const cambian = g.tareas.filter((t) => (t.signo === "~" || t.signo === "→") && t.estado === "aplica" && t.cambio);
      if (cambian.length > 0) debajo(`cambian: ${lista(cambian.map((t) => `${fila(t, false)} (${t.cambio})`))}`);
    }
    const desmarcadas = g.tareas.filter((t) => t.estado === "excluido" && !t.enEspera);
    if (desmarcadas.length > 0) debajo(`desmarcadas: ${lista(desmarcadas.map((t) => fila(t, true)))}`);
    const enEspera = g.tareas.filter((t) => t.enEspera);
    if (enEspera.length > 0) debajo(`se recalculan: ${lista(enEspera.map((t) => fila(t, true)))}`);
    const fuera = g.tareas.filter((t) => t.estado === "choque");
    if (fuera.length > 0) debajo(`quedan fuera: ${lista(fuera.map((t) => fila(t, true)))}`);
  }
  if (r.items.length === 0 && r.grupos.length === 0) cambios.push("(ningún cambio)");

  // ── 6-8 · Qué rehace todo, qué ve el cliente y qué hay que decir antes ──
  const cola = [
    d.paraRehacerTodo,
    "",
    /* Revisión de E3 (#8): el cliente lee solo lo que se SUBIÓ («Subir al cliente» congela la foto); aplicar
       no se lo muestra. */
    "Lo que pongas en `titulo`, `nombre` y `nota` lo ve el cliente cuando se suba el cronograma: claro, sin nombres del equipo ni jerga interna.",
    /* Solo si el chat puede editar la propuesta: las consecuencias son de editarla (mover MUDA, quitar
       una fase deja lo que tiene avance). Mientras no puede, prometerlas sería contar algo que todavía
       no pasa. */
    ...(d.puedeEditar
      ? ["", "CONSECUENCIAS QUE HAY QUE DECIR ANTES, no después:", ADVERTENCIAS_SOBRE_LA_PROPUESTA.map((a) => `- ${a.aviso}`).join("\n")]
      : []),
  ];

  const bloqueDeLaPropuesta = propuesta.join("\n");
  const texto = [...cabeza, "", bloqueDeLaPropuesta, "", ...fechas, "", ...cambios, "", ...cola].join("\n");
  const largo = (ls: string[]) => ls.reduce((n, l) => n + l.length + 1, 0);
  return {
    texto,
    medidas: { propuesta: bloqueDeLaPropuesta.length, indice: largo(indice), detalle: largo(detalle), total: texto.length },
  };
}

/**
 * El contexto del chat con una propuesta abierta, dentro del techo si se puede (ver el recorte arriba).
 * Los handles salen de TODAS las refs que el chat puede nombrar (lo vivo, lo proyectado y las tareas de
 * la lista): se alargan solo los que chocan (`handlesSinChoque`).
 */
export function armarContextoConPropuesta(d: EntradaDelContextoConPropuesta, o: { techo: number }): ContextoConPropuesta {
  const handles = handlesDeLaPropuesta(d.propuesta);
  let ultimo: Render | null = null;
  for (const nivel of [0, 1, 2] as const) {
    const r = renderizar(d, handles, nivel);
    if (r.texto.length <= o.techo) return { ...r, handles, nivel, excede: false };
    ultimo = r;
  }
  return { ...ultimo!, handles, nivel: 2, excede: true };
}
