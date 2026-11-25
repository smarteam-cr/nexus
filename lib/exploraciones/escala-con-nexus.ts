/**
 * lib/exploraciones/escala-con-nexus.ts — LA PÁGINA DE LA ESCALA EN PIEZAS, para «✨ Pedirle a Nexus» (23 nov, etapa 3 del
 * plan maestro de «Hablar con Nexus»; el contrato, lib/pedirle-a-nexus/contrato.ts). PURO y client-safe.
 *
 * Arma, desde la MISMA página que ve el cliente (`PaginaParaElCse`, el cálculo de /external/escala), la lista de lo que
 * se puede cambiar, con el nombre que tiene en la pantalla y lo que acepta:
 *   · el Resumen: el titular, el resumen debajo (o la bajada, si no hay), el problema principal, las etiquetas, el alcance y el tamaño, los puntos clave,
 *     el recorrido, cada equipo (quiénes son, lo que funciona, el reto principal, lo que lo causa, sus cifras y lo que
 *     falta), lo que falta validar, y un lugar para AGREGAR en cada lista que acepta una pieza nueva;
 *   · la página de un área: la descripción de «Resultado general», lo que dice la tarjeta de cada parte medida, los
 *     títulos, «Por dónde empezar», los casos y los riesgos.
 * Y, para cada pieza, la operación con que se escribe: la MISMA que usa la edición a mano (`resumenDeLaEscala`,
 * `textoDeLaPagina`, `textoDelRadar`, `descripcionDeLaEscala` de ./contenido.ts). No hay un segundo camino.
 *
 * Lo que la página no deja editar a mano (los niveles, lo que sale del Resumen en la página del área, la pérdida que validó
 * la empresa) tampoco está acá.
 *
 * Cada pieza dice su SECCIÓN con el nombre de lib/external/secciones-de-la-escala.ts, el mismo que manda el botón «✨ Mejorar
 * con IA» del encabezado de esa sección (24 nov): `piezasDeLaSeccion` da las que se le pasan al modelo.
 *
 * UN ÍTEM NUEVO SALE ENTERO (Elías, 25 nov: «agrega un ítem más» dejó un punto clave con solo su título). Las listas cuyo
 * ítem tiene varias partes (un punto clave: título, qué pasa y su equipo; un paso del recorrido: nombre, qué pasa y lo que
 * se traba) tienen un lugar para agregar COMPUESTO (`campos`): Nexus escribe un renglón por parte, con su nombre adelante,
 * el código lo lee (`leerLaPiezaNueva`) y lo que falta o no se entiende no llega. Se escribe con una sola operación, con
 * todas sus partes. Las demás listas (retos, lo que lo causa, quién es quién, lo que ya funciona, lo que falta validar, los
 * párrafos, las etiquetas) son de un solo texto: su ítem nuevo ya sale entero.
 */
import type { PiezaDelDocumento } from "@/lib/pedirle-a-nexus/contrato";
import type { Letra } from "@/lib/escala/documento/tipos";
import {
  BAJADA_DEL_RESUMEN,
  claveAtadaDelResumen,
  conclusionDelSubequipo,
  MAX_ETIQUETAS,
  MAX_LINEAS_DEL_MAPA,
  MAX_PARRAFOS_DE_LA_PORTADA,
  titularDelResumen,
  TOPE_A_MANO,
  TOPE_DE_LA_CIFRA,
  TOPE_DE_UN_NOMBRE,
  TOPE_DEL_TITULO_DEL_PUNTO,
  TOPE_DEL_TITULO_DEL_RECORRIDO,
  type CifraDeLaPagina,
  type ListaDeLaPagina,
  type PiezaDeLaPagina,
  type ResumenDeLaPagina,
} from "@/lib/external/pagina-del-resumen";
import {
  cejaDeLoQueCuesta,
  CLAVES,
  MAX_TEXTO_DE_LA_PAGINA,
  pieDelArea,
  quitadaDeLaPagina,
  textoDeLaPagina,
  textoDeLaPrioridad,
  tituloDeEmpezar,
  TITULOS_DEL_AREA,
  type TextosDeLaPagina,
} from "@/lib/external/textos-de-la-pagina";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import { esDeLaSeccion, SECCIONES_DEL_AREA as A, SECCIONES_DEL_RESUMEN as R, seccionDelEquipo } from "@/lib/external/secciones-de-la-escala";
import { MAX_TEXTO_DEL_RADAR, type Operacion, type TextoDelRadar } from "./contenido";
import { TOPE_DE_LA_DESCRIPCION_A_MANO } from "./descripcion-de-la-escala";
import { cifrasDeMas } from "./resumen-de-la-escala";
import { textoVigenteDelRadar } from "./escala-para-el-cliente";

/** Dónde se pide: el Resumen o la página de un área. Lo pone el botón y lo verifica el servidor. */
export type LugarEnLaEscala = { pagina: "resumen" } | { pagina: "area"; areaId: string };

/** Cómo se escribe una pieza: la operación de la edición a mano. */
export type ComoSeEscribe =
  | { via: "resumen"; clave: string }
  /** Un ítem nuevo con varias partes (25 nov): la clave de agregar de su lista y los equipos que puede nombrar. */
  | { via: "nuevo"; clave: string; tipo: "punto" | "etapa"; areas: readonly { id: string; nombre: string }[] }
  | { via: "texto"; clave: string; original: string }
  | { via: "radar"; dimensionId: string; nivel: Letra }
  | { via: "descripcion"; areaId: string };

