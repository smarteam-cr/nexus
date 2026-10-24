/**
 * lib/clients/datos-de-la-empresa.ts — los datos de la empresa: el catálogo y la regla de quién manda (R1, 2026-10-24).
 * PURO y client-safe.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────────────────────────
 * De las 200 empresas, el TAM estaba vacío en todas, la industria vivía en cinco lugares sin regla de cuál manda y el
 * tamaño se leía de HubSpot en vivo sin guardarse. Desde el 24 oct cada dato vive en su columna de `Client`, con su
 * fuente y su fecha, y este catálogo dice, dato por dato, su tipo, sus opciones, su propiedad de HubSpot y quién manda.
 * Lo leen la pantalla «Datos de la empresa», el motor (`datos-de-la-empresa-server.ts`), la investigación, la carga
 * inicial y el espejo con HubSpot (`lib/hubspot/empresa.ts`). Decisión: DECISIONS › «Los datos de la empresa».
 *
 * ── QUIÉN MANDA ──────────────────────────────────────────────────────────────────────────────────
 * `quienManda` es la ÚNICA regla. Tres familias (`manda`):
 *   - `nexus`:   lo calcula Nexus (el TAM, la edición de la escala, Insider). Nexus lo aplica; si una persona lo corrigió,
 *                ya no lo pisa: lo propone.
 *   - `hubspot`: lo dice HubSpot (empleados, facturación, país, sitio, la industria de HubSpot). Lo de HubSpot se aplica,
 *                salvo que una persona lo haya corregido; lo demás solo llena lo vacío.
 *   - `persona`: lo decide una persona (industria de Smarteam, segmento, perfil, tráfico…). La IA siempre propone.
 * Una persona que puede decidir (`clientes.decidirDatos`) aplica directo; una que no, propone.
 */
import { CIERRES, DESPUES } from "@/lib/escala/documento/tipos";

// ── Las fuentes ──────────────────────────────────────────────────────────────────────────────────

export const FUENTES_DE_DATO = ["hubspot", "investigacion", "reunion", "persona", "nexus", "preventa", "test"] as const;
export type FuenteDeDato = (typeof FUENTES_DE_DATO)[number];

export const ETIQUETA_DE_LA_FUENTE: Record<FuenteDeDato, string> = {
  hubspot: "HubSpot",
  investigacion: "Investigación",
  reunion: "Reunión",
  persona: "Persona",
  nexus: "Calculado por Nexus",
  preventa: "Preventa",
  test: "Test",
};

export function esFuenteDeDato(x: unknown): x is FuenteDeDato {
  return typeof x === "string" && (FUENTES_DE_DATO as readonly string[]).includes(x);
}

/** Las que son IA: nunca deciden un dato de persona, ni pisan lo que una persona corrigió. */
const FUENTES_DE_IA: ReadonlySet<FuenteDeDato> = new Set(["investigacion", "reunion", "nexus"]);

/** ¿La sugirió la IA? (la pantalla le pone la chispa). Una sola lista, la del motor. */
export function esFuenteDeIA(f: FuenteDeDato): boolean {
  return FUENTES_DE_IA.has(f);
}
/** Las que vienen de una persona en otro lado (HubSpot, la preventa, el test): llenan lo vacío de un dato de persona. */
const FUENTES_HUMANAS_DE_AFUERA: ReadonlySet<FuenteDeDato> = new Set(["hubspot", "preventa", "test"]);

// ── El catálogo ──────────────────────────────────────────────────────────────────────────────────

export const CLAVES_DE_DATO = [
  "pais",
  "sitioWeb",
  "industriaSmarteam",
  "edicionEscala",
  "industry",
  "segmento",
  "empleados",
  "estructura",
  "filiales",
  "facturacionAnualUsd",
  "aQuienVende",
  "perfilCierre",
  "perfilDespues",
  "trafico",
  "baseConsentimiento",
  "calificaInsider",
  "tamUsd",
] as const;
export type ClaveDeDato = (typeof CLAVES_DE_DATO)[number];

