/**
 * lib/cobranza/sociedades.ts
 *
 * Cómo se reconoce una sociedad por el nombre con que factura. PURO: sin Prisma, sin red, sin reloj,
 * sin zod (lo importan pantallas del navegador).
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────────
 * El libro de Alex nombra al cliente como sale en la FACTURA, no como está en Nexus: «ILEANA AGUILAR
 * INGENIERIA Y ADMINISTRACION SOCIEDAD ANONIMA» es la cuenta «IIA»; «Atlas Mining & Construction,
 * S.A. I 7208610-6» es «AMC - Atlas Mining & Construction»; «CONSTRULOGIX S.A (Construtecho)» es
 * «Construtecho». Comparar las cadenas tal cual no encuentra a nadie, y adivinar por monto es lo que
 * fabrica clientes duplicados.
 *
 * Por eso esto NO elige: devuelve candidatas con la razón por la que lo son (`via`), y la más fuerte
 * gana. Quien decide es una persona (etapa 12, `resolverSociedad`, nunca elige sola).
 *
 * ⚠ La cédula que viene pegada al nombre («I 7208610-6», «( J0310000005567 )», «NIT: …») se separa
 * ANTES de normalizar: si no, sus dígitos terminan dentro de la clave y dos facturas de la misma
 * empresa dejan de parecerse.
 */
import { soloDigitos } from "./odoo/emparejado";

/**
 * Formas jurídicas que no distinguen a nadie. Van de la más larga a la más corta: «s a de c v»
 * tiene que salir entera antes de que «s a» se lleve la mitad y deje «de c v» colgando.
 * Se aplican sobre el texto ya sin tildes, sin puntuación y con un espacio entre palabras.
 */
const FORMAS_JURIDICAS = [
  "sociedad anonima de capital variable",
  "sociedad de responsabilidad limitada",
  "sociedad anonima",
  "s de r l de c v",
  "s de rl de cv",
  "s a p i de c v",
  "sapi de cv",
  "s a de c v",
  "sa de cv",
  "s de r l",
  "s de rl",
  "s r l",
  "srl",
  "s a c",
  "sac",
  "s a s",
  "sas",
  "s a",
  "sa",
  "ltda",
  "limitada",
  "llc",
  "inc",
  "corp",
  "corporation",
  "ltd",
  "eirl",
];
const RE_FORMAS = new RegExp(`(?:^| )(?:${FORMAS_JURIDICAS.join("|")})(?= |$)`, "g");

/** Palabras de enlace: «Real Shipping and Trade» y «Real Shipping & Trade» son la misma. */
const ENLACES = new Set(["y", "and", "e", "de", "del", "la", "las", "el", "los", "the", "of"]);

/** Un pedazo con cinco dígitos o más es un identificador fiscal, no parte del nombre. */
const tieneIdentificador = (s: string) => (s.match(/\d/g)?.length ?? 0) >= 5;

/**
 * Un pedazo entero que es SOLO un identificador: cinco dígitos o más y ninguna palabra de cinco letras
 * entre ellos. «7208610-6», «SAS160825EQ3» y el RFC de persona física «COAL780221HR9» lo son;
 * «Rempro» no.
 */
const pareceIdentificador = (s: string) =>
  /^(nit|nrc|ein|rfc|ruc|vat)\s*:/i.test(s) ||
  (tieneIdentificador(s) && s.split(/[\d\s.:-]+/).every((palabra) => palabra.length < 5));

