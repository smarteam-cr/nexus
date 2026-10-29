/**
 * lib/exploraciones/foto-de-la-escala.ts — la FOTO de dónde está la empresa en la escala. PURO.
 *
 * Ficha B (2026-10-17, pedido de Elías: «la misma escala en la ficha del cliente, con su histórico»). Una foto es lo
 * CONFIRMADO de una exploración (la preventa o la de un proyecto) en un momento: por área, su nivel, sus dos capas y
 * lo que la frena; por dimensión, su nivel y DE DÓNDE SALE (la fuente, la frase que lo respalda y el porqué). Lo que el
 * agente propone y nadie usó no entra: no posiciona a la empresa. Un nivel confirmado que salió del test o de una
 * hipótesis entra, marcado como hipótesis.
 *
 * La misma foto la leen la ficha del cliente (La cuenta › La escala, cada versión con su fecha), el camino de
 * crecimiento (lib/casos-de-uso/camino.ts) y «Qué explorar» de la preventa (`cambiosEntreFotos`). La guarda
 * lib/exploraciones/versiones-de-la-escala.ts en `VersionDeLaEscala.foto`.
 */
import type { ClaveDeCapa, Letra } from "@/lib/escala/documento/tipos";
import { ETIQUETA_DE_LA_FUENTE, esFuenteDeHipotesis, FUENTES_DEL_NIVEL, type EstadoDeExploracion, type FuenteDelNivel } from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { chequeoDelMapa, loQueLaFrena, posicionesDelMapa } from "./mapa";

/** Por qué se guardó una versión: un nivel que se confirmó, el diagnóstico de un ciclo, o «Guardar esta versión». */
export const ORIGENES_DE_LA_VERSION = ["cambio", "diagnostico", "manual"] as const;
export type OrigenDeLaVersion = (typeof ORIGENES_DE_LA_VERSION)[number];

export const ETIQUETA_DEL_ORIGEN: Record<OrigenDeLaVersion, string> = {
  cambio: "Se confirmó un nivel",
  diagnostico: "El diagnóstico del ciclo",
  manual: "Guardada a mano",
};

const LETRAS: readonly Letra[] = ["D", "I", "F", "E", "O"];

export interface DimensionDeLaFoto {
  id: string;
  nombre: string;
  capa: ClaveDeCapa;
  /** Una dimensión que no aplica al perfil de la empresa no se cuenta. */
  aplica: boolean;
  nivel: Letra | null;
  /** `evidencia`: lo dijo el cliente, se vio o lo marcó quien exploró · `hipotesis`: del test o de una hipótesis. */
  clase: "evidencia" | "hipotesis" | null;
  fuente: FuenteDelNivel | null;
  /** La frase que lo respalda, en palabras del cliente. */
  cita: string | null;
  porQue: string | null;
  /** Dejó ver un riesgo: no se estima por encima de Funcional. */
  riesgo: boolean;
}

export interface AreaDeLaFoto {
  id: string;
  nombre: string;
  nivel: Letra | null;
  puntaje: number | null;
  capas: Record<ClaveDeCapa, { nombre: string; nivel: Letra | null }>;
  /** Lo que deja al área en su nivel: la capa más baja y sus dimensiones más débiles. null mientras falte algo. */
  frena: { capa: ClaveDeCapa; nivel: Letra; dimensiones: string[] } | null;
  /** Hasta dónde se empuja (Funcional, o el siguiente si ya llegó). null en Óptimo o mientras falte algo. */
  objetivo: Letra | null;
  dimensiones: DimensionDeLaFoto[];
  /** Cuántas dimensiones que aplican tienen nivel, y cuántas de esas con evidencia. */
  conNivel: number;
  conEvidencia: number;
  aplican: number;
}

export interface FotoDeLaEscala {
  formato: 1;
  escalaVersion: string | null;
  edicion: string | null;
  areas: AreaDeLaFoto[];
}

