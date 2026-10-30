import "dotenv/config";
import "./lib/permitir-server-only";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { whereBelongsToClient } from "@/lib/sessions/project-sources";
import { citaDeLaEvidencia, hablanteDeLaCita } from "@/lib/cs/cita-de-alerta";
import { hablanteDelEquipo } from "@/lib/seguimiento/hechos/salida";
import { AVISO_DEL_EQUIPO, comoAvisoDelEquipo } from "@/lib/cs/aviso-del-equipo";

/**
 * scripts/reclasificar-quejas-del-equipo.ts — las «quejas del cliente» abiertas cuya frase dijo alguien de Smarteam
 * pasan a «Aviso del equipo» (2026-10-29).
 *
 * El caso: en kölbi, la revisión de campañas del 26 oct dejó una QUEJA con la frase «ellos digamos que nos han
 * manifestado mucho que no hay una rutina…», que dijo Valentina Sandoval, de Smarteam. La regla que separa al equipo
 * del cliente pedía el nombre y el ÚLTIMO apellido, y en el equipo ella es «Valentina Sandoval Devia». Arreglada la
 * regla (`hablanteDelEquipo`), el código nuevo ya no levanta esas quejas; este script corrige las que ya están abiertas.
 *
 * Para cada QUEJA abierta con su frase de una reunión, verificada o no, busca el turno de la transcripción (la reunión
 * por el chokepoint de pertenencia: una de otro cliente no cuenta) y, si lo dijo alguien del equipo, la pasa a
 * AVISO_DEL_EQUIPO con el título y el porqué del aviso. La frase y quién la dijo quedan en la evidencia. Deja de pintar
 * el color.
 *
 *   npx tsx scripts/reclasificar-quejas-del-equipo.ts                       (simulacro: lista lo que cambiaría)
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/reclasificar-quejas-del-equipo.ts --apply   (escribe, con respaldo de CsAlert)
 *
 * ⛔ ORDEN: SIEMPRE DESPUÉS DEL DEPLOY. Necesita el valor AVISO_DEL_EQUIPO en la base (scripts/sql/2026-10-29-aviso-del-
 * equipo.sql), y el código tiene que conocerlo: el cliente Prisma viejo revienta al leer una fila con un valor de enum que
 * no conoce, y con él se cae Éxito del cliente. Para REVERTIR el deploy, ver el SQL de ese valor.
 *
 * Re-ejecutable.
 */
const APPLY = resolverApply({ tablas: ["CsAlert"] });

async function main() {
  imprimirDestino();
  console.log(APPLY ? "=== APPLY (escribe) ===" : "=== SIMULACRO (no escribe) ===");
  const [quejas, equipo] = await Promise.all([
    prisma.csAlert.findMany({
      where: { category: "QUEJA", status: { in: ["OPEN", "SEEN"] } },
      select: { id: true, clientId: true, title: true, reason: true, dedupeKey: true, evidence: true, client: { select: { name: true } } },
      orderBy: { lastDetectedAt: "desc" },
    }),
    prisma.teamMember.findMany({ select: { name: true } }).then((t) => t.map((x) => x.name).filter((n): n is string => !!n?.trim())),
  ]);
  console.log(`\nQuejas abiertas: ${quejas.length}.`);

  const cambios: Array<{ id: string; cliente: string; antes: string; hablante: string; data: Parameters<typeof prisma.csAlert.update>[0]["data"] }> = [];
  for (const q of quejas) {
    const evidencia = q.evidence && typeof q.evidence === "object" && !Array.isArray(q.evidence) ? (q.evidence as Record<string, unknown>) : {};
    const cita = citaDeLaEvidencia(q.evidence);
    // Las que el vigía ya vio en el turno de alguien del equipo quedaron sin verificar: siguen diciendo «queja».
    const sinVerificar = typeof evidencia.citaSinVerificar === "string" ? evidencia.citaSinVerificar : null;
    const frase = cita?.fuente === "reunion" ? cita.texto : sinVerificar;
    const reuniones = cita?.fuente === "reunion" ? [cita.id] : Array.isArray(evidencia.sessionIds) ? evidencia.sessionIds.filter((x): x is string => typeof x === "string") : [];
    if (!frase || reuniones.length === 0) continue;
    const sesiones = await prisma.firefliesSession.findMany({
      where: { AND: [whereBelongsToClient(q.clientId), { id: { in: reuniones } }] },
      select: { id: true, title: true, date: true, transcript: true },
    });
    const dicha = sesiones.flatMap((s) => {
      const quien = hablanteDeLaCita(frase, s.transcript);
      return quien && hablanteDelEquipo(quien, equipo) === true ? [{ s, quien }] : [];
    })[0];
    if (!dicha) continue;
    const { s, quien: hablante } = dicha;
    const aviso = comoAvisoDelEquipo({ category: "QUEJA", title: q.title, reason: q.reason }, hablante, frase);
    const { citaSinVerificar: _vieja, ...resto } = evidencia;
    void _vieja;
    const citaGuardada = cita ?? { texto: frase, fuente: "reunion", id: s.id, fecha: s.date.toISOString().slice(0, 10), titulo: s.title };
    // La llave cambia de categoría y conserva su frase: una por cita, como la queja (`llaveDelVigia`).
    const dedupeKey = q.dedupeKey.replace(":QUEJA:", `:${AVISO_DEL_EQUIPO}:`);
    cambios.push({
      id: q.id,
      cliente: q.client.name,
      antes: q.title,
      hablante,
      data: {
        category: AVISO_DEL_EQUIPO,
        title: aviso.title,
        reason: aviso.reason,
        suggestedAction: aviso.suggestedAction,
        dedupeKey,
        evidence: { ...resto, cita: { ...citaGuardada, verificada: true, dichaPor: hablante } },
      },
    });
  }

  console.log(`Dichas por alguien de Smarteam: ${cambios.length}.`);
  for (const c of cambios) console.log(`\n  ${c.cliente} · lo dijo ${c.hablante}\n    antes: ${c.antes}\n    ahora: ${String(c.data.title)}`);
  if (cambios.length === 0) {
    console.log("\n✓ Nada que reclasificar.");
    return;
  }
  if (!APPLY) {
    console.log("\nPara aplicarlo, SIEMPRE después del deploy: ALLOW_PROD_WRITE=1 npx tsx scripts/reclasificar-quejas-del-equipo.ts --apply");
    return;
  }
  for (const c of cambios) await prisma.csAlert.update({ where: { id: c.id }, data: c.data });
  console.log(`\n✓ ${cambios.length} queja(s) pasaron a «Aviso del equipo».`);
}

main()
  .catch((e) => {
    console.error("reclasificar-quejas-del-equipo:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
