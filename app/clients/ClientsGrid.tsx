"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Table, Avatar, Badge, EmptyState, type TableColumn } from "@/components/ui";
import DeleteClientButton from "./DeleteClientButton";
import NewClientButton from "./NewClientButton";
// Shape mínimo del usuario activo para el filtro "Mis clientes".
// Antes venía del tipo ActiveCse de lib/auth (basado en cookie nexus_cse);
// ahora viene de Supabase Auth + AppUser en el server component.
interface ActiveCse {
  email: string;
  name: string;
  role: string;
  isSuperAdmin: boolean;
}

export interface ClientRow {
  id: string;
  name: string;
  company: string | null;
  createdAt: string;            // ISO
  /**
   * Estado HubSpot:
   * - "connected_account": el cliente conectó SU portal HubSpot a Nexus vía OAuth (raro)
   * - "in_crm": solo existe como Company en el portal HubSpot de Smarteam (común)
   * - "none": ninguno
   */
  hubspotStatus: "connected_account" | "in_crm" | "none";
  cseNames: string[];           // owners distintos de los proyectos
  cseEmails: string[];          // owners en email para matching contra activeCse
  lastSalesMeeting: string | null; // ISO
  lastCseMeeting: string | null;   // ISO
  lastInteractionAt: string | null; // ISO — orden principal
  lastInteractionSource: "session_past" | "session_future" | "note" | "agent_run" | null;
  lastInteractionLabel: string | null;
  projectCount: number;
}

function DateCell({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-gray-600">—</span>;
  return (
    <span className="text-gray-400 whitespace-nowrap">
      {new Date(iso).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}
    </span>
  );
}

const SOURCE_LABEL: Record<NonNullable<ClientRow["lastInteractionSource"]>, string> = {
  session_past:   "Última reunión",
  session_future: "Próxima reunión",
  note:           "Última nota",
  agent_run:      "Última ejecución de agente",
};

function LastInteractionCell({ row }: { row: ClientRow }) {
  if (!row.lastInteractionAt || !row.lastInteractionSource) {
    return <span className="text-gray-600">—</span>;
  }
  const d = new Date(row.lastInteractionAt);
  const isFuture = row.lastInteractionSource === "session_future";
  const diffMs = d.getTime() - Date.now();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

  let rel: string;
  if (isFuture) {
    rel =
      days === 0   ? "hoy" :
      days === 1   ? "mañana" :
      days < 7     ? `en ${days} días` :
      d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  } else {
    const ago = Math.abs(days);
    rel =
      ago === 0    ? "hoy" :
      ago === 1    ? "ayer" :
      ago < 7      ? `hace ${ago} días` :
      ago < 60     ? `hace ${Math.round(ago / 7)} sem` :
      d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  }

  const sourceText = row.lastInteractionLabel
    ? `${SOURCE_LABEL[row.lastInteractionSource]}: ${row.lastInteractionLabel}`
    : SOURCE_LABEL[row.lastInteractionSource];

  return (
    <span
      className={`whitespace-nowrap ${isFuture ? "text-emerald-400" : "text-gray-300"}`}
      title={`${sourceText} · ${d.toLocaleString("es-ES")}`}
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

  // Filtro "Mis clientes" — solo significativo si hay un CSE específico
  // (no Super Admin, no sin elegir). Default ON cuando aplica.
  const canFilterMine = !!activeCse && !activeCse.isSuperAdmin;
  const [filterMine, setFilterMine] = useState(canFilterMine);

  const displayedClients = useMemo(() => {
    if (!filterMine || !activeCse || activeCse.isSuperAdmin) return clients;
    const myEmail = activeCse.email.toLowerCase();
    const myName = activeCse.name.toLowerCase();
    return clients.filter(
      (c) =>
        c.cseEmails.some((e) => e === myEmail) ||
        c.cseNames.some((n) => n.toLowerCase() === myName),
    );
  }, [clients, filterMine, activeCse]);

  const columns: TableColumn<ClientRow>[] = [
    {
      key: "client",
      header: "Cliente",
      sortValue: (c) => c.name,
      // Width explícito grande: en table-fixed, sin width definido la columna
      // se aplasta al espacio sobrante y el truncate del IdentityCell la deja
      // en 1-3 letras. Con w-72 (288px) se ve cómoda y el resto cabe.
      width: "w-72",
      render: (c) => (
        <Table.IdentityCell
          leading={<Avatar name={c.name} colorSeed={c.id} size="sm" />}
          primary={c.name}
          secondary={c.company ?? undefined}
        />
      ),
    },
    {
      key: "lastInteraction",
      header: "Última actividad",
      sortValue: (c) => (c.lastInteractionAt ? new Date(c.lastInteractionAt) : null),
      width: "w-32",
      render: (c) => <LastInteractionCell row={c} />,
    },
    {
      key: "cse",
      header: "CSE encargado",
      sortValue: (c) => c.cseNames[0],
      width: "w-36",
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
      header: "Últ. reunión ventas",
      sortValue: (c) => (c.lastSalesMeeting ? new Date(c.lastSalesMeeting) : null),
      width: "w-32",
      hideOnMobile: true,
      render: (c) => <DateCell iso={c.lastSalesMeeting} />,
    },
    {
      key: "cseMeeting",
      header: "Últ. sesión CSE",
      sortValue: (c) => (c.lastCseMeeting ? new Date(c.lastCseMeeting) : null),
      width: "w-32",
      hideOnMobile: true,
      render: (c) => <DateCell iso={c.lastCseMeeting} />,
    },
    {
      key: "projects",
      header: "Proyectos",
      sortValue: (c) => c.projectCount,
      align: "right",
      width: "w-20",
      render: (c) => <span className="tabular-nums text-gray-400">{c.projectCount}</span>,
    },
    {
      key: "hubspot",
      header: "HubSpot",
      // Orden: portal propio > en CRM > nada
      sortValue: (c) =>
        c.hubspotStatus === "connected_account" ? 2 : c.hubspotStatus === "in_crm" ? 1 : 0,
      width: "w-32",
      render: (c) => {
        if (c.hubspotStatus === "connected_account") {
          return (
            <Badge
              variant="success"
              size="xs"
              dot
              title="El cliente conectó su portal HubSpot a Nexus vía OAuth"
            >
              Portal propio
            </Badge>
          );
        }
        if (c.hubspotStatus === "in_crm") {
          return (
            <Badge
              variant="default"
              size="xs"
              title="El cliente existe como Company en el portal HubSpot de Smarteam"
            >
              En CRM
            </Badge>
          );
        }
        return <span className="text-gray-700">—</span>;
      },
    },
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
      {/* Toolbar: filtro "Mis clientes" (solo si hay CSE específico) */}
      {canFilterMine && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilterMine(true)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              filterMine
                ? "bg-brand/15 text-brand border-brand/30"
                : "bg-gray-900 text-gray-400 border-gray-800 hover:border-gray-700"
            }`}
          >
            Mis clientes ({activeCse.name})
          </button>
          <button
            onClick={() => setFilterMine(false)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              !filterMine
                ? "bg-gray-700 text-white border-gray-600"
                : "bg-gray-900 text-gray-400 border-gray-800 hover:border-gray-700"
            }`}
          >
            Todos
          </button>
          {filterMine && displayedClients.length === 0 && (
            <span className="text-xs text-gray-500 ml-2">
              No tenés clientes asignados aún · <button onClick={() => setFilterMine(false)} className="text-brand hover:underline">ver todos</button>
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