export interface PiezaDeLaEscala extends PiezaDelDocumento {
  escribe: ComoSeEscribe;
  /** Un lugar para agregar un ítem de varias partes (25 nov): un renglón por parte, con su nombre adelante. */
  campos?: readonly CampoDeLaPiezaNueva[];
  /**
   * Las citas de las reuniones que la sostienen (solo para el código: al modelo no le llegan). Con ellas la cifra grande
   * puede tomar la de una cifra de un equipo, y su cita viaja con ella (25 nov, `fuenteDeLaCifraGrande`).
   */
  citas?: readonly { texto: string; hablante?: string }[];
}

/** Una parte de un ítem nuevo: su nombre (el que va adelante del renglón), su largo y, si se elige de una lista, las opciones. */
export interface CampoDeLaPiezaNueva {
  nombre: string;
  tope: number;
  opcional?: boolean;
  /** Se elige de estas (los equipos de la página); «Toda la empresa» o nada la deja sin equipo. */
  opciones?: readonly string[];
}

/** El nombre del lugar, para el chip y el historial: «Resumen» o el nombre del área. */
export function nombreDelLugar(lugar: LugarEnLaEscala, areas: readonly { id: string; nombre: string }[]): string {
  return lugar.pagina === "resumen" ? "Resumen" : (areas.find((a) => a.id === lugar.areaId)?.nombre ?? "Área");
}

type Opciones = { tope?: number; quitable?: boolean; noLaVeElCliente?: boolean };

/** Una pieza del Resumen que guarda el agente (`resumenDeLaEscala`). */
function delResumen(clave: string, valor: string | null, nombre: string, seccion: string, p: Pick<PiezaDeLaPagina, "mano" | "citas"> | null, o: Opciones = {}): PiezaDeLaEscala {
  return {
    clave: `r/${clave}`,
    nombre,
    seccion,
    valor,
    tope: o.tope ?? TOPE_A_MANO,
    agregar: valor === null,
    quitable: !!o.quitable,
    aMano: !!p?.mano,
    conCita: (p?.citas?.length ?? 0) > 0,
    escribe: { via: "resumen", clave },
    ...(o.noLaVeElCliente ? { noLaVeElCliente: true } : {}),
    ...(p?.citas?.length ? { citas: p.citas } : {}),
  };
}

/** Un texto fijo de la página (`textoDeLaPagina`): el de siempre, o el cambiado para esta empresa. */
function fijo(clave: string, original: string, nombre: string, seccion: string, textos: TextosDeLaPagina | null | undefined, o: Opciones = {}): PiezaDeLaEscala {
  return {
    clave: `t/${clave}`,
    nombre,
    seccion,
    valor: textoDeLaPagina(textos, clave, original),
    tope: o.tope ?? MAX_TEXTO_DE_LA_PAGINA,
    agregar: false,
    quitable: !!o.quitable,
    aMano: textos?.[clave] !== undefined,
    conCita: false,
    escribe: { via: "texto", clave, original },
  };
}

/** Las piezas de una lista y su lugar para agregar. */
function deLaLista(l: ListaDeLaPagina, nombre: string, seccion: string, o: { nueva?: boolean; quitable?: boolean; tope?: number; nombreNueva?: string } = {}): PiezaDeLaEscala[] {
  const r = l.piezas.map((p) => delResumen(p.clave, p.texto, nombre, seccion, p, { quitable: o.quitable ?? true, tope: o.tope }));
  if (l.nueva && o.nueva !== false) r.push(delResumen(l.nueva, null, o.nombreNueva ?? `${nombre} (nueva)`, seccion, null, { tope: o.tope }));
  return r;
}

/**
 * Las partes de una cifra: el número, qué es y su nota. «Qué significa» no se quita: en la edición a mano, quitarlo quita la
 * cifra entera. Una cifra que el cliente no ve (su cita no la sostiene) va marcada.
 */
function deLaCifra(c: CifraDeLaPagina, seccion: string, que: string): PiezaDeLaEscala[] {
  const oculta = { noLaVeElCliente: !!c.noSale };
  const r = [
    delResumen(`${c.clave}:cifra`, c.cifra, `${que}: la cifra`, seccion, c, { tope: TOPE_DE_LA_CIFRA, ...oculta }),
    delResumen(`${c.clave}:texto`, c.texto, `${que}: qué significa ${c.cifra}`, seccion, c, oculta),
  ];
  if (c.conNota) r.push(delResumen(`${c.clave}:nota`, c.nota, `${que}: su base o lo que falta validar`, seccion, c, { quitable: !!c.nota, ...oculta }));
  return r;
}

/** ¿Es la cifra grande de al lado del problema principal (el tamaño del negocio), o su lugar para escribirla? */
export const esLaCifraGrande = (clavePieza: string): boolean => /^r\/negocio:tamano:[\w-]+$/.test(clavePieza);

/** La pieza del número de una cifra de un equipo (`op:<área>:cifra:<id>:cifra`): su clave sin el campo. */
const NUMERO_DE_UNA_CIFRA = /^r\/(op:[\w-]+:cifra:[\w-]+):cifra$/;
/**
 * Los números de un texto: el punto o la coma de los miles fuera («1.000» es 1000), el decimal adentro («1,5» es 1.5, nunca
 * 15: revisión del 25 nov).
 */
const numerosDe = (t: string) =>
  new Set([...t.replace(/(\d)[.,](?=\d{3}(?!\d))/g, "$1").matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0].replace(",", ".")));

/** De dónde sale la cifra grande cuando Nexus la toma de una cifra de un equipo. `clave`: la de esa cifra en el Resumen. */
export interface FuenteDeLaCifra {
  clave: string;
  nombre: string;
  /** Su primera cita, para verla en la propuesta: «…» — quién. */
  cita: string;
}