/** La foto de lo confirmado de una exploración. `areas` vacío = todavía no posiciona a la empresa. */
export function fotoDeLaExploracion(escala: EscalaDelLienzo, estado: Pick<EstadoDeExploracion, "contenido">): FotoDeLaEscala {
  // Solo lo confirmado: lo que el agente propone y nadie usó no posiciona a la empresa.
  const pos = posicionesDelMapa(estado as EstadoDeExploracion, []);
  const conAlgo = escala.areas.filter((a) => a.dimensiones.some((d) => pos[d.id]));
  const chequeo = chequeoDelMapa(escala, conAlgo.map((a) => a.id), pos);
  const nombreDeCapa = (c: ClaveDeCapa) => escala.capas.find((x) => x.clave === c)?.nombre ?? c;
  return {
    formato: 1,
    escalaVersion: escala.version ?? null,
    edicion: escala.edicion?.nombre ?? null,
    areas: conAlgo.map((a) => {
      const r = chequeo.areas.find((x) => x.id === a.id);
      const dims: DimensionDeLaFoto[] = a.dimensiones.map((d) => {
        const p = pos[d.id];
        return {
          id: d.id,
          nombre: d.nombre,
          capa: d.capa,
          aplica: d.aplica,
          nivel: p?.nivel ?? null,
          clase: p?.clase ?? null,
          fuente: p?.fuente ?? null,
          cita: p?.citas[0]?.cita ?? null,
          porQue: p?.porQue ?? null,
          riesgo: !!p?.riesgo,
        };
      });
      const aplican = dims.filter((d) => d.aplica);
      return {
        id: a.id,
        nombre: a.nombre,
        nivel: r?.nivel ?? null,
        puntaje: r?.puntaje ?? null,
        capas: {
          base: { nombre: nombreDeCapa("base"), nivel: r?.capas.base.nivel ?? null },
          produccion: { nombre: nombreDeCapa("produccion"), nivel: r?.capas.produccion.nivel ?? null },
        },
        frena: r ? loQueLaFrena(r) : null,
        objetivo: r?.objetivo ?? null,
        dimensiones: dims,
        conNivel: aplican.filter((d) => d.nivel).length,
        conEvidencia: aplican.filter((d) => d.clase === "evidencia").length,
        aplican: aplican.length,
      };
    }),
  };
}

/** Lo que cuenta para decir que dos fotos son la misma: el nivel y la clase de cada dimensión, y el área. */
export function huellaDeLaFoto(f: FotoDeLaEscala): string {
  return f.areas
    .map((a) => `${a.id}=${a.nivel ?? "-"}:${a.dimensiones.map((d) => `${d.id}${d.nivel ?? "-"}${d.clase === "hipotesis" ? "?" : ""}`).join(",")}`)
    .sort()
    .join("|");
}

/** De dónde sale el nivel, en palabras (la ficha y la preventa lo dicen igual). */
export function deDondeSaleElNivel(fuente: FuenteDelNivel | null): string {
  switch (fuente) {
    case "test":
      return "Lo marcó en el test (con la escala anterior)";
    case "hipotesis":
      return "Hipótesis: lo dedujo el agente y alguien la usó";
    case "vendedor":
      return "Lo marcó quien exploró";
    case "portal":
      return "Se vio en su portal";
    case "reunion":
      return "Lo dijo el cliente en una reunión";
    default:
      return "Sin dato";
  }
}

// ── Leer una foto guardada (tolerante: un Json viejo o roto no rompe la pantalla) ──

