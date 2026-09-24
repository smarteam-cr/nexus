import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resumenDelInforme, type FotoDelCronograma } from "./material-cronograma";

/**
 * lib/contexto/cargar-material.test.ts — LAS OPCIONES DEL CARGADOR DEL MATERIAL LLEGAN.
 *
 * `cargarMaterialDelCronograma(projectId, opts)` es UNO para cuatro lectores: el detalle y «Pedir
 * cambio con IA» lo llaman sin opciones; el chat, con un tope y una lectura menores y sin la
 * ubicación de cada reunión; el revisor de fases de «Regenerar todo», con SU foto del plan. Una
 * opción que se ignora no rompe nada visible: el chat recibe el tope de 48.000, el revisor
 * compara contra otra foto, y todo sigue verde. Revisión del paso D1 (2026-09-23): sacar
 * `topeReuniones` y `maxALeer` del cargador dejó verdes los 118 tests que lo rodean.
 *
 * Por eso esto LLAMA al cargador, con Prisma y el chokepoint de reuniones de mentira, en vez de
 * leer su código: lo que se afirma es lo que devuelve.
 */

const h = vi.hoisted(() => {
  const estado = {
    sesiones: [] as Array<{ id: string; title: string; date: number; participants: string[] }>,
    filas: new Map<string, { id: string; title: string; summary: unknown; minute: null }>(),
    fotoDeLaBase: null as unknown,
    notas: [] as Array<{ title: string | null; content: string; createdAt: Date }>,
    canvas: null as unknown,
  };
  const prisma = {
    firefliesSession: {
      findMany: vi.fn(async (args: { where: { id: { in: string[] } } }) =>
        args.where.id.in.map((id) => estado.filas.get(id)).filter(Boolean),
      ),
    },
    $queryRaw: vi.fn(async () => []),
    projectTimeline: { findUnique: vi.fn(async () => estado.fotoDeLaBase) },
    timelineSource: { findMany: vi.fn(async () => estado.notas) },
    // Las «Instrucciones adicionales» del cronograma (el brief `__doc`), para la puerta del chat.
    projectCanvas: { findFirst: vi.fn(async () => estado.canvas) },
  };
  return { estado, prisma };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: h.prisma }));
vi.mock("@/lib/sessions/project-sources", () => ({
  getProjectTimelineSessions: vi.fn(async () => ({ sessions: h.estado.sesiones, dropped: [] })),
}));
// unstable_cache revienta fuera de Next.
vi.mock("@/lib/cache/session-categories", () => ({ getSessionCategories: vi.fn(async () => []) }));
vi.mock("@/lib/canvas/load-canvas-context", () => ({ loadHandoffContext: vi.fn(), loadTimelineContext: vi.fn() }));
vi.mock("@/lib/canvas/desarrollo-context", () => ({ loadDesarrolloContext: vi.fn() }));
vi.mock("@/lib/cs/hubspot-ops-block", () => ({ bloqueDeOperativa: vi.fn(() => "") }));

const { cargarMaterialDelCronograma, cargarMaterialParaElChat } = await import("./cargar");

const DIA = 86_400_000;
const AHORA = Date.UTC(2026, 8, 23, 18);

/** Cinco reuniones de 5.000 caracteres de resumen (Fireflies: pasa entero), de hace 1 a 5 días. */
function sembrar() {
  h.estado.sesiones = [];
  h.estado.filas = new Map();
  for (let i = 1; i <= 5; i++) {
    const id = `r${i}`;
    h.estado.sesiones.push({ id, title: `Semanal ${i}`, date: AHORA - i * DIA, participants: [] });
    const overview = Array.from({ length: 50 }, () => `${id} ${"p".repeat(96)}`).join("\n").slice(0, 5_000);
    h.estado.filas.set(id, { id, title: `Semanal ${i}`, summary: { overview }, minute: null });
  }
  h.estado.fotoDeLaBase = {
    anchorStartDate: new Date(Date.UTC(2026, 8, 14)),
    closeDateOverride: null,
    phases: [{ name: "Fase de la base", durationWeeks: 4, startWeek: null }],
  };
  h.estado.notas = [{ title: "Acuerdo", content: "Primero Service.", createdAt: new Date(Date.UTC(2026, 8, 22, 15)) }];
  h.estado.canvas = null;
}

