/**
 * lib/servicios/propuesta.ts — lo que la PROPUESTA de un servicio recurrente toma del catálogo. PURO.
 *
 * (Roadmap «La siguiente serie», iniciativa 3, paso 2.) La plantilla recurrente (components/landing/configs/
 * recurrente.defs.ts) tiene tres secciones que son compromisos y no las escribe el agente: cómo opera (la cadencia y
 * las reuniones fijas), cómo trabajamos (el ciclo, si el servicio avanza por ciclos) y el nivel de servicio. Esta
 * función las arma desde el catálogo; el generate las siembra solo cuando están vacías, así lo que ajustó Ventas para
 * un cliente no se pisa al regenerar.
 *
 * Y al revés, lo que el proyecto toma de la propuesta ganada: el servicio y sus casos de uso (`casosDeLaPropuesta`).
 */
import { ETIQUETA_DE_CADENCIA, NOTA_DEL_NIVEL_DE_SERVICIO, type ServicioRecurrente } from "./catalogo";

export interface SeccionesDelServicio {
  operacion: { intro: string; rutinas: Array<{ titulo: string; cada: string; detalle: string }>; nota: string };
  metodologia: { intro: string; etapas: Array<{ titulo: string; detalle: string }>; nota: string };
  nivel_servicio: { intro: string; niveles: Array<{ prioridad: string; tiempo: string; detalle: string }>; nota: string };
}

export function seccionesDelServicio(s: ServicioRecurrente): SeccionesDelServicio {
  return {
    operacion: {
      intro: s.cadencia,
      rutinas: s.reuniones.map((r) => ({
        titulo: r.titulo,
        cada: `${ETIQUETA_DE_CADENCIA[r.cada]} · ${r.duracionMin} min`,
        detalle: `${r.paraQue} Con: ${r.conQuien.charAt(0).toLowerCase()}${r.conQuien.slice(1)}.`,
      })),
      nota: "Cada solicitud nueva entra a un plan de trabajo compartido y se prioriza con ustedes según su impacto.",
    },
    metodologia: s.ciclo
      ? {
          intro: `${s.nombre} trabaja en ciclos cortos: cada vuelta aprende de la anterior y vuelve a diagnosticar.`,
          etapas: s.ciclo.paraLaPropuesta.map((e) => ({ titulo: e.titulo, detalle: e.detalle })),
          nota: "El aprendizaje de cada ciclo alimenta el diagnóstico del siguiente.",
        }
      : // Sin ciclo la sección queda vacía: vacía = no se muestra.
        { intro: "", etapas: [], nota: "" },
    nivel_servicio: {
      intro: "Cada solicitud se clasifica por su impacto y su urgencia.",
      niveles: s.nivelDeServicio.map((n) => ({ prioridad: n.prioridad, tiempo: n.tiempo, detalle: n.detalle })),
      nota: NOTA_DEL_NIVEL_DE_SERVICIO,
    },
  };
}

/** Un caso de uso tal como lo vendió la propuesta (la sección `casos_de_uso`: título, detalle y precio). */
export interface CasoDeLaPropuesta {
  titulo: string;
  resultado: string | null;
}

/**
 * Los casos de uso que la propuesta le vendió al cliente, para que el proyecto nazca con ellos: el título y lo que
 * obtiene. Sin precio (el precio es de la propuesta, no del plan del servicio), sin repetidos y como mucho 20.
 */
export function casosDeLaPropuesta(data: unknown): CasoDeLaPropuesta[] {
  const items = data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown[] }).items : [];
  const vistos = new Set<string>();
  const fuera: CasoDeLaPropuesta[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const titulo = String((it as { title?: unknown }).title ?? "").trim();
    if (!titulo) continue;
    const clave = titulo.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const detalle = String((it as { detail?: unknown }).detail ?? "").trim();
    fuera.push({ titulo: titulo.slice(0, 200), resultado: detalle || null });
    if (fuera.length >= 20) break;
  }
  return fuera;
}

/**
 * La dirección del alta del servicio que vendió una propuesta recurrente: abre «Nuevo proyecto» con el pipeline del
 * servicio, la empresa ya buscada y la propuesta, así el proyecto nace con su servicio y sus casos de uso.
 */
export function urlDelAltaDelServicio(o: { servicio: Pick<ServicioRecurrente, "enHubspot">; dominio: string | null; propuestaId: string }): string {
  const q = new URLSearchParams({ alta: o.servicio.enHubspot.pipeline, propuesta: o.propuestaId });
  if (o.dominio) q.set("dominio", o.dominio);
  return `/clients?${q.toString()}`;
}
