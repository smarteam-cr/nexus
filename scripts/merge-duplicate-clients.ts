import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

/**
 * scripts/merge-duplicate-clients.ts
 *
 * Mergea 4 pares de `Client` DUPLICADOS (misma empresa real, dos registros). Para cada
 * par elige el CANÓNICO (el de más sesiones+proyectos — verificado en runtime contra los
 * ids hardcodeados) y le reasigna TODO lo que cuelga del duplicado, luego borra el dup.
 *
 * Reasigna (dup → canónico), en una transacción por par:
 *   · Soft-FKs de FirefliesSession: `resolvedClientId` y `manualClientId` (updateMany).
 *   · Hard-FKs simples (updateMany clientId): Project, AgentRun, ClientContextCard,
 *     CanvasSuggestion, ActionItem, Audit, Implementation, Knowledge, ClientDocument,
 *     AppUser, Handoff.
 *   · Hard-FKs con `unique` compartida (collision-aware): StageNote (clientId+stage+step),
 *     ClientAssignment (clientId+teamMemberId+targetRole) → se reasigna lo que NO colisiona;
 *     lo que colisiona se conserva en el canónico y se borra el del dup.
 *   · HubspotAccount (1:1): si solo el dup tiene → se reasigna; si ambos → conflicto (se deja
 *     el del dup para cascade-delete y se avisa). [Data actual: ninguno tiene cuenta.]
 *
 * Foldea en el canónico las SEÑALES DE RESOLUCIÓN del dup para que el resolver EN VIVO
 * (categorizeSession) siga mandando esas sesiones al canónico (INV2: materializado == live):
 *   · emailDomains = unión(canónico, dup.emailDomains, dominio inferido de dup.company).
 *   · hubspotCompanyId: si el canónico no tiene, adopta el del dup; si difieren, CONSERVA el
 *     del canónico y reporta el del dup como "desligado" (no se puede tener dos en un Client).
 *   · industry/notes/logoUrl/canvas/canvasConfidence: rellena SOLO si el canónico está vacío.
 *   · `company`: NO se pisa (se conserva la del canónico).
 *
 * NO re-materializa (no llama resolveAllSessions): foldear el dominio del dup no arrastra
 * sesiones nuevas (las `@dominio-del-dup` ya estaban en el dup, y se reasignan), así que tras
 * reasignar+foldear el materializado ya coincide con el live. La verificación lo confirma:
 *   npm run check:invariants                                  # INV1+INV2 deben dar exit 0
 *   npx tsx scripts/backfill-resolved-client.ts               # dry-run → changed=0 (fidelidad)
 *
 * Dry-run por default (NO escribe). Aplicar con --apply (PROD):
 *   npx tsx scripts/merge-duplicate-clients.ts            # plan de los pares fijos
 *   npx tsx scripts/merge-duplicate-clients.ts --apply    # ejecuta (PROD)
 *
 * ── UN PAR SUELTO, POR LÍNEA DE COMANDOS ────────────────────────────────────
 * Los pares de abajo son los del incidente de julio y quedan como registro. Para un par nuevo
 * NO se agrega a esa lista: se pasa por argumento, y así el archivo no se vuelve un cementerio
 * de casos resueltos que hay que leer para entender cuál corre hoy.
 *
 *   npx tsx scripts/merge-duplicate-clients.ts --canonico kamalio --dup kamalio.com
 *   ALLOW_PROD_WRITE=1 npx tsx …  --canonico kamalio --dup kamalio.com --apply
 *
 * El nombre resuelve por coincidencia EXACTA primero y después por `contains`; si matchea más
 * de uno, aborta en vez de elegir — con dos fichas de nombre parecido (que es exactamente el
 * caso que este script atiende) adivinar sería fusionar la equivocada.
 *
 * ⚠ Si las dos fichas apuntan a empresas de HubSpot que se acaban de FUSIONAR, primero corré
 * `scripts/reapuntar-empresa-fusionada.ts --apply`. Si no, el merge conserva el id del canónico
 * —que puede ser el absorbido— y el proyecto queda colgando de una empresa que ya no existe.
 */
