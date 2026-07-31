/**
 * lib/projects/scope.ts — QUÉ PROYECTOS entran a cada pantalla. Un solo lugar.
 *
 * La pregunta "¿este proyecto cuenta?" se respondía COPIADA en cuatro lugares canónicos
 * (panel de cartera, cobranza, rail de proyectos, pestaña inicial) más media docena de
 * variantes. Y las copias ya habían divergido: ver el bug documentado abajo. Este archivo
 * las reemplaza por cuatro criterios con nombre, derivados de `lib/projects/kind.ts`.
 *
 * ── EL BUG QUE ESTABA VIVO ───────────────────────────────────────────────────
 * El rail de proyectos filtraba en SQL (`serviceType: { not: "__strategy__" }`) y la
 * pestaña inicial en JavaScript (`p.serviceType !== "__strategy__"`). En Postgres,
 * `serviceType <> '__strategy__'` es NULL cuando la columna es NULL, y una fila con
 * predicado NULL **no entra**; en JavaScript `null !== "__strategy__"` es `true` y sí
 * entra. O sea: un proyecto con `serviceType` nulo podía ser elegido como pestaña inicial
 * SIN existir en el rail — exactamente lo que el comentario del layout dice prevenir.
 *
 * De ahí sale la regla de oro de este archivo: **todo predicado se escribe en POSITIVO**.
 * Cada vez que aparece un `not` / `notIn` sobre una columna nullable hay que pensar en los
 * NULL, y pensar en los NULL es justo lo que no pasa cuando el filtro se copia.
 *
 * ── POR QUÉ HAY DOS FORMAS DE CADA CRITERIO ──────────────────────────────────
 * Un fragmento de Prisma y un predicado en memoria son dos implementaciones de la misma
 * regla, y dos implementaciones divergen. Acá no pueden: cada criterio es un ÁTOMO que
 * declara las dos formas **una al lado de la otra**, y los cuatro criterios se arman
 * componiendo los mismos átomos. Si alguien toca uno, toca los dos. La guarda de
 * integración (`scope.test.ts`) además los enfrenta contra una base de verdad.
 */
import type { Prisma } from "@prisma/client";
import { PROJECT_PIPELINES, SENTINEL_SERVICE_TYPE } from "./kind";
import { ESTADOS_DE_ALTA, altaEnCurso, altaTerminada, parseEstadoDeAlta } from "./alta";

// ── Las formas mínimas que necesita un filtro en memoria ─────────────────────

/** Lo que hay que traer en el `select` para poder filtrar en memoria. */
export interface ProyectoParaFiltro {
  status: string;
  serviceType: string | null;
  hubspotServiceId: string | null;
  hubspotPipelineId: string | null;
  proyectoInterno: boolean;
  hermanoCsProjectId: string | null;
  /**
   * `Project.altaEstado` (Tanda C — ver `lib/projects/alta.ts`). `null` para todo lo que no
   * nació por el alta única, que es el 99%.
   *
   * Agregarlo acá NO es opcional aunque el filtro pudiera compilar sin él: el evaluador de
   * `scope.test.ts` tira un error con nombre y apellido si un fragmento menciona una columna
   * que esta interfaz no declara, justamente para que una condición nueva no quede sin
   * cobertura.
   */
  altaEstado: string | null;
}

/**
 * La regla de HubSpot es del CLIENTE, no del proyecto: un cliente con portal solo muestra
 * proyectos sincronizados. Por eso los predicados que la incluyen piden el cliente aparte —
 * y por eso las dos pantallas divergían, porque una lo tenía a mano y la otra no.
 */
export interface ClienteParaFiltro {
  hubspotCompanyId: string | null;
  tieneHubspotAccount: boolean;
}

// ── Los átomos ───────────────────────────────────────────────────────────────

/** Átomo que solo mira el proyecto. */
interface CriterioDeProyecto {
  nombre: string;
  where: Prisma.ProjectWhereInput;
  cumple: (p: ProyectoParaFiltro) => boolean;
}

/** Átomo que además necesita el cliente. Un `CriterioDeProyecto` sirve donde va uno de éstos. */
interface CriterioDeCliente {
  nombre: string;
  where: Prisma.ProjectWhereInput;
  cumple: (p: ProyectoParaFiltro, c: ClienteParaFiltro) => boolean;
}

const ACTIVO: CriterioDeProyecto = {
  nombre: "activo",
  where: { status: "active" },
  cumple: (p) => p.status === "active",
};

/**
 * No es el contenedor de "Información del cliente". La forma con `OR` es OBLIGATORIA:
 * `{ not: SENTINEL }` a secas descarta las filas con `serviceType` NULL, que NO son el
 * sentinel. Es el bug del encabezado.
 */
