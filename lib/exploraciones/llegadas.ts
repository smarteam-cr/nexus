/**
 * lib/exploraciones/llegadas.ts — quién hizo el test de marketing, leído de la NOTA que deja. PURO.
 *
 * El test deja una nota en HubSpot en cada intento: «📊 Diagnóstico de Rendimiento — Ventas · …» si lo
 * terminó (con el enlace al resultado) y «⏳ Diagnóstico SIN TERMINAR — Ventas» si lo dejó a medias.
 * Hasta el 2026-10-01 «Llegaron por el test» buscaba solo las propiedades `diag_*` del contacto, que
 * existen en 41 contactos; las notas, en 64 fichas desde que arrancó el test (12 de junio). Medido ese
 * día: las 142 notas completas traen el enlace, y 141 se decodifican.
 *
 * Las pruebas internas (correos de Smarteam, dominios y nombres de prueba) quedan fuera: no son leads.
 * Los clientes SÍ entran (decisión de Elías, 2026-10-01): «al final de cuentas son exploraciones que se
 * deben hacer».
 */
import { DOMINIO_PROPIO } from "@/lib/sessions/dominio-propio";
import { DOMINIOS_GENERICOS } from "./agendadas";
import { leerResultadoDelTest, type ResultadoDelTest } from "./test-de-marketing";

/** Desde cuándo existe el test que deja estas notas. */
export const INICIO_DEL_TEST = "2026-06-12";

export type EstadoDelTest = "terminado" | "sinTerminar";

const AREA_POR_NOMBRE: Record<string, string> = { ventas: "1", marketing: "2", servicio: "3" };

const sinEtiquetas = (html: string) =>
  html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .trim();

