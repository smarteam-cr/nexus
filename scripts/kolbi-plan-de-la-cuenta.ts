/**
 * scripts/kolbi-plan-de-la-cuenta.ts — CREA EL PLAN GENERAL DE KÖLBI COMO OBJETO DE LA CUENTA (2026-11-26, etapa 1).
 *
 * DECISIONS «El plan general es un objeto de la cuenta, con su lista de proyectos y sus propias fases». Deja:
 *   - el plan de kölbi (`PlanGeneral`) con su lista EXPLÍCITA de tres proyectos (InfoClic, Marketing y Ventas SMARTLOOP);
 *   - su cronograma (el del plan), con arranque el lunes 2 nov 2026 (el de los tres proyectos) y el detalle confirmado;
 *   - la fase propia «Transversal» (loop 0 → «00 · Transversal»), EN CURSO, de S0 a S8 (9 semanas), con cuatro tareas.
 *     El entregable y quiénes participan van en el detalle de cada tarea (sus notas, internas: no cruzan al cliente).
 * NO publica: el cliente sigue viendo la foto que ya tiene hasta que alguien aprieta «Publicar» en el plan.
 *
 * SIMULA por defecto (solo lee). Con --apply escribe, después de respaldar las tablas que toca.
 * Idempotente: un plan que ya existe no se duplica (se completa la lista y el arranque si faltan, y uno distinto NO se
 * cambia); la fase se reconoce por su número (0) o su nombre, y las tareas por su título: lo que ya está no se toca.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/kolbi-plan-de-la-cuenta.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/kolbi-plan-de-la-cuenta.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 *
 * Va DESPUÉS de scripts/sql/2026-11-26-plan-general-objeto-de-la-cuenta.sql y del deploy del código que lo lee.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import type { TaskParty, TimelineTaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { rotuloDelLoop } from "@/lib/plan-general/tipos";
import { semanasQueCaben } from "@/lib/timeline/weeks";
import { imprimirDestino, resolverApply } from "./lib/guard";

const APPLY = resolverApply({
  tablas: ["PlanGeneral", "ProyectoDelPlan", "ProjectTimeline", "TimelinePhase", "TimelineTask", "AccesoAlPlanGeneral"],
});

const KOLBI = "cmo2esfqu000s8sij55rp7wmi";
const PROYECTOS = {
  infoclic: "cmsj9spd7017j07pl1jgrxl37", // «Integración con InfoClic | kölbi»
  marketing: "cmo54droh001n9gijbzvyfwlz", // «Kolbi | Marketing SMARTLOOP»
  ventas: "cmo54dosv000x9gijegl0nhl8", // «Kolbi | Ventas SMARTLOOP»
} as const;
const DIA_DE_ARRANQUE = "2026-11-02"; // lunes: la semana 0 del ciclo, la de los tres proyectos
const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

const FASE = { nombre: "Transversal", loop: 0, desde: 0, semanas: 9, estado: "IN_PROGRESS" as TimelineTaskStatus };

interface Tarea {
  titulo: string;
  /** Semana del plan (S0 = 0), relativa a la fase (que arranca en S0). */
  semana: number;
  semanas: number;
  estado: TimelineTaskStatus;
  /** Quién la hace: lo dice «Participan» (Smarteam solo, o con el cliente). */
  party: TaskParty;
  entregable: string;
  participan: string;
}

const TAREAS: Tarea[] = [
  {
    titulo: "Alinear objetivos de negocio, alcance, stakeholders, disponibilidad, canales de comunicación y cadencia",
    semana: 0,
    semanas: 1,
    estado: "DONE",
    party: "AMBOS",
    entregable: "Objetivos y alcance aprobados.",
    participan: "Sponsor y líderes de Marketing y Sales.",
  },
  {
    titulo: "Entrevistar líderes y usuarios; mapear proceso real vs. proceso diseñado y dolores principales",
    semana: 0,
    semanas: 2,
    estado: "DONE",
    party: "AMBOS",
    entregable: "Mapa de procesos y hallazgos de las entrevistas.",
    participan: "Usuarios clave.",
  },
  {
    titulo: "Consolidar hallazgos, nivel de uso, calidad, desempeño, riesgos e impacto potencial por loop",
    semana: 1,
    semanas: 1,
    estado: "DONE",
    party: "SMARTEAM",
    entregable: "Scorecard de madurez y línea base.",
    participan: "Especialistas de Smarteam.",
  },
  {
    titulo: "Capacitar por rol; documentar guías cortas; revisar uso real y resolver fricciones",
    semana: 3,
    semanas: 6,
    estado: "IN_PROGRESS",
    party: "AMBOS",
    entregable: "Sesiones, materiales y medición de adopción.",
    participan: "Champions y usuarios.",
  },
];

