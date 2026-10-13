/**
 * lib/casos-de-uso/vista.ts — lo que las pantallas del catálogo calculan sobre los casos. PURO.
 *
 * El catálogo vive en `catalogo.ts`; acá están los filtros, el salto de nivel de cada área y quién sube cada
 * dimensión. Lo usan la lista, «En la escala» y la ficha de cada caso (app/(shell)/sales/use-cases). Los nombres
 * de las dimensiones y de los niveles NO se escriben acá: salen de la escala publicada (`EscalaDelCatalogo`).
 */
import type { Letra } from "@/lib/escala/documento/tipos";
import { LETRAS } from "@/lib/escala/documento/tipos";
import type { AreaDeLaEscala, CasoDelCatalogo, Herramienta, Movimiento, Servicio, TipoDeCaso } from "./catalogo";

export const TIPOS_DE_CASO: readonly { clave: TipoDeCaso; titulo: string; descripcion: string }[] = [
  { clave: "aterrizar", titulo: "Aterrizar un área", descripcion: "Llevan un área a Funcional, la base de la escala. Suelen ser el primer proyecto con un cliente." },
  { clave: "reactivar", titulo: "Reactivar", descripcion: "El cliente ya tiene HubSpot y no lo usa: lo lleva de Inicial a Funcional." },
  { clave: "expandir", titulo: "Expandir", descripcion: "Sobre un área que ya funciona, o casi: la suben hasta Eficiente u Óptimo." },
  { clave: "complementario", titulo: "Complementario", descripcion: "No mueven la escala: acompañan a otro caso." },
];

export const NOMBRE_DEL_TIPO: Record<TipoDeCaso, string> = {
  aterrizar: "Aterrizar",
  reactivar: "Reactivar",
  expandir: "Expandir",
  complementario: "Complementario",
};

export const NOMBRE_DE_LA_HERRAMIENTA: Record<Herramienta, string> = {
  hubspot: "HubSpot",
  insider: "Insider",
  smarteam: "Smarteam",
};

/** Lo que la pantalla necesita de la escala publicada: nombres y orden, nada más. Serializable. */
export interface EscalaDelCatalogo {
  version: string;
  niveles: { letra: Letra; nombre: string }[];
  areas: { id: AreaDeLaEscala; nombre: string; dimensiones: { id: string; nombre: string; capa: "base" | "produccion" }[] }[];
}

const orden = (l: Letra) => LETRAS.indexOf(l);

export function nombreDelNivel(escala: Pick<EscalaDelCatalogo, "niveles">, letra: Letra): string {
  return escala.niveles.find((n) => n.letra === letra)?.nombre ?? letra;
}

export function nombreDelArea(escala: Pick<EscalaDelCatalogo, "areas">, area: string): string {
  return escala.areas.find((a) => a.id === area)?.nombre ?? `Área ${area}`;
}

export function nombreDeLaDimension(escala: Pick<EscalaDelCatalogo, "areas">, dimension: string): string {
  for (const a of escala.areas) for (const d of a.dimensiones) if (d.id === dimension) return d.nombre;
  return dimension;
}

export interface SaltoDelArea {
  area: AreaDeLaEscala;
  desde: Letra;
  hasta: Letra;
  dimensiones: number;
}

/** Por área, del nivel más bajo de partida al más alto de llegada. Es lo que dice la tarjeta del caso. */
export function saltosPorArea(caso: Pick<CasoDelCatalogo, "areas" | "mueve">): SaltoDelArea[] {
  const out: SaltoDelArea[] = [];
  for (const area of [...caso.areas].sort()) {
    const dims = caso.mueve.filter((m) => m.dimension.split(".")[0] === area);
    if (dims.length === 0) continue;
    let desde = dims[0].desde;
    let hasta = dims[0].hasta;
    for (const m of dims) {
      if (orden(m.desde) < orden(desde)) desde = m.desde;
      if (orden(m.hasta) > orden(hasta)) hasta = m.hasta;
    }
    out.push({ area, desde, hasta, dimensiones: dims.length });
  }
  return out;
}

