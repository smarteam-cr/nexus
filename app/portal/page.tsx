import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import {
  buildPortalSnapshot,
  PortalSnapshot,
} from "@/lib/hubspot/portal-analyzer";
import AppShell from "@/components/layout/AppShell";
import RefreshButton from "./RefreshButton";
import SwitchAccountButton from "./SwitchAccountButton";
import PortalTabs from "./PortalTabs";

/** Detecta si un snapshot cacheado está desactualizado y debe regenerarse */
function isSnapshotStale(s: PortalSnapshot): boolean {
  // 1. Falta inferredTier → snapshot generado antes de que se añadiera el campo
  if (!s.accountDetails?.inferredTier) return true;

  // 2. totalContacts = 0 pero hay contactos con etapa asignada → bug del filtro antiguo
  const stageContactTotal = s.lifecycleStats.contacts.reduce((a, b) => a + b.count, 0);
  if (s.lifecycleStats.totalContacts === 0 && stageContactTotal > 0) return true;

  // 3. totalCompanies = 0 pero hay empresas con etapa asignada → mismo bug
  const stageCompanyTotal = s.lifecycleStats.companies.reduce((a, b) => a + b.count, 0);
  if (s.lifecycleStats.totalCompanies === 0 && stageCompanyTotal > 0) return true;

  // 4. accessErrors no existe → snapshot generado antes de añadir el campo de errores
  if (!("accessErrors" in s.accountState)) return true;

  // 5. sequences no existe → snapshot generado antes de añadir sequences
  if (!("sequences" in s.accountState)) return true;

  // 6. totalDeals es undefined → snapshot generado antes de añadir deals/tickets
  if (s.lifecycleStats.totalDeals === undefined) return true;

  // 7. contactInsights no existe → snapshot generado antes de añadir insights de contactos
  if (!("contactInsights" in s)) return true;

  return false;
}

export default async function PortalPage() {
  let account: { id: string; portalSnapshot: unknown; portalSnapshotAt: Date | null } | null = null;

  try {
    await requireConsultantSession();
    // En transición: usar la primera cuenta HubSpot disponible
    account = await prisma.hubspotAccount.findFirst({
      select: { id: true, portalSnapshot: true, portalSnapshotAt: true },
    });
  } catch {
    redirect("/");
  }

  let snapshot: PortalSnapshot | null = null;
  let fetchError: string | null = null;
  let cachedAt: string | null = account?.portalSnapshotAt?.toISOString() ?? null;

  // Cargar snapshot cacheado sólo si existe y no está obsoleto
  if (account?.portalSnapshot) {
    const cached = account.portalSnapshot as unknown as PortalSnapshot;
    if (!isSnapshotStale(cached)) {
      snapshot = cached;
    }
    // Si está obsoleto, snapshot permanece null → se regenerará abajo
  }

  // Generar (o regenerar) snapshot si no hay uno válido
  if (!snapshot && account) {
    try {
      snapshot = await buildPortalSnapshot(account.id);
      await prisma.hubspotAccount.update({
        where: { id: account.id },
        data: { portalSnapshot: snapshot as object, portalSnapshotAt: new Date() },
      });
      cachedAt = new Date().toISOString();
    } catch (e) {
      fetchError = e instanceof Error ? e.message : "Error al analizar el portal";
    }
  } else if (!account) {
    fetchError = "No hay ninguna cuenta HubSpot conectada.";
  }

  const details = snapshot?.accountDetails;

  return (
    <AppShell>
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="px-8 py-5 border-b border-gray-800 flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-white">Estado del portal</h1>
              {/* Tier badge */}
              {details?.inferredTier && (
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                  details.inferredTier.color === "purple"
                    ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                    : details.inferredTier.color === "blue"
                    ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                    : details.inferredTier.color === "orange"
                    ? "bg-brand/15 text-brand-light border-brand/30"
                    : "bg-gray-800 text-gray-400 border-gray-700"
                }`}>
                  {details.inferredTier.label}
                </span>
              )}
              {/* Account type badge */}
              {details?.accountType && details.accountType !== "STANDARD" && (
                <span className="text-2xs font-medium px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                  {details.accountType}
                </span>
              )}
            </div>
            <p className="text-gray-500 text-sm mt-0.5">
              {details?.hubDomain ?? ""}
              {details?.user ? ` · ${details.user}` : ""}
            </p>
            {details && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                {details.portalId && (
                  <span className="text-xs text-gray-600">
                    Portal ID: <span className="text-gray-400">{details.portalId}</span>
                  </span>
                )}
                {details.timeZone && (
                  <span className="text-xs text-gray-600">
                    TZ: <span className="text-gray-400">{details.timeZone}</span>
                  </span>
                )}
                {details.companyCurrency && (
                  <span className="text-xs text-gray-600">
                    Moneda: <span className="text-gray-400">{details.companyCurrency}</span>
                  </span>
                )}
                {details.dataHostingLocation && (
                  <span className="text-xs text-gray-600">
                    Datacenter: <span className="text-gray-400">{details.dataHostingLocation.toUpperCase()}</span>
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SwitchAccountButton />
            <RefreshButton lastUpdated={cachedAt} />
          </div>
        </div>

        {/* ── Error ────────────────────────────────────────────────────── */}
        {fetchError && (
          <div className="mx-8 mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm shrink-0">
            {fetchError}
          </div>
        )}

        {/* ── Stats summary ─────────────────────────────────────────────── */}
        {snapshot && (
          <div className="px-8 py-4 border-b border-gray-800 shrink-0">
            <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
              {[
                {
                  label: "Contactos",
                  value: snapshot.lifecycleStats.totalContacts.toLocaleString(),
                  icon: "👤",
                },
                {
                  label: "Empresas",
                  value: snapshot.lifecycleStats.totalCompanies.toLocaleString(),
                  icon: "🏢",
                },
                {
                  label: "Deals",
                  value: (snapshot.lifecycleStats.totalDeals ?? 0).toLocaleString(),
                  icon: "💼",
                },
                {
                  label: "Tickets",
                  value: (snapshot.lifecycleStats.totalTickets ?? 0).toLocaleString(),
                  icon: "🎫",
                },
                {
                  label: "Propiedades",
                  value: Object.values(snapshot.accountState.properties)
                    .reduce((a, b) => a + b.length, 0)
                    .toLocaleString(),
                  icon: "🏷️",
                },
                {
                  label: "Pipelines",
                  value: Object.values(snapshot.accountState.pipelines)
                    .flat().length,
                  icon: "📊",
                },
                {
                  label: "Segmentos",
                  value: snapshot.accountState.lists.length,
                  icon: "📋",
                },
                {
                  label: "Formularios",
                  value: snapshot.accountState.forms.length,
                  icon: "📝",
                },
                {
                  label: "Workflows",
                  value: snapshot.accountState.workflows.length,
                  icon: "⚡",
                },
                {
                  label: "Custom Obj.",
                  value: snapshot.accountState.customObjects.length,
                  icon: "🏗️",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800"
                >
                  <span className="text-base">{stat.icon}</span>
                  <div>
                    <p className="text-sm font-bold text-white leading-none">
                      {stat.value}
                    </p>
                    <p className="text-2xs text-gray-600 mt-0.5">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        {snapshot ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <PortalTabs snapshot={snapshot} />
          </div>
        ) : !fetchError ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-10 h-10 rounded-2xl bg-gray-800 flex items-center justify-center mb-4 animate-pulse">
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <p className="text-gray-500 text-sm">Analizando portal...</p>
          </div>
        ) : null}

      </div>
    </AppShell>
  );
}
