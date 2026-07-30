/**
 * lib/projects/kind.ts — QUÉ ES un proyecto. CLIENT-SAFE (sin Prisma, solo `import type`).
 *
 * Smarteam lleva tres clases de trabajo, y HubSpot es quien las declara: de qué PIPELINE
 * viene el proyecto, si está marcado como INTERNO, y si está ASOCIADO a otro proyecto (un
 * desarrollo colgado de una implementación es su *hermano*). Este archivo es el único lugar
 * donde esos tres hechos se traducen a decisiones: si el proyecto se factura, si suma carga
 * a la cartera de CS, si se le puede publicar contenido al cliente, si corre el ciclo de 8
 * etapas, si lo vigila el watchdog y si tiene pestaña.
 *
 * ── POR QUÉ EL TIPO SE DERIVA Y NO SE GUARDA ─────────────────────────────────
 * La casa modela esto con enums de Postgres (ver `ClientKind`), y acá NO. Los valores
 * espejarían pipelines que Elías puede crear cualquier tarde: un enum no puede guardar uno
 * desconocido, y QUITARLE un valor a un enum en Postgres es cirugía. Se guarda el hecho
 * crudo (`Project.hubspotPipelineId`) y se traduce acá. Un cuarto pipeline es UNA FILA en
 * `PROJECT_PIPELINES` y cero deploy de base de datos.
 *
 * ── LA REGLA QUE HACE QUE ESTO SEA SEGURO DE SOLTAR ──────────────────────────
 * `resolvePipeline` es TOLERANTE: un pipeline que no está en la tabla devuelve `null`, y
 * todo consumidor degrada al comportamiento legacy (= el de Customer Success, que es el
 * único que existía). Por eso el deploy es invisible mientras el backfill no corrió, y por
 * eso un pipeline nuevo que nadie declaró no rompe nada: entra como entraba antes.
 *
 * ── CLIENT-SAFE NO ES UN LUJO ────────────────────────────────────────────────
 * Los 7 lugares que escriben `"__strategy__"` a mano no son indisciplina: la constante
 * vivía en `lib/canvas/strategy-project.ts`, que importa Prisma, y dos de esos lugares son
 * componentes de cliente — literalmente NO PODÍAN importarla. Por eso el sentinel se mudó
 * acá. Es la condición para que el filtro se importe en vez de copiarse.
 *
 * Ver `lib/projects/scope.ts` para los fragmentos de consulta derivados de esta tabla.
 */

// ── El sentinel ──────────────────────────────────────────────────────────────

/**
 * `serviceType` del Project que aloja la "Información del cliente" — un contenedor de datos
 * del CLIENTE disfrazado de proyecto. Nunca es un proyecto de verdad: no tiene pestaña, no
 * se factura, no entra a la cartera.
 *
 * Se queda como sentinel de `serviceType` y NO se vuelve un valor de la tabla de pipelines:
 * es un truco de almacenamiento de Nexus, no una categoría de negocio de HubSpot. Los
 * fragmentos de `scope.ts` encapsulan las dos condiciones, así que los consumidores igual
 * preguntan una sola vez — que era el objetivo.
 *
 * (Reexportado por `lib/canvas/strategy-project.ts` para no romper los imports viejos.)
 */
export const SENTINEL_SERVICE_TYPE = "__strategy__";

// ── Las decisiones ───────────────────────────────────────────────────────────

/**
 * Lo que el resto del sistema le pregunta a un proyecto. Seis decisiones, ni una más:
 * cada campo tiene AL MENOS un consumidor real hoy o en la tanda que viene.
 */
export interface ProjectCapabilities {
  /** Entra al panel de Cobranza y a la facturación. */
  cobranza: boolean;
  /** Suma carga a la cartera de Customer Success (portafolio, Éxito del cliente, CS360). */
  carteraCs: boolean;
  /** Se le puede publicar contenido al cliente (kickoff, cronograma, business case…). */
  publicable: boolean;
  /** Corre el ciclo de vida de 8 etapas con sus compuertas. */
  cicloOchoEtapas: boolean;
  /** Lo vigila el watchdog de Éxito del cliente (alertas de salud). */
  vigilante: boolean;
  /** Aparece como pestaña en la ficha del cliente. SIEMPRE true — ver la nota de abajo. */
  pestana: boolean;
}