export type TipoDeDato = "entero" | "dinero" | "texto" | "opcion";
export type Manda = "nexus" | "hubspot" | "persona";
/** escribe = Nexus → HubSpot; los_dos = y vuelve en la copia; lee = solo se lee. */
export type Sentido = "escribe" | "los_dos" | "lee";
export type GrupoDeDato = "quien" | "tamano" | "vende" | "potencial";
export type ValorDeDato = number | string;

export interface OpcionDeDato {
  valor: string;
  etiqueta: string;
}

export interface DatoDeLaEmpresa {
  clave: ClaveDeDato;
  etiqueta: string;
  grupo: GrupoDeDato;
  tipo: TipoDeDato;
  opciones?: readonly OpcionDeDato[];
  /**
   * La lista de opciones es la de HOY y puede crecer fuera del código (las ediciones de la escala salen del documento
   * publicado): un valor que no está en la lista se acepta si tiene forma de clave (`ecommerce-retail`).
   */
  opcionesAbiertas?: boolean;
  /** Los límites de un número (el TAM conserva el techo de 100 millones de DECISIONS «Qué ES una empresa»). */
  min?: number;
  max?: number;
  manda: Manda;
  /** La propiedad de la empresa en el HubSpot de Smarteam. `existe: false` = se crea con R2 (simulacro y el sí de Elías). */
  hubspot: { propiedad: string; existe: boolean; sentido: Sentido } | null;
  /** Lo que ve quien lo edita, debajo del campo. */
  ayuda: string;
  /**
   * De dónde salió un valor que ya estaba ANTES de que existiera su fuente (2026-10-24): el TAM viejo lo escribió una
   * persona a mano (el formulario de Ventas) y la industria vieja vino de HubSpot. Sin esto, el cálculo de Nexus pisaría
   * un TAM que alguien estimó.
   */
  fuenteDeLoViejo?: FuenteDeDato;
}

/** «Industria (Smarteam)» de HubSpot (`industria__smarteam_`, 17 opciones, leídas del portal el 2026-10-24). El valor es
 *  el de HubSpot, tal cual. `edicion` es la edición de la escala que le corresponde (null = la escala general). */
export const INDUSTRIAS_DE_SMARTEAM: readonly (OpcionDeDato & { edicion: string | null })[] = [
  { valor: "Agrícola", etiqueta: "Agrícola", edicion: null },
  { valor: "Agroindustria", etiqueta: "Agroindustria", edicion: null },
  { valor: "Alimentos y bebidas", etiqueta: "Alimentos y bebidas", edicion: null },
  { valor: "Automotriz", etiqueta: "Automotriz", edicion: "automotriz" },
  { valor: "Construcción", etiqueta: "Construcción", edicion: null },
  { valor: "Consultoria", etiqueta: "Consultoría", edicion: null },
  { valor: "Educación", etiqueta: "Educación", edicion: "educacion" },
  { valor: "Inmobiliaria", etiqueta: "Inmobiliaria", edicion: "inmobiliaria" },
  { valor: "Institución de gobierno", etiqueta: "Institución de gobierno", edicion: null },
  { valor: "Logística y Transporte", etiqueta: "Logística y transporte", edicion: null },
  { valor: "Municipalidad", etiqueta: "Municipalidad", edicion: null },
  { valor: "Retail Especializado", etiqueta: "Retail especializado", edicion: "ecommerce-retail" },
  { valor: "Salud", etiqueta: "Salud", edicion: null },
  { valor: "Servicios", etiqueta: "Servicios", edicion: null },
  { valor: "Software", etiqueta: "Software", edicion: null },
  { valor: "Tecnologia", etiqueta: "Tecnología", edicion: null },
  { valor: "Turismo", etiqueta: "Turismo", edicion: "turismo" },
];

/** Las ediciones de la escala publicadas (`*Clave:*` en docs/escala/escala_rendimiento_smarteam.md, 24 oct). */
export const EDICIONES_DE_LA_ESCALA: readonly OpcionDeDato[] = [
  { valor: "ecommerce-retail", etiqueta: "Ecommerce y retail" },
  { valor: "banca", etiqueta: "Banca y servicios financieros" },
  { valor: "educacion", etiqueta: "Educación" },
  { valor: "inmobiliaria", etiqueta: "Inmobiliaria" },
  { valor: "turismo", etiqueta: "Turismo" },
  { valor: "automotriz", etiqueta: "Automotriz" },
];

