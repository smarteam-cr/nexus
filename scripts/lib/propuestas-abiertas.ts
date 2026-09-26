/**
 * scripts/lib/propuestas-abiertas.ts — lo PURO de scripts/propuestas-abiertas.ts: en qué formato está
 * cada propuesta abierta, cuáles frenan el deploy, cuáles deja la vuelta atrás y (E4 P3) cómo se
 * convierten las viejas del handoff.
 *
 * Vive aparte, sin base ni efectos, para que el project `unit` lo pruebe
 * (lib/timeline/propuestas-abiertas.test.ts): el script corre `main()` apenas se importa.
 *
 * ── E4 P3: LAS VIEJAS DEL HANDOFF SE CONVIERTEN CONTRA LA FOTO DEL DÍA EN QUE SE CREARON ─────────
 * El formato viejo no guarda el `desde` de cada cambio, y el handoff copiaba TODOS los campos de cada
 * fase. Convertirla contra lo de hoy (o decidirla en la barra) hace que un campo editado a mano después
 * aparezca como un cambio que lo devuelve al valor viejo, en «aplica». Por eso se desanda lo vivo con
 * el registro de ediciones (`TimelineEvent`) hasta el día en que se creó (`fotoAlCrearse`) y se usa el
 * conversor exacto del handoff (`convertirDelHandoff`): las copias viejas desaparecen solas y lo
 * editado después queda como choque del servidor (⚠), que ninguna pestaña puede aplicar.
 * La nota de la fase no tiene evento, pero no pudo cambiar: ninguna pantalla la edita, y un guardado
 * con motivo no pasa con una propuesta abierta.
 */
import { join } from "node:path";
import {
  FORMATO_BORRADOR,
  convertirDelHandoff,
  debeDescartarseSolo,
  esBorradorV1,
  planDeAplicacion,
  resumir,
  type Borrador,
  type FaseViva,
  type PlanDeAplicacion,
  type Vivo,
} from "../../lib/timeline/borrador";
import { origenDePropuesta, type ProposalLike } from "../../lib/timeline/proposal-deltas";

export type Formato = "v1" | "viejo-con-tasks" | "viejo-contexto" | "viejo-handoff" | "ilegible";
export const FORMATOS: readonly Formato[] = ["viejo-contexto", "viejo-handoff", "viejo-con-tasks", "v1", "ilegible"];

/**
 * Los que frenan el deploy de E2b. El v1 ya no frena: desde E2b todo v1 se lee, y lo escriben también
 * el handoff y «Regenerar» de una fase. El viejo del handoff tampoco: su lector vive hasta E4.
 * Sí frenan el viejo de «contexto» (E2b borra la cadena que lo seguía), el viejo con `tasks` y lo
 * ilegible.
 */
export const FRENAN_EL_DEPLOY: readonly Formato[] = ["viejo-contexto", "viejo-con-tasks", "ilegible"];

/**
 * E4: los que frenan el deploy que retira el lector del formato viejo (P4). Todo menos el v1: desde P4
 * lo guardado se lee solo si es `borrador-v1`, y el resto queda como «propuesta que no se sabe leer».
 */
export const FRENAN_ANTES_DE_E4: readonly Formato[] = ["viejo-handoff", "viejo-contexto", "viejo-con-tasks", "ilegible"];

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * ¿Es el formato viejo (`ProposalLike`)? Un objeto que no es `borrador-v1` y trae `phases` en un
 * array; no mira qué hay adentro. No usa el lector de borrador.ts a propósito: desde P4 aquél ya no
 * conoce el formato viejo, y este script es el único que lo sabe clasificar.
 */
export function esPropuestaVieja(json: unknown): json is Record<string, unknown> & { phases: unknown[] } {
  return esObjeto(json) && json.formato !== FORMATO_BORRADOR && Array.isArray(json.phases);
}

/** En qué formato está lo guardado. */
export function formatoDe(json: unknown): Formato {
  if (esBorradorV1(json)) return "v1";
  if (!esPropuestaVieja(json)) return "ilegible";
  // Alguna fase con `tasks` (o que no es un objeto): la vista previa del modificador, no un borrador.
  if (!json.phases.every((f) => esObjeto(f) && f.tasks === undefined)) return "viejo-con-tasks";
  return origenDePropuesta(json as { origen?: unknown }) === "contexto" ? "viejo-contexto" : "viejo-handoff";
}

/** E3: los tipos de cambio que solo escribe E3 (los dicta el chat). */
export const TIPOS_DE_E3: readonly string[] = ["tarea-cambia", "fase-se-va"];