const NO_ES_SENTINEL: CriterioDeProyecto = {
  nombre: "no-es-sentinel",
  where: { OR: [{ serviceType: null }, { serviceType: { not: SENTINEL_SERVICE_TYPE } }] },
  cumple: (p) => p.serviceType !== SENTINEL_SERVICE_TYPE,
};

/**
 * Regla de HubSpot: un cliente CON portal muestra solo proyectos sincronizados (deja afuera
 * los stubs "Proyecto {id}" sin servicio); un cliente SIN portal muestra cualquiera.
 */
const RAMAS_REGLA_HUBSPOT: readonly Prisma.ProjectWhereInput[] = [
  { client: { hubspotCompanyId: null, hubspotAccount: { is: null } } },
  { hubspotServiceId: { not: null } },
];

const cumpleReglaHubspot = (p: ProyectoParaFiltro, c: ClienteParaFiltro) =>
  (c.hubspotCompanyId === null && !c.tieneHubspotAccount) || p.hubspotServiceId !== null;

const REGLA_HUBSPOT: CriterioDeCliente = {
  nombre: "regla-hubspot",
  where: { OR: [...RAMAS_REGLA_HUBSPOT] },
  cumple: cumpleReglaHubspot,
};

// ── Los átomos del ALTA (Tanda C) ────────────────────────────────────────────
// Las dos listas se DERIVAN de la tabla de verdad de `lib/projects/alta.ts`. Escritas a mano
// serían una tercera copia de la misma regla, y la que se olvidaría de actualizar.

const ESTADOS_EN_CURSO = ESTADOS_DE_ALTA.filter(altaEnCurso);
const ESTADOS_TERMINADOS = ESTADOS_DE_ALTA.filter(altaTerminada);

/**
 * El alta de este proyecto YA TERMINÓ. Entra a CARTERA y a FACTURABLE.
 *
 * ── LOS NULL SON EL 99%, Y POR ESO ESTÁ ESCRITO ASÍ ──────────────────────────
 * `{ altaEstado: { notIn: [...los en curso] } }` parece lo obvio y sería una catástrofe: en
 * SQL, `NOT IN` sobre una columna NULL vale NULL, y una fila con predicado NULL no entra en el
 * resultado. Como todo lo que existe hoy tiene `altaEstado` en NULL, ese filtro **vaciaría
 * cobranza y la cartera de un saque**. Es exactamente el bug del sentinel que encabeza este
 * archivo, sobre la columna con más NULL de la tabla.
 *
 * De ahí el `OR` con `null` explícito y el `in` en positivo.
 */
const ALTA_TERMINADA: CriterioDeProyecto = {
  nombre: "alta-terminada",
  where: { OR: [{ altaEstado: null }, { altaEstado: { in: [...ESTADOS_TERMINADOS] } }] },
  cumple: (p) => altaTerminada(parseEstadoDeAlta(p.altaEstado)),
};

/**
 * La regla de HubSpot, MÁS los proyectos con el alta todavía en curso. Reemplaza a
 * `REGLA_HUBSPOT` **solo dentro de NAVEGABLE**.
 *
 * ── POR QUÉ NO SE RELAJA LA REGLA, SE LE SUMA UNA RAMA ───────────────────────
 * `REGLA_HUBSPOT` existe para esconder los stubs "Proyecto {id}" de los clientes con portal, y
 * eso sigue haciendo falta. Lo que cambia es que un alta a medio hacer TAMBIÉN se ve —todavía
 * no tiene `hubspotServiceId`, que es justo el síntoma del problema que hay que ir a
 * arreglar—. Sin esta rama, el proyecto que acabás de crear es invisible en la única pantalla
 * desde la que se puede apretar "Reintentar".
 *
 * ⚠ NO resucita al contenedor "Información del cliente": ése queda afuera por `NO_ES_SENTINEL`,
 * que sigue en NAVEGABLE. La invariante de TRES lados de `scope.test.ts` lo exige.
 */
const REGLA_HUBSPOT_O_ALTA_EN_CURSO: CriterioDeCliente = {
  nombre: "regla-hubspot-o-alta-en-curso",
  where: { OR: [...RAMAS_REGLA_HUBSPOT, { altaEstado: { in: [...ESTADOS_EN_CURSO] } }] },
  cumple: (p, c) => cumpleReglaHubspot(p, c) || altaEnCurso(parseEstadoDeAlta(p.altaEstado)),
};

// ── Los átomos derivados del registro de pipelines ───────────────────────────
// Se calculan de `PROJECT_PIPELINES`: un pipeline nuevo cambia estas listas sin tocar
// una línea de acá. Son listas de EXCLUSIÓN, no de inclusión, y eso es lo que hace que un
// pipeline desconocido degrade al comportamiento legacy en vez de desaparecer.