const op = (pares: readonly (readonly [string, string])[]): OpcionDeDato[] => pares.map(([valor, etiqueta]) => ({ valor, etiqueta }));

export const CATALOGO_DE_DATOS: readonly DatoDeLaEmpresa[] = [
  {
    clave: "pais",
    etiqueta: "País",
    grupo: "quien",
    tipo: "texto",
    manda: "hubspot",
    hubspot: { propiedad: "country", existe: true, sentido: "los_dos" },
    ayuda: "El país de la casa matriz.",
  },
  {
    clave: "sitioWeb",
    etiqueta: "Sitio web",
    grupo: "quien",
    tipo: "texto",
    manda: "hubspot",
    hubspot: { propiedad: "domain", existe: true, sentido: "lee" },
    ayuda: "El dominio, sin «https://» (p. ej. empresa.com).",
  },
  {
    clave: "industriaSmarteam",
    etiqueta: "Industria de Smarteam",
    grupo: "quien",
    tipo: "opcion",
    opciones: INDUSTRIAS_DE_SMARTEAM.map(({ valor, etiqueta }) => ({ valor, etiqueta })),
    manda: "persona",
    hubspot: { propiedad: "industria__smarteam_", existe: true, sentido: "los_dos" },
    ayuda: "Decide la edición de la escala, la exploración y el diagnóstico.",
  },
  {
    clave: "edicionEscala",
    etiqueta: "Edición de la escala",
    grupo: "quien",
    tipo: "opcion",
    opciones: EDICIONES_DE_LA_ESCALA,
    opcionesAbiertas: true,
    manda: "nexus",
    hubspot: null,
    ayuda: "Sale de la industria de Smarteam. Vacía = la escala general.",
  },
  {
    clave: "industry",
    etiqueta: "Industria en HubSpot",
    grupo: "quien",
    tipo: "texto",
    manda: "hubspot",
    hubspot: { propiedad: "industry", existe: true, sentido: "lee" },
    ayuda: "La lista estándar de HubSpot.",
    fuenteDeLoViejo: "hubspot",
  },
  {
    clave: "segmento",
    etiqueta: "Segmento",
    grupo: "quien",
    tipo: "opcion",
    opciones: op([
      ["estandar", "Estándar"],
      ["corporativo", "Corporativo"],
      ["gobierno", "Gobierno"],
    ]),
    manda: "persona",
    hubspot: null,
    ayuda: "Decide la tarifa de los servicios cuando el TAM los sume.",
  },
  {
    clave: "empleados",
    etiqueta: "Empleados",
    grupo: "tamano",
    tipo: "entero",
    min: 1,
    max: 5_000_000,
    manda: "hubspot",
    hubspot: { propiedad: "numberofemployees", existe: true, sentido: "los_dos" },
    ayuda: "Todos, sumando las filiales.",
  },
  {
    clave: "estructura",
    etiqueta: "Casa matriz o filial",
    grupo: "tamano",
    tipo: "opcion",
    opciones: op([
      ["independiente", "Empresa sin filiales"],
      ["casa_matriz", "Casa matriz"],
      ["filial", "Filial de otra empresa"],
    ]),
    manda: "persona",
    hubspot: null,
    ayuda: "Una casa matriz con filiales necesita más asientos y a veces Enterprise.",
  },
  {
    clave: "filiales",
    etiqueta: "Filiales",
    grupo: "tamano",
    tipo: "entero",
    min: 0,
    max: 1000,
    manda: "persona",
    hubspot: null,
    ayuda: "Cuántas filiales tiene la casa matriz.",
  },
  {
    clave: "facturacionAnualUsd",
    etiqueta: "Facturación anual (USD)",
    grupo: "tamano",
    tipo: "dinero",
    min: 0,
    // El techo de la columna (Decimal(14,2)): un valor más grande daría un error de la base, no un aviso.
    max: 999_999_999_999,
    manda: "hubspot",
    hubspot: { propiedad: "annualrevenue", existe: true, sentido: "los_dos" },
    ayuda: "Lo que vende en un año, en dólares.",
  },
  {
    clave: "aQuienVende",
    etiqueta: "A quién le vende",
    grupo: "vende",
    tipo: "opcion",
    opciones: op([
      ["empresas", "A empresas"],
      ["personas", "A personas"],
      ["ambos", "A empresas y a personas"],
    ]),
    manda: "persona",
    hubspot: { propiedad: "nexus_a_quien_vende", existe: false, sentido: "escribe" },
    ayuda: "Su cliente, no el de Smarteam.",
  },
  {
    clave: "perfilCierre",
    etiqueta: "Cómo cierra la venta",
    grupo: "vende",
    tipo: "opcion",
    opciones: CIERRES.map((c) => ({ valor: c, etiqueta: c === "con equipo" ? "Con equipo de ventas" : c === "transaccional" ? "Transaccional (sin vendedor)" : "Mixta" })),
    manda: "persona",
    hubspot: { propiedad: "nexus_perfil_cierre", existe: false, sentido: "escribe" },
    ayuda: "Con las palabras de la escala: con equipo, transaccional o mixta.",
  },
  {
    clave: "perfilDespues",
    etiqueta: "Qué pasa después",
    grupo: "vende",
    tipo: "opcion",
    opciones: DESPUES.map((d) => ({ valor: d, etiqueta: d === "única" ? "Una sola compra" : d === "recompra" ? "Recompra" : "Relación continua" })),
    manda: "persona",
    hubspot: { propiedad: "nexus_perfil_despues", existe: false, sentido: "escribe" },
    ayuda: "Si el cliente vuelve a comprar o tiene una relación continua.",
  },
  {
    clave: "trafico",
    etiqueta: "Tráfico del sitio",
    grupo: "vende",
    tipo: "opcion",
    opciones: op([
      ["menos_10k", "Menos de 10 mil visitas al mes"],
      ["10k_50k", "De 10 mil a 50 mil visitas al mes"],
      ["50k_200k", "De 50 mil a 200 mil visitas al mes"],
      ["200k_1m", "De 200 mil a 1 millón de visitas al mes"],
      ["mas_1m", "Más de 1 millón de visitas al mes"],
    ]),
    manda: "persona",
    hubspot: { propiedad: "nexus_trafico", existe: false, sentido: "escribe" },
    ayuda: "Personalizar al visitante anónimo solo funciona con tráfico suficiente.",
  },
  {
    clave: "baseConsentimiento",
    etiqueta: "Base con consentimiento",
    grupo: "vende",
    tipo: "opcion",
    opciones: op([
      ["menos_1k", "Menos de mil contactos"],
      ["1k_10k", "De mil a 10 mil contactos"],
      ["10k_50k", "De 10 mil a 50 mil contactos"],
      ["50k_200k", "De 50 mil a 200 mil contactos"],
      ["mas_200k", "Más de 200 mil contactos"],
    ]),
    manda: "persona",
    hubspot: { propiedad: "nexus_base_consentimiento", existe: false, sentido: "escribe" },
    ayuda: "Los contactos que aceptaron recibir sus comunicaciones.",
  },
  {
    clave: "calificaInsider",
    etiqueta: "Califica para Insider",
    grupo: "potencial",
    tipo: "opcion",
    opciones: op([
      ["lista", "Lista"],
      ["casi_lista", "Casi lista"],
      ["todavia_no", "Todavía no"],
      ["sin_evaluar", "Sin evaluar"],
    ]),
    manda: "nexus",
    hubspot: { propiedad: "nexus_califica_insider", existe: false, sentido: "escribe" },
    ayuda: "La calcula la lectura de preparación de la escala (N6); mientras tanto la marca una persona.",
  },
  {
    clave: "tamUsd",
    etiqueta: "TAM estimado (USD al año)",
    grupo: "potencial",
    tipo: "dinero",
    min: 0,
    max: 100_000_000,
    manda: "nexus",
    hubspot: { propiedad: "tam__potencial", existe: true, sentido: "escribe" },
    ayuda: "Cuánto le podría vender Smarteam en un año. Lo ve solo el equipo.",
    fuenteDeLoViejo: "persona",
  },
];

