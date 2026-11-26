/**
 * lib/clients/unidades.ts — «Unidades de negocio» de Información del cliente (2026-11-26). PURO.
 *
 * La pestaña donde Customer Success ve las unidades de una empresa (las fichas que cuelgan de la principal por
 * `Client.comparteDominioConId`: TEC · AE y TEC · TAE, Cemaco · Costa Rica y Cemaco · Ecuador), les cambia las siglas o
 * el dominio, y agrega una unidad nueva. Diseño aprobado por Elías el 26 nov (lienzo «Unidades de negocio»); DECISIONS
 * «Una empresa con varias unidades» › «La pestaña».
 *
 * Este módulo decide, sin base:
 *  · quién puede hacer qué (crear, separar y cambiar siglas o dominio: todo Customer Success; juntar: Super Admin o la CSL);
 *  · si las siglas y los dominios que pide una persona valen (`leerFicha`);
 *  · qué hace el guardado con cada reunión que cambia de ficha y con cada proyecto que pasa a la unidad nueva
 *    (`planDeLaMudanza`). Las reuniones las decide el resolver único (lib/sessions/categorize.ts) con las fichas como
 *    quedarán: acá solo se lee lo que dice y se protege lo que decidió una persona.
 * Lo escribe lib/clients/unidades-server.ts.
 */
import type { AjustarFichas } from "@/lib/sessions/resolve-client";
import { normalizarDominio, normalizarSigla } from "./siglas-y-dominios";

// ── Quién puede ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Crear o separar unidades y cambiarles las siglas o el dominio: todo Customer Success (Elías, 26 nov), y el Super Admin. */
export const puedeEditarUnidades = (rol: string | null | undefined): boolean => rol === "CSE" || rol === "CSL" || rol === "SUPER_ADMIN";

/** Juntar unidades: solo el Super Admin o la CSL, siempre con simulacro primero (Elías, 26 nov). */
export const puedeJuntarUnidades = (rol: string | null | undefined): boolean => rol === "SUPER_ADMIN" || rol === "CSL";

// ── Las fichas ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Una ficha de la empresa, lo que hace falta para validar un cambio. */
export interface FichaDeLaEmpresaConLlaves {
  id: string;
  nombre: string;
  siglas: readonly string[];
  dominios: readonly string[];
  principal: boolean;
}

/** El id con que la unidad nueva aparece en la vista previa, antes de existir. */
export const ID_DE_LA_UNIDAD_NUEVA = "unidad-nueva";

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export type FichaLeida =
  | { ok: true; nombre: string; siglas: string[]; dominios: string[] }
  | { ok: false; error: string };

/**
 * Las siglas y los dominios que pide una persona, como quedarían escritos, o por qué no valen. `esta`: el id de la ficha
 * que se edita (null = la unidad nueva). `dominioDeOtra(d)`: el nombre de la ficha de OTRA empresa que ya tiene ese
 * dominio, o null (INV37: dos fichas con el mismo dominio se reparten las reuniones al azar).
 */
