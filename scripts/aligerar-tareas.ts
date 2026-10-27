import "dotenv/config";
import "./lib/permitir-server-only";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { limpiezaDePorDecidir, sugerenciaDeCierre } from "@/lib/tareas/aligerar";
import { esLecturaDelSprint } from "@/lib/tareas/sprint";
import { ultimosToquesDePersonas } from "@/lib/tareas/toques";
import { esSeguimientoSueltoDelCliente, lineaDelSeguimientoAgrupado, pendienteDesdeLaTarea, seguimientoAgrupado } from "@/lib/tareas/seguimiento";
import { ORIGENES_DE_SUGERENCIA, agruparSeguimientosPorAsignar, cambiarEstado, decidirTarea, sugerenciasTocadas, vencerSugerenciasSinDecidir } from "@/lib/tareas/mutaciones";
import { MAX_SUGERENCIAS_POR_PERSONA } from "@/lib/tareas/reglas";
import { contextoDeTareas } from "@/lib/tareas/servidor";
import { clientesQueVesParaTareas } from "@/lib/tareas/clientes";
import { accionesDe } from "@/lib/tareas/estados";
import { comoFecha, hoyEnCostaRica, lunesDeHoy } from "@/lib/tareas/semana";

/**
 * scripts/aligerar-tareas.ts — lo que cambia DATOS de «Menos tareas a la vista» (2026-10-19; DECISIONS «Tareas
 * internas…» › «Menos tareas a la vista»). Lo demás (lo rápido plegado por cuenta, la sugerencia de cerrar) es pantalla.
 *
 *  A · Lo que ya pasó y nadie tocó (`sugerenciaDeCierre`): se lista con su motivo. Con `--apply --firma=<correo>` lo
 *      cierra ESA persona, solo lo que ella misma podría cerrar en la pantalla (su responsable, quien lidera el sprint o
 *      dirección): una abierta pasa a «Ya no se hará» con el motivo escrito; una propuesta, a «Descartada» con el motivo.
 *      Nunca lo cierra el sistema: sin `--firma` no se cierra nada.
 *  B · Los seguimientos de lo que prometió el cliente que ya entraron a «Por asignar» de un equipo, sueltos, de la misma
 *      reunión y cuenta: se juntan en UNO («Seguimiento con TEC: 4 cosas que prometió Andrea»), como ya se hace con las
 *      propuestas (scripts/agrupar-seguimientos-propuestos.ts). Solo los que ninguna persona tocó. Las sueltas quedan
 *      «Era otra tarea» en la nueva, firmadas por el sistema. Nada se borra.
 *  C · «Por decidir» (roadmap D2 etapa 1, 2026-10-27): las sugerencias de Nexus que nadie decidió ni tocó vencen, como
 *      `sistema` y con su motivo, si su fecha ya pasó o si la persona tiene más de MAX_SUGERENCIAS_POR_PERSONA (quedan las
 *      más nuevas). Es lo que haría el tope nuevo con la próxima reunión de cada uno, de una vez. Vencer no es una
 *      lápida: si se vuelve a hablar del tema, se vuelve a proponer. No pide `--firma`: lo propuso Nexus y lo vence Nexus.
 *      Lo que pidió una persona (o lo que una persona tocó: un evento, el pase incluido, un comentario, una dependencia, un
 *      vínculo) no.
 *
 *   npx tsx scripts/aligerar-tareas.ts                                                        (simulacro: solo lee)
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/aligerar-tareas.ts --apply --firma=avanegas@smarteamcr.com
 *   … --solo=cerrar | --solo=juntar | --solo=por-decidir                                      (una de las tres partes)
 */
const APPLY = resolverApply({ tablas: ["Tarea", "TareaEvento", "ResultadoDeSemana"] });
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
const FIRMA = arg("firma")?.toLowerCase() ?? null;
const SOLO = arg("solo");

