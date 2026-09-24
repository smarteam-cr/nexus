import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fuentesDelDetalle, renderDetalleDeCronograma } from "@/lib/contexto/detalle-cronograma";
import { REGLA_DE_FRONTERA_DEL_ASSIST, fuentesDelAssist } from "@/lib/contexto/asistente-cronograma";
import { buildProgressUserMessage } from "./regenerate-progress";
import {
  TECHO_POR_REUNION,
  TOPE_REUNIONES_CRONOGRAMA,
  repartirEspacio,
  type ReunionParaRepartir,
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

/**
 * El cuerpo de UN cargador de lib/contexto/cargar.ts: desde su firma hasta la SIGUIENTE
 * `export async function` (o el final del archivo). "" si no existe.
 *
 * ⚠ Por qué no se corta «hasta el nombre del cargador que sigue» (validación 2026-09-23): así se
 * cortaba antes, y un cargador nuevo metido entre dos (el de «Regenerar todo», por ejemplo) quedaba
 * ADENTRO del tramo del anterior. Si el nuevo cargaba el material, las aserciones del de arriba
 * seguían verdes aunque ese dejara de cargarlo: la guarda quedaba vacía sin que nada avisara.
 */
const tramoDe = (src: string, cargador: string): string => {
  const i = src.indexOf(`export async function ${cargador}(`);
  if (i < 0) return "";
  const j = src.indexOf("export async function ", i + 1);
  return src.slice(i, j < 0 ? undefined : j);
};

const REUNIONES = "=== REUNIONES QUE EL CSE ELIGIÓ PARA EL CRONOGRAMA (material INTERNO) ===\nx";
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
    expect(msg).toContain("QUE EL CSE ELIGIÓ PARA EL CRONOGRAMA");
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
    const src = sinComentarios(leer("lib/contexto/cargar.ts"));
    for (const [nombre, cargador] of [
      ["detalle", "cargarContextoDelDetalle"],
      ["assist", "cargarContextoDelAssist"],
    ] as const) {
      const tramo = tramoDe(src, cargador);
      expect(tramo.length, `la guarda no está mirando el cargador del ${nombre}`).toBeGreaterThan(200);
      expect(tramo, `el ${nombre} dejó de cargar el material`).toContain("cargarMaterialDelCronograma(projectId)");
      expect(tramo, `el ${nombre} carga el material pero no lo pasa`).toContain("reunionesCtx: mat.reuniones");
      expect(tramo, `el ${nombre} carga las notas pero no las pasa`).toContain("notasCtx: mat.notas");
      // La trazabilidad sale del MISMO material que leyó el agente, no de otra lectura.
      expect(tramo, `el ${nombre} perdió qué reuniones leyó`).toContain("sesionesUsadas: mat.sesionesUsadas");
      expect(tramo, `el ${nombre} perdió el material para revisar la frontera`).toContain(
        "materialInterno: mat.materialInterno",
      );
    }
  });

  it("⭐ el detalle recibe el calendario SIN «Hoy» y «Pedir cambio con IA», CON «Hoy»", () => {
    /* Con «Hoy», el detalle vaciaba las semanas que ya pasaron aunque su trabajo no estuviera hecho;
       el modificador edita un cronograma vivo y sí tiene que saberlo. La edición que la pone en
       rojo: cruzarlos, o dejar de pasar el calendario (cargado y tirado). */
    const src = sinComentarios(leer("lib/contexto/cargar.ts"));
    const detalle = tramoDe(src, "cargarContextoDelDetalle");
    const assist = tramoDe(src, "cargarContextoDelAssist");
    expect(detalle, "el detalle dejó de recibir el calendario").toContain("calendarioCtx: mat.calendario,");
    expect(detalle, "el detalle recibe el calendario CON «Hoy»").not.toContain("mat.calendarioConHoy");
    expect(assist, "«Pedir cambio con IA» dejó de recibir el calendario con «Hoy»").toContain(
      "calendarioCtx: mat.calendarioConHoy",
    );
  });
});