export function leerFicha(
  pedido: { nombre?: string | null; siglas: readonly string[]; dominios: readonly string[] },
  o: { empresa: readonly FichaDeLaEmpresaConLlaves[]; esta: string | null; dominioDeOtra: (dominio: string) => string | null },
): FichaLeida {
  const esta = o.esta ? o.empresa.find((f) => f.id === o.esta) : null;
  if (o.esta && !esta) return { ok: false, error: "Esa ficha no es de esta empresa." };
  const otras = o.empresa.filter((f) => f.id !== o.esta);
  const principal = o.empresa.find((f) => f.principal);

  const nombre = (pedido.nombre ?? esta?.nombre ?? "").replace(/\s+/g, " ").trim();
  if (!esta) {
    if (nombre.length < 2) return { ok: false, error: "Ponle un nombre a la unidad." };
    if (nombre.length > 120) return { ok: false, error: "El nombre es demasiado largo." };
    if (otras.some((f) => normal(f.nombre) === normal(nombre))) return { ok: false, error: `Ya hay una ficha que se llama «${nombre}».` };
  }

  const siglas: string[] = [];
  for (const s of pedido.siglas) {
    if (!s.trim()) continue;
    const x = normalizarSigla(s);
    if (!x) return { ok: false, error: `«${s.trim()}» es muy corta: una sigla tiene al menos 2 letras.` };
    if (!siglas.includes(x)) siglas.push(x);
  }
  for (const s of siglas) {
    const deOtra = otras.find((f) => f.siglas.some((x) => x.toUpperCase() === s));
    if (deOtra) return { ok: false, error: `La sigla ${s} ya es de «${deOtra.nombre}».` };
  }

  const dominios: string[] = [];
  for (const d of pedido.dominios) {
    if (!d.trim()) continue;
    const x = normalizarDominio(d);
    if (!x) return { ok: false, error: `«${d.trim()}» no es un dominio (algo como empresa.com).` };
    if (!dominios.includes(x)) dominios.push(x);
  }
  const esPrincipal = esta?.principal ?? false;
  for (const d of dominios) {
    if (!esPrincipal && principal?.dominios.some((x) => x.toLowerCase() === d)) {
      return {
        ok: false,
        error: `${d} es el dominio de «${principal.nombre}». Si la unidad usa ese mismo dominio, déjala sin dominio propio: comparte el de la principal.`,
      };
    }
    const deLaEmpresa = otras.find((f) => !f.principal && f.dominios.some((x) => x.toLowerCase() === d));
    if (deLaEmpresa) return { ok: false, error: `${d} ya es el dominio de «${deLaEmpresa.nombre}».` };
    const deOtra = o.dominioDeOtra(d);
    if (deOtra) return { ok: false, error: `${d} ya es el dominio de «${deOtra}», que no es de esta empresa.` };
  }
  if (esPrincipal && dominios.length === 0 && o.empresa.length > 1) {
    return { ok: false, error: "La principal tiene que quedarse con al menos un dominio: es el que comparten sus unidades." };
  }
  if (!esPrincipal && siglas.length === 0 && dominios.length === 0) {
    return {
      ok: false,
      error: "Ponle al menos una sigla o un dominio propio: sin eso, Nexus no tiene cómo saber qué reuniones son de esta unidad.",
    };
  }
  return { ok: true, nombre, siglas, dominios };
}

/**
 * El cambio en memoria para la vista previa (lib/sessions/resolve-client.ts › `AjustarFichas`): la ficha que se edita con
 * sus siglas y dominios nuevos, o la unidad nueva al final de la lista (es la más nueva: el orden de atribuir es por
 * antigüedad).
 */
export function ajusteDeLasFichas(c: {
  /** La ficha que se edita; sin él, la unidad nueva. */
  id?: string;
  nombre: string;
  siglas: readonly string[];
  dominios: readonly string[];
  /** La principal, para la unidad nueva. */
  principalId: string;
}): AjustarFichas {
  return (clients) => {
    if (c.id) return clients.map((x) => (x.id === c.id ? { ...x, siglas: [...c.siglas], emailDomains: [...c.dominios] } : x));
    const nueva = {
      id: ID_DE_LA_UNIDAD_NUEVA,
      name: c.nombre,
      company: null,
      emailDomains: [...c.dominios],
      hubspotCompanyId: null,
      siglas: [...c.siglas],
      comparteDominioConId: c.principalId,
    };
    return [...clients, nueva as unknown as (typeof clients)[number]];
  };
}

// ── El guardado ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Una reunión que cambia de ficha según el resolver, con el cambio. `de`/`a` null = por decidir. */
export interface ReunionDeLaVista {
  sessionId: string;
  title: string;
  date: Date | string;
  de: string | null;
  a: string | null;
}

/** Un vínculo reunión–proyecto que importa para el guardado. */
export interface VinculoDeLaVista {
  sessionId: string;
  projectId: string;
  isPrimary: boolean;
  /** Lo puso, lo revisó, lo excluyó o lo eligió para un documento una persona (`isLockedLink`). */
  conCandado: boolean;
  /** Los documentos para los que una persona eligió esta reunión en ese proyecto («Diagnóstico de Cemaco · Ecuador»). */
  elegidaPara: readonly string[];
}

/** Qué hace el guardado con una reunión. */
export type ComoQueda =
  /** Va adonde dice el resolver. */
  | "se-mueve"
  /** Se queda donde está: tiene un vínculo que puso una persona con un proyecto de su ficha (por defecto, se protege). */
  | "se-queda"
  /** Va a la ficha que eligió la persona en la vista previa (queda asignada a mano). */
  | "asignada"
  /** Quedaría por decidir con un vínculo que puso una persona: hay que elegir su ficha para poder guardar. */
  | "falta-elegir"
  /** No cambia de ficha, pero es de un proyecto que pasa a la unidad: se muestra para poder elegirle la unidad. */
  | "sigue";

export interface FilaDeLaMudanza extends ReunionDeLaVista {
  como: ComoQueda;
  /** La ficha donde termina (null = por decidir). */
  final: string | null;
  /** Tiene un vínculo de una persona con un proyecto de otra ficha que la mudanza que propone Nexus soltaría. */
  conVinculoDeUnaPersona: boolean;
  elegidaPara: string[];
  /**
   * Solo en una «asignada»: los documentos o vínculos de una persona que pierde en la ficha que se eligió (con proyectos
   * que no quedan allá). Vacío si no pierde nada. La pantalla lo avisa antes de guardar.
   */
  pierde: string[];
}

