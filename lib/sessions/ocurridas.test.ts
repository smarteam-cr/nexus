/**
 * lib/sessions/ocurridas.test.ts
 *
 * Correr: `npx vitest run lib/sessions/ocurridas.test.ts --project unit`.
 *
 * Dos cosas: la aritmética del helper, y —lo que de verdad importa— el CENSO de lectores
 * de sesiones. El censo es la guarda: sin él, el próximo camino que arme contexto para un
 * modelo nace sin el corte y NADA avisa (el prompt sale igual, el documento sale igual,
 * solo que hablando de reuniones que no ocurrieron). Es el modo de falla exacto que este
 * archivo vino a cerrar, y ya se había cerrado cuatro veces por separado.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { yaOcurrio, soloOcurridas, whereYaOcurrio } from "./ocurridas";

const AYER = new Date("2026-08-17T12:00:00.000Z");
const HOY = new Date("2026-08-18T12:00:00.000Z");
const MANIANA = new Date("2026-08-19T12:00:00.000Z");

describe("yaOcurrio", () => {
  it("pasado sí, futuro no, y el borde exacto cuenta como ocurrida", () => {
    expect(yaOcurrio(AYER, HOY)).toBe(true);
    expect(yaOcurrio(MANIANA, HOY)).toBe(false);
    // Una reunión que arranca en este mismo instante ya empezó.
    expect(yaOcurrio(HOY, HOY)).toBe(true);
  });

  it("acepta Date y epoch ms indistintamente", () => {
    expect(yaOcurrio(AYER.getTime(), HOY.getTime())).toBe(true);
    expect(yaOcurrio(MANIANA.getTime(), HOY)).toBe(false);
  });
});

describe("soloOcurridas", () => {
  it("conserva el orden de entrada y saca solo lo que no pasó", () => {
    const filas = [
      { id: "vieja", date: AYER },
      { id: "agendada", date: MANIANA },
      { id: "recien", date: HOY },
    ];
    expect(soloOcurridas(filas, HOY).map((f) => f.id)).toEqual(["vieja", "recien"]);
  });

  it("lista vacía → lista vacía (no explota)", () => {
    expect(soloOcurridas([], HOY)).toEqual([]);
  });
});

describe("whereYaOcurrio", () => {
  it("devuelve el techo como { date: { lte } }", () => {
    expect(whereYaOcurrio(HOY)).toEqual({ date: { lte: HOY } });
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   EL CENSO — cada lector de sesiones, clasificado, con el motivo escrito.

   `contexto`  el material va a un prompt, o se convierte en una AFIRMACIÓN sobre lo que
               pasó ("se sostuvieron N reuniones", "el kickoff ya ocurrió"). DEBE cortar
               por fecha, o por algo que implique que la reunión pasó (transcripción).
   `agenda`    la persona quiere ver el futuro: la próxima reunión, la lista de /sessions,
               las candidatas del modal. NO debe cortar — esconderlo sería el bug opuesto.
   `plomeria`  ni una cosa ni la otra: ingest, hidratación de ids ya elegidos, resolución
               de dueño. La fecha no cambia lo que hace.

   ⚠ Si agregás un lector de sesiones, el escaneo de abajo se pone rojo hasta que lo
   clasifiques acá. Ese rojo ES la guarda: te obliga a contestar "¿esto le habla a un
   modelo o le habla a una persona?" antes de que salga a producción.
   ───────────────────────────────────────────────────────────────────────────── */
type Clase = "contexto" | "agenda" | "plomeria";

/**
 * `indirecto` = no consulta Prisma; lee por un chokepoint (típicamente
 * `getProjectHandoffSessions`). El escaneo no puede descubrirlos —busca la consulta— así
 * que están acá a mano y quedan exentos del control de "entradas muertas". Se anotan igual
 * porque el riesgo es el mismo: heredan lo que el chokepoint traiga, y si el chokepoint
 * decide no cortar (correcto para membresía), el corte les toca a ellos.
 */
