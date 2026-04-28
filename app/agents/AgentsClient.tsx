"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Badge, Card, buttonVariants } from "@/components/ui";

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

function AgentRow({
  agent,
  onDelete,
  deletingId,
}: {
  agent: Agent;
  onDelete: (id: string, name: string) => void;
  deletingId: string | null;
}) {
  const typeTag = TYPE_LABELS[agent.agentType];
  const outputTag = OUTPUT_LABELS[agent.outputType];

  return (
    <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors group">
      {/* Ícono */}
      <Card.Icon color={agent.scope === "GLOBAL" ? "gray" : "brand"} className="w-9 h-9">
        {agent.scope === "GLOBAL" ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        )}
      </Card.Icon>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-white truncate">{agent.name}</p>
          <Badge variant={agent.status === "ACTIVE" ? "success" : "default"} size="xs">
            {agent.status === "ACTIVE" ? "Activo" : "Borrador"}
          </Badge>
          {typeTag && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${typeTag.color}`}>
              {typeTag.label}
            </span>
          )}
          {outputTag && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${outputTag.color}`}>
              {outputTag.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {agent.description && (
            <p className="text-xs text-gray-500 truncate">{agent.description}</p>
          )}
          {agent.scope === "CLIENT" && (
            <span className="text-xs text-gray-600 flex-shrink-0">
              {agent.associatedStages.length === 0
                ? "Todas las etapas"
                : agent.associatedStages.map((s) => STAGE_LABELS[s] ?? `Etapa ${s}`).join(", ")}
            </span>
          )}
          <span className="text-xs text-gray-700 flex-shrink-0">
            {agent._count.runs} {agent._count.runs === 1 ? "ejecución" : "ejecuciones"}
          </span>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Link
          href={`/agents/${agent.id}`}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          Editar
        </Link>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onDelete(agent.id, agent.name)}
          loading={deletingId === agent.id}
        >
          {deletingId !== agent.id && "Eliminar"}
        </Button>
      </div>
    </div>
  );
}

export default function AgentsClient({ agents }: { agents: Agent[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar el agente "${name}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(id);
    try {
      await fetch(`/api/agents/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  const clientAgents = agents.filter((a) => a.scope === "CLIENT");
  const globalAgents = agents.filter((a) => a.scope === "GLOBAL");

  return (
    <div className="flex-1 px-8 py-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Agentes IA</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configura agentes para automatizar pasos del proceso de consultoría
          </p>
        </div>
        <Link
          href="/agents/new"
          className={buttonVariants({ variant: "primary", size: "md" })}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo agente
        </Link>
      </div>

      {/* Agentes de portal (globales) */}
      {globalAgents.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2">
            Portal
          </p>
          <div className="space-y-2">
            {globalAgents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                onDelete={handleDelete}
                deletingId={deletingId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Agentes de cliente */}
      {(clientAgents.length > 0 || globalAgents.length > 0) && clientAgents.length > 0 && (
        <div>
          {globalAgents.length > 0 && (
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2">
              Clientes
            </p>
          )}
          <div className="space-y-2">
            {clientAgents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                onDelete={handleDelete}
                deletingId={deletingId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Lista vacía */}
      {agents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-white font-medium">Sin agentes aún</p>
          <p className="text-gray-500 text-sm mt-1 max-w-xs">
            Crea tu primer agente para automatizar pasos del proceso de consultoría con IA
          </p>
          <Link
            href="/agents/new"
            className={buttonVariants({ variant: "primary", size: "md" }) + " mt-4"}
          >
            Crear agente
          </Link>
        </div>
      )}
    </div>
  );
}
