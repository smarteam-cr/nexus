/**
 * lib/landing/modulos-biblioteca.ts — LA BIBLIOTECA DE MÓDULOS DE LAS PROPUESTAS: QUÉ SE GUARDA Y QUÉ SE AVISA.
 *
 * PURO. Sin Prisma, sin fetch, sin React.
 *
 * Un módulo es una sección personalizada (`custom:*`) que alguien guardó para usarla en otra
 * propuesta. Se guarda su TIPO (el del catálogo de secciones creables) y su DATA; «Agregar módulo»
 * inserta una copia. Ver DECISIONS «La biblioteca de módulos de las propuestas».
 *
 * ── ⛔ UN MÓDULO NO LLEVA DATOS DEL CLIENTE ORIGINAL SIN AVISAR ───────────────────────────────
 * Un HTML armado para REMPRO dice «REMPRO» en el título, en los tabs y en el script. Copiarlo a la
 * propuesta de otro prospecto sin mirarlo le pone el nombre de otro cliente enfrente. Por eso, al
 * guardar, se buscan en los textos el nombre de la empresa, sus dominios, correos, teléfonos y
 * montos (`hallazgosDelCliente`), y se muestran: quien guarda decide si sigue igual, y cada vez que
 * alguien lo inserta los vuelve a ver, con «Adaptar a esta empresa» al lado.
 *
 * No se borra nada solo: limpiar sin mirar rompe frases y no deja ver qué cambió.
 */
import { esCustomKey, tipoDeCustomKey } from "./custom-sections";
import { TIPO_POR_DEFECTO, tipoCreable } from "./catalogo-de-secciones";
import { NO_CONTENIDO } from "./is-blank";
import { extraerTextos } from "./html-textos";

/** Clave fuera del schema que marca de qué módulo salió una sección insertada (solo el id). */
export const CLAVE_DEL_MODULO = "__moduloId";

export type TipoDeHallazgo = "cliente" | "dominio" | "correo" | "telefono" | "monto";

export interface Hallazgo {
  tipo: TipoDeHallazgo;
  /** Lo que se encontró, tal cual aparece (el nombre, el correo, el monto). */
  texto: string;
  veces: number;
}

/** El nombre de cada tipo de hallazgo, para la pantalla. */
export const NOMBRE_DEL_HALLAZGO: Record<TipoDeHallazgo, string> = {
  cliente: "El nombre de la empresa",
  dominio: "Su dominio",
  correo: "Un correo",
  telefono: "Un teléfono",
  monto: "Un monto",
};

/**
 * Palabras que aparecen en los nombres de muchas empresas y que, solas, no la identifican. Es la
 * regla de oro del title-match de las sesiones: nunca se descarta un token que sea el nombre
 * distintivo de un cliente («smarteam», «distribuidora»…); acá se descartan solo los genéricos.
 */
const GENERICAS = new Set([
  "grupo", "group", "internacional", "international", "costa", "rica", "empresa", "empresas",
  "compania", "corporacion", "corporation", "sociedad", "anonima", "servicios", "services",
  "soluciones", "solutions", "latam", "latinoamerica", "america", "holding", "global", "consulting",
  "proyecto", "proyectos", "comercial", "nacional", "centro", "para", "como", "with", "the",
]);

/** Minúsculas y sin tildes: «Ferretería» y «FERRETERIA» son la misma palabra. */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Las palabras del nombre que identifican a la empresa, sin las genéricas. */
export function palabrasDistintivas(nombre: string | null | undefined): string[] {
  const out = new Set<string>();
  for (const p of normalizar(nombre ?? "").split(/[^\p{L}\p{N}]+/u)) {
    if (p.length >= 4 && !GENERICAS.has(p)) out.add(p);
  }
  return [...out];
}

