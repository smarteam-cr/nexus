import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fuentesDelDetalle, renderDetalleDeCronograma } from "@/lib/contexto/detalle-cronograma";
import { REGLA_DE_FRONTERA_DEL_ASSIST, fuentesDelAssist } from "@/lib/contexto/asistente-cronograma";
import { buildProgressUserMessage } from "./regenerate-progress";
import {
  TOPE_REUNIONES_CRONOGRAMA,
  repartirEspacio,
  type ReunionConContenido,
} from "@/lib/contexto/material-cronograma";

/**
 * lib/timeline/contexto-cronograma.test.ts — EL «CONTEXTO DEL CRONOGRAMA» LLEGA, Y SOLO ADONDE DEBE.
 *
 * Pedido de Elías (2026-09-23): clonar el Contexto del handoff para el CRONOGRAMA — que el CSE elija
 * las reuniones que alimentan fases y tareas y pegue notas a mano. El modo de falla de esto no es
 * que se rompa: es que la pantalla se llene y la IA no lea nada, o que lea de más (el handoff
 * empezando a cambiar por una X que el CSE puso en el cronograma). Estas guardas miran el viaje
 * completo: la pantalla → las puertas → los agentes.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/^\s*\/\/.*$/gm, " ");

const REUNIONES = "=== REUNIONES DEL PROYECTO QUE EL CSE DEJA ENTRAR AL CRONOGRAMA (material INTERNO) ===\nx";
const NOTAS = "=== NOTAS DEL CSE PARA EL CRONOGRAMA (pegadas a mano — material INTERNO) ===\nCENTINELA-NOTA";

describe("⭐ el agente que arma las TAREAS lee el material", () => {
  const insumos = (reunionesCtx?: string, notasCtx?: string) => ({
    instrucciones: "",
    encabezado: { companyName: "C", industry: null, serviceTypeLabel: null, classificationLabel: null },
    fuentes: fuentesDelDetalle({ timelineCtx: "t", handoffCtx: "h", desarrolloCtx: "", reunionesCtx, notasCtx }),
    clasificacion: { esReimplementacion: false, llevaMigracion: false, llevaDesarrollo: false },
  });

  it("con material, las dos fuentes entran al mensaje", () => {
    const msg = renderDetalleDeCronograma(insumos(REUNIONES, NOTAS));
    expect(msg).toContain("QUE EL CSE DEJA ENTRAR AL CRONOGRAMA");
    expect(msg).toContain("CENTINELA-NOTA");
  });

  it("sin material, el mensaje es IDÉNTICO al de antes (ni un carácter)", () => {
    /* El golden de 5 casos de detalle-cronograma.test.ts lo afirma contra el template viejo; esto
       afirma que las fuentes nuevas vacías no suman nada, ni siquiera con espacios. */
    expect(renderDetalleDeCronograma(insumos("", "  "))).toBe(renderDetalleDeCronograma(insumos()));
  });

  it("las fuentes vacías no se agregan a la lista (el test de rótulos las vería sin rótulo)", () => {
    const keys = fuentesDelDetalle({ timelineCtx: "t", handoffCtx: "h", desarrolloCtx: "", reunionesCtx: "", notasCtx: "" }).map((f) => f.key);
    expect(keys).not.toContain("reuniones-del-cronograma");
    expect(keys).not.toContain("notas-del-cronograma");
  });

  it("el cargador del detalle y el de «Pedir cambio con IA» cargan el material", () => {
    const src = leer("lib/contexto/cargar.ts");
    const detalle = src.slice(src.indexOf("export async function cargarContextoDelDetalle"), src.indexOf("export async function cargarContextoDelAssist"));
    const assist = src.slice(src.indexOf("export async function cargarContextoDelAssist"), src.indexOf("export async function cargarMaterialDelCronograma"));
    for (const [nombre, tramo] of [["detalle", detalle], ["assist", assist]] as const) {
      expect(tramo.length, `la guarda no está mirando el cargador del ${nombre}`).toBeGreaterThan(200);
      expect(tramo, `el ${nombre} dejó de cargar el material`).toContain("cargarMaterialDelCronograma(projectId)");
      expect(tramo, `el ${nombre} carga el material pero no lo pasa`).toContain("reunionesCtx: mat.reuniones");
      expect(tramo, `el ${nombre} carga las notas pero no las pasa`).toContain("notasCtx: mat.notas");
    }
  });
});

