/**
 * lib/casos-de-uso/armado.ts — cómo se arma un caso de uso de la preventa con la biblioteca de actividades. PURO y
 * client-safe (lo usan el paso «Casos de uso», el agente y sus pruebas).
 *
 * Pedido de Elías (2026-11-08, con Centauro Solutions): que el agente que sugiere casos use la biblioteca de casos y de
 * actividades, y arme casos PERSONALIZADOS para la empresa; que en el paso se quiten y se pongan actividades; que cada
 * caso diga su precio mínimo y cómo subir el ticket vendiendo por valor; y que las preventas en curso se puedan
 * regenerar, con Ctrl+Z.
 *
 * - Un caso elegido guarda sus actividades (`actividades`) solo cuando son suyas: las armó el agente o las cambió el
 *   vendedor. Sin ellas, un caso del catálogo usa las que vienen marcadas en su ficha (`actividadesPorDefecto`).
 * - Una actividad del caso apunta a la biblioteca por su id y guarda solo lo propio del caso (cómo se llama ahí, las
 *   veces, sobre qué y las veces de sus partes variables). Las horas salen de la biblioteca, nunca se copian
 *   (docs/actividades-plan.md › «La actividad como dato»).
 * - Precio mínimo = horas × tarifa del segmento de la empresa (`TARIFAS`). Sin segmento, la Estándar, y se dice.
 * - El argumento de valor es del vendedor: nunca llega a la propuesta que ve el cliente. Una cifra solo vale si aparece
 *   en lo que se sabe de la empresa (`validarValorDelAgente`); si no, pasa a «lo que falta averiguar».
 */
import type { ActividadDeLaBiblioteca, ActividadesDelCaso } from "./actividades";
import { palabrasSinArticulos, TARIFAS, type ComoSeComparte, type EtapaDeActividad } from "./actividades-puras";

// ── Los datos ────────────────────────────────────────────────────────────────────────────────────

/** Una actividad de un caso elegido en la preventa. */
export interface ActividadDelCaso {
  /** El id en la biblioteca. */
  actividadId: string;
  /** Cómo se llama en este caso («Configurar la aprobación de cotizaciones»). */
  nombre: string;
  veces: number;
  /** De qué trata, cuando se comparte por «sobre qué» («WhatsApp»). */
  sobreQue?: string;
  /** Las veces de sus partes variables en este caso, por su clave (una sola sesión de mapeo: `{ sesion: 1 }`). */
  partes?: Record<string, number>;
}

/** Cómo subir el ticket vendiendo por valor. Interno: lo lee el vendedor, nunca el cliente. */
export interface ValorDeVenta {
  /** De qué lado viene el valor: el costo de la mala calidad, el ingreso que se pierde, el tiempo del equipo, el riesgo. */
  palanca: string;
  /** El argumento, en dos o tres frases, con los números del cliente si los hay. */
  argumento: string;
  /** Los números del cliente que lo sostienen, cada uno con de dónde sale («Reunión del 5 nov»). */
  numeros: { dato: string; fuente: string }[];
  /** Los números que faltan averiguar para hacer la cuenta. */
  falta: string[];
}

/**
 * La palanca de valor en palabras de quien vende (pedido de Elías del 2026-11-08: «costo de la mala calidad» no se
 * entendía). Lo guardado sigue con la palanca de siempre; esto es solo cómo se lee.
 */
const PALANCA_EN_PALABRAS: Readonly<Record<string, string>> = {
  "costo de la mala calidad": "lo que hoy le cuestan los errores",
  "ingreso que se pierde": "las ventas que hoy se le escapan",
  "tiempo del equipo": "las horas que hoy pierde su equipo",
  riesgo: "el riesgo que corre hoy",
  crecimiento: "lo que puede crecer",
};

export function palancaEnPalabras(palanca: string): string {
  return PALANCA_EN_PALABRAS[palanca.trim().toLowerCase()] ?? palanca.trim();
}

