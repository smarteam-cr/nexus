/**
 * lib/exploraciones/contenido.ts — lo que guarda una exploración y cómo cambia. PURO.
 *
 * Una exploración tiene dos mitades que no se mezclan:
 *   - `contenido`: lo CONFIRMADO. Lo escribe el vendedor —a mano, o usando lo que propuso el
 *     agente—, y es lo único que leen la propuesta, el handoff y la métrica.
 *   - `propuesta`: lo que propone el agente, ítem por ítem, con sus fuentes y la frase que lo
 *     respalda. ⛔ El agente NUNCA escribe en `contenido`: solo suma ítems con `fusionarPropuestas`,
 *     y lo único que los pasa a lo confirmado es la operación «usar», que manda el vendedor.
 *
 * Lo descartado deja una LÁPIDA (`contenido.descartadas`, el id del ítem): como el id sale del
 * destino y del valor, el agente puede volver a proponer lo mismo en la próxima corrida y no
 * vuelve a aparecer. Es la regla de la ficha del cliente (lib/clients/ficha.ts), llevada a ítems.
 *
 * ⚠ SIN zod a propósito: la pantalla aplica las operaciones en el acto con esta misma función, y
 * zod pesa 266 KB en el navegador (lib/auth/client-safe.test.ts). Quién valida la FORMA de cada
 * valor se pasa como parámetro: el servidor pasa el estricto (`esquemas.ts`); la pantalla, el libre
 * —el servidor vuelve a validar todo, y su respuesta es la que queda—.
 */
import type { Cierre, Despues, Letra } from "@/lib/escala/documento/tipos";
import { MAX_SESIONES, type GuiaDeLaSesion, type SesionPlaneada } from "./guia";
import {
  definicionDe,
  esDeLista,
  TIPO_DE_CASILLA,
  TOPE_DE_LA_LISTA,
  type ClaveDeCasilla,
  type Meta,
  type Objecion,
  type Persona,
  type Reto,
  type ValoresDeCasillas,
} from "./casillas";

// ── Las piezas ────────────────────────────────────────────────────────────────

export const NIVELES = ["D", "I", "F", "E", "O"] as const satisfies readonly Letra[];

/**
 * De dónde salió el nivel estimado de una dimensión. Dos clases, y el mapa de la escala las pinta
 * distinto:
 *   - HIPÓTESIS (`test`, `hipotesis`): lo que se cree antes de hablar con el cliente —lo que marcó
 *     en el test, con la escala anterior, o lo que el agente deduce de HubSpot—. Se explora en la
 *     reunión para saber si está ahí o no.
 *   - EVIDENCIA (`reunion`, `portal`, `vendedor`): lo dijo el cliente, se vio en su portal o lo
 *     marcó el vendedor.
 */
export const FUENTES_DEL_NIVEL = ["test", "hipotesis", "reunion", "portal", "vendedor"] as const;
export type FuenteDelNivel = (typeof FUENTES_DEL_NIVEL)[number];
export const ETIQUETA_DE_LA_FUENTE: Record<FuenteDelNivel, string> = {
  test: "El test",
  hipotesis: "Hipótesis del agente",
  reunion: "Reunión",
  portal: "Portal",
  vendedor: "Lo marcó el vendedor",
};

/** ¿El nivel es una hipótesis (para explorar) y no algo que dijo el cliente o se vio? */
export function esFuenteDeHipotesis(f: FuenteDelNivel): boolean {
  return f === "test" || f === "hipotesis";
}

export interface EstimadoGuardado {
  nivel: Letra;
  fuente: FuenteDelNivel;
  /** La frase que lo respalda, en palabras del cliente. */
  evidencia?: string;
  /** Por qué ese nivel, en una o dos frases que el vendedor pueda decir (lo escribe el agente). */
  porQue?: string;
  /** «No sé»: cuenta como el nivel más bajo, como dice la escala. */
  noSabe?: boolean;
  /** Una respuesta dejó ver un riesgo de la dimensión: no se estima por encima de Funcional. */
  riesgo?: boolean;
}

/** Lo que pide Funcional, criterio por criterio: guía de lo que falta. No cambia el nivel estimado. */
export const ESTADOS_DEL_CRITERIO = ["tiene", "no_tiene", "no_se"] as const;
export type EstadoDelCriterio = (typeof ESTADOS_DEL_CRITERIO)[number];
export interface EstadoDeCriterio {
  estado: EstadoDelCriterio;
  cita?: string;
}

/** Por qué se profundiza en una dimensión. */
export const MOTIVOS_PARA_EXPLORAR = ["indicio", "meta", "riesgo", "otro"] as const;
export type MotivoParaExplorar = (typeof MOTIVOS_PARA_EXPLORAR)[number];
export const ETIQUETA_DEL_MOTIVO: Record<MotivoParaExplorar, string> = {
  indicio: "Quedó debajo de Funcional",
  meta: "Toca una meta del cliente",
  riesgo: "Dejó ver un riesgo",
  otro: "Otro motivo",
};
export interface AExplorar {
  motivo: MotivoParaExplorar;
  razon?: string;
}

/** Lo que la escala pide registrar en toda medición y no sale de otro lado («Datos que guarda cada medición»). */
export interface Medicion {
  pais?: string;
  personasEmpresa?: string;
  personasEquipo?: string;
}

/**
 * Un caso de uso elegido para la propuesta, con el área que lleva a Funcional y por qué. Puede ser
 * del catálogo de Smarteam (su id es el del catálogo) o uno que propuso el agente sin el catálogo
 * (id `ia-…`, ver `idDeCasoLibre`): ese no tiene precio ni fila en el catálogo, y entra a la
 * propuesta solo como contexto. El título se guarda con el elegido: la propuesta y el traspaso lo
 * nombran sin depender de que el catálogo siga igual.
 */
