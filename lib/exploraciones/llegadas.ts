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

/** La dirección del resultado que trae la nota (`…/resultado.html#…`), o null. */
export function enlaceDelResultado(html: string): string | null {
  const m = html.replace(/&amp;/g, "&").match(/https?:\/\/[^\s"'<>]*resultado\.html#[^\s"'<>]+/i);
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
const DOMINIOS_INTERNOS = ["smarteamcr.com", "smarteam.com", "hubspot.com"];

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
    });
  }
  return salida.sort((a, b) => b.ts - a.ts);
}
