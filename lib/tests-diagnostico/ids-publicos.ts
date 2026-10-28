/**
 * lib/tests-diagnostico/ids-publicos.ts — LO QUE VE QUIEN RESPONDE, y su traducción al banco (área O, 2026-10-26).
 *
 * Quien responde el test nunca ve los ids del banco, las dimensiones ni el nivel de cada opción: si los viera, podría
 * elegir la opción «mejor» a propósito. Cada intento recibe ids opacos propios (`conIdsPublicos`); la vista solo lleva
 * esos ids y los textos (`vistaDelIntento`), y lo que manda la persona se traduce de vuelta al banco
 * (`respuestasDelBanco`), descartando lo que no corresponde a ese intento. Las pruebas: ids-publicos.test.ts.
 */
import { randomBytes } from "node:crypto";
import type { Escala } from "@/lib/escala/documento/tipos";
import type { Intento, PreguntaDelIntento } from "./repositorio-server";
import { NO_LO_SE, type PreguntaDelBanco, type RespuestasDelTest, type VersionDelTest } from "./tipos";

/**
 * Las preguntas del banco con ids opacos para la persona (el `id` y el nivel de cada opción quedan del lado nuestro).
 * `nombres` da, por dimensión, el nombre del paso y de su capa como los dice la escala de la edición: es lo que muestra la
 * barra de avance (Elías, 28 oct: «con el nombre de cada paso», como la aplicación vieja). El nombre no dice nada del
 * nivel de ninguna opción.
 */
export function conIdsPublicos(
  preguntas: readonly PreguntaDelBanco[],
  nombres: Readonly<Record<string, { paso: string; capa: string | null }>> = {},
): PreguntaDelIntento[] {
  const opaco = () => randomBytes(6).toString("hex");
  return preguntas.map((p) => ({
    ...p,
    publico: `q${opaco()}`,
    opcionesPublicas: Object.fromEntries(p.opciones.map((o) => [o.id, `o${opaco()}`])),
    ...(nombres[p.dimensionId] ? { paso: nombres[p.dimensionId].paso, capa: nombres[p.dimensionId].capa } : {}),
  }));
}

/** Por dimensión del área, el nombre del paso y el de su capa, con las palabras de la escala que recibe (la de la edición). */
export function nombresDeLosPasos(escala: Escala, areaId: string): Record<string, { paso: string; capa: string | null }> {
  const area = escala.areas.find((a) => a.id === areaId);
  return Object.fromEntries(
    (area?.dimensiones ?? []).map((d) => [d.id, { paso: d.nombre, capa: escala.capas.find((c) => c.clave === d.capa)?.nombre ?? null }]),
  );
}

/** Lo que ve la persona de una pregunta: sin ids del banco, dimensiones ni niveles. */
export interface PreguntaPublica {
  id: string;
  texto: string;
  ayuda: string | null;
  opciones: { id: string; texto: string }[];
  /** El nombre del paso en la barra de avance («Procesos y Rutinas») y el de su capa; null en un intento de antes. */
  paso: string | null;
  capa: string | null;
}

export interface VistaDelIntento {
  token: string;
  area: string;
  version: VersionDelTest;
  estado: Intento["estado"];
  paso: number;
  preguntas: PreguntaPublica[];
  /** Por id público de la pregunta: el id público de la opción (o «no-se») y el matiz. */
  respuestas: Record<string, { opcion: string; matiz?: string }>;
}

export function vistaDelIntento(i: Intento): VistaDelIntento {
  const respuestas: VistaDelIntento["respuestas"] = {};
  for (const p of i.preguntas) {
    const r = i.respuestas[p.id];
    if (!r) continue;
    const opcion = r.opcion === NO_LO_SE ? NO_LO_SE : p.opcionesPublicas[r.opcion];
    if (opcion) respuestas[p.publico] = r.matiz ? { opcion, matiz: r.matiz } : { opcion };
  }
  return {
    token: i.token,
    area: i.area,
    version: i.version,
    estado: i.estado,
    paso: i.paso,
    preguntas: i.preguntas.map((p) => ({
      id: p.publico,
      texto: p.texto,
      ayuda: p.ayuda,
      opciones: p.opciones.map((o) => ({ id: p.opcionesPublicas[o.id], texto: o.texto })),
      paso: p.paso ?? null,
      capa: p.capa ?? null,
    })),
    respuestas,
  };
}

/** Traduce lo que mandó la persona (ids públicos) a ids del banco. Lo que no corresponde a este intento se descarta. */
export function respuestasDelBanco(i: Intento, publicas: Record<string, { opcion: string; matiz?: string }>): RespuestasDelTest {
  const out: RespuestasDelTest = {};
  for (const p of i.preguntas) {
    const r = publicas[p.publico];
    if (!r) continue;
    const opcion = r.opcion === NO_LO_SE ? NO_LO_SE : Object.entries(p.opcionesPublicas).find(([, pub]) => pub === r.opcion)?.[0];
    if (!opcion) continue;
    const matiz = r.matiz?.trim().slice(0, 1000);
    out[p.id] = matiz ? { opcion, matiz } : { opcion };
  }
  return out;
}