/**
 * Para quien vende (2026-11-08): por qué el caso tiene sentido para ESTA empresa y cómo se armó con las actividades
 * (cuáles sí y cuáles no). Interno: nunca llega a la propuesta del cliente.
 */
export interface ParaVentas {
  porQue: string;
  comoSeArma: string;
}

/** El caso en el plan que propuso el agente (2026-11-08): su lugar (1 = el primero) y por qué va ahí. */
export interface LugarEnElPlan {
  paso: number;
  /** Por qué va después del anterior; vacío en el primero. */
  despuesDe?: string;
}

/** La actividad de la biblioteca como la necesita la pantalla: sin lo que pesa (reglas, incluye…). */
export interface ActividadLigera {
  id: string;
  nombre: string;
  etapa: EtapaDeActividad;
  resumen: string;
  horasPendientes: boolean;
  seRepite: boolean;
  comparte: ComoSeComparte;
  quien: string;
  equipos: string[];
  /**
   * De qué está hecho su tiempo. `nombre` y `conElCliente` (décima vuelta, 2026-11-08): el reparto que se ve en el paso
   * («1 h con el cliente · 1 h interna»). Opcionales: lo armado a mano en las pruebas no los trae.
   */
  partes: { clave: string; horas: number; veces: number; variable: boolean; nombre?: string; conElCliente?: boolean }[];
  /** Qué incluye, en sus líneas de la biblioteca (el ⓘ de cada actividad). */
  incluye?: string[];
}

export function bibliotecaLigera(biblioteca: readonly ActividadDeLaBiblioteca[]): ActividadLigera[] {
  return biblioteca.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    etapa: a.etapa,
    resumen: a.resumen,
    horasPendientes: a.horasPendientes,
    seRepite: a.seRepite,
    comparte: a.comparte,
    quien: a.quien,
    equipos: [...a.equipos],
    partes: a.partes.map((p) => ({ clave: p.clave, horas: p.horas, veces: p.veces, variable: p.variable, nombre: p.nombre, conElCliente: p.conElCliente })),
    incluye: [...a.incluye],
  }));
}

/** Las actividades marcadas por defecto en la ficha de un caso del catálogo, con lo propio de cada fila. */
export function actividadesPorDefecto(caso: Pick<ActividadesDelCaso, "actividades">): ActividadDelCaso[] {
  return caso.actividades
    .filter((f) => f.porDefecto)
    .map((f) => {
      // Solo las partes que el caso cambia: las demás salen de la biblioteca.
      const partes = Object.fromEntries(f.reparto.filter((p) => p.variable).map((p) => [p.clave, p.veces]));
      return {
        actividadId: f.actividadId,
        nombre: f.nombre,
        veces: f.veces,
        ...(f.sobreQue ? { sobreQue: f.sobreQue } : {}),
        ...(Object.keys(partes).length ? { partes } : {}),
      };
    });
}

// ── Las cuentas ──────────────────────────────────────────────────────────────────────────────────

/** Las horas de UNA vez de la actividad, con las veces de sus partes en este caso. 0 si la define Diseño o Dev. */
export function horasPorVez(a: Pick<ActividadDelCaso, "partes">, lib: Pick<ActividadLigera, "horasPendientes" | "partes">): number {
  if (lib.horasPendientes) return 0;
  return lib.partes.reduce((s, p) => s + p.horas * (p.variable ? (a.partes?.[p.clave] ?? p.veces) : p.veces), 0);
}

export function horasDeLaActividad(a: ActividadDelCaso, lib: Pick<ActividadLigera, "horasPendientes" | "partes">): number {
  return a.veces * horasPorVez(a, lib);
}

/** Las horas de la actividad en este caso, repartidas: con el cliente (sesiones) e internas (Smarteam a solas). */
export interface RepartoDeLaActividad {
  conElCliente: number;
  internas: number;
  /** Cada parte con sus horas en este caso (las veces de la actividad incluidas). */
  partes: { nombre: string; horas: number; conElCliente: boolean }[];
}

/**
 * El reparto de una actividad en este caso (décima vuelta, 2026-11-08: Elías quiere ver cómo se reparte el tiempo de
 * cada actividad). Una parte sin el dato cuenta como interna. Vacío si la define Diseño o Dev.
 */