const esLetra = (v: unknown): v is Letra => typeof v === "string" && (LETRAS as readonly string[]).includes(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const esCapa = (v: unknown): v is ClaveDeCapa => v === "base" || v === "produccion";

export function leerFoto(v: unknown): FotoDeLaEscala | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.areas)) return null;
  const areas: AreaDeLaFoto[] = [];
  for (const crudo of o.areas) {
    if (!crudo || typeof crudo !== "object") continue;
    const a = crudo as Record<string, unknown>;
    if (typeof a.id !== "string" || !Array.isArray(a.dimensiones)) continue;
    const dims: DimensionDeLaFoto[] = (a.dimensiones as unknown[])
      .filter((d): d is Record<string, unknown> => !!d && typeof d === "object" && typeof (d as { id?: unknown }).id === "string")
      .map((d) => ({
        id: d.id as string,
        nombre: texto(d.nombre) ?? (d.id as string),
        capa: esCapa(d.capa) ? d.capa : "base",
        aplica: d.aplica !== false,
        nivel: esLetra(d.nivel) ? d.nivel : null,
        clase: d.clase === "evidencia" || d.clase === "hipotesis" ? d.clase : null,
        fuente: (FUENTES_DEL_NIVEL as readonly unknown[]).includes(d.fuente) ? (d.fuente as FuenteDelNivel) : null,
        cita: texto(d.cita),
        porQue: texto(d.porQue),
        riesgo: d.riesgo === true,
      }));
    const capas = (a.capas && typeof a.capas === "object" ? a.capas : {}) as Record<string, { nombre?: unknown; nivel?: unknown } | undefined>;
    const capa = (c: ClaveDeCapa) => ({ nombre: texto(capas[c]?.nombre) ?? c, nivel: esLetra(capas[c]?.nivel) ? (capas[c]!.nivel as Letra) : null });
    const fr = a.frena as { capa?: unknown; nivel?: unknown; dimensiones?: unknown } | null | undefined;
    const aplican = dims.filter((d) => d.aplica);
    areas.push({
      id: a.id,
      nombre: texto(a.nombre) ?? a.id,
      nivel: esLetra(a.nivel) ? a.nivel : null,
      puntaje: typeof a.puntaje === "number" ? a.puntaje : null,
      capas: { base: capa("base"), produccion: capa("produccion") },
      frena:
        fr && esCapa(fr.capa) && esLetra(fr.nivel) && Array.isArray(fr.dimensiones)
          ? { capa: fr.capa, nivel: fr.nivel, dimensiones: fr.dimensiones.filter((x): x is string => typeof x === "string") }
          : null,
      objetivo: esLetra(a.objetivo) ? a.objetivo : null,
      dimensiones: dims,
      conNivel: aplican.filter((d) => d.nivel).length,
      conEvidencia: aplican.filter((d) => d.clase === "evidencia").length,
      aplican: aplican.length,
    });
  }
  return { formato: 1, escalaVersion: texto(o.escalaVersion), edicion: texto(o.edicion), areas };
}

// ── Qué cambió entre dos fotos ────────────────────────────────────────────────

/**
 * ¿Se midieron con la misma vara? Una edición de la escala no se compara con otra (escala única, 2026-10-28): cambiar de
 * edición fija un punto de partida nuevo, y «qué cambió» no cruza esa línea. La foto guarda el NOMBRE de la edición
 * (null = la escala general).
 */
export function mismaVara(a: Pick<FotoDeLaEscala, "edicion">, b: Pick<FotoDeLaEscala, "edicion">): boolean {
  return (a.edicion ?? null) === (b.edicion ?? null);
}

/**
 * La versión anterior de la MISMA escala (la misma exploración: la cuenta con la cuenta, un proyecto con su proyecto),
 * en una lista de la más nueva a la más vieja. Una de otra exploración se midió aparte: compararlas diría «cambió» o
 * «antes se medía con…» de algo que nunca fue suyo. Una versión suelta (su exploración se borró: `exploracionId` null)
 * no se compara con nada, ni con otra suelta (revisión de la escala única, 2026-10-29).
 */
export function anteriorDeSuEscala<T extends { exploracionId: string | null }>(versiones: readonly T[], i: number): T | null {
  const v = versiones[i];
  if (!v?.exploracionId) return null;
  return versiones.slice(i + 1).find((x) => x.exploracionId === v.exploracionId) ?? null;
}

/**
 * Con qué foto se compara una: la inmediatamente anterior (`previas`, de la más nueva a la más vieja), si es de la MISMA
 * edición. Si es de otra, la de ahora es un punto de partida nuevo (`desdeEdicion`: con qué se medía), aunque más atrás
 * haya una de la misma: la línea se cortó en el cambio.
 */
