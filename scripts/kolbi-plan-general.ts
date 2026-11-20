/**
 * scripts/kolbi-plan-general.ts — CARGA EL PLAN DE VALENTINA EN LOS TRES PROYECTOS DE KÖLBI (2026-11-19, pedido de Elías).
 *
 * Kölbi lleva un ciclo SmartLoop de 12 semanas con siete loops. Valentina lo tenía en un Excel; desde ahora vive en
 * Nexus como el «Plan general» de la cuenta (lib/plan-general). Este script deja, en cada proyecto:
 *   - el cronograma: un loop = una fase (`loopNumero`, 12 semanas, en paralelo desde la semana 0) y sus actividades
 *     como tareas (semanas, estado y el detalle en las notas). Arranque: lunes 2 de noviembre de 2026.
 *     El cronograma viejo de «Kolbi | Ventas SMARTLOOP» (8 fases de julio, sin tareas ni publicar) se REEMPLAZA
 *     (respuesta 3 de Elías); si alguna fase tuviera tareas, el script no la borra y aborta.
 *   - el handoff: la sección «Loops que cubre este proyecto» con la tabla Loop · Área · Objetivo · Prioridad, y una
 *     línea con dónde viven los otros loops de la cuenta. Marketing e Infoclic no tenían handoff: nace con esa sola
 *     sección (respuesta 5). El handoff de Ventas conserva lo que tenía.
 * Las actividades transversales (alineación, entrevistas, sprint review…) NO se cargan todavía (punto 5 del pedido).
 *
 * SIMULA por defecto (solo lee). Con --apply escribe, después de respaldar las tablas que toca.
 * Idempotente: un loop que ya existe (mismo número en el cronograma del proyecto) no se duplica, y sus actividades
 * se reconocen por el nombre (el de hoy o el de la carga del 19 nov). Una que conserva el nombre de esa primera carga se
 * CORRIGE (título, resumen y semanas; el simulacro muestra el antes y el después), nunca su estado; una que ya tiene otro
 * nombre no se toca. La sección de loops del handoff que ya tiene bloques no se toca.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/kolbi-plan-general.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/kolbi-plan-general.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 *
 * Va DESPUÉS de scripts/sql/2026-11-19-plan-general-de-la-cuenta.sql y del deploy del código que lo lee.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import type { Prisma, TimelineTaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createHandoffCanvas, reconcileHandoffCanvasSections } from "@/lib/canvas/default-canvases";
import { SECCION_DE_LOOPS, tablaDeLoops, type LoopDeclarado } from "@/lib/plan-general/loops-del-handoff";
import { rotuloDelLoop } from "@/lib/plan-general/tipos";
import { imprimirDestino, resolverApply } from "./lib/guard";

const APPLY = resolverApply({
  tablas: ["ProjectTimeline", "TimelinePhase", "TimelineTask", "CasoDeUso", "Particularidad", "ProjectCanvas", "CanvasSection", "CanvasBlock"],
});

const KOLBI = "cmo2esfqu000s8sij55rp7wmi";
const ARRANQUE = new Date("2026-11-02T00:00:00.000Z"); // lunes: la semana 1 del ciclo
const SEMANAS_DEL_CICLO = 12;

const P = {
  infoclic: "cmsj9spd7017j07pl1jgrxl37", // «Integración con InfoClic | kölbi» (Desarrollo, Alejandro Salas)
  marketing: "cmo54droh001n9gijbzvyfwlz", // «Kolbi | Marketing SMARTLOOP»
  ventas: "cmo54dosv000x9gijegl0nhl8", // «Kolbi | Ventas SMARTLOOP»
} as const;
type Clave = keyof typeof P;

interface Loop extends LoopDeclarado {
  numero: number;
  proyecto: Clave;
}

const LOOPS: Loop[] = [
  { proyecto: "infoclic", numero: 1, nombre: "Customer 360° & Connections", area: "Marketing", prioridad: "Alta", objetivo: "Conectar fuentes y enriquecer la visión del cliente (datos, integraciones, calidad y gobierno)." },
  { proyecto: "marketing", numero: 2, nombre: "Campaign Activation", area: "Marketing", prioridad: "Media", objetivo: "Activar campañas, segmentaciones, landing pages, workflows y WhatsApp." },
  { proyecto: "marketing", numero: 3, nombre: "Marketing Optimization", area: "Marketing", prioridad: "Media", objetivo: "Mejorar scoring, nurturing, journeys, calidad de datos y reporting." },
  { proyecto: "ventas", numero: 4, nombre: "Lead Management & Conversion", area: "Ventas", prioridad: "Media", objetivo: "Mejorar atención, asignación, seguimiento y conversión de leads." },
  { proyecto: "ventas", numero: 5, nombre: "Prospecting & AI Experimentation", area: "Ventas", prioridad: "Alta", objetivo: "Iterar la prospección de pymes con IA, HubSpot Credits, automatización y segmentación." },
  { proyecto: "ventas", numero: 6, nombre: "Sales Execution & Productivity", area: "Ventas", prioridad: "Media", objetivo: "Mejorar rutinas, adopción, disciplina comercial y productividad." },
  { proyecto: "ventas", numero: 7, nombre: "Sales Management & Performance", area: "Ventas", prioridad: "Media", objetivo: "Dar visibilidad sobre pipeline, forecast, citas, oportunidades, conversión y adopción." },
];

interface Actividad {
  loop: number;
  titulo: string;
  /** Los nombres con que se cargó antes (19 nov): con ellos se reconoce la tarea para corregirla, no duplicarla. */
  antes?: string[];
  /** Semanas del ciclo, desde 1 e inclusivas: las del Excel de Valentina («Plan detallado»), salvo lo que dice abajo. */
  desde: number;
  hasta: number;
  estado: TimelineTaskStatus;
  /** El resumen de la tarea (sus notas, internas): qué se hace y para qué, a partir de la columna «Acciones». */
  detalle: string;
}

