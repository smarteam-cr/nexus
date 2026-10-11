/**
 * lib/seguimiento/novedades.ts — LAS NOVEDADES de los documentos (memoria de la cuenta, etapa 6). PURO y client-safe.
 *
 * Una novedad es lo que un hecho pendiente de una reunión le propone a un documento que YA tiene contenido
 * (Planificación › Pipelines, Kickoff › Alcance…). **No se guarda: se calcula** con los hechos, el registro de destinos
 * (lib/seguimiento/destinos.ts) y las piezas con contenido. Ver docs/DECISIONS.md «Hechos, enrutador y novedades».
 *
 * Reglas (las congela lib/seguimiento/novedades.test.ts):
 *   · solo los destinos de salida «novedad» que siguen pendientes; un destino desestimado, usado o delegado no vuelve;
 *   · solo en piezas que ya tienen contenido: a un documento vacío no se le propone un cambio, se lo genera;
 *   · un hecho de más de 30 días sin usar está vencido y no se muestra (se calcula, no hace falta un job);
 *   · el mismo hecho dicho en dos reuniones (la misma huella) es UNA novedad, con la reunión más reciente;
 *   · como mucho 5 por documento, las más recientes primero (las demás esperan, y vencen solas).
 *
 * Lo usan la franja de arriba del documento y el riel (components/clients/ProjectCanvasPanel.tsx), el «Qué sigue» del
 * proyecto, la tarjeta «Lo que dejó esta reunión» y el aviso «Volver a mapear» de Procesos. Lo carga
 * lib/seguimiento/novedades-server.ts.
 */
import { destinoPorClave } from "./destinos";
import { estaVencido, leerDestinos } from "./hechos/estado";

/** Como mucho, cuántas novedades se muestran por documento. */
export const TOPE_DE_NOVEDADES_POR_PIEZA = 5;

/** Lo que hace falta saber de un hecho para calcular sus novedades. */
export interface HechoParaNovedades {
  id: string;
  tipo: string;
  tema: string | null;
  frase: string;
  cita: string;
  huella: string;
  /** El estado general guardado: pendiente · usado · desestimado. */
  estado: string;
  createdAt: Date | string;
  fechaDeLaReunion: Date | string;
  /** `HechoDeReunion.destinos` tal cual (JSON). */
  destinos: unknown;
  projectId: string | null;
  sessionId: string | null;
  /** El título de la reunión (solo el título: nunca su contenido). */
  reunionTitulo: string | null;
  /** De qué parte salió la cita: transcripcion · notas · texto (`HechoDeReunion.citaFuente`). */
  citaFuente?: string;
}

/** Una sección de un documento a la que va la novedad. */
export interface SeccionDeLaNovedad {
  /** La clave del destino en el registro («planning.pipelines»). */
  clave: string;
  /** La key de la sección en el documento («pipelines»). */
  seccion: string;
  /** Cómo se lee («Planificación › Pipelines»). */
  rotulo: string;
}

export interface NovedadDeLaPieza {
  /** El hecho que se muestra: el de la reunión más reciente del grupo. */
  hechoId: string;
  /** Los otros hechos con la misma huella: se deciden junto con este. */
  mismos: string[];
  pieza: string;
  secciones: SeccionDeLaNovedad[];
  tipo: string;
  tema: string | null;
  frase: string;
  cita: string;
  reunion: { id: string | null; titulo: string; /** AAAA-MM-DD. */ fecha: string };
  /** La pieza se lee en vivo desde afuera (Integraciones): aplicar es publicar. */
  publicaEnVivo: boolean;
  /** ISO: cuándo la propuso Nexus. */
  propuestaEn: string;
}

export interface NovedadesDeLaPieza {
  items: NovedadDeLaPieza[];
  /** Cuántas más hay, fuera del tope (las más viejas). */
  mas: number;
}

const iso = (d: Date | string): string => (typeof d === "string" ? d : d.toISOString());
const ms = (d: Date | string): number => (typeof d === "string" ? Date.parse(d) : d.getTime());

/** Los destinos de novedad pendientes de un hecho, por pieza (solo las piezas con contenido). */
function destinosDeNovedad(h: HechoParaNovedades, conContenido: ReadonlySet<string>): Map<string, SeccionDeLaNovedad[]> {
  const out = new Map<string, SeccionDeLaNovedad[]>();
  for (const d of leerDestinos(h.destinos)) {
    if (d.estado !== "pendiente") continue;
    const reg = destinoPorClave(d.clave);
    if (!reg || reg.salida !== "novedad" || !reg.pieza || !reg.seccion || !conContenido.has(reg.pieza)) continue;
    out.set(reg.pieza, [...(out.get(reg.pieza) ?? []), { clave: reg.clave, seccion: reg.seccion, rotulo: reg.rotulo }]);
  }
  return out;
}

/** ¿El hecho todavía puede proponer algo? Pendiente en general y sin vencer. */
function vivo(h: HechoParaNovedades, ahora: Date): boolean {
  return h.estado === "pendiente" && !estaVencido(h, ahora);
}

/**
 * Las novedades de cada documento: `{ [pieza]: { items, mas } }`. Una pieza sin novedades no aparece.
 */
