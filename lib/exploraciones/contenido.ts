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
import {
  definicionDe,
  esDeLista,
  TIPO_DE_CASILLA,
  TOPE_DE_LA_LISTA,
  type ClaveDeCasilla,
  type Meta,
  type Persona,
  type Reto,
  type ValoresDeCasillas,
} from "./casillas";

// ── Las piezas ────────────────────────────────────────────────────────────────

export const NIVELES = ["D", "I", "F", "E", "O"] as const satisfies readonly Letra[];

/** De dónde salió el nivel estimado de una dimensión. */
export const FUENTES_DEL_NIVEL = ["test", "reunion", "portal", "vendedor"] as const;
export type FuenteDelNivel = (typeof FUENTES_DEL_NIVEL)[number];
export const ETIQUETA_DE_LA_FUENTE: Record<FuenteDelNivel, string> = {
  test: "Test confirmado",
  reunion: "Reunión",
  portal: "Portal",
  vendedor: "Vendedor",
};

export interface EstimadoGuardado {
  nivel: Letra;
  fuente: FuenteDelNivel;
  /** La frase que lo respalda, en palabras del cliente. */
  evidencia?: string;
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
 * Un caso de uso del catálogo de Smarteam elegido para la propuesta, con el área que lleva a
 * Funcional y por qué. El título se guarda con el elegido: la propuesta y el traspaso lo nombran sin
 * depender de que el catálogo siga igual.
 */
export interface CasoDeUsoElegido {
  titulo: string;
  areaId: string | null;
  razon?: string;
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
  /** La nota rápida de cada paso del guion de las reuniones. */
  notas: Record<string, string>;
  medicion: Medicion;
  /** El prospecto no usa HubSpot: no hay portal que mirar (cuenta como revisado). */
  sinPortal: boolean;
  /** Los casos de uso del catálogo que van a la propuesta, por id del catálogo. */
  casosDeUso: Record<string, CasoDeUsoElegido>;
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
    medicion: {},
    sinPortal: false,
    casosDeUso: {},
    descartadas: [],
    alProponer: [],
  };
}

// ── Lo que propone el agente ──────────────────────────────────────────────────

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

/** Los tres momentos del agente: preparar la primera reunión, leer las reuniones, sugerir los casos de uso. */
export const MODOS_DE_LA_CORRIDA = ["preparar", "leer", "casos"] as const;
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
  /** Ids de las sesiones de Meet y de las actividades de HubSpot que el agente ya leyó. */
  leidas: { sesiones: string[]; hubspot: string[] };
  corridas: CorridaDelAgente[];
}

export function propuestaVacia(): PropuestaDeExploracion {
  return { version: 1, items: [], leidas: { sesiones: [], hubspot: [] }, corridas: [] };
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
 * El id de lo propuesto. Para el NIVEL cuenta solo el nivel (no la frase que lo respalda): si el
 * vendedor descartó «Datos en Inicial», otra corrida que diga lo mismo con otra cita no vuelve.
 */
export function idDelItem(destino: DestinoDePropuesta, valor: unknown): string {
  const valorQueCuenta =
    destino.tipo === "nivel" && esObjeto(valor)
      ? { nivel: valor.nivel }
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
    case "nivel":
      return c.chequeo[destino.dimensionId]?.nivel === (valor as EstimadoGuardado).nivel;
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
 * Suma lo que propuso una corrida a lo pendiente. No entra lo descartado (lápida), ni lo que ya está
 * confirmado igual. Un destino escalar queda con UNA sola propuesta: la más nueva reemplaza a la
 * anterior. Lo repetido junta sus fuentes.
 */
/** ¿Es un nivel que sale del test de marketing (escala anterior, hipótesis)? */
const esNivelDelTest = (it: ItemPropuesto) => it.destino.tipo === "nivel" && esObjeto(it.valor) && it.valor.fuente === "test";

export function fusionarPropuestas(estado: EstadoDeExploracion, nuevos: ItemPropuesto[]): PropuestaDeExploracion {
  const base = estado.propuesta;
  const lapidas = new Set(estado.contenido.descartadas);
  let items = [...estado.propuesta.items];
  for (const n of nuevos) {
    if (lapidas.has(n.id) || yaEstaConfirmado(estado, n.destino, n.valor)) continue;
    const i = items.findIndex((x) => x.id === n.id);
    if (i >= 0) {
      /* El mismo nivel desde el test y desde una reunión tienen el mismo id: queda el de la reunión
         (su frase, su riesgo a la vista); el test solo suma su fuente. */
      if (esNivelDelTest(n) && !esNivelDelTest(items[i])) {
        items[i] = { ...items[i], fuentes: unirFuentes(items[i].fuentes, n.fuentes) };
        continue;
      }
      items[i] = { ...n, fuentes: unirFuentes(items[i].fuentes, n.fuentes) };
      continue;
    }
    /* El test es la hipótesis más débil: al volver a preparar, su nivel no pisa uno pendiente que
       salió de una reunión o del portal, con su frase. */
    if (esNivelDelTest(n)) {
      const clave = claveDelDestino(n.destino);
      if (items.some((x) => claveDelDestino(x.destino) === clave && !lapidas.has(x.id) && !esNivelDelTest(x))) continue;
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
  | { op: "nota"; paso: string; texto: string }
  | { op: "medicion"; medicion: Medicion }
  | { op: "sinPortal"; valor: boolean }
  | { op: "casoDeUso"; useCaseId: string; valor: CasoDeUsoElegido | null }
  | { op: "usar"; itemId: string; valor?: unknown }
  /** «Usar todas»: cada una por su cuenta; la que ya no está o ya no corresponde se salta. */
  | { op: "usarVarias"; items: { itemId: string; valor?: unknown }[] }
  | { op: "descartar"; itemIds: string[] }
  | { op: "responsable"; email: string | null }
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
      const slug = (v as { slug: string | null }).slug;
      if (slug !== null && !validez.ediciones.has(slug)) return { ok: false, error: "Esa industria no tiene edición en la escala." };
      return { ok: true, estado: { ...estado, edicion: slug } };
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
      return { ok: true, estado: { ...estado, perfilCierre: op.cierre, perfilDespues: op.despues } };
    case "edicion":
      return aplicarAlDestino(estado, { tipo: "edicion" }, { slug: op.edicion }, validez, validador);
    case "nota": {
      const notas = { ...c.notas };
      if (op.texto.trim()) notas[op.paso] = op.texto;
      else delete notas[op.paso];
      return { ok: true, estado: { ...estado, contenido: { ...c, notas } } };
    }
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
      return {
        ok: true,
        estado: {
          ...estado,
          propuesta: { ...estado.propuesta, items: estado.propuesta.items.filter((x) => !ids.has(x.id)) },
          contenido: { ...c, descartadas: [...c.descartadas.filter((d) => !ids.has(d)), ...ids].slice(-MAX_DESCARTADAS) },
        },
      };
    }
    case "responsable":
      return { ok: true, estado: { ...estado, responsableEmail: op.email } };
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
  return (
    exacto({ ...antes.contenido, descartadas: [] }) !== exacto({ ...despues.contenido, descartadas: [] }) ||
    exacto(antes.areas) !== exacto(despues.areas) ||
    antes.edicion !== despues.edicion ||
    antes.perfilCierre !== despues.perfilCierre ||
    antes.perfilDespues !== despues.perfilDespues ||
    antes.responsableEmail !== despues.responsableEmail ||
    antes.archivada !== despues.archivada
  );
}
