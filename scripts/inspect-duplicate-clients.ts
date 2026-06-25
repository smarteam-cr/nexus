import "dotenv/config";
import { prisma } from "@/lib/db/prisma";

/**
 * scripts/inspect-duplicate-clients.ts   (READ-ONLY — no escribe nada)
 *
 * Censo de los pares de `Client` DUPLICADOS (misma empresa, dos registros) para
 * planear el merge. Para cada grupo de clientes que matchea un término de búsqueda:
 *   - lista cada Client (id, nombre, company, hubspotCompanyId, emailDomains, createdAt)
 *   - cuenta TODO lo que cuelga de él (sesiones por resolvedClientId/manualClientId +
 *     todas las relaciones hard-FK del schema)
 *   - sugiere el CANÓNICO (más sesiones+proyectos; desempate por dependientes totales)
 *   - flaguea conflictos de merge (HubspotAccount 1:1 en ambos, hubspotCompanyId distinto,
 *     StageNote/ClientAssignment con unique compartida)
 *
 * No modifica NADA. Es el paso previo a scripts/merge-duplicate-clients.ts.
 *   npx tsx scripts/inspect-duplicate-clients.ts
 */

// Términos de búsqueda — uno por empresa con registros duplicados.
const GROUPS = ["bluesat", "economía", "economia", "minec", "cicadex", "construtecho"];

type Census = {
  id: string;
  name: string;
  company: string | null;
  industry: string | null;
  hubspotCompanyId: string | null;
  emailDomains: string[];
  logoUrl: string | null;
  hasCanvas: boolean;
  createdAt: Date;
  sessionsResolved: number;
  sessionsManual: number;
  projects: number;
  agentRuns: number;
  contextCards: number;
  canvasSuggestions: number;
  actionItems: number;
  audits: number;
  implementations: number;
  knowledge: number;
  documents: number;
  stageNotes: number;
  assignments: number;
  appUsers: number;
  handoffs: number;
  hubspotAccount: { id: string; isSystem: boolean; hubspotPortalId: string } | null;
};

/** Peso para elegir canónico (lo que pidió el usuario: más sesiones/proyectos). */
function canonicalScore(c: Census): number {
  return c.sessionsResolved + c.sessionsManual + c.projects;
}
/** Desempate: dependientes totales. */
function totalDependents(c: Census): number {
  return (
    c.sessionsResolved + c.sessionsManual + c.projects + c.agentRuns + c.contextCards +
    c.canvasSuggestions + c.actionItems + c.audits + c.implementations + c.knowledge +
    c.documents + c.stageNotes + c.assignments + c.appUsers + c.handoffs +
    (c.hubspotAccount ? 1 : 0)
  );
}

async function censusFor(clientId: string): Promise<Omit<Census, "id" | "name" | "company" | "industry" | "hubspotCompanyId" | "emailDomains" | "logoUrl" | "hasCanvas" | "createdAt">> {
  const [
    sessionsResolved, sessionsManual, counts, hubspotAccount,
  ] = await Promise.all([
    prisma.firefliesSession.count({ where: { resolvedClientId: clientId } }),
    prisma.firefliesSession.count({ where: { manualClientId: clientId } }),
    prisma.client.findUnique({
      where: { id: clientId },
      select: {
        _count: {
          select: {
            projects: true, agentRuns: true, contextCards: true, canvasSuggestions: true,
            actionItems: true, audits: true, implementations: true, knowledge: true,
            documents: true, stageNotes: true, assignments: true, appUsers: true, handoffs: true,
          },
        },
      },
    }),
    prisma.hubspotAccount.findUnique({
      where: { clientId },
      select: { id: true, isSystem: true, hubspotPortalId: true },
    }),
  ]);
  const k = counts!._count;
  return {
    sessionsResolved, sessionsManual,
    projects: k.projects, agentRuns: k.agentRuns, contextCards: k.contextCards,
    canvasSuggestions: k.canvasSuggestions, actionItems: k.actionItems, audits: k.audits,
    implementations: k.implementations, knowledge: k.knowledge, documents: k.documents,
    stageNotes: k.stageNotes, assignments: k.assignments, appUsers: k.appUsers, handoffs: k.handoffs,
    hubspotAccount,
  };
}