const FOTO_DE_QUIEN_LLAMA: FotoDelCronograma = {
  anchorStartDate: "2026-09-14T00:00:00.000Z",
  phases: [{ id: "f1", name: "Fase de quien llama", durationWeeks: 4, startWeek: null }],
};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
});
afterAll(() => {
  vi.useRealTimers();
});
beforeEach(() => {
  vi.clearAllMocks();
  sembrar();
});

describe("⭐ las opciones del cargador del material llegan", () => {
  it("sin opciones: lee las 5, entran enteras, y lee la foto del plan de la base", async () => {
    const m = await cargarMaterialDelCronograma("p1");
    const r = resumenDelInforme(m.informe);
    expect(r.completas).toBe(5);
    expect(h.prisma.firefliesSession.findMany.mock.calls[0][0].where.id.in).toHaveLength(5);
    expect(h.prisma.projectTimeline.findUnique).toHaveBeenCalledTimes(1);
    expect(m.calendario).toContain("Fase de la base");
    expect(m.reuniones).toContain("«Fase de la base», su semana");
  });

  it("`topeReuniones`: el material entra en ESE tope, no en el de 48.000", async () => {
    const m = await cargarMaterialDelCronograma("p1", { topeReuniones: 8_000 });
    const entran = m.informe.reuniones.reduce((s, x) => s + x.entran, 0);
    expect(entran).toBeLessThanOrEqual(8_000);
    expect(resumenDelInforme(m.informe).completas, "con 8.000 no entra ninguna de 5.000 entera").toBe(0);
    expect(m.sesionesUsadas).toHaveLength(5);
  });

  it("`maxALeer`: se leen solo las más recientes, y las demás salen «afuera» en el informe", async () => {
    const m = await cargarMaterialDelCronograma("p1", { maxALeer: 2 });
    expect([...h.prisma.firefliesSession.findMany.mock.calls[0][0].where.id.in].sort()).toEqual(["r1", "r2"]);
    const r = resumenDelInforme(m.informe);
    expect(r.entran).toBe(2);
    expect(r.afuera).toBe(3);
  });

  it("`fases`: el calendario y la ubicación salen de la foto de quien llama, sin leer la base", async () => {
    const m = await cargarMaterialDelCronograma("p1", { fases: FOTO_DE_QUIEN_LLAMA });
    expect(h.prisma.projectTimeline.findUnique).not.toHaveBeenCalled();
    expect(m.calendario).toContain("Fase de quien llama");
    expect(m.calendario).not.toContain("Fase de la base");
    expect(m.reuniones).toContain("«Fase de quien llama», su semana");
  });

  it("`sinUbicacion`: las reuniones van sin su lugar en el plan (la caché del chat), el calendario sigue", async () => {
    const m = await cargarMaterialDelCronograma("p1", { sinUbicacion: true });
    expect(m.reuniones).toContain("### Semanal 1 — 22 sep 2026\n");
    expect(m.reuniones).not.toContain("del proyecto:");
    expect(m.calendario).toContain("Fase de la base");
  });

  it("`lector`: con \"chat\" los rótulos de reuniones y notas no nombran el handoff; sin él, sí", async () => {
    /* Revisión del paso C (2026-09-24): el chat recibía el rótulo de los agentes, que habla de «el
       handoff» (el chat no lo tiene) y de «decidir el trabajo». La edición que la pone en rojo:
       que el cargador ignore `opts.lector` al armar alguno de los dos bloques. */
    const chat = await cargarMaterialDelCronograma("p1", { lector: "chat" });
    expect(chat.reuniones, "las reuniones del chat nombran el handoff").not.toMatch(/handoff/i);
    expect(chat.notas, "las notas del chat nombran el handoff").not.toMatch(/handoff/i);
    expect(chat.reuniones).toContain("### Semanal 1 — 22 sep 2026");
    const agentes = await cargarMaterialDelCronograma("p1");
    expect(agentes.reuniones, "los agentes perdieron el orden de peso contra el handoff").toContain("el handoff");
    expect(agentes.notas).toContain("más que el handoff");
  });
});