const POR_CLAVE = new Map(CATALOGO_DE_DATOS.map((d) => [d.clave, d]));

export function datoDeLaEmpresa(clave: ClaveDeDato): DatoDeLaEmpresa {
  const d = POR_CLAVE.get(clave);
  if (!d) throw new Error(`dato desconocido: ${clave}`);
  return d;
}

/** Las columnas de `Client` de un dato. El TAM conserva su nombre histórico (`tamUsd`) y su fuente se llama `tamFuente`. */
export function columnasDelDato(clave: ClaveDeDato): { valor: ClaveDeDato; fuente: string; at: string } {
  const base = clave === "tamUsd" ? "tam" : clave;
  return { valor: clave, fuente: `${base}Fuente`, at: `${base}At` };
}

/** El `select` de todas las columnas de los datos (valor, fuente y fecha) y del cálculo del TAM, para Prisma. */
export const SELECT_DE_LOS_DATOS: Readonly<Record<string, true>> = {
  ...Object.fromEntries(
    CATALOGO_DE_DATOS.flatMap((d) => {
      const c = columnasDelDato(d.clave);
      return [
        [c.valor, true],
        [c.fuente, true],
        [c.at, true],
      ];
    }),
  ),
  tamCalculo: true,
};

/**
 * Al fusionar dos fichas (scripts/merge-duplicate-clients.ts): los datos que la que sigue no tiene y la absorbida sí,
 * con su fuente y su fecha. Lo que la que sigue ya tiene no se toca (su historia se muda entera con `PropuestaDeDato`).
 */