const CENSO: Record<string, { clase: Clase; motivo: string; indirecto?: true }> = {
  // ── contexto: cortan, y el corte se verifica abajo ───────────────────────────
  "lib/sessions/project-sources.ts": {
    clase: "contexto",
    motivo: "getClientSessions: la ventana de 200 del análisis. Era el peor caso — 42% de Multiquímica.",
  },
  "lib/sessions/project-sessions.ts": {
    clase: "contexto",
    motivo: "El agente de avance. Ya cortaba desde su primer día; es el precedente que este archivo generaliza.",
  },
  "lib/cs/load-account.ts": { clase: "contexto", motivo: "El resumen de cuenta de CS. Ya cortaba." },
  "lib/ventas/propuesta-de-cierre-server.ts": {
    clase: "contexto",
    motivo: "La propuesta de fecha de cierre y monto de un negocio (2026-10-14). Lee por getClientSessions, que corta en hoy.",
  },
  "lib/projects/project-brief.ts": {
    clase: "contexto",
    indirecto: true,
    motivo:
      "El resumen por proyecto. Desde la Etapa 0 de la memoria (2026-10-09) lee por getProjectMemberSessions " +
      "(included + belongsToClient + piso) y corta con soloOcurridas; solo cuenta en la base las que ya eligió.",
  },
  "lib/cs/watchdog-context.ts": { clase: "contexto", motivo: "El vigilante. Ya cortaba, citando las fechas corruptas 2037+." },
  "lib/cs/watchdog-cuenta.ts": {
    clase: "contexto",
    motivo: "Las reuniones de la CUENTA que lee el vigilante (con el cliente e internas). Corta por fecha desde el primer día.",
  },
  "lib/carga/queries.ts": {
    clase: "contexto",
    motivo:
      "La carga de CS y la rentabilidad AFIRMAN horas en reuniones: solo leen semanas o meses que ya cerraron (el techo es " +
      "el lunes de esta semana o el 1 del mes) y la última reunión de cada cuenta corta en `ahora`. Lo que viene se proyecta, no se lee.",
  },
  "lib/cs/cartera.ts": {
    clase: "contexto",
    motivo: "El último contacto de cada cuenta en la pantalla de la CSL: una reunión agendada no es contacto.",
  },
  "lib/projects/analyze-participants.ts": {
    clase: "contexto",
    motivo: "Manda las 8 más recientes a Claude para leer quién asiste. Le atribuía asistencias a gente que no se sentó.",
  },
  "lib/lifecycle/load.ts": {
    clase: "contexto",
    motivo: "Una sesión titulada kickoff saca al proyecto de HAND_OFF. Agendada para el jueves, lo sacaba hoy.",
  },
  "lib/handoff/congelado-server.ts": {
    clase: "contexto",
    indirecto: true,
    motivo:
      "«Buscar lo nuevo» sobre un handoff congelado (etapa 3b): las reuniones posteriores al congelado van a la IA. " +
      "Lee por computeHandoffFeeding (el chokepoint de la membresía, que NO corta) y corta acá con soloOcurridas.",
  },
  "lib/timeline/delivery-sessions.ts": {
    clase: "contexto",
    indirecto: true,
    motivo:
      "«El real ejecutado» del Gantt y de la Entrega. Lee por getProjectHandoffSessions (membresía, que NO corta " +
      "a propósito), así que el corte le toca a él: la fase en curso tiene su ventana abierta hacia adelante.",
  },
  "lib/invariantes/sesiones.ts": {
    clase: "contexto",
    motivo: "INV21 (B-07): cuenta las sesiones del cliente para AFIRMAR que un proyecto quedó sin reuniones. Corta por `date: { lte: ahora }` — una reunión agendada no es una reunión que hubo.",
  },
  "app/api/sales/analyze/route.ts": {
    clase: "contexto",
    motivo: "Acotado por `transcript: { not: null }` sobre ids explícitos — una futura no tiene transcripción.",
  },
  "app/api/business-cases/[id]/generate/route.ts": {
    clase: "contexto",
    motivo: "Lee ids que el vendedor eligió, y solo su `transcript`. Una futura aporta null, no ruido.",
  },
  "lib/contexto/cargar.ts": {
    clase: "contexto",
    motivo:
      "El material del «Contexto del cronograma» (2026-09-23): lee el resumen, la minuta y el inicio del " +
      "transcript de las reuniones que el CSE eligió, para el detalle, el revisor de fases y el chat. Ya las filtra " +
      "con soloOcurridas y la consulta vuelve a cortar por fecha: una agendada que el CSE eligió sale en el " +
      "informe de la pantalla («Aún no ocurrió»), nunca en el prompt.",
  },
  "lib/contexto/material-del-documento.ts": {
    clase: "contexto",
    motivo:
      "Las reuniones ELEGIDAS de un documento del proyecto (etapa 7), enteras: la minuta y la transcripción cortada en " +
      "SQL. Ya las filtra con soloOcurridas, la consulta de la minuta vuelve a cortar por fecha y la de la transcripción " +
      "(y la que dice cuáles tienen algo que leer) solo recibe los ids que pasaron ese corte.",
  },
  "lib/memoria/cargar.ts": {
    clase: "contexto",
    motivo:
      "La memoria del proyecto (etapa 3, 2026-10-09): lo que dejó cada reunión (resumen y minuta, nunca la transcripción) " +
      "va a los agentes. Los ids salen de getProjectMemberSessions + soloOcurridas y la consulta vuelve a cortar por fecha.",
  },

  // ── agenda: NO cortan, y es la decisión correcta ─────────────────────────────
  "lib/sessions/cargar-sesiones-categorizadas.ts": {
    clase: "agenda",
    motivo: "El cargador de /sessions y de GET /api/sessions/grupo (C-20). Decisión CTX1.2: las 459 futuras se MARCAN, no se esconden. Cortar acá sería volver al bug anterior.",
  },
  "app/(shell)/sales/page.tsx": { clase: "agenda", motivo: "Listado de reuniones de Ventas; la agenda es parte de lo que se mira." },
  "app/api/projects/[projectId]/gps/route.ts": { clase: "agenda", motivo: "«Próxima reunión» — su razón de ser es el futuro." },
  "app/api/projects/[projectId]/session-candidates/route.ts": {
    clase: "agenda",
    motivo: "El modal de curación marca las futuras a propósito (candidatas-internas). Esconderlas rompe el rescate.",
  },
  "app/api/projects/[projectId]/session-candidates/sin-duenio/route.ts": {
    clase: "agenda",
    motivo: "El buscador del mismo modal, sobre las sin dueño: una persona elige. Ya deja afuera las futuras, como el resto de las candidatas.",
  },
  "lib/sessions/reuniones-para-tareas.ts": {
    clase: "contexto",
    motivo:
      "Tareas internas: las notas de una reunión llegan a Haiku para proponer tareas. Solo las que ya ocurrieron " +
      "(techo de fecha); `salasDeReuniones` solo hidrata ids que ya están en tareas, para mostrar o esconder la cita.",
  },
  "lib/sessions/calendario-de-quien-busca.ts": {
    clase: "agenda",
    motivo:
      "«De tu calendario» del buscador de «Contexto adicional» (todos los documentos y la preventa): una persona elige. " +
      "Ya deja afuera las futuras; lo que llega al modelo lo corta después el cargador de cada documento.",
  },
  "app/api/projects/[projectId]/project-sessions/route.ts": { clase: "agenda", motivo: "Curación de membresía: se decide sobre TODO, incluida la agenda." },
  "app/api/projects/[projectId]/meetings/route.ts": { clase: "agenda", motivo: "La pestaña Reuniones del proyecto." },
  "lib/business-cases/feeding.ts": {
    clase: "agenda",
    motivo:
      "Arma las CANDIDATAS del business case (panel + preselección), no el prompt. La generación lee ids elegidos y " +
      "solo su transcripción, así que una futura no llega al modelo. Se deja visible por consistencia con CTX1.2.",
  },
  "lib/clients/meeting-dates.ts": { clase: "agenda", motivo: "Última reunión por equipo, por SQL crudo (DISTINCT ON, C-11). Ya separa pasado de futuro por su cuenta." },
  "lib/handoff/feeding.ts": {
    clase: "plomeria",
    motivo: "Mide el largo del transcript de ids YA elegidos por el chokepoint (sin cargar el blob); la membresía y el corte los decide session-relevance.",
  },
  "lib/clients/last-interaction.ts": { clase: "agenda", motivo: "Última interacción Y próxima: hace las DOS consultas, partidas a propósito." },
  "components/clients/EspacioSesiones.tsx": {
    clase: "agenda",
    motivo:
      "El espacio de un ALIADO: el mapa de reuniones que tuvimos con ellos. Es lo que la persona " +
      "vino a mirar, agenda incluida — se separan en dos bloques, no se esconden (CTX1.2).",
  },

  // ── plomería ─────────────────────────────────────────────────────────────────
  "lib/cs/watchdog.ts": {
    clase: "plomeria",
    motivo: "Verifica que la frase de una queja esté tal cual en la reunión que cita el agente (por id y por el chokepoint). No le describe reuniones al modelo.",
  },
  "lib/google/meet-sync.ts": { clase: "plomeria", motivo: "Ingest desde Google. Su propio techo (`timeMax`) es lo que acota qué entra." },
  "lib/google/meet-enrichment.ts": { clase: "plomeria", motivo: "Lectura del documento de Meet. Ya filtra `date < now - 1h` (Tanda R)." },
  "lib/sessions/reclassify.ts": { clase: "plomeria", motivo: "Re-atribuye dueño. La fecha no cambia de quién es una reunión." },
  "lib/sessions/resolve-client.ts": { clase: "plomeria", motivo: "La cascada de dueño, sobre el corpus entero a propósito." },
  "lib/sessions/reunion-a-mano-server.ts": {
    clase: "plomeria",
    motivo:
      "«Agregar una reunión» (etapa 4f): lee las del cliente un día por el chokepoint (`getClientSessions`, que ya corta en hoy) para preguntar si es una de ellas, y solo mira si tienen texto. No le describe reuniones a un modelo.",
  },
  "lib/sessions/vincular-al-llegar.ts": {
    clase: "plomeria",
    motivo: "Memoria de la cuenta, etapa 2: vincula a su proyecto las reuniones con solo notas (el clasificador). Ya corta por `date: { lte: ahora - 1h }`.",
  },
  "lib/invariantes/lecturas.ts": {
    clase: "plomeria",
    motivo: "INV44: mira si las reuniones recientes de clientes y prospectos tienen su lectura. Corta por `date: { lte: ahora }`; no afirma nada sobre el contenido.",
  },
  "app/api/business-cases/[id]/sessions/route.ts": {
    clase: "plomeria",
    motivo: "Quitar o devolver reuniones al contexto de una propuesta: solo lee el DUEÑO de los ids elegidos para no mezclar clientes (INV1). No le describe nada a un modelo.",
  },
  "lib/sessions/classify-session-project.ts": { clase: "plomeria", motivo: "Vínculos existentes de UNA sesión (candados y tombstones)." },
  "app/(shell)/sessions/[id]/page.tsx": { clase: "plomeria", motivo: "Los proyectos de una sesión puntual." },
  "lib/sessions/reuniones-para-seguimiento.ts": {
    clase: "plomeria",
    motivo:
      "«Lo que dejó esta reunión» (2026-10-09): el dueño y los proyectos de UNA reunión, y las reuniones recientes de tus " +
      "proyectos para «Para ti». Lo lee una persona, no un modelo; solo mira reuniones que ya ocurrieron (una agendada no dejó nada).",
  },
  "app/api/sessions/[id]/projects/route.ts": { clase: "plomeria", motivo: "Ídem, por API." },
  "app/api/clients/[id]/handoffs/route.ts": { clase: "plomeria", motivo: "Listado de handoffs; toca sesiones solo de refilón." },
  "app/api/projects/[projectId]/handoff/route.ts": { clase: "plomeria", motivo: "Hidrata los `sourceSessionIds` de una corrida ya hecha." },
  "app/api/projects/[projectId]/agent-runs/[runId]/route.ts": { clase: "plomeria", motivo: "Ídem, para el historial de corridas." },
  // L4 (2026-09-26): el mensaje de arriba de la propuesta del cronograma.
  "lib/timeline/leer-referencias.ts": {
    clase: "plomeria",
    motivo: "Hidrata los `sourceSessionIds` de las corridas de la propuesta (título y fecha para el chip de su fuente). Lo lee una persona; no le habla a un modelo.",
  },
  // L6 (2026-09-26): el porqué de la propuesta, con fuentes nuevas.
  "lib/timeline/fuentes-de-la-explicacion.ts": {
    clase: "contexto",
    motivo:
      "Las reuniones NUEVAS que leyó el paso 2 (resumen y minuta) van a la llamada de Haiku que explica la propuesta. " +
      "Son ids que el material ya filtró con soloOcurridas, y la consulta vuelve a cortar por fecha (hasta que leyó).",
  },
  // Exploraciones de venta (2026-10-01): lo que lee el agente que prepara y lee las reuniones.
  "lib/exploraciones/fuentes.ts": {
    clase: "contexto",
    motivo:
      "Las reuniones de Meet del prospecto van al agente de la exploración con su transcripción completa (las citas se verifican contra ella). " +
      "Los ids salen de getClientSessions (solo las ocurridas) y la consulta de la transcripción vuelve a cortar por fecha.",
  },
  // Procesos del cliente (2026-10-05): el agente que mapea cada proceso hoy y después.
  "lib/procesos/agente.ts": {
    clase: "contexto",
    motivo:
      "Lee enteras las reuniones del cliente con transcripción para sacar hechos con cita. Los ids salen de " +
      "getClientSessions (solo las ocurridas) y la consulta de la transcripción vuelve a cortar por fecha.",
  },
  // Hechos de una reunión (memoria de la cuenta, etapas 5 y 6): la reunión entera va a la lectura de hechos.
  // La migración de las reuniones de los documentos (2026-10-10) y la sugerencia «Reunión con el cliente en este proyecto».
  "lib/contexto/migracion-de-reuniones.ts": {
    clase: "contexto",
    indirecto: true,
    motivo:
      "La regla vieja de los seis documentos: qué reuniones leía cada uno antes de la etapa 7. La usan " +
      "scripts/migrar-reuniones-de-los-documentos.ts (elige las 6 más recientes, que después van al prompt) y las sugerencias " +
      "del panel. Recibe la membresía del chokepoint (getProjectMemberSessions, que NO corta) y corta acá con yaOcurrio.",
  },
  "lib/sessions/reunion-para-hechos.ts": {
    clase: "contexto",
    motivo:
      "La transcripción y las notas de UNA reunión van a la lectura de hechos (las citas se verifican contra ellas). " +
      "La pertenencia la decide getClientSessions (solo las ocurridas) y la consulta del texto vuelve a cortar por fecha.",
  },
};

