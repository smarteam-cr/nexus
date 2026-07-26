/**
 * scripts/ver-tipos-de-sesion.ts  (SOLO LECTURA — no escribe nada)
 *
 * Muestra CÓMO clasifica Nexus las reuniones de un cliente con el vocabulario nuevo
 * (lib/sessions/session-type.ts), y de qué escalón salió cada lectura.
 *
 * Existe porque la capa del tipo de sesión es cimiento: no tiene todavía ninguna
 * pantalla donde verse. Esto la hace mirable antes de conectarla, que es cuándo
 * conviene descubrir que el vocabulario no sirve.
 *
 *   npx tsx scripts/ver-tipos-de-sesion.ts                  # los 8 clientes con más sesiones
 *   npx tsx scripts/ver-tipos-de-sesion.ts "Wherex"         # un cliente por nombre
 *   npx tsx scripts/ver-tipos-de-sesion.ts "Wherex" --todas # con el detalle reunión por reunión
 */
import { createScriptDb } from "./lib/db";
import { isSalesMember, isCseMember } from "@/lib/sessions/areas";
import {
  resolveSessionType,
  SESSION_TYPE_LABEL,
  type SessionType,
} from "@/lib/sessions/session-type";

// Presupuesto de conexiones ACOTADO (scripts/lib/db.ts): el pooler comparte ~15 slots
// con producción y las dos PCs de dev; un pool sin tope se comía 10 él solo.
const { prisma, close } = createScriptDb();

const FUENTE_LABEL: Record<string, string> = {
  manual: "corregido a mano",
  titulo: "el título",
  participantes: "quién estaba",
  minuta: "la minuta",
  ia: "la IA",
};

async function main() {
  const filtroNombre = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
  const conDetalle = process.argv.includes("--todas");

  // Equipo: quién es interno, quién es de Ventas y quién de entrega.
  const equipo = await prisma.teamMember.findMany({ select: { email: true, area: true, roleEnum: true } });
  const internalEmails = new Set(equipo.map((m) => m.email.toLowerCase()));
  const salesEmails = new Set(equipo.filter(isSalesMember).map((m) => m.email.toLowerCase()));
  const deliveryEmails = new Set(
    equipo.filter((m) => isCseMember(m) || m.roleEnum === "DEV").map((m) => m.email.toLowerCase()),
  );
  console.log(
    `Equipo: ${equipo.length} personas · ${salesEmails.size} de Ventas · ${deliveryEmails.size} de entrega\n`,
  );

  const clientes = await prisma.client.findMany({
    where: filtroNombre ? { name: { contains: filtroNombre, mode: "insensitive" } } : {},
    select: { id: true, name: true },
  });
  if (clientes.length === 0) return console.log(`Sin clientes que coincidan con "${filtroNombre}".`);

  // Ordenados por volumen de material, que es lo que hace interesante el reporte.
  const conVolumen = await Promise.all(
    clientes.map(async (c) => ({
      ...c,
      n: await prisma.firefliesSession.count({ where: { resolvedClientId: c.id, transcript: { not: null } } }),
    })),
  );
  const objetivo = conVolumen.filter((c) => c.n > 0).sort((a, b) => b.n - a.n).slice(0, filtroNombre ? 5 : 8);

  const totalGlobal: Partial<Record<SessionType, number>> = {};
  const fuenteGlobal: Record<string, number> = {};

  for (const cliente of objetivo) {
    const sesiones = await prisma.firefliesSession.findMany({
      where: { resolvedClientId: cliente.id, transcript: { not: null } },
      orderBy: { date: "asc" },
      select: {
        title: true, date: true, participants: true, organizerEmail: true,
        minute: { select: { summary: true } },
      },
    });

    const porTipo: Partial<Record<SessionType, number>> = {};
    const filas: string[] = [];
    for (const s of sesiones) {
      const r = resolveSessionType({
        title: s.title,
        participants: s.participants,
        organizerEmail: s.organizerEmail,
        internalEmails, salesEmails, deliveryEmails,
        minuteSummary: s.minute?.summary ?? null,
      });
      porTipo[r.type] = (porTipo[r.type] ?? 0) + 1;
      totalGlobal[r.type] = (totalGlobal[r.type] ?? 0) + 1;
      const f = r.source ?? "nada";
      fuenteGlobal[f] = (fuenteGlobal[f] ?? 0) + 1;
      if (conDetalle) {
        filas.push(
          `    ${s.date.toISOString().slice(0, 10)}  ${SESSION_TYPE_LABEL[r.type].padEnd(15)}` +
            `${(FUENTE_LABEL[f] ?? "—").padEnd(18)}${s.title.slice(0, 60)}`,
        );
      }
    }

    const resumen = Object.entries(porTipo)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${SESSION_TYPE_LABEL[k as SessionType]} ${v}`)
      .join(" · ");
    console.log(`■ ${cliente.name} — ${sesiones.length} reuniones con transcripción`);
    console.log(`   ${resumen}`);
    if (conDetalle) filas.forEach((f) => console.log(f));
    console.log();
  }

  const total = Object.values(totalGlobal).reduce((a, b) => a + b, 0);
  const sinDeterminar = totalGlobal.otra ?? 0;
  console.log("─".repeat(70));
  console.log(`TOTAL ${total} reuniones · reconocidas ${total - sinDeterminar} (${Math.round(((total - sinDeterminar) / total) * 100)}%) · sin determinar ${sinDeterminar}`);
  console.log("Por escalón: " + Object.entries(fuenteGlobal).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${FUENTE_LABEL[k] ?? k}=${v}`).join(" · "));
}

main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => close());
