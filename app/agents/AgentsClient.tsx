"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Button,
  Badge,
  Card,
  buttonVariants,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Table,
  type TableColumn,
} from "@/components/ui";
import {
  AGENT_CATEGORIES,
  categorizeAgent,
  agentTriggerHint,
  type AgentCategoryKey,
} from "@/lib/agents/catalog";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "DRAFT";
  scope: "CLIENT" | "GLOBAL";
  agentType: string;
  agentGroup: string | null;
  outputType: string;
  associatedStages: number[];
  createdAt: Date;
  _count: { runs: number };
}

const OUTPUT_LABELS: Record<string, { label: string; color: string }> = {
  AUDIT_REPORT:       { label: "Auditoría",       color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  CARDS:              { label: "Cards",           color: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
  FLOWCHART:          { label: "Diagrama",        color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" },
  CARDS_AND_FLOWCHARTS:{ label: "Cards + Diagrama", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" },
  CARDS_AND_CHARTS:   { label: "Cards + Gráfico", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
  STREAM:             { label: "Stream",          color: "text-green-400 bg-green-500/10 border-green-500/20" },
};

const TAG_CLASS = "inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap";

export default function AgentsClient({ agents }: { agents: Agent[] }) {
  const router = useRouter();
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(null);

  async function handleDelete() {
    if (!confirmTarget) return;
    await fetch(`/api/agents/${confirmTarget.id}`, { method: "DELETE" });
    setConfirmTarget(null);
    router.refresh();
  }

  // Agrupar por categoría, en el orden curado, omitiendo las vacías.
  const groups = useMemo(() => {
    const byKey = new Map<AgentCategoryKey, Agent[]>();
    for (const a of agents) {
      const key = categorizeAgent(a);
      const list = byKey.get(key) ?? [];
      list.push(a);
      byKey.set(key, list);
    }
    return AGENT_CATEGORIES.map((cat) => ({ cat, rows: byKey.get(cat.key) ?? [] })).filter(
      (g) => g.rows.length > 0,
    );
  }, [agents]);

  const columns: TableColumn<Agent>[] = [
    {
      key: "agent",
      header: "Agente",
      sortValue: (a) => a.name,
      render: (a) => (
        <Table.IdentityCell
          leading={
            <Card.Icon color={a.status === "ACTIVE" ? "brand" : "gray"}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </Card.Icon>
          }
          primary={a.name}
          secondary={a.description ?? undefined}
        />
      ),
    },
    {
      key: "status",
      header: "Estado",
      sortValue: (a) => a.status,
      width: "w-28",
      render: (a) => (
        <Badge variant={a.status === "ACTIVE" ? "success" : "default"} size="xs">
          {a.status === "ACTIVE" ? "Activo" : "Borrador"}
        </Badge>
      ),
    },
    {
      key: "output",
      header: "Salida",
      sortValue: (a) => a.outputType,
      width: "w-40",
      hideOnMobile: true,
      render: (a) => {
        const o = OUTPUT_LABELS[a.outputType];
        return o ? (
          <span className={`${TAG_CLASS} ${o.color}`}>{o.label}</span>
        ) : (
          <span className="text-gray-600">—</span>
        );
      },
    },
    {
      key: "trigger",
      header: "Disparo",
      sortValue: (a) => agentTriggerHint(a),
      width: "w-48",
      hideOnMobile: true,
      render: (a) => <span className="text-gray-400">{agentTriggerHint(a)}</span>,
    },
    {
      key: "runs",
      header: "Ejecuciones",
      sortValue: (a) => a._count.runs,
      align: "right",
      width: "w-32",
      render: (a) => <span className="tabular-nums text-gray-400">{a._count.runs}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "w-24",
      render: (a) => (
        <Button
          variant="destructive"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmTarget({ id: a.id, name: a.name });
          }}
        >
          Eliminar
        </Button>
      ),
    },
  ];

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Agentes IA"
        description="Catálogo de agentes. Se ejecutan desde su canvas en el proyecto o automáticamente al sincronizar sesiones — no desde aquí."
        action={
          <Link href="/agents/new" className={buttonVariants({ variant: "primary", size: "md" })}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo agente
          </Link>
        }
      />

      {agents.length === 0 ? (
        <EmptyState
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
          title="Sin agentes aún"
          description="Crea tu primer agente para automatizar pasos del proceso de consultoría con IA."
          action={
            <Link href="/agents/new" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Crear agente
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          {groups.map(({ cat, rows }) => (
            <section key={cat.key}>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-sm font-semibold text-fg">{cat.label}</h2>
                <span className="text-xs tabular-nums text-gray-500">{rows.length}</span>
              </div>
              <p className="mb-3 text-xs text-fg-muted">{cat.description}</p>
              <Table
                columns={columns}
                rows={rows}
                rowKey={(a) => a.id}
                onRowClick={(a) => router.push(`/agents/${a.id}`)}
                initialSort={{ key: "agent", dir: "asc" }}
              />
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmTarget}
        onConfirm={handleDelete}
        onCancel={() => setConfirmTarget(null)}
        title="¿Eliminar agente?"
        description={
          confirmTarget
            ? `"${confirmTarget.name}" se eliminará permanentemente. Esta acción no se puede deshacer.`
            : undefined
        }
        confirmLabel="Eliminar"
      />
    </div>
  );
}