/**
 * Lectores INDIRECTOS de contexto: no consultan Prisma, componen un chokepoint. El escaneo
 * no los ve, así que su corte se verifica acá por nombre — y el archivo tiene que existir,
 * o la entrada se volvió letra muerta sin que nadie se entere.
 */
const INDIRECTOS_QUE_CORTAN: Array<{ archivo: string; llama: string }> = [
  { archivo: "lib/timeline/delivery-sessions.ts", llama: "soloOcurridas(" },
  // El planificador del presupuesto del handoff: puro, recibe `ahoraMs` y filtra antes de repartir.
  { archivo: "lib/handoff/session-budget.ts", llama: "soloOcurridas(" },
  // El resumen por proyecto (Etapa 0 de la memoria): lee por getProjectMemberSessions y corta acá.
  { archivo: "lib/projects/project-brief.ts", llama: "soloOcurridas(" },
  // «Buscar lo nuevo» (etapa 3b): lo posterior al congelado, por computeHandoffFeeding, corta acá.
  { archivo: "lib/handoff/congelado-server.ts", llama: "soloOcurridas(" },
  // La regla vieja de los documentos (migración del 2026-10-10 y la sugerencia de la regla vieja): pura, corta con yaOcurrio.
  { archivo: "lib/contexto/migracion-de-reuniones.ts", llama: "yaOcurrio(" },
];