export interface CasoDeUsoElegido {
  titulo: string;
  areaId: string | null;
  razon?: string;
  /** Qué se implementa y cómo se usa, en dos o tres frases (los que propone el agente). */
  descripcion?: string;
  /** Las dimensiones de la escala que mueve (ids). */
  dimensiones?: string[];
}

/** El id de un caso de uso que propuso el agente sin el catálogo: sale del título. */
export function idDeCasoLibre(titulo: string): string {
  return `ia-${fnv1a(normalizarTexto(titulo))}`;
}

/** ¿Es un caso de uso que propuso el agente, sin el catálogo? */
export const esCasoLibre = (useCaseId: string) => useCaseId.startsWith("ia-");

/**
 * Quién eligió la edición de la escala (la industria). Se elige SOLA —por la industria de HubSpot o
 * por el agente, que lee todo lo que hay de la empresa— hasta que el vendedor la cambia: desde ahí,
 * el agente ya no la toca.
 */
/** La escala que se sugiere sola (por la industria de HubSpot o por el agente), para poder volver a ella. */
export interface EscalaSugerida {
  edicion: string | null;
  cierre: Cierre | null;
  despues: Despues | null;
  por: "industria" | "agente";
  razon?: string;
}

export interface EdicionElegida {
  por: "industria" | "agente" | "vendedor";
  /** Por qué esa, en una línea (la industria de HubSpot, lo que hace la empresa). */
  razon?: string;
  /**
   * La última sugerida, aunque el vendedor haya elegido otra: «Restablecer la sugerida» vuelve a ella
   * (pedido de Elías, 2026-10-03).
   */
  sugerida?: EscalaSugerida;
}

/** La foto de «lista para proponer» en el momento de armar una propuesta (la lee la métrica). */
export interface FotoAlProponer {
  en: string;
  businessCaseId: string;
  puntos: Record<string, boolean>;
}

export interface ContenidoDeExploracion {
  version: 1;
  casillas: Partial<ValoresDeCasillas>;
  /** El nivel estimado de cada dimensión (por id: `1.7`). */
  chequeo: Record<string, EstimadoGuardado>;
  /** La versión de la escala con que se estimó el último nivel. */
  escalaVersion: string | null;
  /** Lo que pide Funcional, por criterio (`1.7.F1`). */
  falta: Record<string, EstadoDeCriterio>;
  /** Las dimensiones en las que se profundiza, con el motivo. */
  aExplorar: Record<string, AExplorar>;
  /** Por qué está cada área en juego. */
  razonesDeAreas: Record<string, string>;
  /**
   * La nota rápida de cada paso del guion de las dos reuniones fijas (hasta el 2026-10-01). Ya no se
   * escriben: se siguen leyendo como fuente del agente.
   */
  notas: Record<string, string>;
  /** Las sesiones que planea el vendedor, las que necesite (lib/exploraciones/guia.ts). */
  sesiones: SesionPlaneada[];
  medicion: Medicion;
  /** El prospecto no usa HubSpot: no hay portal que mirar (cuenta como revisado). */
  sinPortal: boolean;
  /** Los casos de uso que van a la propuesta: del catálogo (por su id) o los que propuso el agente (`ia-…`). */
  casosDeUso: Record<string, CasoDeUsoElegido>;
  /** Los títulos de los casos de uso que el vendedor descartó: la próxima tanda no los repite. */
  casosDescartados: string[];
  /** Quién eligió la edición. null = nadie todavía (la exploración arrancó con la escala general). */
  edicionElegida: EdicionElegida | null;
  /** Lápidas: ids de lo propuesto que el vendedor descartó. */
  descartadas: string[];
  alProponer: FotoAlProponer[];
}

export function contenidoVacio(): ContenidoDeExploracion {
  return {
    version: 1,
    casillas: {},
    chequeo: {},
    escalaVersion: null,
    falta: {},
    aExplorar: {},
    razonesDeAreas: {},
    notas: {},
    sesiones: [],
    medicion: {},
    sinPortal: false,
    casosDeUso: {},
    casosDescartados: [],
    edicionElegida: null,
    descartadas: [],
    alProponer: [],
  };
}

/** Cuántos títulos de casos descartados se recuerdan. */
export const MAX_CASOS_DESCARTADOS = 100;

/**
 * ¿La industria (y el perfil) los eligió el vendedor? Entonces el agente ya no los cambia. Una
 * exploración de antes del 2026-10-01 no anotaba quién: ahí nada se elegía solo, así que una
 * industria o un perfil ya puestos los puso el vendedor.
 */
export function industriaDelVendedor(e: Pick<EstadoDeExploracion, "contenido" | "edicion" | "perfilCierre" | "perfilDespues">): boolean {
  const elegida = e.contenido.edicionElegida;
  if (elegida) return elegida.por === "vendedor";
  return e.edicion !== null || (e.perfilCierre !== null && e.perfilDespues !== null);
}

// ── Lo que propone el agente ──────────────────────────────────────────────────

/** El vendedor eligió la escala: desde ahora el agente no la cambia, pero la sugerida se guarda para poder volver. */
function elegidaPorElVendedor(c: ContenidoDeExploracion): EdicionElegida {
  const sugerida = c.edicionElegida?.sugerida;
  return { por: "vendedor", ...(sugerida ? { sugerida } : {}) };
}

