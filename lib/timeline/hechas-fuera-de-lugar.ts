/**
 * lib/timeline/hechas-fuera-de-lugar.ts — HECHAS EN LA FASE EQUIVOCADA (L7, 2026-09-26). Puro y client-safe.
 *
 * Pedido de Elías (decisión 2): una tarea HECHA que quedó en otra fase (en Wherex, cinco de migración de datos dentro
 * de la fase de ventas) no se toca sola: la IA propone mudarla, DESMARCADA, y la hecha conserva su check y su fecha.
 *
 * Cómo:
 *   · `mensajeParaUbicar`: cada fase del vivo con su estado y su nota corta, y sus HECHAS, con ids cortos (`F1`, `T12`):
 *     la IA nunca ve un id de la base;
 *   · el modelo (Haiku, una llamada con tope de 15 s dentro del paso 2, medida por el chokepoint) devuelve solo ids:
 *     `{"mover":[{"tarea":"T3","fase":"F2"}]}`. Los números, los nombres y el texto los pone el código;
 *   · `sugerenciasDeMudanza` valida y descarta sin tirar: la tarea existe, está HECHA hoy y en la fase que se le
 *     mostró; el destino existe y es otro; no la tocó otro cambio; sin repetidas; hasta 30. Cada una es un
 *     `tarea-cambia` `{ a: { fase } }` con `sugerida: "otra-fase"`, SIN `porChat` (no se escribe como de una persona);
 *   · `ubicarHechas`: lo anterior con el modelo inyectado (`llamar`): la ruta pasa Haiku, los tests un doble. Sin
 *     hechas que mirar, o con una sola fase, no se llama.
 * La fusión (borrador-del-detalle.ts) la pide solo en «Regenerar todo», en paralelo con el porqué (L6), y las suma
 * DESMARCADAS (sus claves en `excluidos`). Aplicar una marcada la muda sin tocar su estado (escribir-tareas.ts).
 * Los textos, en tuteo (entra en la lista de tuteo de contexto-cronograma.test.ts). La guarda:
 * hechas-fuera-de-lugar.test.ts, con la propuesta grande anonimizada.
 */
import { parseObject } from "@/lib/ai/section-schema";
import { claveDeTareaQueCambia, fotoDeTarea, type Cambio, type CambioTareaCambia, type TareaDelVivo, type Vivo } from "./borrador";

/** Cuántas sugerencias entran como mucho (el prompt dice «Máximo treinta»). */
export const TOPE_DE_SUGERIDAS = 30;
/** La nota de cada fase, cortada: la IA ubica por el nombre y la nota, no necesita más. */
export const TOPE_DE_LA_NOTA = 200;
/** Los títulos, cortados: una hecha se reconoce por el principio de su título. */
export const TOPE_DEL_TITULO = 120;
/** Cuántas hechas se muestran como mucho (el mensaje no crece sin techo en un proyecto enorme). */
export const TOPE_DE_HECHAS = 400;

/** El prompt de sistema (vive en código, no en la base: spec §0.1). */
export const PROMPT_UBICAR_HECHAS =
  "Revisas tareas HECHAS de un cronograma y señalas solo las que están claramente en otra fase por su título " +
  "(por ejemplo, una de migración de datos en una fase de ventas). Si dudas, no la incluyas. Máximo treinta. " +
  'Responde solo JSON: {"mover":[{"tarea":"T3","fase":"F2"}]}.';

/** Los ids cortos que vio la IA: `F1` → id de la fase; `T1` → la tarea y la fase en que se le mostró. */
export interface MapasParaUbicar {
  fases: Map<string, string>;
  tareas: Map<string, { id: string; fase: string }>;
}

export interface MensajeParaUbicar extends MapasParaUbicar {
  texto: string;
}

const estadoDeLaFase = (status: string | undefined): string =>
  status === "DONE" ? "terminada" : status === "IN_PROGRESS" ? "en curso" : "pendiente";

/** Una línea, sin saltos y cortada a `tope` con «…». */
function enUnaLinea(s: string, tope: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > tope ? `${t.slice(0, tope - 1).trimEnd()}…` : t;
}

/**
 * El mensaje para el modelo: por fase del vivo, `[F1] «Nombre» (terminada|en curso|pendiente) — nota`, y debajo sus
 * HECHAS como `[T12] título`. Solo ids cortos: la IA nunca ve un id de la base.
 */
export function mensajeParaUbicar(vivo: Vivo): MensajeParaUbicar {
  const fases = new Map<string, string>();
  const tareas = new Map<string, { id: string; fase: string }>();
  const lineas: string[] = ["Las fases del cronograma, en orden, cada una con sus tareas HECHAS:"];
  vivo.fases.forEach((f, i) => {
    const F = `F${i + 1}`;
    fases.set(F, f.id);
    const nota = f.notes?.trim() ? ` — ${enUnaLinea(f.notes, TOPE_DE_LA_NOTA)}` : "";
    lineas.push(`[${F}] «${enUnaLinea(f.name, TOPE_DEL_TITULO)}» (${estadoDeLaFase(f.status)})${nota}`);
    for (const t of f.tareas ?? []) {
      if (t.status !== "DONE" || tareas.size >= TOPE_DE_HECHAS) continue;
      const T = `T${tareas.size + 1}`;
      tareas.set(T, { id: t.id, fase: f.id });
      lineas.push(`   [${T}] ${enUnaLinea(t.title, TOPE_DEL_TITULO) || "Sin título"}`);
    }
  });
  return { texto: lineas.join("\n"), fases, tareas };
}

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const idCorto = (v: unknown): string | null => (typeof v === "string" ? v.trim().toUpperCase() : null);