export function plegarDatosDeLaEmpresa(sigue: Readonly<Record<string, unknown>>, absorbida: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const cambios: Record<string, unknown> = {};
  for (const d of CATALOGO_DE_DATOS) {
    const c = columnasDelDato(d.clave);
    const vacio = (v: unknown) => v === null || v === undefined;
    // Lo que una persona vació a propósito en la que sigue tampoco se rellena al fusionar.
    if (vacio(sigue[c.valor]) && sigue[c.fuente] !== "persona" && !vacio(absorbida[c.valor])) {
      cambios[c.valor] = absorbida[c.valor];
      cambios[c.fuente] = absorbida[c.fuente] ?? null;
      cambios[c.at] = absorbida[c.at] ?? null;
      // El TAM viaja con su cálculo: sin él, la ficha no diría cómo se calculó ni qué le falta.
      if (d.clave === "tamUsd") cambios.tamCalculo = absorbida.tamCalculo ?? null;
    }
  }
  return cambios;
}

/** La edición de la escala que le toca a una industria de Smarteam (null = la general, o una industria que no está). */
export function edicionDeLaIndustria(industria: string | null | undefined): string | null {
  return INDUSTRIAS_DE_SMARTEAM.find((i) => i.valor === industria)?.edicion ?? null;
}

// ── Los valores ──────────────────────────────────────────────────────────────────────────────────

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export type LecturaDeValor = { ok: true; valor: ValorDeDato | null } | { ok: false; error: string };

/**
 * Un valor crudo (de un formulario, de HubSpot o del agente) al tipo del dato. `null`, `undefined` y el texto vacío son
 * «sin dato». Una opción se acepta por su valor o por su etiqueta, sin importar tildes ni mayúsculas.
 */
