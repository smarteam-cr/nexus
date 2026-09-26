/**
 * lib/timeline/propuestas-abiertas.test.ts — el control antes del deploy y la vuelta atrás de las
 * propuestas del cronograma (scripts/propuestas-abiertas.ts, E2b P8).
 *
 * Lo puro vive en scripts/lib/propuestas-abiertas.ts. El test vive acá porque el project `unit` solo
 * incluye lib/** (el mismo patrón que lib/db/guard.test.ts).
 *
 * Qué se congela:
 *   · desde E2b el v1 ya no frena el deploy (lo escriben también el handoff y «Regenerar» de una
 *     fase), y el viejo del handoff tampoco (su lector vive hasta E4);
 *   · la vuelta atrás deja los v1 «solo de fases» (los del handoff: E1 los lee bien) y limpia los
 *     que esperan o traen tareas, con la escritura condicionada de siempre (token + formato);
 *   · el listado y la inspección imprimen `origen` y `soloFase`;
 *   · (E3 P1) la vuelta atrás a E2c (`--desde-e3`) limpia los v1 con algo de E3, y el listado dice
 *     cuánto dictó el chat y cuántas casillas guarda;
 *   · (E4 P3) las viejas del handoff se convierten contra el cronograma DEL DÍA EN QUE SE CREARON,
 *     desandado con `TimelineEvent` (`fotoAlCrearse`): la copia vieja de un campo editado después
 *     desaparece y lo propuesto que se editó después queda como choque; `--antes-de-e4` frena con
 *     cualquier formato viejo; la escritura va condicionada a la vieja entera y con su respaldo antes.
 */
import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  borradorDelHandoff,
  borradorVacio,
  convertirDelHandoff,
  FORMATO_BORRADOR,
  planDeAplicacion,
  type Borrador,
  type CambioFaseCambia,
  type Vivo,
} from "./borrador";
import type { ProposalLike } from "./proposal-deltas";
import {
  FORMATOS,
  FRENAN_ANTES_DE_E4,
  FRENAN_EL_DEPLOY,
  convertirLaVieja,
  detalleDeLaConversion,
  diaYMes,
  esPropuestaVieja,
  esV1SoloDeFases,
  formatoDe,
  fotoAlCrearse,
  leerRespaldoDeViejas,
  lineaDelListado,
  rutaDelRespaldoDeViejas,
  traeAlgoDeE3,
  type EntradaDeLaConversion,
  type EventoDelCronograma,
  type FilaDelRespaldo,
  type VivoConOrden,
} from "../../scripts/lib/propuestas-abiertas";
import {
  deshacerLaConversion,
  escribirLaConversion,
  escrituraDeDeshacer,
  escrituraDeLaConversion,
  eventosPosteriores,
} from "../../scripts/lib/conversion-de-viejas";

const RAIZ = process.cwd();
/* Revisión de E3 (#29): con los saltos normalizados. Con `core.autocrlf=true` un checkout escribe el script
   en CRLF, y las guardas que buscan "\n" salían rojas sin que el código cambiara. */
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8").replace(/\r\n/g, "\n");

const fase = (id: string, name: string, durationWeeks: number) => ({
  id,
  name,
  durationWeeks,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
});
const VIVO: Vivo = { ancla: "2026-10-05", fases: [fase("a", "Kick-off", 1), fase("b", "Diseño", 2)] };
const PROPUESTA: ProposalLike = {
  anchorStartDate: "2026-10-05T00:00:00.000Z",
  phases: [
    fase("a", "Kick-off", 1),
    fase("b", "Diseño", 3),
    { name: "Piloto", durationWeeks: 2, startWeek: null, sessionCount: null, notes: null },
  ],
};
/** El v1 que deja el handoff desde E2b, tal como queda guardado (ida y vuelta por JSON). */
const DEL_HANDOFF = JSON.parse(
  JSON.stringify(borradorDelHandoff({ propuesta: PROPUESTA, vivo: VIVO, nuevaClave: () => "aaaaaaaa-1111" })),
) as Borrador;
const VIEJA_DEL_HANDOFF = { anchorStartDate: null, phases: [{ id: "a", name: "Kick-off", order: 0, durationWeeks: 1 }] };

describe("scripts/propuestas-abiertas — qué frena el deploy de E2b", () => {
  it("⭐ el v1 y la vieja del handoff ya no frenan; sí la vieja de «contexto», la vieja con `tasks` y lo ilegible", () => {
    /* La edición que la pone en rojo: volver a sumar "v1" (la calibración de E2a: después de E2a un v1
       abierto es normal) o sumar "viejo-handoff" (eso es de E4, cuando se va su lector). */
    expect(FRENAN_EL_DEPLOY).toEqual(["viejo-contexto", "viejo-con-tasks", "ilegible"]);
    expect(FRENAN_EL_DEPLOY).not.toContain("v1");
    expect(FRENAN_EL_DEPLOY).not.toContain("viejo-handoff");
    for (const k of FRENAN_EL_DEPLOY) expect(FORMATOS).toContain(k);
  });

  it("cada propuesta cae en UN formato: los v1 de E2b (handoff y una fase) son «v1»", () => {
    expect(DEL_HANDOFF.formato).toBe(FORMATO_BORRADOR);
    expect(formatoDe(DEL_HANDOFF)).toBe("v1");
    expect(formatoDe(borradorVacio({ pedido: "regenerar", corrida: "run-1", soloFase: "b" }))).toBe("v1");
    expect(formatoDe(VIEJA_DEL_HANDOFF)).toBe("viejo-handoff");
    expect(formatoDe({ ...VIEJA_DEL_HANDOFF, origen: "contexto" })).toBe("viejo-contexto");
    expect(formatoDe({ anchorStartDate: null, phases: [{ name: "Kick-off", durationWeeks: 1, tasks: [] }] })).toBe("viejo-con-tasks");
    for (const raro of [null, {}, "x", { phases: "no" }]) expect(formatoDe(raro)).toBe("ilegible");
  });

  it("el control usa esa lista, sin una copia propia en el script", () => {
    const src = leer("scripts/propuestas-abiertas.ts");
    expect(src).toContain('from "./lib/propuestas-abiertas"');
    expect(src).not.toMatch(/const FRENAN_EL_DEPLOY\b/);
    expect(src).not.toMatch(/function formatoDe\b/);
    expect(src).toContain("const frenan = FRENAN_EL_DEPLOY.filter(");
  });
});

