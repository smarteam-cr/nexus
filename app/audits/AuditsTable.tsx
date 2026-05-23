"use client";

import { useRouter } from "next/navigation";
import { Table, Badge, Card, type TableColumn } from "@/components/ui";
import NewAuditButton from "./NewAuditButton";

export interface AuditRow {
  id: string;
  name: string;
  createdAt: string; // ISO string (serializado desde el server)
  totalContacts: number | null;
  totalCompanies: number | null;
  totalDeals: number | null;
  hasInsights: boolean;
}

function NumCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-600">—</span>;
  return <span className="tabular-nums text-gray-300">{value.toLocaleString()}</span>;
}

export default function AuditsTable({ audits }: { audits: AuditRow[] }) {
  const router = useRouter();

  const columns: TableColumn<AuditRow>[] = [
    {
      key: "name",
      header: "Auditoría",
      sortValue: (a) => a.name,
      render: (a) => (
        <Table.IdentityCell
          leading={
            <Card.Icon color="gray">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </Card.Icon>
          }
          primary={
            <span className="flex items-center gap-2">
              {a.name}
              {a.hasInsights && <Badge variant="purple" size="xs">IA</Badge>}
            </span>
          }
        />
      ),
    },
    {
      key: "contacts",
      header: "Contactos",
      sortValue: (a) => a.totalContacts,
      align: "right",
      width: "w-28",
      hideOnMobile: true,
      render: (a) => <NumCell value={a.totalContacts} />,
    },
    {
      key: "companies",
      header: "Empresas",
      sortValue: (a) => a.totalCompanies,
      align: "right",
      width: "w-28",
      hideOnMobile: true,
      render: (a) => <NumCell value={a.totalCompanies} />,
    },
    {
      key: "deals",
      header: "Negocios",
      sortValue: (a) => a.totalDeals,
      align: "right",
      width: "w-28",
      hideOnMobile: true,
      render: (a) => <NumCell value={a.totalDeals} />,
    },
    {
      key: "created",
      header: "Creado",
      sortValue: (a) => new Date(a.createdAt),
      width: "w-40",
      render: (a) => (
        <span className="text-gray-400 whitespace-nowrap">
          {new Date(a.createdAt).toLocaleDateString("es-ES", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      rows={audits}
      rowKey={(a) => a.id}
      onRowClick={(a) => router.push(`/audits/${a.id}`)}
      search={{ placeholder: "Buscar auditoría…", getText: (a) => a.name }}
      initialSort={{ key: "created", dir: "desc" }}
      action={<NewAuditButton />}
    />
  );
}