/** A dónde va lo propuesto. */
export type DestinoDePropuesta =
  | { tipo: "casilla"; clave: ClaveDeCasilla }
  | { tipo: "nivel"; dimensionId: string }
  | { tipo: "falta"; criterioId: string }
  | { tipo: "aExplorar"; dimensionId: string }
  | { tipo: "area"; areaId: string }
  | { tipo: "edicion" }
  | { tipo: "perfil" }
  | { tipo: "casoDeUso"; useCaseId: string };

/** Una fuente citada: su id en la corrida (H3, S1…), cómo se llama y la frase exacta que lo respalda. */
export interface FuenteCitada {
  id: string;
  etiqueta: string;
  cita?: string;
}

export interface ItemPropuesto {
  /** Estable: sale del destino y del valor. Es lo que guarda la lápida. */
  id: string;
  destino: DestinoDePropuesta;
  valor: unknown;
  /** Por qué lo propone, en una línea (para las dimensiones a explorar, las áreas, los niveles). */
  razon?: string;
  fuentes: FuenteCitada[];
  corridaId: string | null;
  en: string;
}

/** Los tres momentos del agente: preparar la primera reunión, leer las reuniones, proponer los casos de uso. */
export const MODOS_DE_LA_CORRIDA = ["preparar", "leer", "casos", "guia"] as const;
export type ModoDeLaCorrida = (typeof MODOS_DE_LA_CORRIDA)[number];

/** Una corrida del agente sobre esta exploración: qué hizo y cuándo (para la historia del lienzo). */
export interface CorridaDelAgente {
  id: string;
  modo: ModoDeLaCorrida;
  en: string;
  propuestos: number;
  /** Lo que leyó, como lo ve el vendedor («Reunión del 1 oct: Revisión del diagnóstico»). */
  leyo: string[];
  /** A dónde fue lo que propuso (claveDelDestino): la historia dice qué casillas alimentó. */
  alimento: string[];
  /** La lanzó una reunión nueva, sin que nadie apretara el botón. */
  automatica: boolean;
}

/**
 * Lo que escribe el AGENTE, y nada más: lo propuesto, lo que ya leyó (para saber qué es nuevo) y
 * sus corridas. Vive aparte de lo confirmado a propósito: así ninguna escritura del agente puede
 * tocar lo que el vendedor confirmó, ni subirle la versión.
 */
export interface PropuestaDeExploracion {
  version: 1;
  items: ItemPropuesto[];
  /** Ids de las sesiones de Meet, las actividades de HubSpot y los documentos sumados a mano que el agente ya leyó. */
  leidas: { sesiones: string[]; hubspot: string[]; documentos: string[] };
  corridas: CorridaDelAgente[];
  /**
   * La guía de la próxima reunión (lib/exploraciones/guia.ts). Material de preparación, no un dato
   * del cliente: se muestra directo, sin «usar», y nunca llega a la propuesta ni al handoff.
   */
  guia: GuiaDeLaSesion | null;
  /**
   * La guía de cada sesión, por su id: la que se armó para ella. Así el «antes» de una sesión que ya
   * pasó muestra lo que se preparó (pedido de Elías, 2026-10-03: una pestaña por sesión).
   */
  guias: Record<string, GuiaDeLaSesion>;
  /**
   * La última reunión que leyó el agente se puso técnica (Elías, 2026-10-06): el Resumen lo avisa.
   * La reemplaza cada lectura que dice algo de la reunión más reciente; null = no se puso técnica.
   */
  alertaTecnica: AlertaTecnica | null;
  /**
   * Lo que el agente leyó de cada reunión (rediseño de las sesiones, 2026-10-07): su resumen y qué
   * se respondió de lo que se planeó preguntar. Por reunión: `meet:<id>`, `hubspot:<id>`,
   * `documento:<id>` (`claveDeLaReunion`). Las últimas 24.
   */
  lecturas: Record<string, LecturaDeReunion>;
}

/** La clave de una reunión en `lecturas`: su origen y su id. */
export function claveDeLaReunion(r: { origen: string; id: string }): string {
  return `${r.origen}:${r.id}`;
}

export const MAX_LECTURAS = 24;

/** Una pregunta de lo planeado para una reunión, y si se respondió en ella. */
export interface CoberturaDeLaPregunta {
  /** A qué apunta: una tarjeta del resumen o una dimensión (`1.3`). */
  para: string;
  pregunta: string;
  respondida: boolean;
  /** Lo que respondió, en pocas palabras (solo si se respondió). */
  detalle?: string;
}

/** Lo que el agente leyó de una reunión. */
export interface LecturaDeReunion {
  /** Cómo la nombró la corrida («Reunión del 28 sep: …»): así se encuentra lo que sugirió de ella. */
  etiqueta: string;
  /** Dos o tres frases: qué se habló y qué quedó. */
  resumen: string;
  /** El objetivo con que se planeó, si había uno. */
  objetivo?: string;
  cobertura: CoberturaDeLaPregunta[];
  /**
   * Lo que estaba listo para proponer antes de leerla (los ids de `listaParaProponer`). Sin el dato en
   * el resumen que se armó después de leerla (scripts/leer-reuniones-de-preventas.ts): no se sabe qué
   * faltaba ese día, y «Cuánto avanzó» muestra solo lo de hoy.
   */
  listosAntes?: string[];
  /** Cuándo fue (ISO) y cómo se llama: con eso una reunión de HubSpot que no estaba en la agenda aparece en Exploración. */
  fecha?: string;
  titulo?: string;
  en: string;
  corridaId: string;
}