const PIPELINES_SIN_CARTERA = PROJECT_PIPELINES.filter((p) => !p.base.carteraCs).map(
  (p) => p.hubspotPipelineId,
);
const PIPELINES_SIN_COBRANZA = PROJECT_PIPELINES.filter((p) => !p.base.cobranza).map(
  (p) => p.hubspotPipelineId,
);
const PIPELINES_QUE_PUEDEN_SER_HERMANOS = PROJECT_PIPELINES.filter((p) =>
  p.canBeSiblingOf.includes("customer-success"),
).map((p) => p.hubspotPipelineId);

/**
 * "El pipeline no está en esta lista". Mismo cuidado que el sentinel: `notIn` genera
 * `NOT IN (...)`, que en SQL descarta los NULL. El `OR` con `null` es lo que conserva a los
 * proyectos sin pipeline resuelto (sin backfill, o de un pipeline no declarado) — que es
 * justo la fila legacy de la tabla de decisiones.
 */
function pipelineFueraDe(ids: readonly string[]): Prisma.ProjectWhereInput {
  if (!ids.length) return {};
  return { OR: [{ hubspotPipelineId: null }, { hubspotPipelineId: { notIn: [...ids] } }] };
}

function pipelineNoEstaEn(p: ProyectoParaFiltro, ids: readonly string[]): boolean {
  return p.hubspotPipelineId === null || !ids.includes(p.hubspotPipelineId);
}

/** Pipeline que sí suma carga a la cartera de Customer Success. */
const CUENTA_PARA_CARTERA: CriterioDeProyecto = {
  nombre: "cuenta-para-cartera",
  where: pipelineFueraDe(PIPELINES_SIN_CARTERA),
  cumple: (p) => pipelineNoEstaEn(p, PIPELINES_SIN_CARTERA),
};

/** Pipeline que sí se factura cuando va solo. */
const PIPELINE_FACTURABLE: CriterioDeProyecto = {
  nombre: "pipeline-facturable",
  where: pipelineFueraDe(PIPELINES_SIN_COBRANZA),
  cumple: (p) => pipelineNoEstaEn(p, PIPELINES_SIN_COBRANZA),
};

/** No está marcado interno en HubSpot. La columna es NOT NULL, así que acá no hay trampa. */
const NO_ES_INTERNO: CriterioDeProyecto = {
  nombre: "no-es-interno",
  where: { proyectoInterno: false },
  cumple: (p) => p.proyectoInterno === false,
};

/**
 * No es HERMANO de una implementación de Customer Success. Un desarrollo o un sitio que
 * cuelga de una implementación no se factura aparte: cobra el hermano.
 *
 * Escrito como unión de tres condiciones POSITIVAS y no como `NOT (a AND b)`: la negación
 * de una conjunción con una columna nullable adentro se evalúa a NULL en SQL, y una fila con
 * predicado NULL se cae del resultado. Sería el mismo bug del sentinel, dos veces más difícil
 * de ver.
 */
const NO_ES_HERMANO_DE_CS: CriterioDeProyecto = {
  nombre: "no-es-hermano-de-cs",
  where: {
    OR: [
      { hermanoCsProjectId: null }, // no cuelga de nadie
      { hubspotPipelineId: null }, // pipeline desconocido → legacy
      ...(PIPELINES_QUE_PUEDEN_SER_HERMANOS.length
        ? [{ hubspotPipelineId: { notIn: [...PIPELINES_QUE_PUEDEN_SER_HERMANOS] } }]
        : []),
    ],
  },
  cumple: (p) =>
    p.hermanoCsProjectId === null || pipelineNoEstaEn(p, PIPELINES_QUE_PUEDEN_SER_HERMANOS),
};

// ── Composición ──────────────────────────────────────────────────────────────

function componer(criterios: readonly CriterioDeCliente[]): Prisma.ProjectWhereInput {
  return { AND: criterios.map((k) => k.where) };
}

/**
 * Compone el fragmento con condiciones EXTRA del caller (`clientId`, un `in` de ids…).
 *
 * ── Preferí SIEMPRE esta forma sobre spreadear la constante ───────────────────
 * `{ ...PROYECTO_DE_CARTERA_WHERE, AND: [lo mío] }` **pisa** el `AND` del fragmento y se
 * lleva puesto el criterio entero, en silencio y sin error de tipos: la consulta sigue
 * compilando y devuelve de más. Pasándolas por acá, las condiciones del caller entran
 * DENTRO del `AND`, así que pisar es imposible.
 */
