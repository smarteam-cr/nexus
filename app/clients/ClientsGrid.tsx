"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Table, Avatar, Badge, EmptyState, type TableColumn } from "@/components/ui";
import DeleteClientButton from "./DeleteClientButton";
import NewClientButton from "./NewClientButton";
import { calendarDaysFromToday } from "@/lib/utils/relative-date";
// Shape mínimo del usuario activo para el filtro "Mis clientes".
// Antes venía del tipo ActiveCse de lib/auth (basado en cookie nexus_cse);
// ahora viene de Supabase Auth + AppUser en el server component.
interface ActiveCse {
  email: string;
  name: string;
  role: string;
  isSuperAdmin: boolean;
  canSeeAll: boolean; // roles que ven todos los clientes (VENTAS/CSL/MARKETING/SUPER_ADMIN)
}

export interface ClientRow {
  id: string;
  name: string;
  company: string | null;
  createdAt: string;            // ISO
  cseNames: string[];           // owners distintos de los proyectos
  cseEmails: string[];          // owners en email para matching contra activeCse
  lastSalesMeeting: string | null; // ISO
  lastCseMeeting: string | null;   // ISO
  // Última actividad PASADA — orden principal de la lista
  lastActivityAt: string | null;
  lastActivitySource: "session_past" | "note" | "agent_run" | null;
  lastActivityLabel: string | null;
  // Próxima reunión FUTURA agendada (columna separada)
  nextMeetingAt: string | null;
  nextMeetingLabel: string | null;
  projectCount: number;
  isShared: boolean;            // compartido con el usuario actual (GRANT a él o a su rol)
}

/** Formatea una fecha pasada en forma relativa (hoy/ayer/hace N días/sem/fecha). */
function PastDateCell({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-gray-600">—</span>;
  const d = new Date(iso);
  const ago = Math.max(0, -calendarDaysFromToday(d));
  const rel =
    ago === 0  ? "hoy" :
    ago === 1  ? "ayer" :
    ago < 7    ? `hace ${ago} días` :
    ago < 60   ? `hace ${Math.round(ago / 7)} sem` :
    d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  return (
    <span
      className="text-gray-400 whitespace-nowrap"
      title={d.toLocaleString("es-ES")}
    >
      {rel}
    </span>
  );
}

const ACTIVITY_SOURCE_LABEL: Record<NonNullable<ClientRow["lastActivitySource"]>, string> = {
  session_past: "Última reunión",
  note:         "Última nota",
  agent_run:    "Última ejecución de agente",
};

/** Celda "Última actividad" — solo pasado. Formatea como "hoy/ayer/hace N días/hace N sem/fecha". */
function LastActivityCell({ row }: { row: ClientRow }) {
  if (!row.lastActivityAt || !row.lastActivitySource) {
    return <span className="text-gray-600">—</span>;
  }
  const d = new Date(row.lastActivityAt);
  const ago = Math.max(0, -calendarDaysFromToday(d));
  const rel =
    ago === 0  ? "hoy" :
    ago === 1  ? "ayer" :
    ago < 7    ? `hace ${ago} días` :
    ago < 60   ? `hace ${Math.round(ago / 7)} sem` :
    d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

  const sourceText = row.lastActivityLabel
    ? `${ACTIVITY_SOURCE_LABEL[row.lastActivitySource]}: ${row.lastActivityLabel}`
    : ACTIVITY_SOURCE_LABEL[row.lastActivitySource];

  return (
    <span
      className="whitespace-nowrap text-gray-300"
      title={`${sourceText} · ${d.toLocaleString("es-ES")}`}
    >
      {rel}
    </span>
  );
}

/** Celda "Próxima reunión" — solo futuro. Formatea como "hoy/mañana/en N días/fecha". */
function NextMeetingCell({ row }: { row: ClientRow }) {
  if (!row.nextMeetingAt) {
    return <span className="text-gray-600">—</span>;
  }
  const d = new Date(row.nextMeetingAt);
  const days = Math.max(0, calendarDaysFromToday(d));
  const rel =
    days === 0 ? "hoy" :
    days === 1 ? "mañana" :
    days < 7   ? `en ${days} días` :
    d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });

  const labelText = row.nextMeetingLabel
    ? `Próxima: ${row.nextMeetingLabel}`
    : "Próxima reunión";

  return (
    <span
      className="whitespace-nowrap text-emerald-400"
      title={`${labelText} · ${d.toLocaleString("es-ES")}`}
    >
      {rel}
    </span>
  );
}