function plano(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface IdentidadDelNombre {
  /** El nombre sin la cédula ni el alias entre paréntesis, tal cual se escribió. */
  nombre: string;
  /** Lo que se compara. Vacío solo si el nombre no traía letras ni número. */
  clave: string;
  /** Lo que va entre paréntesis y no es un identificador: «(Construtecho)», «(Wherex)». */
  alias: string | null;
  /** Los dígitos del primer identificador fiscal que trae pegado, o null. */
  cedula: string | null;
}

/**
 * Separa lo que el libro pega al nombre de la sociedad: la cédula (entre paréntesis, detrás de « I »,
 * de « / » o de «NIT:»/«EIN:»), y el alias comercial entre paréntesis.
 *
 * ⚠ « I » (i mayúscula) es el separador del libro, pero no siempre antecede una cédula: en «O4Bi I
 * Rempro» antecede al cliente final. Solo se descarta el pedazo que tiene forma de identificador.
 */
export function identidadDelNombre(raw: string): IdentidadDelNombre {
  let texto = raw.replace(/\s+/g, " ").trim();
  let alias: string | null = null;
  const ids: string[] = [];

  texto = texto.replace(/\(([^)]*)\)/g, (_m, dentro: string) => {
    const d = dentro.trim();
    if (!d) return " ";
    if (tieneIdentificador(d)) ids.push(d);
    else if (!alias) alias = d;
    return " ";
  });

  const partes = texto
    .split(/\s+(?:I|\/)\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const nombrePartes: string[] = [];
  for (const parte of partes) {
    if (pareceIdentificador(parte)) {
      ids.push(parte);
      continue;
    }
    /* Un identificador al final sin separador: «… DE MÉXICO TEA950619MP8». */
    const palabras = parte.split(" ");
    const ultima = palabras[palabras.length - 1] ?? "";
    if (palabras.length > 1 && tieneIdentificador(ultima)) {
      ids.push(ultima);
      palabras.pop();
    }
    nombrePartes.push(palabras.join(" "));
  }

  const nombre = nombrePartes.join(" ").replace(/\s+/g, " ").replace(/[\s,.;:-]+$/, "").trim();
  let clave = claveDeTexto(nombre);
  let cedulaDigitos = ids.map((i) => soloDigitos(i.replace(/^(nit|nrc|ein|rfc|ruc|vat)\s*:\s*/i, ""))).find((d) => d.length >= 6);
  /* «3-101-721431 SOCIEDAD ANONIMA»: la sociedad no tiene más nombre que su número, y ese número es su cédula. */
  if (/^[\d ]+$/.test(clave)) {
    clave = clave.replace(/ /g, "");
    if (!cedulaDigitos && clave.length >= 9) cedulaDigitos = clave;
  }
  if (!clave && cedulaDigitos) clave = cedulaDigitos;
  if (!clave) clave = claveDeTexto(raw);
  return { nombre: nombre || raw.trim(), clave, alias, cedula: cedulaDigitos ?? null };
}

/**
 * Las palabras que distinguen a una empresa: sin tildes, puntuación, forma jurídica ni palabras de enlace.
 * La comparten la clave de acá y la clave suelta del alta (lib/cobranza/empresas-parecidas.ts): una sola
 * lista de formas jurídicas, así «S.A. de C.V.» no se quita en un lado y en el otro no.
 */
export function palabrasDelNombre(s: string): string[] {
  return plano(s)
    .replace(RE_FORMAS, " ")
    .replace(RE_FORMAS, " ")
    .split(" ")
    .filter((p) => p && !ENLACES.has(p));
}

function claveDeTexto(s: string): string {
  const tokens = palabrasDelNombre(s).filter((p) => !(tieneIdentificador(p) && /[a-z]/.test(p)));
  /* Siglas deletreadas: «D C C» es «DCC», como la escribe la razón social de la cuenta. */
  const juntos: string[] = [];
  let letras = "";
  for (const t of tokens) {
    if (/^[a-z]$/.test(t)) {
      letras += t;
      continue;
    }
    if (letras) juntos.push(letras);
    letras = "";
    juntos.push(t);
  }
  if (letras) juntos.push(letras);
  return juntos.join(" ");
}

/**
 * La clave de una sociedad: sin tildes, puntuación, forma jurídica, palabras de enlace ni la cédula
 * pegada. «Visual Branding, S.A. de C.V» y «Visual Branding» dan la misma.
 */
export function claveSociedad(raw: string | null | undefined): string {
  if (!raw) return "";
  return identidadDelNombre(raw).clave;
}

/* ── Candidatas ─────────────────────────────────────────────────────────────────── */

export interface SociedadConocida {
  id: string;
  /** Todos los nombres con que se la conoce: el comercial y la razón social. */
  nombres: readonly (string | null | undefined)[];
  cedula?: string | null;
}

/**
 * Por qué una sociedad es candidata, de la señal más fuerte a la más débil. Solo se devuelven las del
 * escalón más fuerte que tenga alguna.
 *  · CEDULA  — los dígitos de la cédula pegada al nombre son los de la cuenta.
 *  · NOMBRE  — misma clave.
 *  · ALIAS   — lo que va entre paréntesis es el nombre de la cuenta («(Construtecho)»).
 *  · PARCIAL — todas las palabras de uno están en el otro («Oceanica» ⊂ «Clínica Oceanica»).
 *  · SIGLAS  — «CAV» son las iniciales de «Club de Amantes del Vino». La más débil: solo sirve para
 *              mostrar, nunca para proponer un número.
 */
export type ViaDeNombre = "CEDULA" | "NOMBRE" | "ALIAS" | "PARCIAL" | "SIGLAS";
const ESCALONES: readonly ViaDeNombre[] = ["CEDULA", "NOMBRE", "ALIAS", "PARCIAL", "SIGLAS"];

export interface CandidataPorNombre {
  id: string;
  via: ViaDeNombre;
}

const palabras = (clave: string) => clave.split(" ").filter(Boolean);

/** Todas las palabras de `a` están en `b`, y `a` alcanza para distinguir (no una sílaba suelta). */
function contenida(a: string, b: string): boolean {
  const pa = palabras(a);
  if (!pa.length) return false;
  if (pa.length === 1 && pa[0]!.length < 4) return false;
  const pb = new Set(palabras(b));
  return pa.every((p) => pb.has(p));
}

function siglas(clave: string): string {
  return palabras(clave)
    .map((p) => p[0] ?? "")
    .join("");
}

/**
 * Las sociedades conocidas que pueden ser la del nombre `raw`, del escalón más fuerte que tenga alguna.
 * Vacío = ninguna. Más de una = hay que preguntarle a una persona.
 */
export function candidatasPorNombre(raw: string, conocidas: readonly SociedadConocida[]): CandidataPorNombre[] {
  const ident = identidadDelNombre(raw);
  const aliasClave = ident.alias ? claveSociedad(ident.alias) : "";
  const porVia = new Map<ViaDeNombre, Set<string>>();
  const anotar = (via: ViaDeNombre, id: string) => porVia.set(via, (porVia.get(via) ?? new Set()).add(id));

  for (const s of conocidas) {
    const cedula = soloDigitos(s.cedula);
    if (ident.cedula && cedula.length >= 6 && cedula === ident.cedula) anotar("CEDULA", s.id);
    for (const n of s.nombres) {
      if (!n) continue;
      const clave = claveSociedad(n);
      if (!clave) continue;
      if (ident.clave && clave === ident.clave) anotar("NOMBRE", s.id);
      else if (aliasClave && clave === aliasClave) anotar("ALIAS", s.id);
      else if (ident.clave && (contenida(ident.clave, clave) || contenida(clave, ident.clave))) anotar("PARCIAL", s.id);
      else if (
        ident.clave &&
        /^[a-z]{2,5}$/.test(ident.clave) &&
        palabras(clave).length >= 2 &&
        siglas(clave) === ident.clave
      ) {
        anotar("SIGLAS", s.id);
      }
    }
  }

  for (const via of ESCALONES) {
    const ids = porVia.get(via);
    if (ids?.size) return [...ids].sort().map((id) => ({ id, via }));
  }
  return [];
}
