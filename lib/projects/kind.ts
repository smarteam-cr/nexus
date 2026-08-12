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
// `alta.ts` es una hoja: no importa nada, y en particular no importa a este archivo. La
// dirección de la flecha importa — si algún día se invirtiera, kind ↔ alta se volverían un
// ciclo y los dos dejarían de ser client-safe.
import { altaEnCurso, parseEstadoDeAlta } from "./alta";

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
   * ¿El handoff de un proyecto de este tipo, cuando cuelga de una Implementación, ES el del
   * hermano mayor? `true` redirige el documento; `false` le da el suyo propio.
   *
   * ── POR QUÉ ES UN CAMPO Y NO SE DERIVA DE `canBeSiblingOf` ───────────────────
   * Hasta el 2026-08-07 `duenioDelHandoff` leía `canBeSiblingOf` directamente, y por eso las
   * dos cosas venían pegadas: colgar de una implementación apagaba la cobranza **y** te quitaba
   * el documento. Son decisiones distintas y el negocio las separó — un desarrollo hermano
   * sigue sin facturar aparte (eso no se toca) pero ahora sí necesita su propio handoff.
   *
   * ⚠ Y NO ERA UN DETALLE DE DOCUMENTOS: el agente de handoff es también el que crea las FASES
   * del cronograma. Con la redirección prendida, la corrida del hermano menor se ejecutaba
   * sobre la implementación y las fases aterrizaban allá. Medido el 2026-08-06: los 2 hermanos
   * menores de producción tenían **0 fases y 0 tareas** mientras sus implementaciones tenían 8
   * y 10. Su pantalla de cronograma decía «Generá el Handoff» y no tenía botón.
   *
   * ⚠ SE APAGA POR FILA, NO BORRANDO CÓDIGO. Con `false` en las tres, `vetoSiElHandoffEsDeOtro`
   * y sus cuatro guardas fs-scan siguen existiendo enteros y simplemente no disparan nunca. La
   * vuelta atrás —si dos documentos del mismo trato empiezan a contradecirse— es esta celda.
   */
  handoffDelHermano: boolean;
  /**
   * Cómo se llama EN PANTALLA el equipo que entrega este tipo de trabajo. Es el rótulo del
   * segundo frente del widget de sesiones (ver `frentesDeProyecto`) — un desarrollo no
   * tiene "CSE", tiene equipo técnico.
   */
  frenteDeEntrega: string;
  /**
   * A QUIÉN mira ese frente cuando busca la última y la próxima sesión. No se deriva del
   * rótulo: son dos cosas distintas y confundirlas fue justo el bug (el frente decía
   * "Desarrollo" y traía sesiones de CSE porque miraba a `deliveryEmails`).
   *
   *  · `"entrega"`   → CSE ∪ Desarrollo. Es lo correcto donde NO hay un frente técnico
   *                    aparte: una integración que lleva solo un dev es una sesión de
   *                    entrega del proyecto de CS.
   *  · `"desarrollo"` → solo Desarrollo. Para el pipeline que sí tiene frente propio.
   */
  equipoDeEntrega: EquipoDeFrente;
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

/**
 * La fila de "NO SÉ QUÉ ES ESTO": un pipeline que la tabla no declara, o un proyecto que
 * todavía no pasó por el backfill. Es lo único que existía antes de la tanda de pipelines, y
 * se conserva byte por byte — incluido `cicloOchoEtapas: true`.
 *
 * Sigue en `true` A PROPÓSITO aunque el pipeline de Customer Success ya no lo corra: sin
 * pipeline no hay etapas de HubSpot que mostrar, así que el ciclo de Nexus es lo único que
 * queda. Es lo que hace que un pipeline nuevo que nadie declaró siga comportándose como
 * siempre en vez de quedarse sin ciclo de vida.
 */
const BASE_LEGACY: ProjectCapabilities = {
  cobranza: true,
  carteraCs: true,
  publicable: true,
  cicloOchoEtapas: true,
  vigilante: true,
  pestana: true,
};