const notasDe = (t: Tarea) => `Entregable: ${t.entregable}\nParticipan: ${t.participan}`;
const normal = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

async function main() {
  imprimirDestino();
  console.log(APPLY ? "\n▶ APLICANDO\n" : "\n▶ SIMULACRO (no escribe nada; --apply para escribir)\n");

  // ── Lo que hay ────────────────────────────────────────────────────────────
  const cliente = await prisma.client.findUnique({ where: { id: KOLBI }, select: { name: true } });
  if (!cliente) throw new Error(`No existe la cuenta ${KOLBI}.`);
  const proyectos = await prisma.project.findMany({
    where: { id: { in: Object.values(PROYECTOS) } },
    select: { id: true, name: true, clientId: true, status: true, esPrueba: true, timeline: { select: { anchorStartDate: true } } },
  });
  for (const [clave, id] of Object.entries(PROYECTOS)) {
    const p = proyectos.find((x) => x.id === id);
    if (!p) throw new Error(`⛔ No existe el proyecto ${clave} (${id}). Nada se escribió.`);
    if (p.clientId !== KOLBI) throw new Error(`⛔ «${p.name}» no es de kölbi. Nada se escribió.`);
    if (p.status !== "active" || p.esPrueba) throw new Error(`⛔ «${p.name}» no está activo o es de prueba: no entra al plan. Nada se escribió.`);
  }
  console.log(`Cuenta: ${cliente.name}`);
  for (const p of proyectos) console.log(`  · ${p.name} — arranca ${p.timeline?.anchorStartDate?.toISOString().slice(0, 10) ?? "sin fijar"}`);

  // El arranque: el instante que ya tienen los proyectos ese día (así el plan no corre a ninguno), o la medianoche UTC.
  const delDia = proyectos.map((p) => p.timeline?.anchorStartDate).find((a) => a?.toISOString().slice(0, 10) === DIA_DE_ARRANQUE);
  const arranque = delDia ?? new Date(`${DIA_DE_ARRANQUE}T00:00:00.000Z`);
  const semana = (n: number) => new Date(arranque.getTime() + n * SEMANA_MS);

  const plan = await prisma.planGeneral.findUnique({
    where: { clientId: KOLBI },
    select: {
      id: true,
      proyectos: { select: { projectId: true } },
      cronograma: {
        select: {
          id: true,
          anchorStartDate: true,
          phases: { select: { id: true, name: true, loopNumero: true, durationWeeks: true, tasks: { select: { id: true, title: true } } } },
        },
      },
    },
  });
  const acceso = await prisma.accesoAlPlanGeneral.findUnique({ where: { clientId: KOLBI }, select: { revokedAt: true, publicadoEn: true } });

  // ── El plan ───────────────────────────────────────────────────────────────
  console.log(`\nPlan: ${plan ? "ya existe" : "se crea"}`);
  const enLaLista = new Set(plan?.proyectos.map((p) => p.projectId) ?? []);
  const faltan = Object.values(PROYECTOS).filter((id) => !enLaLista.has(id));
  const otros = [...enLaLista].filter((id) => !(Object.values(PROYECTOS) as string[]).includes(id));
  for (const id of faltan) console.log(`  + proyecto «${proyectos.find((p) => p.id === id)!.name}»`);
  if (otros.length) console.log(`  · la lista ya tiene ${otros.length} proyecto(s) más: se quedan.`);
  const anclaHoy = plan?.cronograma?.anchorStartDate ?? null;
  const fijarArranque = !anclaHoy;
  if (fijarArranque) console.log(`  + arranque ${DIA_DE_ARRANQUE} (${arranque.toISOString()})`);
  else if (anclaHoy.toISOString().slice(0, 10) !== DIA_DE_ARRANQUE)
    console.log(`  ⚠ el plan ya arranca el ${anclaHoy.toISOString().slice(0, 10)} y NO se cambia: si tiene que ser el 2 nov, cámbialo en el Gantt del plan.`);
  else console.log(`  · arranque ${DIA_DE_ARRANQUE}: ya está.`);

  // ── La fase propia ────────────────────────────────────────────────────────
  const faseHoy = plan?.cronograma?.phases.find((f) => f.loopNumero === FASE.loop || normal(f.name) === normal(FASE.nombre));
  console.log(`\nFase ${rotuloDelLoop(FASE.loop, FASE.nombre)}: ${faseHoy ? `ya existe («${faseHoy.name}»): no se toca` : `se crea — en curso, S${FASE.desde} a S${FASE.desde + FASE.semanas - 1} (${FASE.semanas} semanas)`}`);
  // Una fase que ya existe se mide con SU duración: una tarea que arranca después de su final no se crea (INV22).
  const duracion = faseHoy?.durationWeeks ?? FASE.semanas;
  const titulos = new Set((faseHoy?.tasks ?? []).map((t) => normal(t.title)));
  const noCaben = TAREAS.filter((t) => !titulos.has(normal(t.titulo)) && t.semana > duracion - 1);
  const nuevas = TAREAS.filter((t) => !titulos.has(normal(t.titulo)) && !noCaben.includes(t));
  for (const t of noCaben) console.log(`  ⚠ «${t.titulo}» arranca en S${t.semana} y la fase dura ${duracion} semanas: NO se crea.`);
  for (const t of TAREAS) {
    if (noCaben.includes(t)) continue;
    const ya = titulos.has(normal(t.titulo));
    const semanasGuardadas = semanasQueCaben(t.semanas, t.semana, duracion);
    console.log(
      `  ${ya ? "·" : "+"} S${t.semana}${t.semanas > 1 ? `–S${t.semana + t.semanas - 1}` : ""} · ${t.estado} · ${t.party} · ${t.titulo}` +
        (ya ? " (ya está)" : "") +
        (!ya && (semanasGuardadas ?? 1) !== t.semanas ? `  ⚠ se recorta a ${semanasGuardadas ?? 1} semana(s)` : ""),
    );
    if (!ya) console.log(`      ${notasDe(t).replace("\n", "\n      ")}`);
  }

  // ── Lo que ve el cliente ──────────────────────────────────────────────────
  if (acceso?.publicadoEn && !acceso.revokedAt) {
    console.log(
      `\nℹ kölbi YA tiene el plan publicado al cliente (el ${acceso.publicadoEn.toISOString().slice(0, 16).replace("T", " ")} UTC). ` +
        "Este script NO republica: el cliente sigue viendo esa foto hasta que alguien aprieta «Publicar» en el plan.",
    );
  } else console.log(`\nℹ Acceso del cliente: ${acceso ? (acceso.revokedAt ? "revocado" : "sin publicar") : "no hay"}. El script no lo toca.`);

  if (!APPLY) {
    console.log("\nSimulacro: nada se escribió. Para aplicarlo, el comando con --apply del encabezado.");
    return;
  }

  // ── Escribir (todo o nada) ────────────────────────────────────────────────
  const ahora = new Date();
  await prisma.$transaction(async (tx) => {
    const planId =
      plan?.id ??
      (
        await tx.planGeneral.create({
          data: { clientId: KOLBI, creadoPor: "script:kolbi-plan-de-la-cuenta" },
          select: { id: true },
        })
      ).id;
    if (faltan.length)
      await tx.proyectoDelPlan.createMany({ data: faltan.map((projectId) => ({ planId, projectId, agregadoPor: "script:kolbi-plan-de-la-cuenta" })), skipDuplicates: true });
    const timelineId =
      plan?.cronograma?.id ??
      (await tx.projectTimeline.create({ data: { planId, anchorStartDate: arranque, detailConfirmedAt: ahora }, select: { id: true } })).id;
    if (fijarArranque && plan?.cronograma) await tx.projectTimeline.update({ where: { id: timelineId }, data: { anchorStartDate: arranque } });

    let faseId = faseHoy?.id;
    if (!faseId) {
      const ultima = await tx.timelinePhase.aggregate({ where: { timelineId }, _max: { order: true } });
      faseId = (
        await tx.timelinePhase.create({
          data: {
            timelineId,
            name: FASE.nombre,
            order: (ultima._max.order ?? -1) + 1,
            startWeek: FASE.desde,
            durationWeeks: FASE.semanas,
            loopNumero: FASE.loop,
            source: "HUMAN",
            status: FASE.estado,
            statusSource: "HUMAN",
            statusChangedAt: ahora,
            actualStart: semana(FASE.desde),
          },
          select: { id: true },
        })
      ).id;
    }
    for (const t of nuevas) {
      const order = await tx.timelineTask.count({ where: { phaseId: faseId, weekIndex: t.semana } });
      await tx.timelineTask.create({
        data: {
          phaseId: faseId,
          title: t.titulo,
          weekIndex: t.semana,
          semanas: semanasQueCaben(t.semanas, t.semana, duracion),
          order,
          party: t.party,
          type: "TASK",
          notes: notasDe(t),
          source: "HUMAN",
          status: t.estado,
          statusSource: "HUMAN",
          statusChangedAt: t.estado === "PENDING" ? null : ahora,
          actualStart: t.estado === "PENDING" ? null : semana(FASE.desde + t.semana),
          actualEnd: t.estado === "DONE" ? semana(FASE.desde + t.semana + t.semanas) : null,
        },
      });
    }
    await tx.projectTimeline.update({ where: { id: timelineId }, data: { lastEditedByHuman: ahora } });
  });
  console.log(`\n✓ Listo: plan con ${Object.keys(PROYECTOS).length} proyectos, la fase «${FASE.nombre}» y ${nuevas.length} tarea(s) nueva(s). No se publicó nada.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