describe("scripts/propuestas-abiertas — la vuelta atrás deja los v1 solo de fases", () => {
  it("⭐ el v1 del handoff (sin tareas y sin `tarea-*`) se queda: E1 lo lee bien", () => {
    /* La edición que la pone en rojo: limpiar todo v1 otra vez (se tirarían sugerencias del handoff
       que nadie revisó) o exigir algo que el handoff no escribe. */
    expect(DEL_HANDOFF.tareas).toBeNull();
    expect(DEL_HANDOFF.cambios.length).toBeGreaterThan(0);
    expect(esV1SoloDeFases(DEL_HANDOFF)).toBe(true);
    const { tareas: _t, ...sinLaClave } = DEL_HANDOFF;
    void _t;
    expect(esV1SoloDeFases(sinLaClave), "sin la clave `tareas` tampoco espera tareas").toBe(true);
  });

  it("⛔ se limpian los que esperan o traen tareas: el vacío, el de una fase, el ya armado y cualquier `tarea-*`", () => {
    /* La edición que la pone en rojo: mirar solo `tareas`, o mirar los cambios ya LEÍDOS (el lector
       descarta como desconocido un `tarea-*` que esta versión no conoce, y E1 lo bloquearía). */
    expect(esV1SoloDeFases(borradorVacio({ pedido: "regenerar", corrida: "run-1" }))).toBe(false);
    expect(esV1SoloDeFases(borradorVacio({ pedido: "regenerar", corrida: "run-1", soloFase: "b" }))).toBe(false);
    expect(esV1SoloDeFases({ ...DEL_HANDOFF, tareas: { corrida: "run-1", listas: true } })).toBe(false);
    const tareaNueva = {
      tipo: "tarea-nueva",
      clave: "t:uno",
      fase: "b",
      tarea: { title: "Probar", weekIndex: 0, notes: null, party: "SMARTEAM", type: "TASK", needsValidation: false, motivoPorValidar: null, fuga: null },
    };
    expect(esV1SoloDeFases({ ...DEL_HANDOFF, cambios: [...DEL_HANDOFF.cambios, tareaNueva] })).toBe(false);
    const deE3 = { tipo: "tarea-cambia", clave: "tarea:x:cambia", tareaId: "x" };
    expect(esV1SoloDeFases({ ...DEL_HANDOFF, cambios: [...DEL_HANDOFF.cambios, deE3] }), "un `tarea-*` desconocido").toBe(false);
  });

  it("lo que no es un v1 no entra (la vuelta atrás solo mira los v1)", () => {
    expect(esV1SoloDeFases(VIEJA_DEL_HANDOFF)).toBe(false);
    expect(esV1SoloDeFases(null)).toBe(false);
  });

  it("⭐ el script limpia SOLO los que no son solo de fases, con la escritura condicionada de siempre", () => {
    /* La edición que la pone en rojo: recorrer `v1s` en vez de `aLimpiar`, o soltar el token o el
       formato del `where` (se pisaría una propuesta que entró después de leer). */
    const src = leer("scripts/propuestas-abiertas.ts");
    const tramo = src.slice(src.indexOf("if (ROLLBACK) {"));
    const filtro = tramo.indexOf("const aLimpiar = v1s.filter((f) => !esV1SoloDeFases(f.pendingProposal));");
    const bucle = tramo.indexOf("for (const f of aLimpiar) {");
    const escribe = tramo.indexOf("prisma.projectTimeline.updateMany(");
    expect(filtro).toBeGreaterThan(-1);
    expect(bucle).toBeGreaterThan(filtro);
    expect(escribe).toBeGreaterThan(bucle);
    expect(tramo).not.toContain("for (const f of v1s)");
    expect(tramo).toContain("pendingProposalRunId: f.pendingProposalRunId,");
    expect(tramo).toContain('pendingProposal: { path: ["formato"], equals: FORMATO_BORRADOR },');
  });
});

describe("scripts/propuestas-abiertas — la vuelta atrás a E2c (`--desde-e3`)", () => {
  it("⭐ cuenta los v1 con un tipo de E3, con casillas guardadas o con algo del chat; nada más", () => {
    /* E2c lee `tarea-cambia` y `fase-se-va` como desconocidos (y bloquea), pero ignora `excluidos` y
       `porChat` EN SILENCIO: una pantalla de E2c volvería a marcar lo desmarcado en otra computadora y
       aplicaría lo del chat con la vara de la IA. La edición que la pone en rojo: mirar solo los tipos,
       o limpiar también un v1 de E2c que no trae nada de E3 (se perdería una propuesta sin razón). */
    expect(traeAlgoDeE3(DEL_HANDOFF)).toBe(false);
    expect(traeAlgoDeE3(borradorVacio({ pedido: "regenerar", corrida: "run-1" }))).toBe(false);
    expect(traeAlgoDeE3({ ...DEL_HANDOFF, excluidos: [] }), "casillas guardadas pero vacías").toBe(false);
    expect(traeAlgoDeE3({ ...DEL_HANDOFF, excluidos: ["orden"] })).toBe(true);
    expect(traeAlgoDeE3({ ...DEL_HANDOFF, cambios: [...DEL_HANDOFF.cambios, { tipo: "fase-se-va", clave: "fase:a:se-va" }] })).toBe(true);
    expect(traeAlgoDeE3({ ...DEL_HANDOFF, cambios: [...DEL_HANDOFF.cambios, { tipo: "tarea-cambia", clave: "tarea:x:cambia" }] })).toBe(true);
    expect(traeAlgoDeE3({ ...DEL_HANDOFF, cambios: [{ ...DEL_HANDOFF.cambios[0], porChat: true }] })).toBe(true);
    expect(traeAlgoDeE3(VIEJA_DEL_HANDOFF), "lo que no es un v1").toBe(false);
    // Y la vuelta atrás a E1 (`--rollback`) ya no deja uno del handoff que el chat tocó: E1 no lo lee.
    expect(esV1SoloDeFases({ ...DEL_HANDOFF, cambios: [{ ...DEL_HANDOFF.cambios[0], porChat: true }] })).toBe(false);
  });

  it("⛔ con `--apply` limpia SOLO esos, respaldando antes y con la escritura condicionada de siempre", () => {
    /* La edición que la pone en rojo: recorrer todos los v1, escribir sin el guard (`resolverApply` con
       la tabla) o soltar el token o el formato del `where`.
       E4 P3: el guard ya no se nombra con los dos modos de la vuelta atrás; cubre los cuatro que
       escriben (se sumaron `--convertir-viejas` y `--deshacer-conversion`). Lo cuida el describe de E4. */
    const src = leer("scripts/propuestas-abiertas.ts");
    expect(src).toContain("const MODOS_QUE_ESCRIBEN = [ROLLBACK, DESDE_E3, CONVERTIR, DESHACER].filter(Boolean).length;");
    expect(src).toContain('const APPLY = MODOS_QUE_ESCRIBEN > 0 ? resolverApply({ tablas: ["ProjectTimeline"] }) : false;');
    const tramo = src.slice(src.indexOf("if (DESDE_E3) {"));
    const filtro = tramo.indexOf("const deE3 = v1s.filter((f) => traeAlgoDeE3(f.pendingProposal));");
    const bucle = tramo.indexOf("for (const f of deE3) {\n        if (!APPLY) continue;");
    const escribe = tramo.indexOf("prisma.projectTimeline.updateMany(");
    expect(filtro).toBeGreaterThan(-1);
    expect(bucle).toBeGreaterThan(filtro);
    expect(escribe).toBeGreaterThan(bucle);
    expect(tramo).toContain("pendingProposalRunId: f.pendingProposalRunId,");
    expect(tramo).toContain('pendingProposal: { path: ["formato"], equals: FORMATO_BORRADOR },');
    // Y `--apply` solo, sin ningún modo que escriba, se sigue negando (E4 P3: son cuatro).
    expect(src).toContain('if (process.argv.includes("--apply") && MODOS_QUE_ESCRIBEN === 0) {');
  });

  it("el listado dice cuánto dictó el chat y cuántas casillas guarda cada v1", () => {
    const src = leer("scripts/propuestas-abiertas.ts");
    expect(src).toContain("del chat: ${delChat} · desmarcados guardados: ${b.excluidos?.length ?? 0}");
  });
});