/**
 * La implementación de Customer Success. Igual que la legacy salvo por una celda:
 *
 * ── `cicloOchoEtapas: false` desde 2026-07-30 ────────────────────────────────
 * El pipeline de CS en HubSpot pasó a tener EXACTAMENTE las 8 etapas del ciclo de Nexus
 * (Handoff → Exploración → Diagnóstico → Planificación → Configuración técnica → Adopción →
 * Validación de uso → Entrega), y la decisión de negocio fue que mande HubSpot, igual que en
 * los desarrollos: el CSE mueve la tarjeta allá y Nexus la espeja.
 *
 * Consecuencias, todas derivadas de esta sola celda: las compuertas de salida, el override de
 * etapa y la modalidad de adopción responden 409; `getProjectLifecycle` deja de materializar
 * `USO_VALIDADO`; y las alarmas POR ETAPA se apagan hasta que existan las nuevas, basadas en
 * lo que se habla en las sesiones (pendiente del roadmap).
 *
 * ⚠ El motor de 8 etapas NO se borró: `lib/lifecycle/stage-engine.ts`, las compuertas y los
 * overrides guardados quedan en pie, sin consumidor, para evaluarlos con las alarmas nuevas.
 * Volver es cambiar esta celda.
 */
const BASE_CUSTOMER_SUCCESS: ProjectCapabilities = {
  ...BASE_LEGACY,
  cicloOchoEtapas: false,
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
    label: "Implementación de HubSpot",
    help: "La implementación que compró el cliente. Es la cartera: se factura y la lleva un CSE. Su etapa la mueve el equipo en HubSpot.",
    /* Transcritas del portal el 2026-07-30 a las 16:17 UTC, cuando el pipeline se rehízo
       para espejar el ciclo de Nexus. Los 4 ids nuevos (Exploración, Diagnóstico,
       Planificación, Validación de uso) nacieron ese día; los 7 viejos conservan su id y
       tres cambiaron de rótulo. Nada se borró.

       Este pipeline se llama "HubSpot" en el portal desde ese cambio, y en Nexus se llamaba
       "Customer Success CRM". El 2026-08-02 pasó a "Implementación de HubSpot": el nombre viejo
       describía el ÁREA que lo lleva, no lo que el proyecto ES, y en el formulario de alta —donde
       alguien elige entre tres tipos sin conocer el vocabulario interno— eso obligaba a leer la
       descripción para entender la opción. El nombre nuevo además ACERCA el rótulo al del portal
       en vez de alejarlo. Nadie lee el label del portal: el que manda es éste. */
    stages: [
      { id: "1225193551", label: "Handoff", enLinea: true, terminal: false },
      { id: "1410223916", label: "Exploración", enLinea: true, terminal: false },
      { id: "1410223917", label: "Diagnóstico", enLinea: true, terminal: false },
      { id: "1410223918", label: "Planificación", enLinea: true, terminal: false },
      { id: "1225193541", label: "Configuración técnica", enLinea: true, terminal: false },
      { id: "1225193553", label: "Adopción", enLinea: true, terminal: false },
      { id: "1410223919", label: "Validación de uso", enLinea: true, terminal: false },
      { id: "1241442148", label: "Entrega", enLinea: true, terminal: false },
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
    /* El pipeline de CS no tiene etapa "Cancelado": su única terminal es Finalizado.
       ⚠ Verificado contra el portal DESPUÉS del cambio de etapas: `1225193543` existe, se
       sigue llamando "Finalizado" y sigue `isClosed`. Este campo decide si un proyecto
       desaparece de la cartera y de la cobranza — no se toca sin volver a mirar el portal. */
    closedStageIds: ["1225193543"], // Finalizado
    initialStageId: "1225193551", // Handoff (se llamó "Nuevo proyecto" entre 2026-05 y 2026-07)
    canBeSiblingOf: [],
    // No cuelga de nadie: nunca se le consulta. Declarada igual porque el tipo la exige y
    // porque `false` es la respuesta correcta si algún día colgara de algo.
    handoffDelHermano: false,
    frenteDeEntrega: "CSE",
    equipoDeEntrega: "entrega",
    /* SIN `implementation`: es `createdWithProject: false` en el registro de piezas a
       propósito —se creaba vacía en los 118 proyectos— y ponerla acá la resucitaría. */
    seedPieces: ["handoff", "kickoff", "timeline", "exploration"],
    base: BASE_CUSTOMER_SUCCESS,
  },
  {
    key: "development",
    hubspotPipelineId: "922785384",
    label: "Desarrollo e integración",
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
    // Handoff PROPIO aunque cuelgue (Tanda F, 2026-08-07): un desarrollo hermano no factura
    // aparte, pero su alcance técnico y sus fases sí son suyos.
    handoffDelHermano: false,
    // El único con frente técnico propio: mira SOLO a Desarrollo.
    frenteDeEntrega: "Desarrollo",
    equipoDeEntrega: "desarrollo",
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
    // Handoff PROPIO aunque cuelgue (Tanda F, 2026-08-07). Ver la nota del campo.
    handoffDelHermano: false,
    /* "CSE" y no "Web": un sitio es `publicable`, lleva kickoff y hoy lo acompaña un CSE.
       Cambiarlo sería una decisión de negocio que nadie pidió — y como el frente de entrega
       ya incluye a Desarrollo (`deliveryEmails = CSE ∪ Development`), las sesiones que se
       muestran son las mismas: lo único que cambiaría es el rótulo. */
    frenteDeEntrega: "CSE",
    equipoDeEntrega: "entrega",
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
  /** Un proyecto interno de Smarteam no se cobra, no es cartera de nadie y no lo vigila nadie. */
  apaga: { cobranza: false, carteraCs: false, vigilante: false },
  /**
   * Lo que SIGUE IGUAL, escrito porque es tan decisión como lo de arriba:
   *  · `pestana`         — el equipo tiene que poder entrar a su propio proyecto.
   *  · `cicloOchoEtapas` — un CS interno usa la misma metodología; su compuerta de
   *                        "Validación de uso" va a quedar trabada (el puntaje viene de
   *                        HubSpot por cliente) y se marca a mano, que es un camino que
   *                        ya existe.
   *  · `publicable`      — ⚠ ESTABA APAGADA hasta el 2026-08-12, sobre la premisa de que "no
   *                        hay un cliente del otro lado a quien publicarle". La premisa era
   *                        falsa: un interno igual tiene STAKEHOLDERS (dirección, el equipo del
   *                        otro frente, un sponsor) a quienes mostrarles el cronograma, y la
   *                        única salida era exportar el PDF a mano. El enlace externo lleva el
   *                        MISMO token + contraseña que el de un cliente, así que destrabarlo
   *                        no abre ninguna puerta nueva: reusa la que ya existe.
   *                        ⚠ Consecuencia asumida a sabiendas: un interno es el único que puede
   *                        reclamar reuniones de Smarteam con Smarteam (ver
   *                        `session-candidates/route.ts`), así que ese material AHORA puede
   *                        viajar en un documento publicado. Es la intención, no un descuido.
   */
  respeta: ["pestana", "cicloOchoEtapas", "publicable"],
} as const satisfies {
  apaga: Partial<ProjectCapabilities>;
  respeta: readonly (keyof ProjectCapabilities)[];
};

/**
 * Lo que cambia mientras el ALTA todavía no terminó (Tanda C — ver `lib/projects/alta.ts`).
 *
 * Dar de alta un proyecto son dos escrituras en dos sistemas, y entre una y otra hay red. Este
 * overlay es la CUARENTENA de esa ventana: el proyecto existe y se puede abrir para ir a
 * arreglarlo, pero no participa de nada que tenga consecuencias afuera.
 *
 * ── POR QUÉ APAGA EXACTAMENTE ESTAS CUATRO ───────────────────────────────────
 *  · `cobranza`  — todavía no se sabe si cobra. El tipo lo dice HubSpot, y HubSpot todavía no
 *                  contestó; darlo por facturable mientras tanto es facturar una suposición.
 *  · `carteraCs` — le sumaría carga a un CSE por un proyecto que puede no llegar a existir.
 *  · `publicable`— no se le puede mostrar al cliente algo que todavía no terminó de nacer.
 *  · `vigilante` — el watchdog alarmaría sobre un proyecto a medio crear, y su aviso sería
 *                  ruido: la acción correcta no es "hacé algo con el cliente", es "terminá de
 *                  crearlo", y para eso está el cartel con su botón.
 *
 * Es el mismo patrón que `OVERLAY_INTERNO` a propósito: son dos hechos distintos que apagan el
 * mismo conjunto de subsistemas, y tenerlos con la misma forma es lo que hace que se puedan
 * leer juntos en `projectCapabilities` sin que ninguno tape al otro.
 */
export const OVERLAY_ALTA_EN_CURSO = {
  apaga: { cobranza: false, carteraCs: false, publicable: false, vigilante: false },
  /**
   * Lo que SIGUE IGUAL, y es la mitad del punto:
   *  · `pestana`         — si no se pudiera abrir, el alta trabada sería otra vez invisible y
   *                        no habría desde dónde apretar "Reintentar". Todo el diseño de la
   *                        Tanda C se cae si esta celda se apaga.
   *  · `cicloOchoEtapas` — no es una decisión del alta. Depende del pipeline, y cuando el alta
   *                        termine el pipeline va a estar materializado; mientras tanto vale
   *                        lo que diga la fila legacy, igual que para cualquier proyecto sin
   *                        pipeline resuelto.
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
  /**
   * ¿El alta de este proyecto todavía no terminó? (`altaEnCurso(project.altaEstado)`, de
   * `lib/projects/alta.ts`).
   *
   * Entra como PRIMITIVO y es OBLIGATORIO, no opcional con default. Un opcional se puede
   * olvidar, y olvidarlo acá significa que un proyecto a medio crear entra a Cobranza —que es
   * exactamente el agujero que la Tanda C vino a tapar—. Siendo obligatorio, el compilador
   * enumera a los tres llamadores y obliga a contestar la pregunta en cada uno.
   */
  altaEnCurso: boolean;
}

/**
 * La fila mínima de `Project` con la que se arman los hechos. Es un subconjunto estructural:
 * cualquier `select` que traiga estas cuatro columnas encaja.
 */
export interface FilaParaHechos {
  hubspotPipelineId: string | null;
  proyectoInterno: boolean;
  hermanoCsProjectId: string | null;
  altaEstado: string | null;
}

/**
 * Fila de `Project` → los hechos. Existe para que agregar un hecho nuevo sea UNA edición y no
 * una por llamador: cuando `altaEnCurso` se sumó a `ProjectFacts`, el compilador enumeró ocho
 * lugares que armaban el mismo objeto literal a mano. El próximo hecho entra acá y listo.
 *
 * Lo que NO hace: consultar la base. Sigue siendo puro — quien llama ya tiene la fila.
 */
export function hechosDeProyecto(p: FilaParaHechos): ProjectFacts {
  return {
    hubspotPipelineId: p.hubspotPipelineId,
    interno: p.proyectoInterno,
    tieneHermanoCs: p.hermanoCsProjectId != null,
    altaEnCurso: altaEnCurso(parseEstadoDeAlta(p.altaEstado)),
  };
}

/**
 * LA función. Cuatro hechos primitivos → las seis decisiones. Sin base de datos, sin async,
 * sin excepciones: una tabla de verdad que se puede escribir entera en un test (y está
 * escrita entera, en `kind.test.ts`).
 */
export function projectCapabilities(facts: ProjectFacts): ProjectCapabilities {
  const def = resolvePipeline(facts.hubspotPipelineId);
  // Pipeline desconocido → la fila legacy. Es lo que hace invisible el deploy.
  const caps: ProjectCapabilities = { ...(def?.base ?? BASE_LEGACY) };

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

  /* La cuarentena del alta sin terminar. Va DESPUÉS del overlay de interno y no antes, aunque
     hoy los dos apaguen exactamente lo mismo: si algún día uno de los dos prendiera una celda
     en vez de apagarla, el orden pasaría a importar, y el que tiene que ganar es éste —un
     proyecto que todavía no terminó de existir no puede cobrar por ninguna razón. */
  if (facts.altaEnCurso) Object.assign(caps, OVERLAY_ALTA_EN_CURSO.apaga);

  return caps;
}

/**
 * ¿Para dar de alta este proyecto hace falta un trato ganado?
 *
 * Se DERIVA de `cobranza` en vez de declararse. Es la diferencia entre una regla y una copia:
 * "si se le cobra al cliente, tiene que haber un trato" vale para siempre, mientras que una
 * lista de excepciones («salvo internos, salvo hermanos…») hay que acordarse de actualizarla el
 * día que una fila de la tabla cambie de opinión. Las dos excepciones que hoy existen —el
 * proyecto interno y el que cuelga de una implementación— caen solas, porque las dos ya apagan
 * `cobranza`.
 *
 * Vive acá y no en `lib/projects/alta.ts` porque necesita la tabla, y `alta.ts` es una hoja que
 * este archivo importa: al revés sería un ciclo.
 */
export function exigeTratoGanado(opts: {
  pipeline: PipelineDef;
  interno: boolean;
  tieneHermano: boolean;
}): boolean {
  return projectCapabilities({
    hubspotPipelineId: opts.pipeline.hubspotPipelineId,
    interno: opts.interno,
    tieneHermanoCs: opts.tieneHermano,
    // El alta todavía no empezó: la cuarentena no puede opinar sobre si el proyecto cobra.
    altaEnCurso: false,
  }).cobranza;
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

/**
 * Por qué este proyecto NO se le puede publicar a un cliente. `null` = sí se puede.
 *
 * El texto vive acá, al lado de la celda que lo produce, y no en cada endpoint: los tres
 * `publish-*`, el resolver de acceso externo y el panel del CSE tienen que decir lo MISMO,
 * y tres copias de una frase divergen a la primera edición.
 *
 * Hoy la única celda que lo apaga es la CUARENTENA DEL ALTA. Está escrito como una pregunta
 * a `projectCapabilities` y no como `if (altaEnCurso)` para que el día que otra fila ponga
 * `publicable: false`, el motivo salga solo.
 *
 * ⚠ Acá vivía la rama `if (facts.interno)` con el texto «no hay un cliente del otro lado a quien
 * publicarle». Se retiró el 2026-08-12 junto con la celda que la producía (ver OVERLAY_INTERNO):
 * un interno YA es publicable. Dejarla habría sido peor que borrarla — solo se alcanzaba con
 * `interno && altaEnCurso`, o sea que habría culpado al hecho de ser interno cuando la causa real
 * es el alta a medio terminar, y el CSE se iba a HubSpot a destildar una casilla que no arreglaba
 * nada.
 */
export function motivoNoPublicable(facts: ProjectFacts): string | null {
  if (projectCapabilities(facts).publicable) return null;
  if (facts.altaEnCurso) {
    return (
      "El alta de este proyecto todavía no terminó: falta que HubSpot confirme sus datos. " +
      "Terminá de crearlo y volvé a publicar."
    );
  }
  return "Este proyecto no admite publicación externa.";
}

// ── Los FRENTES del widget de sesiones ───────────────────────────────────────

/**
 * `key` es la RANURA DE ALMACENAMIENTO, no el rótulo:
 *  · `"ventas"` → `Project.salesNextSessionDate/Note`
 *  · `"cs"`     → `Project.csNextSessionDate/Note`
 *
 * La ranura "cs" siempre fue la del frente de ENTREGA —lo respalda
 * `deliveryEmails = CSE ∪ Development`, escrito así en tres lugares—, y el frente de entrega
 * de un desarrollo es el equipo técnico. Por eso cambia el RÓTULO y no la columna:
 * renombrarla sería una migración para decir lo que la columna ya decía.
 */
export type FrenteKey = "ventas" | "cs";

/**
 * Qué Set de emails alimenta un frente (`classifyTeamEmailsByArea` en lib/sessions/areas.ts).
 * Es la respuesta a "¿de quién son las sesiones que muestra este frente?", y va aparte del
 * rótulo a propósito: el bug fue exactamente que el rótulo cambió y el equipo no.
 */
export type EquipoDeFrente = "ventas" | "entrega" | "desarrollo";

export interface Frente {
  key: FrenteKey;
  label: string;
  equipo: EquipoDeFrente;
}

const FRENTE_VENTAS: Frente = { key: "ventas", label: "Ventas", equipo: "ventas" };

/**
 * Qué frentes muestra el widget de sesiones de este proyecto, EN ORDEN.
 *
 * El rótulo del frente de entrega sale de la tabla (`frenteDeEntrega`). Lo único que no es
 * una fila es el overlay del hermano, que va acá con su motivo al lado — igual que
 * `OVERLAY_INTERNO`:
 *
 * ── POR QUÉ UN HERMANO PIERDE "VENTAS" ───────────────────────────────────────
 * Un desarrollo que cuelga de una implementación no tiene conversación comercial propia: se
 * vendió con el hermano, y ahí es donde vive. Mostrarle un frente "Ventas" vacío le diría al
 * equipo que falta agendar algo que no existe — y la tira del proyecto ya enlaza al hermano
 * para quien quiera verla.
 */
export function frentesDeProyecto(facts: ProjectFacts): readonly Frente[] {
  const def = resolvePipeline(facts.hubspotPipelineId);
  const entrega: Frente = {
    key: "cs",
    label: def?.frenteDeEntrega ?? "CSE",
    // Sin fila declarada, la de siempre: CSE ∪ Desarrollo.
    equipo: def?.equipoDeEntrega ?? "entrega",
  };
  if (facts.tieneHermanoCs && def?.canBeSiblingOf.includes("customer-success")) return [entrega];
  return [FRENTE_VENTAS, entrega];
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
/**
 * El `rawStatus` que consume `decidirCierre`, armado desde las propiedades crudas de HubSpot.
 *
 * ── POR QUÉ ES UNA FUNCIÓN Y NO UNA LÍNEA EN CADA LLAMADOR ──────────────────
 * Son DOS propiedades que dicen lo mismo —`hs_status` (el enum de HubSpot) y
 * `estatus_del_proyecto` (el campo en español que llenan las personas)— y el orden entre ellas
 * DECIDE. Con las dos puestas y discrepando, quien pregunta primero por una obtiene un veredicto
 * distinto de quien pregunta primero por la otra.
 *
 * Eso ya pasó: el descarte de proyectos cerrados de `empresas-con-proyecto.ts` nació con el
 * orden invertido, así que podía ofrecer para traer un proyecto que el espejo —mirando el mismo
 * record— iba a cerrar. Y traer un proyecto que el espejo cierra es una cuarentena sin salida:
 * el espejo lo pone en `inactive` y hace `continue` ANTES de escribir el pipeline, el alta nunca
 * confirma, y el proyecto queda fuera de NAVEGABLE — o sea que el cartel «Reintentar» ni se
 * puede alcanzar.
 *
 * ⚠ `||` y no `??`: el caso real es el string VACÍO, no el `null`. HubSpot devuelve `""` para
 * una propiedad sin llenar, y `??` no cae con `""`.
 */
export function estadoCrudoDeHubspot(props: {
  hs_status?: string | null;
  estatus_del_proyecto?: string | null;
}): string {
  return props.hs_status || props.estatus_del_proyecto || "";
}

export function decidirCierre(input: {
  hubspotPipelineId: string | null | undefined;
  stageId: string | null | undefined;
  rawStatus: string | null | undefined;
}): "abierto" | "cerrado" {
  const def = resolvePipeline(input.hubspotPipelineId);
  const porEtapa = !!(def && input.stageId && def.closedStageIds.includes(input.stageId.trim()));
  return porEtapa || cerradoPorEstadoCrudo(input.rawStatus) ? "cerrado" : "abierto";
}