export interface ProyectoQuePasa {
  projectId: string;
  /** Reuniones del proyecto (como principal o con un vínculo de una persona) que no terminan en la unidad: frenan el pase. */
  frenadoPor: { sessionId: string; title: string }[];
}

export interface PlanDeLaMudanza {
  filas: FilaDeLaMudanza[];
  /** Hay que elegir la ficha de estas reuniones antes de guardar. */
  faltaElegir: string[];
  /** Las que mueve el resolver: lo que se le pasa como `aprobadas` (sessionId → de, a). */
  aprobadas: Map<string, { de: string | null; a: string | null }>;
  /** Las que quedan asignadas a mano (sessionId → ficha): las que eligió la persona y las que se protegen. */
  fijar: Map<string, string>;
  proyectos: ProyectoQuePasa[];
  /** Vínculos que puso Nexus (sin candado, secundarios) de reuniones que no van a la unidad con un proyecto que pasa. */
  sueltan: { sessionId: string; projectId: string }[];
  /** ¿Se puede guardar así? */
  listo: boolean;
}

/**
 * Qué hace el guardado con cada reunión y cada proyecto que pasa. Reglas (DECISIONS «Una empresa con varias unidades»):
 *  · Una reunión va adonde dice el resolver, salvo que tenga un vínculo que puso una persona (o una elección para un
 *    documento) con un proyecto que queda en OTRA ficha: mudarla soltaría esa decisión. Por defecto se queda donde está
 *    (asignada a mano a su ficha de hoy); la persona puede dejarla ir (`moverIgual`) o elegirle otra ficha (`asignar`).
 *  · Si quedaría por decidir con un vínculo así, el guardado espera a que alguien elija su ficha (`falta-elegir`).
 *  · Un proyecto que pasa a la unidad lleva sus reuniones: si una reunión suya, como principal o con un vínculo de una
 *    persona, no termina en la unidad, el proyecto no puede pasar (`frenadoPor`). Los vínculos que puso Nexus de reuniones
 *    que se quedan se sueltan.
 * `cambian` trae también, con `de` igual a `a`, las reuniones de un proyecto que pasa que el resolver no mueve: salen como
 * «sigue» para que la persona pueda elegirles la unidad. `fichaDelProyecto`: la ficha de hoy de cada proyecto vinculado. `actual`: la ficha de hoy de las reuniones de los
 * proyectos que pasan que el resolver no mueve.
 */
