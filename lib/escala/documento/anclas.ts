/**
 * lib/escala/documento/anclas.ts — a qué apunta un identificador de la escala. PURO.
 *
 * Lo que se manda desde la escala se ancla a un identificador ESTABLE (la especificación garantiza
 * que no se reasignan ni se renumeran): la dimensión (`1.7`), el nivel entero (`1.7.F`) o un
 * criterio (`1.7.F1`). `resolverAncla` dice qué es y cuál es su texto HOY; ese texto se congela en
 * el reporte de feedback al mandarlo (lib/feedback/escala-server.ts), para mostrar después si una
 * versión nueva lo cambió.
 */
import { nombreDeNivel } from "./parsear";
import { LETRAS, type Area, type Criterio, type Dimension, type Escala, type Letra, type Nivel } from "./tipos";

export type TipoDeAncla = "dimension" | "nivel" | "criterio";

/** `1.7`, `1.7.F` o `1.7.F1`. */
export const FORMA_DE_ANCLA = /^(\d+)\.(\d+)(?:\.([DIFEO])(\d+)?)?$/;

export interface AnclaResuelta {
  id: string;
  tipo: TipoDeAncla;
  area: Area;
  dimension: Dimension;
  nivel: Nivel | null;
  criterio: Criterio | null;
  /** El texto que se congela en el comentario. */
  texto: string;
  /** «Ventas · Tracción del Deal · Funcional». */
  ruta: string;
}

export function tipoDeAncla(id: string): TipoDeAncla | null {
  const m = FORMA_DE_ANCLA.exec(id);
  if (!m) return null;
  if (!m[3]) return "dimension";
  return m[4] ? "criterio" : "nivel";
}

/** El texto de una dimensión: nombre, pregunta, descripción (si la tiene) y costo de quedarse. */
export function textoDeDimension(d: Dimension): string {
  return `${d.nombre}\n${d.pregunta}${d.descripcion ? `\n${d.descripcion}` : ""}\nCosto de quedarse: ${d.costoDeQuedarse}`;
}

/** El texto de un nivel: su descripción y, desde Funcional, su línea de resultado. */
export function textoDeNivel(n: Nivel): string {
  return n.resultado ? `${n.descripcion}\nResultado: ${n.resultado}` : n.descripcion;
}

/** Qué es `id` en esta versión de la escala, o null si no existe (o no tiene la forma). */
export function resolverAncla(escala: Pick<Escala, "areas" | "niveles">, id: string): AnclaResuelta | null {
  const m = FORMA_DE_ANCLA.exec(id.trim());
  if (!m) return null;
  const area = escala.areas.find((a) => a.id === m[1]);
  const dimension = area?.dimensiones.find((d) => d.id === `${m[1]}.${m[2]}`);
  if (!area || !dimension) return null;
  if (!m[3]) {
    return {
      id: dimension.id,
      tipo: "dimension",
      area,
      dimension,
      nivel: null,
      criterio: null,
      texto: textoDeDimension(dimension),
      ruta: `${area.nombre} · ${dimension.nombre}`,
    };
  }
  const letra = m[3] as Letra;
  const nivel = dimension.niveles.find((n) => n.letra === letra);
  if (!nivel) return null;
  const ruta = `${area.nombre} · ${dimension.nombre} · ${nombreDeNivel(escala, letra)}`;
  if (!m[4]) {
    return { id: nivel.id, tipo: "nivel", area, dimension, nivel, criterio: null, texto: textoDeNivel(nivel), ruta };
  }
  const criterio = nivel.criterios.find((c) => c.id === id.trim());
  if (!criterio) return null;
  return { id: criterio.id, tipo: "criterio", area, dimension, nivel, criterio, texto: criterio.texto, ruta };
}

/** Todos los identificadores comentables con su texto: dimensiones, niveles y criterios. */
export function textosPorAncla(escala: Pick<Escala, "areas">): Map<string, string> {
  const out = new Map<string, string>();
  for (const a of escala.areas) {
    for (const d of a.dimensiones) {
      out.set(d.id, textoDeDimension(d));
      for (const n of d.niveles) {
        out.set(n.id, textoDeNivel(n));
        for (const c of n.criterios) out.set(c.id, c.texto);
      }
    }
  }
  return out;
}

/** ¿El ancla está dentro de esta celda (dimensión × nivel)? `1.7.F` y `1.7.F3` sí; `1.7` no. */
export function estaEnLaCelda(ancla: string, dimension: string, letra: Letra): boolean {
  const celda = `${dimension}.${letra}`;
  return ancla === celda || (ancla.startsWith(celda) && /^\d+$/.test(ancla.slice(celda.length)));
}

/** La dimensión de un ancla (`1.7.F1` → `1.7`). */
export function dimensionDeAncla(ancla: string): string | null {
  const m = FORMA_DE_ANCLA.exec(ancla);
  return m ? `${m[1]}.${m[2]}` : null;
}

/** La letra del nivel de un ancla, o null si es de dimensión. */
export function letraDeAncla(ancla: string): Letra | null {
  const m = FORMA_DE_ANCLA.exec(ancla);
  return m?.[3] && (LETRAS as readonly string[]).includes(m[3]) ? (m[3] as Letra) : null;
}
