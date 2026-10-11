/**
 * lib/handoff/congelado.ts — EL HANDOFF SE CONGELA (etapa 3b, DECISIONS «El handoff se congela»). PURO.
 *
 * El handoff es la foto fija de lo vendido. Se congela con «Congelar» o, solo, la primera vez que se aplica el
 * cronograma que propone (app/api/projects/[projectId]/timeline/borrador/aplicar). Congelado:
 *   · sigue editable a mano;
 *   · la IA ya no lo regenera: «Buscar lo nuevo» lee las reuniones posteriores al congelado y deja SUGERENCIAS
 *     (bloques en borrador, con su cita) que alguien usa o descarta;
 *   · «Rehacer desde cero» pide un motivo, corre la generación de siempre y lo vuelve a congelar al terminar.
 *
 * ── DÓNDE SE GUARDA ─────────────────────────────────────────────────────────────────────────────────────
 * Como un HITO del canvas del handoff (`HitoDeDocumento.tipo` = «congelado» | «rehecho») con su foto protegida
 * (`VersionDeDocumento.protegida`), sin columnas nuevas: la fila de `Handoff` no siempre existe, el hito ya
 * guarda quién y cuándo, y la foto ES la foto fija de lo vendido. El estado se lee del ÚLTIMO de esos dos hitos.
 *
 * ── «REHECHO» Y «CONGELADO» SE ESCRIBEN JUNTOS, AL TERMINAR ─────────────────────────────────────────────
 * Rehacer deja el hito «rehecho» (con el motivo) y enseguida el «congelado» nuevo, con un milisegundo de
 * diferencia, recién cuando la generación terminó y escribió algo. Si la corrida falla en el medio, el handoff
 * queda congelado como estaba: no hay un estado «a medio rehacer» que alguien tenga que arreglar.
 *
 * Lo que escribe la base vive en lib/handoff/congelado-server.ts; acá, las reglas, que se prueban sin base.
 */
import type { SeccionDeVersion } from "@/lib/canvas/versiones";

export const TIPO_CONGELADO = "congelado";
export const TIPO_REHECHO = "rehecho";
/** Los dos hitos que deciden el estado (el último manda). */
export const TIPOS_DEL_CONGELADO: readonly string[] = [TIPO_CONGELADO, TIPO_REHECHO];

/** Cómo se congeló: con el botón, al aplicar el cronograma, al terminar de rehacerlo o con el script de los anteriores. */
export type ViaDelCongelado = "boton" | "cronograma" | "rehacer" | "migracion";
export const VIAS_DEL_CONGELADO: readonly ViaDelCongelado[] = ["boton", "cronograma", "rehacer", "migracion"];

/** El texto que queda en el hito «congelado» (`HitoDeDocumento.motivo`). De ahí se vuelve a leer la vía. */
const TEXTO_DE_LA_VIA: Record<ViaDelCongelado, string> = {
  boton: "Con el botón «Congelar»",
  cronograma: "Al aplicar el cronograma que propone el handoff",
  rehacer: "Al terminar de rehacerlo desde cero",
  migracion: "Al ordenar los handoffs que ya tenían su cronograma aplicado",
};

/** Cómo lo dice la pantalla, después de «Congelado el 2 sep, …». */
export const FRASE_DE_LA_VIA: Record<ViaDelCongelado, string> = {
  boton: "con el botón «Congelar»",
  cronograma: "al aplicar el cronograma",
  rehacer: "al rehacerlo desde cero",
  migracion: "al ordenar los handoffs anteriores",
};

/** Por qué se tomó la foto protegida (`VersionDeDocumento.origen`). */
export const ORIGEN_DE_LA_FOTO: Record<ViaDelCongelado, string> = {
  boton: "Handoff congelado con el botón «Congelar»",
  cronograma: "Handoff congelado al aplicar el cronograma que propone",
  rehacer: "Handoff congelado al terminar de rehacerlo desde cero",
  migracion: "Handoff congelado al ordenar los handoffs anteriores",
};