describe("⭐ «Pedir cambio con IA» —que también toca FASES— lo lee igual", () => {
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

describe("⭐ el AVANCE lee las notas, y sus reuniones NO dependen de lo elegido", () => {
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

  it("el avance lee las reuniones recientes del PROYECTO, no las elegidas", () => {
    /* Desde el 2026-09-23 el Contexto del cronograma es de elección (entra solo lo elegido). El
       avance existe para enterarse SOLO de lo que pasó en la última reunión: atarlo a la elección
       lo dejaba ciego hasta que alguien se acordara de elegirla. */
    const src = sinComentarios(leer("lib/sessions/project-sessions.ts"));
    expect(src, "el avance volvió a depender de lo elegido para el cronograma").not.toContain("timelineOverride");
    expect(src, "el avance volvió a depender de lo elegido para el cronograma").not.toContain("session-feeding");
    expect(src, "el avance perdió el tombstone").toContain("where: { projectId, included: true, session: { date: { lte: now } } }");
  });
});

describe("⭐ las puertas son las del CRONOGRAMA, no las del handoff", () => {
  const RUTAS = [
    "app/api/projects/[projectId]/timeline/sessions/route.ts",
    "app/api/projects/[projectId]/timeline/sources/route.ts",
    "app/api/projects/[projectId]/timeline/sources/[id]/route.ts",
    "app/api/projects/[projectId]/timeline/calendario/route.ts",
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

  it("⛔ elegir y sacar del cronograma NO escribe el afinado del handoff (ni al revés)", () => {
    const cron = sinComentarios(leer("app/api/projects/[projectId]/timeline/sessions/route.ts"));
    expect(cron, "elegir dejó de marcarla como elegida").toContain("update: { timelineOverride: true, included: true }");
    // La X deja de elegirla (null): «no elegida» es un solo estado, y así el clasificador la recupera.
    expect(cron, "la X volvió a escribir un estado aparte").toContain("data: { timelineOverride: null }");
    expect(cron, "la X volvió a escribir un estado aparte").not.toContain("timelineOverride: false");
    expect(cron, "la puerta del cronograma está tocando el handoff").not.toContain("handoffOverride");
    const hand = sinComentarios(leer("app/api/projects/[projectId]/handoff-sessions/route.ts"));
    expect(hand, "la puerta del handoff está tocando el cronograma").not.toContain("timelineOverride");
  });

  it("⛔ las notas viven en su tabla: nada de HandoffSource", () => {
    /* HandoffSource la leen el handoff, el mapeo de procesos de TODO el cliente y el gate de
       material del handoff, sin filtrar por tipo: una nota del cronograma ahí se cuela en los tres. */
    for (const r of RUTAS.slice(1, 3)) {
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

describe("⭐ el reparto: justo, nunca pasa el tope, y el cargador lee con su propio lector", () => {
  /* Reescrito el 2026-09-23 (validación del Contexto del cronograma): el reparto dejó de usar la
     escala del handoff (4.000 a la más reciente, 400 a las viejas). «La más reciente se lleva la
     cota grande» afirmaba justo lo que se retiró —el kickoff que el CSE eligió a propósito quedaba
     en dos líneas—; las guardas del reparto justo viven en lib/contexto/material-cronograma.test.ts. */
  const DIA = 86_400_000;
  const AHORA = Date.UTC(2026, 8, 23);
  const reunion = (id: string, diasAtras: number, largo: number): ReunionParaRepartir => ({
    id,
    date: AHORA - diasAtras * DIA,
    esencial: Math.floor(largo / 2),
    largo,
  });

  it("nunca pasa el tope total, ni el techo por reunión", () => {
    const muchas = Array.from({ length: 120 }, (_, i) => reunion(`r${i}`, i + 1, 3_000 + ((i * 7_919) % 20_000)));
    const total = [...repartirEspacio(muchas).values()].reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(TOPE_REUNIONES_CRONOGRAMA);
    // Con pocas y largas sobra espacio: ahí es donde el techo tiene que frenar.
    const pocas = repartirEspacio([reunion("a", 1, 30_000), reunion("b", 2, 30_000)]);
    expect([...pocas.values()]).toEqual([TECHO_POR_REUNION, TECHO_POR_REUNION]);
  });

  it("el cargador lee con SU lector, acotado, y recién después arma el plan", () => {
    /* El lector del handoff (`fetchTranscriptContent`) traía el transcript ENTERO de cada reunión
       (de 7k a 61k en CAV) para después cortar el resumen en 1.500: el cronograma pagaba la lectura
       más pesada y se quedaba sin los «Próximos pasos». El lector propio trae el resumen y la
       minuta, y el inicio del transcript solo de las reuniones flacas. */
    const tramo = tramoDe(sinComentarios(leer("lib/contexto/cargar.ts")), "cargarMaterialDelCronograma");
    expect(tramo.length).toBeGreaterThan(500);
    expect(tramo, "volvió el lector del handoff").not.toContain("fetchTranscriptContent(");
    expect(tramo, "volvió a traer el transcript entero").not.toMatch(/transcript:\s*true/);
    expect(tramo, "el transcript dejó de leerse acotado en SQL").toContain('left("transcript"');
    expect(tramo, "la lectura del contenido dejó de cortar por fecha").toContain("date: { lte: new Date(ahora) }");
    expect(tramo, "las futuras vuelven a entrar").toContain("soloOcurridas(");
    const iLeer = tramo.indexOf("leerContenidoDeReuniones(");
    const iPlan = tramo.indexOf("planDelMaterial(");
    expect(iLeer, "el cargador dejó de leer").toBeGreaterThan(-1);
    expect(iPlan, "arma el plan antes de saber qué tiene contenido").toBeGreaterThan(iLeer);
    // Sin material, ni calendario ni ubicación: el mensaje de un proyecto sin material no cambia.
    expect(tramo, "el calendario dejó de depender de que haya material").toContain("calendario: hayMaterial ?");
    expect(tramo, "la ubicación dejó de depender de que haya material").toContain(
      "hayMaterial ? ubicarEnElCronograma(foto, ms)",
    );
    // Y las reuniones salen del chokepoint, nunca de una lectura directa de vínculos.
    expect(tramo).toContain("getProjectTimelineSessions(projectId)");
    expect(tramo).not.toContain("prisma.sessionProject");
  });
});

describe("⭐ el buscador: las reuniones del proyecto y las de TU calendario", () => {
  const ruta = () => sinComentarios(leer("app/api/projects/[projectId]/timeline/calendario/route.ts"));

  it("el calendario es el de quien busca, y sin futuras", () => {
    const src = ruta();
    expect(src, "dejó de buscar por el correo de quien usa el buscador").toContain("guard.teamMember.email");
    expect(src, "dejó de mirar al organizador").toContain(`lower(s."organizerEmail") = \${email}`);
    expect(src, "dejó de mirar a los invitados").toContain(`WHERE lower(p) = \${email}`);
    expect(src, "volvió a ofrecer reuniones que no ocurrieron").toContain(`s."date" <= \${ahora}`);
  });

  it("una lista cortada dice que hay más", () => {
    const src = ruta();
    expect(src).toContain("LIMIT ${tope + 1}");
    expect(src).toContain("hayMas");
  });

  it("⛔ las de otro cliente se MARCAN con la regla única, no se esconden ni se ofrecen", () => {
    expect(ruta()).toContain("motivoParaNoElegirDelCalendario(");
  });

  it("las candidatas del proyecto salen de las filas del chokepoint, no de una consulta aparte", () => {
    /* `safeRows` ya descartó los vínculos cruzados: una consulta propia podría ofrecer una reunión
       de otro cliente que quedó colgada del proyecto. */
    const src = sinComentarios(leer("app/api/projects/[projectId]/session-candidates/route.ts"));
    expect(src).toMatch(/const delProyecto = esCronograma\s*\?\s*safeRows/);
    expect(src, "el cronograma volvió a ofrecer todas las reuniones del cliente").toContain(
      "const clientSessions = esCronograma ? [] :",
    );
  });

  it("la pantalla pide el calendario solo para el cronograma, y no repite lo ya listado", () => {
    const src = leer("components/clients/SessionSelectionReview.tsx");
    expect(src).toContain("/timeline/calendario?q=");
    expect(src).toContain("showModal && esCronograma ?");
    expect(src, "el calendario vuelve a mostrar lo que ya está en otra lista").toContain(
      "!yaListadas.has(s.sessionId) && coincideConLaBusqueda(s, search)",
    );
  });
});
