/**
 * lib/exploraciones/lo-leido.ts — la foto de lo que el agente leyó de HubSpot. PURO.
 *
 * Vive en la columna `test` de la exploración: el resultado del test de marketing de cada área
 * (hipótesis, escala anterior), las reuniones agendadas que vio en HubSpot y cuántos correos no pudo
 * leer por falta del permiso. La escribe el agente en cada corrida; la pantalla solo la muestra.
 * Se lee con tolerancia: lo que no tiene la forma se deja afuera.
 */
import type { Letra } from "@/lib/escala/documento/tipos";
import type { ResultadoDelTest } from "./test-de-marketing";

export interface LoLeidoDeHubspot {
  tests: { contacto: string; resultado: ResultadoDelTest }[];
  agenda: { id: string; titulo: string; inicio: string }[];
  correosSinPermiso: number;
  leidoEn: string | null;
}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const LETRAS = new Set(["D", "I", "F", "E", "O"]);

export function leerLoLeido(raw: unknown): LoLeidoDeHubspot {
  const vacio: LoLeidoDeHubspot = { tests: [], agenda: [], correosSinPermiso: 0, leidoEn: null };
  if (!esObjeto(raw)) return vacio;
  const tests = Array.isArray(raw.tests)
    ? raw.tests.flatMap((t) => {
        if (!esObjeto(t) || typeof t.contacto !== "string" || !esObjeto(t.resultado)) return [];
        const r = t.resultado;
        if (typeof r.areaId !== "string" || typeof r.url !== "string" || !Array.isArray(r.respuestas)) return [];
        const respuestas = r.respuestas.flatMap((x) =>
          esObjeto(x) && typeof x.dimensionId === "string" && typeof x.nivel === "string" && LETRAS.has(x.nivel)
            ? [
                {
                  dimensionId: x.dimensionId,
                  nivel: x.nivel as Letra,
                  respuesta: typeof x.respuesta === "string" ? x.respuesta : null,
                  matiz: typeof x.matiz === "string" ? x.matiz : null,
                },
              ]
            : [],
        );
        return [{ contacto: t.contacto, resultado: { areaId: r.areaId, fecha: typeof r.fecha === "string" ? r.fecha : null, respuestas, url: r.url } }];
      })
    : [];
  const agenda = Array.isArray(raw.agenda)
    ? raw.agenda.flatMap((a) =>
        esObjeto(a) && typeof a.id === "string" && typeof a.titulo === "string" && typeof a.inicio === "string"
          ? [{ id: a.id, titulo: a.titulo, inicio: a.inicio }]
          : [],
      )
    : [];
  return {
    tests,
    agenda,
    correosSinPermiso: typeof raw.correosSinPermiso === "number" ? raw.correosSinPermiso : 0,
    leidoEn: typeof raw.leidoEn === "string" ? raw.leidoEn : null,
  };
}
