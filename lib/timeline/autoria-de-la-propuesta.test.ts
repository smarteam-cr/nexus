/**
 * lib/timeline/autoria-de-la-propuesta.test.ts — quién dejó la propuesta del cronograma, cuándo y de
 * dónde viene (E2b P7).
 *
 * Correr: `npx vitest run lib/timeline/autoria-de-la-propuesta.test.ts --project unit`.
 *
 * La frase sale de UN lugar (`fraseDeAutoria`) y la usan la barra, el cartel (ficha y GPS) y «Qué
 * hacer acá». Quién y cuándo salen de la corrida del token; la fecha, en hora de Costa Rica y sin
 * `Intl`. El lector en lote se prueba contra la base falsa (vi.mock). Cada `it` nombra la edición que
 * lo pone en rojo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const db = vi.hoisted(() => ({
  agentRun: { findMany: vi.fn() },
  teamMember: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import {
  autoriaDeLaPropuesta,
  diaCorto,
  fraseDeAutoria,
  leerAutoria,
  type AutoriaDeLaPropuesta,
} from "./autoria-de-la-propuesta";
import { leerAutoriaDeLasPropuestas } from "./leer-autoria";
import { FORMATO_BORRADOR } from "./borrador";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const soloCodigo = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, "");
const sinEspacios = (s: string) => s.replace(/\s+/g, "");
const contiene = (src: string, esperado: string) => sinEspacios(src).includes(sinEspacios(esperado));

/** Un v1 de «Regenerar todo» (origen «contexto», pedido «regenerar»). */
const REGENERAR_TODO = { formato: FORMATO_BORRADOR, version: 1, origen: "contexto", pedido: "regenerar", cambios: [] };
/** Una propuesta vieja del handoff (sin formato ni origen). */
const VIEJA_DEL_HANDOFF = { anchorStartDate: null, phases: [] };

