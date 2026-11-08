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
import { TARIFAS, type ComoSeComparte, type EtapaDeActividad } from "./actividades-puras";

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
  partes: { clave: string; horas: number; veces: number; variable: boolean }[];
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
    partes: a.partes.map((p) => ({ clave: p.clave, horas: p.horas, veces: p.veces, variable: p.variable })),
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
      const sobre = (a.sobreQue ?? "").trim().toLowerCase();
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

// ── Lo que devuelve el agente ─────────────────────────────────────────────────────────────────────

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
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

/**
 * El argumento de valor, sin cifras inventadas: un número que el agente cita y que no aparece en lo que se sabe de la
 * empresa (`contexto`) no vale como número del cliente; pasa a «lo que falta averiguar». Sin argumento, undefined.
 */
export function validarValorDelAgente(raw: unknown, contexto: string): ValorDeVenta | undefined {
  if (!esObjeto(raw)) return undefined;
  const argumento = texto(raw.argumento, 800);
  if (!argumento) return undefined;
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
    if (cifras.every((c) => conocidos.has(c))) numeros.push({ dato, fuente: texto(n.fuente, 120) });
    else falta.push(`Confirmar con el cliente: ${dato}`);
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

// ── Regenerar ────────────────────────────────────────────────────────────────────────────────────

/** Lo mínimo de un caso para saber si ya se armó con la biblioteca. */
interface ConArmado {
  armado?: string;
}

/**
 * Cuántos casos de la preventa todavía no se armaron con la biblioteca de actividades (elegidos y sugeridos): los de
 * antes del 2026-11-08 y los elegidos a mano desde la lista. Con alguno, el paso dice «Regenera para actualizar».
 */
export function casosSinArmar(elegidos: readonly ConArmado[], sugeridos: readonly ConArmado[]): number {
  return [...elegidos, ...sugeridos].filter((c) => !c.armado).length;
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
