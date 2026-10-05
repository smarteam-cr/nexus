/**
 * lib/auditoria-portal/analisis/validar.ts — LO QUE DEVOLVIÓ EL MODELO, LIMPIO Y COMPROBADO.
 *
 * La salida estructurada garantiza la FORMA; esto garantiza lo demás:
 *  · Un hallazgo que cita una cifra que no está en los hechos se CAE y se cuenta. Es la única forma
 *    de que el informe no le muestre a un cliente un número inventado con cara de dato.
 *  · Lo mismo con las lecturas: de un párrafo se saca la frase con la cifra inventada; una lectura
 *    de reporte (una sola frase) se cae entera.
 *  · La evidencia se filtra a claves que existen y los reportes a los de la pantalla.
 *  · Topes: 10 hallazgos, 6 preguntas, largos razonables.
 * PURO.
 */
import { cifrasPermitidas, cifrasSinRespaldo } from "../cifras";
import {
  DECISIONES,
  SECCIONES_CON_LECTURA,
  SECCIONES_DE_HALLAZGO,
  SEVERIDADES,
  type AnalisisGuardado,
  type Decision,
  type EstadoDeHallazgo,
  type Hallazgo,
  type SeccionConLectura,
  type SeccionDeHallazgo,
  type Severidad,
} from "../foto";
import type { HechosDelPortal } from "./hechos";

export const MAX_HALLAZGOS = 10;
export const MAX_PREGUNTAS = 6;

