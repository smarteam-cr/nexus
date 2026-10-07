/**
 * lib/guia-exploracion/lectura.ts — cómo se lee lo que devuelve el agente de las sesiones. PURO (sin
 * base ni IA) para probarlo: verifica que cada propuesta cite una fuente real y que la cita esté
 * LITERAL en ella; lo que no, se descarta. El agente vive en agente.ts.
 */
import { idDelItem, type ContenidoDeGuia, type DestinoDePropuesta, type Fuente, type ItemPropuesto, type ValorPropuesto } from "./contenido";

export interface FuenteDeTexto {
  id: string;
  etiqueta: string;
  texto: string;
}

/** Una cita sirve solo si aparece literal (sin contar tildes, signos ni mayúsculas) en su fuente. */
export function citaVerificable(cita: string, fuente: string): boolean {
  const n = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const c = n(cita);
  return c.length >= 12 && n(fuente).includes(c);
}

type Crudo = Record<string, unknown>;
const esObj = (x: unknown): x is Crudo => typeof x === "object" && x !== null && !Array.isArray(x);
const lista = (x: unknown): Crudo[] => (Array.isArray(x) ? x.filter(esObj) : []);
const str = (x: unknown, max = 600) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Convierte lo que devolvió el modelo en propuestas, verificando fuentes y citas. Pura. */
export function leerLaRespuesta(
  input: unknown,
  fuentes: FuenteDeTexto[],
  plan: ContenidoDeGuia["sesiones"],
  corridaId: string,
  en: string,
): { items: ItemPropuesto[]; descartadas: number } {
  const r = esObj(input) ? input : {};
  const porId = new Map(fuentes.map((f) => [f.id, f]));
  const items: ItemPropuesto[] = [];
  let descartadas = 0;

  const citas = (x: unknown, exigeCita: boolean): Fuente[] | null => {
    const out: Fuente[] = [];
    for (const f of lista(x)) {
      const src = porId.get(str(f.id, 10));
      if (!src) continue;
      const cita = str(f.cita, 600);
      if (cita && !citaVerificable(cita, src.texto)) continue; // la cita no está en la fuente: esa fuente no cuenta
      out.push({ id: src.id, etiqueta: src.etiqueta, ...(cita ? { cita } : {}) });
    }
    if (out.length === 0) return null;
    if (exigeCita && !out.some((f) => f.cita)) return null;
    return out;
  };
  const sumar = (destino: DestinoDePropuesta, valor: ValorPropuesto, crudo: Crudo, exigeCita = false) => {
    const fs = citas(crudo.fuentes, exigeCita);
    if (!fs) {
      descartadas++;
      return;
    }
    items.push({ id: idDelItem(destino, valor), destino, valor, fuentes: fs, corridaId, en });
  };

  for (const x of lista(r.contradicciones)) if (str(x.texto)) sumar({ tipo: "contradiccion" }, { texto: str(x.texto) }, x, true);
  for (const x of lista(r.sesiones)) {
    const titulo = str(x.titulo, 120);
    if (!titulo) continue;
    const preguntas = lista(x.preguntas).flatMap((q) =>
      str(q.texto, 400) ? [{ texto: str(q.texto, 400), ...(str(q.repregunta, 300) ? { repregunta: str(q.repregunta, 300) } : {}), ...(str(q.objetivo, 60) ? { objetivo: str(q.objetivo, 60) } : {}) }] : [],
    );
    sumar({ tipo: "sesion" }, { titulo, objetivo: str(x.objetivo, 400), conQuien: str(x.conQuien, 300), preguntas }, x);
  }
  for (const x of lista(r.respondidas)) {
    const preguntaId = str(x.preguntaId, 60);
    const sesion = plan.find((s) => s.preguntas.some((q) => q.id === preguntaId));
    if (!sesion) continue;
    // «Ya respondida» EXIGE la frase literal de la reunión: es lo que el CSE va a dar por cerrado.
    sumar({ tipo: "respondida", sesionId: sesion.id, preguntaId }, { respuesta: str(x.respuesta, 1000) }, x, true);
  }
  return { items, descartadas };
}