const APPLY = resolverApply();

// Pares {canónico, dup} hardcodeados por id (de scripts/inspect-duplicate-clients.ts) para
// no depender de búsquedas por nombre. Se re-valida en runtime que el canónico sea el mayor.
const PAIRS: { label: string; canonicalId: string; dupId: string }[] = [
  { label: "Bluesat", canonicalId: "cmpc0e02z008bxgij4ksityv4", dupId: "cmpc0dyr5007kxgijyjan7j2c" },
  { label: "Cicadex", canonicalId: "cmoi1jte2000rl8ijeh2d4jx9", dupId: "cmpc0dr1k003txgijkhh2jwrg" },
  { label: "Construtecho", canonicalId: "cmpc0edm200ftxgij3bi1vsmp", dupId: "cmpc0ec8k00f2xgijtd7a2c5o" },
  { label: "Ministerio de Economía", canonicalId: "cmpc0du6h005bxgij30eodfxe", dupId: "cmpc0e44900akxgijla2vd9ah" },
];

/** Dominio inferido de un `company` que parece dominio (mismo criterio que categorize.ts). */
function domainFromCompany(company: string | null | undefined): string | null {
  if (!company) return null;
  let raw = company.trim().toLowerCase();
  if (!raw) return null;
  if (/^https?:\/\//.test(raw)) {
    try {
      return new URL(raw).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }
  raw = raw.replace(/^www\./, "").replace(/\/.*$/, "");
  return /^[\w-]+(\.[\w-]+)+$/.test(raw) ? raw : null;
}

type ClientFull = Prisma.ClientGetPayload<{
  select: {
    id: true; name: true; company: true; industry: true; notes: true; hubspotCompanyId: true;
    emailDomains: true; logoUrl: true; canvas: true; canvasConfidence: true; createdAt: true;
  };
}>;

const CLIENT_SELECT = {
  id: true, name: true, company: true, industry: true, notes: true, hubspotCompanyId: true,
  emailDomains: true, logoUrl: true, canvas: true, canvasConfidence: true, createdAt: true,
} as const;

async function loadClient(id: string): Promise<ClientFull | null> {
  return prisma.client.findUnique({ where: { id }, select: CLIENT_SELECT });
}

/** Score canónico: sesiones (resolved+manual) + proyectos — lo que pidió el usuario. */
async function score(clientId: string): Promise<{ sessions: number; manual: number; projects: number; total: number }> {
  const [sessions, manual, projects] = await Promise.all([
    prisma.firefliesSession.count({ where: { resolvedClientId: clientId } }),
    prisma.firefliesSession.count({ where: { manualClientId: clientId } }),
    prisma.project.count({ where: { clientId } }),
  ]);
  return { sessions, manual, projects, total: sessions + manual + projects };
}

/** Conteo de TODO lo que cuelga del dup (para el reporte del dry-run). */
async function dupCensus(dupId: string) {
  const [
    resolvedSessions, manualSessions, c, hubspotAccount, dupSessionTitles,
  ] = await Promise.all([
    prisma.firefliesSession.count({ where: { resolvedClientId: dupId } }),
    prisma.firefliesSession.count({ where: { manualClientId: dupId } }),
    prisma.client.findUnique({
      where: { id: dupId },
      select: {
        // Las 1:1 que también cascadean. `_count` no las cubre: no son listas.
        cuentaFinanciera: { select: { id: true } },
        csSignals: { select: { id: true } },
        partnerSnapshot: { select: { id: true } },
        accountBrief: { select: { id: true } },
        _count: {
          select: {
            projects: true, agentRuns: true, contextCards: true, canvasSuggestions: true,
            actionItems: true, audits: true, implementations: true, knowledge: true,
            documents: true, stageNotes: true, assignments: true, appUsers: true, handoffs: true,
            /* ⚠ ESTAS NO SE REASIGNAN: cascadean con el `delete` del duplicado. Se cuentan para
               poder ABORTAR, no para reportar. Ver `LO_QUE_CASCADEA`. */
            businessCases: true, csAlerts: true,
          },
        },
      },
    }),
    prisma.hubspotAccount.findUnique({ where: { clientId: dupId }, select: { id: true } }),
    prisma.firefliesSession.findMany({
      where: { resolvedClientId: dupId }, select: { title: true }, take: 6, orderBy: { date: "desc" },
    }),
  ]);
  return {
    resolvedSessions, manualSessions, k: c!._count, hubspotAccount,
    sampleTitles: dupSessionTitles.map((s) => s.title),
    cuentaFinanciera: c!.cuentaFinanciera,
    csSignals: c!.csSignals,
    partnerSnapshot: c!.partnerSnapshot,
    accountBrief: c!.accountBrief,
  };
}

/** Plan de fold del canónico a partir del dup. */
function computeFold(canon: ClientFull, dup: ClientFull) {
  const canonDomains = canon.emailDomains.map((d) => d.toLowerCase());
  const dupDomains = dup.emailDomains.map((d) => d.toLowerCase());
  const dupCompanyDomain = domainFromCompany(dup.company);
  const addDomains = [...new Set([...dupDomains, ...(dupCompanyDomain ? [dupCompanyDomain] : [])])].filter(
    (d) => !canonDomains.includes(d),
  );
  const mergedDomains = [...canon.emailDomains, ...addDomains];

  let hubspotCompanyId = canon.hubspotCompanyId;
  let hubspotConflict: string | null = null;
  if (!canon.hubspotCompanyId && dup.hubspotCompanyId) {
    hubspotCompanyId = dup.hubspotCompanyId;
  } else if (canon.hubspotCompanyId && dup.hubspotCompanyId && canon.hubspotCompanyId !== dup.hubspotCompanyId) {
    hubspotConflict = dup.hubspotCompanyId; // se conserva el del canónico; el del dup queda desligado
  }

  const fillIfEmpty: Prisma.ClientUpdateInput = {};
  if (!canon.industry && dup.industry) fillIfEmpty.industry = dup.industry;
  if (!canon.notes && dup.notes) fillIfEmpty.notes = dup.notes;
  if (!canon.logoUrl && dup.logoUrl) fillIfEmpty.logoUrl = dup.logoUrl;
  if (canon.canvas == null && dup.canvas != null) fillIfEmpty.canvas = dup.canvas as Prisma.InputJsonValue;
  if (canon.canvasConfidence == null && dup.canvasConfidence != null)
    fillIfEmpty.canvasConfidence = dup.canvasConfidence as Prisma.InputJsonValue;

  return { addDomains, mergedDomains, hubspotCompanyId, hubspotConflict, fillIfEmpty };
}

/**
 * ── LO QUE EL MERGE **NO** REASIGNA Y EL `delete` SE LLEVA EN CASCADA ─────────
 *
 * El script reasigna las relaciones del trabajo (proyectos, handoffs, conocimiento, sesiones…),
 * pero `client.delete` cascadea a varias más que NADIE mueve — y una de ellas es PLATA:
 * `CuentaFinanciera` arrastra `ServicioContratado` → `PlanDePago`/`CuotaPlan`, `Cobro`,
 * `AlertaCobro` y `BitacoraCobro`. La cobranza 2026 son 53 servicios y 202 cobros cargados a
 * mano: si el duplicado tiene cuenta, el merge la borra sin decir una palabra y no hay vuelta.
 *
 * Por eso el script ABORTA en vez de decidir. Reasignar una cuenta financiera 1:1 no es
 * mecánico —hay que resolver planes, cuotas y cobros que pueden solaparse— y esa es una
 * decisión de negocio, no de un script de limpieza.
 */
function loQueSeBorraria(census: Awaited<ReturnType<typeof dupCensus>>): string[] {
  const out: string[] = [];
  if (census.cuentaFinanciera) out.push("cuenta financiera (con sus servicios, planes y cobros) ⚠ PLATA");
  if (census.k.businessCases > 0) out.push(`${census.k.businessCases} business case(s) con sus bloques`);
  if (census.k.csAlerts > 0) out.push(`${census.k.csAlerts} alerta(s) de Éxito del cliente`);
  if (census.csSignals) out.push("señales de CS");
  if (census.partnerSnapshot) out.push("snapshot de CS360");
  if (census.accountBrief) out.push("brief de la cuenta");
  return out;
}

async function processPair(p: (typeof PAIRS)[number]) {
  const [canon, dup] = await Promise.all([loadClient(p.canonicalId), loadClient(p.dupId)]);
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`PAR: ${p.label}`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  if (!canon || !dup) {
    console.log(`  ⚠ SALTADO: ${!canon ? `canónico ${p.canonicalId} no existe` : ""}${!dup ? ` dup ${p.dupId} no existe` : ""} (¿ya mergeado?)`);
    return { applied: false };
  }

  const [sc, sd, census] = await Promise.all([score(canon.id), score(dup.id), dupCensus(dup.id)]);
  console.log(`  canónico: "${canon.name}" (${canon.id})  score=${sc.total}  [sesiones ${sc.sessions}+${sc.manual}, proy ${sc.projects}]`);
  console.log(`  dup:      "${dup.name}" (${dup.id})  score=${sd.total}  [sesiones ${sd.sessions}+${sd.manual}, proy ${sd.projects}]`);

  // Sanity: el canónico hardcodeado debe ser el de mayor score.
  if (sd.total > sc.total) {
    console.log(`  ⛔ ABORT par: el dup tiene MÁS score que el canónico (${sd.total} > ${sc.total}). Revisar a mano — NO se toca.`);
    return { applied: false };
  }

  const fold = computeFold(canon, dup);
  const k = census.k;
  console.log(`\n  Reasignaciones dup→canónico:`);
  console.log(`    FirefliesSession.resolvedClientId: ${census.resolvedSessions}   ·   manualClientId: ${census.manualSessions}`);
  if (census.sampleTitles.length)
    console.log(`      ej. sesiones: ${census.sampleTitles.map((t) => `"${t}"`).join(", ")}${census.resolvedSessions > census.sampleTitles.length ? " …" : ""}`);
  console.log(`    Project: ${k.projects}   AgentRun: ${k.agentRuns}   ClientContextCard: ${k.contextCards}   CanvasSuggestion: ${k.canvasSuggestions}`);
  console.log(`    ActionItem: ${k.actionItems}   Audit: ${k.audits}   Implementation: ${k.implementations}   Knowledge: ${k.knowledge}`);
  console.log(`    ClientDocument: ${k.documents}   AppUser: ${k.appUsers}   Handoff: ${k.handoffs}   StageNote: ${k.stageNotes}   ClientAssignment: ${k.assignments}`);
  console.log(`    HubspotAccount(dup): ${census.hubspotAccount ? "sí → reasignar" : "no"}`);
  console.log(`\n  Fold de señales en el canónico:`);
  console.log(`    emailDomains: ${JSON.stringify(canon.emailDomains)} + ${JSON.stringify(fold.addDomains)} = ${JSON.stringify(fold.mergedDomains)}`);
  if (fold.hubspotConflict)
    console.log(`    ⚠ hubspotCompanyId: CONSERVA canónico=${canon.hubspotCompanyId}; dup=${fold.hubspotConflict} queda DESLIGADO (reconciliar en HubSpot si hace falta)`);
  else if (fold.hubspotCompanyId !== canon.hubspotCompanyId)
    console.log(`    hubspotCompanyId: canónico adopta ${fold.hubspotCompanyId} (estaba vacío)`);
  const fillKeys = Object.keys(fold.fillIfEmpty);
  if (fillKeys.length) console.log(`    rellena-si-vacío: ${fillKeys.join(", ")}`);
  /* ⚠ EL FRENO. Se dice SIEMPRE (también en dry-run) y aborta EL PAR, no la corrida entera:
     con varios pares, que uno tenga plata no es motivo para no mergear los otros. */
  const seBorraria = loQueSeBorraria(census);
  if (seBorraria.length > 0) {
    console.error(`\n  ⛔ NO SE MERGEA "${dup.name}": el borrado se llevaría en cascada`);
    for (const x of seBorraria) console.error(`     · ${x}`);
    console.error("     Nada de eso lo reasigna este script. Resolvelo a mano y volvé.");
    return { applied: false };
  }

  console.log(`\n  → BORRA dup "${dup.name}" (${dup.id})`);

  if (!APPLY) return { applied: false };

  // ── APPLY: todo en una transacción por par ───────────────────────────────────
  await prisma.$transaction(
    async (tx) => {
      const reassign = { clientId: canon.id };
      // Hard-FKs simples
      await tx.project.updateMany({ where: { clientId: dup.id }, data: reassign });
      await tx.agentRun.updateMany({ where: { clientId: dup.id }, data: reassign });
      await tx.clientContextCard.updateMany({ where: { clientId: dup.id }, data: reassign });
      await tx.canvasSuggestion.updateMany({ where: { clientId: dup.id }, data: reassign });
      await tx.actionItem.updateMany({ where: { clientId: dup.id }, data: reassign });
      await tx.audit.updateMany({ where: { clientId: dup.id }, data: reassign });
      await tx.implementation.updateMany({ where: { clientId: dup.id }, data: reassign });
      await tx.knowledge.updateMany({ where: { clientId: dup.id }, data: reassign });
      await tx.clientDocument.updateMany({ where: { clientId: dup.id }, data: reassign });
      await tx.appUser.updateMany({ where: { clientId: dup.id }, data: reassign });
      await tx.handoff.updateMany({ where: { clientId: dup.id }, data: reassign });

      // StageNote — collision-aware (unique clientId+stage+step)
      const [dupNotes, canonNotes] = await Promise.all([
        tx.stageNote.findMany({ where: { clientId: dup.id }, select: { id: true, stage: true, step: true } }),
        tx.stageNote.findMany({ where: { clientId: canon.id }, select: { stage: true, step: true } }),
      ]);
      const canonNoteKeys = new Set(canonNotes.map((n) => `${n.stage}:${n.step}`));
      const notesMove = dupNotes.filter((n) => !canonNoteKeys.has(`${n.stage}:${n.step}`)).map((n) => n.id);
      const notesDrop = dupNotes.filter((n) => canonNoteKeys.has(`${n.stage}:${n.step}`)).map((n) => n.id);
      if (notesMove.length) await tx.stageNote.updateMany({ where: { id: { in: notesMove } }, data: reassign });
      if (notesDrop.length) await tx.stageNote.deleteMany({ where: { id: { in: notesDrop } } });

      // ClientAssignment — collision-aware (unique clientId+teamMemberId+targetRole)
      const [dupAssigns, canonAssigns] = await Promise.all([
        tx.clientAssignment.findMany({ where: { clientId: dup.id }, select: { id: true, teamMemberId: true, targetRole: true } }),
        tx.clientAssignment.findMany({ where: { clientId: canon.id }, select: { teamMemberId: true, targetRole: true } }),
      ]);
      const canonAssignKeys = new Set(canonAssigns.map((a) => `${a.teamMemberId}:${a.targetRole}`));
      const assignMove = dupAssigns.filter((a) => !canonAssignKeys.has(`${a.teamMemberId}:${a.targetRole}`)).map((a) => a.id);
      const assignDrop = dupAssigns.filter((a) => canonAssignKeys.has(`${a.teamMemberId}:${a.targetRole}`)).map((a) => a.id);
      if (assignMove.length) await tx.clientAssignment.updateMany({ where: { id: { in: assignMove } }, data: reassign });
      if (assignDrop.length) await tx.clientAssignment.deleteMany({ where: { id: { in: assignDrop } } });

      // HubspotAccount (1:1) — solo si el dup tiene y el canónico no
      const dupHs = await tx.hubspotAccount.findUnique({ where: { clientId: dup.id }, select: { id: true } });
      if (dupHs) {
        const canonHs = await tx.hubspotAccount.findUnique({ where: { clientId: canon.id }, select: { id: true } });
        if (!canonHs) await tx.hubspotAccount.update({ where: { id: dupHs.id }, data: reassign });
        else console.warn(`    ⚠ ${p.label}: ambos tienen HubspotAccount — la del dup (${dupHs.id}) se cascade-borra con el dup.`);
      }

      // Soft-FKs (no relación Prisma; no cascade → reasignar explícito)
      await tx.firefliesSession.updateMany({ where: { resolvedClientId: dup.id }, data: { resolvedClientId: canon.id } });
      await tx.firefliesSession.updateMany({ where: { manualClientId: dup.id }, data: { manualClientId: canon.id } });

      // Fold de señales en el canónico
      await tx.client.update({
        where: { id: canon.id },
        data: { emailDomains: fold.mergedDomains, hubspotCompanyId: fold.hubspotCompanyId, ...fold.fillIfEmpty },
      });

      // Borrar el dup (ya vacío de dependientes reasignados)
      await tx.client.delete({ where: { id: dup.id } });
    },
    { timeout: 30_000 },
  );

  console.log(`  ✓ MERGE aplicado: "${dup.name}" → "${canon.name}".`);
  return { applied: true };
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

/** Resuelve una ficha por id o por nombre. Aborta ante la ambigüedad en vez de elegir. */
async function resolverFicha(arg: string): Promise<{ id: string; name: string }> {
  const porId = await prisma.client.findUnique({ where: { id: arg }, select: { id: true, name: true } });
  if (porId) return porId;
  const exactos = await prisma.client.findMany({
    where: { name: { equals: arg, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (exactos.length === 1) return exactos[0];
  if (exactos.length > 1) throw new Error(`"${arg}" matchea ${exactos.length} fichas con ese nombre exacto.`);
  const parciales = await prisma.client.findMany({
    where: { name: { contains: arg, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (parciales.length === 1) return parciales[0];
  if (parciales.length === 0) throw new Error(`Ninguna ficha matchea "${arg}".`);
  throw new Error(
    `"${arg}" matchea ${parciales.length} fichas (${parciales.map((c) => c.name).join(", ")}). Pasá el id.`,
  );
}

async function main() {
  console.log(
    APPLY
      ? "⚠ APLICANDO merge de Clients duplicados (PROD)…"
      : "DRY-RUN — merge de Clients duplicados (usá --apply para ejecutar)",
  );

  const argCanon = argValue("--canonico");
  const argDup = argValue("--dup");
  if ((argCanon === null) !== (argDup === null)) {
    throw new Error("--canonico y --dup van juntos.");
  }
  let pares = PAIRS;
  if (argCanon && argDup) {
    const [c, d] = await Promise.all([resolverFicha(argCanon), resolverFicha(argDup)]);
    if (c.id === d.id) throw new Error("El canónico y el duplicado son la misma ficha.");
    pares = [{ label: `${c.name} ← ${d.name}`, canonicalId: c.id, dupId: d.id }];
  }

  let appliedCount = 0;
  for (const p of pares) {
    const r = await processPair(p);
    if (r.applied) appliedCount++;
  }

  console.log(`\n───────────────────────────────────────────────────────────────`);
  if (!APPLY) {
    console.log("(DRY-RUN) Nada escrito. Revisá el plan y los ⚠, después --apply.");
  } else {
    console.log(`✓ ${appliedCount}/${pares.length} pares mergeados.`);
    console.log("VERIFICAR ahora:");
    console.log("  npm run check:invariants                         # INV1+INV2 → exit 0");
    console.log("  npx tsx scripts/backfill-resolved-client.ts      # dry-run → changed=0 (fidelidad)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
