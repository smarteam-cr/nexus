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
  largoDelPlanEnSemanas,
  lineaDelLargoDelPlan,
  renderEstructuraDelCronograma,
  tieneMaterialDelCronograma,
} from "./estructura-cronograma";
import { FRONTERA_DEL_MATERIAL, type FotoDelCronograma } from "./material-cronograma";
import { PIEZAS_CON_CONTEXTO_NOMBRADO } from "./tipos";
import { fraseDelPlazo, hayMaterialParaElPaso1 } from "@/lib/timeline/propuesta-de-estructura";

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

  it("⭐ cierra con el LARGO DEL PLAN en números y la cuenta del plazo hecha (revisión del paso A3)", () => {
    /* Con el plan en 15 semanas y un plazo de 12, el revisor escribió «3 semanas de holgura» en las 3
       corridas de E3: tenía el número y leyó al revés la resta. La edición que la pone en rojo:
       sacar la línea de `calendarioDeEstructura`, contar la suma de las duraciones en vez del
       calendario (con fases en paralelo es más), o escribir las frases a mano. */
    // S0 1 · Arquitectura 2–4 · Configuración FIJADA en 5–8: 8 semanas (la suma daría 8 también;
    // con Configuración fijada en la 3 se solapa y el largo es 6, no 8).
    for (const cal of [
      calendarioDeEstructura(FOTO, AHORA),
      calendarioDeEstructura({ ...FOTO, anchorStartDate: null }, AHORA),
    ]) {
      expect(cal.slice(cal.lastIndexOf("\n") + 1)).toBe(lineaDelLargoDelPlan(FOTO));
      expect(cal).toContain("⭐ LARGO DEL PLAN HOY (sin los cambios que propongas): 8 semanas, de la semana 1 a la semana 8 del proyecto.");
    }
    const linea = lineaDelLargoDelPlan(FOTO);
    // La cuenta sale de las MISMAS frases que el prompt obliga y que mide la prueba en vivo.
    expect(linea.replace("8 − M", "3")).toContain(fraseDelPlazo(8, 5));
    expect(linea.replace("M − 8", "4")).toContain(fraseDelPlazo(8, 12));
    const enParalelo = { ...FOTO, phases: FOTO.phases.map((f) => (f.id === "conf" ? { ...f, startWeek: 2 } : f)) };
    expect(largoDelPlanEnSemanas(enParalelo)).toBe(6);
    expect(lineaDelLargoDelPlan(enParalelo)).toContain(": 6 semanas, de la semana 1 a la semana 6 del proyecto.");
    expect(lineaDelLargoDelPlan({ ...FOTO, phases: [] })).toBe("");
  });
});

