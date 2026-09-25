/**
 * lib/contexto/estructura-cronograma.test.ts — EL CONTEXTO DEL REVISOR DE FASES Y TIEMPOS, SU
 * CARGADOR, SU RUTA Y LA CADENA DE LA PANTALLA («Regenerar todo» en dos pasos, 2026-09-23).
 *
 * Correr: `npx vitest run lib/contexto/estructura-cronograma.test.ts --project unit`.
 *
 * El modo de falla de esto no es un error: es gastar de más (llamar al modelo o leer el handoff
 * sin material), pisar la propuesta del handoff, pedir otra vara que el paso 2, o dejar al CSE con
 * una cadena colgada. Estas guardas miran el calendario, el mensaje, el cargador (llamándolo, con
 * Prisma de mentira), la ruta y la pantalla.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  REGLA_DE_FRONTERA_DE_ESTRUCTURA,
  SIN_HANDOFF_PARA_ESTRUCTURA,
  calendarioDeEstructura,
  fotoDeEstructura,
  fuentesDeEstructura,
  hayQueRevisarLasFases,
  cierreActualDelPlan,
  largoDelPlanEnSemanas,
  lineaDeLaSemanaCero,
  lineaDelCierreActual,
  renderEstructuraDelCronograma,
  tieneMaterialDelCronograma,
} from "./estructura-cronograma";
import { FRONTERA_DEL_MATERIAL, type FotoDelCronograma } from "./material-cronograma";
import { PIEZAS_CON_CONTEXTO_NOMBRADO } from "./tipos";
import { fraseDelPlazo, hayMaterialParaElPaso1 } from "@/lib/timeline/propuesta-de-estructura";
import { textoDeLaLineaDeTareas } from "@/lib/timeline/borrador";

// ── El cargador se prueba LLAMÁNDOLO (mismo molde que cargar-material.test.ts) ──────────────
const h = vi.hoisted(() => {
  const estado = {
    sesiones: [] as Array<{ id: string; title: string; date: number; participants: string[] }>,
    filas: new Map<string, { id: string; title: string; summary: unknown; minute: null }>(),
    notas: [] as Array<{ title: string | null; content: string; createdAt: Date }>,
  };
  const prisma = {
    firefliesSession: {
      findMany: vi.fn(async (args: { where: { id: { in: string[] } } }) =>
        args.where.id.in.map((id) => estado.filas.get(id)).filter(Boolean),
      ),
    },
    $queryRaw: vi.fn(async () => []),
    projectTimeline: { findUnique: vi.fn(async () => null) },
    timelineSource: { findMany: vi.fn(async () => estado.notas) },
    projectCanvas: { findFirst: vi.fn(async () => ({ sections: [{ key: "__doc", brief: "Solo marketing." }] })) },
    project: { findUnique: vi.fn(async () => ({ hubspotPipelineId: null })) },
  };
  const loadHandoffContext = vi.fn(async () => "HANDOFF-CONFIRMADO");
  return { estado, prisma, loadHandoffContext };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: h.prisma }));
vi.mock("@/lib/sessions/project-sources", () => ({
  getProjectTimelineSessions: vi.fn(async () => ({ sessions: h.estado.sesiones, dropped: [] })),
}));
vi.mock("@/lib/cache/session-categories", () => ({ getSessionCategories: vi.fn(async () => []) }));
vi.mock("@/lib/canvas/load-canvas-context", () => ({
  loadHandoffContext: h.loadHandoffContext,
  loadTimelineContext: vi.fn(),
}));
vi.mock("@/lib/canvas/desarrollo-context", () => ({ loadDesarrolloContext: vi.fn() }));
vi.mock("@/lib/cs/hubspot-ops-block", () => ({ bloqueDeOperativa: vi.fn(() => "") }));

const { cargarContextoDeEstructura } = await import("./cargar");

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const soloCodigo = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
/** El código entre dos marcadores. TIRA si falta alguno: un tramo vacío o hasta el final del
 *  archivo haría pasar una negación mirando otra cosa. */
const tramoDe = (src: string, desde: string, hasta: string) => {
  const i = src.indexOf(desde);
  if (i < 0) throw new Error(`no encuentro el inicio del tramo: «${desde}»`);
  const j = src.indexOf(hasta, i + desde.length);
  if (j < 0) throw new Error(`no encuentro el fin del tramo: «${hasta}» (después de «${desde}»)`);
  return src.slice(i, j);
};

const DIA = 86_400_000;
const AHORA = Date.UTC(2026, 9, 7, 18); // miércoles 7 oct 2026, semana 4 del proyecto

/** Lunes 14 sep. Semanas del proyecto desde 1: S0 1 · Arquitectura 2–4 · Configuración 5–8. */
const TL = {
  anchorStartDate: new Date("2026-09-14T00:00:00.000Z"),
  closeDateOverride: null,
  phases: [
    { id: "s0", name: "Semana 0", durationWeeks: 1, startWeek: null, status: "DONE", tasks: [{ status: "DONE" }] },
    {
      id: "arq",
      name: "Arquitectura",
      durationWeeks: 3,
      startWeek: null,
      status: "IN_PROGRESS",
      tasks: [{ status: "DONE" }, { status: "PENDING" }],
    },
    { id: "conf", name: "Configuración", durationWeeks: 4, startWeek: 4, status: "PENDING", tasks: [] },
  ],
};
const FOTO: FotoDelCronograma = fotoDeEstructura(TL);

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
});
afterAll(() => {
  vi.useRealTimers();
});
beforeEach(() => {
  vi.clearAllMocks();
  h.estado.sesiones = [];
  h.estado.filas = new Map();
  h.estado.notas = [];
});

