/**
 * lib/projects/scope-coverage.ts — QUIÉN PREGUNTA "¿este proyecto cuenta?" y CON QUÉ CRITERIO.
 *
 * Todo archivo que haga una consulta de VARIOS proyectos (`findMany`, `count`, `groupBy`,
 * `findFirst`, `updateMany`, `aggregate`) tiene que aparecer acá. El test que acompaña a
 * este registro escanea el repo y falla si alguno no está declarado.
 *
 * ── POR QUÉ ES OBLIGATORIO Y NO UNA CONVENCIÓN ───────────────────────────────
 * Así nacieron las cuatro copias del filtro que esta tanda vino a borrar: alguien escribió
 * una pantalla nueva, necesitó "los proyectos reales", y lo resolvió escribiendo el criterio
 * a mano. No fue negligencia — no había dónde importarlo y nadie se enteró. Un comentario
 * pidiendo disciplina no lo hubiera evitado; una lista que hay que actualizar para que el
 * build pase, sí.
 *
 * La séptima pantalla, dentro de seis meses, va a chocar contra este archivo. Ése es el
 * único mecanismo que hace que el diseño escale más allá de esta semana.
 */

/** Los cuatro criterios de `lib/projects/scope.ts`. */
export type Criterio = "navegable" | "cartera" | "facturable" | "clasificable";

export type Cobertura =
  /** Usa un fragmento del scope. El test verifica que el archivo LO IMPORTE de verdad. */
  | { modo: "criterio"; criterio: Criterio }
  /**
   * Va a buscar EL contenedor de "Información del cliente" (el centinela). No es una
   * pregunta de alcance: es un destino con nombre propio. El test verifica que use la
   * constante del registro y no el literal.
   */
  | { modo: "sentinel" }
  /** Ni lista ni filtra: escribe. Es el espejo de HubSpot. */
  | { modo: "escritor"; razon: string }
  /** No necesita criterio, y por qué. */
  | { modo: "exento"; razon: string };