export function motivoDelHito(via: ViaDelCongelado): string {
  return TEXTO_DE_LA_VIA[via];
}

/** La vía de un hito «congelado», leída de su texto. Un texto que no se reconoce es `null`. */
export function viaDelMotivo(motivo: string | null | undefined): ViaDelCongelado | null {
  const m = (motivo ?? "").trim();
  if (!m) return null;
  for (const via of VIAS_DEL_CONGELADO) {
    const t = TEXTO_DE_LA_VIA[via];
    if (m === t || m.startsWith(`${t}:`)) return via;
  }
  return null;
}

// ── El estado ───────────────────────────────────────────────────────────────────────────────────────────

export interface HitoDelCongelado {
  tipo: string;
  createdAt: Date | string;
  porEmail: string | null;
  motivo: string | null;
  fotoId: string | null;
}

export interface EstadoDelHandoff {
  congelado: boolean;
  /** Cuándo se congeló (ISO). */
  at: string | null;
  porEmail: string | null;
  via: ViaDelCongelado | null;
  /** La foto protegida de lo que se congeló. */
  fotoId: string | null;
}

export const SIN_CONGELAR: EstadoDelHandoff = { congelado: false, at: null, porEmail: null, via: null, fotoId: null };

const enMilis = (v: Date | string | null | undefined): number | null => {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * El estado del handoff desde los hitos de su canvas: manda el último «congelado» o «rehecho». Ante un empate
 * de fecha gana «congelado» (rehacer escribe los dos juntos). Un hito con fecha ilegible no cuenta.
 */
export function estadoDelHandoff(hitos: readonly HitoDelCongelado[]): EstadoDelHandoff {
  let ultimo: HitoDelCongelado | null = null;
  let ultimoMs = -Infinity;
  for (const h of hitos) {
    if (!TIPOS_DEL_CONGELADO.includes(h.tipo)) continue;
    const ms = enMilis(h.createdAt);
    if (ms === null) continue;
    if (ms > ultimoMs || (ms === ultimoMs && h.tipo === TIPO_CONGELADO)) {
      ultimo = h;
      ultimoMs = ms;
    }
  }
  if (!ultimo || ultimo.tipo !== TIPO_CONGELADO) return SIN_CONGELAR;
  return {
    congelado: true,
    at: new Date(ultimoMs).toISOString(),
    porEmail: ultimo.porEmail,
    via: viaDelMotivo(ultimo.motivo),
    fotoId: ultimo.fotoId,
  };
}

// ── Qué pide la pantalla y qué se hace ──────────────────────────────────────────────────────────────────

/** Lo que manda la pantalla en `body.handoff` de /analyze. Sin nada, es la generación de siempre. */
export type PedidoDelHandoff = { modo: "sugerir" } | { modo: "rehacer"; motivo: string };

/** El motivo de «Rehacer desde cero» pide 10 caracteres o más. */
export const MOTIVO_MINIMO = 10;
const MOTIVO_MAXIMO = 1000;

/** `null` = no pidió nada (la generación de siempre). "invalido" = vino algo que no se entiende (400). */
export function leerPedidoDelHandoff(raw: unknown): PedidoDelHandoff | null | "invalido" {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return "invalido";
  const o = raw as Record<string, unknown>;
  if (o.modo === "sugerir") return { modo: "sugerir" };
  if (o.modo === "rehacer") {
    if (typeof o.motivo !== "string") return "invalido";
    return { modo: "rehacer", motivo: o.motivo.trim().slice(0, MOTIVO_MAXIMO) };
  }
  return "invalido";
}

export type ErrorDelModo = "HANDOFF_CONGELADO" | "FALTA_MOTIVO" | "NO_CONGELADO";
export type ModoDeGeneracion = "generar" | "sugerir" | "rehacer" | { error: ErrorDelModo };

/**
 * Qué hace /analyze con el handoff.
 *   · Sin congelar: la generación de siempre. «Buscar lo nuevo» sobre uno sin congelar es una pestaña vieja: si
 *     se corriera la generación completa, reemplazaría el documento sin que nadie lo haya pedido (NO_CONGELADO).
 *     «Rehacer» sin congelar es lo mismo que generar.
 *   · Congelado: sin modo es una pestaña de antes (HANDOFF_CONGELADO); «Buscar lo nuevo» sugiere; rehacer pide
 *     el motivo.
 */
export function modoDeGeneracion(p: { congelado: boolean; pedido: PedidoDelHandoff | null }): ModoDeGeneracion {
  if (!p.congelado) {
    if (p.pedido?.modo === "sugerir") return { error: "NO_CONGELADO" };
    return "generar";
  }
  if (!p.pedido) return { error: "HANDOFF_CONGELADO" };
  if (p.pedido.modo === "sugerir") return "sugerir";
  if (p.pedido.motivo.trim().length < MOTIVO_MINIMO) return { error: "FALTA_MOTIVO" };
  return "rehacer";
}

/** La respuesta de /analyze para cada error del modo (y para «no hay nada nuevo»). */
export function respuestaDelModo(
  codigo: ErrorDelModo | "SIN_NOVEDADES",
  fechaDelCongelado?: string | null,
): { status: number; body: { error: string; message: string } } {
  switch (codigo) {
    case "HANDOFF_CONGELADO":
      return {
        status: 409,
        body: {
          error: codigo,
          message:
            "El handoff está congelado: la IA ya no lo regenera. Usa «Buscar lo nuevo» para ver lo que cambió en las reuniones, o «Rehacer desde cero» con un motivo. Si no ves esos botones, recarga la página.",
        },
      };
    case "FALTA_MOTIVO":
      return {
        status: 400,
        body: { error: codigo, message: `Escribe por qué lo rehaces desde cero (${MOTIVO_MINIMO} caracteres o más).` },
      };
    case "NO_CONGELADO":
      return {
        status: 409,
        body: { error: codigo, message: "El handoff no está congelado: recarga la página y vuelve a intentarlo." },
      };
    case "SIN_NOVEDADES": {
      const desde = fechaCorta(fechaDelCongelado);
      return {
        status: 409,
        body: {
          error: codigo,
          message: `No hay reuniones nuevas ni fuentes manuales desde que se congeló el handoff${desde ? ` (el ${desde})` : ""}: no hay nada que buscar todavía.`,
        },
      };
    }
  }
}

// ── Las sugerencias ─────────────────────────────────────────────────────────────────────────────────────

/** La marca que lleva en `data` un bloque que la IA dejó como sugerencia sobre el handoff congelado. */
export const MARCA_DE_SUGERENCIA = "sugerenciaDelHandoff";

export function llevaMarcaDeSugerencia(data: unknown): boolean {
  return !!data && typeof data === "object" && !Array.isArray(data) && MARCA_DE_SUGERENCIA in (data as Record<string, unknown>);
}

/**
 * ¿Es una sugerencia que nadie revisó? No entra al contexto de ningún agente (kickoff, diagnóstico, entrega…):
 * lo que nadie usó todavía no es lo vendido. Una vez usada (CONFIRMED) es contenido como cualquier otro.
 */
export function esSugerenciaPendiente(b: { status: string; data?: unknown }): boolean {
  return b.status === "DRAFT" && llevaMarcaDeSugerencia(b.data);
}

// ── El aviso de «desactualizado» ────────────────────────────────────────────────────────────────────────

/** Lo que se compara para saber si el handoff cambió: los bloques que NO están en borrador (una sugerencia pendiente no es lo vendido). */
export function sinBorradores(secciones: readonly SeccionDeVersion[]): SeccionDeVersion[] {
  return secciones.map((s) => ({ ...s, blocks: s.blocks.filter((b) => b.status !== "DRAFT") }));
}

/** JSON con las claves ordenadas, a cualquier profundidad. */
function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/**
 * Lo que dice el handoff, sin borradores, en una forma comparable. ⚠ Con las claves ordenadas a propósito: la foto
 * vuelve de la base como `jsonb`, que NO conserva el orden de las claves, así que comparar `JSON.stringify` (o la
 * `huella` de la foto, que además incluye los borradores) daría «cambió» siempre.
 */
export function contenidoComparable(secciones: readonly SeccionDeVersion[]): string {
  return canonico(sinBorradores(secciones));
}

/**
 * Cuándo cambió por última vez lo que dice el handoff (lo lee lib/pieces/piece-staleness.ts).
 *   · Sin congelar: la última generación, como siempre.
 *   · Congelado: la generación, o la última edición del documento si es posterior al congelado y de verdad
 *     cambió lo que dice (una sugerencia usada, un bloque editado). Descartar una sugerencia toca el documento
 *     pero no cambia lo vendido: no cuenta (`cambioDesdeElCongelado` lo decide comparando con la foto).
 */
export function ultimoCambioReal(p: {
  generadoAt: Date | string | null;
  congeladoAt: Date | string | null;
  contenidoAt: Date | string | null;
  cambioDesdeElCongelado: boolean;
}): Date | null {
  const generado = enMilis(p.generadoAt);
  const congelado = enMilis(p.congeladoAt);
  const contenido = enMilis(p.contenidoAt);
  let ms = generado;
  if (congelado !== null && contenido !== null && p.cambioDesdeElCongelado && contenido > congelado) {
    ms = ms === null ? contenido : Math.max(ms, contenido);
  }
  return ms === null ? null : new Date(ms);
}

// ── Los handoffs que ya existían (scripts/congelar-handoffs-aplicados.ts) ───────────────────────────────

/**
 * ¿Esta razón del historial del cronograma (`TimelineChange.reason`) dice que se APLICÓ algo de una propuesta del
 * handoff? Las dos formas que tuvo: la de hoy («Propuesta de fases del handoff aplicada: 3 de 5 cambios…», de
 * /timeline/borrador/aplicar) y la de antes de E4 («Sugerencias del handoff aceptadas por ítem (3 aceptadas, …)»).
 * Aplicar cero (resolver la propuesta desmarcándolo todo) no cuenta.
 */
export function razonDeHandoffAplicado(reason: string | null | undefined): boolean {
  const r = (reason ?? "").trim();
  const hoy = /^Propuesta de fases del handoff aplicada:\s*(\d+)\s+de\b/.exec(r);
  if (hoy) return Number(hoy[1]) > 0;
  const antes = /^Sugerencias del handoff aceptadas por ítem \((\d+) aceptadas/.exec(r);
  if (antes) return Number(antes[1]) > 0;
  return false;
}

// ── Textos ──────────────────────────────────────────────────────────────────────────────────────────────

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «2 sep 2026», en hora de Costa Rica (UTC-6, sin horario de verano). Armada a mano: igual en el servidor y el navegador. */
export function fechaCorta(v: Date | string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const ms = v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(v).getTime();
  if (!Number.isFinite(ms)) return null;
  const cr = new Date(ms - 6 * 60 * 60 * 1000);
  return `${cr.getUTCDate()} ${MESES[cr.getUTCMonth()]} ${cr.getUTCFullYear()}`;
}

/** «Congelado el 2 sep 2026, al aplicar el cronograma». */
export function lineaDelCongelado(estado: Pick<EstadoDelHandoff, "congelado" | "at" | "via">): string | null {
  if (!estado.congelado) return null;
  const fecha = fechaCorta(estado.at);
  const como = estado.via ? `, ${FRASE_DE_LA_VIA[estado.via]}` : "";
  return `Congelado${fecha ? ` el ${fecha}` : ""}${como}`;
}