/* Las semanas salen del Excel («Plan detallado», 20 nov), salvo Marketing Optimization (Elías, 20 nov): la revisión va
   en las semanas 4 y 5 y el ajuste de la 6 a la 12, así el loop se ve de la 4 a la 12. Los títulos están redactados a
   partir de «Acciones» y el resumen va en las notas. Entregable y participantes no se cargan todavía (Elías, 20 nov). */
const ACTIVIDADES: Actividad[] = [
  {
    loop: 1, titulo: "Inventariar fuentes y calidad de datos", antes: ["Inventario de fuentes"], desde: 2, hasta: 2, estado: "IN_PROGRESS",
    detalle: "Levantar qué fuentes alimentan a HubSpot (integraciones, sincronizaciones y campos) y medir la calidad de sus datos: duplicados, completitud y consistencia. Es la base para decidir qué se limpia y qué se integra.",
  },
  {
    loop: 1, titulo: "Diseñar el modelo de datos y su gobierno", antes: ["Diseño de datos y gobierno"], desde: 1, hasta: 4, estado: "IN_PROGRESS",
    detalle: "Definir los campos críticos, las reglas de normalización y deduplicación, quién es dueño de cada dato y cómo se gobiernan las integraciones, para que la información del cliente se mantenga limpia después de la integración.",
  },
  {
    loop: 1, titulo: "Identificar los registros duplicados", antes: ["Identificación de duplicados"], desde: 2, hasta: 2, estado: "IN_PROGRESS",
    detalle: "Encontrar los registros duplicados en HubSpot y acordar con qué criterio se decide cuál se conserva.",
  },
  {
    loop: 1, titulo: "Deduplicar los registros en HubSpot", antes: ["Deduplicación en HubSpot"], desde: 3, hasta: 3, estado: "IN_PROGRESS",
    detalle: "Ejecutar la deduplicación en HubSpot con un script, según el criterio acordado, y dejar registro de lo que se unió.",
  },
  {
    loop: 1, titulo: "Integrar Infoclic y los sistemas externos con HubSpot", antes: ["Integración Infoclic–HubSpot"], desde: 4, hasta: 5, estado: "PENDING",
    detalle: "Construir la integración entre Infoclic, los sistemas externos y HubSpot, y probarla con datos reales antes de dejarla corriendo.",
  },
  {
    loop: 1, titulo: "Optimizar la integración según las pruebas", antes: ["Optimización de la integración"], desde: 5, hasta: 12, estado: "PENDING",
    detalle: "Ajustar la integración de forma continua con lo que vayan mostrando las pruebas y el uso: nuevas iteraciones hasta el cierre del ciclo.",
  },
  {
    loop: 2, titulo: "Revisar las campañas y los activos de marketing", antes: ["Revisión de campañas y activos"], desde: 3, hasta: 4, estado: "IN_PROGRESS",
    detalle: "Revisar campañas, listas, formularios, landing pages, workflows, WhatsApp, permisos y convenciones de nombres, y evaluar qué se usa y qué no.",
  },
  {
    loop: 2, titulo: "Lanzar la campaña piloto", antes: ["Campaña piloto"], desde: 5, hasta: 6, estado: "PENDING",
    detalle: "Elegir la audiencia y el objetivo, preparar el contenido, la landing o el formulario y el workflow, revisarlo todo, lanzar y dar seguimiento a los resultados.",
  },
  {
    loop: 3, titulo: "Revisar el scoring, el ciclo de vida y los journeys", antes: ["Revisión de scoring y journeys"], desde: 4, hasta: 5, estado: "PENDING",
    detalle: "Diagnóstico de la madurez de marketing: scoring, ciclo de vida, nurturing, journeys, suscripciones, entregabilidad, tracking y dashboards.",
  },
  {
    loop: 3, titulo: "Ajustar el scoring, los segmentos y el nurturing", antes: ["Ajuste de scoring y nurturing"], desde: 6, hasta: 12, estado: "PENDING",
    detalle: "Ajustar los criterios de scoring, los segmentos, los journeys y las reglas de nutrición, y validarlos con datos y con los usuarios de marketing y ventas.",
  },
  {
    loop: 4, titulo: "Revisar el flujo de leads hasta la oportunidad", antes: ["Revisión de captura y etapas"], desde: 2, hasta: 2, estado: "DONE",
    detalle: "Revisar cómo se capturan, asignan y siguen los leads, sus etapas, los motivos de pérdida y la conversión, para encontrar dónde se escapan.",
  },
  {
    loop: 4, titulo: "Corregir la asignación, los SLA y la trazabilidad de los leads", antes: ["Reglas de asignación y SLA"], desde: 6, hasta: 12, estado: "PENDING",
    detalle: "Corregir las reglas de asignación, las propiedades, las notificaciones y los SLA, y dejar trazables los leads prioritarios, con pruebas documentadas.",
  },
  {
    loop: 5, titulo: "Definir la hipótesis, el caso de uso, el mensaje y el canal", antes: ["Hipótesis y caso de uso"], desde: 4, hasta: 4, estado: "PENDING",
    detalle: "Acordar qué se va a probar en la prospección con IA: la hipótesis, el caso de uso, el mensaje y el canal.",
  },
  {
    loop: 5, titulo: "Ejecutar el piloto de prospección", antes: ["Ejecución del piloto"], desde: 5, hasta: 7, estado: "PENDING",
    detalle: "Correr el piloto de prospección y documentar el experimento y sus primeros resultados.",
  },
  {
    loop: 6, titulo: "Revisar el pipeline, la adopción y la productividad comercial", antes: ["Revisión de pipeline y adopción"], desde: 2, hasta: 2, estado: "DONE",
    detalle: "Revisar el pipeline, las tareas, actividades y reuniones, la adopción, las rutinas, los playbooks y la productividad por vendedor.",
  },
  {
    loop: 6, titulo: "Definir el playbook comercial v1", antes: ["Playbook comercial v1"], desde: 4, hasta: 5, estado: "PENDING",
    detalle: "Definir los estándares de actividad, tareas, seguimiento, higiene del pipeline y reuniones de revisión, con una rutina semanal para el equipo.",
  },
  {
    loop: 7, titulo: "Revisar los dashboards, el forecast y los KPIs", antes: ["Revisión de dashboards y KPIs"], desde: 5, hasta: 5, estado: "PENDING",
    detalle: "Revisar los dashboards, el forecast, el pipeline, la conversión, la velocidad, las metas y cómo se define cada indicador.",
  },
  {
    loop: 7, titulo: "Crear el dashboard comercial v1", antes: ["Dashboard v1"], desde: 6, hasta: 8, estado: "PENDING",
    detalle: "Construir un dashboard con pipeline, forecast, conversión, velocidad, citas, oportunidades, actividad y adopción, con su diccionario de métricas.",
  },
];