/**
 * ⚠ INVARIANTE: `pestana` es true en TODAS las filas, y eso es una decisión, no un descuido.
 * Nadie pierde acceso a su proyecto por esta tanda. La cuarentena es de cobranza, cartera,
 * vigilante y publicación — nunca de navegación. Si algún día una fila la pone en false,
 * que sea porque alguien lo decidió mirando esta línea.
 */

export type ProjectPipelineKey = "customer-success" | "development" | "web";

/**
 * Una ETAPA del pipeline, tal como la declara HubSpot.
 *
 * DOS booleanos y no un `tipo`, porque son dos preguntas independientes y hay etapas que
 * las responden distinto:
 *  · "Cancelado"  → CIERRA el proyecto **y** no es avance. Las dos cosas, a la vez.
 *  · "Bloqueado"  → ninguna de las dos: el proyecto sigue vivo y no avanzó.
 *  · "Finalizado" → cierra **y** es el final de la línea.
 * Un campo único obligaría a elegir cuál de las dos verdades escribir.
 */
export interface PipelineStage {
  /** `hs_pipeline_stage` — el valor que materializa el sync en `hubspotPipelineStageId`. */
  id: string;
  label: string;
  /**
   * ¿Está en la LÍNEA DE AVANCE? Es lo que cuenta el "Etapa i/N" y lo que pinta el stepper.
   * Las etapas fuera de línea se muestran igual, pero sin posición y en tono neutro: un
   * "Cancelado" pintado con el color del avance se lee como progreso.
   */
  enLinea: boolean;
  /** ¿Estar acá CIERRA el proyecto en Nexus? Espeja `closedStageIds`; un test lo ata. */
  terminal: boolean;
}

export interface PipelineDef {
  key: ProjectPipelineKey;
  /** El id del pipeline en el objeto Proyectos (0-970) de HubSpot. */
  hubspotPipelineId: string;
  label: string;
  help: string;
  /**
   * Las etapas del pipeline, EN EL ORDEN de HubSpot (`displayOrder`). El orden del array
   * *es* el orden: no hay un campo de posición que pueda contradecirlo.
   *
   * Transcritas del portal el 2026-07-30 (`scripts/inspect-project-pipelines.ts`). Sirven
   * para dos cosas: pintar la etapa de un proyecto que NO corre el ciclo de 8 etapas de CS
   * (ver `fuenteDelCiclo`), y atar `closedStageIds` a algo legible.
   */
  stages: readonly PipelineStage[];
  /**
   * Etapas TERMINALES. Estar en una de ellas cierra el proyecto en Nexus, sin importar lo
   * que diga el estado crudo — que es justo el punto: nadie actualiza `hs_status`, la gente
   * mueve la tarjeta de etapa.
   *
   * ⚠ Se declara APARTE de `stages` a propósito, aunque un test exija que coincidan. Este
   * campo decide plata y visibilidad, y su contenido lo revisó un humano contra el portal
   * (el gate de los 12 flips). Derivarlo de `terminal` haría que un typo en una etapa nueva
   * cerrara proyectos en silencio; declarado dos veces, ese typo rompe el test.
   */
  closedStageIds: readonly string[];
  /** Etapa con la que nace un proyecto creado DESDE Nexus (handoff-sync, y la Tanda C). */
  initialStageId: string;
  /**
   * De qué pipelines puede ser HERMANO. Un desarrollo asociado a una implementación de CS
   * no se factura aparte: cobra el hermano.
   */
  canBeSiblingOf: readonly ProjectPipelineKey[];
  /**
   * Slugs del registro de piezas (`lib/pieces/registry.ts`) con los que NACE un proyecto de
   * este tipo. Lo consume `createDefaultCanvases`.
   *
   * ⚠ El `handoff` figura en las tres filas porque a las tres les corresponde, pero NO lo
   * crea `createDefaultCanvases`: lo monta `createHandoffCanvas` junto con su entidad. La
   * exclusión está nombrada en `PIEZAS_QUE_NO_NACEN_ACA` y testeada — dejarlo en la lista y
   * que la función lo ignore *en silencio* sería exactamente la deriva que este repo mata.
   *
   * ⚠ Poner acá una pieza `createdWithProject: false` la resucita en TODOS los proyectos
   * nuevos. Ya pasó: costó retirar 111 cascarones de Handoff vacíos y 234 canvases de
   * Diagnóstico y Planificación. Un test ata esta lista con el registro de piezas.
   */
  seedPieces: readonly string[];
  /** La fila de la tabla de decisiones, para un proyecto NO interno y SIN hermano. */
  base: ProjectCapabilities;
}