export function repartoDeLaActividad(a: ActividadDelCaso, lib: Pick<ActividadLigera, "horasPendientes" | "partes">): RepartoDeLaActividad {
  if (lib.horasPendientes) return { conElCliente: 0, internas: 0, partes: [] };
  const partes = lib.partes
    .map((p) => ({ nombre: p.nombre ?? p.clave, horas: a.veces * p.horas * (p.variable ? (a.partes?.[p.clave] ?? p.veces) : p.veces), conElCliente: p.conElCliente === true }))
    .filter((p) => p.horas > 0);
  const suma = (xs: typeof partes) => xs.reduce((s, p) => s + p.horas, 0);
  return { conElCliente: suma(partes.filter((p) => p.conElCliente)), internas: suma(partes.filter((p) => !p.conElCliente)), partes };
}

/** El reparto de todo el caso: la suma del de cada actividad (las que define Diseño o Dev no cuentan). */
export function repartoDelCaso(
  actividades: readonly ActividadDelCaso[],
  porId: ReadonlyMap<string, Pick<ActividadLigera, "horasPendientes" | "partes">>,
): { conElCliente: number; internas: number } {
  return actividades.reduce(
    (s, a) => {
      const lib = porId.get(a.actividadId);
      if (!lib) return s;
      const r = repartoDeLaActividad(a, lib);
      return { conElCliente: s.conElCliente + r.conElCliente, internas: s.internas + r.internas };
    },
    { conElCliente: 0, internas: 0 },
  );
}

export interface HorasDelCaso {
  horas: number;
  /** Quién define lo que falta («Dev», «Diseño»): esas actividades cuentan 0 hasta que lo definan. */
  sinTiempo: string[];
}

function quienDefine(quien: string): string {
  return quien.startsWith("Dev") ? "Dev" : quien.startsWith("Diseño") ? "Diseño" : "lo que falta definir";
}

export function horasDelCaso(actividades: readonly ActividadDelCaso[], porId: ReadonlyMap<string, ActividadLigera>): HorasDelCaso {
  let horas = 0;
  const sinTiempo = new Set<string>();
  for (const a of actividades) {
    const lib = porId.get(a.actividadId);
    if (!lib) continue;
    if (lib.horasPendientes) sinTiempo.add(quienDefine(lib.quien));
    horas += horasDeLaActividad(a, lib);
  }
  return { horas, sinTiempo: [...sinTiempo] };
}

export type ClaveDeTarifa = (typeof TARIFAS)[number]["clave"];

export interface TarifaDeLaEmpresa {
  clave: ClaveDeTarifa;
  nombre: string;
  usdPorHora: number;
  /** El segmento de la empresa no está definido: se usó la Estándar. */
  supuesta: boolean;
}

/** La tarifa del segmento de la empresa (`Client.segmento`). Sin segmento, o uno que no existe, la Estándar. */
export function tarifaDe(segmento: string | null | undefined): TarifaDeLaEmpresa {
  const t = TARIFAS.find((x) => x.clave === segmento);
  if (t) return { clave: t.clave, nombre: t.nombre, usdPorHora: t.usdPorHora, supuesta: false };
  const e = TARIFAS[0];
  return { clave: e.clave, nombre: e.nombre, usdPorHora: e.usdPorHora, supuesta: true };
}

/** El precio mínimo: horas × tarifa. Lo que define Diseño o Dev queda afuera (y la pantalla lo dice). */
export function precioMinimo(horas: number, tarifa: Pick<TarifaDeLaEmpresa, "usdPorHora">): number {
  return Math.round(horas * tarifa.usdPorHora);
}

/**
 * Las horas de la venta entera: lo que se comparte en la venta va una vez (con las veces del caso que más trae); lo que
 * se comparte «sobre lo mismo», una vez por «sobre qué» (sin decirlo, en cada caso); lo demás, en cada caso.
 */