function contar(texto: string, re: RegExp): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of texto.matchAll(re)) {
    const k = m[0].trim();
    if (k) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Lo que un módulo dice de una empresa. `textos` son los textos visibles (ver `textosDelModulo`).
 *
 * ⚠ El nombre se busca por PALABRA completa y sin tildes: «Monge» encuentra «MONGE» pero no
 * «Mongerito». Una empresa sin palabras distintivas («Grupo Internacional») no se busca por nombre:
 * buscar «grupo» marcaría medio documento.
 */
export function hallazgosDelCliente(
  textos: readonly string[],
  cliente: { nombre?: string | null; dominios?: readonly string[] | null },
): Hallazgo[] {
  const todo = textos.join("\n");
  const plano = normalizar(todo);
  const out: Hallazgo[] = [];

  const nombre = (cliente.nombre ?? "").trim();
  const nombreN = normalizar(nombre);
  if (nombreN.length >= 3) {
    const completo = (plano.match(new RegExp(`(^|[^\\p{L}\\p{N}])${escaparRegex(nombreN)}(?=$|[^\\p{L}\\p{N}])`, "gu")) ?? []).length;
    if (completo > 0) out.push({ tipo: "cliente", texto: nombre, veces: completo });
  }
  for (const p of palabrasDistintivas(nombre)) {
    if (p === nombreN) continue;
    const veces = (plano.match(new RegExp(`(^|[^\\p{L}\\p{N}])${escaparRegex(p)}(?=$|[^\\p{L}\\p{N}])`, "gu")) ?? []).length;
    if (veces > 0 && !out.some((h) => h.tipo === "cliente" && normalizar(h.texto) === p)) {
      out.push({ tipo: "cliente", texto: p, veces });
    }
  }

  for (const d of cliente.dominios ?? []) {
    const dn = normalizar(d.trim());
    if (!dn) continue;
    const veces = plano.split(dn).length - 1;
    if (veces > 0) out.push({ tipo: "dominio", texto: d.trim(), veces });
  }

  for (const [texto, veces] of contar(todo, /[\w.+-]+@[\w-]+(\.[\w-]+)+/g)) out.push({ tipo: "correo", texto, veces });
  for (const [texto, veces] of contar(todo, /(?<![\w$₡])\+?\d[\d\s().-]{6,}\d(?!\w)/g)) {
    // Un año o un rango de años («2024 - 2026») no es un teléfono, y hacen falta 8 dígitos o más.
    if (/^(19|20)\d{2}\s*[-–—]\s*(19|20)\d{2}$/.test(texto)) continue;
    if (texto.replace(/\D/g, "").length >= 8) out.push({ tipo: "telefono", texto, veces });
  }
  for (const [texto, veces] of contar(todo, /(US\$|USD|CRC|₡|\$)\s?\d[\d.,]*(\s?(k|mil|millones))?/gi)) {
    out.push({ tipo: "monto", texto, veces });
  }
  return out;
}

/** Todos los textos de una data estructurada, sin lo que es presentación (`NO_CONTENIDO`) ni `__*`. */
function textosDeData(v: unknown, out: string[]): void {
  if (typeof v === "string") {
    if (v.trim()) out.push(v);
    return;
  }
  if (Array.isArray(v)) {
    for (const x of v) textosDeData(x, out);
    return;
  }
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k.startsWith("__") || NO_CONTENIDO.has(k)) continue;
      textosDeData(x, out);
    }
  }
}

/**
 * Los textos que ve una persona en un módulo. Un HTML pegado se lee por sus segmentos (no el
 * código); lo demás, por las hojas de texto de su data.
 */
export function textosDelModulo(tipo: string, data: unknown): string[] {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (tipo === "html") {
    const out = extraerTextos(typeof d.html === "string" ? d.html : "").map((s) => s.texto);
    if (typeof d.notaPdf === "string" && d.notaPdf.trim()) out.push(d.notaPdf);
    return out;
  }
  const out: string[] = [];
  textosDeData(d, out);
  return out;
}

/** La data que se guarda o se copia: sin las claves `__*` (la marca del módulo, el idioma). */
export function dataParaCopiar(data: unknown): Record<string, unknown> {
  const src = (data && typeof data === "object" && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (!k.startsWith("__")) out[k] = structuredClone(v);
  }
  return out;
}

/**
 * El tipo de módulo que sale de una sección, o `null` si esa sección no se puede guardar.
 *
 * Solo las PERSONALIZADAS: una de la plantilla («Inversión», «Portada») ya está en toda propuesta
 * nueva, y llevar su copia a otra sería tener dos.
 */
export function tipoGuardable(key: string): string | null {
  if (!esCustomKey(key)) return null;
  const tipo = tipoDeCustomKey(key) ?? TIPO_POR_DEFECTO;
  return tipoCreable(tipo) ? tipo : null;
}

/** Un módulo vacío no se guarda: no tiene nada que reusar. */
export function moduloVacio(tipo: string, data: unknown): boolean {
  return textosDelModulo(tipo, data).length === 0 &&
    !(tipo === "html" && typeof (data as { html?: unknown })?.html === "string" && (data as { html: string }).html.trim());
}

/** Lee los avisos guardados (Json de la base) sin confiar en su forma. */
export function leerHallazgos(raw: unknown): Hallazgo[] {
  if (!Array.isArray(raw)) return [];
  const tipos = new Set<string>(Object.keys(NOMBRE_DEL_HALLAZGO));
  return raw.flatMap((h) => {
    const x = h as Partial<Hallazgo>;
    return x && typeof x.texto === "string" && typeof x.tipo === "string" && tipos.has(x.tipo)
      ? [{ tipo: x.tipo as TipoDeHallazgo, texto: x.texto, veces: typeof x.veces === "number" ? x.veces : 1 }]
      : [];
  });
}

/** La frase corta que resume los hallazgos («Nombra a REMPRO (4) y trae 2 montos»). */
export function resumenDeHallazgos(h: readonly Hallazgo[]): string {
  if (h.length === 0) return "";
  const partes: string[] = [];
  const clientes = h.filter((x) => x.tipo === "cliente");
  if (clientes.length) partes.push(`nombra a ${clientes.map((c) => `«${c.texto}»`).join(", ")}`);
  const otros: Array<[TipoDeHallazgo, string, string]> = [
    ["dominio", "dominio", "dominios"],
    ["correo", "correo", "correos"],
    ["telefono", "teléfono", "teléfonos"],
    ["monto", "monto", "montos"],
  ];
  for (const [tipo, uno, varios] of otros) {
    const n = h.filter((x) => x.tipo === tipo).length;
    if (n) partes.push(`trae ${n} ${n === 1 ? uno : varios}`);
  }
  const frase = partes.join(", ");
  return frase.charAt(0).toUpperCase() + frase.slice(1) + ".";
}