describe("⭐ «Pedir cambio con IA» — el único que toca FASES — también", () => {
  const crudas = { cronogramaCtx: "c", handoffCtx: "h", desarrolloCtx: "", operativaCtx: "" };

  it("con material suma las dos fuentes; sin material, las mismas de siempre", () => {
    expect(fuentesDelAssist({ ...crudas, reunionesCtx: REUNIONES, notasCtx: NOTAS }).map((f) => f.key)).toEqual([
      "cronograma-vivo",
      "handoff-curado",
      "requerimiento-tecnico",
      "operativa-hubspot",
      "reuniones-del-cronograma",
      "notas-del-cronograma",
    ]);
    expect(fuentesDelAssist(crudas).map((f) => f.key)).toHaveLength(4);
  });

  it("la frontera nombra las reuniones y las notas", () => {
    /* El texto que devuelve este agente lo lee el cliente. Una regla que no nombra el material
       nuevo deja la puerta abierta a copiar una frase de una transcripción al Gantt. */
    expect(REGLA_DE_FRONTERA_DEL_ASSIST).toContain("las reuniones");
    expect(REGLA_DE_FRONTERA_DEL_ASSIST).toContain("las notas del CSE");
  });
});

describe("⭐ el AVANCE respeta la X y lee las notas", () => {
  const base = {
    instrucciones: "",
    companyName: "C",
    industry: null,
    serviceType: null,
    stageLabel: null,
    operativaBlock: "",
    sessionsBlock: "",
    handoffCtx: "",
    timelineCtx: "t",
  };

  it("con notas aparecen; sin notas, el mensaje es idéntico", () => {
    expect(buildProgressUserMessage({ ...base, notasBlock: NOTAS })).toContain("CENTINELA-NOTA");
    expect(buildProgressUserMessage({ ...base, notasBlock: "  " })).toBe(buildProgressUserMessage(base));
  });

  it("las reuniones del avance salen con la regla del cronograma, en el WHERE", () => {
    /* Filtrar después del `take: 12` dejaba menos de 12 cuando el CSE sacaba reuniones recientes. */
    const src = sinComentarios(leer("lib/sessions/project-sessions.ts"));
    expect(src, "el avance volvió a leer reuniones que el CSE sacó del cronograma").toContain(
      "...whereAlimentaCronograma()",
    );
  });
});

describe("⭐ las puertas son las del CRONOGRAMA, no las del handoff", () => {
  const RUTAS = [
    "app/api/projects/[projectId]/timeline/sessions/route.ts",
    "app/api/projects/[projectId]/timeline/sources/route.ts",
    "app/api/projects/[projectId]/timeline/sources/[id]/route.ts",
  ];

  it("escriben con `guardTimelineEdit` (cronograma.write) y sin el veto del handoff", () => {
    /* El guard del handoff ata el permiso al handoff y le devuelve 403 al CSE con el cliente
       compartido; su veto (el handoff es del hermano mayor) bloquearía el cronograma PROPIO de un
       desarrollo hermano. */
    for (const r of RUTAS) {
      const src = sinComentarios(leer(r));
      expect(src, `${r} no usa el guard del cronograma`).toContain("guardTimelineEdit(");
      expect(src, `${r} copió el guard del handoff`).not.toContain("guardProjectHandoffAccess");
      expect(src, `${r} copió el veto del handoff`).not.toContain("vetoSiElHandoffEsDeOtro");
    }
  });

  it("⛔ la X del cronograma NO escribe el afinado del handoff (ni al revés)", () => {
    const cron = sinComentarios(leer("app/api/projects/[projectId]/timeline/sessions/route.ts"));
    expect(cron).toContain("timelineOverride: body.feeds");
    // «Reincluir» después de una X vuelve a la regla (null), no la marca como agregada a mano.
    expect(cron, "deshacer la X volvió a marcarla como agregada a mano").toContain("deshaceLaX ? null : true");
    expect(cron, "la puerta del cronograma está tocando el handoff").not.toContain("handoffOverride");
    const hand = sinComentarios(leer("app/api/projects/[projectId]/handoff-sessions/route.ts"));
    expect(hand, "la puerta del handoff está tocando el cronograma").not.toContain("timelineOverride");
  });

  it("⛔ las notas viven en su tabla: nada de HandoffSource", () => {
    /* HandoffSource la leen el handoff, el mapeo de procesos de TODO el cliente y el gate de
       material del handoff, sin filtrar por tipo: una nota del cronograma ahí se cuela en los tres. */
    for (const r of RUTAS.slice(1)) {
      expect(sinComentarios(leer(r)), r).not.toContain("handoffSource");
    }
    const cargar = sinComentarios(leer("lib/contexto/cargar.ts"));
    expect(cargar).toContain("prisma.timelineSource.findMany");
    expect(cargar).not.toContain("prisma.handoffSource");
  });

  it("la pantalla escribe en la puerta de SU destino", () => {
    const panel = leer("components/clients/SessionSelectionReview.tsx");
    expect(panel).toContain("`/api/projects/${projectId}/timeline/sessions`");
    expect(panel, "el cronograma pide la lista con la regla del handoff").toContain("?para=cronograma");
    const seccion = leer("components/canvas/CronogramaContextSection.tsx");
    expect(seccion).toContain('destino="cronograma"');
    expect(seccion).toContain("/timeline/sources");
  });
});

