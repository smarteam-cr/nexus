"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ui";

interface ApiTask {
  action?: string;
  resource?: string;
  params?: { objectType?: string };
}

interface PlanData {
  summary?: string;
  apiTasks?: ApiTask[];
  manualTasks?: unknown[];
}

interface Implementation {
  id: string;
  name: string;
  status: string;
  plan: Record<string, unknown> | null;
  createdAt: Date;
  _count: {
    messages: number;
    executions: number;
  };
}

interface Props {
  implementations: Implementation[];
}

const STATUS_LABELS: Record<string, string> = {
  PLANNING: "Planificando",
  READY: "Plan listo",
  EXECUTING: "Ejecutando",
  DONE: "Completado",
  PAUSED: "Pausado",
};

const STATUS_COLORS: Record<string, string> = {
  PLANNING: "text-blue-400 bg-blue-400/10",
  READY: "text-yellow-400 bg-yellow-400/10",
  EXECUTING: "text-brand-light bg-brand-light/10",
  DONE: "text-green-400 bg-green-400/10",
  PAUSED: "text-gray-400 bg-gray-400/10",
};

const OBJECT_LABELS: Record<string, string> = {
  contacts: "Contactos",
  companies: "Empresas",
  deals: "Deals",
  tickets: "Tickets",
};

const OBJECT_ICONS: Record<string, string> = {
  contacts: "👤",
  companies: "🏢",
  deals: "💼",
  tickets: "🎫",
};

// Objetos estándar en orden de visualización
const STANDARD_OBJECTS = ["contacts", "companies", "deals", "tickets"];

// Acciones que NO pertenecen a un objeto CRM (se omiten del conteo)
const NON_OBJECT_ACTIONS = new Set([
  "INVITE_USER",
  "CREATE_WEBHOOK_SUBSCRIPTION",
  "CREATE_FORM",
]);

/**
 * Extrae el tipo de objeto de una tarea del plan.
 * 1. params.objectType (más confiable, lo setea el AI explícitamente)
 * 2. resource.split('.')[0] (fallback: el resource viene en formato "contacts.nombre")
 */
function extractObjectType(task: ApiTask): string | null {
  // Omitir acciones que no corresponden a objetos CRM
  if (task.action && NON_OBJECT_ACTIONS.has(task.action)) return null;

  // 1. params.objectType
  if (task.params?.objectType) return task.params.objectType;

  // 2. Extraer del resource: "contacts.canal_adquisicion" → "contacts"
  if (task.resource) {
    const dotIndex = task.resource.indexOf(".");
    if (dotIndex > 0) return task.resource.substring(0, dotIndex);
  }

  return null;
}

function getPlanStats(plan: Record<string, unknown> | null): {
  objectCounts: Record<string, number>;
  totalApiTasks: number;
  totalManualTasks: number;
} {
  if (!plan) return { objectCounts: {}, totalApiTasks: 0, totalManualTasks: 0 };

  const planData = plan as unknown as PlanData;
  const apiTasks = Array.isArray(planData.apiTasks) ? planData.apiTasks : [];
  const manualTasks = Array.isArray(planData.manualTasks)
    ? planData.manualTasks
    : [];

  const objectCounts: Record<string, number> = {};
  for (const task of apiTasks) {
    const objectType = extractObjectType(task);
    if (objectType) {
      objectCounts[objectType] = (objectCounts[objectType] || 0) + 1;
    }
  }

  return {
    objectCounts,
    totalApiTasks: apiTasks.length,
    totalManualTasks: manualTasks.length,
  };
}