/** La fila legacy: lo único que existía antes de esta tanda. También es la fila de "no sé". */
const BASE_CUSTOMER_SUCCESS: ProjectCapabilities = {
  cobranza: true,
  carteraCs: true,
  publicable: true,
  cicloOchoEtapas: true,
  vigilante: true,
  pestana: true,
};

/**
 * Desarrollo y sitios web comparten fila: se facturan cuando van solos, pero NO son cartera
 * de CS (no suman carga a los CSE ni disparan alertas de éxito del cliente) y no corren el
 * ciclo de 8 etapas, que es la metodología de una implementación de CS y no la de ellos.
 */
const BASE_ENTREGA_TECNICA: ProjectCapabilities = {
  cobranza: true,
  carteraCs: false,
  publicable: true,
  cicloOchoEtapas: false,
  vigilante: false,
  pestana: true,
};

/**
 * LA TABLA. Un pipeline = una fila. Los ids salieron de `scripts/inspect-project-pipelines.ts`
 * corrido contra el portal el 2026-07-29, con el gate en verde (cada etapa de cierre cae
 * dentro de su propio pipeline).
 *
 * El portal tiene un cuarto pipeline, "Customer Onboarding Pipeline"
 * (`default-onboarding-pipeline`), que viene de fábrica con HubSpot y tiene 0 proyectos.
 * NO se declara a propósito: cae a `null` → comportamiento legacy, que es exactamente lo
 * que corresponde para algo que nadie usa.
 */