const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** La dirección del resultado que trae la nota (`…/resultado.html#…`, o la del test de Nexus `…/external/test/resultado/<token>#…`), o null. */
export function enlaceDelResultado(html: string): string | null {
  const limpio = html.replace(/&amp;/g, "&");
  const m =
    limpio.match(/https?:\/\/[^\s"'<>]*resultado\.html#[^\s"'<>]+/i) ??
    limpio.match(/https?:\/\/[^\s"'<>]*\/external\/test\/resultado\/[A-Za-z0-9_-]+#[^\s"'<>]+/i);
  return m ? m[0] : null;
}

export interface NotaDelTest {
  estado: EstadoDelTest;
  /** El área de la escala de hoy (`1` Ventas…), del resultado o del título. */
  areaId: string | null;
  /** Quién lo hizo, como lo escribió en el test. */
  contacto: string | null;
  email: string | null;
  /** El dominio de la empresa que escribió. */
  dominio: string | null;
  /** El resultado decodificado, si lo terminó y el enlace se puede leer. */
  resultado: ResultadoDelTest | null;
}

/** Lo que dice una nota del test, o null si la nota no es del test. */
export function leerNotaDelTest(html: string): NotaDelTest | null {
  const texto = sinEtiquetas(html);
  const titulo = texto.split("\n")[0] ?? "";
  const estado: EstadoDelTest | null = /^📊\s*Diagnóstico de Rendimiento\b/.test(titulo)
    ? "terminado"
    : /^⏳\s*Diagnóstico SIN TERMINAR\b/.test(titulo)
      ? "sinTerminar"
      : null;
  if (!estado) return null;

  const enlace = estado === "terminado" ? enlaceDelResultado(html) : null;
  const resultado = enlace ? leerResultadoDelTest(enlace) : null;
  const areaDelTitulo = sinTildes(titulo.match(/—\s*([A-Za-zÁÉÍÓÚáéíóú]+)/)?.[1] ?? "").toLowerCase();

  const quien = texto.match(/Quién:\s*([^\n]+)/)?.[1] ?? "";
  const email = quien.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0]?.toLowerCase() ?? null;
  const contacto = quien.split(/[,—]/)[0]?.trim() || null;
  const empresa = texto.match(/Empresa:\s*([^\n]+)/)?.[1] ?? "";
  const dominio = empresa.match(/(?:^|·)\s*([a-z0-9-]+(?:\.[a-z0-9-]+)+)\s*(?:·|$)/i)?.[1]?.toLowerCase() ?? null;

  return {
    estado,
    areaId: resultado?.areaId ?? AREA_POR_NOMBRE[areaDelTitulo] ?? null,
    contacto,
    email,
    dominio,
    resultado,
  };
}

// ── Las pruebas internas ────────────────────────────────────────────────────

/**
 * Dominios que nunca son un lead: los de Smarteam (lo que hace el equipo con el test es una prueba) y el
 * de HubSpot, que es aliado (Carlos Valderrama lo hizo en junio de 2026 para conocerlo).
 */
const DOMINIOS_INTERNOS = [DOMINIO_PROPIO, "smarteam.com", "hubspot.com"];

const esDominioInterno = (d: string) => DOMINIOS_INTERNOS.some((i) => d === i || d.endsWith(`.${i}`));

/** Un dominio que se escribió para probar: ejemplo-test.com, empresa-prueba.com, test.com. */
function esDominioDePrueba(d: string): boolean {
  const base = d.split(".").slice(0, -1).join(".");
  if (!base) return false;
  if (/(prueba|ejemplo|example)/.test(base)) return true;
  return base.split(/[.-]/).some((t) => t === "test" || t === "demo");
}

/** Un nombre que se escribió para probar: «QA Correo Personal (borrar)», «Prueba Alejandra», «test test». */
const NOMBRE_DE_PRUEBA = /\(borrar\)|\bborrar\b|\bqa\b|\bpruebas?\b|\btest\b/i;

export interface QuienHizoElTest {
  contacto?: string | null;
  email?: string | null;
  /** El dominio de la ficha de la empresa en HubSpot. */
  dominio?: string | null;
  /** El nombre de la ficha de la empresa en HubSpot. */
  empresa?: string | null;
}

/** ¿Es una prueba del equipo y no alguien de afuera? */
export function esDePrueba(q: QuienHizoElTest): boolean {
  const email = (q.email ?? "").toLowerCase();
  const dominioDelCorreo = email.split("@")[1] ?? "";
  const dominio = (q.dominio ?? "").toLowerCase();
  if (dominioDelCorreo && (esDominioInterno(dominioDelCorreo) || esDominioDePrueba(dominioDelCorreo))) return true;
  if (dominio && (esDominioInterno(dominio) || esDominioDePrueba(dominio))) return true;
  if (/^(qa|test)[-.+_\d]*@/.test(email)) return true;
  if (NOMBRE_DE_PRUEBA.test(q.contacto ?? "")) return true;
  if (NOMBRE_DE_PRUEBA.test(q.empresa ?? "")) return true;
  return false;
}

// ── Una llegada por empresa ─────────────────────────────────────────────────

export interface NotaDeLlegada {
  /** Cuándo se escribió la nota (ms). */
  ts: number;
  companyId: string;
  contactoId: string | null;
  nota: NotaDelTest;
}

export interface LlegadaAgrupada {
  companyId: string;
  /** Lo terminó al menos una vez (si no, todos sus intentos quedaron a medias). */
  terminado: boolean;
  /** El intento que manda: el último terminado o, si no hay, el último. */
  ts: number;
  contactoId: string | null;
  contacto: string | null;
  areaId: string | null;
  /** `AAAA-MM-DD`: la del resultado o la de la nota. */
  fecha: string;
  /** Cuántas veces lo intentó la empresa (terminado o no). */
  intentos: number;
  /**
   * K10 (2026-10-27): quién llenó el test de cada área, una por área (la del último terminado o, si no hay, la del último
   * intento), en el orden de la escala. «Ventas: Sonia · Marketing: Pedro».
   */
  porArea: AreaDelTest[];
}

/** Quién llenó el test de un área, en una empresa (o en un dominio sin empresa). */
export interface AreaDelTest {
  /** `1` Ventas, `2` Marketing, `3` Servicio; null = no se supo. */
  areaId: string | null;
  contacto: string | null;
  terminado: boolean;
  /** `AAAA-MM-DD`. */
  fecha: string;
}

/** Una por área: el último terminado o, sin terminados, el último intento. Ordenadas por el número del área. */
export function areasDelTest(notas: readonly Pick<NotaDeLlegada, "ts" | "nota">[]): AreaDelTest[] {
  const porArea = new Map<string, Pick<NotaDeLlegada, "ts" | "nota">>();
  for (const n of [...notas].sort((a, b) => b.ts - a.ts)) {
    const k = n.nota.areaId ?? "?";
    const actual = porArea.get(k);
    if (!actual || (n.nota.estado === "terminado" && actual.nota.estado !== "terminado")) porArea.set(k, n);
  }
  return [...porArea.values()]
    .map((n) => ({
      areaId: n.nota.areaId,
      contacto: n.nota.contacto,
      terminado: n.nota.estado === "terminado",
      fecha: n.nota.resultado?.fecha ?? new Date(n.ts).toISOString().slice(0, 10),
    }))
    .sort((a, b) => (a.areaId ?? "9").localeCompare(b.areaId ?? "9"));
}

/** Una por empresa, la más reciente arriba. Las pruebas ya vienen afuera (`esDePrueba`). */
export function agruparLlegadas(notas: readonly NotaDeLlegada[]): LlegadaAgrupada[] {
  const porEmpresa = new Map<string, NotaDeLlegada[]>();
  for (const n of notas) {
    const lista = porEmpresa.get(n.companyId) ?? [];
    lista.push(n);
    porEmpresa.set(n.companyId, lista);
  }
  const salida: LlegadaAgrupada[] = [];
  for (const [companyId, lista] of porEmpresa) {
    lista.sort((a, b) => b.ts - a.ts);
    const terminados = lista.filter((n) => n.nota.estado === "terminado");
    const manda = terminados[0] ?? lista[0];
    salida.push({
      companyId,
      terminado: terminados.length > 0,
      ts: manda.ts,
      contactoId: manda.contactoId,
      contacto: manda.nota.contacto,
      areaId: manda.nota.areaId,
      fecha: manda.nota.resultado?.fecha ?? new Date(manda.ts).toISOString().slice(0, 10),
      intentos: lista.length,
      porArea: areasDelTest(lista),
    });
  }
  return salida.sort((a, b) => b.ts - a.ts);
}

// ── Los intentos sin empresa en HubSpot (K10 etapa 2) ─────────────────────────

/** Un intento del test sin empresa en HubSpot. */
export interface NotaSinEmpresa {
  ts: number;
  nota: NotaDelTest;
}

/** Los intentos sin empresa de un mismo dominio (o de un mismo correo, si el dominio es de correo personal). */
export interface LlegadaSinEmpresa {
  /** El dominio del correo (`acme.com`) o, con uno de correo personal, el correo entero. */
  clave: string;
  /** El dominio que se le pondría a la empresa en HubSpot; null con un correo personal (gmail). */
  dominio: string | null;
  /** Quiénes lo hicieron, sin repetir. */
  contactos: string[];
  porArea: AreaDelTest[];
  terminado: boolean;
  intentos: number;
  /** El último intento (ms). */
  ts: number;
}

const dominioDelCorreo = (email: string | null) => (email?.split("@")[1] ?? "").trim().toLowerCase();

/**
 * Los intentos sin empresa, agrupados por el dominio del correo (con un correo personal, por el correo: dos personas con
 * gmail no son la misma empresa). Sin correo ni dominio escrito, no se agrupa (no hay con qué crear la empresa). El último
 * arriba. Las pruebas ya vienen afuera (`esDePrueba`).
 */
export function agruparSinEmpresa(notas: readonly NotaSinEmpresa[], genericos: ReadonlySet<string> = DOMINIOS_GENERICOS): LlegadaSinEmpresa[] {
  const grupos = new Map<string, { dominio: string | null; notas: NotaSinEmpresa[] }>();
  for (const n of notas) {
    const delCorreo = dominioDelCorreo(n.nota.email);
    const dominio = delCorreo && !genericos.has(delCorreo) ? delCorreo : n.nota.dominio && !genericos.has(n.nota.dominio) ? n.nota.dominio : null;
    const clave = dominio ?? n.nota.email?.trim().toLowerCase() ?? null;
    if (!clave) continue;
    const g = grupos.get(clave) ?? { dominio, notas: [] };
    g.notas.push(n);
    grupos.set(clave, g);
  }
  return [...grupos.entries()]
    .map(([clave, g]) => ({
      clave,
      dominio: g.dominio,
      contactos: [...new Set(g.notas.map((n) => n.nota.contacto?.trim()).filter((c): c is string => !!c))],
      porArea: areasDelTest(g.notas),
      terminado: g.notas.some((n) => n.nota.estado === "terminado"),
      intentos: g.notas.length,
      ts: Math.max(...g.notas.map((n) => n.ts)),
    }))
    .sort((a, b) => b.ts - a.ts);
}

/** «Ventas: Sonia · Marketing: Pedro». `nombreDelArea` da el nombre de cada área de la escala. */
export function quienesPorArea(areas: readonly AreaDelTest[], nombreDelArea: (id: string) => string): string {
  return areas.map((a) => `${a.areaId ? nombreDelArea(a.areaId) : "Sin área"}: ${a.contacto ?? "sin nombre"}${a.terminado ? "" : " (a medias)"}`).join(" · ");
}
