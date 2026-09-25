import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fuentesDelDetalle, renderDetalleDeCronograma } from "@/lib/contexto/detalle-cronograma";
import { REGLA_DE_FRONTERA_DEL_ASSIST, fuentesDelAssist } from "@/lib/contexto/asistente-cronograma";
import { buildProgressUserMessage } from "./regenerate-progress";
import {
  PRESUPUESTO_DEL_CHAT,
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

  it("sin material, las fuentes vacías no suman ni un carácter (material vacío == material ausente)", () => {
    /* ⚠ Título corregido (revisión adversarial, 2026-09-24), con esta razón: decía «el mensaje es
       IDÉNTICO al de antes», y lo que compara es material VACÍO contra material AUSENTE, no contra el
       mensaje de antes de la feature (que sí cambió para todos: ver el docblock de
       `cargarMaterialDelCronograma`). La aserción no cambia. El golden de 5 casos de
       detalle-cronograma.test.ts fija el template contra una transcripción independiente. */
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
    /* E2a P4: el paso 2 de «Regenerar todo» lee la estructura SUPUESTA del borrador (`sobre`). El
       agente ve ESAS fases y el material se ubica en el calendario de ESA estructura; sin `sobre`,
       todo sigue como arriba. La edición que la pone en rojo: leer el cronograma real con `sobre`
       (el agente armaría tareas para fases que no son las de la propuesta), o ubicar las reuniones
       en el calendario de hoy (vería semanas que la propuesta ya movió). */
    const detalle = tramoDe(src, "cargarContextoDelDetalle");
    expect(detalle, "con `sobre`, el detalle dejó de leer la estructura supuesta").toContain(
      "renderCronogramaParaAgentes(sobre.fases, { includeIds: true })",
    );
    expect(detalle, "con `sobre`, el material dejó de ubicarse en el calendario supuesto").toContain(
      "cargarMaterialDelCronograma(projectId, { fases: sobre.foto })",
    );
  });

  it("⭐ el revisor de fases de «Regenerar todo» carga el material con SU foto, y el handoff recién después", () => {
    /* El paso 1 de «Regenerar todo» (2026-09-23). Su tramo corta en la siguiente `export async
       function`, así que estas aserciones son SUYAS y no las cubre el cargador vecino. Las ediciones
       que la ponen en rojo: dejar de pasarle la foto al material (el modelo y el armador verían
       planes distintos), perder las notas, o volver a leer el handoff antes de saber si hay
       material (todo «Regenerar todo» sin material pagaría esa lectura). */
    const tramo = tramoDe(sinComentarios(leer("lib/contexto/cargar.ts")), "cargarContextoDeEstructura");
    expect(tramo.length, "la guarda no está mirando el cargador del revisor").toBeGreaterThan(200);
    expect(tramo, "el revisor dejó de cargar el material con la foto de la ruta").toContain(
      "cargarMaterialDelCronograma(projectId, { fases: foto })",
    );
    expect(tramo, "el revisor carga el material pero no lo pasa").toContain("reunionesCtx: mat.reuniones");
    expect(tramo, "el revisor perdió las notas").toContain("notasCtx: mat.notas");
    expect(tramo, "el revisor perdió qué reuniones leyó").toContain("sesionesUsadas: mat.sesionesUsadas");
    expect(tramo, "el revisor perdió el material para revisar la frontera").toContain(
      "materialInterno: mat.materialInterno",
    );
    /* ⚠ ACTUALIZADA (revisión adversarial, 2026-09-24), con esta razón: la salida temprana pedía
       «sin reuniones ni notas». Las «Instrucciones adicionales» solas ahora también se revisan (son
       la fuente de más peso y no movían ninguna fase). Sigue pidiendo lo mismo de fondo: sin NADA
       que revisar, se sale antes de leer el handoff. */
    const iSale = tramo.indexOf("if (!mat.reuniones.trim() && !mat.notas.trim() && !brief)");
    expect(iSale, "el revisor dejó de salir antes sin material").toBeGreaterThan(-1);
    expect(tramo.indexOf("loadHandoffContext("), "el handoff se lee antes de saber si hay material").toBeGreaterThan(
      iSale,
    );
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

describe("⭐ el CHAT del cronograma también lee el material (decisión de Elías 2026-09-23)", () => {
  /* El chat cambia fases y tareas con operaciones que ejecuta el código, sin un modelo editor
     detrás: si no ve lo elegido, nadie lo ve en ese camino. Lo lee con el MISMO cargador que los
     agentes, con su propio espacio, y los agentes no se enteran. */
  const DIA = 86_400_000;
  const AHORA = Date.UTC(2026, 8, 23);

  it("la puerta del chat llama al cargador de los agentes con SU presupuesto y sin ubicación", () => {
    /* La edición que la pone en rojo: `cargarMaterialDelCronograma(projectId)` a secas en la puerta
       del chat (48.000 de reuniones por turno), o pasarles `PRESUPUESTO_DEL_CHAT` a los agentes
       (las guardas de arriba, que exigen el llamado sin opciones).
       ⚠ ACTUALIZADO 2026-09-24 (revisión del paso C): la llamada suma `lector: "chat"` (los rótulos
       del chat no nombran el handoff); lo que esta guarda pide —su presupuesto y sin ubicación— no
       cambió. Los agentes siguen sin opciones, así que conservan el rótulo de los agentes. */
    const src = sinComentarios(leer("lib/contexto/cargar.ts"));
    const tramo = tramoDe(src, "cargarMaterialParaElChat");
    expect(tramo.length, "la guarda no está mirando la puerta del chat").toBeGreaterThan(200);
    expect(tramo).toContain(
      'cargarMaterialDelCronograma(projectId, { ...PRESUPUESTO_DEL_CHAT, sinUbicacion: true, lector: "chat" })',
    );
    for (const agente of ["cargarContextoDelDetalle", "cargarContextoDelAssist", "cargarContextoDeEstructura"]) {
      expect(tramoDe(src, agente), `${agente} tomó el presupuesto del chat`).not.toContain("PRESUPUESTO_DEL_CHAT");
    }
  });

  it("con el presupuesto del chat el reparto suma ≤ 16.000 y ninguna pasa el techo por reunión", () => {
    /* Reemplaza a la guarda de C sobre `cotas[0]` (la escala del handoff se retiró en D1: crítica,
       conflicto 2). La edición que la pone en rojo: subir `topeReuniones` del chat. */
    const muchas = Array.from({ length: 40 }, (_, i) => ({
      id: `r${i}`,
      date: AHORA - (i + 1) * DIA,
      esencial: 3_000,
      largo: 9_000,
    }));
    const cotas = repartirEspacio(muchas, {
      tope: PRESUPUESTO_DEL_CHAT.topeReuniones,
      piso: 1_000,
      techo: TECHO_POR_REUNION,
    });
    expect([...cotas.values()].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(16_000);
    expect(Math.max(...cotas.values())).toBeLessThanOrEqual(TECHO_POR_REUNION);
    expect(PRESUPUESTO_DEL_CHAT.topeReuniones).toBeLessThan(TOPE_REUNIONES_CRONOGRAMA);
  });

  it("el lector desempata por id: dos reuniones a la misma hora dan el mismo texto en cada turno", () => {
    /* Sin el desempate, dos reuniones a la misma hora podrían cambiar de lugar entre turnos: con
       `maxALeer` una entra y la otra no, y el bloque del chat cambia sin que nadie toque nada — la
       caché se vuelve a cobrar. La edición que la pone en rojo: sacar `a.id.localeCompare(b.id)`
       del orden de lectura. */
    const tramo = tramoDe(sinComentarios(leer("lib/contexto/cargar.ts")), "cargarMaterialDelCronograma");
    expect(tramo).toMatch(/soloOcurridas\(sessions, ahora\)\s*\.sort\(\(a, b\) => b\.date - a\.date \|\| a\.id\.localeCompare\(b\.id\)\)/);
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

describe("⭐ la pantalla dice lo que le llega a la IA, con el MISMO cargador (paso D3)", () => {
  /* El CSE elegía reuniones sin saber cuánto de cada una leía la IA: la pantalla decía «Elegida» en
     verde sobre reuniones que entraban cortadas o no entraban. Ahora la pantalla pide el INFORME del
     mismo cargador que usan los agentes; dos cálculos (uno para la pantalla y otro para el prompt)
     terminan diciendo cosas distintas. */
  const RUTA = "app/api/projects/[projectId]/timeline/material/route.ts";

  it("la ruta usa el cargador de los agentes y devuelve SOLO el informe, nunca el material", () => {
    const src = sinComentarios(leer(RUTA));
    expect(src, "la ruta dejó de exigir acceso al proyecto").toContain("guardAccessToProject(projectId)");
    expect(src, "la ruta dejó de usar el cargador de los agentes (o lo llama con otros topes)").toContain(
      "const { informe } = await cargarMaterialDelCronograma(projectId);",
    );
    expect(src).toContain("return NextResponse.json(informe);");
    // El material es interno y esta ruta la lee cualquiera con acceso al proyecto.
    expect(src, "la ruta toca el texto de las reuniones o las notas").not.toMatch(
      /\bmat\.|\breuniones\b|\bnotas\b|materialInterno|calendario|sesionesUsadas/,
    );
    const respuestas = [...src.matchAll(/NextResponse\.json\(([^)]{0,40})/g)].map((m) => m[1]);
    expect(respuestas.length).toBeGreaterThan(0);
    for (const r of respuestas) {
      expect(r.startsWith("informe") || r.startsWith("{ error:"), `respuesta inesperada: ${r}`).toBe(true);
    }
  });

  it("la sección pide el informe, lo recalcula al elegir y se lo pasa a la lista", () => {
    const seccion = sinComentarios(leer("components/canvas/CronogramaContextSection.tsx"));
    expect(seccion).toContain("/timeline/material");
    expect(seccion, "la lista de reuniones dejó de recibir el informe").toContain("materialDelCronograma={informeVivo}");
    expect(seccion, "elegir o sacar una reunión ya no recalcula el informe").toContain(
      "onChange={() => setVersion((v) => v + 1)}",
    );
    expect(seccion, "la línea cerrada dejó de contar desde el informe").toContain(
      "parentesisDelMaterial(resumenDelInforme(",
    );
  });

  it("⛔ el informe solo cambia el destino CRONOGRAMA: el handoff queda como estaba", () => {
    const panel = sinComentarios(leer("components/clients/SessionSelectionReview.tsx"));
    expect(panel, "el informe del cronograma se cuela en el handoff").toContain(
      "const material = esCronograma ? materialDelCronograma : null;",
    );
    expect(panel, "el aviso de siempre (el del handoff) dejó de mostrarse").toContain("{!material && alimentanVacias > 0 && (");
    expect(panel, "el aviso dejó de contar desde el informe").toContain("avisoDelMaterial(resumenDelInforme(material))");
    expect(panel, "las filas dejaron de leer su insignia del informe").toContain("insigniaDelMaterial(fila)");
  });

  it("⭐ lo que se calcula del informe también se MUESTRA: insignia, detalle, aviso y paréntesis", () => {
    /* Revisión del paso D3 (2026-09-24): la guarda de arriba solo pedía que el mapa de insignias se
       ARMARA. Se podía volver a pintar «Elegida» en verde en cada fila, o no renderizar el aviso ni
       el paréntesis de la línea cerrada, y todo seguía verde (probado: 68/68).
       Las ediciones que la ponen en rojo: sacar `insignias.get(s.sessionId) ??` del badge, el
       detalle del `meetMeta`, el render del aviso o el `(${loQueNoEntra})` de la línea. */
    const panel = sinComentarios(leer("components/clients/SessionSelectionReview.tsx"));
    expect(panel, "la fila dejó de usar la insignia del informe (vuelve a decir «Elegida» siempre)").toContain(
      '(insignias.get(s.sessionId) ?? { label: esCronograma ? "Elegida" : "Incluida", tone: "green" })',
    );
    expect(panel, "la fila dejó de decir cuánto lee la IA cuando se corta lo principal").toContain(
      "meta={meetMeta(s.date, s.alsoIn, s.futura, insignias.get(s.sessionId)?.detalle)}",
    );
    expect(panel, "el aviso del informe se calcula pero no se muestra").toMatch(
      /\{avisoMaterial\.length > 0 && \(\s*<p[^>]*>\s*\{avisoMaterial\.join\(" "\)\}/,
    );

    const seccion = sinComentarios(leer("components/canvas/CronogramaContextSection.tsx"));
    expect(seccion, "la línea cerrada calcula lo que no entra pero no lo muestra").toContain(
      '{loQueNoEntra ? ` (${loQueNoEntra})` : ""}',
    );
  });
});

describe("#23 · una lista de reuniones que no cargó no es «0 reuniones elegidas»", () => {
  it("el fallo se dice, no se cuenta como cero, y el paso 1 no se rotula como «sin material»", () => {
    /* Revisión adversarial (2026-09-24): la carga hacía `r.ok ? r.json() : null` y `.catch(() => {})`:
       un 500 dejaba la lista vacía y el contador en 0, la columna decía «Todavía no elegiste
       reuniones…», la línea cerrada «0 reuniones elegidas» y el paso 1 se rotulaba sin material,
       mientras la ruta sí las leía. Las ediciones que la ponen en rojo: volver a tragarse el error,
       reportar el conteo con la lista fallida, o no mostrarlo en la sección. */
    const panel = sinComentarios(leer("components/clients/SessionSelectionReview.tsx"));
    expect(panel).toContain("if (!cancelled) setErrorDeCarga(true);");
    expect(panel, "un fallo vuelve a contarse como 0").toContain("if (!loading && !errorDeCarga) {");
    expect(panel).toContain("No se pudo cargar la lista de reuniones del ${documento}: recarga la página.");
    const seccion = sinComentarios(leer("components/canvas/CronogramaContextSection.tsx"));
    expect(seccion).toContain("onErrorDeCarga={setReunionesIlegibles}");
    expect(seccion).toContain('"no se pudieron cargar las reuniones elegidas"');
    expect(seccion).toContain("reuniones: reunionesIlegibles ? Math.max(reuniones, 1) : reuniones,");
  });
});

describe("⛔ las pantallas del cronograma hablan en tuteo, nunca en voseo", () => {
  /* Regla del repo: textos de la app en tuteo. La revisión del paso C (2026-09-24) encontró voseo en
     los componentes que tocó esta feature: «Conversá el cambio…», «Revisá el Gantt…», «Podés seguir
     editándolas», «vos tenés fijado…», «Ponele semanas si ya sabés…», «entrá y generala»… Se
     corrigieron y esta guarda mira el CÓDIGO (sin comentarios) de esos componentes.
     La edición que la pone en rojo: volver a escribir cualquiera de esas formas en un texto. */
  const COMPONENTES = [
    "components/asistente/ChatDelAsistente.tsx",
    "components/canvas/AllPhasesRegenModal.tsx",
    "components/canvas/CronogramaCanvas.tsx",
    "components/canvas/CronogramaContextSection.tsx",
    "components/canvas/ObservacionesDelPaso1.tsx",
    /* E2b P4 (2026-09-25): sale PasoDeTareasPendiente.tsx, que se borró con la cadena vieja. Su oferta
       vive en LineaDeLasTareas.tsx (estado «ofrecer») y su texto en lib/timeline/borrador.ts: los dos
       siguen en esta lista. */
    "components/canvas/PhaseRegenPanel.tsx",
    /* E1 del borrador (2026-09-24): la franja `ProposalGlobalStrip` se borró; su texto vive ahora en
       la barra de revisión. La guarda sigue mirando el mismo texto, en su archivo nuevo. */
    "components/canvas/RevisionDeLaPropuesta.tsx",
    /* E2a P5 (2026-09-25): las tareas de la propuesta (la lista por fase y la línea de la corrida que
       las arma) y el núcleo que les da los textos (el título de la barra, la línea, la confirmación de
       quitar tareas, los choques): todo lo lee el CSE tal cual. */
    "components/canvas/TareasDeLaPropuesta.tsx",
    "components/canvas/LineaDeLasTareas.tsx",
    "lib/timeline/borrador.ts",
    /* Revisión de E2a (2026-09-25): los textos del servidor que el CSE lee TAL CUAL también. El 409
       del paso 2 y el motivo de la línea (borrador-del-detalle.ts), las observaciones de la barra
       (tareas-del-detalle.ts) y el error de aplicar (escribir-estructura.ts) salen en un toast o en la
       barra sin pasar por ningún componente; y el error de una corrida (anthropic-error.ts, y el
       genérico de run-error.ts) llega al toast del cronograma y al centro de corridas. */
    "lib/timeline/borrador-del-detalle.ts",
    "lib/timeline/tareas-del-detalle.ts",
    "lib/timeline/escribir-estructura.ts",
    "lib/agents/anthropic-error.ts",
    "lib/agents/run-error.ts",
    /* Cierre de la revisión de E2a: el motivo de una corrida colgada (`MOTIVO_COLGADA`) también llega
       tal cual al centro de corridas («Podés volver a lanzarla» se leía ahí). */
    "lib/agents/run-colgada.ts",
    "components/canvas/TimelineAssistDialog.tsx",
    "components/canvas/TimelineGantt.tsx",
    "components/clients/FuentesManualesColumn.tsx",
    "components/clients/ProjectCanvasPanel.tsx",
    "components/clients/ProjectContextSection.tsx",
    "components/clients/SessionSelectionReview.tsx",
    "components/projects/TimelineProposalPendiente.tsx",
    /* Y los textos del cronograma que se arman en lib/ (revisión adversarial, 2026-09-24): el panel
       «Qué hacer acá» («vos y el cliente miran…», «si no se lo reclamás»), el mensaje del detalle
       («Detallá… asigná…») y el encabezado de las instrucciones que leen los agentes («cumplilas»). */
    "lib/timeline/project-actions.ts",
    "lib/contexto/detalle-cronograma.ts",
    "lib/business-cases/section-briefs.ts",
  ];
  /* Las formas que aparecieron en estos archivos, más las de uso diario del equipo. Una palabra
     entera: «Revisá» no caza «Revisa», y «vos» no caza «voseo». Las del final son las que la revisión
     adversarial (2026-09-24) encontró en las versiones base de estos mismos componentes y la lista no
     tenía. Las formas con pronombre pegado («generala», «decime») no llevan tilde: solo las caza esta
     lista. */
  const VOSEO = [
    "vos", "tenés", "podés", "Podés", "querés", "sabés", "sos",
    "Revisá", "revisá", "confirmá", "resolvé", "Tildá", "tildá", "Registrá", "marcá", "Generá",
    "Indicá", "Igualá", "arrastrá", "Guardá", "Agregá", "agregá", "excluí", "entrá", "Conversá",
    "activá", "Elegí", "elegí", "Pegá", "pegá", "Escribí", "Recargá", "recargá", "Copiá",
    "generala", "revisalo", "unificalas", "Ponele", "convertila", "decime", "fijate", "Fijate",
    "editá", "editás", "revisás", "confirmás", "sacá", "volvé", "probá", "Probá", "aceptás", "descartás",
    "Aceptá", "aceptá", "descartá", "Marcá", "dejás", "Describí", "atrasá", "podá", "Buscá", "buscá",
    "cumplilas", "incluila", "incluilas", "marcalas", "ubicalas", "crealo",
  ];
  const palabra = (v: string) => new RegExp(`(?<!\\p{L})${v}(?!\\p{L})`, "u");

  /* ⭐ LA LISTA SOLA ES CERRADA (revisión adversarial, 2026-09-24): «Aceptá o descartá cada cambio»
     pasaba en verde porque ninguna de las dos estaba en la lista. El voseo tiene una FORMA: el
     imperativo termina en vocal con tilde («Aceptá», «volvé», «Describí») y el presente en -ás, -és,
     -ís («revisás», «tenés»). Toda palabra así en el código de estos componentes tiene que estar en
     esta lista de palabras de TUTEO. Si una palabra nueva es tuteo de verdad (un futuro como
     «mostrará», un adverbio), se suma acá, a propósito; si es voseo, se corrige el texto. */
  const AGUDAS_DE_TUTEO = new Set([
    "acá", "ahí", "allá", "allí", "aquí", "así", "sí", "más", "además", "atrás", "detrás", "jamás",
    "demás", "después", "través", "qué", "está", "estás", "país",
    "será", "serás", "verá", "verás", "estará", "podrá", "podrás", "tendrá", "tendrás", "habrá",
    "hará", "harás", "dirá", "quedará", "aplicará", "mostrará", "cambiará", "pasará",
    "llegará", "seguirá", "volverá", "sabrá", "deberá", "moverá", "correrá", "aparecerá",
  ]);
  const AGUDA = /(?<!\p{L})\p{L}+(?:á|é|í|ás|és|ís)(?!\p{L})/gu;
  const agudasQueNoSonTuteo = (linea: string) =>
    [...linea.matchAll(AGUDA)].map((m) => m[0]).filter((w) => !AGUDAS_DE_TUTEO.has(w.toLowerCase()));

  it("ninguna forma de voseo en el código de estos componentes", () => {
    const hallados: string[] = [];
    for (const rel of COMPONENTES) {
      const lineas = sinComentarios(leer(rel)).split(/\r?\n/);
      lineas.forEach((l, i) => {
        for (const v of VOSEO) if (palabra(v).test(l)) hallados.push(`${rel}:${i + 1} «${v}»`);
        for (const w of agudasQueNoSonTuteo(l)) hallados.push(`${rel}:${i + 1} «${w}» (¿voseo? si es tuteo, súmala a AGUDAS_DE_TUTEO)`);
      });
    }
    expect(hallados, "volvió el voseo a una pantalla del cronograma").toEqual([]);
  });

  it("#24 · los errores del detalle que la pantalla muestra tal cual (analyze) van en tuteo", () => {
    /* La pantalla muestra `data?.message ?? data?.error` del paso 2 de «Regenerar todo». La ruta tiene
       3.300 líneas y otros agentes con su propio texto, así que se miran los tramos del detalle. La
       edición que la pone en rojo: volver a «Probá de nuevo» o «Generá… crealo». */
    const analyze = leer("app/api/clients/[id]/analyze/route.ts");
    const validacion = analyze.slice(analyze.indexOf("if (isFlowchart) {"), analyze.indexOf("if (isFlowchart) {") + 1800);
    expect(validacion).toContain("El agente devolvió un detalle de cronograma inválido. Prueba de nuevo.");
    expect(validacion, "volvió el voseo a los errores del paso 2").not.toContain("Probá de nuevo");
    expect(analyze).toContain("Genera primero el esqueleto (handoff) o créalo a mano en el canvas Cronograma.");
  });

  it("y el detector caza lo que tiene que cazar (si no, la guarda de arriba es decorativa)", () => {
    const caza = (texto: string) => VOSEO.some((v) => palabra(v).test(texto)) || agudasQueNoSonTuteo(texto).length > 0;
    for (const texto of [
      "Conversá el cambio", "— vos tenés fijado", "Ponele semanas", "entrá y generala",
      // Las de la revisión adversarial: ninguna estaba en la lista.
      "Paso 1 de 2 · Aceptá o descartá cada cambio", "Si editás la fase", "revisás el Gantt", "confirmás el avance",
      "sacá la reunión", "volvé a intentar", "Probá de nuevo", "lo aceptás", "lo descartás", "Marcá la tarea",
      "si la dejás", "Describí el cambio", "atrasá la fase", "podá el contexto", "Buscá la reunión",
      // Y otras que ninguna lista nombró: las caza la forma.
      "Cerrá el panel", "Mové la fase", "Pedí el cambio", "Subí la nota",
    ]) {
      expect(caza(texto), texto).toBe(true);
    }
    for (const texto of [
      "Conversa el cambio", "el voseo", "Revisa el Gantt", "tú tienes fijado", "Ponle semanas",
      "Acepta o descarta cada cambio", "Después se aplicará", "¿Qué más está pendiente?", "Así quedará", "acá y allá",
    ]) {
      expect(caza(texto), texto).toBe(false);
    }
  });
});
