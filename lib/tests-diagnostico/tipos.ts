/**
 * lib/tests-diagnostico/tipos.ts — EL TEST DEL DIAGNÓSTICO DE RENDIMIENTO: sus versiones, sus áreas y la forma de su
 * banco de preguntas. PURO y CLIENT-SAFE.
 *
 * Área O del roadmap (docs/tests-diagnostico-plan.md, 2026-10-26). El test público de cada departamento, dentro de Nexus,
 * con el mismo motor que el cuestionario de la escala: el nivel lo calcula Nexus con el chequeo (lib/escala/chequeo.ts),
 * nunca la IA, y quien responde nunca ve letras, ids ni nombres de nivel mientras contesta.
 *
 * TRES VERSIONES (O5, Elías, 2026-10-24):
 *   · `marketing` — 4 preguntas fáciles, para conseguir el lead. Salen de las 8 de la web (decisión del 24 oct): las
 *     dimensiones de la capa BASE del área.
 *   · `web` — 8 preguntas, una por dimensión. Para la primera reunión.
 *   · la COMPLETA no vive acá: la llena Customer Success en la exploración del proyecto, por equipo, y el cuestionario de
 *     la escala (lib/cuestionario/escala.ts). El perfil corto (cómo cierra la venta y qué pasa después) va solo ahí.
 *
 * El banco de preguntas de cada (área, versión, edición) tiene un BORRADOR que se edita y una versión APROBADA que es la
 * que ve el público. Las aprueba Elías (un super admin) antes de publicarlas; sin aprobadas, el test no se abre.
 */
import type { Letra } from "@/lib/escala/documento/tipos";

export const VERSIONES_DEL_TEST = ["marketing", "web"] as const;
export type VersionDelTest = (typeof VERSIONES_DEL_TEST)[number];

/**
 * Cómo se llama cada versión. La de 4 preguntas se llama `marketing` en el código y en la dirección (`?v=marketing`)
 * porque nació para las campañas de Marketing, pero existe para las tres áreas: decirle «Test de Marketing» hacía leer
 * un test de Ventas como si fuera de Marketing (Elías, 28 oct). Es el test CORTO.
 */
export const ETIQUETA_DE_LA_VERSION: Record<VersionDelTest, string> = {
  marketing: "Test corto (4 preguntas)",
  web: "Test web (8 preguntas)",
};

/** El nombre de un test con su área: «Test web de Ventas (8 preguntas)», «Test corto de Servicio (4 preguntas)». */
export function nombreDelTest(area: string, version: VersionDelTest): string {
  return `Test ${version === "web" ? "web" : "corto"} de ${NOMBRE_DEL_AREA[area] ?? area} (${version === "web" ? 8 : 4} preguntas)`;
}

export function esVersionDelTest(v: unknown): v is VersionDelTest {
  return typeof v === "string" && (VERSIONES_DEL_TEST as readonly string[]).includes(v);
}

/** El área de la escala de cada página pública (`/external/test/ventas`…). La escala solo mide estas tres. */
export const AREA_POR_SLUG: Readonly<Record<string, string>> = { ventas: "1", marketing: "2", servicio: "3" };
export const SLUG_POR_AREA: Readonly<Record<string, string>> = { "1": "ventas", "2": "marketing", "3": "servicio" };
export const NOMBRE_DEL_AREA: Readonly<Record<string, string>> = { "1": "Ventas", "2": "Marketing", "3": "Servicio" };

/** La edición de la escala general en el banco (la columna no es nula: es parte de la llave única). */
export const EDICION_GENERAL = "general";

/** Una opción del banco: su texto para el cliente y el nivel que significa elegirla (solo del lado nuestro). */
export interface OpcionDelBanco {
  id: string;
  texto: string;
  nivel: Letra;
}

/** Una pregunta del banco: apunta a UNA dimensión de la escala (`1.3`). */
export interface PreguntaDelBanco {
  id: string;
  dimensionId: string;
  texto: string;
  /** Una línea que aclara la pregunta, si hace falta. */
  ayuda: string | null;
  opciones: OpcionDelBanco[];
}

export type EstadoDelBanco = "borrador" | "aprobado";

/** El id de «No lo sé»: cuenta como el nivel más bajo (especificación del cálculo, paso 2). */
export const NO_LO_SE = "no-se";

/** Lo que eligió la persona en una pregunta, con su matiz opcional. */
export interface RespuestaDelTest {
  opcion: string;
  matiz?: string;
}

export type RespuestasDelTest = Record<string, RespuestaDelTest>;

const LETRAS: readonly Letra[] = ["D", "I", "F", "E", "O"];
const esLetra = (x: unknown): x is Letra => typeof x === "string" && (LETRAS as readonly string[]).includes(x);
const texto = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");

/** Lee el banco guardado (Json). Tolera basura: una pregunta mal formada se descarta, no revienta la página. */
export function leerPreguntasDelBanco(raw: unknown): PreguntaDelBanco[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p): PreguntaDelBanco[] => {
    if (!p || typeof p !== "object") return [];
    const o = p as Record<string, unknown>;
    const id = texto(o.id, 60);
    const dimensionId = texto(o.dimensionId, 20);
    const t = texto(o.texto, 600);
    if (!id || !dimensionId || !t || !Array.isArray(o.opciones)) return [];
    const opciones = o.opciones.flatMap((x): OpcionDelBanco[] => {
      if (!x || typeof x !== "object") return [];
      const r = x as Record<string, unknown>;
      const oid = texto(r.id, 60);
      const ot = texto(r.texto, 600);
      return oid && ot && esLetra(r.nivel) ? [{ id: oid, texto: ot, nivel: r.nivel }] : [];
    });
    return opciones.length ? [{ id, dimensionId, texto: t, ayuda: texto(o.ayuda, 600) || null, opciones }] : [];
  });
}

/** Lee las respuestas guardadas (Json), tolerante. */
export function leerRespuestasDelTest(raw: unknown): RespuestasDelTest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: RespuestasDelTest = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const opcion = texto(o.opcion, 60);
    if (!opcion) continue;
    const matiz = texto(o.matiz, 1000);
    out[k.slice(0, 60)] = matiz ? { opcion, matiz } : { opcion };
  }
  return out;
}