function componerCon(
  criterios: readonly CriterioDeCliente[],
  extra?: Prisma.ProjectWhereInput,
): Prisma.ProjectWhereInput {
  return { AND: [...criterios.map((k) => k.where), ...(extra ? [extra] : [])] };
}

// ── LOS CUATRO CRITERIOS ─────────────────────────────────────────────────────

/**
 * NAVEGABLE — el rail de proyectos de la ficha y la pestaña inicial.
 *
 * Es el más ancho a propósito: `pestana` es `true` en TODAS las filas de la tabla de
 * decisiones. Nadie pierde acceso a su proyecto por esta tanda; la cuarentena es de
 * cobranza, cartera, vigilante y publicación, nunca de navegación.
 */
const NAVEGABLE: readonly CriterioDeCliente[] = [
  ACTIVO,
  NO_ES_SENTINEL,
  REGLA_HUBSPOT_O_ALTA_EN_CURSO,
];

/** DE CARTERA — el panel de cartera, Éxito del cliente, CS360 y el watchdog. */
const DE_CARTERA: readonly CriterioDeCliente[] = [
  ACTIVO,
  NO_ES_SENTINEL,
  REGLA_HUBSPOT,
  CUENTA_PARA_CARTERA,
  NO_ES_INTERNO,
  ALTA_TERMINADA,
];

/** FACTURABLE — el panel de Cobranza. */
const FACTURABLE: readonly CriterioDeCliente[] = [
  ACTIVO,
  NO_ES_SENTINEL,
  REGLA_HUBSPOT,
  PIPELINE_FACTURABLE,
  NO_ES_INTERNO,
  NO_ES_HERMANO_DE_CS,
  ALTA_TERMINADA,
];

/**
 * CLASIFICABLE — a qué proyectos se le puede colgar una sesión, y qué proyectos ve un
 * agente como contexto del cliente.
 *
 * **SIN la regla de HubSpot, a propósito**: un proyecto creado a mano en Nexus (sin
 * `hubspotServiceId`) es un destino perfectamente válido para una sesión. Y sin las reglas
 * de pipeline ni de interno: un desarrollo interno tiene sesiones como cualquier otro — es
 * justamente el caso SmartAgro que destapó todo esto.
 */
const CLASIFICABLE: readonly CriterioDeProyecto[] = [ACTIVO, NO_ES_SENTINEL];

export const PROYECTO_NAVEGABLE_WHERE = componer(NAVEGABLE);
export const PROYECTO_DE_CARTERA_WHERE = componer(DE_CARTERA);
export const PROYECTO_FACTURABLE_WHERE = componer(FACTURABLE);
export const PROYECTO_CLASIFICABLE_WHERE = componer(CLASIFICABLE);

export const proyectoNavegableWhere = (extra?: Prisma.ProjectWhereInput) =>
  componerCon(NAVEGABLE, extra);
export const proyectoDeCarteraWhere = (extra?: Prisma.ProjectWhereInput) =>
  componerCon(DE_CARTERA, extra);
export const proyectoFacturableWhere = (extra?: Prisma.ProjectWhereInput) =>
  componerCon(FACTURABLE, extra);
export const proyectoClasificableWhere = (extra?: Prisma.ProjectWhereInput) =>
  componerCon(CLASIFICABLE, extra);

// ── Los mismos criterios, en memoria ─────────────────────────────────────────
// Para listas ya cargadas (la pestaña inicial y el rail filtran sobre un array que ya
// vino de la base). Se arman de los MISMOS átomos: no pueden divergir del `where`.

export const esProyectoNavegable = (p: ProyectoParaFiltro, c: ClienteParaFiltro): boolean =>
  NAVEGABLE.every((k) => k.cumple(p, c));

export const esProyectoDeCartera = (p: ProyectoParaFiltro, c: ClienteParaFiltro): boolean =>
  DE_CARTERA.every((k) => k.cumple(p, c));

export const esProyectoFacturable = (p: ProyectoParaFiltro, c: ClienteParaFiltro): boolean =>
  FACTURABLE.every((k) => k.cumple(p, c));

export const esProyectoClasificable = (p: ProyectoParaFiltro): boolean =>
  CLASIFICABLE.every((k) => k.cumple(p));

/** Los nombres de los átomos de cada criterio — lo consume la guarda de cobertura. */
export const ATOMOS_POR_CRITERIO = {
  navegable: NAVEGABLE.map((k) => k.nombre),
  cartera: DE_CARTERA.map((k) => k.nombre),
  facturable: FACTURABLE.map((k) => k.nombre),
  clasificable: CLASIFICABLE.map((k) => k.nombre),
} as const;