/** Los que declaran `contexto` Y cortan por fecha (los otros cortan por transcripción). */
const CORTAN_POR_FECHA = [
  "lib/sessions/project-sources.ts",
  "lib/sessions/reuniones-para-tareas.ts",
  "lib/sessions/project-sessions.ts",
  "lib/cs/load-account.ts",
  "lib/cs/watchdog-context.ts",
  "lib/cs/watchdog-cuenta.ts",
  "lib/cs/cartera.ts",
  "lib/carga/queries.ts",
  "lib/projects/analyze-participants.ts",
  "lib/lifecycle/load.ts",
  "lib/contexto/cargar.ts",
  "lib/contexto/material-del-documento.ts",
  "lib/memoria/cargar.ts",
  "lib/timeline/fuentes-de-la-explicacion.ts",
  "lib/exploraciones/fuentes.ts",
  "lib/procesos/agente.ts",
  "lib/sessions/reunion-para-hechos.ts",
];

const RAIZ = join(__dirname, "..", "..");
// C-11 (2026-09-04): un lector por SQL crudo (`FROM "FirefliesSession"`) también es un lector — sin
// esta rama, meeting-dates (que pasó a DISTINCT ON) quedaba «fantasma» y dos lectores crudos que ya
// existían nacían exentos de la guarda.
const LEE_SESIONES = /(firefliesSession|sessionProject)\.findMany|FROM "FirefliesSession"/;