export function horasDeLaVenta(casos: readonly (readonly ActividadDelCaso[])[], porId: ReadonlyMap<string, ActividadLigera>): number {
  const compartidas = new Map<string, number>();
  let horas = 0;
  for (const acts of casos)
    for (const a of acts) {
      const lib = porId.get(a.actividadId);
      if (!lib) continue;
      const h = horasDeLaActividad(a, lib);
      // Sobre lo mismo, escrito igual: la misma regla que la ficha del catálogo (`horasCompartidas`).
      const sobre = (a.sobreQue ?? "").trim();
      const clave = lib.comparte === "venta" ? a.actividadId : lib.comparte === "sobreQue" && sobre ? `${a.actividadId}|${sobre}` : null;
      if (!clave) horas += h;
      else compartidas.set(clave, Math.max(compartidas.get(clave) ?? 0, h));
    }
  for (const h of compartidas.values()) horas += h;
  return horas;
}

// ── Quitar y poner actividades ────────────────────────────────────────────────────────────────────

/** Lo que un caso elegido necesita para editar sus actividades. */
export interface CasoConActividades {
  actividades?: ActividadDelCaso[];
  aMano?: boolean;
}

/** Las actividades de un caso elegido: las suyas o, si no tiene, las de su ficha del catálogo. */
export function actividadesDelElegido(caso: CasoConActividades, porDefecto: readonly ActividadDelCaso[] | undefined): ActividadDelCaso[] {
  return caso.actividades ?? [...(porDefecto ?? [])];
}

export const MAX_ACTIVIDADES_POR_CASO = 40;
export const MAX_VECES = 20;

/** Quita la actividad de la posición `i`. El caso queda editado a mano. */
export function quitarActividad<T extends CasoConActividades>(caso: T, actuales: readonly ActividadDelCaso[], i: number): T {
  return { ...caso, actividades: actuales.filter((_, j) => j !== i), aMano: true };
}

/**
 * Suma una actividad de la biblioteca, con su nombre de la biblioteca y una vez. Si ya está (la misma, sobre lo mismo)
 * y se puede repetir, le suma una vez; si no se repite, no cambia nada.
 */
export function sumarActividad<T extends CasoConActividades>(caso: T, actuales: readonly ActividadDelCaso[], lib: ActividadLigera, sobreQue = ""): T {
  const sobre = sobreQue.trim();
  const i = actuales.findIndex((a) => a.actividadId === lib.id && (a.sobreQue ?? "") === sobre);
  if (i >= 0) return lib.seRepite ? cambiarVeces(caso, actuales, i, actuales[i].veces + 1) : caso;
  if (actuales.length >= MAX_ACTIVIDADES_POR_CASO) return caso;
  const nueva: ActividadDelCaso = { actividadId: lib.id, nombre: lib.nombre, veces: 1, ...(sobre ? { sobreQue: sobre } : {}) };
  return { ...caso, actividades: [...actuales, nueva], aMano: true };
}

export function cambiarVeces<T extends CasoConActividades>(caso: T, actuales: readonly ActividadDelCaso[], i: number, veces: number): T {
  const v = Math.max(1, Math.min(MAX_VECES, Math.round(veces)));
  if (!actuales[i] || actuales[i].veces === v) return caso;
  return { ...caso, actividades: actuales.map((a, j) => (j === i ? { ...a, veces: v } : a)), aMano: true };
}

// ── Cómo se armó y en qué orden ──────────────────────────────────────────────────────────────────

/** Lo que cambió un caso respecto de las actividades por defecto de su ficha del catálogo, por nombre de la biblioteca. */
export interface CambiosRespectoDeLaFicha {
  suma: string[];
  quita: string[];
  /** Las que siguen pero con otras veces: «Capacitación del equipo (2 en vez de 1)». */
  veces: string[];
}

/**
 * Qué actividades sí y cuáles no, comparado con la ficha del catálogo: se agrupa por actividad de la biblioteca (y lo
 * que trata, si se comparte por eso), así que un nombre concretado en el caso no cuenta como cambio. Un caso propio (sin
 * ficha) devuelve null: todas sus actividades las eligió el agente.
 */