/**
 * LA CIFRA GRANDE CON SU CITA (25 nov, Elías: «solo en el chat»). Al replantear el problema principal, Nexus puede proponer
 * como cifra grande una cifra de un equipo que ya está en la página: si el texto nuevo tiene EXACTAMENTE los números de una
 * cifra de un equipo que el cliente ve (pasó la verificación del Resumen: su cita la sostiene), y esa cita dice todos los
 * números del texto nuevo, la cifra grande sale de ahí y su cita viaja con ella (al aplicar: `citasDe`). Si no, null: el
 * cambio va como siempre (una cifra sin cita que la sostenga no sale al cliente; adentro sale marcada). Lo decide el código,
 * no el modelo, al proponer y otra vez al aplicar.
 */
export function fuenteDeLaCifraGrande(piezas: readonly PiezaDeLaEscala[], despues: string | null): FuenteDeLaCifra | null {
  const nuevos = numerosDe(despues ?? "");
  if (!despues || !nuevos.size) return null;
  for (const p of piezas) {
    const m = NUMERO_DE_UNA_CIFRA.exec(p.clave);
    if (!m || !p.valor || p.noLaVeElCliente || !p.citas?.length) continue;
    const suyos = numerosDe(p.valor);
    if (suyos.size !== nuevos.size || [...suyos].some((n) => !nuevos.has(n))) continue;
    if (cifrasDeMas(despues, p.citas.map((c) => c.texto).join(" ")).length) continue;
    const c = p.citas[0];
    return { clave: m[1], nombre: p.nombre.replace(/: la cifra$/, ""), cita: `«${c.texto}»${c.hablante ? ` — ${c.hablante}` : ""}` };
  }
  return null;
}

/** Lo que se lee de un renglón: «Título: …». Sin tildes y en minúsculas, para comparar el nombre. */
const sinTildes = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** El largo de un ítem nuevo entero: sus partes, sus nombres y los saltos de renglón. */
const topeDeLosCampos = (cs: readonly CampoDeLaPiezaNueva[]) => cs.reduce((n, c) => n + c.tope + c.nombre.length + 3, 0);

/** Un lugar para agregar un ítem entero (25 nov). */
function nuevoEntero(clave: string, tipo: "punto" | "etapa", nombre: string, seccion: string, campos: CampoDeLaPiezaNueva[], areas: readonly { id: string; nombre: string }[]): PiezaDeLaEscala {
  return {
    clave: `r/${clave}`,
    nombre,
    seccion,
    valor: null,
    tope: topeDeLosCampos(campos),
    agregar: true,
    quitable: false,
    aMano: false,
    conCita: false,
    escribe: { via: "nuevo", clave, tipo, areas },
    campos,
  };
}

/**
 * Lee un ítem nuevo entero (25 nov): un renglón por parte, con su nombre adelante («Título: …»). Devuelve el valor de cada
 * parte, en su orden («» si una opcional no vino), o por qué no se puede: falta una parte, pasa de su largo o nombra un
 * equipo que no está en la página. Un renglón sin nombre conocido no se adivina.
 */