describe("la frase", () => {
  it("⭐ con quién y cuándo, solo cuándo, o ninguno", () => {
    /* La edición que la pone en rojo: cambiar el molde de la frase, o decir «el sistema» cuando no se
       sabe quién la dejó. */
    const a = (x: Partial<AutoriaDeLaPropuesta>): AutoriaDeLaPropuesta => ({ desde: "desde el handoff", quien: null, cuando: null, ...x });
    expect(fraseDeAutoria(a({ desde: "desde «Regenerar todo»", quien: "Ana López", cuando: "2026-09-24T15:00:00.000Z" }))).toBe(
      "desde «Regenerar todo» · la dejó Ana López el 24 sep",
    );
    expect(fraseDeAutoria(a({ cuando: "2026-07-11T15:00:00.000Z" }))).toBe("desde el handoff del 11 jul");
    expect(fraseDeAutoria(a({}))).toBe("desde el handoff");
    // Con quién pero sin una fecha que se pueda leer: se dice quién, no se inventa el día.
    expect(fraseDeAutoria(a({ quien: "Ana López", cuando: "basura" }))).toBe("desde el handoff · la dejó Ana López");
    for (const f of [fraseDeAutoria(a({})), fraseDeAutoria(a({ cuando: "2026-07-11T15:00:00.000Z" }))]) {
      expect(f, "nombra al sistema").not.toMatch(/sistema/i);
    }
  });

  it("⭐ el día va en hora de Costa Rica (UTC−6), sin `Intl` ni la hora de la máquina", () => {
    /* A las 21:00 del 24 en Costa Rica ya es el 25 en UTC: el día que ve el CSE es el 24. La edición
       que la pone en rojo: formatear en UTC, o con `Intl`/`toLocale…` (dependen de la zona y el idioma
       del servidor o del navegador), o leer «ahora». */
    expect(diaCorto("2026-09-25T03:00:00Z")).toBe("24 sep");
    expect(diaCorto("2026-01-01T05:59:59Z")).toBe("31 dic");
    expect(diaCorto("2026-01-01T06:00:00Z")).toBe("1 ene");
    expect(diaCorto("no es una fecha")).toBe("");
    const src = soloCodigo(leer("lib/timeline/autoria-de-la-propuesta.ts"));
    expect(src.length).toBeGreaterThan(800);
    expect(src, "usa Intl").not.toMatch(/\bIntl\b/);
    expect(src, "usa toLocale…").not.toMatch(/toLocale/);
    expect(src, "lee la hora de la máquina").not.toMatch(/new Date\(\s*\)|Date\.now\(/);
  });
});

describe("de dónde, quién y cuándo", () => {
  it("⭐ de dónde sale de `deDondeViene`; quién es el nombre del equipo o el email; sin email, nadie", () => {
    /* La edición que la pone en rojo: armar «desde» por otro camino, preferir el email al nombre, o
       inventar a alguien cuando la corrida no tiene quién la lanzó. */
    const corrida = { createdAt: new Date("2026-09-24T15:00:00.000Z"), triggeredByEmail: "ana@smarteamcr.com" };
    expect(autoriaDeLaPropuesta({ guardado: REGENERAR_TODO, corrida, nombre: "Ana López" })).toEqual({
      desde: "desde «Regenerar todo»",
      quien: "Ana López",
      cuando: "2026-09-24T15:00:00.000Z",
    });
    expect(autoriaDeLaPropuesta({ guardado: REGENERAR_TODO, corrida, nombre: null }).quien, "sin nombre, el email").toBe(
      "ana@smarteamcr.com",
    );
    expect(
      autoriaDeLaPropuesta({ guardado: VIEJA_DEL_HANDOFF, corrida: { ...corrida, triggeredByEmail: null }, nombre: null }),
    ).toEqual({ desde: "desde el handoff", quien: null, cuando: "2026-09-24T15:00:00.000Z" });
    expect(autoriaDeLaPropuesta({ guardado: VIEJA_DEL_HANDOFF, corrida: null, nombre: null })).toEqual({
      desde: "desde el handoff",
      quien: null,
      cuando: null,
    });
    // La fecha puede venir como texto (la corrida serializada).
    expect(autoriaDeLaPropuesta({ guardado: REGENERAR_TODO, corrida: { ...corrida, createdAt: "2026-09-24T15:00:00Z" }, nombre: null }).cuando).toBe(
      "2026-09-24T15:00:00.000Z",
    );
  });

  it("lo que llega por el cable se valida: sin «desde», no hay autoría; lo demás que no sirve, se calla", () => {
    /* La edición que la pone en rojo: confiar en el JSON tal cual (una respuesta cacheada vieja, o
       basura, pintaría «undefined» en el cartel). */
    const buena = { desde: "desde el handoff", quien: "Ana López", cuando: "2026-09-24T15:00:00.000Z" };
    expect(leerAutoria(buena)).toEqual(buena);
    expect(leerAutoria(JSON.parse(JSON.stringify(buena)))).toEqual(buena);
    for (const mala of [null, undefined, "desde el handoff", 3, {}, { desde: 3 }, { desde: "" }, { desde: "el handoff" }]) {
      expect(leerAutoria(mala), JSON.stringify(mala) ?? "undefined").toBeNull();
    }
    expect(leerAutoria({ desde: "desde el handoff", quien: 7, cuando: "ayer" })).toEqual({
      desde: "desde el handoff",
      quien: null,
      cuando: null,
    });
  });
});

describe("el lector en lote (servidor)", () => {
  beforeEach(() => {
    db.agentRun.findMany.mockReset();
    db.teamMember.findMany.mockReset();
  });

  it("⭐ una consulta de corridas y una de nombres para todas, en el mismo orden; ninguna sin propuesta", async () => {
    /* La edición que la pone en rojo: una consulta por propuesta, consultar filas sin propuesta, o
       devolverlas en otro orden (la ficha las empareja por posición). */
    db.agentRun.findMany.mockResolvedValue([
      { id: "r1", createdAt: new Date("2026-09-24T15:00:00.000Z"), triggeredByEmail: "ana@smarteamcr.com" },
      { id: "r2", createdAt: new Date("2026-07-11T15:00:00.000Z"), triggeredByEmail: null },
    ]);
    db.teamMember.findMany.mockResolvedValue([{ email: "ana@smarteamcr.com", name: "Ana López" }]);
    const r = await leerAutoriaDeLasPropuestas([
      { token: "r2", guardado: VIEJA_DEL_HANDOFF },
      { token: "r9", guardado: null },
      { token: "r1", guardado: REGENERAR_TODO },
      { token: "r1", guardado: REGENERAR_TODO },
      { token: null, guardado: VIEJA_DEL_HANDOFF },
    ]);
    expect(db.agentRun.findMany).toHaveBeenCalledTimes(1);
    expect(db.agentRun.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["r2", "r1"] } });
    expect(db.teamMember.findMany).toHaveBeenCalledTimes(1);
    expect(db.teamMember.findMany.mock.calls[0][0].where).toEqual({ email: { in: ["ana@smarteamcr.com"] } });
    expect(r.map((a) => (a ? fraseDeAutoria(a) : null))).toEqual([
      "desde el handoff del 11 jul",
      null,
      "desde «Regenerar todo» · la dejó Ana López el 24 sep",
      "desde «Regenerar todo» · la dejó Ana López el 24 sep",
      "desde el handoff",
    ]);

    db.agentRun.findMany.mockClear();
    db.teamMember.findMany.mockClear();
    expect(await leerAutoriaDeLasPropuestas([{ token: "r1", guardado: null }])).toEqual([null]);
    expect(await leerAutoriaDeLasPropuestas([])).toEqual([]);
    expect(db.agentRun.findMany, "consultó sin ninguna propuesta").not.toHaveBeenCalled();
    expect(db.teamMember.findMany).not.toHaveBeenCalled();
  });
});