export function cambiosRespectoDeLaFicha(
  actuales: readonly ActividadDelCaso[],
  porDefecto: readonly ActividadDelCaso[] | undefined,
  nombreDe: (actividadId: string) => string | undefined,
): CambiosRespectoDeLaFicha | null {
  if (!porDefecto) return null;
  /* «las etapas del ciclo de vida» y «etapas del ciclo de vida» son lo mismo: sin artículos ni mayúsculas. Una fila de la
     ficha con un «sobre qué» por llenar («la unidad de negocio: <marca o país>») recibe lo que sobra de esa actividad:
     completarlo con «Costa Rica» y «Guatemala» no es sumar ni quitar, es la misma dos veces (revisión del 2026-11-08). */
  const porLlenar = (a: ActividadDelCaso) => /<[^>]*>/.test(a.sobreQue ?? "");
  const clave = (a: ActividadDelCaso) => (porLlenar(a) ? `${a.actividadId}|*` : `${a.actividadId}|${palabrasSinArticulos(a.sobreQue ?? "").join(" ")}`);
  const contar = (lista: readonly ActividadDelCaso[]) => {
    const m = new Map<string, { a: ActividadDelCaso; veces: number }>();
    for (const a of lista) {
      const k = clave(a);
      m.set(k, { a, veces: (m.get(k)?.veces ?? 0) + a.veces });
    }
    return m;
  };
  const antes = contar(porDefecto);
  const ahora = contar(actuales);
  // Lo que no calza con una fila concreta va a la fila por llenar de su actividad, si la ficha la tiene.
  for (const [k, x] of [...ahora]) {
    const llenar = `${x.a.actividadId}|*`;
    if (antes.has(k) || k === llenar || !antes.has(llenar)) continue;
    ahora.delete(k);
    ahora.set(llenar, { a: ahora.get(llenar)?.a ?? x.a, veces: (ahora.get(llenar)?.veces ?? 0) + x.veces });
  }
  const nombre = (k: string, a: ActividadDelCaso) => {
    const base = nombreDe(a.actividadId) ?? a.nombre;
    const sobre = k.endsWith("|*") ? "" : (a.sobreQue ?? "").trim();
    return sobre ? `${base} (${sobre})` : base;
  };
  const suma: string[] = [];
  const quita: string[] = [];
  const veces: string[] = [];
  for (const [k, x] of ahora) {
    const y = antes.get(k);
    if (!y) suma.push(nombre(k, x.a));
    else if (y.veces !== x.veces) veces.push(`${nombre(k, x.a)} (${x.veces} en vez de ${y.veces})`);
  }
  for (const [k, y] of antes) if (!ahora.has(k)) quita.push(nombre(k, y.a));
  return { suma: [...new Set(suma)], quita: [...new Set(quita)], veces: [...new Set(veces)] };
}

/** «A», «B» y «C»; con más de cuatro, las cuatro primeras «y N más». */
function listaCorta(nombres: readonly string[]): string {
  const vistos = nombres.slice(0, 4).map((n) => `«${n}»`);
  const resto = nombres.length - vistos.length;
  if (resto > 0) return `${vistos.join(", ")} y ${resto} más`;
  return vistos.length === 1 ? vistos[0] : `${vistos.slice(0, -1).join(", ")} y ${vistos[vistos.length - 1]}`;
}

/** Los cambios frente a la ficha en una línea: «Frente a la ficha del catálogo: suma «A»; sin «B».». */
export function lineaDeCambios(c: CambiosRespectoDeLaFicha): string {
  const partes = [
    ...(c.suma.length ? [`suma ${listaCorta(c.suma)}`] : []),
    ...(c.quita.length ? [`sin ${listaCorta(c.quita)}`] : []),
    ...(c.veces.length ? [`cambia ${listaCorta(c.veces)}`] : []),
  ];
  return partes.length ? `Frente a la ficha del catálogo: ${partes.join("; ")}.` : "Lleva las actividades de la ficha del catálogo, sin cambios.";
}