describe("G5 · el calendario: ids, estado, «Hoy», semanas desde 1 y fechas", () => {
  it("con ancla", () => {
    /* La edición que la pone en rojo: pasar a base 0, perder las fechas, o soltar una de las tres
       opciones (sin ids el modelo no puede nombrar la fase; sin estado, toca lo terminado). */
    const cal = calendarioDeEstructura(FOTO, AHORA);
    expect(cal).toContain("Hoy: 7 oct 2026");
    expect(cal).toContain("semana 4 del proyecto");
    expect(cal).toContain("[id: arq]");
    expect(cal).toContain("Arquitectura [id: arq] — semanas 2–4 del proyecto");
    expect(cal).toContain("1/2 tareas hechas");
    expect(cal).toContain("en curso");
    expect(cal).toContain("fijada en la semana 5 del proyecto");
    expect(cal).toContain("desde el 21 sep");
  });

  it("⭐ el calendario es la BASE de los cambios, no «solo lectura» (revisión del paso A2)", () => {
    /* El revisor reusa el calendario de los demás agentes, y el de ellos dice «solo lectura… úsalo SOLO
       para ubicar». En el mismo mensaje, el pedido le dice que proponga cambios sobre esas fases, con
       esos ids y esas semanas: un modelo que duda contesta «sin cambios» por prudencia.
       La edición que la pone en rojo: sacar `comoBaseDeCambios` de `calendarioDeEstructura`. */
    for (const cal of [
      calendarioDeEstructura(FOTO, AHORA),
      calendarioDeEstructura({ ...FOTO, anchorStartDate: null }, AHORA),
    ]) {
      expect(cal.startsWith("=== CALENDARIO DEL CRONOGRAMA ACTUAL (la base sobre la que propones")).toBe(true);
      expect(cal).toContain("Sobre este calendario propones los cambios");
      expect(cal, "el revisor volvió a recibir el calendario de «solo lectura»").not.toContain("solo lectura");
      expect(cal).not.toContain("Úsalo SOLO");
      expect(cal, "perdió la regla de las fechas en los nombres de fase").toContain(
        "⛔ No escribas fechas ni plazos en ningún nombre de fase",
      );
    }
  });

  it("sin ancla lo dice, y no inventa fechas", () => {
    const cal = calendarioDeEstructura({ ...FOTO, anchorStartDate: null }, AHORA);
    expect(cal).toContain("Sin fecha de arranque");
    expect(cal).toContain("[id: arq]");
    expect(cal).not.toMatch(/\d{1,2} (ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b/);
  });

  it("#2 / #9 · dice CUÁL es la Semana 0, o que el proyecto no tiene (Desarrollo y Web)", () => {
    /* Revisión adversarial (2026-09-24): el prompt prohíbe tocar «la Semana 0 / Kick-off» y el
       calendario no decía cuál era; en un desarrollo, el modelo proponía cambios sobre su primera fase
       («Relevamiento técnico») y el armador los descartaba en silencio por «Semana 0». La edición que
       la pone en rojo: sacar la línea del calendario, o que el cargador no le pase la decisión del
       pipeline. */
    const conS0 = calendarioDeEstructura(FOTO, AHORA, { conSemanaCero: true });
    expect(conS0).toContain("Semana 0 / Kick-off de este proyecto: «Semana 0» [id: s0]. No se toca");
    const sinS0 = calendarioDeEstructura(FOTO, AHORA, { conSemanaCero: false });
    expect(sinS0).toContain("Este proyecto NO tiene Semana 0 / Kick-off: su primera fase («Semana 0») es trabajo");
    expect(sinS0).not.toContain("No se toca");
    // El cierre actual sigue siendo la última línea.
    expect(sinS0.slice(sinS0.lastIndexOf("\n") + 1)).toBe(lineaDelCierreActual(FOTO, AHORA));
    expect(lineaDeLaSemanaCero(FOTO, undefined)).toBe("");
    const cargador = soloCodigo(leer("lib/contexto/cargar.ts"));
    /* (2026-09-24: `ahora` en vez de `Date.now()`: el reloj lo pasa la ruta, que compara el plazo
       total contra el MISMO cierre actual. Lo de esta guarda —la decisión del pipeline— no cambió.) */
    expect(cargador).toContain(
      "calendarioDeEstructura(foto, ahora, { conSemanaCero: !claveConVozDeHandoffPropia(pipelineKey) })",
    );
    const ruta = soloCodigo(leer("app/api/projects/[projectId]/timeline/estructura/route.ts"));
    expect(ruta, "el armador no sabe si el proyecto tiene Semana 0").toContain(
      "conSemanaCero: !claveConVozDeHandoffPropia(contexto.pipelineKey ?? null)",
    );
  });

  it("⭐ cierra con el CIERRE ACTUAL en números y pide M, SIN la comparación (revisión del paso A3)", () => {
    /* ⚠ ACTUALIZADA (revisión adversarial, 2026-09-24), con esta razón: pedía el «LARGO DEL PLAN HOY»
       (el fin de las fases). La decisión de negocio compara el cierre ACTUAL con el plazo acordado: con
       un cierre fijado a mano es ese, y con el planificado ya pasado y fases sin terminar, hoy (ver las
       dos guardas de abajo).
       ⚠ ACTUALIZADA OTRA VEZ (medido en vivo 2026-09-24: el modelo invertía la dirección 6 de 6; la
       cuenta pasa al código), con esta razón: pedía la cuenta hecha con las frases del prompt («si M es
       menor que 15, el plan se pasa 15 − M…»), y con esa línea las 6 corridas del kick-off de CAV
       escribieron «quedan 3 semanas de margen» con el plan 3 semanas pasado. La comparación la escribe
       ahora `fraseDelPlazo`; la línea solo dice el cierre y cómo pasar el plazo a M para `plazoTotal`.
       Lo de fondo se sigue pidiendo: la última línea del calendario y la cifra del cierre actual.
       La edición que la pone en rojo: sacar la línea de `calendarioDeEstructura`, contar la suma de las
       duraciones en vez del calendario, o volver a ponerle la comparación al modelo. */
    // S0 1 · Arquitectura 2–4 · Configuración FIJADA en 5–8: 8 semanas; hoy es la semana 4.
    for (const foto of [FOTO, { ...FOTO, anchorStartDate: null }]) {
      const cal = calendarioDeEstructura(foto, AHORA);
      expect(cal.slice(cal.lastIndexOf("\n") + 1)).toBe(lineaDelCierreActual(foto, AHORA));
      expect(cal).toContain(
        "⭐ CIERRE ACTUAL (sin los cambios que propongas): semana 8 del proyecto — el fin de las fases, de la semana 1 a la semana 8.",
      );
    }
    const linea = lineaDelCierreActual(FOTO, AHORA);
    expect(linea).toContain(
      'Un plazo total acordado se devuelve en "plazoTotal" como M, la semana del proyecto en que vence (la comparación con este cierre la hace el sistema)',
    );
    expect(linea, "la línea volvió a explicarle la comparación al modelo").not.toMatch(
      /Después se compara|se pasa|de margen|justo en el plazo/,
    );
    // Lo que el modelo NO compara lo compara el sistema contra ESTE cierre (8).
    expect(fraseDelPlazo({ semanaAcordada: 5, cierreActual: cierreActualDelPlan(FOTO, AHORA)!.semana })).toMatch(
      /^El plan se pasa 3 semanas del plazo acordado \(semana 5\)/,
    );
    const enParalelo = { ...FOTO, phases: FOTO.phases.map((f) => (f.id === "conf" ? { ...f, startWeek: 2 } : f)) };
    expect(largoDelPlanEnSemanas(enParalelo)).toBe(6);
    expect(lineaDelCierreActual(enParalelo, AHORA)).toContain(": semana 6 del proyecto — el fin de las fases, de la semana 1 a la semana 6.");
    expect(lineaDelCierreActual({ ...FOTO, phases: [] }, AHORA)).toBe("");
  });

  it("#5 / #26 · con un cierre FIJADO A MANO, el cierre actual es ése (el que ve el CSE)", () => {
    /* Revisión adversarial (2026-09-24): las fases terminaban en la 8, el CSE había fijado el cierre en
       la 11 y la línea mandaba comparar contra 8. Con un plazo de 10 el revisor escribía «quedan 2
       semanas de margen» cuando el cierre visible se pasaba 1 (acá, con 9 acordadas: «queda 1 de margen» contra
       un cierre que se pasa 2). La edición que la pone en rojo: volver a
       medir contra `largoDelPlanEnSemanas` sin mirar `closeDateOverride`. */
    const conFijado = { ...FOTO, closeDateOverride: "2026-11-30T00:00:00.000Z" }; // 14 sep + 11 semanas
    expect(cierreActualDelPlan(conFijado, AHORA)).toMatchObject({ semana: 11, porque: "fijado", semanasDeLasFases: 8 });
    const linea = lineaDelCierreActual(conFijado, AHORA);
    expect(linea).toContain(
      "semana 11 del proyecto — el cierre fijado a mano, que es el que ve el CSE (las fases terminan en la semana 8)",
    );
    /* (2026-09-24: la comparación la escribe el sistema contra este mismo cierre; antes se leía de la
       cuenta que traía la línea.) */
    expect(
      fraseDelPlazo({ semanaAcordada: 9, cierreActual: cierreActualDelPlan(conFijado, AHORA)!.semana }),
      "con 9 acordadas se pasa 2, no «queda 1 de margen»",
    ).toMatch(/^El plan se pasa 2 semanas del plazo acordado \(semana 9\)/);
    expect(calendarioDeEstructura(conFijado, AHORA)).toContain("⭐ CIERRE ACTUAL (sin los cambios que propongas): semana 11 ");
  });

  it("#10 · con el cierre planificado ya PASADO y fases sin terminar, el cierre actual es hoy", () => {
    /* Revisión adversarial (2026-09-24): el proyecto atrasado es el caso común (71 de 103 a media
       ejecución). Hoy en la semana 11, fases hasta la 8 con Configuración sin terminar: el plan no cierra
       antes de hoy. La edición que la pone en rojo: sacar la rama «vencido» de `cierreActualDelPlan`. */
    const tarde = Date.UTC(2026, 10, 24, 18); // martes 24 nov = semana 11 del proyecto
    expect(cierreActualDelPlan(FOTO, tarde)).toMatchObject({ semana: 11, porque: "vencido", planificado: 8, semanaDeHoy: 11 });
    const linea = lineaDelCierreActual(FOTO, tarde);
    expect(linea).toContain("semana 11 del proyecto — hoy: el cierre planificado (semana 8) ya pasó y quedan fases sin terminar");
    expect(
      fraseDelPlazo({ semanaAcordada: 9, cierreActual: cierreActualDelPlan(FOTO, tarde)!.semana }),
      "con 9 acordadas ya se pasó 2",
    ).toMatch(/^El plan se pasa 2 semanas del plazo acordado \(semana 9\)/);
    // Todo terminado (o suspendido): el cierre es el planificado, aunque hoy sea después.
    const terminado = { ...FOTO, phases: FOTO.phases.map((f) => ({ ...f, status: "DONE" })) };
    expect(cierreActualDelPlan(terminado, tarde)).toMatchObject({ semana: 8, porque: "fases" });
  });

  it("#12 · un plazo contado DESDE HOY se pasa a semanas del proyecto sumándole la de hoy", () => {
    /* Revisión adversarial (2026-09-24): «nos quedan 6 semanas» en la semana 10 de un plan de 15 es la
       semana 16 (1 de margen); con la fórmula literal (M = 6) el revisor escribía «el plan se pasa 9
       semanas». La edición que la pone en rojo: sacar la regla del plazo contado desde hoy. */
    const linea = lineaDelCierreActual(FOTO, AHORA); // hoy: semana 4
    expect(linea).toContain("Hoy es la semana 4 del proyecto.");
    /* ⚠ ACTUALIZADA (medido en vivo 2026-09-24: el modelo invertía la dirección 6 de 6; la cuenta pasa
       al código), con esta razón: decía «si se cuenta desde hoy (…), súmale la semana de hoy» sin decir
       que una DURACIÓN se cuenta desde el arranque, y en 6 de 12 corridas el modelo le sumó la semana de
       hoy a «una duración de 12 semanas». Lo de fondo —lo contado desde hoy suma la semana de hoy— se
       sigue pidiendo. La edición que la pone en rojo: sacar cualquiera de las dos reglas. */
    expect(linea).toContain(
      "si dice cuánto dura el proyecto («son 12 semanas», «una duración de 12 semanas»), se cuenta desde el arranque: M es ese número, sin sumarle nada",
    );
    expect(linea).toContain(
      "solo si se cuenta desde HOY («nos quedan 6 semanas», «en dos meses más»), súmale la semana de hoy: M = 4 + lo que dice",
    );
    const sinAncla = lineaDelCierreActual({ ...FOTO, anchorStartDate: null }, AHORA);
    expect(sinAncla).not.toContain("Hoy es");
    expect(sinAncla).toContain("sin fecha de arranque no se puede ubicar");
    expect(sinAncla).toContain('"plazoTotal": null, y anótalo en "observaciones" sin comparar');
  });

  it("⭐ la línea que lee el modelo es la MEDIDA en vivo (v2, 12 de 12), con los números de CAV", () => {
    /* El texto que midió la prueba en vivo del 2026-09-24 (CAV: cierre fijado en la semana 15, hoy en
       la 1), tal cual se mandó. La edición que la pone en rojo: cambiar la redacción sin volver a medir
       (una sola corrida no dice nada). */
    const cav = {
      anchorStartDate: "2026-09-21T00:00:00.000Z",
      closeDateOverride: "2026-12-31T00:00:00.000Z",
      phases: [{ id: "x", name: "Todo", durationWeeks: 15, startWeek: null, status: "PENDING", hechas: 0, total: 0 }],
    };
    expect(lineaDelCierreActual(cav, Date.UTC(2026, 8, 24, 12))).toBe(
      "⭐ CIERRE ACTUAL (sin los cambios que propongas): semana 15 del proyecto — el cierre fijado a mano, que es el que ve el CSE (las fases terminan en la semana 15). Hoy es la semana 1 del proyecto. " +
        'Un plazo total acordado se devuelve en "plazoTotal" como M, la semana del proyecto en que vence (la comparación con este cierre la hace el sistema): ' +
        "si dice cuánto dura el proyecto («son 12 semanas», «una duración de 12 semanas»), se cuenta desde el arranque: M es ese número, sin sumarle nada; " +
        "solo si se cuenta desde HOY («nos quedan 6 semanas», «en dos meses más»), súmale la semana de hoy: M = 1 + lo que dice; " +
        "si es una fecha, M es la semana del proyecto en que cae.",
    );
  });
});

describe("G6 · el mensaje: lo suyo, y nada del detalle", () => {
  const REUNIONES = "=== REUNIONES QUE EL CSE ELIGIÓ PARA EL CRONOGRAMA (material INTERNO) ===\nCENTINELA-REUNION";
  const NOTAS = "=== NOTAS DEL CSE PARA EL CRONOGRAMA (pegadas a mano — material INTERNO) ===\nCENTINELA-NOTA";
  /* (2026-09-24: «cúmplelas», en tuteo; decía «cumplilas». Es lo primero que lee el revisor.) */
  const INSTRUCCIONES = "=== INSTRUCCIONES DEL CSE PARA ESTA PIEZA (reglas duras — cúmplelas SIEMPRE) ===\nSolo marketing.\n\n";
  const fuentes = fuentesDeEstructura({
    calendarioCtx: calendarioDeEstructura(FOTO, AHORA),
    handoffCtx: "HANDOFF-CENTINELA",
    reunionesCtx: REUNIONES,
    notasCtx: NOTAS,
  });
  const msg = renderEstructuraDelCronograma({ instrucciones: INSTRUCCIONES, fuentes });

  it("empieza con las instrucciones y trae calendario, handoff, reuniones, notas y la frontera", () => {
    expect(msg.startsWith(INSTRUCCIONES)).toBe(true);
    for (const pieza of ["[id: arq]", "HANDOFF-CENTINELA", "CENTINELA-REUNION", "CENTINELA-NOTA"]) {
      expect(msg).toContain(pieza);
    }
    expect(msg).toContain(REGLA_DE_FRONTERA_DE_ESTRUCTURA);
    // La frontera es LA del material, no una copia propia.
    expect(REGLA_DE_FRONTERA_DE_ESTRUCTURA).toContain(FRONTERA_DEL_MATERIAL);
  });

  it("⛔ nada del mensaje del detalle: ahí las fases y las duraciones están prohibidas", () => {
    /* La edición que la pone en rojo: reusar `fuentesDelDetalle` (entraría la prohibición que
       choca con lo que este paso hace) o su respaldo sin handoff. */
    expect(msg).not.toContain("CRONOGRAMA A DETALLAR");
    expect(msg).not.toContain("no cambies nombres, duraciones ni orden");
    // (2026-09-24: el respaldo del detalle pasó a tuteo; la guarda sigue pidiendo que no entre acá.)
    expect(msg).not.toContain("Genera las tareas típicas");
    expect(msg).not.toContain("Generá las tareas típicas");
  });

  it("sin handoff usa SU respaldo; sin reuniones o notas, esa fuente no entra", () => {
    const sinHandoff = fuentesDeEstructura({ calendarioCtx: "x", handoffCtx: "  ", notasCtx: NOTAS });
    expect(sinHandoff.find((f) => f.key === "handoff-curado")!.texto).toContain(SIN_HANDOFF_PARA_ESTRUCTURA);
    expect(sinHandoff.map((f) => f.key)).not.toContain("reuniones-del-cronograma");
    expect(tieneMaterialDelCronograma(sinHandoff)).toBe(true);
    expect(tieneMaterialDelCronograma(fuentesDeEstructura({ calendarioCtx: "x", handoffCtx: "h", reunionesCtx: " " }))).toBe(
      false,
    );
  });

  it("el revisor entró al trinquete del contexto nombrado", () => {
    expect(PIEZAS_CON_CONTEXTO_NOMBRADO).toContain("estructura");
  });
});

describe("⭐ el cargador: primero el material, el handoff recién después", () => {
  const sembrarReunion = () => {
    h.estado.sesiones = [{ id: "r1", title: "CAV: Definiendo cronograma", date: AHORA - 2 * DIA, participants: [] }];
    const overview = "Se acordó sumar una fase de revisión de artes. ".repeat(40);
    h.estado.filas.set("r1", { id: "r1", title: "CAV: Definiendo cronograma", summary: { overview }, minute: null });
  };

  it("sin reuniones, notas NI instrucciones: sin fuentes, y NO lee el handoff", async () => {
    /* ⚠ ACTUALIZADA (revisión adversarial, 2026-09-24), con esta razón: el mock del canvas trae
       siempre «Solo marketing.» como instrucciones, y las instrucciones solas ahora cuentan (ver la
       guarda de abajo). Este caso pasa a ser el de verdad vacío: sin brief. La edición que la pone en
       rojo sigue siendo la misma: volver a leer el handoff junto con el material. */
    h.prisma.projectCanvas.findFirst.mockResolvedValueOnce({ sections: [] });
    const c = await cargarContextoDeEstructura("p1", FOTO);
    expect(c.fuentes).toEqual([]);
    expect(hayQueRevisarLasFases(c)).toBe(false);
    expect(h.loadHandoffContext).not.toHaveBeenCalled();
  });

  it("#18 · con SOLO «Instrucciones adicionales» también se revisan las fases", async () => {
    /* Revisión adversarial (2026-09-24): «Capacitación dura 3 semanas, no 2» en las instrucciones no
       movía ninguna fase: sin reuniones ni notas, la ruta respondía «sin-material». La edición que la
       pone en rojo: volver a salir sin mirar el brief en el cargador, o que la ruta mire solo el
       material. */
    const c = await cargarContextoDeEstructura("p1", FOTO);
    expect(tieneMaterialDelCronograma(c.fuentes), "no hay reuniones ni notas").toBe(false);
    expect(hayQueRevisarLasFases(c), "las instrucciones solas no disparan la revisión").toBe(true);
    expect(c.instrucciones).toContain("Solo marketing.");
    // #15 / #25: lo PRIMERO que lee el revisor va en tuteo (decía «cumplilas»).
    expect(c.instrucciones.startsWith("=== INSTRUCCIONES DEL CSE PARA ESTA PIEZA (reglas duras — cúmplelas SIEMPRE) ===")).toBe(true);
    expect(c.fuentes.map((f) => f.key)).toEqual(["calendario-del-cronograma", "handoff-curado"]);
    expect(hayQueRevisarLasFases({ fuentes: [], instrucciones: "  " })).toBe(false);
    // La pantalla cuenta lo mismo para el cartel del paso 1.
    expect(hayMaterialParaElPaso1({ reuniones: 0, notas: 0, informe: null, instrucciones: true })).toBe(true);
    expect(hayMaterialParaElPaso1({ reuniones: 0, notas: 0, informe: null, instrucciones: false })).toBe(false);
  });

  it("con una reunión: el handoff CONFIRMADO, la foto de quien llama y la trazabilidad", async () => {
    sembrarReunion();
    const c = await cargarContextoDeEstructura("p1", FOTO);
    expect(h.loadHandoffContext).toHaveBeenCalledTimes(1);
    expect(h.loadHandoffContext).toHaveBeenCalledWith("p1", { onlyConfirmed: true });
    expect(c.fuentes.map((f) => f.key)).toEqual(["calendario-del-cronograma", "handoff-curado", "reuniones-del-cronograma"]);
    // La foto la pasó la ruta: el cargador no vuelve a leer el cronograma, y la reunión se ubica en ELLA.
    expect(h.prisma.projectTimeline.findUnique).not.toHaveBeenCalled();
    expect(c.fuentes[0].texto).toContain("[id: conf]");
    expect(c.fuentes[2].texto).toContain("«Arquitectura», su semana");
    expect(c.instrucciones).toContain("Solo marketing.");
    expect(c.sesionesUsadas).toEqual(["r1"]);
    expect((c.materialInterno ?? []).join(" ")).toContain("revisión de artes");
  });

  it("con solo una nota también hay material", async () => {
    h.estado.notas = [{ title: "Acuerdo de alcance", content: "Pruebas pasa a 3 semanas.", createdAt: new Date(AHORA - DIA) }];
    const c = await cargarContextoDeEstructura("p1", FOTO);
    expect(tieneMaterialDelCronograma(c.fuentes)).toBe(true);
    expect(c.fuentes.map((f) => f.key)).toContain("notas-del-cronograma");
  });
});

describe("G8 · la ruta: sin material no paga, no pisa, y pide la vara del paso 2", () => {
  const RUTA = "app/api/projects/[projectId]/timeline/estructura/route.ts";
  const src = soloCodigo(leer(RUTA));
  const iModelo = src.indexOf("anthropic.messages.create(");

  it("sin material vuelve ANTES de la corrida y del modelo", () => {
    /* La edición que la pone en rojo: borrar el retorno temprano — se pagaría en cada «Regenerar todo». */
    expect(iModelo, "no se encontró la llamada al modelo").toBeGreaterThan(-1);
    const iSinMaterial = src.indexOf('estado: "sin-material"');
    expect(iSinMaterial).toBeGreaterThan(-1);
    /* (Revisión de E2a: la corrida se crea DENTRO de la toma atómica, con `tx`; lo protegido no cambió.) */
    expect(iSinMaterial).toBeLessThan(src.indexOf("tx.agentRun.create("));
    /* ⚠ ACTUALIZADA (revisión adversarial, 2026-09-24), con esta razón: pedía
       `!tieneMaterialDelCronograma(contexto.fuentes)`; las «Instrucciones adicionales» solas ahora
       también se revisan (`hayQueRevisarLasFases`). Sin nada que revisar, sigue sin pagar. */
    expect(src.slice(src.indexOf("cargarContextoDeEstructura("), iSinMaterial)).toContain(
      "!hayQueRevisarLasFases(contexto)",
    );
  });

  it("la corrida se crea antes del modelo, sin agente, con quién y con qué reuniones", () => {
    /* ⚠ ACTUALIZADA en la revisión de E2a (2026-09-25), con esta razón: buscaba
       `prisma.agentRun.create(` con `triggeredByEmail: await triggeredByEmail()` adentro. La corrida
       se crea ahora dentro de la toma atómica (`tx.agentRun.create(`), y quién la pidió se lee UNA vez
       antes de abrir la transacción (no se espera nada lento con la fila bloqueada). */
    const iRun = src.indexOf("tx.agentRun.create(");
    expect(iRun).toBeGreaterThan(-1);
    expect(iRun).toBeLessThan(iModelo);
    const alta = src.slice(iRun, src.indexOf("});", iRun));
    expect(alta).toContain("agentId: null");
    expect(alta).toContain("agentSlug: ID_ESTRUCTURA_CRONOGRAMA");
    expect(alta).toContain("triggeredByEmail: quien");
    expect(src.slice(0, src.indexOf("prisma.$transaction("))).toContain("const quien = await triggeredByEmail();");
    expect(alta).toContain("sourceSessionIds: contexto.sesionesUsadas");
  });

  it("la llamada va envuelta (el tope diario no la cobra como gasto automático) y por el chokepoint", () => {
    const antes = src.slice(Math.max(0, iModelo - 400), iModelo);
    expect(antes).toContain("conContextoDeIA(");
    expect(antes).toContain("ID_ESTRUCTURA_CRONOGRAMA");
    expect(src).toContain('from "@/lib/anthropic"');
    expect(src).toContain("system: PROMPT_ESTRUCTURA_CRONOGRAMA");
    expect(src).toContain("renderEstructuraDelCronograma(");
  });

  it("⛔ no pisa la propuesta del handoff: escribe solo si no había otra", () => {
    /* La edición que la pone en rojo: volver a un update plano. */
    expect(src).toContain("updateMany(");
    expect(src).toContain("pendingProposal: { equals: Prisma.DbNull }");
    expect(src).not.toMatch(/projectTimeline\.update\(/);
    // Y nunca escribe fases ni tareas: solo la propuesta.
    expect(src).not.toMatch(/timeline(Phase|Task)\.(create|update|updateMany|delete|deleteMany|upsert)\(/);
  });

  it("el paso 1 pide la MISMA vara que el paso 2 y que «Pedir cambio con IA»", () => {
    const iGate = src.indexOf("await guardIaDelCronograma(tl.id)");
    expect(iGate).toBeGreaterThan(-1);
    expect(iGate).toBeLessThan(iModelo);
    expect(src).toMatch(/if \(iaGate instanceof NextResponse\) return iaGate;/);
    expect(src).toContain("guardTimelineEdit(projectId)");
    expect(soloCodigo(leer("app/api/projects/[projectId]/timeline/assist/route.ts"))).toContain("guardIaDelCronograma(");
  });

  it("revisa los nombres de fase contra el material que leyó", () => {
    expect(src).toContain("huellas: huellasDeFrontera(contexto.materialInterno");
  });

  it("⭐ el plazo total se compara contra el MISMO cierre actual que leyó el modelo (medido en vivo 2026-09-24)", () => {
    /* El modelo invertía la dirección 6 de 6: la cuenta pasa al código. Pero el código tiene que
       comparar contra el cierre que el modelo vio en su calendario —el fijado a mano, u hoy si el
       planificado ya pasó—, no contra el largo de las fases ni con otro reloj. La edición que la pone en
       rojo: no pasarle `cierreActual` al armador, calcularlo de otra forma, o que el cargador y el
       armador usen dos `Date.now()` distintos. */
    const iArmador = src.indexOf("construirPropuestaDeEstructura(");
    expect(iArmador).toBeGreaterThan(iModelo);
    const armador = src.slice(iArmador, src.indexOf("});", iArmador));
    expect(armador).toContain("cierreActual: cierreActualDelPlan(foto, ahora)?.semana ?? null");
    expect(armador).toMatch(/\bahora,/);
    expect(src).toContain("const foto = fotoDeEstructura(tl);");
    expect(src).toContain("cargarContextoDeEstructura(projectId, foto, ahora)");
    expect(src.match(/Date\.now\(\)/g) ?? [], "dos relojes: el calendario y el armador podrían ver semanas distintas").toHaveLength(1);
  });

  it("sin material no responde 409 aunque haya una propuesta pendiente (revisión del paso A2)", () => {
    /* Con una propuesta del handoff pendiente y nada elegido, «Generar cronograma» avisaba «Hay
       cambios de fases sin revisar… para que la IA revise las fases» aunque la IA nunca iba a
       revisar ninguna. La edición que la pone en rojo: volver a mirar la propuesta pendiente antes
       que el material. */
    const iSinMaterial = src.indexOf('estado: "sin-material"');
    const i409 = src.indexOf("tl.pendingProposal !== null");
    expect(i409, "no se encontró el 409").toBeGreaterThan(-1);
    expect(i409, "el 409 volvió a ir antes del chequeo del material").toBeGreaterThan(iSinMaterial);
    expect(i409, "el 409 tiene que ir antes de la corrida y del modelo").toBeLessThan(src.indexOf("tx.agentRun.create("));
  });

  it("lee la respuesta con `leerRespuestaDeEstructura`, no de la primera a la última llave (revisión del paso A3)", () => {
    /* La edición que la pone en rojo: volver a `texto.match(/\{[\s\S]*\}/)` + JSON.parse. */
    expect(src).toContain("leerRespuestaDeEstructura(texto)");
    expect(src).not.toContain("JSON.parse(");
    expect(src).not.toContain(".match(/\\{[\\s\\S]*\\}/)");
  });

  it("«sin-cambios» dice cuánto de lo acordado no entró (revisión del paso A2)", () => {
    /* Con un «ajustar», un «agregar» o un «mover» descartados por el calendario, la propuesta sale
       null y la pantalla decía «Tus reuniones y notas no piden cambios…», que era falso. La edición
       que la pone en rojo: responder «sin-cambios» sin `acordadoSinEntrar`. */
    const iSinCambios = src.indexOf('estado: "sin-cambios"');
    expect(iSinCambios).toBeGreaterThan(-1);
    expect(src.slice(iSinCambios, src.indexOf("});", iSinCambios))).toContain(
      "acordadoSinEntrar: armado.acordadoSinEntrar",
    );
  });

  it("⛔ la ruta no arma bloques de contexto a mano", () => {
    /* Mismo molde que el assist (asistente-cronograma.test.ts): un bloque `=== ALGO ===` escrito en
       la ruta es una fuente fuera del trinquete. Van en lib/contexto/estructura-cronograma.ts. */
    const aMano = [...leer(RUTA).matchAll(/=== [^\n=]+ ===/g)].map((m) => m[0]);
    expect(aMano).toEqual([]);
  });

  it("E2a · con un paso 1 del proyecto ya corriendo, 409 ESTRUCTURA_EN_CURSO ANTES de pagar otro", () => {
    /* El paso 1 ya no bloquea la pantalla: otra pestaña (u otra persona) puede pedirlo mientras corre
       uno, y serían dos corridas pagadas para UNA propuesta. La edición que la pone en rojo: sacar el
       chequeo, moverlo después de crear la corrida (o del modelo), mirar otro agente o todas las
       corridas vivas del proyecto, o medir la ventana con un segundo reloj.
       ⚠ REESCRITA en la revisión de E2a (2026-09-25), con esta razón: pedía
       `const x = await prisma.agentRun.findFirst(…); if (x) { return …409 }` ANTES de
       `prisma.agentRun.create(`. Eran dos idas a la base: dos pedidos juntos pasaban los dos. Ahora
       la búsqueda y el alta van en la toma atómica (`tx`), la búsqueda veta con "en-curso" y el 409
       sale apenas termina la toma, antes del modelo. Lo protegido no cambió. */
    const iToma = src.indexOf("const toma = await prisma.$transaction(async (tx) => {");
    expect(iToma, "no hay toma atómica del paso 1").toBeGreaterThan(-1);
    const toma = src.slice(iToma, src.indexOf("const run = toma;", iToma));
    const iBusca = toma.indexOf("tx.agentRun.findFirst(");
    const iVeto = toma.indexOf('if (pasoEnCurso) return "en-curso" as const;');
    const iRun = toma.indexOf("tx.agentRun.create(");
    expect(iBusca, "no busca la corrida en curso").toBeGreaterThan(-1);
    expect(iVeto, "la corrida en curso se busca pero no frena").toBeGreaterThan(iBusca);
    expect(iRun, "el veto tiene que ir antes de crear la corrida").toBeGreaterThan(iVeto);
    const busca = toma.slice(iBusca, toma.indexOf("});", iBusca));
    expect(busca).toContain("projectId,");
    expect(busca, "mira otro agente: frenaría por cualquier corrida del proyecto").toContain(
      "agentSlug: ID_ESTRUCTURA_CRONOGRAMA",
    );
    expect(busca).toContain('status: "RUNNING"');
    expect(busca, "la ventana se mide con otro reloj").toMatch(/createdAt: \{ gte: new Date\(ahora - /);
    // Y el veto es lo que responde el 409, antes del modelo.
    const iEnCurso = src.indexOf('error: "ESTRUCTURA_EN_CURSO"');
    expect(iEnCurso, "no hay 409 de paso 1 en curso").toBeGreaterThan(iToma);
    expect(iEnCurso).toBeLessThan(iModelo);
    expect(src.slice(iEnCurso - 120, iEnCurso)).toContain('if (toma === "en-curso") {');
    // Después del 409 de la propuesta pendiente (sin material no hay nada que frenar).
    expect(iToma).toBeGreaterThan(src.indexOf("tl.pendingProposal !== null"));
    expect(src, "quedó una búsqueda o un alta fuera de la toma").not.toMatch(/prisma\.agentRun\.(findFirst|create)\(/);
    // Sigue habiendo UN solo reloj en la ruta (la guarda de arriba lo cuenta).
    expect(src.match(/Date\.now\(\)/g) ?? []).toHaveLength(1);
  });

  it("⛔ la toma del paso 1 es ATÓMICA: fila bloqueada, propuesta RELEÍDA y corrida creada en la misma transacción", () => {
    /* Revisión de E2a: la propuesta se miraba en la lectura de arriba (vieja: entre ella y el modelo
       se carga el contexto, segundos) y buscar la corrida en curso y crear la nuestra eran dos idas a
       la base. Dos pedidos juntos, o uno que entraba justo cuando otro terminaba, pagaban el modelo
       dos veces. Las ediciones que la ponen en rojo: sacar el `FOR UPDATE`, no releer la propuesta
       adentro, o crear la corrida fuera de la transacción. */
    const iToma = src.indexOf("const toma = await prisma.$transaction(async (tx) => {");
    expect(iToma).toBeGreaterThan(-1);
    const toma = src.slice(iToma, src.indexOf("const run = toma;", iToma));
    const iBloqueo = toma.indexOf('FROM "ProjectTimeline" WHERE "id" = ${tl.id} FOR UPDATE');
    const iRelee = toma.indexOf('if (!fila || fila.conPropuesta) return "propuesta-pendiente" as const;');
    expect(iBloqueo, "la toma no bloquea la fila del cronograma").toBeGreaterThan(-1);
    expect(toma.slice(0, iBloqueo)).toContain('SELECT ("pendingProposal" IS NOT NULL) AS "conPropuesta"');
    expect(iRelee, "la toma no relee la propuesta").toBeGreaterThan(iBloqueo);
    expect(toma.indexOf("tx.agentRun.findFirst(")).toBeGreaterThan(iRelee);
    expect(toma.indexOf("tx.agentRun.create(")).toBeGreaterThan(iRelee);
    expect(src.slice(src.indexOf("const run = toma;") - 300)).toContain(
      'if (toma === "propuesta-pendiente") return NextResponse.json(PROPUESTA_PENDIENTE, { status: 409 });',
    );
  });

  it("E2a · la propuesta nace como `borrador-v1` DENTRO de la escritura condicionada, y es lo que responde", () => {
    /* El paso 2 le suma sus tareas a ESTA propuesta (por su token): tiene que ser un v1, con los
       `desde` de la MISMA lectura que vio el modelo y el pedido deducido de las tareas de hoy. La
       edición que la pone en rojo: volver a guardar el formato viejo (`armado.propuesta`), escribir el
       v1 con un `update` plano o fuera de la condición, o responder otra cosa que lo guardado. */
    const iBorrador = src.indexOf("const borrador = borradorBase(");
    expect(iBorrador, "la propuesta no se arma como borrador-v1").toBeGreaterThan(-1);
    const armado = src.slice(iBorrador, src.indexOf("});", iBorrador));
    expect(armado).toContain("propuesta: armado.propuesta");
    expect(armado).toContain("vivo,");
    expect(armado, "el pedido no sale de las tareas de hoy").toContain(
      "pedido: pedidoDelCronograma(tl.phases.flatMap((f) => f.tasks))",
    );
    // El vivo sale de la MISMA lectura (`tl`), y la lectura trae la fuente de las tareas.
    expect(src.slice(src.indexOf("const vivo: Vivo = {"), iBorrador)).toContain("fases: tl.phases.map(");
    expect(src).toContain("tasks: { select: { status: true, weekIndex: true, source: true } }");
    const iEscritura = src.indexOf("prisma.projectTimeline.updateMany(");
    expect(iEscritura).toBeGreaterThan(iBorrador);
    const escritura = src.slice(iEscritura, src.indexOf("});", iEscritura));
    expect(escritura).toContain("pendingProposal: { equals: Prisma.DbNull }");
    expect(escritura, "lo escrito no es el borrador").toContain("pendingProposal: borrador as unknown as Prisma.InputJsonValue");
    expect(escritura).toContain("pendingProposalRunId: run.id");
    expect(src, "volvió a guardarse el formato viejo").not.toContain("pendingProposal: armado.propuesta");
    const iRespuesta = src.indexOf('estado: "propuesta"');
    const respuesta = src.slice(iRespuesta, src.indexOf("});", iRespuesta));
    expect(respuesta).toContain("proposal: borrador,");
    expect(respuesta).toContain("runId: run.id,");
  });
});

describe("G12 · la pantalla: la cadena al paso 2, y lo que no puede perderse", () => {
  const src = soloCodigo(leer("components/canvas/CronogramaCanvas.tsx"));
  /* ⚠ Si falta un marcador, TIRA con su nombre (revisión de E1, 2026-09-24): antes devolvía "" sin
     el de inicio y, sin el de fin, `slice(i, -1)` leía hasta el final del archivo sin avisar, así que
     una negación sobre el tramo podía pasar mirando otra cosa. */
  const tramo = (desde: string, hasta: string) => tramoDe(src, desde, hasta);

  it("pedirPropuestaDeDetalle pide la estructura ANTES del detalle, salvo en la continuación", () => {
    /* La edición que la pone en rojo: que la continuación no salte el paso 1 (re-propondría fases
       en bucle), o que el detalle salga antes de revisar la estructura. */
    const pedir = tramo("const pedirPropuestaDeDetalle = async (", "const startRegenPreview");
    expect(pedir.length).toBeGreaterThan(1000);
    const iEstructura = pedir.indexOf("/timeline/estructura");
    const iAnalyze = pedir.indexOf("/analyze");
    expect(iEstructura).toBeGreaterThan(-1);
    expect(iAnalyze).toBeGreaterThan(iEstructura);
    const iSalto = pedir.indexOf("if (opts?.saltarEstructura) {");
    const iSino = pedir.indexOf("} else {", iSalto);
    expect(iSalto, "el paso 1 dejó de depender de `saltarEstructura`").toBeGreaterThan(-1);
    expect(iSino).toBeGreaterThan(iSalto);
    expect(iEstructura, "el fetch del paso 1 no está en la rama que NO salta").toBeGreaterThan(iSino);
    expect(pedir).toContain("pasoTrasEstructura(");
    /* ⚠ REESCRITA en E2a P6 (2026-09-25), con esta razón: pedía `proposal?.origen === "contexto"`
       antes del fetch (solo una propuesta de las reuniones frenaba). Con UN borrador por proyecto,
       cualquier propuesta abierta frena «Generar cronograma» (se veía con una del handoff y armaba las
       tareas sobre lo vivo, ignorándola). La edición que la pone en rojo: volver a frenar solo la de
       las reuniones, o pedir el paso 1 con una propuesta abierta. */
    const iFreno = pedir.indexOf("if (hayBorrador) {");
    expect(iFreno, "con una propuesta sin decidir, pide otra").toBeGreaterThan(-1);
    expect(iFreno).toBeLessThan(iEstructura);
    expect(pedir.slice(iFreno, pedir.indexOf("return;", iFreno)).length).toBeGreaterThan(80);
    expect(pedir.indexOf("return;", iFreno), "el freno no vuelve antes del paso 1").toBeLessThan(iEstructura);
    /* E2a: el paso 2 va DETACHED y sobre la propuesta (su token y la versión que se ve), y su
       resultado ya no vive en la memoria de la pantalla (el acordeón viejo). La edición que la pone en
       rojo: volver al pedido síncrono, no mandar el borrador, o volver a llenar el acordeón. */
    const iPedido = pedir.indexOf("/analyze");
    const pedido = pedir.slice(iPedido, pedir.indexOf("});", iPedido));
    expect(pedido.length).toBeGreaterThan(100);
    expect(pedido).toContain('agentId: "agent-timeline-detail"');
    expect(pedido, "el paso 2 volvió a ser síncrono (el resultado moría con la pestaña)").toContain("async: true,");
    expect(pedido, "el paso 2 no dice sobre qué propuesta arma las tareas").toContain("borrador: { token, version },");
    expect(pedir.length, "la guarda no está mirando la función").toBeGreaterThan(2000);
    expect(pedir, "volvió el acordeón en memoria").not.toContain("setAllRegenPreview");
    expect(pedir).not.toContain("previewPhases");
  });

  it("E2a · el token y la versión que viajan son los de la propuesta que se VE, o ninguno", () => {
    /* «Armar las tareas» / «Volver a intentar» (la continuación) mandan el token y la versión del v1
       en pantalla; el camino normal, el token que devolvió el paso 1 con versión 0 (y la muestra
       enseguida, con su token en `proposalMeta`), o null. La edición que la pone en rojo: mandar el
       token de otra propuesta (o de la vista previa del modificador), una versión que no es la que se
       ve, o mostrar la propuesta del paso 1 sin su token. */
    const pedir = tramo("const pedirPropuestaDeDetalle = async (", "const startRegenPreview");
    const continuacion = tramoDe(pedir, "if (opts?.saltarEstructura) {", "} else {");
    expect(continuacion).toContain("if (!proposalMeta.current.deAssist && esBorradorV1(proposal)) {");
    expect(continuacion).toContain("token = proposalMeta.current.runId;");
    expect(continuacion).toContain("version = versionDelBorrador(proposal);");
    const conToken = tramoDe(pedir, "if (paso.token) {", "} else {");
    expect(conToken).toContain("token = paso.token;");
    expect(conToken).toContain("version = 0;");
    const iMeta = conToken.indexOf("proposalMeta.current = { deAssist: false, runId: paso.token };");
    expect(iMeta, "la propuesta del paso 1 se muestra sin su token").toBeGreaterThan(-1);
    expect(iMeta).toBeLessThan(conToken.indexOf("setProposal(estructura.proposal as Proposal)"));
    expect(conToken).toContain('setTareasDelBorrador({ estado: "faltan"');
    // Y al volver: la propuesta «armando» se trae (con su corrida) para que la siga el borrador.
    const iPedido = pedir.indexOf("/analyze");
    expect(pedir.indexOf("await traerPropuestaPendiente()", iPedido), "no trae la propuesta «armando»").toBeGreaterThan(iPedido);
    expect(pedir, "`armando` no se suelta al terminar el pedido").toMatch(/finally \{\s*setArmando\(null\);\s*\}/);
  });

  it("resolver la última sugerencia encadena el paso 2 y muestra las reubicaciones", () => {
    /* ⚠ REESCRITA en E1 del borrador (2026-09-24), con esta razón: `resolveProposalItems` (aceptar o
       descartar por ítem contra apply-items) se fue; la propuesta se resuelve entera con
       `aplicarBorrador` (POST /timeline/borrador/aplicar). Lo que la guarda pide es lo mismo: la
       cadena al paso 2 saltando el paso 1, los avisos de tareas corridas y el origen leído antes de
       limpiar la propuesta. */
    const resolver = tramo("const aplicarBorrador = async (", "useEffect(");
    expect(resolver.length).toBeGreaterThan(500);
    expect(resolver).toContain("pasoTrasResolver(");
    expect(resolver, "la continuación no salta el paso 1").toContain("saltarEstructura: true");
    expect(resolver, "el aviso de tareas corridas vuelve a perderse").toContain("d.avisos");
    // El origen se lee ANTES de limpiar la propuesta: después ya no está.
    expect(resolver.indexOf("origenDePropuesta(proposal)")).toBeLessThan(resolver.indexOf("setProposal(null)"));
  });

  it("siguen los dos flush del brief y los dos literales de las puertas", () => {
    expect(leer("components/canvas/CronogramaCanvas.tsx").match(/await flushDocBrief\(\);/g)?.length).toBe(2);
    expect(src).toContain('pedirPropuestaDeDetalle("primera")');
    expect(src).toContain('pedirPropuestaDeDetalle("regen")');
  });

  it("⛔ el chat no aplica con cambios de fases sin decidir (el PUT borraría la propuesta)", () => {
    /* Hueco 2 de la revisión: el Aplicar del chat hace un PUT con motivo, y ese PUT borra
       `pendingProposal`. La edición que la pone en rojo: sacar la guarda. */
    const aplicar = tramo("const aplicarOperacionesAcordadas = async (", "const applyProposal");
    // (E1, 2026-09-24: la guarda pregunta si hay un BORRADOR guardado; antes, `structureOnlyProposal`.)
    const iGuarda = aplicar.indexOf("if (hayBorrador) {");
    expect(iGuarda).toBeGreaterThan(-1);
    expect(iGuarda).toBeLessThan(aplicar.indexOf("aplicarOperaciones("));
    expect(aplicar.slice(iGuarda, iGuarda + 200)).toContain("fallo:");
  });

  it("si la propuesta desaparece sin pasar por acá, `load()` ofrece el paso 2", () => {
    const load = tramo("const load = useCallback(", "}, [projectId]);");
    expect(load).toContain('pasoTareasRef.current !== null && origenDePropuesta(data.pendingProposal) !== "contexto"');
    expect(load).toContain("setOfrecerTareas(true)");
  });

  it("la espera del paso 1 NO bloquea (se dice en una línea), y la franja sabe de dónde salió la propuesta", () => {
    /* ⚠ REESCRITA AL REVÉS en E2a P6 (2026-09-25), con esta razón: pedía `revisandoEstructura ?` en
       `ocupado` (la espera del paso 1 bloqueaba el Gantt, el encabezado y el cambio de pieza), porque
       el resultado vivía solo en la memoria de la pantalla. Ahora queda en el servidor, en la
       propuesta, y lo editado después choca y queda fuera: la espera no bloquea. Se dice con un chip
       en el encabezado y la línea de arriba del Gantt. La edición que la pone en rojo: volver a meter
       la espera de «Regenerar todo» en `ocupado`, o sacar la línea. */
    const ocupado = tramo("const ocupado", "activo: false");
    expect(ocupado.length, "la guarda no está mirando el estado de ocupado").toBeGreaterThan(300);
    expect(ocupado, "la espera de «Regenerar todo» volvió a bloquear el cronograma").not.toMatch(
      /\b(armando|revisandoEstructura|generating|allRegenLoading)\b/,
    );
    expect(src).toContain("<LineaDeLasTareas");
    const chip = tramo("{(armando !== null || tareasDelBorrador?.estado === \"armando\") && (", "</span>");
    expect(chip, "el chip del encabezado no usa los tokens del tema").toContain("text-info-ink");
    expect(chip).not.toMatch(/\b(text|border)-blue-\d/);
    /* ⚠ REESCRITO en E1 (2026-09-24): la franja recibía `origen` y `observaciones` sueltos; la barra
       nueva recibe el resumen del núcleo, que los trae (borrador.test.ts lo prueba), y sabe si esta
       pantalla encadena el paso 2. */
    expect(src).toContain("<RevisionDeLaPropuesta");
    expect(src).toContain("resumen={revision.resumen}");
    expect(src).toContain("encadenado={encadenado}");
    expect(src).toContain("<PasoDeTareasPendiente");
  });

  it("E2a · la línea suelta va donde va la barra, y mientras esta pantalla pide nada lanza otra corrida", () => {
    /* Sin barra (el paso 1 corriendo, el pedido del paso 2 en vuelo, o una propuesta todavía sin
       cambios) la línea va suelta ANTES de la barra, en su mismo contenedor. Y mientras `armando`,
       «Generar cronograma», «Regenerar todo», el enlace «Genera las tareas» y el paso 2 ofrecido están
       apagados, igual que con la corrida de las tareas en curso. La edición que la pone en rojo: montar
       la línea en otro lado, o dejar vivo un botón que lanzaría una segunda corrida pagada. */
    const iLinea = src.indexOf("<LineaDeLasTareas");
    const iBarra = src.indexOf("{canEdit && hayBorrador && revision.resumen && (");
    expect(iLinea).toBeGreaterThan(src.indexOf("<div ref={revision.contenedorRef}"));
    expect(iLinea, "la línea suelta no va antes de la barra").toBeLessThan(iBarra);
    expect(src.slice(iLinea - 60, iLinea)).toContain("{canEdit && lineaSuelta && (");
    const linea = tramo("<LineaDeLasTareas", "/>");
    expect(linea).toContain("trabajando={armando !== null}");
    expect(linea).toContain("suelta");
    const lineaSuelta = tramo("const lineaSuelta:", ": null;");
    expect(lineaSuelta, "el paso 1 no se dice").toMatch(/armando\?\.paso === 1\s*\?\s*\{ estado: "paso-1"/);
    expect(lineaSuelta, "con la barra montada, la línea iría dos veces").toMatch(/hayBorrador && revision\.resumen\s*\?\s*null/);
    const apagado = 'disabled={armando !== null || tareasDelBorrador?.estado === "armando"}';
    expect(src.split(apagado).length - 1, "«Generar cronograma», «Regenerar todo» y «Genera las tareas»").toBe(3);
    expect(src).toContain("trabajando={armando !== null}");
    expect(tramo("<PasoDeTareasPendiente", "/>")).toContain("trabajando={armando !== null}");
    // «Regenerar todo» dice siempre lo mismo: la espera ya se dice en el chip y la línea.
    expect(src).not.toContain("Generando propuesta…");
  });

  it("E2a · mientras esta pantalla pide las tareas de la propuesta en pantalla, se tratan como «armando»", () => {
    /* En el segundo que tarda el pedido del paso 2, el servidor todavía dice «faltan» (o «fallo», con
       «Volver a intentar»): la barra ofrecía «Armar las tareas» (una segunda corrida pagada) y dejaba
       aplicar solo las fases de una propuesta cuyas tareas ya venían. La edición que la pone en rojo:
       pasarle al hook (o a la línea) el estado del servidor sin mirar `armando`. */
    const derivado = tramo("const estadoDeLasTareasEnPantalla: EstadoDeLasTareas | null =", ";");
    expect(derivado).toMatch(/armando !== null/);
    expect(derivado).toContain('tareasEnPantalla.estado === "faltan" || tareasEnPantalla.estado === "fallo"');
    expect(derivado).toMatch(/\?\s*"armando"/);
    expect(tramo("const revision = useBorradorDelCronograma({", "});")).toContain("tareas: estadoDeLasTareasEnPantalla,");
    expect(tramo("const tareasDeLaBarra: TareasEnPantalla | null =", ": null;")).toContain(
      "estado: estadoDeLasTareasEnPantalla,",
    );
    // El seguimiento sigue mirando el estado del SERVIDOR (la corrida real), no el derivado.
    expect(src).toContain('const corridaQueArma = tareasEnPantalla?.estado === "armando" ? tareasEnPantalla.corrida : null;');
  });

  it("el auto-descarte de una propuesta de las reuniones sigue la cadena SALTANDO el paso 1 (revisión del paso A2)", () => {
    /* Sin `saltarEstructura`, el closure viejo todavía ve `proposal?.origen === "contexto"`, vuelve
       con «Primero decide…» y la cadena queda colgada. La edición que la pone en rojo: quitar el
       flag de la continuación de `discardProposal`, o leer el origen después de limpiar. */
    const descartar = tramo("const discardProposal = async (", "const aplicarBorrador = async (");
    expect(descartar.length).toBeGreaterThan(300);
    const iOrigen = descartar.indexOf("origenDePropuesta(proposal)");
    expect(iOrigen, "el origen no se lee").toBeGreaterThan(-1);
    expect(iOrigen, "el origen se lee después de limpiar la propuesta").toBeLessThan(descartar.indexOf("setProposal(null)"));
    expect(descartar).toContain("pasoTrasResolver(");
    expect(descartar, "la continuación del auto-descarte no salta el paso 1").toMatch(
      /pedirPropuestaDeDetalle\(modoDeLaCadena, \{ saltarEstructura: true \}\)/,
    );
  });

  it("«Paso 1 de 2 · Revisando…» se dice solo con material elegido, no por un reloj (revisión del paso A2)", () => {
    /* ⚠ ACTUALIZADA en la segunda vuelta de la revisión (2026-09-24), con esta razón: la versión
       anterior exigía un temporizador de 1,2 s (`paso1Visible`). Sin material la ruta igual lee el
       cronograma, los permisos y lo elegido antes de responder, y en un prod lento el cartel salía
       aunque nadie eligiera nada. Ahora lo decide el estado real: el «Contexto del cronograma»
       avisa si hay material (`onMaterial`, con `hayMaterialParaElPaso1`). La guarda sigue pidiendo
       lo mismo —sin material, ni el cartel ni el rótulo— con la condición verdadera. La edición que
       la pone en rojo: mostrar el cartel o el rótulo sin mirar `materialElegido`, o no conectar el
       aviso de la sección. */
    const pedir = tramo("const pedirPropuestaDeDetalle = async (", "const startRegenPreview");
    expect(pedir, "volvió el reloj: el cartel no depende de lo elegido").not.toMatch(/setTimeout\([^)]*Paso1/);
    /* ⚠ ACTUALIZADA el 2026-09-24 con esta razón: Elías pidió que el aviso no salga en una ventana
       encima («que no esté en un modal o pop-up») sino en el cronograma. Antes había DOS lugares que
       decían «Paso 1 de 2» —la franja de `ocupado` y una ventana con el mismo texto—; la ventana se
       fue y queda UNO, que sigue dependiendo de `materialElegido`. Que la ventana no vuelva lo cuida
       la guarda «las esperas de la IA no abren una ventana encima» (lib/asistente/panel.test.ts). */
    expect(src, "volvió la ventana del paso 1").not.toContain("revisandoEstructura && materialElegido && (");
    /* ⚠ REESCRITA en E2a P6 (2026-09-25), con esta razón: el rótulo vivía en `ocupado`
       (`revisandoEstructura ? materialElegido ? { … "Paso 1 de 2`), y la espera del paso 1 ya no
       bloquea: la dice la línea de arriba del Gantt. El texto sale de `textoDeLaLineaDeTareas`
       («paso-1»), que dice «Paso 1 de 2» SOLO con `conMaterial`, y el Canvas le pasa
       `materialElegido`. Pide lo mismo que antes: sin material, ni el rótulo ni el cartel. */
    expect(
      textoDeLaLineaDeTareas("paso-1", null, null, true)?.texto,
      "con material, la línea no dice el paso 1",
    ).toBe("Paso 1 de 2 · Revisando fases y tiempos con tus reuniones, notas e instrucciones…");
    const sinMaterial = textoDeLaLineaDeTareas("paso-1", null, null, false)?.texto ?? "";
    expect(sinMaterial.length).toBeGreaterThan(10);
    expect(sinMaterial, "sin material, la línea dice «Paso 1 de 2»").not.toContain("Paso 1 de 2");
    expect(src, "la línea no sabe si hay material").toMatch(/<LineaDeLasTareas[^>]*conMaterial=\{materialElegido\}/);
    // La sección lo avisa con lo que ya sabe, y la pantalla lo escucha.
    expect(src).toMatch(/<CronogramaContextSection[^>]*onMaterial=\{setMaterialElegido\}/);
    const seccion = soloCodigo(leer("components/canvas/CronogramaContextSection.tsx"));
    // (2026-09-24: también con las instrucciones adicionales guardadas.)
    expect(seccion).toMatch(
      /* (2026-09-24, revisión adversarial #23: si la lista de elegidas no cargó, no se afirma que no
         hay ninguna: cuenta al menos una.) */
      /hayMaterialParaElPaso1\(\{\s*reuniones: reunionesIlegibles \? Math\.max\(reuniones, 1\) : reuniones,\s*notas,\s*informe: informeVivo,\s*instrucciones: instruccionesActivas,\s*\}\)/,
    );
    expect(seccion).toMatch(/useEffect\(\(\) => \{\s*onMaterial\?\.\(hayMaterial\);\s*\}, \[hayMaterial, onMaterial\]\)/);
  });

  it("qué cuenta como material para el cartel: lo mismo que lee la ruta", () => {
    /* La edición que la pone en rojo: contar una reunión agendada o sin resumen (el informe dice que
       no entra nada), o ignorar las notas. */
    const informe = (entran: number[]) => ({ reuniones: entran.map((e) => ({ entran: e })) });
    expect(hayMaterialParaElPaso1({ reuniones: 0, notas: 0, informe: null })).toBe(false);
    expect(hayMaterialParaElPaso1({ reuniones: 0, notas: 2, informe: null })).toBe(true);
    // Sin informe todavía (se está pidiendo, o falló): alcanza con que haya una elegida.
    expect(hayMaterialParaElPaso1({ reuniones: 1, notas: 0, informe: null })).toBe(true);
    // Solo una agendada o una sin resumen: la ruta responde «sin-material».
    expect(hayMaterialParaElPaso1({ reuniones: 2, notas: 0, informe: informe([0, 0]) })).toBe(false);
    expect(hayMaterialParaElPaso1({ reuniones: 2, notas: 0, informe: informe([0, 4200]) })).toBe(true);
  });

  it("la pantalla lee lo acordado que no entró de la respuesta «sin-cambios» (revisión del paso A2)", () => {
    /* Sin esto el aviso diría «tus reuniones no piden cambios» junto a una observación que dice que
       sí los pidieron. La edición que la pone en rojo: dejar de pasar el campo a `pasoTrasEstructura`. */
    const pedir = tramo("const pedirPropuestaDeDetalle = async (", "const startRegenPreview");
    expect(pedir).toContain("acordadoSinEntrar: d?.acordadoSinEntrar");
  });
});

/**
 * ── G15 · LA PROPUESTA DE FASES NO SE PISA, NO SE BORRA DE REBOTE Y NO SE PAGA DOS VECES ──
 * Revisión adversarial (2026-09-24). Cada guarda nombra la edición que la pone en rojo.
 */
describe("G15 · la propuesta de fases: nadie la pisa ni la borra de rebote, y el paso 1 lee lo guardado", () => {
  const canvas = soloCodigo(leer("components/canvas/CronogramaCanvas.tsx"));
  const tramo = (desde: string, hasta: string) => tramoDe(canvas, desde, hasta);

  it("#1 · el paso 1 espera el autoguardado EN VUELO (y lo que quedó sin mandar) antes de leer la base", () => {
    /* La edición que la pone en rojo: volver a `if (dirty && !saving) await autoSave();` (con un PUT
       en curso no esperaba nada), o que `autoSave` deje de devolver el guardado en vuelo. */
    const pedir = tramo("const pedirPropuestaDeDetalle = async (", "const startRegenPreview");
    const iEspera = pedir.indexOf("await esperarQueSeGuarde()");
    expect(iEspera, "el paso 1 no espera el guardado").toBeGreaterThan(-1);
    expect(iEspera).toBeLessThan(pedir.indexOf("/timeline/estructura"));
    expect(pedir).not.toContain("if (dirty && !saving) await autoSave();");
    const autoSave = tramo("const autoSave = (): Promise<void> => {", "const guardarAhora");
    expect(autoSave).toContain("if (guardadoEnVueloRef.current) return guardadoEnVueloRef.current;");
    expect(autoSave.indexOf("guardadoEnVueloRef.current = enVuelo;")).toBeGreaterThan(-1);
    const esperar = tramo("const esperarQueSeGuarde = async ()", "const setAnchorFromGantt");
    expect(esperar).toContain("await enVuelo;");
    expect(esperar, "lo que quedó sin mandar se guarda con el estado de AHORA, no el del clic").toContain(
      "await ultimo.autoSave();",
    );
  });

  it("#8 · un 409 del paso 1 NO arma el detalle pago: trae la propuesta y espera a que se decida", () => {
    /* La edición que la pone en rojo: seguir hasta `/analyze` en la rama «decidir». */
    const pedir = tramo("const pedirPropuestaDeDetalle = async (", "const startRegenPreview");
    const iDecidir = pedir.indexOf('if (paso.paso === "decidir") {');
    expect(iDecidir).toBeGreaterThan(-1);
    const rama = pedir.slice(iDecidir, pedir.indexOf("return;", iDecidir));
    expect(rama).toContain("traerPropuestaPendiente()");
    expect(rama, "si es la de las reuniones, la cadena sigue al decidirla").toContain("fijarPasoTareas(modo)");
    expect(pedir.indexOf("return;", iDecidir)).toBeLessThan(pedir.indexOf("/analyze"));
  });

  it("#4 · con cambios de fases sin decidir, ni «IA» de una fase ni el acuerdo viejo del chat reemplazan la propuesta", () => {
    /* La edición que la pone en rojo: sacar la guarda de `submitAssist`, o volver a ofrecer «IA» por
       fase con una propuesta de estructura en pantalla. */
    const assist = tramo("const submitAssist = async (", "const aplicarOperacionesAcordadas");
    // (E1, 2026-09-24: la guarda pregunta si hay un BORRADOR guardado; antes, `structureOnlyProposal`.)
    const iGuarda = assist.indexOf("if (hayBorrador) {");
    expect(iGuarda, "submitAssist no frena").toBeGreaterThan(-1);
    expect(iGuarda).toBeLessThan(assist.indexOf("/timeline/assist"));
    expect(assist.slice(iGuarda, iGuarda + 200)).toContain("fallo: CAMBIOS_DE_FASES_SIN_DECIDIR");
    expect(canvas).toMatch(/onAssistPhase=\{\s*\(hasAiDetail \? canRegenerateTimeline : canGenerateTimeline\) && !hayBorrador/);
  });

  it("#4 · descartar la del modificador no toca el servidor, y el DELETE solo borra la que la pantalla tiene enfrente", () => {
    /* ⚠ REESCRITA en la corrección de E1 (2026-09-24), con esta razón: la condición se lee UNA vez en
       `eraDelModificador`, porque ahora también decide traer la propuesta guardada al descartar la
       vista previa del modificador. Pide lo mismo que antes.
       La edición que la pone en rojo: el DELETE incondicional de antes, o sin `runId`. */
    const descartar = tramo("const discardProposal = async (", "const aplicarBorrador = async (");
    expect(descartar).toContain("const eraDelModificador = proposalMeta.current.deAssist;");
    const iSi = descartar.indexOf("if (!eraDelModificador) {");
    expect(iSi, "el DELETE ya no depende de dónde vive la propuesta").toBeGreaterThan(-1);
    expect(iSi).toBeLessThan(descartar.indexOf("/timeline/proposal`"));
    expect(descartar).toContain("runId: proposalMeta.current.runId");
    const ruta = soloCodigo(leer("app/api/projects/[projectId]/timeline/proposal/route.ts"));
    expect(ruta).toContain('if (body && "runId" in body) {');
    expect(ruta, "el borrado no está condicionado a la corrida que se leyó").toContain(
      "where: { projectId, pendingProposalRunId: existing.pendingProposalRunId }",
    );
  });

  it("#3 / #6 · aplicar una sugerencia exige que la guardada sea la que el CSE tiene enfrente", () => {
    /* ⚠ REESCRITA en E1 del borrador (2026-09-24), con esta razón: apply-items quedó como lápida y
       aplicar va por POST /timeline/borrador/aplicar. La guarda pide lo mismo: el 409 ANTES de la
       transacción si la guardada no es la que el CSE tiene enfrente (y adentro, la escritura
       condicional del token: escribir-estructura.test.ts), y la pantalla manda su token y, con un
       409 de otra propuesta, trae la que está. La edición que la pone en rojo: sacar el atajo del
       409, moverlo después de la transacción, o que la pantalla deje de mandar el token. */
    const ruta = soloCodigo(leer("app/api/projects/[projectId]/timeline/borrador/aplicar/route.ts"));
    const i409 = ruta.indexOf('error: "PROPUESTA_CAMBIO"');
    expect(i409).toBeGreaterThan(-1);
    expect(i409).toBeLessThan(ruta.indexOf("prisma.$transaction("));
    expect(ruta.slice(ruta.indexOf("if (tl.pendingProposal === null"), i409)).toContain(
      "(tl.pendingProposalRunId ?? null) !== token",
    );
    const aplicar = tramo("const aplicarBorrador = async (", "useEffect(");
    expect(aplicar.length).toBeGreaterThan(500);
    expect(aplicar).toContain("token: proposalMeta.current.runId");
    expect(aplicar.slice(aplicar.indexOf("res.status === 409"))).toContain("traerPropuestaPendiente()");
    // Y la lápida no escribe nada: solo dice que se recargue.
    const lapida = soloCodigo(leer("app/api/projects/[projectId]/timeline/proposal/apply-items/route.ts"));
    expect(lapida).toContain("status: 409");
    expect(lapida).not.toMatch(/prisma\./);
  });

  it("#3 / #6 · el handoff no pisa una propuesta abierta con algo por decidir, sea de las reuniones o de un handoff anterior", () => {
    /* ⚠ REESCRITA en la corrección de E1 (2026-09-24), con esta razón: la respuesta 1 de Elías («se
       queda la abierta y se avisa a quien regeneró») vale para TODA propuesta abierta. La guarda de
       antes exigía el chequeo de solo `origen === "contexto"`, y con él la del handoff se seguía
       reemplazando a mitad de la revisión. Ahora pide: preguntarle al núcleo del borrador si la
       abierta tiene algo por decidir ANTES de escribir, avisar con el texto de cada origen, y que la
       escritura siga condicionada a lo que se leyó (el comportamiento de `propuestaPorDecidir` se
       prueba en lib/timeline/borrador.test.ts).
       La edición que la pone en rojo: volver a proteger solo la de las reuniones, sacar la pregunta,
       o volver al `update` plano de `pendingProposal`. */
    const analyze = soloCodigo(leer("app/api/clients/[id]/analyze/route.ts"));
    const iNoOp = analyze.indexOf("if (reconciled.isNoOp) {");
    const iPregunta = analyze.indexOf("propuestaPorDecidir(existing.pendingProposal,");
    const iEscritura = analyze.indexOf("pendingProposal: { anchorStartDate: reconciled.anchorStartDate");
    expect(iNoOp).toBeGreaterThan(-1);
    expect(iPregunta, "no pregunta si la propuesta abierta tiene algo por decidir").toBeGreaterThan(iNoOp);
    expect(iPregunta).toBeLessThan(iEscritura);
    const antesDeEscribir = analyze.slice(iNoOp, iEscritura);
    expect(antesDeEscribir.length).toBeGreaterThan(300);
    expect(antesDeEscribir, "volvió a proteger solo la de las reuniones").not.toMatch(
      /if \(origenDePropuesta\([^)]*\) === "contexto"\) \{/,
    );
    expect(antesDeEscribir).toContain("AVISO_PROPUESTA_DE_LAS_REUNIONES_PENDIENTE");
    expect(antesDeEscribir).toContain("AVISO_PROPUESTA_DEL_HANDOFF_PENDIENTE");
    const escritura = analyze.slice(analyze.lastIndexOf("prisma.projectTimeline.", iEscritura), iEscritura);
    expect(escritura, "la escritura no está condicionada a lo que se leyó").toContain("updateMany(");
  });

  it("#21 · lo que notó el paso 1 se ve aunque el paso 2 falle o vuelva vacío", () => {
    /* La edición que la pone en rojo: mostrar las observaciones solo en el acordeón del paso 2.
       ⚠ ACTUALIZADA en E2a P6 (2026-09-25), con esta razón: el acordeón (`allRegenPreview`) ya no
       existe; la franja se ve cuando esta pantalla ya no está pidiendo nada (`armando === null`) y no
       hay una propuesta en pantalla. Pide lo mismo: que no dependa de un paso 2 exitoso. */
    expect(canvas).toMatch(/observacionesPaso1\.length > 0 &&\s*armando === null &&\s*!hayBorrador && \(/);
    expect(canvas).toContain("<ObservacionesDelPaso1 observaciones={observacionesPaso1}");
  });

  it("E2a · el acordeón viejo de «Regenerar todo» ya no se monta ni se aplica desde el Canvas", () => {
    /* Su resultado vivía solo en memoria (cancelarlo tiraba una corrida pagada) y se aplicaba por
       apply-all, fuera de la propuesta. El archivo sigue hasta E2b (lo lee propuesta-de-estructura.test).
       La edición que la pone en rojo: volver a montarlo, o volver a aplicar por apply-all. */
    expect(canvas.length).toBeGreaterThan(100_000);
    expect(canvas).not.toContain("<AllPhasesRegenModal");
    expect(canvas).not.toMatch(/import[^;]*AllPhasesRegenModal/);
    expect(canvas).not.toContain("applyAllRegen");
    expect(canvas).not.toContain("detail/apply-all");
    expect(fs.existsSync(path.join(RAIZ, "components/canvas/AllPhasesRegenModal.tsx"))).toBe(true);
  });

  it("#22 · la corrida fallida guarda la frase de la pantalla, no el crudo del SDK", () => {
    /* La edición que la pone en rojo: volver a `{ error: e.message }` en el catch de la ruta. */
    const ruta = soloCodigo(leer("app/api/projects/[projectId]/timeline/estructura/route.ts"));
    const iCatch = ruta.indexOf("} catch (e) {");
    expect(ruta.slice(iCatch, ruta.indexOf("ESTRUCTURA_FALLO", iCatch))).toContain("error: errorDeLaRevisionDeFases(e)");
  });
});