export function leerValor(dato: DatoDeLaEmpresa, crudo: unknown): LecturaDeValor {
  if (crudo === null || crudo === undefined || (typeof crudo === "string" && crudo.trim() === "")) return { ok: true, valor: null };
  if (dato.tipo === "entero" || dato.tipo === "dinero") {
    const leido = typeof crudo === "number" ? { ok: true as const, n: crudo } : typeof crudo === "string" ? numeroEscrito(crudo, dato.tipo === "dinero") : null;
    if (!leido) return { ok: false, error: `${dato.etiqueta}: tiene que ser un número.` };
    if (!leido.ok) return { ok: false, error: `${dato.etiqueta}: ${leido.error}` };
    const n = leido.n;
    if (!Number.isFinite(n)) return { ok: false, error: `${dato.etiqueta}: tiene que ser un número.` };
    const v = dato.tipo === "entero" ? Math.round(n) : Math.round(n * 100) / 100;
    // Una persona que escribe «12.5» empleados se equivocó; un número que llega calculado (el punto medio de «51-200»
    // que da la investigación) se redondea: rechazarlo dejaba a la empresa sin empleados y sin TAM, en silencio.
    if (dato.tipo === "entero" && !Number.isInteger(n) && typeof crudo === "string") return { ok: false, error: `${dato.etiqueta}: tiene que ser un número entero.` };
    if (dato.min !== undefined && v < dato.min) return { ok: false, error: `${dato.etiqueta}: no puede ser menor que ${dato.min}.` };
    if (dato.max !== undefined && v > dato.max) return { ok: false, error: `${dato.etiqueta}: no puede pasar de ${dato.max.toLocaleString("es")}.` };
    return { ok: true, valor: v };
  }
  if (typeof crudo !== "string" && typeof crudo !== "number") return { ok: false, error: `${dato.etiqueta}: valor inválido.` };
  const texto = String(crudo).trim();
  if (dato.tipo === "opcion") {
    const buscado = sinTildes(texto);
    const opcion = dato.opciones?.find((o) => sinTildes(o.valor) === buscado || sinTildes(o.etiqueta) === buscado);
    if (opcion) return { ok: true, valor: opcion.valor };
    if (dato.opcionesAbiertas && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(texto)) return { ok: true, valor: texto };
    return { ok: false, error: `${dato.etiqueta}: «${texto}» no es una de las opciones.` };
  }
  if (texto.length > 300) return { ok: false, error: `${dato.etiqueta}: es demasiado largo.` };
  return { ok: true, valor: dato.clave === "sitioWeb" ? dominioDelSitio(texto) : texto };
}

/**
 * Un número escrito por una persona. Sin adivinar separadores: «50.000» puede ser cincuenta mil (como se escribe en
 * Costa Rica) o cincuenta (como lo lee `Number`), y guardar mil veces menos es peor que pedir que se escriba de nuevo.
 * Se aceptan dígitos y, con decimales, un punto con uno o dos decimales («1234.5»). Una coma, o un punto seguido de
 * tres dígitos, se rechazan con el porqué.
 */
export function numeroEscrito(texto: string, conDecimales: boolean): { ok: true; n: number } | { ok: false; error: string } {
  const t = texto.replace(/\s/g, "");
  if (/,/.test(t) || /\.\d{3}(\D|$)/.test(t)) return { ok: false, error: "escríbelo sin puntos ni comas de miles (por ejemplo, 50000)." };
  if (conDecimales ? !/^-?\d+(\.\d{1,2})?$/.test(t) : !/^-?\d+$/.test(t)) return { ok: false, error: "tiene que ser un número." };
  return { ok: true, n: Number(t) };
}