export function planDeLaMudanza(o: {
  cambian: readonly ReunionDeLaVista[];
  vinculos: readonly VinculoDeLaVista[];
  fichaDelProyecto: ReadonlyMap<string, string>;
  pasan: ReadonlySet<string>;
  /** Adónde van los proyectos que pasan (la unidad nueva). */
  unidad: string | null;
  actual: ReadonlyMap<string, { title: string; resolvedClientId: string | null }>;
  asignar: ReadonlyMap<string, string>;
  moverIgual: ReadonlySet<string>;
}): PlanDeLaMudanza {
  const fichaDespues = (projectId: string) => (o.pasan.has(projectId) && o.unidad ? o.unidad : (o.fichaDelProyecto.get(projectId) ?? null));
  const vinculosDe = new Map<string, VinculoDeLaVista[]>();
  for (const v of o.vinculos) vinculosDe.set(v.sessionId, [...(vinculosDe.get(v.sessionId) ?? []), v]);

  const filas: FilaDeLaMudanza[] = [];
  const aprobadas = new Map<string, { de: string | null; a: string | null }>();
  const fijar = new Map<string, string>();
  const faltaElegir: string[] = [];
  for (const c of o.cambian) {
    const suyos = vinculosDe.get(c.sessionId) ?? [];
    /* Los vínculos de una persona con proyectos que NO quedan en la ficha `hacia`: mudarla allá los soltaría. */
    const ajenosHacia = (hacia: string | null) =>
      suyos.filter((v) => v.conCandado && o.fichaDelProyecto.has(v.projectId) && fichaDespues(v.projectId) !== hacia);
    const ajenos = ajenosHacia(c.a);
    const elegidaPara = [...new Set(ajenos.flatMap((v) => v.elegidaPara))];
    const base = { ...c, conVinculoDeUnaPersona: ajenos.length > 0, elegidaPara, pierde: [] as string[] };
    const elegida = o.asignar.get(c.sessionId);
    if (elegida) {
      /* La eligió la persona: se respeta, pero lo que pierde allá (si su ficha de hoy no es esa) se le muestra. */
      const pierden = elegida === c.de ? [] : ajenosHacia(elegida);
      const pierde = [...new Set(pierden.flatMap((v) => (v.elegidaPara.length ? v.elegidaPara : [`un vínculo que puso una persona`])))];
      filas.push({ ...base, como: "asignada", final: elegida, pierde });
      fijar.set(c.sessionId, elegida);
      continue;
    }
    /* Una que el resolver no mueve (de un proyecto que pasa): sigue donde está, sin proteger nada. */
    if (c.de === c.a) {
      filas.push({ ...base, conVinculoDeUnaPersona: false, elegidaPara: [], como: "sigue", final: c.de });
      continue;
    }
    /* Quedaría por decidir, o hoy no tiene ficha (no hay dónde dejarla asignada): hay que elegirle una. */
    if (ajenos.length && (c.a === null || c.de === null)) {
      filas.push({ ...base, como: "falta-elegir", final: null });
      faltaElegir.push(c.sessionId);
      continue;
    }
    if (ajenos.length && !o.moverIgual.has(c.sessionId)) {
      filas.push({ ...base, como: "se-queda", final: c.de });
      fijar.set(c.sessionId, c.de!);
      continue;
    }
    filas.push({ ...base, como: "se-mueve", final: c.a });
    aprobadas.set(c.sessionId, { de: c.de, a: c.a });
  }

  const finalDe = new Map(filas.map((f) => [f.sessionId, f.final]));
  const proyectos: ProyectoQuePasa[] = [];
  const sueltan: { sessionId: string; projectId: string }[] = [];
  for (const projectId of o.pasan) {
    const frenadoPor: { sessionId: string; title: string }[] = [];
    for (const v of o.vinculos) {
      if (v.projectId !== projectId) continue;
      const termina = finalDe.has(v.sessionId) ? finalDe.get(v.sessionId)! : (o.actual.get(v.sessionId)?.resolvedClientId ?? null);
      if (termina === o.unidad) continue;
      if (v.isPrimary || v.conCandado) {
        const title = filas.find((f) => f.sessionId === v.sessionId)?.title ?? o.actual.get(v.sessionId)?.title ?? v.sessionId;
        if (!frenadoPor.some((x) => x.sessionId === v.sessionId)) frenadoPor.push({ sessionId: v.sessionId, title });
      } else {
        sueltan.push({ sessionId: v.sessionId, projectId });
      }
    }
    proyectos.push({ projectId, frenadoPor });
  }
  return {
    filas,
    faltaElegir,
    aprobadas,
    fijar,
    proyectos,
    sueltan,
    listo: faltaElegir.length === 0 && proyectos.every((p) => p.frenadoPor.length === 0),
  };
}

/** Lo que dice una fila, en palabras de la pantalla. */
export const QUE_HACE: Record<ComoQueda, string> = {
  "se-mueve": "Cambia de ficha",
  "se-queda": "Se queda donde está",
  asignada: "La eliges tú",
  "falta-elegir": "Elige su ficha",
  sigue: "Sigue donde está",
};

// ── Lo que cuelga de un proyecto que pasa a una unidad ────────────────────────────────────────────────────────────────

/**
 * Las tablas con `clientId` y `projectId` cuyas filas del proyecto pasan con él a la unidad (la regla de
 * separar-en-unidades: «con su proyecto»). La prueba `unidades.test.ts` lee el schema y se pone roja si una tabla con las
 * dos columnas no está en esta lista ni en `NO_SE_MUDAN_CON_EL_PROYECTO`.
 */
export const SE_MUDAN_CON_EL_PROYECTO = [
  "Handoff",
  "ProjectCanvas",
  "StageNote",
  "ClientDocument",
  "ClientContextCard",
  "AgentRun",
  "LlmCall",
  "PedidoEnLote",
  "ExploracionDeVenta",
  "ActionItem",
  "PedidoFueraDeAlcance",
  "TimelineEvent",
  "CsAlert",
  "HiloDeChat",
  "PreguntaDeTiempo",
  "ProyectoDeTareas",
  "Tarea",
  "TareaVinculo",
  "HechoDeReunion",
  "CasoDeUso",
  "NotaDeLaCuenta",
  "VersionDeLaEscala",
] as const;

/** Las que tienen las dos columnas y NO se mudan con el proyecto, con el porqué. Vacía hoy. */
export const NO_SE_MUDAN_CON_EL_PROYECTO: Readonly<Record<string, string>> = {};