/**
 * ⭐ Lo que devolvió el modelo, validado: solo mudanzas de una tarea HECHA hoy, desde la fase en que se le mostró,
 * a OTRA fase que existe, que ningún otro cambio toca (`tocadas`: las tareas que ya cambian en la propuesta, del chat o
 * de la IA), sin repetidas y hasta `TOPE_DE_SUGERIDAS`. Nunca quita ni cambia el estado: es un `tarea-cambia` con solo
 * `a.fase`, `sugerida: "otra-fase"` y sin `porChat`. Un id que no está en la lista (inventado) no entra. No tira.
 */
export function sugerenciasDeMudanza(
  crudo: unknown,
  vivo: Vivo,
  mapas: MapasParaUbicar,
  tocadas: ReadonlySet<string>,
): CambioTareaCambia[] {
  const obj = typeof crudo === "string" ? parseObject(crudo) : esObjeto(crudo) ? crudo : {};
  const lista = Array.isArray(obj.mover) ? obj.mover : [];
  const vivas = new Map<string, { t: TareaDelVivo; fase: string }>();
  for (const f of vivo.fases) for (const t of f.tareas ?? []) vivas.set(t.id, { t, fase: f.id });
  const nombreDe = new Map(vivo.fases.map((f) => [f.id, f.name]));
  const out: CambioTareaCambia[] = [];
  const vistas = new Set<string>();
  for (const x of lista) {
    if (out.length >= TOPE_DE_SUGERIDAS) break;
    if (!esObjeto(x)) continue;
    const T = idCorto(x.tarea);
    const F = idCorto(x.fase);
    const mostrada = T ? mapas.tareas.get(T) : undefined;
    const destino = F ? mapas.fases.get(F) : undefined;
    if (!mostrada || destino === undefined) continue;
    const viva = vivas.get(mostrada.id);
    // HECHA hoy y en la fase en que se le mostró (si alguien la movió o la reabrió mientras tanto, no).
    if (!viva || viva.t.status !== "DONE" || viva.fase !== mostrada.fase) continue;
    // A otra fase que existe.
    if (!nombreDe.has(destino) || destino === viva.fase) continue;
    if (tocadas.has(viva.t.id) || vistas.has(viva.t.id)) continue;
    vistas.add(viva.t.id);
    out.push({
      tipo: "tarea-cambia",
      clave: claveDeTareaQueCambia(viva.t.id),
      tareaId: viva.t.id,
      faseId: viva.fase,
      desde: fotoDeTarea(viva.t),
      a: { fase: destino },
      motivo: `Parece de «${nombreDe.get(destino)}»`,
      sugerida: "otra-fase",
    });
  }
  return out;
}

/** Las tareas vivas que ya toca algún cambio de la propuesta (se quitan, cambian o se mudan): no se sugieren. */
export function tareasTocadas(cambios: readonly Cambio[]): Set<string> {
  const out = new Set<string>();
  for (const c of cambios) if (c.tipo === "tarea-se-va" || c.tipo === "tarea-cambia") out.add(c.tareaId);
  return out;
}

/**
 * Las sugerencias que entran en la lista que se escribe: las que no chocan con ella (ni su clave ni su tarea están ya
 * en otro cambio). Lo usa la fusión en cada vuelta: entre una y otra, el chat pudo tocar una de esas tareas.
 */
export function sugeridasQueEntran(cambios: readonly Cambio[], sugeridas: readonly CambioTareaCambia[]): CambioTareaCambia[] {
  const claves = new Set(cambios.map((c) => c.clave));
  const tocadas = tareasTocadas(cambios);
  const out: CambioTareaCambia[] = [];
  for (const s of sugeridas) {
    if (s.sugerida !== "otra-fase" || claves.has(s.clave) || tocadas.has(s.tareaId)) continue;
    claves.add(s.clave);
    tocadas.add(s.tareaId);
    out.push(s);
  }
  return out;
}

/**
 * ⭐ Las mudanzas sugeridas, con el modelo inyectado (`llamar`): la ruta pasa Haiku (medido, con su tope), los tests un
 * doble. Sin hechas que mirar (todas tocadas, o ninguna) o con una sola fase, no se llama. Si el modelo tira, tira
 * (quien la llama la envuelve con su tope y su `catch`: sin sugerencias, la propuesta se escribe igual).
 */
export async function ubicarHechas(i: {
  vivo: Vivo;
  tocadas: ReadonlySet<string>;
  llamar: (sistema: string, mensaje: string) => Promise<string>;
}): Promise<CambioTareaCambia[]> {
  const m = mensajeParaUbicar(i.vivo);
  const hayQueMirar = [...m.tareas.values()].some((t) => !i.tocadas.has(t.id));
  if (m.fases.size < 2 || !hayQueMirar) return [];
  const respuesta = await i.llamar(PROMPT_UBICAR_HECHAS, m.texto);
  return sugerenciasDeMudanza(respuesta, i.vivo, m, i.tocadas);
}