export default function ClientsGrid({
  clients,
  activeCse,
}: {
  clients: ClientRow[];
  activeCse: ActiveCse | null;
}) {
  const router = useRouter();

  // Pestañas: "mine" (soy owner) · "shared" (compartidos conmigo) · "all" (accesibles).
  // Solo para un CSE específico — el Super Admin ve todo sin filtro.
  const canFilter = !!activeCse && !activeCse.isSuperAdmin;

  const isMine = useMemo(() => {
    if (!activeCse) return (_c: ClientRow) => false;
    const myEmail = activeCse.email.toLowerCase();
    const myName = activeCse.name.toLowerCase();
    return (c: ClientRow) =>
      c.cseEmails.some((e) => e === myEmail) ||
      c.cseNames.some((n) => n.toLowerCase() === myName);
  }, [activeCse]);

  const mineClients = useMemo(() => clients.filter(isMine), [clients, isMine]);
  const sharedClients = useMemo(
    () => clients.filter((c) => c.isShared && !isMine(c)),
    [clients, isMine],
  );

  // Roles "ven todo" abren el índice en "Todos" (su caso normal es la cartera completa).
  // CSE abre SIEMPRE en "Mis clientes" (aunque esté vacía), no en "Compartido".
  const canSeeAll = !!activeCse?.canSeeAll;
  const [tab, setTab] = useState<"mine" | "shared" | "all">(() =>
    !canFilter ? "all" : canSeeAll ? "all" : "mine",
  );

  const displayedClients = !canFilter
    ? clients
    : tab === "mine"
      ? mineClients
      : tab === "shared"
        ? sharedClients
        : clients;

  const columns: TableColumn<ClientRow>[] = [
    {
      key: "client",
      header: "Cliente",
      sortValue: (c) => c.name,
      // Width explícito: en table-fixed, sin width la columna se aplasta y el
      // truncate del IdentityCell la deja en 1-3 letras.
      width: "w-48",
      render: (c) => (
        <Table.IdentityCell
          leading={<Avatar name={c.name} colorSeed={c.id} size="sm" />}
          primary={c.name}
          secondary={c.company ?? undefined}
        />
      ),
    },
    {
      key: "lastActivity",
      header: "Última actividad",
      sortValue: (c) => (c.lastActivityAt ? new Date(c.lastActivityAt) : null),
      width: "w-36",
      render: (c) => <LastActivityCell row={c} />,
    },
    {
      key: "nextMeeting",
      header: "Próxima reunión",
      sortValue: (c) => (c.nextMeetingAt ? new Date(c.nextMeetingAt) : null),
      width: "w-36",
      render: (c) => <NextMeetingCell row={c} />,
    },
    {
      key: "cse",
      header: "CSE encargado",
      sortValue: (c) => c.cseNames[0],
      width: "w-32",
      hideOnMobile: true,
      render: (c) =>
        c.cseNames.length === 0 ? (
          <span className="text-gray-600">—</span>
        ) : (
          <span className="text-gray-300 truncate block">
            {c.cseNames[0]}
            {c.cseNames.length > 1 && (
              <span className="text-gray-600"> +{c.cseNames.length - 1}</span>
            )}
          </span>
        ),
    },
    {
      key: "salesMeeting",
      header: "Reunión ventas",
      sortValue: (c) => (c.lastSalesMeeting ? new Date(c.lastSalesMeeting) : null),
      width: "w-32",
      hideOnMobile: true,
      render: (c) => <PastDateCell iso={c.lastSalesMeeting} />,
    },
    {
      key: "cseMeeting",
      header: "Sesión CSE",
      sortValue: (c) => (c.lastCseMeeting ? new Date(c.lastCseMeeting) : null),
      width: "w-28",
      hideOnMobile: true,
      render: (c) => <PastDateCell iso={c.lastCseMeeting} />,
    },
    {
      key: "projects",
      header: "Proyectos",
      sortValue: (c) => c.projectCount,
      width: "w-20",
      render: (c) => <span className="tabular-nums text-gray-400">{c.projectCount}</span>,
    },
    // Columna "HubSpot" eliminada — todos los clientes están "En CRM" porque
    // están en el portal de Smarteam, así que la info era ruido. Si en algún
    // momento aparece un cliente con su propio Portal OAuth, lo destacamos
    // en otro lado (ej. badge en el detalle del cliente).
    // Columna "Creado" eliminada — la fecha está en el tooltip de "Última
    // actividad" y la columna ocupaba espacio sin aportar al flujo.
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-12",
      render: (c) => <DeleteClientButton clientId={c.id} clientName={c.name} />,
    },
  ];

  return (
    <div className="space-y-3">
      {/* Toolbar: pestañas Mis clientes / Compartidos conmigo / Todos (solo CSE) */}
      {canFilter && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {(canSeeAll
            ? [
                { key: "all" as const, label: "Todos", count: clients.length },
                { key: "mine" as const, label: "Mis clientes", count: mineClients.length },
                { key: "shared" as const, label: "Compartido", count: sharedClients.length },
              ]
            : [
                { key: "mine" as const, label: "Mis clientes", count: mineClients.length },
                { key: "shared" as const, label: "Compartido", count: sharedClients.length },
                { key: "all" as const, label: "Todos", count: clients.length },
              ]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                tab === t.key
                  ? "bg-brand/15 text-brand border-brand/30"
                  : "bg-gray-900 text-gray-400 border-gray-800 hover:border-gray-700"
              }`}
            >
              {t.label} <span className="tabular-nums opacity-70">{t.count}</span>
            </button>
          ))}
          {displayedClients.length === 0 && (
            <span className="text-xs text-gray-500 ml-1">
              {tab === "mine"
                ? "No sos owner de ningún cliente."
                : tab === "shared"
                  ? "No tenés clientes compartidos."
                  : "Sin clientes."}
              {clients.length > 0 && tab !== "all" && (
                <>
                  {" · "}
                  <button onClick={() => setTab("all")} className="text-brand hover:underline">
                    ver todos
                  </button>
                </>
              )}
            </span>
          )}
        </div>
      )}

      <Table
        columns={columns}
        rows={displayedClients}
        rowKey={(c) => c.id}
        onRowClick={(c) => router.push(`/clients/${c.id}`)}
        search={{ placeholder: "Buscar por nombre o empresa…", getText: (c) => `${c.name} ${c.company ?? ""}` }}
        initialSort={{ key: "lastInteraction", dir: "desc" }}
        action={<NewClientButton />}
        empty={
          <EmptyState
            variant="dashed"
            title="Sin clientes aún"
            description="Creá tu primer cliente con el botón “Nuevo cliente”."
          />
        }
      />
    </div>
  );
}
