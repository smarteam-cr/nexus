/**
 * scripts/a-quien-le-llegan-las-propuestas.ts — ¿a quién le llegan las propuestas que salen de las reuniones y los avisos
 * de las 48 horas? (2026-10-20; DECISIONS «Lo que sale de una reunión le llega a quien le toca»). SOLO LECTURA.
 *
 *   1. Por cada lectura de seguimiento de los últimos N días (14 por defecto), vuelve a repartir sus compromisos CON LA
 *      REGLA DE HOY (`elegirLoEsencial` + `armarPropuestasDeSeguimiento`, sin llamar al modelo: lee la salida guardada en
 *      su `AgentRun`) y lo compara con a quién le llegó cada propuesta VIVA (por decidir, o «Por asignar» sin tomar).
 *   2. El aviso de las 48 horas de «Para ti» para cada persona del equipo: cuántos son de una propuesta de OTRA persona
 *      (lo que le pasó a Valentina Sandoval con T-117 de kölbi) con la regla de antes y con la de hoy.
 *
 * Imprime títulos de tareas (interno) y nada de las citas.
 *
 *   npx tsx scripts/a-quien-le-llegan-las-propuestas.ts
 *   npx tsx scripts/a-quien-le-llegan-las-propuestas.ts --dias 14
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
process.env.DB_POOL_MAX ??= "3";

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DIAS = Number(arg("--dias") ?? 14);

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { describirDestino } = await import("./lib/guard");
  const { miembrosActivos } = await import("@/lib/tareas/servidor");
  const { armarPropuestasDeSeguimiento, elegirLoEsencial, lineaDeSeguimiento } = await import("@/lib/tareas/seguimiento");
  const { cseDelProyecto, cseDeLaCuenta, negocioDeLaCuenta, responsableDeLaPreventaViva } = await import("@/lib/lecturas/personas");
  const { rutaDeLaLectura } = await import("@/lib/lecturas/reglas");
  const { duenoDeLaSesion } = await import("@/lib/sessions/project-sources");
  const desde = new Date(Date.now() - DIAS * 86_400_000);
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · SOLO LECTURA · lecturas desde ${desde.toISOString().slice(0, 10)}\n`);

  const miembros = await miembrosActivos();
  const nombre = new Map(miembros.map((m) => [m.email.toLowerCase(), m.nombre]));
  const quien = (e: string | null) => (e ? (nombre.get(e) ?? e) : "Por asignar");

  // ── 1. Las propuestas vivas de las reuniones, contra la regla de hoy ──────────────────────────────────────────────
  const corridas = await prisma.agentRun.findMany({
    where: { agentId: "agent-post-session", status: "DONE", createdAt: { gte: desde } },
    select: { id: true, output: true, sourceSessionIds: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const vistas = new Set<string>();
  let lecturas = 0;
  let comparadas = 0;
  const distintas: string[] = [];
  for (const run of corridas) {
    const sessionId = run.sourceSessionIds[0];
    if (!sessionId || vistas.has(sessionId)) continue; // la corrida más nueva de cada reunión
    vistas.add(sessionId);
    let salida: { compromisos?: unknown[] } | null = null;
    try {
      salida = (JSON.parse(String(run.output ?? "null")) as { salida?: { compromisos?: unknown[] } } | null)?.salida ?? null;
    } catch {
      continue;
    }
    if (!salida?.compromisos?.length) continue;
    const [s, lectura] = await Promise.all([
      prisma.firefliesSession.findUnique({
        where: { id: sessionId },
        select: { title: true, date: true, participants: true, transcript: true, resolvedClientId: true, manualClientId: true },
      }),
      prisma.lecturaDeReunion.findUnique({ where: { sessionId }, select: { id: true, equipo: true } }),
    ]);
    const duenoId = s ? duenoDeLaSesion(s) : null;
    const cliente = duenoId ? await prisma.client.findUnique({ where: { id: duenoId }, select: { id: true, name: true, kind: true } }) : null;
    const ruta = rutaDeLaLectura(cliente?.kind);
    if (!s || !lectura || !cliente || !ruta) continue;
    lecturas++;
    const tareas = await prisma.tarea.findMany({
      where: { lecturaId: lectura.id, origenId: { startsWith: `l:${lectura.id}:seg-` } },
      select: { id: true, numero: true, titulo: true, estado: true, responsableEmail: true, equipo: true, origenId: true, mismaQueId: true, projectId: true },
    });
    const porId = new Map(tareas.map((t) => [t.id, t]));
    const porOrigen = new Map(tareas.map((t) => [t.origenId, t]));
    const projectId = tareas.find((t) => t.projectId)?.projectId ?? null;
    const [cseP, cseC, preventa, negocio] = await Promise.all([
      ruta === "completa" ? cseDelProyecto(projectId) : Promise.resolve(null),
      ruta === "completa" && !projectId ? cseDeLaCuenta(cliente.id) : Promise.resolve(null),
      ruta === "prospecto" ? responsableDeLaPreventaViva(cliente.id) : Promise.resolve(undefined),
      ruta === "completa" ? negocioDeLaCuenta(cliente.id) : Promise.resolve(undefined),
    ]);
    const { quedan } = elegirLoEsencial(salida.compromisos as Parameters<typeof elegirLoEsencial>[0]);
    for (const c of quedan) {
      // Uno por uno: sin juntar lo del cliente, así cada compromiso dice a quién va.
      const [p] = armarPropuestasDeSeguimiento({
        compromisos: [c],
        lectura,
        reunion: { id: sessionId, inicio: s.date, participantes: s.participants.map((x) => x.toLowerCase()), transcripcion: s.transcript },
        miembros,
        cseDelProyecto: cseP,
        cseDeLaCuenta: cseC,
        ...(ruta === "prospecto" ? { responsableDeLaPreventa: preventa } : {}),
        ...(negocio ? { negocio } : {}),
        clientId: cliente.id,
        empresa: cliente.name,
        projectId,
        ruta,
      }).propuestas;
      if (!p) continue;
      // La tarea viva de ese compromiso: la suelta, o la que la junta.
      let t = porOrigen.get(`l:${lectura.id}:${lineaDeSeguimiento(c)}`);
      if (t?.estado === "fusionada" && t.mismaQueId) t = porId.get(t.mismaQueId);
      if (!t) continue;
      const viva = t.estado === "propuesta" || (t.estado === "pendiente" && !t.responsableEmail);
      if (!viva) continue;
      comparadas++;
      const hoy = p.responsableEmail ?? `asignar:${p.equipo}`;
      const antes = t.responsableEmail ?? `asignar:${t.equipo}`;
      if (hoy === antes) continue;
      distintas.push(
        `T-${t.numero} · ${cliente.name} · «${s.title}» · ${quien(t.responsableEmail)}${t.responsableEmail ? "" : ` (${t.equipo})`} → ${quien(p.responsableEmail)}${p.responsableEmail ? "" : ` (${p.equipo})`}\n     ${t.titulo}`,
      );
    }
  }
  console.log(`1. Reuniones: ${lecturas} lecturas con compromisos · ${comparadas} compromisos con su propuesta viva · ${distintas.length} le llegaron a otra persona que la que dice la regla de hoy`);
  for (const d of distintas) console.log(`   ${d}`);

  // ── 2. El aviso de las 48 horas, antes y ahora ────────────────────────────────────────────────────────────────────
  const { compromisosSinAgendar } = await import("@/lib/comunicaciones/sin-agendar-server");
  const { leTocaElAviso } = await import("@/lib/comunicaciones/sin-agendar");
  const { alcanceDe } = await import("@/lib/para-ti/alcance-server");
  const todos = await compromisosSinAgendar({ calendarioDe: async () => null });
  const equipo = await prisma.teamMember.findMany({ where: { deactivatedAt: null } });
  const prospectos = new Set(
    (await prisma.client.findMany({ where: { id: { in: [...new Set(todos.map((x) => x.tarea.clientId))] }, kind: "PROSPECTO" }, select: { id: true } })).map((c) => c.id),
  );
  let ajenasAntes = 0;
  let ajenasAhora = 0;
  let propiasQueNoLlegaban = 0;
  console.log(`\n2. Avisos de las 48 horas hoy: ${todos.length} compromisos`);
  for (const tm of equipo) {
    const a = await alcanceDe(tm);
    const email = a.email.toLowerCase();
    const cuentas = new Set(a.proyectos.filter((p) => p.encargado).map((p) => p.clientId));
    // La regla de antes: todo lo de las cuentas que lleva, y lo propio solo en un prospecto.
    const antes = todos.filter((x) => cuentas.has(x.tarea.clientId) || (x.tarea.responsableEmail === email && prospectos.has(x.tarea.clientId)));
    const ahora = todos.filter((x) => leTocaElAviso(x.tarea, email, cuentas));
    const ajenas = (xs: typeof todos) => xs.filter((x) => x.tarea.responsableEmail !== email);
    const deOtro = (xs: typeof todos) => xs.filter((x) => x.tarea.responsableEmail && x.tarea.responsableEmail !== email);
    ajenasAntes += deOtro(antes).length;
    ajenasAhora += deOtro(ahora).length;
    propiasQueNoLlegaban += ahora.filter((x) => x.tarea.responsableEmail === email && !antes.includes(x)).length;
    if (!antes.length && !ahora.length) continue;
    console.log(`   ${tm.name}: antes ${antes.length} (${deOtro(antes).length} de otra persona) · ahora ${ahora.length} (${deOtro(ahora).length} de otra persona, ${ajenas(ahora).length - deOtro(ahora).length} por asignar de CS)`);
    for (const x of deOtro(antes)) console.log(`      ✗ ya no: T-${x.tarea.numero} ${x.empresa} · de ${quien(x.tarea.responsableEmail)} · ${x.tarea.titulo.slice(0, 90)}`);
    for (const x of ahora.filter((y) => !antes.includes(y))) console.log(`      ✓ ahora sí: T-${x.tarea.numero} ${x.empresa} · ${x.tarea.titulo.slice(0, 90)}`);
  }
  console.log(`   Total: avisos de una propuesta de otra persona ${ajenasAntes} → ${ajenasAhora} · propios que no llegaban y ahora sí: ${propiasQueNoLlegaban}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
