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
  "lib/projects/project-brief.ts": { clase: "contexto", motivo: "El resumen por proyecto. Ya cortaba (su const se llama `ocurridas`)." },
  "lib/cs/watchdog-context.ts": { clase: "contexto", motivo: "El vigilante. Ya cortaba, citando las fechas corruptas 2037+." },
  "lib/projects/analyze-participants.ts": {
    clase: "contexto",
    motivo: "Manda las 8 más recientes a Claude para leer quién asiste. Le atribuía asistencias a gente que no se sentó.",
  },
  "lib/lifecycle/load.ts": {
    clase: "contexto",
    motivo: "Una sesión titulada kickoff saca al proyecto de HAND_OFF. Agendada para el jueves, lo sacaba hoy.",
  },
  "lib/timeline/delivery-sessions.ts": {
    clase: "contexto",
    indirecto: true,
    motivo:
      "«El real ejecutado» del Gantt y de la Entrega. Lee por getProjectHandoffSessions (membresía, que NO corta " +
      "a propósito), así que el corte le toca a él: la fase en curso tiene su ventana abierta hacia adelante.",
  },
  "app/api/clients/[id]/canvas/refresh/route.ts": {
    clase: "contexto",
    motivo: "Sesiones recientes al prompt. `enrichedAt` no implica que ocurrió: el sellado viejo marcaba antes de tiempo.",
  },
  "app/api/projects/[projectId]/process-session/route.ts": {
    clase: "contexto",
    motivo: "Toma 50 y manda 5 a Claude. Las agendadas se llevaban las plazas trayendo nada.",
  },
  "app/api/sessions/analyze/route.ts": { clase: "contexto", motivo: "El hub de análisis. Ya cortaba (`date: { lt: new Date() }`)." },
  "app/api/sales/analyze/route.ts": {
    clase: "contexto",
    motivo: "Acotado por `transcript: { not: null }` sobre ids explícitos — una futura no tiene transcripción.",
  },
  "app/api/business-cases/[id]/generate/route.ts": {
    clase: "contexto",
    motivo: "Lee ids que el vendedor eligió, y solo su `transcript`. Una futura aporta null, no ruido.",
  },
  "app/api/integrations/summarize/route.ts": {
    clase: "contexto",
    motivo: "Resume lo que tiene transcripción y no tiene resumen. Una futura no entra por construcción.",
  },

  // ── agenda: NO cortan, y es la decisión correcta ─────────────────────────────
  "app/(shell)/sessions/page.tsx": {
    clase: "agenda",
    motivo: "Decisión CTX1.2: las 459 futuras se MARCAN, no se esconden. Cortar acá sería volver al bug anterior.",
  },
  "app/(shell)/sales/page.tsx": { clase: "agenda", motivo: "Listado de reuniones de Ventas; la agenda es parte de lo que se mira." },
  "app/api/projects/[projectId]/gps/route.ts": { clase: "agenda", motivo: "«Próxima reunión» — su razón de ser es el futuro." },
  "app/api/projects/[projectId]/session-candidates/route.ts": {
    clase: "agenda",
    motivo: "El modal de curación marca las futuras a propósito (candidatas-internas). Esconderlas rompe el rescate.",
  },
  "app/api/projects/[projectId]/project-sessions/route.ts": { clase: "agenda", motivo: "Curación de membresía: se decide sobre TODO, incluida la agenda." },
  "app/api/projects/[projectId]/meetings/route.ts": { clase: "agenda", motivo: "La pestaña Reuniones del proyecto." },
  "lib/business-cases/feeding.ts": {
    clase: "agenda",
    motivo:
      "Arma las CANDIDATAS del business case (panel + preselección), no el prompt. La generación lee ids elegidos y " +
      "solo su transcripción, así que una futura no llega al modelo. Se deja visible por consistencia con CTX1.2.",
  },
  "lib/clients/meeting-dates.ts": { clase: "agenda", motivo: "Primera/última reunión. Ya separa pasado de futuro por su cuenta." },
  "lib/clients/last-interaction.ts": { clase: "agenda", motivo: "Última interacción Y próxima: hace las DOS consultas, partidas a propósito." },

  // ── plomería ─────────────────────────────────────────────────────────────────
  "lib/google/meet-sync.ts": { clase: "plomeria", motivo: "Ingest desde Google. Su propio techo (`timeMax`) es lo que acota qué entra." },
  "lib/google/meet-enrichment.ts": { clase: "plomeria", motivo: "Lectura del documento de Meet. Ya filtra `date < now - 1h` (Tanda R)." },
  "lib/sessions/reclassify.ts": { clase: "plomeria", motivo: "Re-atribuye dueño. La fecha no cambia de quién es una reunión." },
  "lib/sessions/resolve-client.ts": { clase: "plomeria", motivo: "La cascada de dueño, sobre el corpus entero a propósito." },
  "lib/sessions/classify-session-project.ts": { clase: "plomeria", motivo: "Vínculos existentes de UNA sesión (candados y tombstones)." },
  "app/(shell)/sessions/[id]/page.tsx": { clase: "plomeria", motivo: "Los proyectos de una sesión puntual." },
  "app/api/sessions/[id]/projects/route.ts": { clase: "plomeria", motivo: "Ídem, por API." },
  "app/api/clients/[id]/handoffs/route.ts": { clase: "plomeria", motivo: "Listado de handoffs; toca sesiones solo de refilón." },
  "app/api/projects/[projectId]/handoff/route.ts": { clase: "plomeria", motivo: "Hidrata los `sourceSessionIds` de una corrida ya hecha." },
  "app/api/projects/[projectId]/agent-runs/[runId]/route.ts": { clase: "plomeria", motivo: "Ídem, para el historial de corridas." },
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
];

/** Los que declaran `contexto` Y cortan por fecha (los otros cortan por transcripción). */
const CORTAN_POR_FECHA = [
  "lib/sessions/project-sources.ts",
  "lib/sessions/project-sessions.ts",
  "lib/cs/load-account.ts",
  "lib/projects/project-brief.ts",
  "lib/cs/watchdog-context.ts",
  "lib/projects/analyze-participants.ts",
  "lib/lifecycle/load.ts",
  "app/api/clients/[id]/canvas/refresh/route.ts",
  "app/api/projects/[projectId]/process-session/route.ts",
  "app/api/sessions/analyze/route.ts",
];

const RAIZ = join(__dirname, "..", "..");
const LEE_SESIONES = /(firefliesSession|sessionProject)\.findMany/;

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
  const lectores = [join(RAIZ, "lib"), join(RAIZ, "app")]
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
    const sessions = readFileSync(join(RAIZ, "app/(shell)/sessions/page.tsx"), "utf8");
    expect(sessions).not.toMatch(/date:\s*\{\s*lte:\s*new Date\(\)/);
  });
});