/**
 * Los casos en el orden del plan: primero los que tienen su lugar (por `paso`), después los demás, como estaban. Estable:
 * dos con el mismo paso (de corridas distintas) quedan en el orden en que llegaron.
 */
export function enOrdenDelPlan<T>(casos: readonly T[], pasoDe: (c: T) => number | undefined): T[] {
  return casos
    .map((c, i) => ({ c, i, p: pasoDe(c) }))
    .sort((x, y) => (x.p ?? Number.POSITIVE_INFINITY) - (y.p ?? Number.POSITIVE_INFINITY) || x.i - y.i)
    .map((x) => x.c);
}

// ── Lo que devuelve el agente ─────────────────────────────────────────────────────────────────────

export const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const texto = (x: unknown, max: number): string => (typeof x === "string" ? x.trim().slice(0, max) : "");

/**
 * Las actividades que propuso el agente, solo de la biblioteca: una que no está se descarta (y se cuenta). Las veces van
 * de 1 a 20 (y 1 si la actividad no se repite); las partes, solo las variables de esa actividad.
 */
export function validarActividadesDelAgente(
  raw: unknown,
  porId: ReadonlyMap<string, Pick<ActividadLigera, "id" | "nombre" | "seRepite" | "partes">>,
): { actividades: ActividadDelCaso[]; descartadas: number } {
  const actividades: ActividadDelCaso[] = [];
  let descartadas = 0;
  for (const x of Array.isArray(raw) ? raw : []) {
    const lib = esObjeto(x) ? porId.get(texto(x.actividadId, 80)) : undefined;
    if (!esObjeto(x) || !lib || actividades.length >= MAX_ACTIVIDADES_POR_CASO) {
      descartadas++;
      continue;
    }
    const veces = typeof x.veces === "number" && Number.isFinite(x.veces) ? Math.max(1, Math.min(MAX_VECES, Math.round(x.veces))) : 1;
    const sobreQue = texto(x.sobreQue, 120);
    const partes: Record<string, number> = {};
    if (esObjeto(x.partes))
      for (const p of lib.partes)
        if (p.variable && typeof x.partes[p.clave] === "number") partes[p.clave] = Math.max(0, Math.min(MAX_VECES, Math.round(x.partes[p.clave] as number)));
    actividades.push({
      actividadId: lib.id,
      nombre: texto(x.nombre, 200) || lib.nombre,
      veces: lib.seRepite ? veces : 1,
      ...(sobreQue ? { sobreQue } : {}),
      ...(Object.keys(partes).length ? { partes } : {}),
    });
  }
  return { actividades, descartadas };
}

/** Los números de un texto, sin separadores de miles ni decimales: «~1.200 tickets» → ["1200"]. */
export function numerosEn(t: string): string[] {
  return (t.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(/[.,]$/, "")).filter(Boolean);
}

const VACIAS = new Set(["sobre", "entre", "desde", "hasta", "cuando", "porque", "tiene", "tienen", "hacen", "están", "estan", "cliente", "clientes"]);
const palabrasLargas = (t: string) =>
  t
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((p) => p.length >= 5 && !VACIAS.has(p));

/**
 * ¿La cifra está en lo que se sabe CON el mismo sentido? Tiene que aparecer en una frase que comparta con el dato al menos
 * una palabra de cinco letras o más: «30 % de los leads» no sale de «a los 30 días» (revisión del 2026-11-08).
 */
export function cifraDelCliente(cifra: string, dato: string, frases: readonly string[]): boolean {
  const delDato = new Set(palabrasLargas(dato));
  return frases.some((f) => numerosEn(f).includes(cifra) && palabrasLargas(f).some((p) => delDato.has(p)));
}

/**
 * El argumento de valor, sin cifras inventadas: un número que el agente cita y que no aparece en lo que se sabe de la
 * empresa (`contexto`), en una frase que hable de lo mismo, no vale como número del cliente: pasa a «lo que falta
 * averiguar». Sin argumento, undefined.
 */