describe("scripts de inspección — imprimen `origen` y `soloFase`", () => {
  it("el listado y la inspección de un proyecto dicen de dónde viene y si es de una fase", () => {
    /* La edición que la pone en rojo: sacar `soloFase` de la línea del v1 (una propuesta de una fase
       se leería como de todo el cronograma). */
    const listado = leer("scripts/propuestas-abiertas.ts");
    expect(listado).toContain("origen: ${origen}");
    expect(listado).toContain("soloFase: ${soloFase}");
    expect(listado).toContain("b.tareasArmadasPara[b.soloFase]");
    const inspeccion = leer("scripts/inspect-timeline-proposal.ts");
    expect(inspeccion).toContain("origen: ${b.origen}");
    expect(inspeccion).toContain("soloFase: ${soloFase}");
    /* ⚠ REESCRITA en E4 P4 (2026-09), con esta razón: pedía que la inspección imprimiera el origen del
       formato viejo. Desde P4 la app no lo lee: la inspección lo dice y remite al control de este script,
       el único que todavía lo conoce. La edición que la pone en rojo: volver a leer el formato viejo ahí. */
    expect(inspeccion).toContain("no es borrador-v1: corre npx tsx scripts/propuestas-abiertas.ts --antes-de-e4");
    expect(inspeccion).not.toContain("origenDePropuesta(");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── E4 P3: LAS VIEJAS DEL HANDOFF SE CONVIERTEN CONTRA LA FOTO DEL DÍA EN QUE SE CREARON ─────────
// ─────────────────────────────────────────────────────────────────────────────

/** Una fase viva con su `order` (lo que lee el script). */
const conOrden = (id: string, name: string, order: number, durationWeeks: number, extra: Partial<Vivo["fases"][number]> = {}) => ({
  ...fase(id, name, durationWeeks),
  order,
  ...extra,
});
const el = (dia: string) => new Date(`2026-${dia}T12:00:00.000Z`);
/** La corrida del handoff que dejó la propuesta vieja se creó el 1 de agosto. */
const CREADA = el("08-01");
const editada = (faseId: string, before: Record<string, unknown>, createdAt: Date, action = "MOVED"): EventoDelCronograma => ({
  entityType: "PHASE",
  entityId: faseId,
  action,
  before,
  createdAt,
});
const arranque = (antes: string | null, createdAt: Date): EventoDelCronograma => ({
  entityType: "TIMELINE",
  entityId: "tl",
  action: "ANCHOR_CHANGED",
  before: { anchorStartDate: antes },
  createdAt,
});

describe("E4 P3 · formatoDe ya no usa el lector de borrador.ts", () => {
  it("⭐ da lo mismo que antes en los 5 formatos, y el archivo no importa el lector de borrador.ts", () => {
    /* Desde P4 borrador.ts no conoce el formato viejo: este script es el único que lo clasifica. La
       edición que la pone en rojo: volver a clasificar con `esBorradorGuardado` o `leerBorrador`. */
    const casos: Array<[unknown, string]> = [
      [DEL_HANDOFF, "v1"],
      [borradorVacio({ pedido: "regenerar", corrida: "run-1" }), "v1"],
      [{ formato: FORMATO_BORRADOR }, "v1"],
      [VIEJA_DEL_HANDOFF, "viejo-handoff"],
      [{ phases: [] }, "viejo-handoff"],
      [{ formato: "otro", phases: [{ name: "x", durationWeeks: 1 }] }, "viejo-handoff"],
      [{ ...VIEJA_DEL_HANDOFF, origen: "contexto" }, "viejo-contexto"],
      [{ phases: [{ name: "x", durationWeeks: 1, tasks: [] }] }, "viejo-con-tasks"],
      [{ phases: [{ name: "x", durationWeeks: 1, tasks: null }] }, "viejo-con-tasks"],
      [{ phases: [null] }, "viejo-con-tasks"],
      [{ phases: ["x"] }, "viejo-con-tasks"],
      [null, "ilegible"],
      [{}, "ilegible"],
      ["x", "ilegible"],
      [{ phases: "no" }, "ilegible"],
      [[{ phases: [] }], "ilegible"],
    ];
    for (const [json, formato] of casos) expect(formatoDe(json), JSON.stringify(json)).toBe(formato);
    expect(esPropuestaVieja(VIEJA_DEL_HANDOFF)).toBe(true);
    expect(esPropuestaVieja(DEL_HANDOFF)).toBe(false);
    const src = leer("scripts/lib/propuestas-abiertas.ts");
    expect(src).not.toMatch(/\besBorradorGuardado\b/);
    expect(src).not.toMatch(/\bleerBorrador\b/);
  });
});

describe("E4 P3 · fotoAlCrearse: lo vivo desandado hasta el día en que se creó la propuesta", () => {
  const HOY: VivoConOrden = {
    ancla: "2026-10-05T00:00:00.000Z",
    fases: [
      conOrden("b", "Diseño funcional", 0, 3, { notes: "La nota viva" }),
      conOrden("a", "Kick-off", 1, 1),
      conOrden("c", "Pruebas", 2, 3, { sessionCount: 4 }),
      conOrden("d", "Soporte", 3, 2),
    ],
  };
  const EVENTOS: EventoDelCronograma[] = [
    // Anterior a la creación: no cuenta.
    editada("b", { durationWeeks: 9, name: "Diseño viejo" }, el("07-20")),
    // Dos del mismo campo, y el posterior viene primero en la lista: vale el del PRIMERO en el tiempo.
    editada("b", { durationWeeks: 5 }, el("08-10")),
    editada("b", { durationWeeks: 2 }, el("08-05")),
    editada("b", { name: "Diseño" }, el("08-06"), "EDITED"),
    // Un reorden a mano: b estaba 2.ª y a 1.ª.
    editada("b", { order: 1 }, el("08-07")),
    editada("a", { order: 0 }, el("08-07")),
    // `null` es un valor (c no tenía sesiones); un nombre que no es texto no vale: queda el vivo.
    editada("c", { sessionCount: null, name: 42 }, el("08-08"), "EDITED"),
    // Una fase creada después.
    { entityType: "PHASE", entityId: "d", action: "CREATED", before: null, createdAt: el("08-09") },
    // El arranque: el del primer cambio posterior.
    arranque("2026-09-01T00:00:00.000Z", el("08-03")),
    arranque("2026-09-15T00:00:00.000Z", el("08-04")),
  ];
  const foto = fotoAlCrearse({ vivo: HOY, creada: CREADA, eventos: EVENTOS });
  const deLaFoto = (id: string) => foto.fases.find((f) => f.id === id);

  it("⭐ cada campo sale del `before` del PRIMER evento posterior que lo trae; uno anterior a la creación no cuenta", () => {
    /* La edición que la pone en rojo: usar el último evento (daría 5 semanas) o no cortar por `creada`
       (daría 9 semanas y «Diseño viejo»). */
    expect(deLaFoto("b")).toMatchObject({ name: "Diseño", durationWeeks: 2 });
    expect(deLaFoto("c")).toMatchObject({ sessionCount: null, name: "Pruebas" });
  });

  it("⭐ una fase creada después no está, y un MOVED con `order` devuelve el orden de ese día", () => {
    /* La edición que la pone en rojo: dejar las fases creadas después (la conversión las leería como
       parte del cronograma de ese día) o ignorar el `order` de los eventos. */
    expect(foto.fases.map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  it("el arranque es el `before` del primer ANCHOR_CHANGED posterior; la nota es la viva", () => {
    /* La nota no tiene evento, pero no pudo cambiar: ninguna pantalla la edita. */
    expect(foto.ancla).toBe("2026-09-01T00:00:00.000Z");
    expect(fotoAlCrearse({ vivo: HOY, creada: CREADA, eventos: [arranque(null, el("08-02"))] }).ancla, "null es un valor").toBeNull();
    expect(deLaFoto("b")?.notes).toBe("La nota viva");
  });

  it("sin eventos posteriores la foto es lo vivo, sin `order` ni tareas; en un empate manda el orden vivo", () => {
    const igual = fotoAlCrearse({ vivo: HOY, creada: el("09-01"), eventos: EVENTOS });
    expect(igual.ancla).toBe(HOY.ancla);
    expect(igual.fases).toEqual(HOY.fases.map(({ order: _o, ...f }) => (void _o, f)));
    const empate = fotoAlCrearse({
      vivo: { ancla: null, fases: [conOrden("x", "Uno", 0, 1), conOrden("y", "Dos", 1, 1)] },
      creada: CREADA,
      eventos: [editada("y", { order: 0 }, el("08-02"))],
    });
    expect(empate.fases.map((f) => f.id)).toEqual(["x", "y"]);
  });
});

describe("E4 P3 · convertirLaVieja: contra la foto del día en que se creó, y el plan contra hoy", () => {
  /* El día en que se creó: Kick-off 1, Diseño 2, Pruebas 3, con arranque. El handoff copió TODOS los
     campos de cada fase, propuso Pruebas a 4 semanas y sumó un Piloto. Después, a mano: Diseño pasó a 3
     (un campo que el handoff solo copió) y Pruebas a 5 (el campo que propuso). */
  const ANCLA = "2026-10-05T00:00:00.000Z";
  const copia = (id: string, name: string, durationWeeks: number) => ({ ...fase(id, name, durationWeeks), order: 0 });
  const VIEJA: ProposalLike = {
    anchorStartDate: ANCLA,
    phases: [
      copia("a", "Kick-off", 1),
      copia("b", "Diseño", 2),
      copia("c", "Pruebas", 4),
      { name: "Piloto", durationWeeks: 2, startWeek: null, sessionCount: null, notes: null },
    ],
  };
  const HOY: VivoConOrden = {
    ancla: ANCLA,
    fases: [conOrden("a", "Kick-off", 0, 1), conOrden("b", "Diseño", 1, 3), conOrden("c", "Pruebas", 2, 5)],
  };
  const EDICIONES = [editada("b", { durationWeeks: 2 }, el("08-05")), editada("c", { durationWeeks: 3 }, el("08-06"))];
  const claves = () => {
    const ids = ["aaaaaaaa-1111", "bbbbbbbb-2222"];
    return () => ids.shift() ?? "cccccccc-3333";
  };
  const convertir = (json: unknown, vivoHoy: VivoConOrden, eventos: EventoDelCronograma[], creada: Date | null = CREADA) =>
    convertirLaVieja({ json, vivoHoy, creada, eventos, nuevaClave: claves() });
  const r = convertir(VIEJA, HOY, EDICIONES);
  const cambiaDe = (b: Borrador, faseId: string) =>
    b.cambios.find((c): c is CambioFaseCambia => c.tipo === "fase-cambia" && c.faseId === faseId);

  it("⭐ un campo que el handoff solo COPIÓ y alguien editó después no aparece: la copia vieja se va sola", () => {
    /* La edición que la pone en rojo: convertir contra `vivoHoy` (Diseño aparecería como «3 → 2 semanas»
       en «aplica», y «Aplicar todo» desharía la edición a mano). */
    if (r.tipo !== "convertida") throw new Error(`se esperaba «convertida» y dio «${r.tipo}»`);
    expect(cambiaDe(r.borrador, "b")).toBeUndefined();
    expect(r.plan.aplicadas.map((c) => c.tipo)).toEqual(["fase-nueva"]);
  });

  it("⭐ lo que el handoff PROPUSO y alguien editó después queda como choque del servidor, contra hoy", () => {
    /* La edición que la pone en rojo: fijar el `desde` a lo vivo (Pruebas quedaría «5 → 4» en «aplica»). */
    if (r.tipo !== "convertida") throw new Error(`se esperaba «convertida» y dio «${r.tipo}»`);
    expect(cambiaDe(r.borrador, "c")).toMatchObject({ campo: "durationWeeks", desde: 3, a: 4 });
    const item = r.plan.items.find((it) => it.cambio.clave === "fase:c:durationWeeks");
    expect(item).toMatchObject({ estado: "choque", choque: "Lo cambiaste a mano después de la propuesta: queda como lo dejaste." });
  });

  it("⭐ un reorden a mano posterior deja el cambio de orden en choque", () => {
    /* El handoff propuso a, c, b; después alguien dejó b, a, c. La edición que la pone en rojo: fijar el
       `desde` del orden a lo vivo (el orden propuesto quedaría en «aplica» y desharía el reorden). */
    const vieja: ProposalLike = { anchorStartDate: ANCLA, phases: [copia("a", "Kick-off", 1), copia("c", "Pruebas", 3), copia("b", "Diseño", 2)] };
    const hoy: VivoConOrden = {
      ancla: ANCLA,
      fases: [conOrden("b", "Diseño", 0, 2), conOrden("a", "Kick-off", 1, 1), conOrden("c", "Pruebas", 2, 3)],
    };
    const reorden = convertir(vieja, hoy, [editada("b", { order: 1 }, el("08-05")), editada("a", { order: 0 }, el("08-05"))]);
    if (reorden.tipo !== "convertida") throw new Error(`se esperaba «convertida» y dio «${reorden.tipo}»`);
    expect(reorden.borrador.cambios.find((c) => c.tipo === "orden")).toMatchObject({ desde: ["a", "b", "c"], a: ["a", "c", "b"] });
    expect(reorden.plan.items.find((it) => it.cambio.tipo === "orden")?.estado).toBe("choque");
  });

  it("⛔ una que solo choca se convierte (el CSE tiene que ver el ⚠); todo «ya está» no deja nada; sin fecha, no se convierte", () => {
    /* La edición que la pone en rojo: filtrar por aplicables contra hoy (una propuesta con solo choques se
       limpiaría sin que nadie la vea). */
    const soloChoca = convertir({ ...VIEJA, phases: VIEJA.phases.slice(0, 3) }, HOY, EDICIONES);
    expect(soloChoca.tipo).toBe("convertida");
    if (soloChoca.tipo === "convertida") expect([soloChoca.plan.aplicables, soloChoca.plan.choques]).toEqual([0, 1]);

    const yaEsta: VivoConOrden = { ancla: ANCLA, fases: [conOrden("a", "Kick-off", 0, 1), conOrden("b", "Diseño", 1, 2), conOrden("c", "Pruebas", 2, 4)] };
    const todoHecho = convertir({ ...VIEJA, phases: VIEJA.phases.slice(0, 3) }, yaEsta, [editada("c", { durationWeeks: 3 }, el("08-06"))]);
    expect(todoHecho).toEqual({ tipo: "nada-que-decidir", porque: "todo lo que propone ya está así" });

    const sinCambios = convertir({ ...VIEJA, phases: [copia("a", "Kick-off", 1), copia("b", "Diseño", 2), copia("c", "Pruebas", 3)] }, HOY, EDICIONES);
    expect(sinCambios.tipo, "igual al cronograma de ese día, aunque hoy sea otro").toBe("nada-que-decidir");

    expect(convertir(VIEJA, HOY, EDICIONES, null)).toEqual({ tipo: "sin-fecha" });
  });

  it("⭐ la salida es un `borrador-v1` del handoff, sin tareas, con claves `n:` y sin nada del chat", () => {
    /* La edición que la pone en rojo: escribir `excluidos` (la protección quedaría en la pantalla, y una
       vuelta atrás a E2c la borraba) o claves derivadas de posiciones. */
    if (r.tipo !== "convertida") throw new Error(`se esperaba «convertida» y dio «${r.tipo}»`);
    expect(r.borrador).toMatchObject({ formato: FORMATO_BORRADOR, origen: "handoff", version: 0, pedido: null, tareas: null, tareasArmadasPara: {} });
    expect(r.borrador.cambios.find((c) => c.tipo === "fase-nueva")?.clave).toBe("n:aaaaaaaa");
    expect("excluidos" in r.borrador).toBe(false);
    const json = JSON.stringify(r.borrador);
    expect(json).not.toContain("nueva:");
    expect(json).not.toContain("porChat");
    expect(formatoDe(JSON.parse(json))).toBe("v1");
  });

  it("solo convierte la vieja del handoff: con otro formato, tira", () => {
    expect(() => convertir(DEL_HANDOFF, HOY, [])).toThrow(/solo convierte el formato viejo del handoff/);
    expect(() => convertir({ ...VIEJA, origen: "contexto" }, HOY, [])).toThrow(/viejo-contexto/);
  });

  it("lo que imprime: la línea del listado y, en seco, la lista numerada con su estado y el resultado", () => {
    expect(lineaDelListado(r)).toBe("si se convierte: 1 aplican · 1 con ⚠ · 0 ya están");
    expect(lineaDelListado({ tipo: "nada-que-decidir", porque: "x" })).toBe("si se convierte: no deja nada por decidir");
    expect(lineaDelListado({ tipo: "sin-fecha" })).toContain("decídela en su barra");
    const lineas = detalleDeLaConversion(HOY, r);
    expect(lineas).toHaveLength(3);
    expect(lineas[0]).toMatch(/^1\. .+ — ⚠ Lo cambiaste a mano/);
    expect(lineas[1]).toMatch(/^2\. .*Piloto.* — aplica$/);
    expect(lineas[2]).toBe("se convierte: 2 cambios, 1 con ⚠.");
    expect(detalleDeLaConversion(HOY, { tipo: "nada-que-decidir", porque: "todo lo que propone ya está así" })).toEqual([
      "no deja nada por decidir: se limpia (todo lo que propone ya está así).",
    ]);
    expect(diaYMes(CREADA)).toBe("1 ago");
  });
});

describe("E4 P3 · borradorDelHandoff = convertirDelHandoff con el filtro de «nada aplicable»", () => {
  it("⭐ da lo mismo que antes de partirse: el borrador si hay algo que aplicar, null si no", () => {
    /* La edición que la pone en rojo: cambiar la conducta del handoff (soltar el filtro, o filtrar por
       `total`: una propuesta que solo choca se guardaría). */
    const claves = () => {
      const ids = ["aaaaaaaa-1111", "bbbbbbbb-2222"];
      return () => ids.shift() ?? "cccccccc-3333";
    };
    const igual: ProposalLike = { anchorStartDate: "2026-10-05T00:00:00.000Z", phases: VIVO.fases.map((f) => ({ ...f })) };
    const soloChoca: ProposalLike = { ...igual, phases: [...igual.phases, { name: "Diseño", durationWeeks: 2 }] };
    const casos: Array<[ProposalLike, boolean]> = [
      [PROPUESTA, true],
      [igual, false],
      [soloChoca, false],
    ];
    for (const [propuesta, guarda] of casos) {
      const b = convertirDelHandoff({ propuesta, vivo: VIVO, nuevaClave: claves() });
      expect(planDeAplicacion(VIVO, b).aplicables > 0).toBe(guarda);
      expect(borradorDelHandoff({ propuesta, vivo: VIVO, nuevaClave: claves() })).toEqual(guarda ? b : null);
    }
    // Lo que usa la conversión de las viejas: la que solo choca SÍ tiene su cambio.
    expect(planDeAplicacion(VIVO, convertirDelHandoff({ propuesta: soloChoca, vivo: VIVO })).choques).toBe(1);
  });
});

describe("E4 P3 · la escritura: condicionada a la vieja entera, con su respaldo antes", () => {
  const ENTRADA: EntradaDeLaConversion = {
    projectId: "p1",
    timelineId: "tl1",
    token: "run-1",
    original: VIEJA_DEL_HANDOFF,
    convertida: DEL_HANDOFF,
  };
  const LIMPIA: EntradaDeLaConversion = { ...ENTRADA, projectId: "p2", timelineId: "tl2", token: "run-2", convertida: null };
  /* Revisión de E4 (#3): la marca que la limpieza deja en el cronograma (`updatedAt`) y las filas del
     respaldo, con si se escribieron y esa marca. */
  const MARCA = new Date("2026-09-26T15:04:05.678Z");
  const FILA: FilaDelRespaldo = { ...ENTRADA, escrita: true, limpiadaEn: null };
  const FILA_LIMPIA: FilaDelRespaldo = { ...LIMPIA, escrita: true, limpiadaEn: MARCA.toISOString() };
  function baseFalsa(cuentas: number[]) {
    const llamadas: string[] = [];
    const updateMany = vi.fn(async () => {
      llamadas.push("updateMany");
      return { count: cuentas.shift() ?? 1 };
    });
    return { db: { projectTimeline: { updateMany }, timelineEvent: { findMany: vi.fn() } } as never, llamadas, updateMany };
  }

  it("⭐ convertir: el mismo cronograma, el mismo token y la MISMA vieja entera; conserva el token", () => {
    /* La edición que la pone en rojo: soltar el token o el `equals` de la vieja (se pisaría una propuesta
       que se decidió o entró después de leer), o limpiar el token al convertir (la autoría diría otra cosa). */
    /* ⚠ ACTUALIZADA en la revisión de E4 (#3), con esta razón: la limpieza deja en el cronograma una marca
       propia de la conversión (`updatedAt: limpiadaEn`), la que exige deshacerla. Convertir no la necesita:
       la convertida con su token ya es propia de la conversión. */
    expect(escrituraDeLaConversion(ENTRADA, MARCA)).toEqual({
      where: { id: "tl1", pendingProposalRunId: "run-1", pendingProposal: { equals: VIEJA_DEL_HANDOFF } },
      data: { pendingProposal: DEL_HANDOFF },
    });
    expect(escrituraDeLaConversion(LIMPIA, MARCA)).toEqual({
      where: { id: "tl2", pendingProposalRunId: "run-2", pendingProposal: { equals: VIEJA_DEL_HANDOFF } },
      data: { pendingProposal: Prisma.DbNull, pendingProposalRunId: null, updatedAt: MARCA },
    });
  });

  it("⭐ deshacer: solo si sigue siendo lo que escribió la conversión; vuelve la vieja con su token", () => {
    /* La edición que la pone en rojo: deshacer sin mirar qué hay (pisaría lo que el CSE aplicó o lo que
       entró después de la conversión).
       ⚠ ACTUALIZADA en la revisión de E4 (#3), con esta razón: una limpiada pedía solo «vacía», y eso encaja
       con cualquier cronograma vacío (otra propuesta que entró y se decidió después). Ahora exige también
       el `updatedAt` que le dejó la limpieza. Soltarlo la pone en rojo. */
    expect(escrituraDeDeshacer(FILA)).toEqual({
      where: { id: "tl1", pendingProposalRunId: "run-1", pendingProposal: { equals: DEL_HANDOFF } },
      data: { pendingProposal: VIEJA_DEL_HANDOFF },
    });
    expect(escrituraDeDeshacer(FILA_LIMPIA)).toEqual({
      where: { id: "tl2", pendingProposalRunId: null, pendingProposal: { equals: Prisma.DbNull }, updatedAt: MARCA },
      data: { pendingProposal: VIEJA_DEL_HANDOFF, pendingProposalRunId: "run-2" },
    });
  });

  it("⛔ revisión de E4 (#3) · deshacer toca SOLO lo que la conversión escribió", async () => {
    /* El respaldo guardaba todas las filas antes de escribir, sin decir cuáles quedaron en count 0, y deshacer
       recorría todas: una que la conversión nunca tocó (alguien la aplicó o descartó en el medio) recibía de
       vuelta la vieja. La edición que la pone en rojo: volver a deshacer sin mirar `escrita`. */
    const base = baseFalsa([1]);
    const d = await deshacerLaConversion(base.db, [{ ...FILA, escrita: false }, FILA_LIMPIA]);
    expect(base.updateMany, "deshizo una fila que la conversión no escribió").toHaveBeenCalledTimes(1);
    expect(base.updateMany).toHaveBeenCalledWith(escrituraDeDeshacer(FILA_LIMPIA));
    expect([d.noEscritas.map((f) => f.projectId), d.escritas.map((f) => f.projectId)]).toEqual([["p1"], ["p2"]]);
    // Una limpiada sin su marca no encaja con nada (1970), en vez de encajar con cualquier cronograma vacío.
    expect(escrituraDeDeshacer({ ...FILA_LIMPIA, limpiadaEn: null }).where.updatedAt).toEqual(new Date(0));
  });

  it("⛔ el respaldo se guarda ANTES de la primera escritura, con todas las filas; si falla, no se escribe nada", async () => {
    /* La edición que la pone en rojo: guardar el respaldo después de escribir, o no guardarlo.
       ⚠ ACTUALIZADA en la revisión de E4 (#3), con esta razón: se vuelve a guardar después de CADA fila escrita,
       con `escrita` y (en una limpiada) `limpiadaEn`: así el archivo dice qué se escribió de verdad. Una fila en
       count 0 no se vuelve a guardar: queda `escrita: false`. Guardar una sola vez, o anotar `escrita` sin
       mirar el count, la pone en rojo. */
    const base = baseFalsa([0, 1]);
    const guardados: FilaDelRespaldo[][] = [];
    const r = await escribirLaConversion(
      base.db,
      [ENTRADA, LIMPIA],
      (todas) => {
        base.llamadas.push(`respaldo de ${todas.length}`);
        guardados.push(JSON.parse(JSON.stringify(todas)));
      },
      MARCA,
    );
    expect(base.llamadas).toEqual(["respaldo de 2", "updateMany", "updateMany", "respaldo de 2"]);
    expect(guardados[0].map((f) => f.escrita), "antes de escribir, ninguna escrita").toEqual([false, false]);
    expect(guardados.at(-1), "el respaldo no dice qué se escribió de verdad").toEqual([
      { ...ENTRADA, escrita: false, limpiadaEn: null },
      { ...LIMPIA, escrita: true, limpiadaEn: MARCA.toISOString() },
    ]);
    expect(r.filas).toEqual(guardados.at(-1));
    expect(r.escritas.map((e) => e.projectId)).toEqual(["p2"]);
    expect(r.cambiaron.map((e) => e.projectId), "count 0: cambió desde que se leyó").toEqual(["p1"]);
    expect(base.updateMany).toHaveBeenLastCalledWith(escrituraDeLaConversion(LIMPIA, MARCA));

    const rota = baseFalsa([]);
    await expect(
      escribirLaConversion(rota.db, [ENTRADA], () => {
        throw new Error("sin espacio");
      }),
    ).rejects.toThrow("sin espacio");
    expect(rota.updateMany).not.toHaveBeenCalled();

    const vacia = baseFalsa([]);
    const guardar = vi.fn();
    await escribirLaConversion(vacia.db, [], guardar);
    expect(guardar, "sin filas no hay nada que respaldar").not.toHaveBeenCalled();

    const deshacer = baseFalsa([0, 1]);
    const d = await deshacerLaConversion(deshacer.db, [FILA, FILA_LIMPIA]);
    expect([d.escritas.map((e) => e.projectId), d.cambiaron.map((e) => e.projectId)]).toEqual([["p2"], ["p1"]]);
  });

  it("las ediciones que se leen: las posteriores a la creación, de fases y del arranque, en orden", async () => {
    /* La edición que la pone en rojo: soltar el `gt` (entrarían ediciones anteriores a la creación) o el orden. */
    const findMany = vi.fn(async () => []);
    await eventosPosteriores({ projectTimeline: {}, timelineEvent: { findMany } } as never, "p1", CREADA);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        projectId: "p1",
        createdAt: { gt: CREADA },
        entityType: { in: ["PHASE", "TIMELINE"] },
        action: { in: ["EDITED", "MOVED", "CREATED", "ANCHOR_CHANGED"] },
      },
      select: { entityType: true, entityId: true, action: true, before: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  });

  it("el respaldo se lee de vuelta para deshacer; uno con una sola fila rota no devuelve nada", () => {
    /* ⚠ ACTUALIZADA en la revisión de E4 (#3), con esta razón: cada fila trae ahora `escrita` y, si se limpió
       y se escribió, `limpiadaEn`. Sin eso no se sabe qué deshacer: el archivo no vale. */
    const texto = JSON.stringify([FILA, FILA_LIMPIA, { ...LIMPIA, escrita: false, limpiadaEn: null }]);
    expect(leerRespaldoDeViejas(texto)).toEqual({ filas: JSON.parse(texto) });
    const rotos = [
      "no es json",
      "{}",
      JSON.stringify([FILA, { ...FILA_LIMPIA, token: "" }]),
      JSON.stringify([{ ...FILA, original: DEL_HANDOFF }]),
      JSON.stringify([{ ...FILA, convertida: VIEJA_DEL_HANDOFF }]),
      // Revisión de E4 (#3): sin decir si se escribió, o limpiada y escrita sin su marca (o con una que no vale).
      JSON.stringify([ENTRADA]),
      JSON.stringify([{ ...FILA_LIMPIA, limpiadaEn: null }]),
      JSON.stringify([{ ...FILA_LIMPIA, limpiadaEn: "ayer" }]),
    ];
    for (const t of rotos) expect(leerRespaldoDeViejas(t), t).toHaveProperty("error");
    expect(rutaDelRespaldoDeViejas(new Date(2026, 8, 25, 14, 3, 9))).toBe(
      path.join("backups", "2026-09-25-propuestas-abiertas", "viejas-convertidas.140309.json"),
    );
  });
});

describe("E4 P3 · el script: `--antes-de-e4` y los modos que escriben", () => {
  const src = leer("scripts/propuestas-abiertas.ts");
  /** Desde la ÚLTIMA vez que aparece `desde` (`if (DESHACER) {` está también arriba, donde se lee el archivo). */
  const tramo = (desde: string, hasta: string) => {
    const i = src.lastIndexOf(desde);
    const j = src.indexOf(hasta, i + 1);
    expect(i, desde).toBeGreaterThan(-1);
    expect(j, hasta).toBeGreaterThan(i);
    return src.slice(i, j);
  };

  it("⭐ `--antes-de-e4` frena con cualquier formato viejo o ilegible, con la lista y sin copia propia", () => {
    /* La edición que la pone en rojo: dejar fuera «viejo-handoff» (P4 se desplegaría con propuestas que
       la app ya no sabe leer) o sumar «v1». */
    expect([...FRENAN_ANTES_DE_E4].sort()).toEqual(FORMATOS.filter((k) => k !== "v1").sort());
    expect(src).toContain('const ANTES_DE_E4 = process.argv.includes("--antes-de-e4");');
    expect(src).toContain("const frenanE4 = FRENAN_ANTES_DE_E4.filter((k) => cuenta[k] > 0);");
    expect(src).not.toMatch(/const FRENAN_ANTES_DE_E4\b/);
    expect(tramo("if (ANTES_DE_E4) {", "if (ROLLBACK) {")).toContain("process.exitCode = 1;");
  });

  it("⛔ `--apply` solo o con dos modos se niega; los cuatro modos que escriben pasan por el guard con la tabla", () => {
    /* La edición que la pone en rojo: un modo que escribe fuera de MODOS_QUE_ESCRIBEN (escribiría sin
       el guard ni el pg_dump), o aceptar `--apply` solo. */
    const niega = tramo('if (process.argv.includes("--apply") && MODOS_QUE_ESCRIBEN === 0) {', "}");
    expect(niega).toContain("process.exit(1);");
    expect(tramo("if (MODOS_QUE_ESCRIBEN > 1) {", "}")).toContain("process.exit(1);");
    expect(src).toContain('const CONVERTIR = process.argv.includes("--convertir-viejas");');
    expect(src).toContain('const iDeshacer = process.argv.indexOf("--deshacer-conversion");');
    // Solo escriben con APPLY: la conversión y la vuelta de la conversión, dentro de su `if (APPLY) {`.
    const convertir = tramo("if (CONVERTIR) {", "if (DESHACER) {");
    expect(convertir.indexOf("escribirLaConversion(")).toBeGreaterThan(convertir.indexOf("if (APPLY) {"));
    const deshacer = tramo("if (DESHACER) {", "} finally {");
    expect(deshacer.indexOf("deshacerLaConversion(")).toBeGreaterThan(deshacer.indexOf("if (APPLY) {"));
  });

  it("⛔ la conversión escribe solo por los helpers condicionados, y el respaldo JSON va en el que lo guarda primero", () => {
    /* La edición que la pone en rojo: un `update`/`updateMany` propio en esos tramos (sin la condición
       de la vieja entera), o escribir el respaldo fuera del callback (después de escribir). */
    const convertir = tramo("if (CONVERTIR) {", "if (DESHACER) {");
    const deshacer = tramo("if (DESHACER) {", "} finally {");
    for (const t of [convertir, deshacer]) {
      expect(t).not.toMatch(/\.update(Many)?\(/);
      expect(t).not.toMatch(/\$execute/);
    }
    const escribe = convertir.indexOf("escribirLaConversion(prisma, entradas, (todas) => {");
    expect(escribe).toBeGreaterThan(-1);
    expect(convertir.indexOf("writeFileSync(ruta, JSON.stringify(todas, null, 2));")).toBeGreaterThan(escribe);
    expect(convertir.indexOf("writeFileSync(")).toBeGreaterThan(escribe);
    const helpers = leer("scripts/lib/conversion-de-viejas.ts");
    expect(helpers.match(/\.updateMany\(/g)).toHaveLength(2);
    // ⚠ ACTUALIZADA en la revisión de E4 (#3): la conversión lleva la marca de la limpieza (`ahora`).
    expect(helpers).toContain("await db.projectTimeline.updateMany(escrituraDeLaConversion(e, ahora));");
    expect(helpers).toContain("await db.projectTimeline.updateMany(escrituraDeDeshacer(f));");
    expect(helpers).not.toMatch(/\.(update|upsert|delete|deleteMany|create|createMany)\(/);
  });

  it("⛔ revisión de E4 (#1, #2, #4) · el orden escrito es el que se va a correr: deploy de todo, conversión, control", () => {
    /* Los commits de E4 están apilados en main y el deploy de siempre despliega todo: «P4 después de la
       conversión» no se podía seguir. Elías decidió desplegar todo y convertir justo después. Las ediciones que
       la ponen en rojo: volver a escribir en el script, en borrador.ts o en DECISIONS que P4 va después de la
       conversión, o que deshacer «vale solo antes del deploy» (después también sirve: para no perder el dato). */
    const cabecera = src.slice(0, src.indexOf("import "));
    expect(cabecera).toContain("ORDEN DE E4 EN PRODUCCIÓN");
    const i1 = cabecera.indexOf("1. `--convertir-viejas` en seco;");
    const i2 = cabecera.indexOf("2. `--convertir-viejas --apply` (con ALLOW_PROD_WRITE);");
    const i3 = cabecera.indexOf("3. `--antes-de-e4`, que tiene que dar verde.");
    expect(i1, "la cabecera no dice el orden").toBeGreaterThan(cabecera.indexOf("el deploy de siempre con TODO main"));
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
    expect(cabecera).toContain("Sirve para no perder el dato, no para volver a revisarlas.");
    const decisiones = leer("docs/DECISIONS.md");
    expect(decisiones).toContain("- **Orden en producción** (decisión de Elías, revisión de E4)");
    for (const [rel, texto] of [
      ["scripts/propuestas-abiertas.ts", src],
      ["lib/timeline/borrador.ts", leer("lib/timeline/borrador.ts")],
      ["docs/DECISIONS.md", decisiones],
    ] as const) {
      expect(texto, `${rel} vuelve a poner P4 después de la conversión`).not.toMatch(
        /antes del deploy de (E4 )?P4|deploy de P4 va después|solo antes del deploy/i,
      );
    }
  });

  it("el listado dice cuántas ediciones leyó, qué dejaría la conversión, y no llama «el sistema» a una corrida sin email", () => {
    expect(src).toContain("ediciones posteriores leídas: ${conversion.ediciones}");
    expect(src).toContain("console.log(`   ${lineaDelListado(conversion.r)}`);");
    expect(src).not.toContain("(el sistema)");
  });
});