/** Las semanas de una actividad, como las guarda el cronograma (weekIndex desde 0; null = una semana). */
const semanasDeLaActividad = (a: Actividad) => ({ weekIndex: a.desde - 1, semanas: a.hasta > a.desde ? a.hasta - a.desde + 1 : null });

/** La tarea ya cargada que es esta actividad (por su nombre de hoy o por el de antes), o undefined. */
function tareaDeLaActividad<T extends { title: string }>(tareas: readonly T[], a: Actividad): T | undefined {
  const nombres = new Set([a.titulo, ...(a.antes ?? [])].map((n) => n.trim().toLowerCase()));
  return tareas.find((t) => nombres.has(t.title.trim().toLowerCase()));
}

/**
 * ¿Se corrige esta tarea ya cargada? SOLO si conserva el nombre de la primera carga (19 nov): así sabemos que nadie la
 * tocó desde entonces. Una que ya tiene el nombre nuevo (corregida antes, o renombrada por el equipo) no se pisa: ni su
 * título, ni su resumen, ni sus semanas. El estado nunca se toca.
 */
function seCorrige(t: { title: string }, a: Actividad): boolean {
  const viejo = (a.antes ?? []).map((n) => n.trim().toLowerCase());
  return viejo.includes(t.title.trim().toLowerCase());
}