/**
 * E3: ¿el v1 trae algo que E2c no maneja bien? Un tipo de E3 (E2c lo lee como desconocido y bloquea),
 * `excluidos` no vacío o algún `porChat`. Los dos últimos E2c los ignora en silencio: una pantalla
 * vieja volvería a marcar lo desmarcado en otra computadora, y aplicaría lo del chat con la vara de la
 * IA. La vuelta atrás a E2c (`--desde-e3`) limpia estos. Se mira el JSON crudo.
 */
export function traeAlgoDeE3(json: unknown): boolean {
  if (!esBorradorV1(json)) return false;
  if (Array.isArray(json.excluidos) && json.excluidos.length > 0) return true;
  const cambios = Array.isArray(json.cambios) ? json.cambios : [];
  return cambios.some((c) => {
    const x = c as { tipo?: unknown; porChat?: unknown } | null;
    return (typeof x?.tipo === "string" && TIPOS_DE_E3.includes(x.tipo)) || x?.porChat === true;
  });
}

/**
 * ¿Es un v1 «solo de fases»? No espera tareas (`tareas` null o ausente) y no trae ningún cambio
 * `tarea-*`. Así lo escribe el handoff desde E2b, y E1 lo lee bien: son sus cuatro tipos de cambio.
 * La vuelta atrás lo deja; limpiarlo tiraría sugerencias del handoff que nadie revisó.
 * Se mira el JSON crudo: un `tarea-*` que esta versión no conoce (el lector lo descarta como
 * desconocido) igual cuenta. E3: uno del handoff que el chat tocó (una fase que se va, casillas
 * guardadas, algo `porChat`) ya no lo lee bien E1: tampoco es «solo de fases».
 */
export function esV1SoloDeFases(json: unknown): boolean {
  if (!esBorradorV1(json)) return false;
  if (json.tareas !== null && json.tareas !== undefined) return false;
  if (traeAlgoDeE3(json)) return false;
  const cambios = Array.isArray(json.cambios) ? json.cambios : [];
  return !cambios.some((c) => {
    const tipo = (c as { tipo?: unknown } | null)?.tipo;
    return typeof tipo === "string" && tipo.startsWith("tarea-");
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ── E4 P3: LA CONVERSIÓN DE LAS VIEJAS DEL HANDOFF ───────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Una fila de `TimelineEvent`, con lo que hace falta para desandar el cronograma. */
export interface EventoDelCronograma {
  entityType: string;
  entityId: string | null;
  action: string;
  before: unknown;
  createdAt: Date;
}

/** Una fase viva con su `order` tal como está en la base (el que guardan los eventos). */
export type FaseConOrden = FaseViva & { order: number };
/** Lo vivo con el `order` de cada fase. Sirve donde se pide un `Vivo`. */
export interface VivoConOrden {
  ancla: string | null;
  fases: FaseConOrden[];
}

/** Los campos que se desandan, y qué valor vale en cada uno. `notes` no: no tiene evento. */
const CAMPOS_CON_EVENTO = {
  name: (v: unknown) => typeof v === "string" && v.trim().length > 0,
  durationWeeks: (v: unknown) => typeof v === "number" && Number.isFinite(v),
  startWeek: (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v)),
  sessionCount: (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v)),
  activityType: (v: unknown) => v === null || typeof v === "string",
  order: (v: unknown) => typeof v === "number" && Number.isFinite(v),
} as const;
type CampoConEvento = keyof typeof CAMPOS_CON_EVENTO;

const esArranque = (v: unknown): v is string | null => v === null || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v));

/**
 * Lo vivo DESANDADO hasta `creada`. Puro. Solo cuentan los eventos con `createdAt > creada`, en orden:
 *   · las fases: las vivas, menos las que tienen un PHASE CREATED posterior. Las que se borraron
 *     después no entran: sus sugerencias ya no se pueden aplicar (computeProposalDeltas las salta);
 *   · cada campo sale del `before` del PRIMER PHASE EDITED/MOVED posterior que lo trae. Si no hay, del
 *     valor vivo. Si ese primero trae un valor que no vale, también del vivo: un evento roto deja el
 *     campo como lo de hoy, igual que una edición sin evento (los eventos son de mejor esfuerzo);
 *   · la nota es la viva;
 *   · el orden: por el `order` reconstruido; en un empate, el orden vivo;
 *   · el arranque: el `before.anchorStartDate` del primer TIMELINE ANCHOR_CHANGED posterior, o el vivo.
 * La foto sale sin tareas ni estado: la conversión del handoff solo mira las fases.
 */