function PlanSummary({
  plan,
  status,
}: {
  plan: Record<string, unknown> | null;
  status: string;
}) {
  // Sin plan todavía
  if (!plan) {
    // Solo mostrar indicador si todavía está en planificación
    if (status === "PLANNING") {
      return (
        <div className="mt-1.5">
          <span className="inline-flex items-center gap-1 text-xs text-gray-600 italic">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Plan aún no generado
          </span>
        </div>
      );
    }
    return null;
  }

  const { objectCounts, totalApiTasks, totalManualTasks } = getPlanStats(plan);

  const standardObjects = STANDARD_OBJECTS.filter(
    (obj) => objectCounts[obj] > 0
  );
  const customObjects = Object.keys(objectCounts).filter(
    (obj) => !STANDARD_OBJECTS.includes(obj) && objectCounts[obj] > 0
  );
  const hasObjectData = standardObjects.length > 0 || customObjects.length > 0;

  return (
    <div className="mt-2 space-y-1.5">
      {/* Pills por objeto */}
      {hasObjectData ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {standardObjects.map((obj) => (
            <span
              key={obj}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-800 border border-gray-700 text-xs text-gray-300"
            >
              <span>{OBJECT_ICONS[obj]}</span>
              {OBJECT_LABELS[obj]}
              <span className="text-gray-500 font-medium tabular-nums">
                {objectCounts[obj]}
              </span>
            </span>
          ))}
          {customObjects.map((obj) => (
            <span
              key={obj}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-xs text-purple-400"
            >
              ✦{" "}
              <span className="capitalize">{obj.replace(/_/g, " ")}</span>
              <span className="text-purple-500 font-medium tabular-nums">
                {objectCounts[obj]}
              </span>
            </span>
          ))}
        </div>
      ) : (
        /* Fallback: no hay objectType extraíble, mostrar totales */
        <div className="flex items-center gap-1.5">
          {totalApiTasks > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-800 border border-gray-700 text-xs text-gray-400">
              ⚡ {totalApiTasks} tareas API
            </span>
          )}
          {totalManualTasks > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-800 border border-gray-700 text-xs text-gray-400">
              📋 {totalManualTasks} manuales
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function ImplementationsList({ implementations }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [toDelete, setToDelete] = useState<Implementation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await fetch(`/api/implementations/${toDelete.id}`, { method: "DELETE" });
      setToDelete(null);
      startTransition(() => router.refresh());
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="grid gap-3">
        {implementations.map((impl) => (
          <div
            key={impl.id}
            className="group relative flex items-center justify-between px-5 py-4 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 hover:bg-gray-800/70 transition-all duration-150"
          >
            {/* Link invisible que cubre toda la card */}
            <Link
              href={`/implementation/${impl.id}/plan`}
              className="absolute inset-0 rounded-xl"
              aria-label={impl.name}
            />

            {/* Contenido izquierdo */}
            <div className="flex items-center gap-3 min-w-0 relative z-10 pointer-events-none flex-1">
              {/* Ícono */}
              <div className="w-8 h-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center flex-shrink-0 self-start mt-0.5">
                <svg
                  className="w-4 h-4 text-brand-light"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>

              {/* Textos */}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white truncate">{impl.name}</p>

                {/* Resumen del plan (pills por objeto o totales) */}
                <PlanSummary plan={impl.plan} status={impl.status} />

                {/* Metadata */}
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-1.5">
                  <span>{impl._count.messages} mensajes</span>
                  <span>·</span>
                  <span>{impl._count.executions} acciones</span>
                  <span>·</span>
                  <span>
                    {new Date(impl.createdAt).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* Acciones derechas */}
            <div className="relative z-10 flex items-center gap-2 flex-shrink-0 ml-3 self-start mt-1">
              {/* Status badge */}
              <span
                className={`text-xs font-medium px-2 py-1 rounded-md ${STATUS_COLORS[impl.status]}`}
              >
                {STATUS_LABELS[impl.status]}
              </span>

              {/* Botón eliminar — aparece al hacer hover */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setToDelete(impl);
                }}
                className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all duration-150"
                title="Eliminar implementación"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>

              {/* Flecha */}
              <svg
                className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </div>
        ))}
      </div>

      {/* Confirmación de borrado */}
      <ConfirmDialog
        open={!!toDelete}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
        loading={deleting}
        title="¿Eliminar implementación?"
        description={
          toDelete
            ? `"${toDelete.name}" se eliminará permanentemente. Esta acción no se puede deshacer.`
            : undefined
        }
        confirmLabel="Eliminar"
      />
    </>
  );
}
