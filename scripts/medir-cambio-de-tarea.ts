/**
 * scripts/medir-cambio-de-tarea.ts — cuánto tarda cada parte de marcar una tarea como hecha (2026-10-19; DECISIONS
 * «Tareas internas…» › «Marcar hecha al instante»).
 *
 * Mide, contra la base que diga el .env y con la conexión en SOLO LECTURA: preparar el pedido (contexto y clientes),
 * leer la tarea, una consulta suelta (la latencia de la base), lo que devuelve el PATCH (`cargarTarea`) y lo que la
 * pantalla volvía a pedir entero después (`cargarMisTareas`). La transacción que escribe no se puede medir así: se estima
 * con la latencia (cada consulta de la transacción es un viaje).
 *
 *   npx tsx scripts/medir-cambio-de-tarea.ts --tarea 162
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");

const i = process.argv.indexOf("--tarea");
const NUMERO = i > 0 ? Number(process.argv[i + 1]) : 162;

async function tiempo<T>(nombre: string, fn: () => Promise<T>, filas: [string, number][]): Promise<T> {
  const t0 = performance.now();
  const r = await fn();
  filas.push([nombre, Math.round(performance.now() - t0)]);
  return r;
}

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { contextoDeTareas } = await import("@/lib/tareas/servidor");
  const { clientesQueVesParaTareas } = await import("@/lib/tareas/clientes");
  const { cargarTarea, cargarMisTareas } = await import("@/lib/tareas/consultas");
  const { tareasDisponible } = await import("@/lib/tareas/servidor");

  const tarea = await prisma.tarea.findFirst({ where: { numero: NUMERO }, select: { id: true, responsableEmail: true, hubspotTaskId: true } });
  if (!tarea?.responsableEmail) throw new Error(`T-${NUMERO} no existe o no tiene responsable.`);
  const tm = await prisma.teamMember.findFirst({ where: { email: { equals: tarea.responsableEmail, mode: "insensitive" } } });
  if (!tm) throw new Error("Su responsable no está en el equipo.");

  for (const vuelta of [1, 2]) {
    const filas: [string, number][] = [];
    await tiempo("una consulta suelta (latencia)", () => prisma.$queryRaw`SELECT 1`, filas);
    await tiempo("¿está el SQL de Tareas?", () => tareasDisponible(), filas);
    const ctx = await tiempo("contexto de quien pide", () => contextoDeTareas({ teamMember: tm }), filas);
    const clientes = await tiempo("clientes que ve", () => clientesQueVesParaTareas(tm), filas);
    await tiempo("leer la tarea (cargar)", () => prisma.tarea.findUnique({ where: { id: tarea.id } }), filas);
    await tiempo("lo que devuelve el PATCH (cargarTarea)", () => cargarTarea(ctx, clientes, tarea.id), filas);
    await tiempo("Mis tareas entero (cargarMisTareas)", () => cargarMisTareas(ctx, clientes), filas);
    console.log(`\nVuelta ${vuelta} · T-${NUMERO}${tarea.hubspotTaskId ? " (de HubSpot)" : ""}`);
    for (const [n, ms] of filas) console.log(`  ${String(ms).padStart(6)} ms  ${n}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