async function cerrar() {
  const hoy = hoyEnCostaRica();
  const filas = await prisma.tarea.findMany({
    where: { archivadaAt: null, estado: { in: ["propuesta", "pendiente", "en_curso"] }, origen: { not: "hubspot" }, hubspotTaskId: null },
    select: { id: true, numero: true, titulo: true, minutosEstimados: true, estado: true, origen: true, venceEl: true, semana: true, createdAt: true, version: true, responsableEmail: true, equipo: true, creadaPorEmail: true, pedidaPorEmail: true },
    orderBy: { numero: "asc" },
  });
  const toques = await ultimosToquesDePersonas(filas.map((f) => f.id));
  const candidatas = filas
    .map((f) => ({
      f,
      s: sugerenciaDeCierre(
        { titulo: f.titulo, minutosEstimados: f.minutosEstimados, estado: f.estado, origen: f.origen, venceEl: comoFecha(f.venceEl), semana: comoFecha(f.semana), creadaAt: f.createdAt.toISOString(), ultimoToque: toques.get(f.id)?.toISOString() ?? null },
        hoy,
      ),
    }))
    .filter((x): x is { f: (typeof filas)[number]; s: NonNullable<typeof x.s> } => !!x.s);

  console.log(`A · Ya pasaron y nadie las tocó: ${candidatas.length}`);
  const porQuien = new Map<string, number>();
  for (const { f } of candidatas) porQuien.set(f.responsableEmail ?? `Por asignar · ${f.equipo}`, (porQuien.get(f.responsableEmail ?? `Por asignar · ${f.equipo}`) ?? 0) + 1);
  for (const [q, n] of porQuien) console.log(`  ${q}: ${n}`);
  for (const { f, s } of candidatas) console.log(`  T-${f.numero} · ${s.accion === "descartar" ? "Descartar" : "Ya no se hará"} · ${s.motivo}`);
  if (!APPLY) return;
  if (!FIRMA) {
    console.log("  Sin --firma no se cierra nada: lo confirma una persona.");
    return;
  }
  const tm = await prisma.teamMember.findFirst({ where: { email: FIRMA, deactivatedAt: null } });
  if (!tm) throw new Error(`--firma: ${FIRMA} no es alguien activo del equipo.`);
  const ctx = await contextoDeTareas({ teamMember: tm });
  const clientes = await clientesQueVesParaTareas(tm);
  let hechas = 0;
  let ajenas = 0;
  for (const { f, s } of candidatas) {
    const acc = accionesDe({ ...f, semana: comoFecha(f.semana) }, ctx, { lunesDeHoy: lunesDeHoy() });
    const puede = s.accion === "descartar" ? acc.decidir : acc.noSeHara;
    if (!puede) {
      ajenas++;
      continue;
    }
    try {
      if (s.accion === "descartar") await decidirTarea(ctx, clientes, f.id, f.version, { tipo: "rechazar", motivo: s.motivo });
      else await cambiarEstado(ctx, f.id, f.version, "no_se_hara", s.motivo);
      hechas++;
    } catch (e) {
      console.log(`  ⚠ T-${f.numero}: ${(e as Error).message}`);
    }
  }
  console.log(`  ✓ Cerradas por ${FIRMA}: ${hechas}. No le tocan (las decide su responsable): ${ajenas}.`);
}