export function anteriorDeLaMismaVara<T extends { foto: Pick<FotoDeLaEscala, "edicion"> }>(
  ahora: Pick<FotoDeLaEscala, "edicion">,
  previas: readonly T[],
): { anterior: T | null; puntoDePartida: { desdeEdicion: string | null } | null } {
  const inmediata = previas[0] ?? null;
  if (!inmediata) return { anterior: null, puntoDePartida: null };
  if (!mismaVara(inmediata.foto, ahora)) return { anterior: null, puntoDePartida: { desdeEdicion: inmediata.foto.edicion ?? null } };
  return { anterior: inmediata, puntoDePartida: null };
}

export type TipoDeCambio = "subio" | "bajo" | "nuevo" | "confirmado" | "quitado";

export interface CambioDeNivel {
  areaId: string;
  areaNombre: string;
  dimensionId: string;
  nombre: string;
  antes: Letra | null;
  ahora: Letra | null;
  tipo: TipoDeCambio;
}

/**
 * Qué cambió dimensión por dimensión entre una foto anterior y la de ahora: subió, bajó, se ubicó por primera vez,
 * una hipótesis pasó a tener evidencia, o perdió su nivel. Lo que no cambió no sale. Sin foto anterior, todo lo que
 * tiene nivel es «nuevo».
 */
export function cambiosEntreFotos(antes: FotoDeLaEscala | null, ahora: FotoDeLaEscala): CambioDeNivel[] {
  const previas = new Map<string, DimensionDeLaFoto>();
  for (const a of antes?.areas ?? []) for (const d of a.dimensiones) previas.set(d.id, d);
  const out: CambioDeNivel[] = [];
  const vistas = new Set<string>();
  for (const a of ahora.areas) {
    for (const d of a.dimensiones) {
      vistas.add(d.id);
      if (!d.aplica) continue;
      const p = previas.get(d.id);
      const base = { areaId: a.id, areaNombre: a.nombre, dimensionId: d.id, nombre: d.nombre, antes: p?.nivel ?? null, ahora: d.nivel };
      if (!d.nivel) {
        if (p?.nivel) out.push({ ...base, tipo: "quitado" });
        continue;
      }
      if (!p?.nivel) out.push({ ...base, tipo: "nuevo" });
      else if (LETRAS.indexOf(d.nivel) > LETRAS.indexOf(p.nivel)) out.push({ ...base, tipo: "subio" });
      else if (LETRAS.indexOf(d.nivel) < LETRAS.indexOf(p.nivel)) out.push({ ...base, tipo: "bajo" });
      else if (p.clase === "hipotesis" && d.clase === "evidencia") out.push({ ...base, tipo: "confirmado" });
    }
  }
  // Un área entera que ya no está en la foto: sus niveles se quitaron.
  for (const a of antes?.areas ?? []) {
    for (const d of a.dimensiones) {
      if (vistas.has(d.id) || !d.nivel || !d.aplica) continue;
      out.push({ areaId: a.id, areaNombre: a.nombre, dimensionId: d.id, nombre: d.nombre, antes: d.nivel, ahora: null, tipo: "quitado" });
    }
  }
  return out;
}

/** El cambio en una frase: «Datos subió de Inicial a Funcional». */
export function fraseDelCambio(c: CambioDeNivel, nombreDeNivel: (l: Letra) => string): string {
  switch (c.tipo) {
    case "subio":
      return `${c.nombre} subió de ${nombreDeNivel(c.antes!)} a ${nombreDeNivel(c.ahora!)}`;
    case "bajo":
      return `${c.nombre} bajó de ${nombreDeNivel(c.antes!)} a ${nombreDeNivel(c.ahora!)}`;
    case "nuevo":
      return `${c.nombre} se ubicó en ${nombreDeNivel(c.ahora!)}`;
    case "confirmado":
      return `${c.nombre} se confirmó con evidencia en ${nombreDeNivel(c.ahora!)}`;
    case "quitado":
      return `${c.nombre} quedó sin nivel`;
  }
}

/** La fuente con su etiqueta corta (la de las citas de la preventa). */
export function etiquetaDeLaFuente(f: FuenteDelNivel | null): string {
  return f ? ETIQUETA_DE_LA_FUENTE[f] : "";
}

export { esFuenteDeHipotesis };