describe("⭐ lo que el CSE agregó a mano entra primero, y lo vacío no ocupa lugar", () => {
  const DIA = 86_400_000;
  const AHORA = Date.UTC(2026, 8, 23);
  const reunion = (id: string, diasAtras: number, agregadaAMano = false): ReunionConContenido => ({
    id,
    title: id,
    date: AHORA - diasAtras * DIA,
    agregadaAMano,
  });

  it("la agregada a mano VIEJA entra con la cota grande aunque haya 60 recientes", () => {
    /* Con la regla «entran todas», el reparto premia la más reciente: sin cupo propio, la reunión
       de venta que alguien fue a buscar a propósito llegaba con 400 caracteres o no llegaba. */
    const recientes = Array.from({ length: 60 }, (_, i) => reunion(`r${i}`, i + 1));
    const espacio = repartirEspacio([...recientes, reunion("venta", 400, true)], AHORA);
    expect(espacio.get("venta")).toBe(4000);
  });

  it("las agregadas que no entran en su cupo compiten en el general, no se pierden", () => {
    /* 25 y no menos: el cupo de las agregadas (16.000) ya admite ~15 con la escala de cotas, así
       que con pocas nunca se prueba el desborde (la primera versión de esta guarda usaba 12 y
       quedaba verde aunque las que sobraban se tiraran). */
    const agregadas = Array.from({ length: 25 }, (_, i) => reunion(`a${i}`, i + 1, true));
    const espacio = repartirEspacio(agregadas, AHORA);
    expect(espacio.size, "alguna agregada se perdió entera").toBe(25);
  });

  it("nunca pasa el tope total", () => {
    const muchas = [
      ...Array.from({ length: 40 }, (_, i) => reunion(`a${i}`, i + 1, true)),
      ...Array.from({ length: 80 }, (_, i) => reunion(`r${i}`, i + 1)),
    ];
    const total = [...repartirEspacio(muchas, AHORA).values()].reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(TOPE_REUNIONES_CRONOGRAMA);
  });

  it("el cargador LEE antes de repartir y descarta las vacías (no les da espacio)", () => {
    /* Repartir antes de leer le daba las cotas grandes a reuniones sin contenido —la mitad del
       corpus— y dejaba la que tenía material recortada. */
    const src = leer("lib/contexto/cargar.ts");
    const i = src.indexOf("export async function cargarMaterialDelCronograma");
    const tramo = sinComentarios(src.slice(i, src.indexOf("export async function cargarNotasDelCronograma")));
    expect(tramo.length).toBeGreaterThan(500);
    const iLeer = tramo.indexOf("fetchTranscriptContent(");
    const iRepartir = tramo.indexOf("repartirEspacio(");
    expect(iLeer, "el cargador dejó de leer").toBeGreaterThan(-1);
    expect(iRepartir, "reparte antes de saber qué tiene contenido").toBeGreaterThan(iLeer);
    expect(tramo, "las vacías vuelven a entrar al reparto").toContain("contenidoPorId.has(s.id)");
    expect(tramo, "las futuras vuelven a entrar").toContain("soloOcurridas(");
    // Y las reuniones salen del chokepoint, nunca de una lectura directa de vínculos.
    expect(tramo).toContain("getProjectTimelineSessions(projectId)");
    expect(tramo).not.toContain("prisma.sessionProject");
  });
});