export const PROJECT_PIPELINES: readonly PipelineDef[] = [
  {
    key: "customer-success",
    hubspotPipelineId: "826270797",
    label: "Customer Success CRM",
    help: "La implementación que compró el cliente. Es la cartera: se factura, la lleva un CSE y corre el ciclo de 8 etapas.",
    /* Se declaran aunque NO se pinten: un proyecto de CS muestra el ciclo de 8 etapas de
       Nexus, no éstas (ver `fuenteDelCiclo`). Están acá porque son lo que ata
       `closedStageIds` a algo legible, y porque la tabla tiene que ser uniforme: la fila
       que no declara etapas es la que un día se cierra sola sin que nadie lo note. */
    stages: [
      { id: "1225193551", label: "Nuevo proyecto", enLinea: true, terminal: false },
      { id: "1225193541", label: "Arquitectura/Estructuración", enLinea: true, terminal: false },
      { id: "1225193553", label: "Adopción", enLinea: true, terminal: false },
      { id: "1241442148", label: "Cierre de onboarding", enLinea: true, terminal: false },
      { id: "1225193543", label: "Finalizado", enLinea: true, terminal: true },
      /* Fuera de la línea: "Continuidad" es el modo en que vive un servicio recurrente
         DESPUÉS de la implementación, no un paso más de ella. */
      { id: "1370129216", label: "Continuidad", enLinea: false, terminal: false },
      /* ⚠ HubSpot marca "Bloqueado" con `isClosed: true` y acá se le lleva la contraria a
         propósito: hay 3 proyectos ACTIVOS parados ahí (medido 2026-07-30), y un proyecto
         bloqueado no está terminado — está esperando. Tomar el `isClosed` del portal los
         ocultaría de Nexus, que es lo contrario de lo que un bloqueo necesita. */
      { id: "1225193545", label: "Bloqueado", enLinea: false, terminal: false },
    ],
    // El pipeline de CS no tiene etapa "Cancelado": su única terminal es Finalizado.
    closedStageIds: ["1225193543"], // Finalizado
    initialStageId: "1225193551", // Nuevo proyecto (ex "Hand off")
    canBeSiblingOf: [],
    /* SIN `implementation`: es `createdWithProject: false` en el registro de piezas a
       propósito —se creaba vacía en los 118 proyectos— y ponerla acá la resucitaría. */
    seedPieces: ["handoff", "kickoff", "timeline", "exploration"],
    base: BASE_CUSTOMER_SUCCESS,
  },
  {
    key: "development",
    hubspotPipelineId: "922785384",
    label: "Development",
    help: "Desarrollo o integración. Si cuelga de una implementación de CS es su hermano y no se factura aparte; si va solo, sí.",
    /* ESTAS SÍ SE PINTAN: un desarrollo no corre el ciclo de 8 etapas de Customer Success
       —su metodología es otra— y lo que la sección de ciclo de vida le muestra es su propia
       línea de HubSpot. La mueve el equipo allá; en Nexus es de solo lectura. */
    stages: [
      { id: "1409898886", label: "Handoff", enLinea: true, terminal: false },
      { id: "1409897653", label: "Exploración", enLinea: true, terminal: false },
      { id: "1409897655", label: "Requerimientos", enLinea: true, terminal: false },
      { id: "1409932561", label: "Desarrollo", enLinea: true, terminal: false },
      { id: "1409932562", label: "Pruebas", enLinea: true, terminal: false },
      { id: "1409932563", label: "Entrega", enLinea: true, terminal: false },
      { id: "1409932564", label: "Finalizado", enLinea: true, terminal: true },
      // Cierra el proyecto pero NO es avance: sale de la línea y no cuenta para "Etapa i/N".
      { id: "1409897657", label: "Cancelado", enLinea: false, terminal: true },
    ],
    // "Cancelado" NO estaba en los tres ids que dio Elías, pero es tan terminal como
    // "Finalizado" y hoy hay 0 proyectos ahí, así que sumarlo no mueve nada y evita que un
    // proyecto cancelado se quede activo en Nexus para siempre.
    closedStageIds: ["1409932564", "1409897657"], // Finalizado, Cancelado
    initialStageId: "1409898886", // Handoff
    canBeSiblingOf: ["customer-success"],
    seedPieces: ["handoff", "timeline", "tech-requirements"],
    base: BASE_ENTREGA_TECNICA,
  },
  {
    key: "web",
    hubspotPipelineId: "922688687",
    label: "Sitios web",
    help: "Diseño y desarrollo de sitio. Mismo trato que un desarrollo: hermano de una implementación no se factura aparte.",
    /* ⚠ El orden es el `displayOrder` del portal, NO el numérico de los ids: "Consenso"
       (…127) va ANTES que "Desarrollo" (…126). Ordenarlas por id —que es lo que parece
       prolijo— invertiría dos etapas de la línea. */
    stages: [
      { id: "1409897123", label: "Handoff", enLinea: true, terminal: false },
      { id: "1409897124", label: "Exploración", enLinea: true, terminal: false },
      { id: "1409897125", label: "Mockup", enLinea: true, terminal: false },
      { id: "1409897127", label: "Consenso", enLinea: true, terminal: false },
      { id: "1409897126", label: "Desarrollo", enLinea: true, terminal: false },
      { id: "1409897128", label: "Entrega", enLinea: true, terminal: false },
      { id: "1409897129", label: "Finalizado", enLinea: true, terminal: true },
      { id: "1409897130", label: "Cancelado", enLinea: false, terminal: true },
    ],
    closedStageIds: ["1409897129", "1409897130"], // Finalizado, Cancelado
    initialStageId: "1409897123", // Handoff
    // ⚠ La tabla del plan escribía la fila de "Sitios web" sin abrir el caso hermano, pero
    // la regla de negocio que la acompaña dice "los desarrollos Y SITIOS WEB que van aparte
    // sí se facturan; los que son hermanos no". Se sigue la regla y no la fila abreviada:
    // equivocarse hacia "factura igual" cobra dos veces el mismo trabajo.
    canBeSiblingOf: ["customer-success"],
    /* CON `kickoff`: hoy lo recibe y es su landing de cara al cliente — un sitio web es
       `publicable`. Sacárselo sería un cambio que nadie pidió. */
    seedPieces: ["handoff", "kickoff", "timeline", "exploration"],
    base: BASE_ENTREGA_TECNICA,
  },
] as const;

/**
 * Lo que cambia por estar marcado INTERNO, y —tan importante— lo que NO cambia.
 *
 * Es un OVERLAY y no una segunda dimensión de la tabla: con dos ejes, un cuarto tipo pasa de
 * 4 filas a 8, el 90% de las celdas quedan idénticas y se pierde lo único que vale la pena
 * leer, que es esto de acá.
 */
export const OVERLAY_INTERNO = {
  /** Un proyecto interno de Smarteam no se cobra, no es cartera de nadie y no se publica. */
  apaga: { cobranza: false, carteraCs: false, publicable: false, vigilante: false },
  /**
   * Lo que SIGUE IGUAL, escrito porque es tan decisión como lo de arriba:
   *  · `pestana`         — el equipo tiene que poder entrar a su propio proyecto.
   *  · `cicloOchoEtapas` — un CS interno usa la misma metodología; su compuerta de
   *                        "Validación de uso" va a quedar trabada (el puntaje viene de
   *                        HubSpot por cliente) y se marca a mano, que es un camino que
   *                        ya existe.
   */
  respeta: ["pestana", "cicloOchoEtapas"],
} as const satisfies {
  apaga: Partial<ProjectCapabilities>;
  respeta: readonly (keyof ProjectCapabilities)[];
};

