/**
 * scripts/mover-tareas-de-proyecto.ts — one-off: mudar las tareas vivas de un proyecto a otro.
 *
 * El caso que lo motivó: el agente post-sesión escribió 6 tareas de la reunión "CAV: Avanzando
 * con Smarteam" contra un proyecto de PRUEBA de Smarteam, aunque la reunión es de Club de
 * Amantes del Vino y ese cliente tiene su propio proyecto activo. Borrar el proyecto de prueba
 * las habría dejado con `projectId = NULL` (la FK es SetNull), y ahí desaparecen de todas las
 * pantallas —que consultan por proyecto— salvo la ficha de la sesión.
 *
 * ⚠ Mueve `clientId` ADEMÁS de `projectId`. Son dos columnas distintas y la de cliente es la que
 * usan los listados por cliente; dejar la vieja apuntando a Smarteam sería mudar la tarea a
 * medias y que aparezca bajo el cliente equivocado.
 */
import "dotenv/config";
import { assertProdWriteAllowed } from "./lib/guard";
import { createScriptDb } from "./lib/db";

const APPLY = process.argv.includes("--apply");
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

(async () => {
  const desde = arg("desde");
  const hacia = arg("hacia");
  if (!desde || !hacia) throw new Error("Uso: --desde=<projectId> --hacia=<projectId> [--apply]");
  if (APPLY) assertProdWriteAllowed();
  const { prisma, close } = createScriptDb();

  const [origen, destino] = await Promise.all([
    prisma.project.findUnique({ where: { id: desde }, select: { id: true, name: true, clientId: true } }),
    prisma.project.findUnique({ where: { id: hacia }, select: { id: true, name: true, clientId: true, status: true } }),
  ]);
  if (!origen) throw new Error(`No existe el proyecto de origen ${desde}`);
  if (!destino) throw new Error(`No existe el proyecto de destino ${hacia}`);
  if (destino.status !== "active") throw new Error(`El destino "${destino.name}" no está activo. Mover ahí las escondería igual.`);

  const [cOrigen, cDestino] = await Promise.all([
    prisma.client.findUnique({ where: { id: origen.clientId }, select: { name: true } }),
    prisma.client.findUnique({ where: { id: destino.clientId }, select: { name: true } }),
  ]);

  const tareas = await prisma.actionItem.findMany({
    where: { projectId: desde, done: false, deletedAt: null },
    select: { id: true, text: true, ownerEmail: true },
  });

  console.log(`\n=== ${APPLY ? "APPLY (escribe)" : "DRY-RUN (no escribe)"} ===`);
  console.log(`desde:  "${origen.name}"  (cliente: ${cOrigen?.name})`);
  console.log(`hacia:  "${destino.name}"  (cliente: ${cDestino?.name})`);
  console.log(`tareas vivas a mover: ${tareas.length}`);
  tareas.forEach((t) => console.log(`  · ${t.text.slice(0, 95)}${t.text.length > 95 ? "…" : ""}  [${t.ownerEmail ?? "sin dueño"}]`));
  if (origen.clientId !== destino.clientId) {
    console.log(`\n⚠ Cambian de CLIENTE: ${cOrigen?.name} → ${cDestino?.name}. Se actualizan las dos columnas.`);
  }

  if (!APPLY) {
    console.log(`\nPara aplicar: ALLOW_PROD_WRITE=1 npx tsx scripts/mover-tareas-de-proyecto.ts --desde=${desde} --hacia=${hacia} --apply`);
    await close();
    return;
  }
  if (tareas.length === 0) { console.log("Nada que mover."); await close(); return; }

  const r = await prisma.actionItem.updateMany({
    where: { id: { in: tareas.map((t) => t.id) } },
    data: { projectId: destino.id, clientId: destino.clientId },
  });
  console.log(`\n✓ ${r.count} tarea(s) movida(s) a "${destino.name}".`);

  const quedan = await prisma.actionItem.count({ where: { projectId: desde, done: false, deletedAt: null } });
  console.log(`  El origen queda con ${quedan} tarea(s) viva(s).`);
  await close();
})();