async function juntar() {
  const filas = await prisma.tarea.findMany({
    where: { estado: "pendiente", responsableEmail: null, semana: null, archivadaAt: null, origenId: { contains: ":seg-c-" } },
    select: { id: true, numero: true, titulo: true, contexto: true, cita: true, venceEl: true, origenId: true, equipo: true, clientId: true, sessionId: true, client: { select: { name: true } } },
    orderBy: { numero: "asc" },
  });
  const toques = await ultimosToquesDePersonas(filas.map((f) => f.id));
  const sueltas = filas.filter((f) => esSeguimientoSueltoDelCliente(f.origenId) && !toques.has(f.id));
  const grupos = new Map<string, typeof sueltas>();
  for (const f of sueltas) {
    const clave = `${f.origenId!.slice(0, f.origenId!.indexOf(":seg-"))}|${f.equipo}|${f.clientId}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
  }
  const aJuntar = [...grupos.entries()].filter(([, g]) => g.length >= 2);
  const n = aJuntar.reduce((a, [, g]) => a + g.length, 0);
  console.log(`\nB · Seguimientos sueltos en «Por asignar» sin tocar: ${sueltas.length}. Se juntan ${n} en ${aJuntar.length} tareas (quedan ${sueltas.length - n} solos).`);
  let hechas = 0;
  for (const [clave, g] of aJuntar) {
    const [prefijo, equipo] = clave.split("|") as [string, string, string];
    const base = g[0]!;
    const inicio = base.sessionId ? (await prisma.firefliesSession.findUnique({ where: { id: base.sessionId }, select: { date: true } }))?.date : null;
    if (!inicio || prefijo.startsWith("cor:")) {
      console.log(`  ⚠ Sin la fecha de su reunión: no se junta (T-${g.map((x) => x.numero).join(", T-")}).`);
      continue;
    }
    const items = g.map((x) => pendienteDesdeLaTarea({ titulo: x.titulo, contexto: x.contexto, venceEl: comoFecha(x.venceEl), cita: x.cita }));
    const a = seguimientoAgrupado(items, { empresa: base.client?.name ?? null, inicio });
    console.log(`  · ${base.client?.name ?? "(sin cliente)"} · Por asignar ${equipo} · T-${g.map((x) => x.numero).join(", T-")}\n    → ${a.titulo}`);
    if (!APPLY) continue;
    const r = await agruparSeguimientosPorAsignar({ tareaIds: g.map((x) => x.id), origenId: `${prefijo}:${lineaDelSeguimientoAgrupado(`asignar:${equipo}`)}`, titulo: a.titulo, contexto: a.contexto, cita: a.cita, venceEl: a.venceEl }).catch((e: Error) => {
      console.log(`    ⚠ No se juntó: ${e.message}`);
      return null;
    });
    if (r) hechas++;
    else console.log("    ⚠ No se juntó: alguna cambió, o ya existe la que las junta.");
  }
  if (APPLY) console.log(`  ✓ Juntadas: ${hechas} de ${aJuntar.length}.`);
}

async function porDecidir() {
  const hoy = hoyEnCostaRica();
  const filas = await prisma.tarea.findMany({
    where: { estado: "propuesta", archivadaAt: null, creadaPorEmail: null, responsableEmail: { not: null }, origen: { in: [...ORIGENES_DE_SUGERENCIA] } },
    select: { id: true, numero: true, version: true, responsableEmail: true, venceEl: true, createdAt: true, lectura: { select: { resumen: true, fuente: { select: { equipo: true } } } } },
    orderBy: { numero: "asc" },
  });
  // La misma regla que al aplicar (`sugerenciasTocadas`): el número del simulacro es el que se aplica.
  const tocadas = await sugerenciasTocadas(prisma, filas.map((f) => f.id));
  const sinTocar = filas.filter((f) => !tocadas.has(f.id));
  const vencen = limpiezaDePorDecidir(
    sinTocar.map((f) => ({ id: f.id, numero: f.numero, responsableEmail: f.responsableEmail!, venceEl: comoFecha(f.venceEl), creadaAt: f.createdAt.toISOString(), delSprint: !!f.lectura && esLecturaDelSprint(f.lectura.fuente, f.lectura.resumen) })),
    hoy,
    MAX_SUGERENCIAS_POR_PERSONA,
  );
  const porId = new Map(filas.map((f) => [f.id, f]));
  console.log(
    `
C · «Por decidir»: ${filas.length} sugerencias de Nexus sin decidir (${filas.length - sinTocar.length} las tocó una persona y no se miran). ` +
      `Vencen ${vencen.length}: ${vencen.filter((v) => v.regla === "fecha").length} porque su fecha pasó y ${vencen.filter((v) => v.regla === "tope").length} por el tope de ${MAX_SUGERENCIAS_POR_PERSONA} por persona.`,
  );
  const porQuien = new Map<string, { antes: number; vencen: number }>();
  for (const f of filas) {
    const k = f.responsableEmail!;
    const x = porQuien.get(k) ?? { antes: 0, vencen: 0 };
    x.antes++;
    porQuien.set(k, x);
  }
  for (const v of vencen) porQuien.get(porId.get(v.id)!.responsableEmail!)!.vencen++;
  for (const [q, x] of [...porQuien].sort((a, b) => b[1].antes - a[1].antes)) console.log(`  ${q}: tenía ${x.antes} · vencen ${x.vencen} · le quedan ${x.antes - x.vencen}`);
  for (const v of vencen) console.log(`  T-${porId.get(v.id)!.numero} · ${v.regla === "fecha" ? "fecha" : "tope"} · ${v.motivo}`);
  if (!APPLY || !vencen.length) return;
  const n = await vencerSugerenciasSinDecidir(vencen.map((v) => ({ id: v.id, version: porId.get(v.id)!.version, motivo: v.motivo, regla: v.regla })));
  console.log(`  ✓ Vencidas: ${n} de ${vencen.length} (las demás cambiaron mientras tanto, o alguien las tocó).`);
}

async function main() {
  imprimirDestino();
  console.log(APPLY ? `=== APPLY (escribe${FIRMA ? `, firma ${FIRMA}` : ""}) ===` : "=== SIMULACRO (no escribe) ===");
  if (!SOLO || SOLO === "cerrar") await cerrar();
  if (!SOLO || SOLO === "juntar") await juntar();
  if (!SOLO || SOLO === "por-decidir") await porDecidir();
  if (!APPLY) console.log("\nSimulacro: no se escribió nada. Correrlo de nuevo con --apply no duplica nada.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