// ── Resolución ───────────────────────────────────────────────────────────────

/**
 * Pipeline de HubSpot → su fila. **Tolerante**: `null` para uno desconocido, vacío o para un
 * proyecto que todavía no pasó por el backfill. Todo consumidor tiene que degradar a legacy
 * ante `null` — es lo que hace que esto se pueda soltar sin coordinar un backfill.
 */
export function resolvePipeline(hubspotPipelineId: string | null | undefined): PipelineDef | null {
  if (!hubspotPipelineId) return null;
  const id = hubspotPipelineId.trim();
  return PROJECT_PIPELINES.find((p) => p.hubspotPipelineId === id) ?? null;
}

/** Por su clave interna. Para la UI y para los tests, que no deberían escribir ids a mano. */
export function pipelineByKey(key: ProjectPipelineKey): PipelineDef {
  const found = PROJECT_PIPELINES.find((p) => p.key === key);
  if (!found) throw new Error(`Pipeline desconocido: ${key}`);
  return found;
}

/** Valida una clave de pipeline que llega de la frontera HTTP. `null` si no es válida. */
export function parseProjectPipeline(v: unknown): PipelineDef | null {
  if (typeof v !== "string") return null;
  return PROJECT_PIPELINES.find((p) => p.key === v) ?? null;
}

// ── La función que responde todo ─────────────────────────────────────────────

export interface ProjectFacts {
  /** `Project.hubspotPipelineId`. `null` = desconocido o sin backfill → legacy. */
  hubspotPipelineId: string | null;
  /** `Project.proyectoInterno`. */
  interno: boolean;
  /**
   * ¿Cuelga de un proyecto de Customer Success? Entra como PRIMITIVO, no como lookup a la
   * base: quien llama ya tiene el proyecto en la mano y sabe la respuesta. Así esta función
   * —que consulta todo el sistema— se queda pura y enumerable en un test.
   */
  tieneHermanoCs: boolean;
}

/**
 * LA función. Tres hechos primitivos → las seis decisiones. Sin base de datos, sin async,
 * sin excepciones: una tabla de verdad que se puede escribir entera en un test (y está
 * escrita entera, en `kind.test.ts`).
 */
export function projectCapabilities(facts: ProjectFacts): ProjectCapabilities {
  const def = resolvePipeline(facts.hubspotPipelineId);
  // Pipeline desconocido → la fila legacy. Es lo que hace invisible el deploy.
  const caps: ProjectCapabilities = { ...(def?.base ?? BASE_CUSTOMER_SUCCESS) };

  // El hermano solo apaga la cobranza, y solo para los pipelines que declararon poder serlo.
  if (facts.tieneHermanoCs && def?.canBeSiblingOf.includes("customer-success")) {
    caps.cobranza = false;
  }

  /* El overlay se aplica SIEMPRE que el proyecto esté marcado interno, incluso con pipeline
     desconocido. La invariante "interno ⇒ no cobranza, no cartera, no publicable" es
     incondicional: es una propiedad de HubSpot apagando tres subsistemas, y condicionarla a
     conocer el pipeline sería justamente el agujero. (No choca con "desconocido = legacy":
     hoy hay 0 proyectos marcados internos, así que la ventana previa al backfill no cambia
     para nadie.) */
  if (facts.interno) Object.assign(caps, OVERLAY_INTERNO.apaga);

  return caps;
}

// ── De dónde sale la ETAPA ───────────────────────────────────────────────────

/**
 * La frontera del ciclo de vida: quién manda la etapa de este proyecto.
 *
 *  · `"customer-success"` → el ciclo de 8 etapas de Nexus, con sus compuertas. Es la
 *    metodología de una implementación de CS, y la infiere `lib/lifecycle/stage-engine.ts`.
 *  · `"pipeline"` → la etapa la mueve el equipo **en HubSpot** y Nexus la espeja. No hay
 *    nada que marcar acá: no hay compuertas, no hay override.
 *
 * ── SE DERIVA, NO SE DECLARA ─────────────────────────────────────────────────
 * Sale de `cicloOchoEtapas`, que ya existe, ya está congelado en la tabla de verdad y ya
 * respeta el overlay de interno. Un campo nuevo que respondiera lo mismo podría un día
 * contradecirlo, y entonces habría que averiguar cuál de los dos manda.
 *
 * Devuelve la fila junto al veredicto porque son inseparables: `"pipeline"` sin saber CUÁL
 * pipeline no sirve para nada, y separarlo obligaría a todo consumidor a repetir el
 * `resolvePipeline` y a manejar un `null` que no puede pasar.
 */
