/**
 * lib/tests-diagnostico/ids-publicos.ts — LO QUE VE QUIEN RESPONDE, y su traducción al banco (área O, 2026-10-26).
 *
 * Quien responde el test nunca ve los ids del banco, las dimensiones ni el nivel de cada opción: si los viera, podría
 * elegir la opción «mejor» a propósito. Cada intento recibe ids opacos propios (`conIdsPublicos`); la vista solo lleva
 * esos ids y los textos (`vistaDelIntento`), y lo que manda la persona se traduce de vuelta al banco
 * (`respuestasDelBanco`), descartando lo que no corresponde a ese intento. Las pruebas: ids-publicos.test.ts.
 */
import { randomBytes } from "node:crypto";
import type { Intento, PreguntaDelIntento } from "./repositorio-server";
import { NO_LO_SE, type PreguntaDelBanco, type RespuestasDelTest, type VersionDelTest } from "./tipos";

/** Las preguntas del banco con ids opacos para la persona (el `id` y el nivel de cada opción quedan del lado nuestro). */
export function conIdsPublicos(preguntas: readonly PreguntaDelBanco[]): PreguntaDelIntento[] {
  const opaco = () => randomBytes(6).toString("hex");
  return preguntas.map((p) => ({
    ...p,
    publico: `q${opaco()}`,
    opcionesPublicas: Object.fromEntries(p.opciones.map((o) => [o.id, `o${opaco()}`])),
  }));
}

/** Lo que ve la persona de una pregunta: sin ids del banco, dimensiones ni niveles. */
export interface PreguntaPublica {
  id: string;
  texto: string;
  ayuda: string | null;
  opciones: { id: string; texto: string }[];
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