describe("⭐ lo que el cargador lee de la base para la foto y las notas", () => {
  it("el cierre fijado a mano llega al calendario", async () => {
    h.estado.fotoDeLaBase = { ...(h.estado.fotoDeLaBase as object), closeDateOverride: new Date(Date.UTC(2026, 10, 30)) };
    const m = await cargarMaterialDelCronograma("p1");
    const args = h.prisma.projectTimeline.findUnique.mock.calls[0] as unknown as [{ select: Record<string, unknown> }];
    expect(args[0].select.closeDateOverride, "la lectura de la foto dejó de pedir el cierre fijado").toBe(true);
    expect(m.calendario).toContain("cierre fijado a mano: 30 nov 2026");
  });

  it("cada nota llega con la fecha de su carga", async () => {
    const m = await cargarMaterialDelCronograma("p1");
    const args = h.prisma.timelineSource.findMany.mock.calls[0] as unknown as [{ select: Record<string, unknown> }];
    expect(args[0].select.createdAt, "la lectura de las notas dejó de pedir la fecha").toBe(true);
    expect(m.notas).toContain("### Nota: Acuerdo — cargada el 22 sep 2026\nPrimero Service.");
  });
});

describe("⭐ la puerta del CHAT del cronograma (paso C, decisión de Elías 2026-09-23)", () => {
  /** `n` reuniones de 5.000 caracteres, de hace 1 a `n` días. */
  function sembrarMuchas(n: number) {
    h.estado.sesiones = [];
    h.estado.filas = new Map();
    for (let i = 1; i <= n; i++) {
      const id = `m${String(i).padStart(2, "0")}`;
      h.estado.sesiones.push({ id, title: `Semanal ${i}`, date: AHORA - i * DIA, participants: [] });
      const overview = Array.from({ length: 50 }, () => `${id} ${"p".repeat(96)}`).join("\n").slice(0, 5_000);
      h.estado.filas.set(id, { id, title: `Semanal ${i}`, summary: { overview }, minute: null });
    }
  }

  it("lee con el presupuesto del chat (24 lecturas, 16.000), sin ubicación y con las instrucciones", async () => {
    /* Esto LLAMA a la puerta: una opción que se ignora (el tope, las lecturas, la ubicación) o las
       instrucciones que no se leen no rompen nada visible. Las ediciones que la ponen en rojo:
       sacar `PRESUPUESTO_DEL_CHAT` o `sinUbicacion` de la puerta, o dejar de leer el brief. */
    sembrarMuchas(30);
    h.estado.canvas = { sections: [{ key: "__doc", label: "Instrucciones", brief: "Nada de integraciones." }] };
    const m = await cargarMaterialParaElChat("p1");
    expect(h.prisma.firefliesSession.findMany.mock.calls[0][0].where.id.in, "leyó más que las 24 del chat").toHaveLength(24);
    expect(m.lectura.elegidas).toBe(30);
    expect(m.lectura.entran).toBe(16);
    expect(m.lectura.afuera).toBe(14);
    expect(m.lectura.instrucciones).toBe(true);
    expect(m.texto).toContain("=== MATERIAL DEL CRONOGRAMA");
    expect(m.texto).toContain("Nada de integraciones.");
    expect(m.texto, "las reuniones del chat llevan su lugar en el plan: la caché cambia con cada fase").not.toContain(
      "del proyecto:",
    );
    expect(m.texto).toContain("### Nota: Acuerdo — cargada el 22 sep 2026");
    // Revisión del paso C (2026-09-24): el chat no tiene el handoff, y nada de su bloque lo nombra.
    expect(m.texto, "la puerta del chat arma los rótulos de los agentes (nombran el handoff)").not.toMatch(/handoff/i);
    const contenido = m.materialInterno.filter((t) => !t.startsWith("### Nota:"));
    expect(contenido.reduce((s, t) => s + t.length, 0), "el chat leyó más que su tope").toBeLessThanOrEqual(16_000);
  });

  it("sin reuniones, sin notas y sin instrucciones: texto vacío (el bloque del material no va)", async () => {
    h.estado.sesiones = [];
    h.estado.notas = [];
    const m = await cargarMaterialParaElChat("p1");
    expect(m.texto).toBe("");
    expect(m.lectura.instrucciones).toBe(false);
    expect(m.materialInterno).toEqual([]);
  });
});