export function leerLaPiezaNueva(campos: readonly CampoDeLaPiezaNueva[], texto: string): { ok: true; valores: string[] } | { ok: false; motivo: string } {
  const valores = campos.map(() => "");
  // El renglón que sigue sin nombre adelante sigue la parte de arriba (revisión del 25 nov: el modelo a veces parte «Qué
  // pasa» en dos renglones). Las negritas y las comillas de Markdown alrededor del nombre no cuentan («**Título:**»).
  let ultima = -1;
  for (const crudo of texto.split(/\r?\n/)) {
    const renglon = crudo.replace(/[*_`]+/g, "");
    if (!renglon.trim()) continue;
    const m = /^\s*[-•]?\s*([^:]{2,60}):\s*(.*)$/.exec(renglon);
    const i = m ? campos.findIndex((c) => sinTildes(c.nombre) === sinTildes(m[1])) : -1;
    // «Dueño: Ana» es una parte que no existe (no se adivina); «Esto pasa sobre todo en marzo: …» sigue la de arriba.
    const pareceUnNombre = !!m && m[1].trim().split(/\s+/).length <= 3;
    if (i < 0) {
      if (ultima >= 0 && !pareceUnNombre) {
        valores[ultima] = `${valores[ultima]} ${renglon.trim()}`.trim();
        continue;
      }
      return {
        ok: false,
        motivo: m
          ? `«${m[1].trim()}» no es una parte de este ítem (${campos.map((c) => `«${c.nombre}»`).join(", ")}).`
          : `Un ítem nuevo va con un renglón por parte (${campos.map((c) => `«${c.nombre}: …»`).join(", ")}).`,
      };
    }
    valores[i] = m![2].replace(/[ \t]+/g, " ").trim();
    ultima = i;
  }
  for (let i = 0; i < campos.length; i++) {
    const c = campos[i];
    const v = valores[i];
    if (!v) {
      if (c.opcional) continue;
      return { ok: false, motivo: `Le falta «${c.nombre}»: un ítem nuevo va entero.` };
    }
    if (v.length > c.tope) return { ok: false, motivo: `«${c.nombre}» pasa de ${c.tope} caracteres.` };
    if (c.opciones) {
      if (/^(toda la empresa|ninguno|ninguna|sin equipo|-)$/.test(sinTildes(v))) {
        valores[i] = "";
        continue;
      }
      // El nombre exacto, o el ÚNICO equipo que lo contiene («Ventas» por «Ventas y Marketing»).
      const exacta = c.opciones.find((o) => sinTildes(o) === sinTildes(v));
      const parecidas = c.opciones.filter((o) => sinTildes(o).includes(sinTildes(v)) || sinTildes(v).includes(sinTildes(o)));
      const elegida = exacta ?? (parecidas.length === 1 ? parecidas[0] : undefined);
      if (!elegida) return { ok: false, motivo: `«${v}» no es un equipo de esta página (${c.opciones.join(", ")}).` };
      valores[i] = elegida;
    }
  }
  return { ok: true, valores };
}

/**
 * Las cifras de «Lo que hicimos» que escribe un texto (25 nov: «reuniones que trabajamos juntos, pon 12» terminó en un
 * párrafo con «parte de 12 reuniones de trabajo conjunto»): las reuniones o sesiones CON Smarteam, el tiempo de
 * conversación y las personas con las que se habló. Un dato del cliente no lo es (revisión del 25 nov: «Ventas hace 3
 * reuniones de trabajo a la semana», «Hoy 4 personas de tu equipo capturan…»).
 */
const DE_LO_QUE_HICIMOS =
  /\d[\d.,]*\s+(reuni[oó]n(es)?|sesi[oó]n(es)?)\s+(de\s+trabajo\s+)?(juntos|conjunt[oa]s?|con\s+(ustedes|tu\s+equipo|nosotros|smarteam))|\d[\d.,]*\s+sesi[oó]n(es)?\s+de\s+(exploraci[oó]n|diagn[oó]stico)|\d[\d.,]*\s*(h|horas?|min|minutos)\s+de\s+conversaci[oó]n|(hablamos|conversamos|trabajamos)\s+con\s+\d[\d.,]*\s+personas?/gi;
export const cifrasDeLoQueHicimos = (texto: string): string[] => [...texto.matchAll(DE_LO_QUE_HICIMOS)].map((m) => m[0].toLowerCase().replace(/\s+/g, " "));
export const hablaDeLoQueHicimos = (texto: string): boolean => cifrasDeLoQueHicimos(texto).length > 0;

/** Un cambio como lo revisa `revisarLoDeLaPagina`. */
interface CambioParaRevisar {
  clave: string;
  nombre: string;
  antes: string | null;
  despues: string | null;
  desde?: { nombre: string; cita: string };
  sinCita?: true;
}

const comoTitulo = (t: string) => sinTildes(t).replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * ¿Ya está en la página un ítem con ese título (un punto clave) o ese nombre (un paso)? Revisión del 25 nov: aplicar dos
 * veces el mismo ítem nuevo lo agregaba dos veces.
 */
export function yaEstaEnLaPagina(piezas: readonly PiezaDeLaEscala[], p: PiezaDeLaEscala, despues: string | null): boolean {
  if (!p.campos || !despues || p.escribe.via !== "nuevo") return false;
  const l = leerLaPiezaNueva(p.campos, despues);
  if (!l.ok) return false;
  const nuevo = comoTitulo(l.valores[0]);
  const de = p.escribe.tipo === "punto" ? /^r\/punto:[\w-]+:titulo$/ : /^r\/etapa:[\w-]+:nombre$/;
  return piezas.some((x) => de.test(x.clave) && !!x.valor && comoTitulo(x.valor) === nuevo);
}

/**
 * Lo que la revisión general (lib/pedirle-a-nexus/veracidad.ts) no sabe de esta página (25 nov). Saca de la propuesta, con
 * su porqué: un ítem nuevo de varias partes que no viene entero o no se entiende (`leerLaPiezaNueva`), uno que ya está en la
 * página, y una cifra de «Lo que hicimos» que no estaba en esa pieza (Elías: solo se cambian a mano). Y marca la cifra grande:
 * de qué cifra de un equipo sale, con su cita, o que ninguna cita la sostiene. `pagina`: todas las piezas (la cifra de un
 * equipo puede ser de otra sección).
 */
export function revisarLoDeLaPagina<C extends CambioParaRevisar>(
  r: { cambios: C[]; descartados: { clave: string | null; nombre: string | null; texto: string; motivo: string }[] },
  piezas: readonly PiezaDeLaEscala[],
  pagina: readonly PiezaDeLaEscala[] = piezas,
): void {
  const porClave = new Map(piezas.map((p) => [p.clave, p]));
  r.cambios = r.cambios.filter((c) => {
    const p = porClave.get(c.clave);
    const fuera = (motivo: string) => {
      r.descartados.push({ clave: c.clave, nombre: c.nombre, texto: c.despues ?? "(quitarla)", motivo });
      return false;
    };
    if (p?.campos && c.despues) {
      const l = leerLaPiezaNueva(p.campos, c.despues);
      if (!l.ok) return fuera(l.motivo);
      if (yaEstaEnLaPagina(pagina, p, c.despues)) return fuera("Ya hay uno igual en la página.");
    }
    const yaEstaban = new Set(cifrasDeLoQueHicimos(c.antes ?? ""));
    if (c.despues && cifrasDeLoQueHicimos(c.despues).some((x) => !yaEstaban.has(x)))
      return fuera("Las cifras de «Lo que hicimos» (reuniones, tiempo, personas) se cambian a mano: haz clic en ellas, arriba del Resumen.");
    return true;
  });
  for (const c of r.cambios) {
    const p = porClave.get(c.clave);
    if (!p || !esLaCifraGrande(c.clave) || !c.despues) continue;
    const cita = citaDeLaCifraGrande(p, pagina, c.despues);
    if (cita.tipo === "de-un-equipo") c.desde = { nombre: cita.fuente.nombre, cita: cita.fuente.cita };
    else if (cita.tipo === "ninguna") c.sinCita = true;
  }
}

/**
 * Con qué cita queda la cifra grande escrita así (segunda revisión del 25 nov): la SUYA, si su cita ya dice todos sus
 * números («Unas 620 personas» sobre «son 620 personas»: no se marcaba «sin cita» por error); la de una cifra de un equipo
 * (`fuenteDeLaCifraGrande`); ninguna, si tiene un número que ninguna cita dice; o no hace falta (sin números).
 */
export function citaDeLaCifraGrande(
  p: PiezaDeLaEscala,
  pagina: readonly PiezaDeLaEscala[],
  despues: string,
): { tipo: "suya" } | { tipo: "de-un-equipo"; fuente: FuenteDeLaCifra } | { tipo: "ninguna" } | { tipo: "sin-numeros" } {
  if (!/\d/.test(despues)) return { tipo: "sin-numeros" };
  if (p.citas?.length && !cifrasDeMas(despues, p.citas.map((c) => c.texto).join(" ")).length) return { tipo: "suya" };
  const fuente = fuenteDeLaCifraGrande(pagina, despues);
  return fuente ? { tipo: "de-un-equipo", fuente } : { tipo: "ninguna" };
}

/**
 * La operación de un cambio, y para la cifra grande que sale de una cifra de un equipo, con la cita de esa cifra
 * (`citasDe`). Al aplicar, contra la página de ahora: lo que mande el navegador no cuenta.
 */
export function operacionConSuCita(p: PiezaDeLaEscala, pagina: readonly PiezaDeLaEscala[], despues: string | null): Operacion {
  const op = operacionDelCambio(p, despues);
  if (op.op !== "resumenDeLaEscala" || !despues || !esLaCifraGrande(p.clave)) return op;
  const cita = citaDeLaCifraGrande(p, pagina, despues);
  return cita.tipo === "de-un-equipo" ? { ...op, citasDe: cita.fuente.clave } : op;
}

/**
 * ¿Es un texto de «Lo que hicimos» (las reuniones, el tiempo, las personas, las áreas y sus rótulos)? Elías, 25 nov: esas
 * cifras no las cambia la IA, solo una persona a mano; escritas a mano, la página interna las marca «Lo escribió tu equipo».
 */
export const esDeLoQueHicimos = (claveDelTexto: string): boolean => claveDelTexto.startsWith(CLAVES.delResumen("hicimos."));

/** Las piezas del Resumen, en el orden de la página. */
export function piezasDelResumen(res: ResumenDeLaPagina, textos: TextosDeLaPagina | null | undefined): PiezaDeLaEscala[] {
  // Sin Resumen armado no hay nada que mejorar con Nexus (ni versión a la que volver): primero se arma.
  if (!res.at) return [];
  const out: PiezaDeLaEscala[] = [];
  const parte = (tipo: string): ListaDeLaPagina => res.negocio?.find((p) => p.tipo === tipo)?.lista ?? { piezas: [], nueva: null };
  // El título es el nombre del entregable (24 nov, «Diagnóstico de rendimiento»), como lo pinta la página.
  const titular = res.hicimos ? titularDelResumen(textos) : null;
  if (titular) {
    const p = fijo(titular.clave, titular.original, "El título (arriba de todo)", R.arriba, textos);
    out.push({ ...p, valor: titular.valor });
  }
  // El resumen debajo del título (24 nov); sin él, la página muestra la bajada de siempre.
  const portada = parte("portada");
  if (portada.piezas.length)
    out.push(...deLaLista({ piezas: portada.piezas, nueva: portada.piezas.length < MAX_PARRAFOS_DE_LA_PORTADA ? portada.nueva : null }, "Un párrafo del resumen, debajo del título", R.arriba));
  else {
    out.push(fijo(claveAtadaDelResumen("bajada", BAJADA_DEL_RESUMEN), BAJADA_DEL_RESUMEN, "La bajada, debajo del titular", R.arriba, textos));
    if (portada.nueva) out.push(delResumen(portada.nueva, null, "El resumen, debajo del título (uno o dos párrafos)", R.arriba, null));
  }

  const tesis = parte("tesis");
  const enElProblema = R.problema;
  // La tesis es obligatoria para publicar: se cambia, no se quita.
  out.push(...deLaLista({ piezas: tesis.piezas.slice(0, 1), nueva: tesis.piezas.length ? null : tesis.nueva }, "El problema principal (la tesis)", enElProblema, { quitable: false }));
  const etiquetas = parte("etiquetas");
  out.push(...deLaLista(etiquetas, "Una etiqueta del negocio", enElProblema, { nueva: etiquetas.piezas.length < MAX_ETIQUETAS, tope: TOPE_DE_UN_NOMBRE }));
  const abarca = parte("abarca");
  const fuera = parte("fuera");
  out.push(...deLaLista(abarca, "Qué abarca este diagnóstico", R.arriba, { nueva: !abarca.piezas.length }));
  out.push(...deLaLista(fuera, "Qué queda fuera", R.arriba, { nueva: !fuera.piezas.length }));
  if (res.tamano) {
    out.push(
      delResumen(res.tamano.clave, [res.tamano.valor, res.tamano.rotulo].filter(Boolean).join(" "), "El tamaño del negocio (número y unidad)", enElProblema, { citas: res.tamano.citas }, {
        quitable: true,
        noLaVeElCliente: !!res.tamano.noSale,
      }),
    );
  } else if (parte("tamano").nueva) {
    out.push(delResumen(parte("tamano").nueva!, null, "El tamaño del negocio («500 clientes activos»)", enElProblema, null));
  }

  const puntos = res.puntos ?? [];
  if (puntos.length || res.puntoNuevo) out.push(fijo(CLAVES.delResumen("titulo.puntos"), "Lo más crítico hoy.", "Título de los puntos clave", R.puntos, textos));
  puntos.forEach((p, i) => {
    // Quitar el título quita el punto entero (como «Quitar este punto» en la página); lo que explica se cambia, no se quita.
    out.push(delResumen(`${p.clave}:titulo`, p.titulo, `Título del punto clave ${i + 1}`, R.puntos, p, { tope: TOPE_DEL_TITULO_DEL_PUNTO, quitable: true }));
    out.push(delResumen(`${p.clave}:texto`, p.texto || null, `Qué explica el punto clave ${i + 1} («${p.titulo}»)`, R.puntos, p));
  });
  // Un punto nuevo sale entero (25 nov): su título, qué pasa y qué consecuencia tiene, y su equipo.
  const equipos = res.areas.map((a) => ({ id: a.areaId, nombre: a.nombre }));
  if (res.puntoNuevo)
    out.push(
      nuevoEntero(
        res.puntoNuevo,
        "punto",
        "Un punto clave nuevo, entero",
        R.puntos,
        [
          { nombre: "Título", tope: TOPE_DEL_TITULO_DEL_PUNTO },
          { nombre: "Qué pasa", tope: TOPE_A_MANO },
          ...(equipos.length ? [{ nombre: "Equipo", tope: TOPE_DE_UN_NOMBRE, opcional: true, opciones: equipos.map((e) => e.nombre) }] : []),
        ],
        equipos,
      ),
    );

  if (res.claveDelTituloDelRecorrido)
    out.push(
      delResumen(res.claveDelTituloDelRecorrido, res.tituloDelRecorrido ?? "Cómo pasa un cliente por tus áreas.", "Título del recorrido", R.operacion, null, { tope: TOPE_DEL_TITULO_DEL_RECORRIDO }),
    );
  for (const e of res.recorrido ?? []) {
    const que = e.continuo ? "el paso que acompaña" : "el paso";
    out.push(delResumen(`${e.clave}:nombre`, e.nombre, `Nombre de ${que} «${e.nombre}»`, R.operacion, e, { tope: TOPE_DE_UN_NOMBRE }));
    out.push(delResumen(`${e.clave}:texto`, e.texto || null, `El detalle de «${e.nombre}»`, R.operacion, e));
    out.push(delResumen(`${e.clave}:friccion`, e.friccion, `Lo que se traba en «${e.nombre}»`, R.operacion, e, { quitable: true }));
  }
  // Un paso nuevo sale entero (25 nov): su nombre, qué pasa ahí y, si se sabe, lo que se traba.
  if (res.etapaNueva)
    out.push(
      nuevoEntero(
        res.etapaNueva,
        "etapa",
        "Un paso nuevo del recorrido, entero",
        R.operacion,
        [
          { nombre: "Paso", tope: TOPE_DE_UN_NOMBRE },
          { nombre: "Qué pasa", tope: TOPE_A_MANO },
          { nombre: "Lo que se traba", tope: TOPE_A_MANO, opcional: true },
        ],
        [],
      ),
    );

  // Quién es quién (24 nov), arriba de las filas de los equipos: la única parte con nombres.
  const quienes = parte("quienes");
  // Va en «Equipos y hallazgos»: sin ningún equipo en la página, esa sección no sale (y no hay dónde verlo).
  if (res.tarjetas.length && (quienes.piezas.length || quienes.nueva))
    out.push(...deLaLista({ piezas: quienes.piezas, nueva: quienes.piezas.length < MAX_LINEAS_DEL_MAPA ? quienes.nueva : null }, "Una línea de quién es quién («Marketing: Catalina y Verónica»)", R.equipos));
  for (const t of res.tarjetas) {
    if (t.porExplorar) continue;
    for (const x of t.subequipos) {
      const sec = seccionDelEquipo(x.nombre);
      const enDinero = x.costo !== undefined;
      if (x.claveDelNombre) out.push(delResumen(x.claveDelNombre, x.nombre, `Nombre del equipo «${x.nombre}»`, sec, null, { tope: TOPE_DE_UN_NOMBRE }));
      if (x.costo && !x.costo.dePerdida) out.push(...deLaCifra(x.costo, sec, `Cuánto le cuesta a ${x.nombre}`));
      out.push(...deLaLista(x.frena, `El reto principal de ${x.nombre}`, sec, { nueva: !x.frena.piezas.length }));
      out.push(...deLaLista(x.retos, enDinero ? `Lo que causa el reto de ${x.nombre}` : `Un reto de ${x.nombre}`, sec));
      out.push(...deLaLista(x.organizacion, `Quiénes son o qué hacen en ${x.nombre}`, sec));
      out.push(...deLaLista(x.bien, `Lo que ya funciona en ${x.nombre}`, sec));
      x.cifras.forEach((c, i) => out.push(...deLaCifra(c, sec, `Cifra ${i + 1} de ${x.nombre}`)));
      if (x.cifraNueva) out.push(delResumen(x.cifraNueva, null, `Una cifra nueva de ${x.nombre}`, sec, null, { tope: TOPE_DE_LA_CIFRA }));
      if (x.claveDeLaFalta) out.push(delResumen(x.claveDeLaFalta, x.falta, enDinero ? `Qué falta para saber cuánto le cuesta a ${x.nombre}` : `Qué dato falta de ${x.nombre}`, sec, null, { quitable: !!x.falta }));
    }
  }

  for (const p of res.pendientes) if (p.clave) out.push(delResumen(p.clave, p.texto, "Lo que falta validar", R.falta, p, { quitable: true }));
  if (res.pendienteNuevo) out.push(delResumen(res.pendienteNuevo, null, "Algo nuevo por validar", R.falta, null));
  // Lo que no se edita a mano en la página (formato 1: datos rojos y hallazgos sueltos) tampoco se pide acá.
  return out;
}

/** Lo que la página del área necesita además de su resultado: lo escrito por el equipo y lo que la página arma sola. */
export interface EscritoDelArea {
  textos: TextosDeLaPagina | null | undefined;
  textosDelRadar: Record<string, TextoDelRadar> | null | undefined;
  /** La descripción guardada del área (null: la de respaldo, sin IA). */
  descripcion: { origen: "agente" | "mano" | "respaldo" } | null;
  /** El detalle de cada parte (`detalles[id]`): lo que dice su tarjeta cuando nadie lo cambió y qué priorizar. */
  detalle: (dimensionId: string) => { impacto: string | null; siguiente: { nombre: string; prioridad: string } | null } | null;
  /** Si la página muestra «Lo que más le cuesta» (sale del Resumen: se cambia allá; aquí solo su ceja). */
  conLoQueCuesta: boolean;
  /** Cuándo se midió (el pie de la página). */
  fecha: string | null;
}

/**
 * Las piezas de la página de un área, en el orden de la página: TODO lo que hoy se edita a mano en ella (23 nov, la
 * coordinadora: «Mejorar con IA» cubre las subpáginas igual que el Resumen). Lo único que no entra: quitar un caso entero
 * (su botón usa otra clave que su título; se quita a mano) y lo que sale del Resumen («Lo que más le cuesta», que se cambia
 * en el Resumen).
 */
export function piezasDelArea(r: ResultadoDelTest, e: EscritoDelArea): PiezaDeLaEscala[] {
  const area = r.areaId;
  const out: PiezaDeLaEscala[] = [];
  out.push({
    clave: `desc/${area}`,
    nombre: "Descripción de «Resultado general»",
    seccion: A.resultado,
    valor: r.sintesis || null,
    tope: TOPE_DE_LA_DESCRIPCION_A_MANO,
    agregar: false,
    quitable: e.descripcion?.origen === "mano",
    aMano: e.descripcion?.origen === "mano",
    conCita: false,
    escribe: { via: "descripcion", areaId: area },
  });
  const titulo = (k: keyof typeof TITULOS_DEL_AREA, seccion: string) => fijo(CLAVES.delArea(area, k), TITULOS_DEL_AREA[k].texto, TITULOS_DEL_AREA[k].nombre, seccion, e.textos);
  // La escalera sale solo con un nivel (como en la página: ResultadoDelTestVista); el radar, con algo medido.
  if (r.preguntadas > 0 && r.nivel) out.push(titulo("titulo.escalera", A.escalera));
  if (r.preguntadas > 0) out.push(titulo("titulo.radar", A.radar));
  for (const d of r.dimensiones) {
    if (!d.preguntada || !d.nivel) continue;
    const escrito = textoVigenteDelRadar(e.textosDelRadar ?? undefined, d);
    const valor = escrito ?? e.detalle(d.id)?.impacto ?? null;
    if (!valor) continue;
    out.push({
      clave: `radar/${d.id}`,
      nombre: `Lo que dice la tarjeta de ${d.nombre}`,
      seccion: A.radar,
      valor,
      tope: MAX_TEXTO_DEL_RADAR,
      agregar: false,
      quitable: false,
      aMano: escrito !== null,
      conCita: false,
      escribe: { via: "radar", dimensionId: d.id, nivel: d.nivel },
    });
  }
  if (e.conLoQueCuesta) out.push(fijo(CLAVES.delArea(area, "ceja.cuesta"), cejaDeLoQueCuesta(r.areaNombre), "Ceja de lo que más le cuesta", A.cuesta, e.textos));
  const rec = r.recomendacion;
  if (rec) {
    if (rec.tipo === "trabajar") {
      const t = tituloDeEmpezar(rec.dimensionNombre, rec.objetivoNombre);
      out.push(fijo(CLAVES.calculado(area, "empezar.titulo", t), t, "Título de «Por dónde empezar»", A.empezar, e.textos));
    }
    out.push(fijo(CLAVES.calculado(area, "empezar.razon", rec.razon), rec.razon, "Por qué empezar por ahí", A.empezar, e.textos));
    if (rec.tipo === "trabajar" && rec.costoDeQuedarse)
      out.push(fijo(CLAVES.calculado(area, "costo", rec.costoDeQuedarse), rec.costoDeQuedarse, "Lo que cuesta quedarse así", A.empezar, e.textos));
  }
  if (r.casos.some((x) => !quitadaDeLaPagina(e.textos, CLAVES.caso(area, x.id)))) out.push(titulo("titulo.casos", A.casos));
  // Un caso quitado para el cliente no sale en su página: tampoco se le pide a Nexus (se vuelve a mostrar a mano).
  for (const c of r.casos.filter((x) => !quitadaDeLaPagina(e.textos, CLAVES.caso(area, x.id)))) {
    out.push(fijo(CLAVES.caso(area, c.id, "titulo"), c.titulo, `Título del caso «${c.titulo}»`, A.casos, e.textos));
    out.push(fijo(CLAVES.caso(area, c.id, "promesa"), c.promesa, `Qué logra el caso «${c.titulo}»`, A.casos, e.textos));
    if (c.razon) out.push(fijo(CLAVES.calculado(area, `caso.${c.id}.razon`, c.razon), c.razon, `Qué parte sube con «${c.titulo}»`, A.casos, e.textos));
  }
  if (r.nivel && r.riesgos.length) out.push(titulo("titulo.riesgos", A.riesgos));
  if (r.nivel)
    for (const x of r.riesgos)
      out.push(fijo(CLAVES.calculado(area, "riesgo", x), x, "Un riesgo", A.riesgos, e.textos, { quitable: true }));
  if (r.preguntadas > 0) {
    out.push(titulo("titulo.partes", A.partes));
    for (const d of r.dimensiones) {
      const det = d.preguntada && d.nivel ? e.detalle(d.id) : null;
      if (!det) continue;
      const original = textoDeLaPrioridad(det).texto;
      out.push(fijo(CLAVES.detalle(d.id, original), original, `Qué priorizar en ${d.nombre}`, A.partes, e.textos));
    }
  }
  const pie = pieDelArea(e.fecha);
  out.push(fijo(CLAVES.calculado(area, "pie", pie), pie, "El pie de la página", A.abajo, e.textos));
  return out;
}

/**
 * Las piezas de una sección (24 nov: «✨ Mejorar con IA» va por sección, el botón de su encabezado). La sección es la de
 * lib/external/secciones-de-la-escala.ts; «Equipos y hallazgos» abarca la de cada equipo.
 */
export function piezasDeLaSeccion<P extends Pick<PiezaDeLaEscala, "seccion">>(piezas: readonly P[], seccion: string): P[] {
  return piezas.filter((p) => esDeLaSeccion(p.seccion, seccion));
}

/** La operación que escribe un cambio en una pieza: la MISMA de la edición a mano. `despues` null: quitarla. */
export function operacionDelCambio(p: PiezaDeLaEscala, despues: string | null): Operacion {
  const e = p.escribe;
  switch (e.via) {
    case "resumen":
      return { op: "resumenDeLaEscala", clave: e.clave, texto: despues };
    case "nuevo": {
      // Un ítem entero (25 nov), con una sola operación. Quien aplica ya lo leyó (`leerLaPiezaNueva`); si no se entiende,
      // la operación va sin título y la edición la rechaza (no se agrega medio ítem).
      const l = p.campos && despues ? leerLaPiezaNueva(p.campos, despues) : null;
      if (!l?.ok) return { op: "resumenDeLaEscala", clave: e.clave, texto: null };
      const [primero, segundo, tercero] = l.valores;
      if (e.tipo === "punto") {
        const areaId = e.areas.find((a) => a.nombre === tercero)?.id ?? null;
        return { op: "resumenDeLaEscala", clave: e.clave, texto: primero, campos: { texto: segundo, areaId } };
      }
      return { op: "resumenDeLaEscala", clave: e.clave, texto: primero, campos: { texto: segundo, friccion: tercero || null } };
    }
    case "texto": {
      // Como la edición a mano (TextoFijo): el de siempre vuelve a ser el de siempre; vacío, la pieza no sale.
      const t = despues?.trim() ?? "";
      if (!t) return { op: "textoDeLaPagina", clave: e.clave, texto: p.quitable ? "" : null };
      return { op: "textoDeLaPagina", clave: e.clave, texto: t === e.original.trim() ? null : t };
    }
    case "radar":
      return { op: "textoDelRadar", dimensionId: e.dimensionId, valor: despues ? { texto: despues, nivel: e.nivel } : null };
    case "descripcion":
      return { op: "descripcionDeLaEscala", areaId: e.areaId, texto: despues };
  }
}

/**
 * Lo que acepta una pieza, para el modelo (la guía de su sección en el núcleo de «Mejorar con IA»). El texto de la pieza va
 * aparte, una sola vez: sin citas ni ids de reuniones (las piezas no los traen).
 */
export function guiaDeLaPieza(p: PiezaDeLaEscala): string {
  if (p.campos)
    return [
      "lugar para AGREGAR un ítem nuevo ENTERO (vacío: aquí se agrega)",
      `escribe un renglón por parte, con su nombre adelante: ${p.campos
        .map((c) => `«${c.nombre}: …» (${c.opcional ? "si se sabe, " : ""}hasta ${c.tope} caracteres${c.opciones ? `; uno de: ${c.opciones.join(", ")} o «Toda la empresa»` : ""})`)
        .join(", ")}`,
      "sin una parte obligatoria no se agrega",
    ].join(" · ");
  return [
    p.agregar ? "lugar para AGREGAR una pieza nueva (vacío: aquí se agrega)" : null,
    p.aMano ? "la escribió el equipo" : null,
    p.quitable ? "se puede quitar" : "no se quita",
    p.noLaVeElCliente ? "el cliente no la ve: su cita no sostiene la cifra" : null,
    `hasta ${p.tope} caracteres`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Si la página de un área muestra «Lo que más le cuesta»: la misma regla de la vista (ResultadoDelTestVista › `conclusiones`):
 * su tarjeta del Resumen con el molde del 20 nov y algo que decir (un costo, un reto o lo que lo causa).
 */
export function conLoQueCuestaDelArea(res: Pick<ResumenDeLaPagina, "tarjetas">, areaId: string): boolean {
  const t = res.tarjetas.find((x) => x.areaId === areaId && !x.porExplorar);
  return !!t?.subequipos.some((x) => {
    if (x.costo === undefined) return false;
    const c = conclusionDelSubequipo(x, false);
    return !!c.costo || !!c.reto || c.causas.length > 0;
  });
}