export function validarValorDelAgente(raw: unknown, contexto: string): ValorDeVenta | undefined {
  if (!esObjeto(raw)) return undefined;
  const argumento = texto(raw.argumento, 800);
  if (!argumento) return undefined;
  const frases = contexto.split(/\n|(?<=[.;!?])\s+/).filter((f) => /\d/.test(f));
  const conocidos = new Set(numerosEn(contexto));
  const falta = (Array.isArray(raw.falta) ? raw.falta : []).map((f) => texto(f, 300)).filter(Boolean);
  const numeros: ValorDeVenta["numeros"] = [];
  for (const n of Array.isArray(raw.numeros) ? raw.numeros : []) {
    if (!esObjeto(n)) continue;
    const dato = texto(n.dato, 300);
    if (!dato) continue;
    const cifras = numerosEn(dato);
    // Un «número» sin cifras es un hecho, no un número: el argumento ya lo dice.
    if (!cifras.length) continue;
    if (cifras.every((c) => cifraDelCliente(c, dato, frases))) numeros.push({ dato, fuente: texto(n.fuente, 120) });
    else falta.push(`Confirmar con el cliente: ${dato}`.slice(0, 300));
  }
  // Un argumento que se apoya en una cifra que no salió del cliente no se muestra como si la tuviera.
  // (Las cifras chicas —«3 meses», «2 pipelines»— no cuentan: son del trabajo, no del cliente.)
  const cifrasDelArgumento = numerosEn(argumento).filter((c) => Number(c) >= 10 && !conocidos.has(c));
  return {
    palanca: texto(raw.palanca, 80),
    argumento: cifrasDelArgumento.length ? `${argumento} (Ojo: hay cifras que no salieron del cliente; confírmalas antes de usarlas.)`.slice(0, 900) : argumento,
    numeros: numeros.slice(0, 6),
    falta: [...new Set(falta)].slice(0, 6),
  };
}

/**
 * Un texto del agente con su tope de largo, sin cortarlo a media frase: hasta la última oración que cabe y, si ni la
 * primera cabe, hasta la última palabra, con «…».
 */
export function recortarSinCortarFrases(t: string, max: number): string {
  const limpio = t.trim().replace(/\s+/g, " ");
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max);
  const fin = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("? "), corte.lastIndexOf("! "));
  if (fin >= max / 3) return corte.slice(0, fin + 1);
  const espacio = corte.lastIndexOf(" ");
  return `${corte.slice(0, espacio > 0 ? espacio : max - 1).replace(/[,;:]$/, "")}…`;
}

/** Un texto del agente que cita una cifra de 10 o más que no está en lo que se sabe: se marca para confirmarla. */
export function marcarCifrasAjenas(t: string, conocidos: ReadonlySet<string>): string {
  if (!t) return t;
  return numerosEn(t).some((c) => Number(c) >= 10 && !conocidos.has(c)) ? `${t} (Ojo: hay cifras que no salieron del cliente; confírmalas.)` : t;
}

/**
 * Lo de quien vende que devolvió el agente con cada caso: por qué para esta empresa y cómo se arma, cortos y sin cifras
 * inventadas (`contexto` es lo que leyó el agente). Sin ninguno de los dos, undefined.
 */
export function validarParaVentasDelAgente(x: Record<string, unknown>, contexto: string): ParaVentas | undefined {
  const conocidos = new Set(numerosEn(contexto));
  const porQue = marcarCifrasAjenas(recortarSinCortarFrases(typeof x.porQue === "string" ? x.porQue : "", 260), conocidos);
  const comoSeArma = marcarCifrasAjenas(recortarSinCortarFrases(typeof x.comoSeArma === "string" ? x.comoSeArma : "", 340), conocidos);
  return porQue || comoSeArma ? { porQue, comoSeArma } : undefined;
}

/**
 * El lugar del caso en el plan que devolvió el agente: un paso de 1 a 40 y, si no es el primero, por qué va ahí. Un caso
 * nuevo de una tanda más va después de lo que ya está (`desde`, el último paso del plan): si el modelo lo numeró desde 1,
 * se corre, para no meterse delante de lo elegido.
 */
