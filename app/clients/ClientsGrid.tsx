"use client";

import { useRouter } from "next/navigation";
import { Table, Avatar, Badge, EmptyState, type TableColumn } from "@/components/ui";
import DeleteClientButton from "./DeleteClientButton";
import NewClientButton from "./NewClientButton";

export interface ClientRow {
  id: string;
  name: string;
  company: string | null;
  createdAt: string;            // ISO
  hasHubspot: boolean;
  cseNames: string[];           // owners distintos de los proyectos
  lastSalesMeeting: string | null; // ISO
  lastCseMeeting: string | null;   // ISO
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

export default function ClientsGrid({ clients }: { clients: ClientRow[] }) {
  const router = useRouter();

  const columns: TableColumn<ClientRow>[] = [
    {
      key: "client",
      header: "Cliente",
      sortValue: (c) => c.name,
      render: (c) => (
        <Table.IdentityCell
          leading={<Avatar name={c.name} colorSeed={c.id} size="sm" />}
          primary={c.name}
          secondary={c.company ?? undefined}
        />
      ),
    },
    {
      key: "cse",
      header: "CSE encargado",
      sortValue: (c) => c.cseNames[0],
      width: "w-40",
      hideOnMobile: true,
      render: (c) =>
        c.cseNames.length === 0 ? (
          <span className="text-gray-600">—</span>
        ) : (
          <span className="text-gray-300">
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
      width: "w-36",
      hideOnMobile: true,
      render: (c) => <DateCell iso={c.lastSalesMeeting} />,
    },
    {
      key: "cseMeeting",
      header: "Últ. sesión CSE",
      sortValue: (c) => (c.lastCseMeeting ? new Date(c.lastCseMeeting) : null),
      width: "w-36",
      hideOnMobile: true,
      render: (c) => <DateCell iso={c.lastCseMeeting} />,
    },
    {
      key: "projects",
      header: "Proyectos",
      sortValue: (c) => c.projectCount,
      align: "right",
      width: "w-24",
      render: (c) => <span className="tabular-nums text-gray-400">{c.projectCount}</span>,
    },
    {
      key: "hubspot",
      header: "HubSpot",
      sortValue: (c) => (c.hasHubspot ? 1 : 0),
      width: "w-32",
      render: (c) =>
        c.hasHubspot ? (
          <Badge variant="success" size="xs" dot>Conectado</Badge>
        ) : (
          <Badge variant="default" size="xs">Sin HubSpot</Badge>
        ),
    },
    {
      key: "created",
      header: "Creado",
      sortValue: (c) => new Date(c.createdAt),
      width: "w-32",
      hideOnMobile: true,
      render: (c) => <DateCell iso={c.createdAt} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-16",
      render: (c) => <DeleteClientButton clientId={c.id} clientName={c.name} />,
    },
  ];

  return (
    <Table
      columns={columns}
      rows={clients}
      rowKey={(c) => c.id}
      onRowClick={(c) => router.push(`/clients/${c.id}`)}
      search={{ placeholder: "Buscar por nombre o empresa…", getText: (c) => `${c.name} ${c.company ?? ""}` }}
      initialSort={{ key: "created", dir: "desc" }}
      action={<NewClientButton />}
      empty={
        <EmptyState
          variant="dashed"
          title="Sin clientes aún"
          description="Creá tu primer cliente con el botón “Nuevo cliente”."
        />
      }
    />
  );
}