describe("dónde se usa", () => {
  it("⭐ el GET del cronograma la manda, y la pantalla la valida y la pinta en la barra", () => {
    /* La edición que la pone en rojo: sacarla del GET, leerla sin `leerAutoria`, o que la barra deje
       de decirla. Que cada `setProposal` escriba `proposalMeta` (donde viaja) lo cuida
       revision-de-la-propuesta.test.ts. */
    const ruta = soloCodigo(leer("app/api/projects/[projectId]/timeline/route.ts"));
    const carga = ruta.slice(ruta.indexOf("async function loadTimeline("), ruta.indexOf("export async function GET("));
    expect(carga.length, "no encontré loadTimeline").toBeGreaterThan(500);
    expect(
      contiene(
        carga,
        "autoriaDeLaPropuesta: (await leerAutoriaDeLasPropuestas([{ token: tl.pendingProposalRunId, guardado: tl.pendingProposal }]))[0] ?? null,",
      ),
    ).toBe(true);
    const canvas = soloCodigo(leer("components/canvas/CronogramaCanvas.tsx"));
    expect(canvas.match(/autoria: leerAutoria\(data\.autoriaDeLaPropuesta\)/g)?.length, "los tres sitios que ponen la guardada").toBe(3);
    expect(canvas.match(/\bautoria:/g)?.length, "otra asignación escribe una autoría que no es la de la guardada").toBe(3);
    expect(contiene(canvas, "pendingProposalAutoria: autoriaEnPantalla,"), "«Qué hacer acá» no la recibe").toBe(true);
  });

  it("⭐ la ficha y el GPS: la leen solo si hay propuesta que revisar, y el GPS la valida", () => {
    /* La edición que la pone en rojo: leer la autoría de todas las filas (o una por fila), dejar de usar
       `hayPropuestaParaRevisar` (el borrador vacío que espera sus tareas no es una propuesta), o pasarle
       al cartel lo que llegó por el cable sin validar. */
    const ficha = soloCodigo(leer("app/(shell)/clients/[id]/page.tsx"));
    expect(ficha).toContain("hayPropuestaParaRevisar(timeline?.pendingProposal ?? null)");
    expect(contiene(ficha, "const conPropuesta = navegables.filter(({ fila }) => fila.timelineProposalPending);")).toBe(true);
    expect(ficha.match(/leerAutoriaDeLasPropuestas\(/g)?.length, "una sola lectura en lote").toBe(1);
    expect(contiene(ficha, "await leerAutoriaDeLasPropuestas( conPropuesta.map(")).toBe(true);
    expect(contiene(ficha, "timeline: { select: { pendingProposal: true, pendingProposalRunId: true } },")).toBe(true);
    const workspace = soloCodigo(leer("app/(shell)/clients/[id]/WorkspaceClient.tsx"));
    expect(contiene(workspace, "autoria={activeProject.timelineProposalAutoria ?? null}")).toBe(true);

    const gps = soloCodigo(leer("app/api/projects/[projectId]/gps/route.ts"));
    expect(contiene(gps, "const [timelineProposalAutoria] = hayPropuestaParaRevisar(project.timeline?.pendingProposal ?? null) ? await leerAutoriaDeLasPropuestas([")).toBe(true);
    expect(contiene(gps, "timelineProposalAutoria: timelineProposalAutoria ?? null,")).toBe(true);
    expect(contiene(gps, "timeline: { select: { pendingProposal: true, pendingProposalRunId: true } },")).toBe(true);
    const widget = soloCodigo(leer("components/clients/ProjectGPS.tsx"));
    expect(contiene(widget, "autoria={leerAutoria(data.timelineProposalAutoria)}")).toBe(true);
  });

  it("el cartel: la frase reemplaza la segunda oración del compacto y va entre paréntesis en el completo", () => {
    /* Menos texto (Elías): el compacto ya no repite «la IA propuso cambios…», que dice el título. Sin
       autoría no hay segunda frase ni un origen inventado. La edición que la pone en rojo: volver al
       texto fijo, o pintar la frase sin autoría. */
    const cartel = soloCodigo(leer("components/projects/TimelineProposalPendiente.tsx"));
    expect(contiene(cartel, '{autoria && <span className="text-xs text-warn-ink/70">· {fraseDeAutoria(autoria)}</span>}')).toBe(true);
    expect(contiene(cartel, 'La IA propuso cambios del cronograma{autoria ? ` (${fraseDeAutoria(autoria)})` : ""};')).toBe(true);
    expect(cartel, "volvió la segunda frase fija del compacto").not.toContain("que todavía no se aplicaron");
    expect(cartel, "volvió el origen fijo").not.toContain("(del handoff o de «Regenerar»)");
  });
});
