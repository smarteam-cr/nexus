/**
 * lib/cobranza/empresas-parecidas.ts
 *
 * Antes de dar de alta una empresa, cuáles de las que ya existen se le parecen. PURO: sin Prisma, sin
 * red, sin reloj y sin zod (lo que devuelve lo dibuja «Nueva empresa»).
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────────
 * «Nueva empresa» buscaba duplicados solo por dominio exacto, y solo entre los CLIENTES. Medido el
 * 2026-09-13, la misma empresa ya está dos veces en cuatro casos:
 *   · «BLUESAT» y «bluesat.cr», que tiene el dominio por nombre;
 *   · «Areyá», cliente, y «Areyas», prospecto;
 *   · «Euro Stone CR» y «Eurostone»;
 *   · «Ministerio de Economía» y «Ministerio de Economía (MINEC)», con minec.gob.sv en los dos.
 * Comparando los nombres tal cual no se frena ninguno, y buscando solo clientes tampoco se ve Areyas.
 *
 * ⛔ Esto NO elige ni fusiona: devuelve las parecidas con el porqué, y la persona dice si es alguna.
 * Unir dos empresas por un nombre parecido es la otra forma de fabricar el mismo error.
 */
import { palabrasDelNombre } from "./sociedades";

/** Códigos de país que se pegan al final del nombre comercial («Euro Stone CR») y no lo distinguen. */
const PAISES = new Set(["cr", "mx", "gt", "sv", "hn", "ni", "pa", "co", "pe", "cl", "do", "ec", "us"]);

/**
 * El dominio que hay en un texto, si el texto ENTERO es un dominio («bluesat.cr», «https://www.x.com/»).
 * null si no. ⚠ «S.A.» no lo es: el último pedazo necesita al menos dos letras.
 */
export function dominioDelTexto(texto: string | null | undefined): string | null {
  const t = (texto ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  return /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,6}$/.test(t) ? t : null;
}

/**
 * La clave SUELTA de un nombre de empresa: sin tildes, puntuación, forma jurídica, lo que va entre
 * paréntesis, el dominio, el país del final, los espacios ni la «s» final.
 *
 *   «Areyas» ≡ «Areyá» · «bluesat.cr» ≡ «BLUESAT» · «Euro Stone CR» ≡ «Eurostone»
 *   «Ministerio de Economía (MINEC)» ≡ «Ministerio de Economía»
 *
 * Es suelta a propósito: sirve para PREGUNTAR, nunca para unir. Vacía si queda con menos de tres letras
 * («SA», «IIA» sin más): una clave así chocaría con medio padrón.
 */
export function claveSuelta(nombre: string | null | undefined): string {
  if (!nombre) return "";
  const sinParentesis = nombre.replace(/\([^)]*\)/g, " ");
  const sinDominios = sinParentesis
    .split(/\s+/)
    .map((t) => dominioDelTexto(t)?.split(".")[0] ?? t)
    .join(" ");
  /* Un pedazo con cinco dígitos o más es una cédula pegada, no el nombre. */
  const palabras = palabrasDelNombre(sinDominios).filter((p) => (p.match(/\d/g)?.length ?? 0) < 5);
  const ultima = palabras[palabras.length - 1];
  if (palabras.length > 1 && ultima && PAISES.has(ultima)) palabras.pop();
  let clave = palabras.join("");
  if (clave.length > 4 && clave.endsWith("s")) clave = clave.slice(0, -1);
  return clave.length >= 3 ? clave : "";
}

/** Una empresa que ya existe, de CUALQUIER tipo: cliente, prospecto, aliado o nuestra. */
export interface EmpresaExistente {
  id: string;
  nombre: string;
  /** `Client.kind`. */
  kind: string;
  /**
   * Sus dominios efectivos (los de correo y el de `company`), ⚠ ya sin los compartidos (gmail…): un
   * dominio compartido no dice de quién es nadie. Los filtra quien arma la lista.
   */
  dominios: readonly string[];
  /** Su cuenta de cobro, si ya tiene. */
  cuentaId: string | null;
}

/** Por qué se parece. El dominio pesa más: dos empresas distintas no comparten dominio. */
export type ViaDeParecido = "DOMINIO" | "NOMBRE";

export interface EmpresaParecida {
  id: string;
  nombre: string;
  kind: string;
  via: ViaDeParecido;
  cuentaId: string | null;
}

/**
 * Las empresas que ya existen y se parecen a la que se quiere dar de alta: primero las del mismo
 * dominio, después las de la misma clave suelta; cada una una sola vez, con la vía más fuerte.
 *
 * El dominio del alta es el que se tecleó y, si el nombre entero es un dominio, también ese. Lo mismo del
 * lado de las que existen: «bluesat.cr» dada de alta con el dominio por nombre choca con el dominio de
 * BLUESAT.
 */
export function empresasParecidas(
  alta: { nombre: string; dominio: string | null },
  existentes: readonly EmpresaExistente[],
): EmpresaParecida[] {
  const dominiosAlta = new Set(
    [dominioDelTexto(alta.dominio), dominioDelTexto(alta.nombre)].filter((d): d is string => d !== null),
  );
  const claveAlta = claveSuelta(alta.nombre);

  const porDominio: EmpresaParecida[] = [];
  const porNombre: EmpresaParecida[] = [];
  for (const e of existentes) {
    const dominios = [...e.dominios.map((d) => d.toLowerCase()), dominioDelTexto(e.nombre)];
    const parecida = { id: e.id, nombre: e.nombre, kind: e.kind, cuentaId: e.cuentaId };
    if (dominios.some((d) => d !== null && dominiosAlta.has(d))) porDominio.push({ ...parecida, via: "DOMINIO" });
    else if (claveAlta && claveSuelta(e.nombre) === claveAlta) porNombre.push({ ...parecida, via: "NOMBRE" });
  }
  /* Dentro de cada vía, las que ya son cartera primero: es la que casi siempre se quiere abrir. */
  const orden = (a: EmpresaParecida, b: EmpresaParecida) =>
    Number(b.kind === "CLIENTE") - Number(a.kind === "CLIENTE") || a.nombre.localeCompare(b.nombre, "es");
  return [...porDominio.sort(orden), ...porNombre.sort(orden)];
}