export function validarLugarDelAgente(x: Record<string, unknown>, desde = 0): LugarEnElPlan | undefined {
  if (typeof x.paso !== "number" || !Number.isFinite(x.paso)) return undefined;
  const pedido = Math.max(1, Math.round(x.paso));
  const paso = Math.min(40, desde > 0 && pedido <= desde ? desde + pedido : pedido);
  const despuesDe = paso > 1 && typeof x.despuesDe === "string" ? recortarSinCortarFrases(x.despuesDe, 220) : "";
  return { paso, ...(despuesDe ? { despuesDe } : {}) };
}

/**
 * El último paso del plan entre lo que ya está (elegidos y sugeridos que siguen): una tanda más numera desde el
 * siguiente. «Regenerar» rearma el plan entero, desde el 1.
 */
export function ultimoPasoDelPlan(casos: readonly { plan?: LugarEnElPlan }[], regenerar: boolean): number {
  return regenerar ? 0 : Math.max(0, ...casos.map((c) => c.plan?.paso ?? 0));
}

// ── Regenerar ────────────────────────────────────────────────────────────────────────────────────

/** Lo mínimo de un caso para saber si ya se armó con la biblioteca. */
interface ConArmado {
  armado?: string;
}

/**
 * Cuántos casos de la preventa todavía no se armaron con la biblioteca de actividades (elegidos y sugeridos): los de
 * antes del 2026-11-08 y los elegidos desde la lista. Con alguno, el paso dice «Regenera para actualizar». No cuentan
 * (revisión del 2026-11-08: si no, la alerta no se iba nunca y cada intento costaba una corrida) los elegidos que el
 * vendedor editó a mano —son suyos— ni los de un área que ya no está en juego (`areas`).
 */
export function casosSinArmar(elegidos: readonly (ConArmado & { aMano?: boolean; areaId?: string | null })[], sugeridos: readonly ConArmado[], areas?: readonly string[]): number {
  const enJuego = (a: string | null | undefined) => !areas || !a || areas.includes(a);
  return elegidos.filter((c) => !c.armado && !c.aMano && enJuego(c.areaId)).length + sugeridos.filter((c) => !c.armado).length;
}

/**
 * Las versiones nuevas que «Regenerar» aplica solas al terminar: las de esa corrida, de casos ya elegidos que el vendedor
 * NO editó a mano. Las de los editados a mano quedan en su fila para que él decida.
 */
export function versionesQueSeAplicanSolas<I extends { corridaId: string | null; destino: { tipo: string; useCaseId?: string } }>(
  pendientes: readonly I[],
  elegidos: Readonly<Record<string, { aMano?: boolean }>>,
  corridaId: string,
): I[] {
  return pendientes.filter((it) => {
    const id = it.destino.tipo === "casoDeUso" ? it.destino.useCaseId : undefined;
    return it.corridaId === corridaId && !!id && id in elegidos && !elegidos[id].aMano;
  });
}

/** Lo que reemplazó el último «Regenerar»: las sugerencias de casos de antes, para devolverlas con «Deshacer». */
export interface CasosAnteriores<I> {
  corridaId: string;
  en: string;
  items: I[];
}

/**
 * Antes de guardar lo que propuso una corrida que regenera: las sugerencias de casos que no se armaron con la biblioteca
 * salen de la lista y quedan aparte (`casosAnteriores`), para que «Deshacer» las devuelva. Las demás no se tocan.
 */
export function apartarCasosSinArmar<I extends { destino: { tipo: string }; valor: unknown }>(
  items: readonly I[],
  corridaId: string,
  en: string,
): { items: I[]; casosAnteriores: CasosAnteriores<I> } {
  const sinArmar = (it: I) => it.destino.tipo === "casoDeUso" && !(esObjeto(it.valor) && typeof it.valor.armado === "string");
  return { items: items.filter((it) => !sinArmar(it)), casosAnteriores: { corridaId, en, items: items.filter(sinArmar) } };
}