/** Cuándo una conversación de venta se puso técnica, con la frase que lo muestra. */
export interface AlertaTecnica {
  /** La reunión, como la ve el vendedor: «Reunión del 1 oct: Revisión del diagnóstico». */
  reunion: string;
  /** De qué se habló: integraciones, migración de datos, una API… (hasta 4). */
  temas: string[];
  /** En qué parte de la reunión, si se sabe («al hablar del ERP»). */
  momento?: string;
  /** La frase literal que lo muestra (verificada contra la reunión). */
  cita?: string;
  en: string;
  corridaId: string;
  /** Alguien ya la vio y la cerró. */
  vista?: boolean;
}

export function propuestaVacia(): PropuestaDeExploracion {
  return { version: 1, items: [], leidas: { sesiones: [], hubspot: [], documentos: [] }, corridas: [], guia: null, guias: {}, alertaTecnica: null, lecturas: {} };
}

/** Tope de lo pendiente: lo más viejo se cae primero. */
const MAX_ITEMS = 250;

/**
 * Tope de las lápidas. Holgado a propósito: si una lápida se cae, lo descartado VUELVE a
 * proponerse (y los niveles del test se re-proponen en cada corrida).
 */
export const MAX_DESCARTADAS = 2000;

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Texto comparable: sin mayúsculas, sin tildes y con los espacios colapsados. */
export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** JSON con las claves ordenadas y los textos normalizados: dos valores iguales dan el mismo texto. */
/** JSON con las claves ordenadas y SIN normalizar: lo que decide si cambió lo confirmado (una tilde cuenta). */
function exacto(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(exacto).join(",")}]`;
  if (esObjeto(v)) {
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${exacto(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

function canonico(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(normalizarTexto(v));
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (esObjeto(v)) {
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** FNV-1a de 32 bits, en hexa: corto, estable y sin depender de `crypto` (corre en el navegador). */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** La clave del destino: dos propuestas al mismo destino escalar se reemplazan. */
export function claveDelDestino(d: DestinoDePropuesta): string {
  switch (d.tipo) {
    case "casilla":
      return `casilla:${d.clave}`;
    case "nivel":
      return `nivel:${d.dimensionId}`;
    case "falta":
      return `falta:${d.criterioId}`;
    case "aExplorar":
      return `aExplorar:${d.dimensionId}`;
    case "area":
      return `area:${d.areaId}`;
    case "edicion":
      return "edicion";
    case "perfil":
      return "perfil";
    case "casoDeUso":
      return `casoDeUso:${d.useCaseId}`;
  }
}

/**
 * El id de lo propuesto. Para el NIVEL cuenta el nivel y si es hipótesis (no la frase que lo
 * respalda): si el vendedor descartó «Datos en Inicial», otra corrida que diga lo mismo con otra
 * cita no vuelve; pero descartar la HIPÓTESIS «Datos en Inicial» no tapa lo que el cliente diga
 * después en una reunión.
 */
export function idDelItem(destino: DestinoDePropuesta, valor: unknown): string {
  const valorQueCuenta =
    destino.tipo === "nivel" && esObjeto(valor)
      ? esFuenteDeHipotesis(valor.fuente as FuenteDelNivel)
        ? { nivel: valor.nivel, hipotesis: true }
        : { nivel: valor.nivel }
      : destino.tipo === "falta" && esObjeto(valor)
        ? { estado: valor.estado }
        : destino.tipo === "aExplorar" || destino.tipo === "area" || destino.tipo === "casoDeUso"
          ? null
          : valor;
  return `${claveDelDestino(destino)}:${fnv1a(canonico(valorQueCuenta))}`;
}

/** ¿El destino recibe un ítem más (lista) o se reemplaza entero (escalar)? */
export function destinoDeLista(d: DestinoDePropuesta): boolean {
  return d.tipo === "casilla" && esDeLista(TIPO_DE_CASILLA[d.clave]);
}

// ── El estado editable ────────────────────────────────────────────────────────

/** Lo que una operación puede cambiar de una exploración. */
export interface EstadoDeExploracion {
  contenido: ContenidoDeExploracion;
  propuesta: PropuestaDeExploracion;
  areas: string[];
  edicion: string | null;
  perfilCierre: Cierre | null;
  perfilDespues: Despues | null;
  responsableEmail: string | null;
  archivada: boolean;
}

/** El texto con que se compara un ítem de lista contra los que ya están confirmados. */
function claveDeItemDeLista(clave: ClaveDeCasilla, item: unknown): string {
  switch (TIPO_DE_CASILLA[clave]) {
    case "metas":
      return normalizarTexto((item as Meta).que ?? "");
    case "retos":
      return normalizarTexto((item as Reto).texto ?? "");
    case "objeciones":
      return normalizarTexto((item as Objecion).texto ?? "");
    case "autoridad": {
      const p = item as Persona;
      return `${normalizarTexto(p.nombre ?? "")}|${p.rol ?? ""}`;
    }
    default:
      return normalizarTexto(typeof item === "string" ? item : "");
  }
}

/** ¿Lo propuesto ya está confirmado tal cual? Entonces no hace falta proponerlo. */
export function yaEstaConfirmado(estado: EstadoDeExploracion, destino: DestinoDePropuesta, valor: unknown): boolean {
  const c = estado.contenido;
  switch (destino.tipo) {
    case "casilla": {
      const actual = c.casillas[destino.clave];
      if (actual === undefined) return false;
      if (destinoDeLista(destino)) {
        const k = claveDeItemDeLista(destino.clave, valor);
        return (actual as unknown[]).some((x) => claveDeItemDeLista(destino.clave, x) === k);
      }
      return canonico(actual) === canonico(valor);
    }
    case "nivel": {
      /* El mismo nivel ya confirmado. Pero si lo confirmado es una hipótesis y lo propuesto trae
         evidencia (lo dijo el cliente), NO está confirmado: es la evidencia que faltaba. */
      const actual = c.chequeo[destino.dimensionId];
      const v = valor as EstimadoGuardado;
      return !!actual && actual.nivel === v.nivel && (!esFuenteDeHipotesis(actual.fuente) || esFuenteDeHipotesis(v.fuente));
    }
    case "falta":
      return c.falta[destino.criterioId]?.estado === (valor as EstadoDeCriterio).estado;
    case "aExplorar":
      return destino.dimensionId in c.aExplorar;
    case "area":
      return estado.areas.includes(destino.areaId);
    case "edicion":
      return estado.edicion === (valor as { slug: string | null }).slug;
    case "perfil": {
      const p = valor as { cierre: Cierre; despues: Despues };
      return estado.perfilCierre === p.cierre && estado.perfilDespues === p.despues;
    }
    case "casoDeUso":
      return destino.useCaseId in c.casosDeUso;
  }
}

function unirFuentes(a: FuenteCitada[], b: FuenteCitada[]): FuenteCitada[] {
  const out = [...a];
  for (const f of b) if (!out.some((x) => x.id === f.id && x.cita === f.cita)) out.push(f);
  return out.slice(0, 12);
}

/**
 * Qué tanto pesa un nivel propuesto: lo que marcó en el test (escala anterior) < la hipótesis del
 * agente (que ya leyó el test y lo demás) < lo que dijo el cliente o se vio. 0 = no es un nivel.
 */
function pesoDelNivel(it: ItemPropuesto): number {
  if (it.destino.tipo !== "nivel" || !esObjeto(it.valor)) return 0;
  const f = it.valor.fuente as FuenteDelNivel;
  return f === "test" ? 1 : f === "hipotesis" ? 2 : 3;
}

/** ¿Es la hipótesis de un nivel (del test o del agente)? Es la capa del mapa: no hay que «usarla». */
export function esHipotesisDeNivel(it: ItemPropuesto): boolean {
  const p = pesoDelNivel(it);
  return p === 1 || p === 2;
}

/**
 * Suma lo que propuso una corrida a lo pendiente. No entra lo descartado (lápida), ni lo que ya está
 * confirmado igual. Un destino escalar queda con UNA sola propuesta: la más nueva reemplaza a la
 * anterior, salvo que pese menos (una hipótesis no pisa lo que dijo el cliente). Lo repetido junta
 * sus fuentes.
 */
export function fusionarPropuestas(estado: EstadoDeExploracion, nuevos: ItemPropuesto[]): PropuestaDeExploracion {
  const base = estado.propuesta;
  const lapidas = new Set(estado.contenido.descartadas);
  let items = [...estado.propuesta.items];
  for (const n of nuevos) {
    if (lapidas.has(n.id) || yaEstaConfirmado(estado, n.destino, n.valor)) continue;
    const peso = pesoDelNivel(n);
    /* Una hipótesis no compite con lo que ya dijo el cliente: si el nivel confirmado tiene evidencia,
       la hipótesis sobra. */
    if (peso === 1 || peso === 2) {
      const confirmado = estado.contenido.chequeo[(n.destino as { dimensionId: string }).dimensionId];
      if (confirmado && !esFuenteDeHipotesis(confirmado.fuente)) continue;
    }
    const i = items.findIndex((x) => x.id === n.id);
    if (i >= 0) {
      /* El mismo nivel y la misma clase: queda el que más pesa (la hipótesis del agente sobre lo que
         marcó en el test), con las fuentes de los dos. */
      items[i] =
        peso < pesoDelNivel(items[i])
          ? { ...items[i], fuentes: unirFuentes(items[i].fuentes, n.fuentes) }
          : { ...n, fuentes: unirFuentes(items[i].fuentes, n.fuentes) };
      continue;
    }
    // Al volver a preparar, una hipótesis no pisa un nivel pendiente que pesa más (el que salió de una reunión).
    if (peso > 0) {
      const clave = claveDelDestino(n.destino);
      if (items.some((x) => claveDelDestino(x.destino) === clave && !lapidas.has(x.id) && pesoDelNivel(x) > peso)) continue;
    }
    if (!destinoDeLista(n.destino)) {
      const clave = claveDelDestino(n.destino);
      items = items.filter((x) => claveDelDestino(x.destino) !== clave);
    }
    items.push(n);
  }
  return { ...base, items: items.slice(-MAX_ITEMS) };
}

/**
 * ¿Lo propuesto sigue teniendo dónde ir con la escala de ahora? Al cambiar la edición o el perfil,
 * una dimensión o un criterio pueden dejar de estar: esa propuesta ya no se puede usar ni se cuenta.
 */
export function destinoValido(d: DestinoDePropuesta, v: Validez): boolean {
  switch (d.tipo) {
    case "nivel":
    case "aExplorar":
      return v.dimensiones.has(d.dimensionId);
    case "falta":
      return v.criterios.has(d.criterioId);
    case "area":
      return v.areas.has(d.areaId);
    default:
      return true;
  }
}

/** Lo pendiente, quitando lo que ya quedó confirmado por otro camino (el vendedor lo escribió a mano). */
export function propuestaVigente(estado: EstadoDeExploracion): ItemPropuesto[] {
  const lapidas = new Set(estado.contenido.descartadas);
  return estado.propuesta.items.filter((it) => !lapidas.has(it.id) && !yaEstaConfirmado(estado, it.destino, it.valor));
}

// ── Las operaciones ───────────────────────────────────────────────────────────

/** Lo que el servidor sabe de la escala para validar ids (de la edición y las áreas de la exploración). */
export interface Validez {
  dimensiones: ReadonlySet<string>;
  criterios: ReadonlySet<string>;
  areas: ReadonlySet<string>;
  ediciones: ReadonlySet<string>;
  /**
   * El perfil habitual de cada edición, como lo dice la escala: al elegir la industria, el perfil
   * (cómo se cierra la venta y qué pasa después) se elige con ella. Sin esto, la edición cambia sola.
   */
  perfilesHabituales?: Readonly<Record<string, { cierre: Cierre; despues: Despues } | null>>;
  /** La versión de la escala publicada: queda anotada con cada nivel. */
  escalaVersion: string | null;
}

/**
 * Quién valida la FORMA de un valor. Devuelve el valor limpio, o null si no tiene la forma. El
 * servidor usa el estricto (esquemas.ts); la pantalla, el libre (el servidor vuelve a validar).
 */
export interface Validador {
  valorDeCasilla(clave: ClaveDeCasilla, v: unknown): unknown | null;
  valorDelDestino(destino: DestinoDePropuesta, v: unknown): unknown | null;
}

/** El validador de la pantalla: confía en lo que arma ella misma; el servidor decide. */
export const VALIDADOR_LIBRE: Validador = {
  valorDeCasilla: (_c, v) => (v === undefined ? null : v),
  valorDelDestino: (_d, v) => (v === undefined ? null : v),
};

/** Las operaciones que manda la pantalla. Su esquema estricto vive en esquemas.ts. */
export type Operacion =
  | { op: "casilla"; clave: ClaveDeCasilla; valor?: unknown }
  | { op: "nivel"; dimensionId: string; estimado: EstimadoGuardado | null }
  | { op: "falta"; criterioId: string; estado: EstadoDeCriterio | null }
  | { op: "aExplorar"; dimensionId: string; valor: AExplorar | null }
  | { op: "areas"; areas: string[]; razones?: Record<string, string> }
  | { op: "perfil"; cierre: Cierre | null; despues: Despues | null }
  | { op: "edicion"; edicion: string | null }
  /** Volver a la escala sugerida: el agente vuelve a poder cambiarla. */
  | { op: "restablecerEscala"; sugerida: EscalaSugerida }
  | { op: "nota"; paso: string; texto: string }
  /** La lista entera de sesiones planeadas (agregar, fechar, marcar hecha o quitar). */
  | { op: "sesiones"; sesiones: SesionPlaneada[] }
  | { op: "medicion"; medicion: Medicion }
  | { op: "sinPortal"; valor: boolean }
  | { op: "casoDeUso"; useCaseId: string; valor: CasoDeUsoElegido | null }
  | { op: "usar"; itemId: string; valor?: unknown }
  /** «Usar todas»: cada una por su cuenta; la que ya no está o ya no corresponde se salta. */
  | { op: "usarVarias"; items: { itemId: string; valor?: unknown }[] }
  | { op: "descartar"; itemIds: string[] }
  | { op: "responsable"; email: string | null }
  /** «Entendido» en el aviso de que la última reunión se puso técnica. */
  | { op: "alertaTecnicaVista" }
  | { op: "archivar" };

export type ResultadoDeOperaciones = { ok: true; estado: EstadoDeExploracion } | { ok: false; error: string };

function conCasilla<K extends ClaveDeCasilla>(
  c: ContenidoDeExploracion,
  clave: K,
  valor: ValoresDeCasillas[K] | undefined,
): ContenidoDeExploracion {
  const casillas = { ...c.casillas };
  if (valor === undefined || (Array.isArray(valor) && valor.length === 0) || valor === "") delete casillas[clave];
  else casillas[clave] = valor;
  return { ...c, casillas };
}

/** Aplica un valor (de una operación o de lo propuesto) a su destino. Devuelve un error legible si no corresponde. */
function aplicarAlDestino(
  estado: EstadoDeExploracion,
  destino: DestinoDePropuesta,
  valor: unknown,
  validez: Validez,
  validador: Validador,
): ResultadoDeOperaciones {
  const v = validador.valorDelDestino(destino, valor);
  if (v === null) return { ok: false, error: "El valor no tiene la forma de esa casilla." };
  const c = estado.contenido;

  switch (destino.tipo) {
    case "casilla": {
      if (destinoDeLista(destino)) {
        const actual = (c.casillas[destino.clave] as unknown[] | undefined) ?? [];
        const k = claveDeItemDeLista(destino.clave, v);
        if (actual.some((x) => claveDeItemDeLista(destino.clave, x) === k)) return { ok: true, estado };
        const tope = TOPE_DE_LA_LISTA[TIPO_DE_CASILLA[destino.clave] as keyof typeof TOPE_DE_LA_LISTA];
        if (actual.length >= tope) {
          return { ok: false, error: `«${definicionDe(destino.clave).etiqueta}» ya tiene ${tope}: quita uno antes de agregar otro.` };
        }
        return {
          ok: true,
          estado: { ...estado, contenido: conCasilla(c, destino.clave, [...actual, v] as ValoresDeCasillas[ClaveDeCasilla]) },
        };
      }
      return { ok: true, estado: { ...estado, contenido: conCasilla(c, destino.clave, v as ValoresDeCasillas[ClaveDeCasilla]) } };
    }
    case "nivel": {
      if (!validez.dimensiones.has(destino.dimensionId)) return { ok: false, error: `La dimensión ${destino.dimensionId} no está en juego.` };
      return {
        ok: true,
        estado: {
          ...estado,
          contenido: {
            ...c,
            chequeo: { ...c.chequeo, [destino.dimensionId]: v as EstimadoGuardado },
            escalaVersion: validez.escalaVersion ?? c.escalaVersion,
          },
        },
      };
    }
    case "falta": {
      if (!validez.criterios.has(destino.criterioId)) return { ok: false, error: `El criterio ${destino.criterioId} no está en juego.` };
      return { ok: true, estado: { ...estado, contenido: { ...c, falta: { ...c.falta, [destino.criterioId]: v as EstadoDeCriterio } } } };
    }
    case "aExplorar": {
      if (!validez.dimensiones.has(destino.dimensionId)) return { ok: false, error: `La dimensión ${destino.dimensionId} no está en juego.` };
      return { ok: true, estado: { ...estado, contenido: { ...c, aExplorar: { ...c.aExplorar, [destino.dimensionId]: v as AExplorar } } } };
    }
    case "area": {
      if (!validez.areas.has(destino.areaId)) return { ok: false, error: `El área ${destino.areaId} no existe.` };
      const razon = (v as { razon?: string }).razon;
      return {
        ok: true,
        estado: {
          ...estado,
          areas: estado.areas.includes(destino.areaId) ? estado.areas : [...estado.areas, destino.areaId],
          contenido: razon ? { ...c, razonesDeAreas: { ...c.razonesDeAreas, [destino.areaId]: razon } } : c,
        },
      };
    }
    case "edicion": {
      /* La elige el vendedor (a mano o usando lo propuesto): desde ahora el agente no la cambia. Con
         ella va su perfil habitual, como lo dice la escala; el vendedor lo ajusta después si hace falta. */
      const slug = (v as { slug: string | null }).slug;
      if (slug !== null && !validez.ediciones.has(slug)) return { ok: false, error: "Esa industria no tiene edición en la escala." };
      const habitual = slug ? validez.perfilesHabituales?.[slug] : null;
      return {
        ok: true,
        estado: {
          ...estado,
          edicion: slug,
          ...(habitual ? { perfilCierre: habitual.cierre, perfilDespues: habitual.despues } : {}),
          contenido: { ...c, edicionElegida: elegidaPorElVendedor(c) },
        },
      };
    }
    case "perfil": {
      const p = v as { cierre: Cierre; despues: Despues };
      return { ok: true, estado: { ...estado, perfilCierre: p.cierre, perfilDespues: p.despues } };
    }
    case "casoDeUso": {
      const caso = v as CasoDeUsoElegido;
      if (caso.areaId !== null && !validez.areas.has(caso.areaId)) return { ok: false, error: `El área ${caso.areaId} no existe.` };
      return { ok: true, estado: { ...estado, contenido: { ...c, casosDeUso: { ...c.casosDeUso, [destino.useCaseId]: caso } } } };
    }
  }
}

function aplicarUna(estado: EstadoDeExploracion, op: Operacion, validez: Validez, validador: Validador): ResultadoDeOperaciones {
  const c = estado.contenido;
  switch (op.op) {
    case "casilla": {
      // null = vaciar la casilla (un siguiente paso o una apertura no tienen «valor vacío» propio).
      if (op.valor === null || op.valor === undefined) {
        return { ok: true, estado: { ...estado, contenido: conCasilla(c, op.clave, undefined) } };
      }
      const v = validador.valorDeCasilla(op.clave, op.valor);
      if (v === null) return { ok: false, error: "El valor no tiene la forma de esa casilla." };
      return { ok: true, estado: { ...estado, contenido: conCasilla(c, op.clave, v as ValoresDeCasillas[ClaveDeCasilla]) } };
    }
    case "nivel": {
      if (op.estimado) return aplicarAlDestino(estado, { tipo: "nivel", dimensionId: op.dimensionId }, op.estimado, validez, validador);
      const chequeo = { ...c.chequeo };
      delete chequeo[op.dimensionId];
      return { ok: true, estado: { ...estado, contenido: { ...c, chequeo } } };
    }
    case "falta": {
      if (op.estado) return aplicarAlDestino(estado, { tipo: "falta", criterioId: op.criterioId }, op.estado, validez, validador);
      const falta = { ...c.falta };
      delete falta[op.criterioId];
      return { ok: true, estado: { ...estado, contenido: { ...c, falta } } };
    }
    case "aExplorar": {
      if (op.valor) return aplicarAlDestino(estado, { tipo: "aExplorar", dimensionId: op.dimensionId }, op.valor, validez, validador);
      const aExplorar = { ...c.aExplorar };
      delete aExplorar[op.dimensionId];
      return { ok: true, estado: { ...estado, contenido: { ...c, aExplorar } } };
    }
    case "areas": {
      const areas = [...new Set(op.areas)];
      const desconocida = areas.find((a) => !validez.areas.has(a));
      if (desconocida) return { ok: false, error: `El área ${desconocida} no existe.` };
      const razonesDeAreas = Object.fromEntries(
        Object.entries({ ...c.razonesDeAreas, ...(op.razones ?? {}) }).filter(([a, r]) => areas.includes(a) && r),
      );
      return { ok: true, estado: { ...estado, areas, contenido: { ...c, razonesDeAreas } } };
    }
    case "perfil":
      // El vendedor tocó el perfil: desde ahora el agente ya no cambia ni la industria ni el perfil.
      return {
        ok: true,
        estado: { ...estado, perfilCierre: op.cierre, perfilDespues: op.despues, contenido: { ...c, edicionElegida: elegidaPorElVendedor(c) } },
      };
    case "edicion":
      return aplicarAlDestino(estado, { tipo: "edicion" }, { slug: op.edicion }, validez, validador);
    case "restablecerEscala": {
      const s = op.sugerida;
      if (s.edicion !== null && !validez.ediciones.has(s.edicion)) return { ok: false, error: "Esa industria no tiene edición en la escala." };
      return {
        ok: true,
        estado: {
          ...estado,
          edicion: s.edicion,
          perfilCierre: s.cierre,
          perfilDespues: s.despues,
          contenido: { ...c, edicionElegida: { por: s.por, ...(s.razon ? { razon: s.razon } : {}), sugerida: s } },
        },
      };
    }
    case "nota": {
      const notas = { ...c.notas };
      if (op.texto.trim()) notas[op.paso] = op.texto;
      else delete notas[op.paso];
      return { ok: true, estado: { ...estado, contenido: { ...c, notas } } };
    }
    case "sesiones":
      return { ok: true, estado: { ...estado, contenido: { ...c, sesiones: op.sesiones.slice(0, MAX_SESIONES) } } };
    case "medicion":
      return { ok: true, estado: { ...estado, contenido: { ...c, medicion: { ...c.medicion, ...op.medicion } } } };
    case "sinPortal":
      return { ok: true, estado: { ...estado, contenido: { ...c, sinPortal: op.valor } } };
    case "casoDeUso": {
      if (op.valor) return aplicarAlDestino(estado, { tipo: "casoDeUso", useCaseId: op.useCaseId }, op.valor, validez, validador);
      const casosDeUso = { ...c.casosDeUso };
      delete casosDeUso[op.useCaseId];
      return { ok: true, estado: { ...estado, contenido: { ...c, casosDeUso } } };
    }
    case "usar": {
      const item = estado.propuesta.items.find((x) => x.id === op.itemId);
      if (!item) return { ok: false, error: "Esa propuesta ya no está: la usó o la descartó alguien más." };
      const r = aplicarAlDestino(estado, item.destino, op.valor === undefined ? item.valor : op.valor, validez, validador);
      if (!r.ok) return r;
      return { ok: true, estado: { ...r.estado, propuesta: { ...r.estado.propuesta, items: r.estado.propuesta.items.filter((x) => x.id !== op.itemId) } } };
    }
    case "usarVarias": {
      let actual = estado;
      for (const x of op.items) {
        const r = aplicarUna(actual, { op: "usar", itemId: x.itemId, valor: x.valor }, validez, validador);
        if (r.ok) actual = r.estado;
      }
      return { ok: true, estado: actual };
    }
    case "descartar": {
      const ids = new Set(op.itemIds);
      // El título de un caso de uso descartado queda anotado: la próxima tanda del agente no lo repite.
      const titulos = estado.propuesta.items
        .filter((x) => ids.has(x.id) && x.destino.tipo === "casoDeUso" && esObjeto(x.valor) && typeof x.valor.titulo === "string")
        .map((x) => (x.valor as CasoDeUsoElegido).titulo);
      return {
        ok: true,
        estado: {
          ...estado,
          propuesta: { ...estado.propuesta, items: estado.propuesta.items.filter((x) => !ids.has(x.id)) },
          contenido: {
            ...c,
            descartadas: [...c.descartadas.filter((d) => !ids.has(d)), ...ids].slice(-MAX_DESCARTADAS),
            ...(titulos.length ? { casosDescartados: [...c.casosDescartados.filter((t) => !titulos.includes(t)), ...titulos].slice(-MAX_CASOS_DESCARTADOS) } : {}),
          },
        },
      };
    }
    case "responsable":
      return { ok: true, estado: { ...estado, responsableEmail: op.email } };
    case "alertaTecnicaVista": {
      const a = estado.propuesta.alertaTecnica;
      if (!a) return { ok: true, estado };
      return { ok: true, estado: { ...estado, propuesta: { ...estado.propuesta, alertaTecnica: { ...a, vista: true } } } };
    }
    case "archivar":
      return { ok: true, estado: { ...estado, archivada: true } };
  }
}

/** Aplica las operaciones en orden. Si una no corresponde, no se aplica NINGUNA. */
export function aplicarOperaciones(
  estado: EstadoDeExploracion,
  ops: readonly Operacion[],
  validez: Validez,
  validador: Validador,
): ResultadoDeOperaciones {
  let actual = estado;
  for (const op of ops) {
    const r = aplicarUna(actual, op, validez, validador);
    if (!r.ok) return r;
    actual = r.estado;
  }
  return { ok: true, estado: actual };
}

/** ¿Lo que cambió es lo confirmado (sube la versión) o solo lo pendiente? */
export function cambioLoConfirmado(antes: EstadoDeExploracion, despues: EstadoDeExploracion): boolean {
  // Las lápidas (y los títulos de los casos descartados) son de lo propuesto: no suben la versión.
  const sinLapidas = (c: ContenidoDeExploracion) => exacto({ ...c, descartadas: [], casosDescartados: [] });
  return (
    sinLapidas(antes.contenido) !== sinLapidas(despues.contenido) ||
    exacto(antes.areas) !== exacto(despues.areas) ||
    antes.edicion !== despues.edicion ||
    antes.perfilCierre !== despues.perfilCierre ||
    antes.perfilDespues !== despues.perfilDespues ||
    antes.responsableEmail !== despues.responsableEmail ||
    antes.archivada !== despues.archivada
  );
}