describe("G6 · el mensaje: lo suyo, y nada del detalle", () => {
  const REUNIONES = "=== REUNIONES QUE EL CSE ELIGIÓ PARA EL CRONOGRAMA (material INTERNO) ===\nCENTINELA-REUNION";
  const NOTAS = "=== NOTAS DEL CSE PARA EL CRONOGRAMA (pegadas a mano — material INTERNO) ===\nCENTINELA-NOTA";
  const INSTRUCCIONES = "=== INSTRUCCIONES DEL CSE PARA ESTA PIEZA (reglas duras — cumplilas SIEMPRE) ===\nSolo marketing.\n\n";
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

  it("sin reuniones ni notas: sin fuentes, y NO lee el handoff", async () => {
    /* La edición que la pone en rojo: volver a leer el handoff junto con el material (todo
       «Regenerar todo» sin material pagaría esa lectura). */
    const c = await cargarContextoDeEstructura("p1", FOTO);
    expect(c.fuentes).toEqual([]);
    expect(tieneMaterialDelCronograma(c.fuentes)).toBe(false);
    expect(h.loadHandoffContext).not.toHaveBeenCalled();
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
    expect(iSinMaterial).toBeLessThan(src.indexOf("prisma.agentRun.create("));
    expect(src.slice(src.indexOf("cargarContextoDeEstructura("), iSinMaterial)).toContain(
      "!tieneMaterialDelCronograma(contexto.fuentes)",
    );
  });

  it("la corrida se crea antes del modelo, sin agente, con quién y con qué reuniones", () => {
    const iRun = src.indexOf("prisma.agentRun.create(");
    expect(iRun).toBeGreaterThan(-1);
    expect(iRun).toBeLessThan(iModelo);
    const alta = src.slice(iRun, src.indexOf("});", iRun));
    expect(alta).toContain("agentId: null");
    expect(alta).toContain("agentSlug: ID_ESTRUCTURA_CRONOGRAMA");
    expect(alta).toContain("triggeredByEmail: await triggeredByEmail()");
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

  it("sin material no responde 409 aunque haya una propuesta pendiente (revisión del paso A2)", () => {
    /* Con una propuesta del handoff pendiente y nada elegido, «Generar cronograma» avisaba «Hay
       cambios de fases sin revisar… para que la IA revise las fases» aunque la IA nunca iba a
       revisar ninguna. La edición que la pone en rojo: volver a mirar la propuesta pendiente antes
       que el material. */
    const iSinMaterial = src.indexOf('estado: "sin-material"');
    const i409 = src.indexOf("tl.pendingProposal !== null");
    expect(i409, "no se encontró el 409").toBeGreaterThan(-1);
    expect(i409, "el 409 volvió a ir antes del chequeo del material").toBeGreaterThan(iSinMaterial);
    expect(i409, "el 409 tiene que ir antes de la corrida y del modelo").toBeLessThan(src.indexOf("prisma.agentRun.create("));
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
});

describe("G12 · la pantalla: la cadena al paso 2, y lo que no puede perderse", () => {
  const src = soloCodigo(leer("components/canvas/CronogramaCanvas.tsx"));
  const tramo = (desde: string, hasta: string) => {
    const i = src.indexOf(desde);
    return i < 0 ? "" : src.slice(i, src.indexOf(hasta, i + desde.length));
  };

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
    expect(pedir.slice(0, iEstructura), "con una propuesta de las reuniones sin decidir, pide otra").toContain(
      'proposal?.origen === "contexto"',
    );
  });

  it("resolver la última sugerencia encadena el paso 2 y muestra las reubicaciones", () => {
    const resolver = tramo("const resolveProposalItems = async (", "useEffect(");
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
    const iGuarda = aplicar.indexOf("if (proposal && structureOnlyProposal) {");
    expect(iGuarda).toBeGreaterThan(-1);
    expect(iGuarda).toBeLessThan(aplicar.indexOf("aplicarOperaciones("));
    expect(aplicar.slice(iGuarda, iGuarda + 200)).toContain("fallo:");
  });

  it("si la propuesta desaparece sin pasar por acá, `load()` ofrece el paso 2", () => {
    const load = tramo("const load = useCallback(", "}, [projectId]);");
    expect(load).toContain('pasoTareasRef.current !== null && origenDePropuesta(data.pendingProposal) !== "contexto"');
    expect(load).toContain("setOfrecerTareas(true)");
  });

  it("la espera del paso 1 bloquea, y la franja sabe de dónde salió la propuesta", () => {
    const ocupado = tramo("const ocupado", "activo: false");
    expect(ocupado).toMatch(/\brevisandoEstructura\s*\?/);
    expect(src).toContain("origen={origenDePropuesta(proposal)}");
    expect(src).toContain("observaciones={proposal?.observaciones}");
    expect(src).toContain("<PasoDeTareasPendiente");
  });

  it("el auto-descarte de una propuesta de las reuniones sigue la cadena SALTANDO el paso 1 (revisión del paso A2)", () => {
    /* Sin `saltarEstructura`, el closure viejo todavía ve `proposal?.origen === "contexto"`, vuelve
       con «Primero decide…» y la cadena queda colgada. La edición que la pone en rojo: quitar el
       flag de la continuación de `discardProposal`, o leer el origen después de limpiar. */
    const descartar = tramo("const discardProposal = async (", "const resolveProposalItems = async (");
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
    // Los DOS lugares que dicen «Paso 1 de 2» dependen de `materialElegido`.
    const iModal = src.indexOf("Paso 1 de 2 · Revisando fases y tiempos con tus reuniones y notas…");
    expect(iModal).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, iModal - 500), iModal)).toContain("revisandoEstructura && materialElegido && (");
    const ocupado = tramo("const ocupado", "activo: false");
    expect(ocupado).toMatch(/revisandoEstructura\s*\?\s*materialElegido\s*\?\s*\{\s*activo: true,\s*rotulo: "Paso 1 de 2/);
    // La sección lo avisa con lo que ya sabe, y la pantalla lo escucha.
    expect(src).toMatch(/<CronogramaContextSection[^>]*onMaterial=\{setMaterialElegido\}/);
    const seccion = soloCodigo(leer("components/canvas/CronogramaContextSection.tsx"));
    expect(seccion).toContain("hayMaterialParaElPaso1({ reuniones, notas, informe: informeVivo })");
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
  const tramo = (desde: string, hasta: string) => {
    const i = canvas.indexOf(desde);
    return i < 0 ? "" : canvas.slice(i, canvas.indexOf(hasta, i + desde.length));
  };

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
    const iGuarda = assist.indexOf("if (proposal && structureOnlyProposal) {");
    expect(iGuarda, "submitAssist no frena").toBeGreaterThan(-1);
    expect(iGuarda).toBeLessThan(assist.indexOf("/timeline/assist"));
    expect(assist.slice(iGuarda, iGuarda + 200)).toContain("fallo: CAMBIOS_DE_FASES_SIN_DECIDIR");
    expect(canvas).toMatch(/onAssistPhase=\{\s*\(hasAiDetail \? canRegenerateTimeline : canGenerateTimeline\) && !\(proposal && structureOnlyProposal\)/);
  });

  it("#4 · descartar la del modificador no toca el servidor, y el DELETE solo borra la que la pantalla tiene enfrente", () => {
    /* La edición que la pone en rojo: el DELETE incondicional de antes, o sin `runId`. */
    const descartar = tramo("const discardProposal = async (", "const resolveProposalItems = async (");
    const iSi = descartar.indexOf("if (!proposalMeta.current.deAssist) {");
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
    /* La edición que la pone en rojo: sacar el 409 de apply-items, moverlo después de la transacción,
       o que la pantalla deje de mandar el `runId`. */
    const ruta = soloCodigo(leer("app/api/projects/[projectId]/timeline/proposal/apply-items/route.ts"));
    const i409 = ruta.indexOf('error: "PROPUESTA_CAMBIO"');
    expect(i409).toBeGreaterThan(-1);
    expect(i409).toBeLessThan(ruta.indexOf("prisma.$transaction("));
    expect(ruta.slice(ruta.indexOf('if ("runId" in body) {'), i409)).toContain(
      "vista !== (tl.pendingProposalRunId ?? null)",
    );
    const resolver = tramo("const resolveProposalItems = async (", "useEffect(");
    expect(resolver).toContain("runId: proposalMeta.current.runId");
    expect(resolver.slice(resolver.indexOf("res.status === 409"))).toContain("traerPropuestaPendiente()");
  });

  it("#3 / #6 · el handoff no pisa una propuesta de las reuniones sin decidir", () => {
    /* La edición que la pone en rojo: volver al `update` plano de `pendingProposal`, o sacar el chequeo
       del origen. */
    const analyze = soloCodigo(leer("app/api/clients/[id]/analyze/route.ts"));
    const iOrigen = analyze.indexOf('origenDePropuesta(existing.pendingProposal as { origen?: unknown } | null) === "contexto"');
    expect(iOrigen, "no mira de dónde es la propuesta pendiente").toBeGreaterThan(-1);
    const iEscritura = analyze.indexOf("pendingProposal: { anchorStartDate: reconciled.anchorStartDate");
    expect(iOrigen).toBeLessThan(iEscritura);
    const escritura = analyze.slice(analyze.lastIndexOf("prisma.projectTimeline.", iEscritura), iEscritura);
    expect(escritura, "la escritura no está condicionada a lo que se leyó").toContain("updateMany(");
    expect(analyze.slice(iOrigen, iEscritura)).toContain("AVISO_PROPUESTA_DE_LAS_REUNIONES_PENDIENTE");
  });

  it("#21 · lo que notó el paso 1 se ve aunque el paso 2 falle o vuelva vacío", () => {
    /* La edición que la pone en rojo: mostrar las observaciones solo en el acordeón del paso 2. */
    expect(canvas).toMatch(/observacionesPaso1\.length > 0 &&\s*!allRegenPreview &&/);
    expect(canvas).toContain("<ObservacionesDelPaso1 observaciones={observacionesPaso1}");
  });

  it("#22 · la corrida fallida guarda la frase de la pantalla, no el crudo del SDK", () => {
    /* La edición que la pone en rojo: volver a `{ error: e.message }` en el catch de la ruta. */
    const ruta = soloCodigo(leer("app/api/projects/[projectId]/timeline/estructura/route.ts"));
    const iCatch = ruta.indexOf("} catch (e) {");
    expect(ruta.slice(iCatch, ruta.indexOf("ESTRUCTURA_FALLO", iCatch))).toContain("error: errorDeLaRevisionDeFases(e)");
  });
});
