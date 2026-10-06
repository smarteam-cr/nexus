/**
 * lib/canvas/restaurar-bloque.ts — DESHACER UN BORRADO DEVUELVE EL BLOQUE COMO ESTABA.
 *
 * ── EL HUECO (auditoría del deshacer, 2026-10-05) ─────────────────────────────────────────────
 * Descartar una sugerencia del agente y deshacer la RECREABA con el POST de «agregar bloque», que
 * siempre crea uno manual: volvía como «Manual», CONFIRMADA, al final de la sección y con id nuevo.
 * O sea, deshacer el descarte la ACEPTABA sin que nadie la aceptara, y el bloque perdía su origen.
 *
 * Ahora el POST de bloques tiene un modo `restaurar`, acotado: con el mismo permiso que borrar
 * (es su inverso) fija lo que el POST normal decide solo —origen, estado, orden, tamaño en la
 * grilla, la corrida del agente, la versión anterior, la fecha y, si sigue libre, el MISMO id—.
 * Así el deshacer de las ediciones previas de ese bloque (que lo nombran por id) sigue andando.
 *
 * Puro: sin Prisma ni red. La ruta resuelve lo que necesita la base (si el id está libre, si la
 * corrida existe) y se lo pasa.
 */
import { z } from "zod";

/** Un id de fila: los nuestros son cuid o UUID. ⛔ NO `z.string().cuid()`: hay UUID en la base. */
const ID_DE_FILA = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const datosJson = z
  .record(z.string(), z.unknown())
  .refine((v) => JSON.stringify(v).length <= 1_000_000, { message: "data supera 1 MB" });

/** Lo que viaja en `restaurar`. Estricto: un campo desconocido es 400. */
export const restaurarBloqueSchema = z.strictObject({
  id: ID_DE_FILA.optional(),
  source: z.enum(["AGENT", "HUMAN", "MODIFIED"]),
  status: z.enum(["DRAFT", "CONFIRMED"]),
  order: z.number().int().min(-1_000_000).max(1_000_000),
  colSpan: z.number().int().min(1).max(4).optional(),
  colStart: z.number().int().min(1).max(4).nullable().optional(),
  rowSpan: z.number().int().min(1).max(40).optional(),
  agentRunId: ID_DE_FILA.nullable().optional(),
  previousContent: z.string().max(200_000).nullable().optional(),
  previousData: datosJson.nullable().optional(),
  createdAt: z.string().max(40).optional(),
});

export type RestaurarBloque = z.infer<typeof restaurarBloqueSchema>;

/** La foto de un bloque antes de borrarlo, como la tiene el navegador (`BlockData`). */
export interface BloqueBorrado {
  id?: string;
  blockType: string;
  content: string | null;
  data: unknown;
  previousContent?: string | null;
  previousData?: unknown;
  order?: number;
  colSpan?: number;
  colStart?: number | null;
  rowSpan?: number;
  source?: string;
  status?: string;
  agentRunId?: string | null;
  createdAt?: string;
}

const FUENTES = new Set(["AGENT", "HUMAN", "MODIFIED"]);
const ESTADOS = new Set(["DRAFT", "CONFIRMED"]);
const esObjetoPlano = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * El cuerpo del POST que DEVUELVE un bloque borrado como estaba.
 *
 * Sin la foto completa (falta el origen, el estado o el orden) cae al cuerpo de siempre —crear uno
 * manual con ese contenido—: mejor recuperar el texto que no recuperar nada.
 */
export function cuerpoParaRestaurar(b: BloqueBorrado): {
  blockType: string;
  content: string;
  data?: unknown;
  restaurar?: RestaurarBloque;
} {
  const base = { blockType: b.blockType, content: b.content ?? "", data: b.data ?? undefined };
  if (!b.source || !FUENTES.has(b.source) || !b.status || !ESTADOS.has(b.status) || typeof b.order !== "number") {
    return base;
  }
  const restaurar: RestaurarBloque = {
    source: b.source as RestaurarBloque["source"],
    status: b.status as RestaurarBloque["status"],
    order: b.order,
  };
  if (b.id) restaurar.id = b.id;
  if (typeof b.colSpan === "number") restaurar.colSpan = b.colSpan;
  if (b.colStart === null || typeof b.colStart === "number") restaurar.colStart = b.colStart;
  if (typeof b.rowSpan === "number") restaurar.rowSpan = b.rowSpan;
  if (b.agentRunId !== undefined) restaurar.agentRunId = b.agentRunId;
  if (b.previousContent !== undefined) restaurar.previousContent = b.previousContent;
  /* La versión anterior solo si tiene la forma que el esquema acepta: un objeto raro haría fallar
     el deshacer entero por un dato que es secundario. */
  if (b.previousData === null || esObjetoPlano(b.previousData)) restaurar.previousData = b.previousData;
  if (b.createdAt) restaurar.createdAt = b.createdAt;
  return { ...base, restaurar };
}

/** Lo que se crea. `undefined` = que la base ponga su valor por defecto (id nuevo, tamaño, fecha). */
export interface BloqueARestaurar {
  id: string | undefined;
  order: number;
  source: RestaurarBloque["source"];
  status: RestaurarBloque["status"];
  colSpan: number | undefined;
  colStart: number | null | undefined;
  rowSpan: number | undefined;
  agentRunId: string | null;
  previousContent: string | null;
  /** `null` vuelve como `null`: la ruta lo traduce a `Prisma.DbNull`. */
  previousData: Record<string, unknown> | null;
  createdAt: Date | undefined;
}

/**
 * Lo que se crea en la base al restaurar (además del tipo, el contenido y la data, que la ruta
 * normaliza como en su POST normal). Resuelve con dos respuestas que necesitan la base:
 *   · `idLibre`: si el id original no lo tiene otra fila (si lo tiene, nace con uno nuevo);
 *   · `corridaExiste`: si la corrida del agente sigue existiendo (la relación es una FK).
 */
export function datosDelBloqueRestaurado(p: {
  restaurar: RestaurarBloque;
  idLibre: boolean;
  corridaExiste: boolean;
  ahora?: number;
}): BloqueARestaurar {
  const r = p.restaurar;
  const ahora = p.ahora ?? Date.now();
  const creado = r.createdAt ? new Date(r.createdAt) : null;
  const fecha = creado && !Number.isNaN(creado.getTime()) && creado.getTime() <= ahora ? creado : undefined;
  return {
    id: r.id && p.idLibre ? r.id : undefined,
    order: r.order,
    source: r.source,
    status: r.status,
    colSpan: r.colSpan,
    colStart: r.colStart,
    rowSpan: r.rowSpan,
    agentRunId: r.agentRunId && p.corridaExiste ? r.agentRunId : null,
    previousContent: r.previousContent ?? null,
    previousData: r.previousData ?? null,
    createdAt: fecha,
  };
}