async function main() {
  console.log("READ-ONLY — censo de Clients duplicados (no escribe nada)\n");

  // Buscar y deduplicar por id todos los clientes que matchean algún término.
  const found = new Map<string, { id: string; name: string }>();
  for (const term of GROUPS) {
    const rows = await prisma.client.findMany({
      where: { name: { contains: term, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    for (const r of rows) found.set(r.id, r);
  }

  // Agrupar por "empresa" usando un prefijo normalizado del nombre.
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const groupKeyOf = (name: string): string => {
    const n = norm(name);
    if (n.includes("bluesat")) return "Bluesat";
    if (n.includes("economia") || n.includes("minec")) return "Ministerio de Economía";
    if (n.includes("cicadex")) return "Cicadex";
    if (n.includes("construtecho")) return "Construtecho";
    return `(otro) ${name}`;
  };

  const groups = new Map<string, { id: string; name: string }[]>();
  for (const r of found.values()) {
    const key = groupKeyOf(r.name);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  for (const [groupName, members] of [...groups.entries()].sort()) {
    // Censo completo de cada miembro.
    const full: Census[] = [];
    for (const m of members) {
      const meta = await prisma.client.findUnique({
        where: { id: m.id },
        select: {
          id: true, name: true, company: true, industry: true, hubspotCompanyId: true,
          emailDomains: true, logoUrl: true, canvas: true, createdAt: true,
        },
      });
      const census = await censusFor(m.id);
      full.push({
        id: meta!.id, name: meta!.name, company: meta!.company, industry: meta!.industry,
        hubspotCompanyId: meta!.hubspotCompanyId, emailDomains: meta!.emailDomains,
        logoUrl: meta!.logoUrl, hasCanvas: meta!.canvas != null, createdAt: meta!.createdAt,
        ...census,
      });
    }
    // Ordenar por score canónico desc (el [0] es el sugerido).
    full.sort((a, b) => canonicalScore(b) - canonicalScore(a) || totalDependents(b) - totalDependents(a) || a.createdAt.getTime() - b.createdAt.getTime());

    console.log(`\n═══════════════════════════════════════════════════════════════`);
    console.log(`GRUPO: ${groupName}  —  ${full.length} registro(s)`);
    console.log(`═══════════════════════════════════════════════════════════════`);
    if (full.length < 2) {
      console.log(`  (solo ${full.length} registro — no es un duplicado, o el término atrapó uno solo)`);
    }
    full.forEach((c, i) => {
      const tag = i === 0 ? "CANÓNICO?" : "DUP?";
      console.log(`\n  [${i}] ${tag}  "${c.name}"   id=${c.id}`);
      console.log(`        creado=${c.createdAt.toISOString().slice(0, 10)}  company=${JSON.stringify(c.company)}  industry=${JSON.stringify(c.industry)}`);
      console.log(`        hubspotCompanyId=${JSON.stringify(c.hubspotCompanyId)}  emailDomains=${JSON.stringify(c.emailDomains)}  logo=${c.logoUrl ? "sí" : "no"}  canvas=${c.hasCanvas ? "sí" : "no"}`);
      console.log(`        sesiones: resolved=${c.sessionsResolved}  manual=${c.sessionsManual}   ·   proyectos=${c.projects}   (score canónico=${canonicalScore(c)})`);
      console.log(`        agentRuns=${c.agentRuns}  contextCards=${c.contextCards}  canvasSugg=${c.canvasSuggestions}  actionItems=${c.actionItems}  handoffs=${c.handoffs}`);
      console.log(`        audits=${c.audits}  implementations=${c.implementations}  knowledge=${c.knowledge}  documents=${c.documents}  stageNotes=${c.stageNotes}  assignments=${c.assignments}  appUsers=${c.appUsers}`);
      console.log(`        hubspotAccount=${c.hubspotAccount ? `id=${c.hubspotAccount.id} portal=${c.hubspotAccount.hubspotPortalId} system=${c.hubspotAccount.isSystem}` : "no"}`);
    });

    if (full.length >= 2) {
      const canon = full[0];
      const dups = full.slice(1);
      console.log(`\n  → CANÓNICO sugerido: [0] "${canon.name}" (${canon.id})`);
      // Señales a foldear + conflictos.
      for (const d of dups) {
        const domainFromCompany = (() => {
          const raw = (d.company ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
          return /^[\w-]+(\.[\w-]+)+$/.test(raw) ? raw : null;
        })();
        const newDomains = [...new Set([...d.emailDomains.map((x) => x.toLowerCase()), ...(domainFromCompany ? [domainFromCompany] : [])])]
          .filter((dm) => !canon.emailDomains.map((x) => x.toLowerCase()).includes(dm));
        console.log(`  → fold dup "${d.name}":`);
        console.log(`       emailDomains a sumar al canónico: ${JSON.stringify(newDomains)}${domainFromCompany ? `  (incluye dominio inferido de company="${d.company}")` : ""}`);
        // Conflictos
        if (d.hubspotCompanyId && canon.hubspotCompanyId && d.hubspotCompanyId !== canon.hubspotCompanyId) {
          console.log(`       ⚠ CONFLICTO hubspotCompanyId: canónico=${canon.hubspotCompanyId} vs dup=${d.hubspotCompanyId} (decidir a mano)`);
        } else if (d.hubspotCompanyId && !canon.hubspotCompanyId) {
          console.log(`       hubspotCompanyId: canónico lo adopta del dup → ${d.hubspotCompanyId}`);
        }
        if (d.hubspotAccount && canon.hubspotAccount) {
          console.log(`       ⚠ CONFLICTO HubspotAccount 1:1: AMBOS tienen cuenta (canónico ${canon.hubspotAccount.id} / dup ${d.hubspotAccount.id}) — decidir a mano`);
        } else if (d.hubspotAccount && !canon.hubspotAccount) {
          console.log(`       HubspotAccount: se reasigna la del dup al canónico (${d.hubspotAccount.id})`);
        }
        if (d.stageNotes > 0) console.log(`       StageNote: ${d.stageNotes} en el dup → reasignar los que no colisionen (unique clientId+stage+step); colisión = conservar el del canónico`);
        if (d.assignments > 0) console.log(`       ClientAssignment: ${d.assignments} en el dup → idem (unique clientId+teamMemberId+targetRole)`);
      }
    }
  }

  console.log("\n\n(READ-ONLY) Nada modificado. Siguiente: revisar canónicos y correr el merge dry-run.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
