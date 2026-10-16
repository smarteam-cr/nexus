/**
 * lib/mi-dia/cartera-server.ts — la cartera del CSE en «Para ti» (etapa 4c de docs/mi-dia-plan.md): las cuentas de los
 * proyectos donde es el CSE encargado (`Alcance.proyectos`, lib/para-ti/alcance-server.ts), con el siguiente paso de CS
 * de cada una y sus tickets abiertos. Solo lectura.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { pasosVigentes } from "@/lib/siguiente-paso/lectura-server";
import type { SiguientePasoVisto } from "@/lib/siguiente-paso/reglas";
import type { Alcance } from "@/lib/para-ti/alcance-server";

export interface CuentaDelCse {
  clientId: string;
  empresa: string;
  proyectos: { id: string; nombre: string }[];
  /** El siguiente paso de CS de la cuenta o de alguno de sus proyectos: el que vence antes. */
  paso: SiguientePasoVisto | null;
  ticketsAbiertos: number;
}

export async function carteraDelCse(alcance: Alcance, hoyISO: string): Promise<CuentaDelCse[]> {
  const porCliente = new Map<string, CuentaDelCse>();
  for (const p of alcance.proyectos) {
    const c = porCliente.get(p.clientId) ?? { clientId: p.clientId, empresa: p.empresa, proyectos: [], paso: null, ticketsAbiertos: 0 };
    c.proyectos.push({ id: p.id, nombre: p.name });
    porCliente.set(p.clientId, c);
  }
  const cuentas = [...porCliente.values()];
  if (cuentas.length === 0) return [];

  const [pasos, tickets] = await Promise.all([
    pasosVigentes([
      ...cuentas.map((c) => ({ objeto: "empresa" as const, objetoId: c.clientId })),
      ...cuentas.flatMap((c) => c.proyectos.map((p) => ({ objeto: "proyecto" as const, objetoId: p.id }))),
    ]).catch(() => []),
    modeloDisponible(prisma.ticketDeHubspot)
      ? prisma.ticketDeHubspot
          .groupBy({ by: ["clientId"], where: { clientId: { in: cuentas.map((c) => c.clientId) }, abierto: true, vigente: true }, _count: { _all: true } })
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const ticketsDe = new Map(tickets.map((t) => [t.clientId, t._count._all]));
  const deCs = pasos.filter((p) => p.equipo === "cs");
  for (const c of cuentas) {
    const ids = new Set([c.clientId, ...c.proyectos.map((p) => p.id)]);
    const suyos = deCs.filter((p) => ids.has(p.objetoId)).sort((a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999"));
    c.paso = suyos[0] ?? null;
    c.ticketsAbiertos = ticketsDe.get(c.clientId) ?? 0;
  }
  // Primero lo que pide algo: sin siguiente paso o vencido; después por fecha del paso; después por nombre.
  const peso = (c: CuentaDelCse) => (!c.paso ? 0 : c.paso.fecha && c.paso.fecha < hoyISO ? 1 : 2);
  return cuentas.sort((a, b) => peso(a) - peso(b) || (a.paso?.fecha ?? "9999").localeCompare(b.paso?.fecha ?? "9999") || a.empresa.localeCompare(b.empresa));
}
