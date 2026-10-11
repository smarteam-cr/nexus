/**
 * lib/delivery/objetivos.ts — el desafío y los objetivos del Diagnóstico, en la Entrega. PURO.
 *
 * Pedido de Elías (2026-10-07): la entrega muestra el antes y el después y lo que quedó
 * implementado, y además tiene que mostrar EL DESAFÍO QUE SE RESOLVIÓ y LOS OBJETIVOS QUE SE
 * ALCANZARON, tomando lo que se definió en el diagnóstico.
 *
 * ── LA LISTA LA PONE EL DIAGNÓSTICO; EL ESTADO, LA IA; LA DECISIÓN, EL CSE ─────
 *   · Qué objetivos hay y cómo se llaman sale del Diagnóstico, por código (OBJ-01…). La IA no
 *     puede inventar un objetivo ni renombrarlo: `normalizarObjetivosPropuestos` descarta los
 *     códigos que no existen y copia el título del diagnóstico.
 *   · Si se alcanzó o no lo PROPONE la IA, con su evidencia. «Alcanzado» sin evidencia baja a
 *     «Por medir»: en el papel que el cliente archiva, un logro sin respaldo es maquillaje.
 *   · Lo que ve el cliente es SOLO lo que el CSE aceptó (`objetivosConfirmados`, fuera del
 *     esquema del agente, como `kpisConfirmados` en el impacto).
 */

export type EstadoDelObjetivo = "alcanzado" | "en_camino" | "por_medir";

export const ESTADOS_DEL_OBJETIVO: readonly EstadoDelObjetivo[] = ["alcanzado", "en_camino", "por_medir"];

export const ROTULO_DEL_ESTADO: Record<EstadoDelObjetivo, string> = {
  alcanzado: "Alcanzado",
  en_camino: "En camino",
  por_medir: "Por medir",
};

/** Un objetivo tal como lo trae el Diagnóstico (sección `objetivos`). */
export interface ObjetivoDelDiagnostico {
  id: string;
  tipo: string;
  titulo: string;
  medida: string;
  /** El resultado medible del handoff al que apunta (R1…), o vacío. */
  resultado: string;
}

/** Un objetivo en la Entrega: el del diagnóstico + lo que se logró. */
export interface ObjetivoDeLaEntrega {
  id: string;
  titulo: string;
  medida?: string;
  estado: EstadoDelObjetivo;
  /** De dónde sale el estado: lo que dijo quién y cuándo, o qué lo sostiene. */
  evidencia: string;
}

/** La data de la sección `logros` de la Entrega (formato desde el 2026-10-07). */
export interface ObjetivosDeLaEntregaData {
  intro: string;
  /** Lo que propone la IA. Dentro del esquema; el cliente nunca lo ve. */
  objetivosPropuestos?: ObjetivoDeLaEntrega[];
  /** Lo que aceptó el CSE. Fuera del esquema; es lo ÚNICO que ve el cliente. */
  objetivosConfirmados?: ObjetivoDeLaEntrega[];
  /** LEGACY: las capacidades en prosa de antes del 2026-10-07. */
  items?: Array<{ title?: string; detail?: string }>;
}

export interface DesafioDelDiagnostico {
  /** La pregunta que resume el problema (`intro` de la sección `desafio`). */
  pregunta: string;
  situaciones: Array<{ title: string; detail: string }>;
}

const texto = (v: unknown, max = 600): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** `OBJ-1`, `obj 01`, `OBJ-01` → `OBJ-01`; `r2` → `R2`. Cualquier otra cosa, tal cual en mayúsculas. */
export function normalizarCodigo(v: unknown): string {
  const t = texto(v, 20).toUpperCase().replace(/\s+/g, "");
  const obj = /^OBJ-?(\d{1,3})$/.exec(t);
  if (obj) return `OBJ-${obj[1].padStart(2, "0")}`;
  const r = /^R(\d{1,3})$/.exec(t);
  if (r) return `R${Number(r[1])}`;
  return t;
}

export function estadoDelObjetivo(v: unknown): EstadoDelObjetivo {
  const t = texto(v, 30)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s-]+/g, "_");
  if (t === "alcanzado" || t === "logrado" || t === "cumplido") return "alcanzado";
  if (t === "en_camino" || t === "en_curso" || t === "parcial") return "en_camino";
  return "por_medir";
}

/** Los objetivos del Diagnóstico, en su orden. Tolera data vieja o rota. */
export function leerObjetivosDelDiagnostico(data: unknown): ObjetivoDelDiagnostico[] {
  if (!data || typeof data !== "object") return [];
  const lista = (data as { objetivos?: unknown }).objetivos;
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  const out: ObjetivoDelDiagnostico[] = [];
  for (const it of lista) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const id = normalizarCodigo(o.id);
    const titulo = texto(o.titulo, 300);
    if (!id || !titulo || vistos.has(id)) continue;
    vistos.add(id);
    out.push({ id, tipo: texto(o.tipo, 30), titulo, medida: texto(o.medida, 300), resultado: normalizarCodigo(o.resultado) });
  }
  return out;
}