function archivosDeCodigo(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) archivosDeCodigo(full, out);
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

describe("censo de lectores de sesiones", () => {
  /* ⚠ `components` entró al escaneo cuando el primer server component fuera de `app` empezó a
     consultar sesiones (el espacio de reuniones de un aliado). Sin él, un lector nuevo nacía
     exento de la guarda solo por vivir en otra carpeta — que es exactamente el agujero por el
     que este archivo existe. */
  const lectores = [join(RAIZ, "lib"), join(RAIZ, "app"), join(RAIZ, "components")]
    .flatMap((d) => archivosDeCodigo(d))
    .filter((f) => LEE_SESIONES.test(readFileSync(f, "utf8")))
    .map((f) => relative(RAIZ, f).split(sep).join("/"))
    .sort();

  it("todo lector de sesiones está clasificado (contexto / agenda / plomería)", () => {
    const sinClasificar = lectores.filter((f) => !(f in CENSO));
    expect(
      sinClasificar,
      `Lector(es) de sesiones sin clasificar en el CENSO de ocurridas.test.ts:\n` +
        sinClasificar.map((f) => `  · ${f}`).join("\n") +
        `\n\nNo es burocracia: contestá si esto le habla a un MODELO (→ "contexto": tiene que ` +
        `cortar por fecha o por transcripción) o a una PERSONA (→ "agenda": no debe cortar). ` +
        `Un lector de contexto sin el corte le describe al modelo reuniones que no ocurrieron, ` +
        `y no falla en ningún lado.`,
    ).toEqual([]);
  });

  it("el censo no tiene entradas muertas", () => {
    const vivos = new Set(lectores);
    const fantasmas = Object.keys(CENSO).filter((f) => !CENSO[f].indirecto && !vivos.has(f));
    expect(
      fantasmas,
      `Entradas del CENSO que ya no leen sesiones — borralas en vez de dejarlas:\n` +
        fantasmas.map((f) => `  · ${f}`).join("\n"),
    ).toEqual([]);
  });

  it("cada lector de CONTEXTO que corta por fecha lo sigue haciendo", () => {
    // Un techo de fecha se escribe de varias formas legítimas (`lte`, `lt`, con o sin
    // `AND`), así que se busca el operador, no una cadena exacta.
    const TECHO = /\b(lte|lt):\s*(new Date\(|ahora|now|nowDate|opts\.before|techo|ahoraContador)/;
    const sinTecho = CORTAN_POR_FECHA.filter((f) => !TECHO.test(readFileSync(join(RAIZ, f), "utf8")));
    expect(
      sinTecho,
      `Estos archivos declaran cortar por fecha y ya no tienen ningún techo:\n` +
        sinTecho.map((f) => `  · ${f}`).join("\n") +
        `\n\nSacar el techo devuelve al prompt las reuniones agendadas, en silencio.`,
    ).toEqual([]);
  });

  it("los lectores INDIRECTOS siguen existiendo y siguen cortando", () => {
    const rotos = INDIRECTOS_QUE_CORTAN.filter(({ archivo, llama }) => {
      let src: string;
      try {
        src = readFileSync(join(RAIZ, archivo), "utf8");
      } catch {
        return true; // el archivo se movió o se borró: la entrada quedó mintiendo
      }
      return !src.includes(llama);
    });
    expect(
      rotos.map((r) => r.archivo),
      `Estos leen sesiones por un chokepoint (que NO corta, a propósito) y el corte les tocaba a ellos:\n` +
        rotos.map((r) => `  · ${r.archivo} — ya no llama a ${r.llama}`).join("\n"),
    ).toEqual([]);
  });

  it("los lectores de AGENDA no cortan — esconder el futuro es el bug opuesto", () => {
    // /sessions es el caso canónico: la decisión CTX1.2 fue marcarlas, no esconderlas.
    // C-20: la consulta vive en el cargador compartido; la página ya no consulta nada.
    const sessions = readFileSync(join(RAIZ, "lib/sessions/cargar-sesiones-categorizadas.ts"), "utf8");
    expect(sessions).not.toMatch(/date:\s*\{\s*lte:\s*new Date\(\)/);
  });
});

describe("/sales no carga el texto de las transcripciones para saber si existen (C-10)", () => {
  /* Medido el 2026-09-03: la lista de Ventas traía `transcript` entero de todas las reuniones
     con un rep, y lo único que hacía con él era `!!s.transcript`. Mismo patrón que /sessions:
     la lista sin el blob, y los ids con transcript por una consulta aparte. */
  it("el select de la lista no trae `transcript`, y los ids con transcript salen aparte excluyendo el vacío", () => {
    /* La edición que lo pone en rojo: volver a `transcript: true` en el select «porque es más simple». */
    const src = readFileSync(join(RAIZ, "app/(shell)/sales/page.tsx"), "utf8").replace(/\/\/[^\n]*/g, "");
    expect(src, "el blob entero de todas las reuniones de Ventas, por visita").not.toMatch(/transcript:\s*true/);
    expect(src).toMatch(/transcript:\s*\{\s*not:\s*null\s*\}/);
    expect(src, '`""` no es un transcript: el conteo de analizables tiene que ser el de antes').toMatch(/NOT:\s*\{\s*transcript:\s*""\s*\}/);
    expect(src).toContain("idsConTranscript.has(s.id)");
  });
});
