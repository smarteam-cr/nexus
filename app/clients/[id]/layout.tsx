import { requireConsultantSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import ClientHeaderPopovers from "@/components/clients/ClientHeaderPopovers";
import ServiceMapHeader from "@/components/clients/ServiceMapHeader";
import CanvasToggleShell from "@/components/clients/CanvasToggleShell";
import CanvasToggleButtons from "@/components/clients/CanvasToggleButtons";
import CanvasOverlay from "@/components/clients/CanvasOverlay";
import { getHubspotClient, getSystemHubspotClient } from "@/lib/hubspot/client";

// Obtiene el nombre de la empresa desde la cuenta del cliente o del sistema
async function fetchHsCompanyName(
  companyId: string,
  accountId?: string
): Promise<string | null> {
  try {
    const hsClient = accountId
      ? await getHubspotClient(accountId)
      : await getSystemHubspotClient();
    const res = await hsClient.apiRequest({
      method: "GET",
      path: `/crm/v3/objects/companies/${companyId}?properties=name`,
    });
    const data = (await res.json()) as {
      properties?: { name?: string | null };
    };
    return data.properties?.name ?? null;
  } catch {
    return null;
  }
}

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      hubspotAccount: {
        select: { id: true, hubName: true, hubspotPortalId: true },
      },
    },
  });

  if (!client) notFound();

  // Obtener serviceType del proyecto activo (para el ServiceMap)
  const activeProject = await prisma.project.findFirst({
    where: { clientId: id },
    orderBy: { createdAt: "desc" },
    select: { serviceType: true },
  });

  // Nombre de empresa live desde HubSpot (cuenta del cliente o del sistema)
  let hsCompanyName: string | null = null;
  if (client.hubspotCompanyId) {
    hsCompanyName = await fetchHsCompanyName(
      client.hubspotCompanyId,
      client.hubspotAccount?.id
    );
  }

  // Mostrar nombre live de HS si está disponible; si no, usar datos de DB
  const displayCompany = hsCompanyName ?? client.company;

  // Dominio del cliente (para filtrar sesiones de Fireflies)
  const clientDomain = (() => {
    const raw = client.company?.trim();
    if (!raw) return undefined;
    try {
      if (/^https?:\/\//i.test(raw))
        return new URL(raw).hostname.replace(/^www\./i, "").toLowerCase();
      const cleaned = raw.toLowerCase().replace(/^www\./, "");
      if (/^[\w-]+(\.[\w-]+)+$/.test(cleaned)) return cleaned;
    } catch { /* URL inválida */ }
    return undefined;
  })();

  return (
    <AppShell>
      <CanvasToggleShell clientId={id}>
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header del cliente */}
        <header className="flex-shrink-0 border-b border-gray-800 px-4 py-3 flex items-center justify-between gap-4">
          {/* Left: back + nombre del cliente + HS status */}
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/clients"
              className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-xs transition-colors flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Clientes
            </Link>
            <div className="w-px h-4 bg-gray-700 flex-shrink-0" />
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold text-white truncate">{client.name}</span>
              {displayCompany && displayCompany !== client.name && (
                <>
                  <span className="text-gray-600 text-xs">·</span>
                  <span className="text-xs text-gray-400 truncate">{displayCompany}</span>
                </>
              )}
              {/* HubSpot status badge */}
              {client.hubspotAccount ? (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 flex-shrink-0" title={client.hubspotAccount.hubName ?? "HubSpot conectado"}>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  HS
                </span>
              ) : (
                <Link
                  href={`/clients/${id}/settings`}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium bg-gray-800 text-gray-500 border border-gray-700 hover:text-gray-300 hover:border-gray-600 transition-colors flex-shrink-0"
                  title="Conectar HubSpot del cliente"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                  HS
                </Link>
              )}
              {/* Service Map — solo visible en rutas de stage */}
              <ServiceMapHeader
                clientId={id}
                hasHubspot={!!client.hubspotAccount}
                serviceType={activeProject?.serviceType ?? null}
              />
              {/* Canvas toggle buttons */}
              <CanvasToggleButtons />
            </div>
          </div>

          {/* Right: contexto + settings */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <ClientHeaderPopovers
              clientId={id}
              hasHubspot={!!client.hubspotAccount}
              hubspotCompanyId={client.hubspotCompanyId ?? null}
              hubName={client.hubspotAccount?.hubName ?? null}
              hubspotPortalId={client.hubspotAccount?.hubspotPortalId ?? null}
              serviceType={activeProject?.serviceType ?? null}
              domain={clientDomain}
              company={client.company ?? undefined}
            />
            <Link
              href={`/clients/${id}/settings`}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
              title="Configuración"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          </div>
        </header>

        <div className="flex-1 relative">
          <CanvasOverlay clientId={id} />
          {children}
        </div>
      </div>
      </CanvasToggleShell>
    </AppShell>
  );
}