export function fotoAlCrearse(i: { vivo: VivoConOrden; creada: Date; eventos: readonly EventoDelCronograma[] }): Vivo {
  const desde = i.creada.getTime();
  const posteriores = i.eventos
    .filter((e) => e.createdAt.getTime() > desde)
    .map((e, k) => ({ e, k }))
    .sort((a, b) => a.e.createdAt.getTime() - b.e.createdAt.getTime() || a.k - b.k)
    .map((x) => x.e);

  const creadasDespues = new Set(
    posteriores.filter((e) => e.entityType === "PHASE" && e.action === "CREATED" && e.entityId).map((e) => e.entityId),
  );
  const ediciones = posteriores.filter((e) => e.entityType === "PHASE" && (e.action === "EDITED" || e.action === "MOVED"));

  /** El valor del campo el día en que se creó: el `before` del primer evento que lo trae, o el vivo. */
  function alCrearse<C extends CampoConEvento>(fase: FaseConOrden, campo: C): FaseConOrden[C] {
    const primero = ediciones.find(
      (e) => e.entityId === fase.id && esObjeto(e.before) && Object.prototype.hasOwnProperty.call(e.before, campo),
    );
    if (!primero) return fase[campo];
    const valor = (primero.before as Record<string, unknown>)[campo];
    return CAMPOS_CON_EVENTO[campo](valor) ? (valor as FaseConOrden[C]) : fase[campo];
  }

  const fases = i.vivo.fases
    .map((f, puesto) => ({ f, puesto }))
    .filter(({ f }) => !creadasDespues.has(f.id))
    .map(({ f, puesto }) => ({
      puesto,
      order: alCrearse(f, "order"),
      fase: {
        id: f.id,
        name: alCrearse(f, "name"),
        durationWeeks: alCrearse(f, "durationWeeks"),
        startWeek: alCrearse(f, "startWeek"),
        sessionCount: alCrearse(f, "sessionCount"),
        notes: f.notes,
        activityType: alCrearse(f, "activityType"),
      } satisfies FaseViva,
    }))
    .sort((a, b) => a.order - b.order || a.puesto - b.puesto)
    .map((x) => x.fase);

  const cambioDeArranque = posteriores.find(
    (e) =>
      e.entityType === "TIMELINE" &&
      e.action === "ANCHOR_CHANGED" &&
      esObjeto(e.before) &&
      Object.prototype.hasOwnProperty.call(e.before, "anchorStartDate"),
  );
  const arranqueAntes = cambioDeArranque ? (cambioDeArranque.before as Record<string, unknown>).anchorStartDate : undefined;
  const ancla = cambioDeArranque && esArranque(arranqueAntes) ? arranqueAntes : i.vivo.ancla;

  return { ancla, fases };
}

export type ConversionDeLaVieja =
  | { tipo: "sin-fecha" }
  | { tipo: "nada-que-decidir"; porque: string }
  | { tipo: "convertida"; borrador: Borrador; plan: PlanDeAplicacion };

/**
 * Qué pasa con una vieja del handoff (solo ese formato: con otro, tira). Puro.
 *   · sin fecha de creación (sin token o sin su corrida) → «sin-fecha»: no se sabe contra qué convertir;
 *   · si no, se convierte con el conversor exacto del handoff contra la foto del día en que se creó.
 *     Sin cambios, o con todo «ya está» contra lo de HOY → «nada-que-decidir». Un choque no cuenta:
 *     el CSE tiene que verlo;
 *   · si no → «convertida», con su plan contra lo de hoy.
 * No escribe `excluidos` ni nada del chat: la protección la da el `desde`, que es del servidor.
 */
export function convertirLaVieja(i: {
  json: unknown;
  vivoHoy: VivoConOrden;
  creada: Date | null;
  eventos: readonly EventoDelCronograma[];
  nuevaClave?: () => string;
}): ConversionDeLaVieja {
  if (formatoDe(i.json) !== "viejo-handoff") {
    throw new Error(`convertirLaVieja: solo convierte el formato viejo del handoff (esta es «${formatoDe(i.json)}»)`);
  }
  if (i.creada === null) return { tipo: "sin-fecha" };
  const foto = fotoAlCrearse({ vivo: i.vivoHoy, creada: i.creada, eventos: i.eventos });
  const borrador = convertirDelHandoff({ propuesta: i.json as unknown as ProposalLike, vivo: foto, nuevaClave: i.nuevaClave });
  if (borrador.cambios.length === 0) {
    return { tipo: "nada-que-decidir", porque: "no cambia nada del cronograma del día en que se creó" };
  }
  const plan = planDeAplicacion(i.vivoHoy, borrador);
  if (debeDescartarseSolo(plan)) return { tipo: "nada-que-decidir", porque: "todo lo que propone ya está así" };
  return { tipo: "convertida", borrador, plan };
}

