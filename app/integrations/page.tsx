import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import AppShell from "@/components/layout/AppShell";
import HubspotSystemCard from "./HubspotSystemCard";
import FirefliesSyncButton from "./FirefliesSyncButton";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface FirefliesStatus {
  connected: boolean;
  reason?: "no_key" | "invalid_key" | "network_error";
  user?: { id: string; email: string; name: string };
}

interface HubspotStatus {
  connected: boolean;
  hubName?: string | null;
  hubspotPortalId?: string | null;
  updatedAt?: string;
}

// ── Fetch del estado de Fireflies (server-side) ───────────────────────────────

async function getFirefliesStatus(): Promise<FirefliesStatus> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("consultant_session");

    const res = await fetch(
      `${process.env.APP_URL}/api/integrations/fireflies/status`,
      {
        headers: {
          Cookie: sessionCookie
            ? `consultant_session=${sessionCookie.value}`
            : "",
        },
        cache: "no-store",
      }
    );

    if (!res.ok) return { connected: false, reason: "network_error" };
    return res.json();
  } catch {
    return { connected: false, reason: "network_error" };
  }
}

// ── Fetch del estado de HubSpot del sistema (server-side) ─────────────────────

async function getHubspotSystemStatus(): Promise<HubspotStatus> {
  const account = await prisma.hubspotAccount.findFirst({
    where: { isSystem: true },
    select: { hubName: true, hubspotPortalId: true, updatedAt: true },
  });

  if (!account) return { connected: false };

  return {
    connected: true,
    hubName: account.hubName,
    hubspotPortalId: account.hubspotPortalId,
    updatedAt: account.updatedAt.toISOString(),
  };
}

// ── Página ────────────────────────────────────────────────────────────────────

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ hs_connected?: string }>;
}) {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const { hs_connected } = await searchParams;
  const [fireflies, hubspot, firefliesCount] = await Promise.all([
    getFirefliesStatus(),
    getHubspotSystemStatus(),
    prisma.firefliesSession.count(),
  ]);

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-bold text-white mb-1">Integraciones</h1>
          <p className="text-sm text-gray-500">
            Conecta herramientas externas para enriquecer el workspace.
          </p>
        </div>

        {/* Grid de integraciones */}
        <div className="max-w-2xl grid grid-cols-1 gap-4">
          {/* HubSpot sistema — siempre primero */}
          <HubspotSystemCard
            status={hubspot}
            justConnected={hs_connected === "1"}
          />

          <FirefliesCard status={fireflies} sessionCount={firefliesCount} />
        </div>
      </div>
    </AppShell>
  );
}

// ── Card de Fireflies ─────────────────────────────────────────────────────────

function FirefliesCard({ status, sessionCount }: { status: FirefliesStatus; sessionCount: number }) {
  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
      <div className="flex items-start gap-4">
        {/* Logo */}
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg">
          <span className="text-white font-black text-lg tracking-tighter">ff</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <h2 className="text-sm font-semibold text-white">Fireflies.ai</h2>
            <StatusBadge status={status} />
          </div>
          <p className="text-xs text-gray-400 leading-relaxed mb-4">
            Sincroniza sesiones grabadas con clientes. Las grabaciones aparecerán
            automáticamente en cada etapa del cliente para análisis y seguimiento.
          </p>

          {/* Estado detallado */}
          {status.connected && status.user ? (
            <ConnectedState user={status.user} sessionCount={sessionCount} />
          ) : (
            <DisconnectedState reason={status.reason} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Badge de estado ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FirefliesStatus }) {
  if (status.connected) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
        Conectado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-700/50 border border-gray-700 text-gray-400">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-500 flex-shrink-0" />
      No conectado
    </span>
  );
}

// ── Estado: conectado ─────────────────────────────────────────────────────────

function ConnectedState({
  user,
  sessionCount,
}: {
  user: { id: string; email: string; name: string };
  sessionCount: number;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-green-500/5 border border-green-500/10">
        <svg
          className="w-4 h-4 text-green-400 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div className="min-w-0">
          <p className="text-xs font-medium text-green-400">API Key activa</p>
          <p className="text-xs text-gray-400 truncate">
            {user.name} · {user.email}
          </p>
        </div>
      </div>
      <p className="text-xs text-gray-600">
        La API key se lee desde la variable de entorno{" "}
        <code className="text-gray-500 bg-gray-800 px-1 py-0.5 rounded">
          FIREFLIES_API_KEY
        </code>
        .
      </p>
      <FirefliesSyncButton initialCount={sessionCount} />
    </div>
  );
}

// ── Estado: no conectado ──────────────────────────────────────────────────────

function DisconnectedState({
  reason,
}: {
  reason?: "no_key" | "invalid_key" | "network_error";
}) {
  const messages: Record<string, string> = {
    no_key: "No se encontró la variable de entorno FIREFLIES_API_KEY.",
    invalid_key:
      "La API key configurada no es válida o fue revocada en Fireflies.",
    network_error: "No se pudo contactar a la API de Fireflies. Intenta de nuevo.",
  };

  const message = messages[reason ?? "no_key"] ?? messages.no_key;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
        <svg
          className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <p className="text-xs text-yellow-400/80">{message}</p>
      </div>

      {/* Instrucciones */}
      <div className="rounded-lg bg-gray-800/60 border border-gray-700/50 p-3 space-y-1.5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Cómo conectar
        </p>
        <ol className="space-y-1">
          {[
            <>
              Ve a{" "}
              <a
                href="https://app.fireflies.ai/account"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-light hover:text-brand-light underline underline-offset-2"
              >
                app.fireflies.ai/account
              </a>{" "}
              → sección API.
            </>,
            <>
              Copia tu API key.
            </>,
            <>
              Agrega al archivo{" "}
              <code className="text-gray-300 bg-gray-700 px-1 py-0.5 rounded text-2xs">
                .env
              </code>
              :
            </>,
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
              <span className="flex-shrink-0 w-4 h-4 rounded-full bg-gray-700 flex items-center justify-center text-[9px] font-bold text-gray-500 mt-0.5">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-2 px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 font-mono text-xs text-green-400">
          FIREFLIES_API_KEY=&quot;tu-api-key&quot;
        </div>
        <p className="text-xs text-gray-600 mt-1">
          Reinicia el servidor después de agregar la variable.
        </p>
      </div>
    </div>
  );
}