/** El desafío del Diagnóstico, o null si no tiene pregunta ni situaciones. */
export function leerDesafioDelDiagnostico(data: unknown): DesafioDelDiagnostico | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { intro?: unknown; items?: unknown };
  const pregunta = texto(d.intro, 400);
  const situaciones = (Array.isArray(d.items) ? d.items : [])
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      return { title: texto(o.title, 200), detail: texto(o.detail, 400) };
    })
    .filter((s) => s.title);
  if (!pregunta && !situaciones.length) return null;
  return { pregunta, situaciones };
}

function leerObjetivoDeLaEntrega(it: unknown): ObjetivoDeLaEntrega | null {
  if (!it || typeof it !== "object") return null;
  const o = it as Record<string, unknown>;
  const id = normalizarCodigo(o.id);
  const titulo = texto(o.titulo, 300);
  if (!titulo) return null;
  const medida = texto(o.medida, 300);
  return { id, titulo, ...(medida ? { medida } : {}), estado: estadoDelObjetivo(o.estado), evidencia: texto(o.evidencia) };
}

export function leerObjetivosDeLaEntrega(lista: unknown): ObjetivoDeLaEntrega[] {
  return (Array.isArray(lista) ? lista : []).map(leerObjetivoDeLaEntrega).filter((o): o is ObjetivoDeLaEntrega => !!o);
}

/** «Alcanzado» sin una línea de evidencia no es un logro: baja a «Por medir». */
function conEvidencia(o: ObjetivoDeLaEntrega): ObjetivoDeLaEntrega {
  return o.estado === "alcanzado" && !o.evidencia ? { ...o, estado: "por_medir" } : o;
}

/**
 * Lo que queda como propuesta después de que responde la IA.
 *  · Con objetivos en el Diagnóstico: uno por cada OBJ que el CSE todavía no aceptó, en el orden
 *    del diagnóstico y con SU título y SU medida. El estado y la evidencia, de la IA; si la IA no
 *    dijo nada de un objetivo, queda «Por medir». Los códigos que la IA inventó se descartan.
 *  · Sin diagnóstico: lo que propuso la IA (que trabaja con los resultados del handoff).
 */
export function normalizarObjetivosPropuestos(args: {
  delDiagnostico: readonly ObjetivoDelDiagnostico[];
  delAgente: unknown;
  confirmados: unknown;
}): ObjetivoDeLaEntrega[] {
  const yaAceptados = new Set(leerObjetivosDeLaEntrega(args.confirmados).map((o) => o.id).filter(Boolean));
  const delAgente = leerObjetivosDeLaEntrega(args.delAgente);
  if (!args.delDiagnostico.length) {
    return delAgente.filter((o) => !o.id || !yaAceptados.has(o.id)).map(conEvidencia);
  }
  const porId = new Map(delAgente.filter((o) => o.id).map((o) => [o.id, o]));
  return args.delDiagnostico
    .filter((d) => !yaAceptados.has(d.id))
    .map((d) => {
      const p = porId.get(d.id);
      return conEvidencia({
        id: d.id,
        titulo: d.titulo,
        ...(d.medida ? { medida: d.medida } : {}),
        estado: p?.estado ?? "por_medir",
        evidencia: p?.evidencia ?? "",
      });
    });
}

/** ¿La sección ya está en el formato de objetivos? (si no, se pinta la prosa de antes). */
export function esFormatoDeObjetivos(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d.objetivosPropuestos) || Array.isArray(d.objetivosConfirmados);
}

/** El bloque para el mensaje del agente de Entrega. Vacío si el diagnóstico no trae nada. */
export function diagnosticoParaLaEntrega(args: {
  desafio: DesafioDelDiagnostico | null;
  objetivos: readonly ObjetivoDelDiagnostico[];
}): string {
  const partes: string[] = [];
  if (args.desafio) {
    partes.push("DESAFÍO DEL DIAGNÓSTICO:");
    if (args.desafio.pregunta) partes.push(`Pregunta: ${args.desafio.pregunta}`);
    for (const s of args.desafio.situaciones) partes.push(`- ${s.title}${s.detail ? `: ${s.detail}` : ""}`);
  }
  if (args.objetivos.length) {
    if (partes.length) partes.push("");
    partes.push("OBJETIVOS DEL DIAGNÓSTICO:");
    for (const o of args.objetivos) {
      partes.push(
        `- ${o.id}${o.tipo ? ` · ${o.tipo}` : ""} · ${o.titulo}` +
          `${o.medida ? ` — se mide con: ${o.medida}` : ""}` +
          `${o.resultado ? ` — resultado del handoff: ${o.resultado}` : ""}`,
      );
    }
  }
  return partes.join("\n");
}