/** «https://www.Empresa.com/nosotros» → «empresa.com». */
export function dominioDelSitio(texto: string): string {
  const t = texto.trim().toLowerCase();
  try {
    return new URL(/^https?:\/\//.test(t) ? t : `https://${t}`).hostname.replace(/^www\./, "");
  } catch {
    return t.replace(/^www\./, "");
  }
}

/** Cómo se lee un valor en la pantalla: la etiqueta de la opción, o el número con sus separadores. */
export function valorParaMostrar(dato: DatoDeLaEmpresa, valor: ValorDeDato | null): string | null {
  if (valor === null) return null;
  if (dato.tipo === "opcion") return dato.opciones?.find((o) => o.valor === valor)?.etiqueta ?? String(valor);
  if (dato.tipo === "dinero") return `US$ ${Number(valor).toLocaleString("es-CR", { maximumFractionDigits: 0 })}`;
  if (dato.tipo === "entero") return Number(valor).toLocaleString("es-CR");
  return String(valor);
}

const iguales = (a: ValorDeDato | null, b: ValorDeDato | null) =>
  a === null || b === null ? a === b : typeof a === "number" || typeof b === "number" ? Number(a) === Number(b) : a === b;

// ── Quién manda ──────────────────────────────────────────────────────────────────────────────────

export interface EntradaDeQuienManda {
  dato: DatoDeLaEmpresa;
  actual: { valor: ValorDeDato | null; fuente: FuenteDeDato | null };
  propuesta: { valor: ValorDeDato | null; fuente: FuenteDeDato };
  /** Solo cuenta cuando la fuente es una persona: tiene `clientes.decidirDatos`. */
  puedeDecidir: boolean;
}

export type Veredicto = { accion: "aplicar" | "proponer" | "nada"; motivo: string };

/**
 * Qué se hace con un valor que llega para un dato: aplicarlo, dejarlo como propuesta para que lo decida una persona,
 * o nada. La regla está escrita entera en DECISIONS › «Los datos de la empresa» (punto 4).
 */
export function quienManda({ dato, actual, propuesta, puedeDecidir }: EntradaDeQuienManda): Veredicto {
  if (iguales(actual.valor, propuesta.valor)) return { accion: "nada", motivo: "ya tiene ese valor" };

  if (propuesta.fuente === "persona") {
    return puedeDecidir
      ? { accion: "aplicar", motivo: "lo decide quien lo está usando" }
      : { accion: "proponer", motivo: "lo decide el CSE, la CSL o Ventas" };
  }
  const actualVacio = actual.valor === null;
  // Solo una persona borra un dato: que HubSpot o la investigación no lo encuentren no es saber que no existe. Lo que
  // Nexus deriva sí puede quedar vacío (otra industria → la escala general), y se mira abajo.
  if (propuesta.valor === null && (dato.manda !== "nexus" || propuesta.fuente !== "nexus")) {
    return { accion: "nada", motivo: "un dato vacío no borra lo que hay" };
  }
  // Lo que una persona decidió no lo pisa nadie más, tampoco si lo dejó vacío a propósito (vaciar el TAM porque no le
  // cree): con fuente «persona», hasta el vacío es una decisión.
  if (actual.fuente === "persona") return { accion: "proponer", motivo: "una persona lo decidió: no se pisa" };
  if (propuesta.valor === null) {
    return actual.fuente === "nexus" || actual.fuente === null
      ? { accion: "aplicar", motivo: "lo calcula Nexus" }
      : { accion: "proponer", motivo: "lo puso una persona: Nexus lo propone" };
  }

  const ia = FUENTES_DE_IA.has(propuesta.fuente);

  switch (dato.manda) {
    case "nexus":
      // Nexus recalcula lo suyo; lo que puso otra persona (el vendedor en la preventa, alguien en HubSpot) no lo pisa.
      if (propuesta.fuente === "nexus") {
        return actualVacio || actual.fuente === "nexus" || actual.fuente === null
          ? { accion: "aplicar", motivo: "lo calcula Nexus" }
          : { accion: "proponer", motivo: "lo puso una persona: Nexus lo propone" };
      }
      if (actualVacio && !ia) return { accion: "aplicar", motivo: "estaba vacío" };
      return { accion: "proponer", motivo: "lo calcula Nexus: otra fuente lo propone" };
    case "hubspot":
      if (propuesta.fuente === "hubspot") return { accion: "aplicar", motivo: "manda HubSpot" };
      if (actualVacio) return { accion: "aplicar", motivo: "HubSpot no lo tiene: Nexus lo llena" };
      return { accion: "proponer", motivo: "manda HubSpot: se propone" };
    case "persona":
      if (ia) return { accion: "proponer", motivo: "lo decide una persona" };
      if (actualVacio && FUENTES_HUMANAS_DE_AFUERA.has(propuesta.fuente)) return { accion: "aplicar", motivo: "estaba vacío" };
      if (actual.fuente === propuesta.fuente && FUENTES_HUMANAS_DE_AFUERA.has(propuesta.fuente)) {
        return { accion: "aplicar", motivo: "lo cambió quien lo había puesto" };
      }
      return { accion: "proponer", motivo: "lo decide una persona" };
  }
}

// ── Las propuestas ───────────────────────────────────────────────────────────────────────────────

export const ESTADOS_DE_PROPUESTA = ["pendiente", "usada", "editada", "descartada", "aplicada", "reemplazada"] as const;
export type EstadoDePropuesta = (typeof ESTADOS_DE_PROPUESTA)[number];

/** El contador de la ficha: «3 datos por revisar» (los datos, no las propuestas: dos sobre el mismo cuentan una). */
export function textoDelContador(datosPorRevisar: number): string | null {
  if (datosPorRevisar <= 0) return null;
  return datosPorRevisar === 1 ? "1 dato por revisar" : `${datosPorRevisar} datos por revisar`;
}
