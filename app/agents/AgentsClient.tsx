"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

interface Agent {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "DRAFT";
  scope: "CLIENT" | "GLOBAL";
  agentType: string;
  outputType: string;
  associatedStages: number[];
  createdAt: Date;
  _count: { runs: number };
}

const STAGE_LABELS: Record<number, string> = { 1: "Diagnóstico", 2: "MVP", 3: "Adopción" };

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  SECTION:           { label: "Subetapa",              color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  CANVAS_PROJECT:    { label: "Transversal · Proyecto", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  CANVAS_CLIENT:     { label: "Transversal · Empresa",  color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  SESSION_PROCESSOR: { label: "Procesador de sesión",   color: "text-teal-400 bg-teal-500/10 border-teal-500/20" },
};

const OUTPUT_LABELS: Record<string, { label: string; color: string }> = {
  AUDIT_REPORT:       { label: "Auditoría",    color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  CARDS:              { label: "Cards",         color: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
  FLOWCHART:          { label: "Diagrama",      color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" },
  CARDS_AND_FLOWCHARTS:{ label: "Cards + Diagrama", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" },
  CARDS_AND_CHARTS:   { label: "Cards + Gráfico", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
  STREAM:             { label: "Stream",        color: "text-green-400 bg-green-500/10 border-green-500/20" },
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

  const columns: TableColumn<Agent>[] = [
    {
      key: "agent",
      header: "Agente",
      sortValue: (a) => a.name,
      render: (a) => (
        <Table.IdentityCell
          leading={
            <Card.Icon color={a.scope === "GLOBAL" ? "gray" : "brand"}>
              {a.scope === "GLOBAL" ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              )}
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
      key: "type",
      header: "Tipo",
      sortValue: (a) => a.agentType,
      width: "w-44",
      hideOnMobile: true,
      render: (a) => {
        const t = TYPE_LABELS[a.agentType];
        return t ? (
          <span className={`${TAG_CLASS} ${t.color}`}>{t.label}</span>
        ) : (
          <span className="text-gray-600">—</span>
        );
      },
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
      key: "scope",
      header: "Alcance",
      sortValue: (a) => a.scope,
      width: "w-44",
      hideOnMobile: true,
      render: (a) =>
        a.scope === "GLOBAL" ? (
          <span className="text-gray-400">Portal</span>
        ) : (
          <span className="text-gray-400">
            Cliente
            <span className="text-gray-600">
              {" · "}
              {a.associatedStages.length === 0
                ? "Todas las etapas"
                : a.associatedStages.map((s) => STAGE_LABELS[s] ?? `Etapa ${s}`).join(", ")}
            </span>
          </span>
        ),
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
        description="Configura agentes para automatizar pasos del proceso de consultoría"
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
        <Table
          columns={columns}
          rows={agents}
          rowKey={(a) => a.id}
          onRowClick={(a) => router.push(`/agents/${a.id}`)}
          search={{
            placeholder: "Buscar agentes…",
            getText: (a) => `${a.name} ${a.description ?? ""}`,
          }}
          initialSort={{ key: "agent", dir: "asc" }}
          action={
            <Link href="/agents/new" className={buttonVariants({ variant: "primary", size: "md" })}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nuevo agente
            </Link>
          }
        />
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
