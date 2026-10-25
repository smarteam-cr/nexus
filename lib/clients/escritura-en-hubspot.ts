/**
 * lib/clients/escritura-en-hubspot.ts — qué se escribe en la empresa de HubSpot después de una decisión (R2, 2026-10-25).
 * PURO.
 *
 * Recibe lo que quedó en Nexus (cada dato aplicado, con su valor, su fuente y su fecha) y lo que tiene HOY la empresa en
 * HubSpot, y dice qué propiedades escribir. La regla de cada dato es la del espejo (`queSeEscribe`,
 * lib/hubspot/empresa.ts); acá solo se juntan las de una decisión: el TAM arrastra de dónde salió y cuándo, y una
 * propiedad que ya tiene ese valor no se vuelve a escribir. Lo usan el servidor (escritura-en-hubspot-server.ts) y el
 * script de la escritura masiva.
 */
import type { ClaveDeDato, FuenteDeDato, ValorDeDato } from "./datos-de-la-empresa";
import { ESPEJO_DE_LA_EMPRESA, propiedadesDelTam, queSeEscribe } from "@/lib/hubspot/empresa";

const PROPIEDAD_POR_DATO: Partial<Record<ClaveDeDato, string>> = Object.fromEntries(ESPEJO_DE_LA_EMPRESA.map((c) => [c.clave, c.propiedad]));

export interface DatoParaEscribir {
  /** La fila de `PropuestaDeDato` de esta decisión, donde queda lo que había en HubSpot. null = no hay fila. */
  propuestaId: string | null;
  clave: ClaveDeDato;
  valor: ValorDeDato | null;
  fuente: FuenteDeDato | null;
  at: Date | null;
}

export interface Escritura {
  propiedad: string;
  valor: string;
  /** Lo que tenía HubSpot ("" = vacía): va a la fila para poder volver atrás. */
  anterior: string;
  /** La fila que guarda lo de antes. null en lo que acompaña (la fuente y la fecha del TAM) y en lo calculado sin dato. */
  propuestaId: string | null;
  clave: ClaveDeDato | null;
}

/** La propiedad de HubSpot de un dato (queSeEscribe la valida; acá solo para leer lo que hay allá). */
function propiedadDe(clave: ClaveDeDato): string {
  return PROPIEDAD_POR_DATO[clave] ?? "";
}

/**
 * Las propiedades a escribir, una vez cada una (si dos decisiones tocan la misma, gana la última). `extras` son
 * propiedades que calcula Nexus sin un dato detrás (la fecha de la investigación, el siguiente caso): se escriben si
 * cambiaron.
 */
export function planDeEscritura(
  datos: readonly DatoParaEscribir[],
  enHubspot: Readonly<Record<string, string | null | undefined>>,
  extras: readonly { propiedad: string; valor: string }[] = [],
): Escritura[] {
  const porPropiedad = new Map<string, Escritura>();
  const ahi = (p: string) => (enHubspot[p] ?? "").trim();
  for (const d of datos) {
    const e = queSeEscribe({ clave: d.clave, valor: d.valor, fuente: d.fuente, enHubspot: ahi(propiedadDe(d.clave)) });
    if (!e) continue;
    porPropiedad.set(e.propiedad, { ...e, anterior: ahi(e.propiedad), propuestaId: d.propuestaId, clave: d.clave });
    if (d.clave === "tamUsd" && d.fuente) {
      for (const x of propiedadesDelTam(d.fuente, d.at ?? new Date())) {
        if (ahi(x.propiedad) !== x.valor) porPropiedad.set(x.propiedad, { ...x, anterior: ahi(x.propiedad), propuestaId: null, clave: null });
      }
    }
  }
  for (const x of extras) {
    if (ahi(x.propiedad) !== x.valor) porPropiedad.set(x.propiedad, { ...x, anterior: ahi(x.propiedad), propuestaId: null, clave: null });
  }
  return [...porPropiedad.values()];
}

/** Las propiedades que hay que leer de HubSpot antes de escribir estos datos (lo que tienen hoy). */
export function propiedadesALeer(claves: readonly ClaveDeDato[], extras: readonly string[] = []): string[] {
  const out = new Set<string>(extras);
  for (const c of claves) {
    const p = PROPIEDAD_POR_DATO[c];
    if (p) out.add(p);
    if (c === "tamUsd") for (const x of ["nexus_tam_fuente", "nexus_tam_fecha"]) out.add(x);
  }
  return [...out];
}

/** Lo que se dice en la ficha después de escribir (o de no poder). */
export type EstadoDeLaEscritura =
  | { estado: "apagada" }
  | { estado: "sin_empresa" }
  | { estado: "nada" }
  | { estado: "escrita"; propiedades: string[] }
  | { estado: "fallo"; error: string };

export function textoDeLaEscritura(e: EstadoDeLaEscritura): string | null {
  switch (e.estado) {
    case "escrita":
      return e.propiedades.length === 1 ? "También quedó en HubSpot." : `También quedó en HubSpot (${e.propiedades.length} propiedades).`;
    case "fallo":
      return `No se pudo escribir en HubSpot: ${e.error}. Quedó en Nexus.`;
    default:
      return null;
  }
}
