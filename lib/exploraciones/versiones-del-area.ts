/**
 * lib/exploraciones/versiones-del-area.ts — LA FOTO DE LA PÁGINA DE UN ÁREA de La escala, para su historial de versiones
 * (23 nov, etapa 3 del plan maestro de «Hablar con Nexus»: «el historial suma los textos de la página de cada área»).
 * PURO y client-safe.
 *
 * Lo que una persona (o Nexus, con su clic) escribe en la página de un área vive en tres lugares de la exploración:
 *   · la descripción de «Resultado general» (`descripcionesDeLaEscala[areaId]`);
 *   · lo que dice la tarjeta de cada dimensión (`textosDelRadar[dimensionId]`);
 *   · los textos fijos del área (`textosDeLaPagina`, las claves `area.<id>.…` y las de «Qué priorizar» de sus dimensiones,
 *     `detalle.<dimensionId>.…`: lib/external/textos-de-la-pagina.ts › CLAVES).
 * La foto junta esos tres; volver a una versión los reemplaza a los tres y no toca nada más (ni los niveles, que tienen su
 * propio historial: la escala de la empresa en el tiempo).
 */
import type { ContenidoDeExploracion } from "./contenido";
import { huellaDeContenido } from "@/lib/versiones/historial";

/** La pieza de `VersionDeDocumento` que es la página de un área. */
export const piezaDelArea = (areaId: string): string => `area:${areaId}`;

export interface FotoDelArea {
  areaId: string;
  descripcion: NonNullable<ContenidoDeExploracion["descripcionesDeLaEscala"]>[string] | null;
  textosDelRadar: NonNullable<ContenidoDeExploracion["textosDelRadar"]>;
  textosDeLaPagina: Record<string, string>;
}

/** ¿Esta clave de `textosDeLaPagina` es de la página de esta área? */
export function esTextoDelArea(clave: string, areaId: string, dimensiones: readonly string[]): boolean {
  if (clave.startsWith(`area.${areaId}.`)) return true;
  return dimensiones.some((d) => clave.startsWith(`detalle.${d}.`));
}

export function fotoDelArea(c: Pick<ContenidoDeExploracion, "descripcionesDeLaEscala" | "textosDelRadar" | "textosDeLaPagina">, areaId: string, dimensiones: readonly string[]): FotoDelArea {
  const dims = new Set(dimensiones);
  return {
    areaId,
    descripcion: c.descripcionesDeLaEscala?.[areaId] ?? null,
    textosDelRadar: Object.fromEntries(Object.entries(c.textosDelRadar ?? {}).filter(([d]) => dims.has(d))),
    textosDeLaPagina: Object.fromEntries(Object.entries(c.textosDeLaPagina ?? {}).filter(([k]) => esTextoDelArea(k, areaId, dimensiones))),
  };
}

/**
 * La huella de la foto, sin la fecha ni la firma de la descripción (cambian solas al recalcular, no porque alguien escribió).
 * Dos fotos con lo mismo escrito dan la misma.
 */
export function huellaDelArea(f: FotoDelArea): string {
  return huellaDeContenido({
    descripcion: f.descripcion ? { texto: f.descripcion.texto, origen: f.descripcion.origen } : null,
    textosDelRadar: f.textosDelRadar,
    textosDeLaPagina: f.textosDeLaPagina,
  });
}

/** ¿La foto tiene algo escrito? Una página sin nada cambiado no deja versión. */
export const fotoConAlgo = (f: FotoDelArea): boolean => !!f.descripcion || Object.keys(f.textosDelRadar).length > 0 || Object.keys(f.textosDeLaPagina).length > 0;

/** El contenido con la foto puesta: los tres lugares del área reemplazados por los de la foto; lo de otras áreas, igual. */
export function contenidoConLaFoto<C extends Pick<ContenidoDeExploracion, "descripcionesDeLaEscala" | "textosDelRadar" | "textosDeLaPagina">>(c: C, f: FotoDelArea, dimensiones: readonly string[]): C {
  const dims = new Set(dimensiones);
  const { [f.areaId]: _d, ...otrasDescripciones } = c.descripcionesDeLaEscala ?? {};
  void _d;
  const descripcionesDeLaEscala = f.descripcion ? { ...otrasDescripciones, [f.areaId]: f.descripcion } : otrasDescripciones;
  const textosDelRadar = { ...Object.fromEntries(Object.entries(c.textosDelRadar ?? {}).filter(([d]) => !dims.has(d))), ...f.textosDelRadar };
  const textosDeLaPagina = {
    ...Object.fromEntries(Object.entries(c.textosDeLaPagina ?? {}).filter(([k]) => !esTextoDelArea(k, f.areaId, dimensiones))),
    ...f.textosDeLaPagina,
  };
  const { descripcionesDeLaEscala: _a, textosDelRadar: _b, textosDeLaPagina: _c, ...resto } = c;
  void _a;
  void _b;
  void _c;
  return {
    ...resto,
    ...(Object.keys(descripcionesDeLaEscala).length ? { descripcionesDeLaEscala } : {}),
    ...(Object.keys(textosDelRadar).length ? { textosDelRadar } : {}),
    ...(Object.keys(textosDeLaPagina).length ? { textosDeLaPagina } : {}),
  } as C;
}

/** Lee una foto guardada; null si no tiene la forma (una fila de otro documento). */
export function leerFotoDelArea(raw: unknown): FotoDelArea | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.areaId !== "string") return null;
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const textosDeLaPagina = Object.fromEntries(Object.entries(obj(r.textosDeLaPagina)).filter((e): e is [string, string] => typeof e[1] === "string"));
  const textosDelRadar = Object.fromEntries(
    Object.entries(obj(r.textosDelRadar)).filter(
      (e): e is [string, { texto: string; nivel: FotoDelArea["textosDelRadar"][string]["nivel"] }] =>
        !!e[1] && typeof (e[1] as { texto?: unknown }).texto === "string" && typeof (e[1] as { nivel?: unknown }).nivel === "string",
    ),
  );
  const d = obj(r.descripcion);
  const descripcion = typeof d.texto === "string" && typeof d.origen === "string" ? (d as unknown as FotoDelArea["descripcion"]) : null;
  return { areaId: r.areaId, descripcion, textosDelRadar, textosDeLaPagina };
}

/** Lo escrito en una foto, en líneas para leer en el historial (la vista previa): el nombre de cada texto y lo que dice. */
export function lineasDeLaFoto(f: FotoDelArea, nombres: { dimension: (id: string) => string }): { que: string; texto: string }[] {
  const lineas: { que: string; texto: string }[] = [];
  if (f.descripcion) lineas.push({ que: "Descripción de «Resultado general»", texto: f.descripcion.texto });
  for (const [d, t] of Object.entries(f.textosDelRadar)) lineas.push({ que: `Lo que dice la tarjeta de ${nombres.dimension(d)}`, texto: t.texto });
  for (const [k, t] of Object.entries(f.textosDeLaPagina)) lineas.push({ que: `Texto de la página (${k.split(".").slice(2, 4).join(" ") || k})`, texto: t || "— quitado para el cliente —" });
  return lineas;
}