export function novedadesPorPieza(
  hechos: readonly HechoParaNovedades[],
  piezasConContenido: Iterable<string>,
  ahora: Date,
): Record<string, NovedadesDeLaPieza> {
  const conContenido = new Set(piezasConContenido);
  // pieza → huella → hechos del grupo con sus secciones.
  const grupos = new Map<string, Map<string, { h: HechoParaNovedades; secciones: SeccionDeLaNovedad[] }[]>>();
  for (const h of hechos) {
    if (!vivo(h, ahora)) continue;
    for (const [pieza, secciones] of destinosDeNovedad(h, conContenido)) {
      const porHuella = grupos.get(pieza) ?? new Map();
      porHuella.set(h.huella, [...(porHuella.get(h.huella) ?? []), { h, secciones }]);
      grupos.set(pieza, porHuella);
    }
  }

  const out: Record<string, NovedadesDeLaPieza> = {};
  for (const [pieza, porHuella] of grupos) {
    const novedades: NovedadDeLaPieza[] = [];
    for (const grupo of porHuella.values()) {
      const orden = [...grupo].sort((a, b) => ms(b.h.fechaDeLaReunion) - ms(a.h.fechaDeLaReunion) || ms(b.h.createdAt) - ms(a.h.createdAt) || a.h.id.localeCompare(b.h.id));
      const { h } = orden[0];
      const secciones = new Map<string, SeccionDeLaNovedad>();
      for (const x of orden) for (const s of x.secciones) if (!secciones.has(s.clave)) secciones.set(s.clave, s);
      novedades.push({
        hechoId: h.id,
        mismos: orden.slice(1).map((x) => x.h.id),
        pieza,
        secciones: [...secciones.values()],
        tipo: h.tipo,
        tema: h.tema,
        frase: h.frase,
        cita: h.cita,
        reunion: { id: h.sessionId, titulo: h.reunionTitulo?.trim() || "una reunión", fecha: iso(h.fechaDeLaReunion).slice(0, 10) },
        publicaEnVivo: [...secciones.values()].some((s) => destinoPorClave(s.clave)?.publicaEnVivo === true),
        propuestaEn: iso(h.createdAt),
      });
    }
    novedades.sort((a, b) => b.reunion.fecha.localeCompare(a.reunion.fecha) || b.propuestaEn.localeCompare(a.propuestaEn) || a.hechoId.localeCompare(b.hechoId));
    out[pieza] = { items: novedades.slice(0, TOPE_DE_NOVEDADES_POR_PIEZA), mas: Math.max(0, novedades.length - TOPE_DE_NOVEDADES_POR_PIEZA) };
  }
  return out;
}

/** El número del riel y del «Qué sigue»: las novedades a la vista de cada documento (con el tope). */
export function conteoDeNovedades(porPieza: Readonly<Record<string, NovedadesDeLaPieza>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [pieza, n] of Object.entries(porPieza)) if (n.items.length) out[pieza] = n.items.length;
  return out;
}

/**
 * ¿Este hecho pide una decisión de quien mira? La MISMA regla que la tarjeta de la reunión (lib/seguimiento/tarjeta.ts,
 * `decidible`): el hecho sigue pendiente y sin vencer, y tiene un destino «novedad» pendiente en un documento que quien
 * mira puede generar (`piezasQueDecide`) y que ya tiene contenido. Lo usa el renglón «Lo que dejaron tus reuniones» de
 * «Para ti», para contar lo mismo que la tarjeta.
 */
export function pideDecisionDeNovedad(
  h: Pick<HechoParaNovedades, "estado" | "createdAt" | "destinos" | "projectId">,
  piezasQueDecide: ReadonlySet<string>,
  conContenido: (projectId: string) => ReadonlySet<string>,
  ahora: Date,
): boolean {
  if (h.estado !== "pendiente" || estaVencido(h, ahora) || !h.projectId) return false;
  const contenido = conContenido(h.projectId);
  return leerDestinos(h.destinos).some((d) => {
    const reg = destinoPorClave(d.clave);
    return d.estado === "pendiente" && reg?.salida === "novedad" && !!reg.pieza && piezasQueDecide.has(reg.pieza) && contenido.has(reg.pieza);
  });
}

/** «1 novedad de una reunión» / «3 novedades de reuniones». */
export function novedadesEnPalabras(n: number): string {
  return n === 1 ? "1 novedad de una reunión" : `${n} novedades de reuniones`;
}

/**
 * Procesos conserva su lectura propia: un hecho de cómo trabaja hoy el cliente solo avisa «Volver a mapear». Cuenta las
 * REUNIONES (no los hechos) con hechos `proceso_hoy` que siguen pendientes en su destino «procesos», sin vencer,
 * escritos después del último mapeo (`desde`; sin mapeo, todos) y sacados de una transcripción (lo único que lee el
 * mapeo). Los de una reunión con solo notas siguen pendientes hasta vencer, sin avisar.
 */
export function reunionesConProcesoHoy(
  hechos: readonly (Pick<HechoParaNovedades, "id" | "tipo" | "estado" | "createdAt" | "destinos" | "sessionId"> & { citaFuente?: string })[],
  desde: Date | null,
  ahora: Date,
): number {
  const reuniones = new Set<string>();
  for (const h of hechos) {
    if (h.tipo !== "proceso_hoy" || h.estado !== "pendiente" || estaVencido(h, ahora)) continue;
    // Solo lo que salió de una transcripción: el mapeo de Procesos lee las transcripciones, no las notas de Gemini ni un
    // texto sumado a mano. Avisar por una reunión con solo notas prometería algo que «Volver a mapear» no hace.
    if (h.citaFuente !== undefined && h.citaFuente !== "transcripcion") continue;
    if (desde && ms(h.createdAt) <= desde.getTime()) continue;
    if (!leerDestinos(h.destinos).some((d) => d.clave === "procesos" && d.estado === "pendiente")) continue;
    reuniones.add(h.sessionId ?? `hecho:${h.id}`);
  }
  return reuniones.size;
}