export const SCOPE_COVERAGE: Record<string, Cobertura> = {
  // ── Los que usan un criterio ───────────────────────────────────────────────
  "app/(shell)/clients/[id]/layout.tsx": { modo: "criterio", criterio: "navegable" },
  "app/(shell)/clients/[id]/page.tsx": { modo: "criterio", criterio: "navegable" },
  "app/(shell)/clients/[id]/stage/[stageNum]/page.tsx": { modo: "criterio", criterio: "navegable" },
  "lib/portfolio/load.ts": { modo: "criterio", criterio: "cartera" },
  "lib/cs/watchdog.ts": { modo: "criterio", criterio: "cartera" },
  "lib/cobranza/queries.ts": { modo: "criterio", criterio: "facturable" },
  "app/(shell)/sessions/page.tsx": { modo: "criterio", criterio: "clasificable" },
  "app/(shell)/sessions/[id]/page.tsx": { modo: "criterio", criterio: "clasificable" },
  "app/api/projects/[projectId]/project-sessions/route.ts": { modo: "criterio", criterio: "clasificable" },
  "app/api/clients/[id]/analyze/route.ts": { modo: "criterio", criterio: "clasificable" },
  "lib/sessions/classify-session-project.ts": { modo: "criterio", criterio: "clasificable" },
  /**
   * No hace ninguna consulta: recibe el array que el `select` anidado de `ClientsTable` ya
   * trajo y lo resume para la barra de filtros del índice. Entra igual —y el detector nuevo
   * lo obliga— porque decide el alcance de los contadores que la pantalla afirma en voz alta.
   * ⚠ Usa `clasificable` A PROPÓSITO: `cartera` excluye el trabajo interno, y con ese criterio
   * el contador `internos` —y con él la pestaña «Proyectos internos»— darían 0 por construcción.
   */
  "lib/clients/resumen-proyectos.ts": { modo: "criterio", criterio: "clasificable" },

  // ── Los que buscan el centinela ────────────────────────────────────────────
  "lib/canvas/strategy-project.ts": { modo: "sentinel" },
  "lib/canvas/read-procesos.ts": { modo: "sentinel" },
  "lib/canvas/sync-procesos-blocks.ts": { modo: "sentinel" },
  "app/api/projects/[projectId]/procesos/route.ts": { modo: "sentinel" },
  "app/print/canvas/[clientId]/[canvasId]/page.tsx": { modo: "sentinel" },

  // ── El espejo ──────────────────────────────────────────────────────────────
  "lib/hubspot/sync-projects.ts": {
    modo: "escritor",
    razon:
      "es el espejo de HubSpot: recorre lo que devuelve la API, no una selección de Nexus. " +
      "Filtrar acá con un criterio de alcance sería no sincronizar lo que sí existe.",
  },

  // ── Los exentos, cada uno con su motivo ────────────────────────────────────
  "app/api/clients/[id]/projects/[projectId]/route.ts": {
    modo: "exento",
    razon:
      "no pregunta «¿qué proyectos cuentan?»: busca a los que apuntan al que se está borrando " +
      "para soltarles el vínculo de hermano antes de que quede colgando. Acotarlo con un " +
      "criterio de alcance sería el bug: un hermano INACTIVO —o uno que el criterio esconda por " +
      "cualquier motivo— quedaría igual apuntando a una fila muerta, que es exactamente lo que " +
      "este barrido viene a impedir. La búsqueda es por referencia, no por alcance.",
  },
  "lib/hubspot/empresas-con-proyecto.ts": {
    modo: "exento",
    razon:
      "no pregunta «¿qué proyectos cuentan?»: pregunta qué `hubspotServiceId` YA existe en " +
      "Nexus —el que sea, activo o no, de cualquier cliente— para no volver a ofrecer traer un " +
      "proyecto que ya está. Acotarlo con un criterio de alcance es el bug: un proyecto " +
      "inactivo, o de un cliente que el criterio esconda, se vería como faltante y el botón " +
      "ofrecería traerlo otra vez creando una ficha de empresa duplicada. La búsqueda es por " +
      "existencia, no por alcance — mismo caso que `alta-runner`.",
  },
  "app/api/clients/traer-de-hubspot/route.ts": {
    modo: "exento",
    razon:
      "no pregunta «¿qué proyectos cuentan?»: cuando dos clics simultáneos chocan contra el " +
      "único de `hubspotServiceId`, busca QUIÉN ganó la carrera para adoptarlo en vez de " +
      "devolver un error crudo. Acotarlo con un criterio de alcance es el bug: el proyecto que " +
      "ganó puede estar en cuarentena —de hecho SIEMPRE lo está, porque el alta acaba de " +
      "empezar— y ningún criterio lo deja pasar, así que el segundo clic crearía el duplicado " +
      "que este rescate viene a evitar. La búsqueda es por existencia, no por alcance.",
  },
  "lib/projects/alta-runner.ts": {
    modo: "exento",
    razon:
      "no pregunta «¿qué proyectos cuentan?»: pregunta si ALGÚN proyecto —el que sea, activo o " +
      "no, del cliente que sea— ya reclamó un id de HubSpot que el alta está por adoptar. " +
      "`hubspotServiceId` es único en toda la tabla, así que acotar la búsqueda con un criterio " +
      "de alcance dejaría afuera justo al que hay que encontrar (un proyecto inactivo lo " +
      "reclama igual) y el alta se apropiaría de un record ajeno.",
  },
  "lib/handoff/duenio.ts": {
    modo: "exento",
    razon:
      "no pregunta «¿qué proyectos cuentan?»: pregunta si la empresa tiene —o tuvo alguna vez, " +
      "sin filtrar por activo— un proyecto en el pipeline de Implementación de HubSpot, para " +
      "decidir el TEXTO por defecto de un Desarrollo/Sitio nuevo. Una implementación cerrada " +
      "dejó reuniones en la misma línea de tiempo de la company igual que una activa, así que " +
      "acotar por criterio de alcance escondería justo el caso que la nota tiene que cubrir.",
  },
  "lib/canvas/load-canvas-context.ts": {
    modo: "exento",
    razon:
      "el contexto del agente incluye A PROPÓSITO los proyectos ya terminados del cliente, " +
      "así que no puede usar `clasificable` (que exige activo). Compone el átomo del " +
      "centinela a mano, con el comentario que lo explica al lado.",
  },
  "app/api/clients/[id]/projects/route.ts": {
    modo: "exento",
    razon:
      "devuelve TODOS los proyectos del cliente con su serviceType para que el consumidor " +
      "decida (la pantalla de ajustes filtra el centinela en el navegador). Angostarlo acá " +
      "le sacaría opciones a la zona de peligro sin avisar.",
  },
  "app/api/handoffs/import-project/route.ts": {
    modo: "exento",
    razon: "busca UN proyecto por su id de HubSpot para vincularlo. No es una lista.",
  },
  "app/api/handoffs/projects-of-company/route.ts": {
    modo: "exento",
    razon:
      "cruza los proyectos de HubSpot con los de Nexus para el alta única y para el asistente " +
      "de handoff: necesita ver TODOS, incluidos los que el rail esconde, o se ofrecería crear " +
      "uno que ya existe.",
  },
  "lib/auth/access.ts": {
    modo: "exento",
    razon:
      "cuenta proyectos por `hubspotOwnerEmail` para decidir ACCESO. Angostarlo le quitaría " +
      "acceso a un CSE por una razón de negocio (que su proyecto no es cartera), que es " +
      "exactamente lo que la tabla de decisiones promete NO hacer.",
  },
  "lib/clients/last-interaction.ts": {
    modo: "exento",
    razon:
      "junta fechas de próxima sesión por cliente. Es una señal temporal agregada, no un " +
      "listado de proyectos, y esconder una fecha real haría mentir a la columna.",
  },
  "lib/cs/load-account.ts": {
    modo: "exento",
    razon: "lee propiedades por `id IN` de una lista que loadPortfolio YA filtró por cartera.",
  },
  "lib/cs/load-dashboard.ts": {
    modo: "exento",
    razon: "lee propiedades por `id IN` de una lista que loadPortfolio YA filtró por cartera.",
  },
  "lib/lifecycle/load.ts": {
    modo: "exento",
    razon: "carga el ciclo de vida por `id IN` de una lista que el caller ya filtró.",
  },
};