export type FuenteDelCiclo =
  | { tipo: "customer-success" }
  | { tipo: "pipeline"; pipeline: PipelineDef };

export function fuenteDelCiclo(facts: ProjectFacts): FuenteDelCiclo {
  if (projectCapabilities(facts).cicloOchoEtapas) return { tipo: "customer-success" };
  const def = resolvePipeline(facts.hubspotPipelineId);
  /* Invariante: `cicloOchoEtapas === false` SOLO puede venir de una fila declarada — un
     pipeline desconocido degrada a la fila legacy, que sí lo corre. El fallback no es un
     caso real: existe para que agregar una fila con `cicloOchoEtapas: false` y sin etapas
     no produzca un crash, sino el comportamiento de siempre. */
  return def ? { tipo: "pipeline", pipeline: def } : { tipo: "customer-success" };
}

/** Las etapas que cuentan para el "Etapa i/N" y para el stepper, en orden. */
export function lineaDeAvance(def: PipelineDef): readonly PipelineStage[] {
  return def.stages.filter((s) => s.enLinea);
}

/**
 * La etapa de un proyecto dentro de su pipeline. `null` si Nexus todavía no vio ninguna
 * etapa, o si HubSpot movió el proyecto a una etapa que esta tabla no declara (pasa si
 * alguien agrega una etapa en el portal y nadie la transcribe acá: se degrada a "sin
 * etapa" en vez de romper).
 */
export function buscarEtapa(
  def: PipelineDef,
  stageId: string | null | undefined,
): PipelineStage | null {
  if (!stageId) return null;
  const id = stageId.trim();
  return def.stages.find((s) => s.id === id) ?? null;
}

// ── Cierre ───────────────────────────────────────────────────────────────────

/**
 * El criterio VIEJO, por el estado crudo (`hs_status` / `estatus_del_proyecto`). Se conserva
 * exactamente como estaba porque es el que sigue mandando para un pipeline desconocido.
 */
export function cerradoPorEstadoCrudo(rawStatus: string | null | undefined): boolean {
  const raw = (rawStatus ?? "").toLowerCase().trim();
  if (!raw) return false;
  return (
    raw === "completed" ||
    raw === "cancelled" ||
    raw.includes("completado") ||
    raw.includes("cancelado") ||
    raw.includes("cerrado")
  );
}

/**
 * ¿Este proyecto está terminado?
 *
 * DOS SEÑALES INDEPENDIENTES, UNIDAS: la etapa terminal del pipeline **o** el estado crudo.
 * La unión no es pereza, es la propiedad que hace que esto sea seguro:
 *
 *  · **Suma el cierre que faltaba.** Nadie actualiza `hs_status`; la gente mueve la tarjeta.
 *    Hay 12 proyectos parados en "Finalizado" con el estado crudo diciendo "on_track". Ésos
 *    son los que la etapa cierra y el estado no cerraba nunca. Es el pedido de Elías.
 *  · **Nunca REABRE.** Un criterio de precedencia ("manda la etapa") podría devolver
 *    "abierto" para algo que hoy está cerrado —sacar la tarjeta de Finalizado dejándole el
 *    estado en "completed"— y la rama de actualización del sync escribe `status: "active"`,
 *    o sea que lo RESUCITARÍA. Con la unión eso no puede pasar por construcción, que es
 *    mejor que que no pase por cuidado.
 *
 * Reactivar un proyecto está explícitamente fuera de alcance: hay proyectos ocultados a
 * propósito y no queremos que vuelvan solos.
 */
export function decidirCierre(input: {
  hubspotPipelineId: string | null | undefined;
  stageId: string | null | undefined;
  rawStatus: string | null | undefined;
}): "abierto" | "cerrado" {
  const def = resolvePipeline(input.hubspotPipelineId);
  const porEtapa = !!(def && input.stageId && def.closedStageIds.includes(input.stageId.trim()));
  return porEtapa || cerradoPorEstadoCrudo(input.rawStatus) ? "cerrado" : "abierto";
}