/** «Solo Smarteam»: los casos que no piden una licencia de HubSpot ni de Insider. */
export type FiltroDeHerramienta = "hubspot" | "insider" | "solo-smarteam";
/** «sin»: el cliente parte sin sistema (Deficiente o Inicial) en alguna dimensión que el caso mueve. */
export type FiltroDeNivel = "sin" | "F" | "E";

export interface FiltrosDelCatalogo {
  texto: string;
  area: AreaDeLaEscala | "";
  herramienta: FiltroDeHerramienta | "";
  tipo: TipoDeCaso | "";
  servicio: Servicio | "";
  nivel: FiltroDeNivel | "";
}

export const SIN_FILTROS: FiltrosDelCatalogo = { texto: "", area: "", herramienta: "", tipo: "", servicio: "", nivel: "" };

export function hayFiltros(f: FiltrosDelCatalogo): boolean {
  return Boolean(f.texto.trim() || f.area || f.herramienta || f.tipo || f.servicio || f.nivel);
}

/** Minúsculas y sin tildes, para buscar «prospeccion» y encontrar «prospección». */
export function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function usaLaHerramienta(caso: Pick<CasoDelCatalogo, "herramientas">, h: FiltroDeHerramienta): boolean {
  if (h === "solo-smarteam") return !caso.herramientas.some((x) => x === "hubspot" || x === "insider");
  return caso.herramientas.includes(h);
}

/** El buscador mira el título, la promesa, lo que dice el cliente y lo que obtiene. */
export function pasaLosFiltros(caso: CasoDelCatalogo, f: FiltrosDelCatalogo): boolean {
  if (f.area && !caso.areas.includes(f.area)) return false;
  if (f.herramienta && !usaLaHerramienta(caso, f.herramienta)) return false;
  if (f.tipo && caso.tipo !== f.tipo) return false;
  if (f.servicio && !caso.servicios.includes(f.servicio)) return false;
  if (f.nivel === "sin" && !caso.mueve.some((m) => m.desde === "D" || m.desde === "I")) return false;
  if ((f.nivel === "F" || f.nivel === "E") && !caso.mueve.some((m) => m.desde === f.nivel)) return false;
  const q = normalizar(f.texto.trim());
  if (q) {
    const donde = normalizar([caso.titulo, caso.promesa, ...caso.sintomas, ...caso.obtienes].join(" "));
    if (!q.split(/\s+/).every((palabra) => donde.includes(palabra))) return false;
  }
  return true;
}

export interface CasoQueSube {
  caso: CasoDelCatalogo;
  movimiento: Movimiento;
}

/** Los casos que suben una dimensión, ordenados por el nivel de partida y después por el de llegada. */
export function casosQueSuben(casos: readonly CasoDelCatalogo[], dimension: string, herramienta: FiltroDeHerramienta | "" = ""): CasoQueSube[] {
  const out: CasoQueSube[] = [];
  for (const caso of casos) {
    if (herramienta && !usaLaHerramienta(caso, herramienta)) continue;
    const movimiento = caso.mueve.find((m) => m.dimension === dimension);
    if (movimiento) out.push({ caso, movimiento });
  }
  return out.sort(
    (a, b) =>
      orden(a.movimiento.desde) - orden(b.movimiento.desde) ||
      orden(a.movimiento.hasta) - orden(b.movimiento.hasta) ||
      a.caso.titulo.localeCompare(b.caso.titulo, "es"),
  );
}

/** «1 caso», «3 casos». */
export function cuantosCasos(n: number): string {
  return n === 1 ? "1 caso" : `${n} casos`;
}

/** Cada criterio citado, agrupado por la dimensión que mueve, en el orden en que el caso las declara. */
export function criteriosPorDimension(caso: Pick<CasoDelCatalogo, "mueve" | "criterios">): { movimiento: Movimiento; criterios: string[] }[] {
  return caso.mueve.map((movimiento) => ({
    movimiento,
    criterios: caso.criterios
      .filter((id) => id.startsWith(`${movimiento.dimension}.`))
      .sort((a, b) => orden(a.split(".")[2][0] as Letra) - orden(b.split(".")[2][0] as Letra) || a.localeCompare(b, "es", { numeric: true })),
  }));
}