const rango = (weekIndex: number, semanas: number | null) => {
  const fin = weekIndex + (semanas ?? 1);
  return fin > weekIndex + 1 ? `S${weekIndex + 1}–S${fin}` : `S${weekIndex + 1}`;
};

const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;
const semana = (n: number) => new Date(ARRANQUE.getTime() + (n - 1) * SEMANA_MS); // lunes de la semana n

/** El estado de la fase-loop, derivado de sus actividades (como lo hace el PATCH de una tarea). */
function estadoDelLoop(acts: Actividad[]): TimelineTaskStatus {
  if (acts.length > 0 && acts.every((a) => a.estado === "DONE")) return "DONE";
  return acts.some((a) => a.estado !== "PENDING") ? "IN_PROGRESS" : "PENDING";
}

/** La línea del handoff que dice dónde viven los otros loops de la cuenta. */
function otrosLoops(clave: Clave, nombres: Record<Clave, string>): string {
  const propios = LOOPS.filter((l) => l.proyecto === clave);
  const otros = (Object.keys(P) as Clave[]).filter((k) => k !== clave);
  const partes = otros.map((k) => {
    const ls = LOOPS.filter((l) => l.proyecto === k).map((l) => rotuloDelLoop(l.numero, l.nombre));
    return `${ls.join(", ")} ${ls.length === 1 ? "vive" : "viven"} en «${nombres[k]}»`;
  });
  return (
    `Este proyecto cubre ${propios.length === 1 ? "1 loop" : `${propios.length} loops`} de los ${LOOPS.length} del ciclo SmartLoop de ` +
    `${SEMANAS_DEL_CICLO} semanas de kölbi. ${partes.join("; ")}. Los siete se ven juntos en «Plan general», arriba de los proyectos.`
  );
}