/** La línea del listado de cada vieja del handoff: qué dejaría la conversión. */
export function lineaDelListado(r: ConversionDeLaVieja): string {
  switch (r.tipo) {
    case "sin-fecha":
      return "sin fecha de creación (sin token o sin su corrida): decídela en su barra";
    case "nada-que-decidir":
      return "si se convierte: no deja nada por decidir";
    case "convertida": {
      const n = (estado: string) => r.plan.items.filter((it) => it.estado === estado).length;
      return `si se convierte: ${n("aplica")} aplican · ${n("choque")} con ⚠ · ${n("ya-esta")} ya están`;
    }
  }
}

/** Lo que imprime `--convertir-viejas` de UNA vieja: la lista numerada, como la verá el CSE, y el resultado. */
export function detalleDeLaConversion(vivoHoy: Vivo, r: ConversionDeLaVieja): string[] {
  switch (r.tipo) {
    case "sin-fecha":
      return ["⛔ sin fecha de creación: no se convierte. Decídela en su barra."];
    case "nada-que-decidir":
      return [`no deja nada por decidir: se limpia (${r.porque}).`];
    case "convertida": {
      const lineas = resumir(vivoHoy, r.borrador).items.map(
        (it) => `${it.numero}. ${it.titulo} — ${it.estado === "choque" ? (it.aviso ?? "⚠") : it.estado === "ya-esta" ? "ya está" : "aplica"}`,
      );
      return [...lineas, `se convierte: ${r.borrador.cambios.length} cambios, ${r.plan.choques} con ⚠.`];
    }
  }
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «12 ago» (UTC, como el resto del listado). */
export const diaYMes = (d: Date): string => `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;

/**
 * Dónde se guarda lo que la conversión va a escribir, ANTES de escribir:
 * `<raiz>/<AAAA-MM-DD>-propuestas-abiertas/viejas-convertidas.<HHMMSS>.json`, en hora local (la que
 * ve la persona en el explorador), junto al respaldo de pg_dump del mismo día.
 */
export function rutaDelRespaldoDeViejas(ahora: Date, raiz = "backups"): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const fecha = `${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}`;
  const hora = `${p(ahora.getHours())}${p(ahora.getMinutes())}${p(ahora.getSeconds())}`;
  return join(raiz, `${fecha}-propuestas-abiertas`, `viejas-convertidas.${hora}.json`);
}

/**
 * Una fila de la conversión: lo que había (`original`, la vieja tal cual se leyó) y lo que se escribe
 * (`convertida`, o null si no dejaba nada por decidir y se limpia). Es también lo que guarda el
 * respaldo JSON y lo que lee `--deshacer-conversion`.
 */
export interface EntradaDeLaConversion {
  projectId: string;
  timelineId: string;
  token: string;
  original: unknown;
  convertida: Borrador | Record<string, unknown> | null;
}

const esTexto = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/**
 * El respaldo de una conversión, validado para `--deshacer-conversion`. Cada fila tiene que traer su
 * proyecto, su cronograma y su token; un `original` en el formato viejo del handoff, y una `convertida`
 * que es un `borrador-v1` o null. Si una sola no vale, no se devuelve nada.
 */
export function leerRespaldoDeViejas(texto: string): { entradas: EntradaDeLaConversion[] } | { error: string } {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return { error: "el archivo no es un JSON" };
  }
  if (!Array.isArray(json)) return { error: "el archivo no es una lista de filas" };
  const entradas: EntradaDeLaConversion[] = [];
  for (const [n, f] of json.entries()) {
    if (!esObjeto(f) || !esTexto(f.projectId) || !esTexto(f.timelineId) || !esTexto(f.token)) {
      return { error: `la fila ${n + 1} no trae su proyecto, su cronograma y su token` };
    }
    if (formatoDe(f.original) !== "viejo-handoff") return { error: `la fila ${n + 1} no trae la propuesta vieja del handoff` };
    if (f.convertida !== null && !esBorradorV1(f.convertida)) return { error: `la fila ${n + 1} no trae un borrador-v1 ni null` };
    entradas.push({ projectId: f.projectId, timelineId: f.timelineId, token: f.token, original: f.original, convertida: f.convertida });
  }
  return { entradas };
}