export interface AnalisisLeido {
  /** El párrafo del estado (se guarda también como `resumen`, el campo de la primera versión). */
  resumen: string;
  estado: { titular: string; parrafo: string } | null;
  lecturasDeSeccion: Partial<Record<SeccionConLectura, string>>;
  lecturasDeReporte: Record<string, string>;
  hallazgos: Hallazgo[];
  preguntas: string[];
  descartadosPorCifras: number;
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function enLista<T extends string>(v: unknown, lista: readonly T[]): T | null {
  return typeof v === "string" && (lista as readonly string[]).includes(v) ? (v as T) : null;
}

/** Saca de un párrafo las frases que citan una cifra sin respaldo. */
function sinFrasesInventadas(parrafo: string, permitidas: readonly number[]): string {
  return parrafo
    .split(/(?<=[.!?])\s+/)
    .filter((frase) => cifrasSinRespaldo(frase, permitidas).length === 0)
    .join(" ");
}

/**
 * Lee el texto JSON del modelo. `null` si no es un análisis (sin estado ni hallazgos válidos).
 * `reportes`: los ids de reporte válidos (los que se le pasaron); sin la lista no se acepta ninguno.
 */
export function leerAnalisis(crudo: string, hechos: HechosDelPortal, reportes: readonly string[] = []): AnalisisLeido | null {
  let json: unknown;
  try {
    json = JSON.parse(crudo);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const r = json as { resumen?: unknown; estado?: unknown; secciones?: unknown; reportes?: unknown; hallazgos?: unknown; preguntas?: unknown };

  const fuentes = [...hechos.hechos.map((h) => h.texto), hechos.detalle, hechos.cliente ?? ""];
  const permitidas = cifrasPermitidas(fuentes);
  const claves = new Set(hechos.hechos.map((h) => h.clave));
  const sinRespaldo = (t: string) => cifrasSinRespaldo(t, permitidas).length > 0;

  // El estado: el titular se cae entero si cita una cifra inventada; del párrafo, solo la frase.
  const e = (r.estado && typeof r.estado === "object" ? r.estado : {}) as { titular?: unknown; parrafo?: unknown };
  const titular = texto(e.titular, 200);
  const parrafo = sinFrasesInventadas(texto(e.parrafo, 1200) || texto(r.resumen, 1200), permitidas);
  const estado = titular || parrafo ? { titular: sinRespaldo(titular) ? "" : titular, parrafo } : null;

  const lecturasDeSeccion: Partial<Record<SeccionConLectura, string>> = {};
  for (const s of Array.isArray(r.secciones) ? r.secciones : []) {
    const x = (s ?? {}) as { seccion?: unknown; lectura?: unknown };
    const seccion = enLista<SeccionConLectura>(x.seccion, SECCIONES_CON_LECTURA);
    const lectura = sinFrasesInventadas(texto(x.lectura, 500), permitidas);
    if (seccion && lectura && !lecturasDeSeccion[seccion]) lecturasDeSeccion[seccion] = lectura;
  }

  const validos = new Set(reportes);
  const lecturasDeReporte: Record<string, string> = {};
  for (const s of Array.isArray(r.reportes) ? r.reportes : []) {
    const x = (s ?? {}) as { reporte?: unknown; lectura?: unknown };
    const id = typeof x.reporte === "string" && validos.has(x.reporte) ? x.reporte : null;
    const lectura = texto(x.lectura, 320);
    if (!id || !lectura || Object.hasOwn(lecturasDeReporte, id) || sinRespaldo(lectura)) continue;
    lecturasDeReporte[id] = lectura;
  }

  let descartados = 0;
  const hallazgos: Hallazgo[] = [];
  for (const h of Array.isArray(r.hallazgos) ? r.hallazgos : []) {
    if (!h || typeof h !== "object") continue;
    const x = h as Record<string, unknown>;
    const seccion = enLista<SeccionDeHallazgo>(x.seccion, SECCIONES_DE_HALLAZGO);
    const severidad = enLista<Severidad>(x.severidad, SEVERIDADES);
    const decision = enLista<Decision>(x.decision, DECISIONES);
    const titulo = texto(x.titulo, 120);
    const cuerpo = texto(x.hallazgo, 600);
    if (!seccion || !severidad || !decision || !titulo || !cuerpo) continue;
    const dato = texto(x.dato, 40);
    const porQueImporta = texto(x.porQueImporta, 400);
    const recomendacion = texto(x.recomendacion, 400);
    const pregunta = texto(x.pregunta, 300);
    if (sinRespaldo([titulo, dato, cuerpo, porQueImporta, recomendacion, pregunta].join(" "))) {
      descartados++;
      continue;
    }
    const evidencia = (Array.isArray(x.evidencia) ? x.evidencia : []).filter((c): c is string => typeof c === "string" && claves.has(c));
    hallazgos.push({
      id: `h${hallazgos.length + 1}`,
      seccion,
      severidad,
      titulo,
      hallazgo: cuerpo,
      ...(dato ? { dato } : {}),
      porQueImporta,
      recomendacion,
      decision,
      evidencia: [...new Set(evidencia)],
      pregunta: pregunta || null,
      estado: "sugerido",
    });
    if (hallazgos.length >= MAX_HALLAZGOS) break;
  }

  const preguntas = (Array.isArray(r.preguntas) ? r.preguntas : [])
    .map((p) => texto(p, 300))
    .filter((p) => p && !sinRespaldo(p))
    .slice(0, MAX_PREGUNTAS);

  if (!estado && hallazgos.length === 0) return null;
  return { resumen: parrafo, estado, lecturasDeSeccion, lecturasDeReporte, hallazgos, preguntas, descartadosPorCifras: descartados };
}

const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Al volver a generar, lo que una persona CONFIRMÓ se queda (con quién y cuándo): es trabajo humano y
 * el informe se apoya en eso. Lo sugerido y lo descartado se reemplaza por lo nuevo. Un hallazgo nuevo
 * con el mismo título que uno confirmado no se repite. Los ids se renumeran (h1…). PURO.
 */
export function unirConLoConfirmado(anteriores: readonly Hallazgo[] | undefined, nuevos: readonly Hallazgo[]): Hallazgo[] {
  const confirmados = (anteriores ?? []).filter((h) => h.estado === "confirmado");
  const titulos = new Set(confirmados.map((h) => normalizar(h.titulo)));
  const agregados = nuevos.filter((h) => !titulos.has(normalizar(h.titulo))).slice(0, Math.max(0, MAX_HALLAZGOS - confirmados.length));
  return [...confirmados, ...agregados].map((h, i) => ({ ...h, id: `h${i + 1}` }));
}

/**
 * Confirmar, descartar o devolver a «sugerido» hallazgos del análisis que la persona tiene a la vista
 * (2026-10-05). Como los ids se renumeran en cada análisis (h1…), un id solo dice algo junto con el
 * `generadoEn` del análisis que se veía: si mientras tanto se generó otro, «h3» es otro hallazgo y no
 * se toca nada (409). PURO: la ruta lo aplica con la fila bloqueada.
 */
export function decidirHallazgos(
  analisis: AnalisisGuardado | undefined,
  pedido: { ids: readonly string[]; estado: EstadoDeHallazgo; generadoEn: string; quien: string; en: string },
): { ok: true; analisis: AnalisisGuardado } | { ok: false; status: 409; error: string } {
  if (!analisis) return { ok: false, status: 409, error: "Esta auditoría no tiene análisis." };
  if (analisis.generadoEn !== pedido.generadoEn) {
    return { ok: false, status: 409, error: "El análisis cambió mientras lo revisabas: recarga la página y vuelve a decidir." };
  }
  return {
    ok: true,
    analisis: {
      ...analisis,
      hallazgos: analisis.hallazgos.map((h): Hallazgo => {
        if (!pedido.ids.includes(h.id)) return h;
        if (pedido.estado === "sugerido") return { ...h, estado: "sugerido", decididoPor: undefined, decididoEn: undefined };
        return { ...h, estado: pedido.estado, decididoPor: pedido.quien, decididoEn: pedido.en };
      }),
    },
  };
}