async function main() {
  imprimirDestino();
  console.log(APPLY ? "\n▶ APLICANDO\n" : "\n▶ SIMULACRO (no escribe nada; --apply para escribir)\n");

  const proyectos = await prisma.project.findMany({
    where: { id: { in: Object.values(P) } },
    select: {
      id: true,
      name: true,
      clientId: true,
      status: true,
      timeline: {
        select: {
          id: true,
          anchorStartDate: true,
          detailConfirmedAt: true,
          pendingProposal: true,
          phases: {
            select: {
              id: true,
              name: true,
              loopNumero: true,
              _count: { select: { tasks: true, casosDeUso: true, particularidades: true } },
              tasks: { select: { id: true, title: true, notes: true, weekIndex: true, semanas: true } },
            },
          },
        },
      },
      canvases: { where: { slug: "handoff" }, select: { id: true } },
    },
  });
  const nombres = {} as Record<Clave, string>;
  for (const clave of Object.keys(P) as Clave[]) {
    const p = proyectos.find((x) => x.id === P[clave]);
    if (!p) throw new Error(`No existe el proyecto ${clave} (${P[clave]}).`);
    if (p.clientId !== KOLBI) throw new Error(`⛔ El proyecto «${p.name}» no es de kölbi: no se toca nada.`);
    if (p.status !== "active") throw new Error(`⛔ El proyecto «${p.name}» no está activo.`);
    nombres[clave] = p.name;
  }

  // Todo lo que aborta se mira ANTES de escribir nada: el script escribe un proyecto a la vez, y abortar a mitad de
  // camino dejaría dos escritos y uno no.
  for (const clave of Object.keys(P) as Clave[]) {
    const p = proyectos.find((x) => x.id === P[clave])!;
    // Una fase vieja con algo colgado (tareas, casos de uso del ciclo, particularidades) no se borra: se frena todo.
    const conAlgo = (p.timeline?.phases ?? []).filter(
      (f) => f.loopNumero == null && f._count.tasks + f._count.casosDeUso + f._count.particularidades > 0,
    );
    if (conAlgo.length)
      throw new Error(`⛔ «${p.name}» tiene fases con tareas, casos de uso o particularidades (${conAlgo.map((f) => f.name).join(", ")}): no se borran. Nada se escribió.`);
  }

  // Cobranza: un servicio ligado a estos proyectos con otra fecha de inicio avisa «el arranque cambió» (engine.ts).
  const servicios = await prisma.servicioContratado.findMany({
    where: { projectId: { in: Object.values(P) } },
    select: { projectId: true, tipoServicio: true, fechaInicioFacturacion: true },
  });
  for (const s of servicios) {
    const d = s.fechaInicioFacturacion?.toISOString().slice(0, 10) ?? "sin fecha";
    const aviso = d !== "2026-11-02" ? "  ⚠ con el arranque nuevo, Cobranza avisará que difiere (no cambia cobros)" : "";
    console.log(`Cobranza · ${proyectos.find((p) => p.id === s.projectId)?.name}: ${s.tipoServicio}, factura desde ${d}${aviso}`);
  }
  if (servicios.length) console.log("");

  for (const clave of Object.keys(P) as Clave[]) {
    const p = proyectos.find((x) => x.id === P[clave])!;
    const loops = LOOPS.filter((l) => l.proyecto === clave);
    const tl = p.timeline;
    console.log(`━━ ${p.name}`);
    console.log(`   cronograma hoy: ${tl ? `${tl.phases.length} fases, arranque ${tl.anchorStartDate?.toISOString().slice(0, 10) ?? "sin fijar"}` : "no tiene"}`);
    // El arranque se fija SOLO si no tiene: uno puesto a mano (o movido después de una primera corrida) no se pisa.
    const fijarArranque = !tl?.anchorStartDate;
    if (fijarArranque) console.log("   arranque → lunes 2 nov 2026 (semana 1 del ciclo)");
    else if (tl!.anchorStartDate!.getTime() !== ARRANQUE.getTime())
      console.log(`   ⚠ el arranque ya está en ${tl!.anchorStartDate!.toISOString().slice(0, 10)} y NO se cambia: el plan se cuenta desde ahí. Si tiene que ser el 2 nov, cámbialo en el Gantt.`);
    if (tl?.pendingProposal) console.log("   ⚠ tiene una propuesta abierta del cronograma: se queda como está (revísala en el Gantt).");

    // Las fases que no son loops: en Ventas, el cronograma viejo de julio. Se reemplaza solo si no tiene tareas.
    const viejas = (tl?.phases ?? []).filter((f) => f.loopNumero == null);
    if (viejas.length) {
      console.log(`   se quitan ${viejas.length} fases viejas sin nada colgado: ${viejas.map((f) => f.name).join(" · ")}`);
    }

    for (const l of loops) {
      const existente = tl?.phases.find((f) => f.loopNumero === l.numero);
      const acts = ACTIVIDADES.filter((a) => a.loop === l.numero);
      const nuevas = acts.filter((a) => !tareaDeLaActividad(existente?.tasks ?? [], a));
      const corregir = acts.filter((a) => {
        const t = tareaDeLaActividad(existente?.tasks ?? [], a);
        return !!t && seCorrige(t, a);
      });
      console.log(
        `   ${existente ? "=" : "+"} ${rotuloDelLoop(l.numero, l.nombre)} · ${l.area} · ${l.prioridad}: ${nuevas.length} actividades nuevas, ${corregir.length} a corregir` +
          (existente ? ` (ya tenía ${existente._count.tasks})` : ""),
      );
      for (const a of nuevas) {
        console.log(`       + S${a.desde}${a.hasta > a.desde ? `–S${a.hasta}` : ""}  ${a.estado.padEnd(11)} ${a.titulo}`);
        if (existente?.tasks.length) console.log("         ⚠ el loop ya tiene tareas: si alguna es esta con otro nombre, renómbrala en Nexus antes de aplicar o quedará repetida.");
      }
      for (const a of corregir) {
        const t = tareaDeLaActividad(existente?.tasks ?? [], a)!;
        const w = semanasDeLaActividad(a);
        console.log(`       ~ «${t.title}» → «${a.titulo}»`);
        console.log(`         semanas: ${rango(t.weekIndex, t.semanas ?? null)} → ${rango(w.weekIndex, w.semanas)} · resumen: se reemplaza (hoy: «${(t.notes ?? "").slice(0, 60)}${(t.notes ?? "").length > 60 ? "…" : ""}») · el estado no se toca`);
      }
    }

    const handoff = p.canvases[0];
    let seccionConBloques = false;
    if (handoff) {
      const s = await prisma.canvasSection.findFirst({ where: { canvasId: handoff.id, key: SECCION_DE_LOOPS }, select: { _count: { select: { blocks: true } } } });
      seccionConBloques = (s?._count.blocks ?? 0) > 0;
    }
    console.log(
      `   handoff: ${handoff ? "existe" : "no tiene → nace solo con la sección de loops"}; sección «Loops que cubre este proyecto»: ` +
        (seccionConBloques ? "ya tiene contenido, no se toca" : `se escribe (tabla de ${loops.length} y la línea de los otros loops)`),
    );
    console.log(`   «${otrosLoops(clave, nombres)}»\n`);

    if (!APPLY) continue;

    // ── Escritura, por proyecto, en una transacción ──
    await prisma.$transaction(async (tx) => {
      const timeline = await tx.projectTimeline.upsert({
        where: { projectId: p.id },
        // El detalle nace confirmado: el plan lo armó Valentina con el cliente, y sin eso el cliente no vería ninguna
        // actividad (la misma puerta que el cronograma externo).
        create: { projectId: p.id, anchorStartDate: ARRANQUE, detailConfirmedAt: new Date(), lastEditedByHuman: new Date() },
        update: { ...(fijarArranque ? { anchorStartDate: ARRANQUE } : {}), ...(tl?.detailConfirmedAt ? {} : { detailConfirmedAt: new Date() }), lastEditedByHuman: new Date() },
        select: { id: true },
      });
      if (viejas.length) await tx.timelinePhase.deleteMany({ where: { id: { in: viejas.map((f) => f.id) } } });
      let creadas = 0;
      for (const [i, l] of loops.entries()) {
        const acts = ACTIVIDADES.filter((a) => a.loop === l.numero);
        const fase = tl?.phases.find((f) => f.loopNumero === l.numero);
        const faseId =
          fase?.id ??
          (
            await tx.timelinePhase.create({
              data: {
                timelineId: timeline.id,
                name: l.nombre,
                order: i,
                durationWeeks: SEMANAS_DEL_CICLO,
                startWeek: 0,
                loopNumero: l.numero,
                notes: l.objetivo,
                source: "HUMAN",
                status: estadoDelLoop(acts),
                statusSource: "HUMAN",
                statusChangedAt: new Date(),
                ...(estadoDelLoop(acts) !== "PENDING" ? { actualStart: semana(Math.min(...acts.filter((a) => a.estado !== "PENDING").map((a) => a.desde))) } : {}),
              },
              select: { id: true },
            })
          ).id;
        let orden = 0;
        for (const a of acts) {
          const ya = tareaDeLaActividad(fase?.tasks ?? [], a);
          const w = semanasDeLaActividad(a);
          if (ya) {
            // Ya cargada y sin tocar desde la primera carga: se corrigen el título, el resumen y las semanas. El estado
            // NO: lo lleva el equipo desde Nexus. Una que ya tiene otro nombre (corregida, o renombrada a mano) se deja.
            if (seCorrige(ya, a)) {
              creadas++;
              await tx.timelineTask.update({ where: { id: ya.id }, data: { title: a.titulo, notes: a.detalle, ...w } });
            }
            continue;
          }
          creadas++;
          await tx.timelineTask.create({
            data: {
              phaseId: faseId,
              title: a.titulo,
              ...w,
              order: orden++,
              status: a.estado,
              statusSource: "HUMAN",
              statusChangedAt: a.estado === "PENDING" ? null : new Date(),
              actualStart: a.estado === "PENDING" ? null : semana(a.desde),
              actualEnd: a.estado === "DONE" ? new Date(semana(a.hasta).getTime() + SEMANA_MS) : null,
              notes: a.detalle,
              source: "HUMAN",
            },
          });
        }
      }
      // Una corrida que no agrega nada no deja rastro en el historial.
      if (creadas > 0 || viejas.length > 0) await tx.timelineChange.create({
        data: {
          timelineId: timeline.id,
          reason:
            "Plan general de kölbi: los loops de este proyecto y sus actividades, cargados o corregidos desde el plan de Valentina (Excel del 20 nov 2026)." +
            (viejas.length ? ` Se quitaron ${viejas.length} fases de julio sin tareas.` : ""),
          kind: "MANUAL",
          changedByEmail: null,
          snapshot: { anchorStartDate: ARRANQUE.toISOString(), loops: loops.map((l) => l.numero) } as Prisma.InputJsonValue,
        },
      });

      // El handoff: la sección de loops (y el canvas, si no había).
      const canvasId = handoff?.id ?? (await createHandoffCanvas(p.id, tx));
      await reconcileHandoffCanvasSections(canvasId, tx);
      const seccion = await tx.canvasSection.findFirstOrThrow({ where: { canvasId, key: SECCION_DE_LOOPS }, select: { id: true, _count: { select: { blocks: true } } } });
      if (seccion._count.blocks === 0) {
        await tx.canvasBlock.createMany({
          data: [
            { sectionId: seccion.id, blockType: "TABLE", data: tablaDeLoops(loops) as Prisma.InputJsonValue, order: 0, colSpan: 4, rowSpan: 2, source: "HUMAN", status: "CONFIRMED" },
            { sectionId: seccion.id, blockType: "TEXT", content: otrosLoops(clave, nombres), order: 1, colSpan: 4, rowSpan: 1, source: "HUMAN", status: "CONFIRMED" },
          ],
        });
      }
    });
    console.log(`   ✓ escrito\n`);
  }

  if (!APPLY) console.log("Simulacro: nada se escribió. Para aplicarlo, el comando con --apply del encabezado.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
