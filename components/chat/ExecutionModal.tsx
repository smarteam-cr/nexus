"use client";

import { useState, useRef, useEffect } from "react";

interface ApiTask {
  id: string;
  action: string;
  description: string;
}

interface ManualTask {
  id: string;
  title: string;
  description: string;
  steps: string[];
  helpUrl?: string;
}

interface PlanData {
  summary: string;
  apiTasks: ApiTask[];
  manualTasks: ManualTask[];
}

interface TaskState {
  id: string;
  description: string;
  status: "pending" | "running" | "success" | "failed";
  error?: string;
}

interface Props {
  plan: PlanData;
  implementationId: string;
  onClose: () => void;
  onDone: () => void;
}

const ACTION_FRIENDLY: Record<string, string> = {
  CREATE_PROPERTY: "Crear propiedad",
  UPDATE_PROPERTY: "Actualizar propiedad",
  CREATE_PROPERTY_GROUP: "Crear grupo de propiedades",
  CREATE_PIPELINE: "Crear pipeline",
  CREATE_PIPELINE_STAGE: "Crear etapa",
  CREATE_CUSTOM_OBJECT_SCHEMA: "Crear objeto personalizado",
  CREATE_ASSOCIATION_TYPE: "Crear tipo de asociación",
  CREATE_LIST: "Crear lista",
  CREATE_FORM: "Crear formulario",
  CREATE_WEBHOOK_SUBSCRIPTION: "Configurar webhook",
  INVITE_USER: "Invitar usuario",
};

function StatusIcon({ status }: { status: TaskState["status"] }) {
  if (status === "pending")
    return <div className="w-4 h-4 rounded-full border-2 border-gray-700 flex-shrink-0" />;
  if (status === "running")
    return (
      <svg className="w-4 h-4 text-brand-light animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    );
  if (status === "success")
    return (
      <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  return (
    <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
  );
}

export default function ExecutionModal({ plan, implementationId, onClose, onDone }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [phase, setPhase] = useState<"confirm" | "executing" | "done">("confirm");
  const [tasks, setTasks] = useState<TaskState[]>(
    plan.apiTasks.map((t) => ({ id: t.id, description: t.description, status: "pending" }))
  );
  const [successCount, setSuccessCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [manualCount, setManualCount] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [tasks]);

  const execute = async () => {
    setPhase("executing");

    try {
      const response = await fetch("/api/ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ implementationId }),
      });

      if (!response.ok) throw new Error("Execution failed");
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as {
              type: string;
              taskId?: string;
              status?: string;
              result?: { error?: string };
              successCount?: number;
              failCount?: number;
              manualTaskCount?: number;
            };

            if (event.type === "task_start" && event.taskId) {
              setTasks((prev) =>
                prev.map((t) => (t.id === event.taskId ? { ...t, status: "running" } : t))
              );
            } else if (event.type === "task_complete" && event.taskId) {
              setTasks((prev) =>
                prev.map((t) =>
                  t.id === event.taskId
                    ? {
                        ...t,
                        status: event.status === "SUCCESS" ? "success" : "failed",
                        error: event.result?.error,
                      }
                    : t
                )
              );
            } else if (event.type === "done") {
              setSuccessCount(event.successCount ?? 0);
              setFailCount(event.failCount ?? 0);
              setManualCount(event.manualTaskCount ?? 0);
              setPhase("done");
              onDone();
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch {
      setPhase("done");
    }
  };

  const completedCount = tasks.filter((t) => t.status === "success" || t.status === "failed").length;
  const progress = plan.apiTasks.length > 0 ? (completedCount / plan.apiTasks.length) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-950 border border-gray-700 rounded-2xl w-full max-w-xl flex flex-col max-h-[85vh] shadow-2xl">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-start justify-between gap-4 flex-shrink-0">
          <div>
            <h2 className="text-white font-semibold text-base">
              {phase === "confirm" && "Confirmar ejecución"}
              {phase === "executing" && "Ejecutando en HubSpot..."}
              {phase === "done" && (failCount === 0 ? "✅ Ejecución completada" : "⚠️ Ejecución con errores")}
            </h2>
            <p className="text-gray-500 text-sm mt-0.5 line-clamp-1">{plan.summary}</p>
          </div>
          {phase !== "executing" && (
            <button
              onClick={onClose}
              className="text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0 mt-0.5"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto" ref={logRef}>

          {/* CONFIRM phase */}
          {phase === "confirm" && (
            <div className="p-6 space-y-5">
              {/* What will happen */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Se creará automáticamente vía API
                </p>
                <div className="space-y-2">
                  {tasks.map((t) => (
                    <div key={t.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-900 border border-gray-800">
                      <div className="w-5 h-5 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm text-gray-200">{t.description}</p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {ACTION_FRIENDLY[plan.apiTasks.find((a) => a.id === t.id)?.action ?? ""] ?? ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {plan.manualTasks.length > 0 && (
                  <p className="text-xs text-gray-600 flex items-center gap-1.5">
                    <span className="text-yellow-500">📋</span>
                    Además tendrás <strong className="text-gray-400">{plan.manualTasks.length} instrucciones manuales</strong> detalladas al finalizar
                  </p>
                )}
              </div>

              {/* Safety checkbox */}
              <label className="flex items-start gap-3 p-4 rounded-xl bg-brand/5 border border-brand/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-brand flex-shrink-0"
                />
                <span className="text-sm text-gray-300 leading-relaxed">
                  Confirmo que quiero crear/modificar estos elementos en mi portal HubSpot real (
                  <span className="text-brand-light font-medium">esta acción no se puede deshacer fácilmente</span>)
                </span>
              </label>
            </div>
          )}

          {/* EXECUTING / DONE phase */}
          {(phase === "executing" || phase === "done") && (
            <div className="p-6 space-y-4">
              {/* Progress bar */}
              {phase === "executing" && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{completedCount} de {plan.apiTasks.length} tareas</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Done summary */}
              {phase === "done" && (
                <div className="flex gap-3">
                  <div className="flex-1 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                    <p className="text-2xl font-bold text-green-400">{successCount}</p>
                    <p className="text-xs text-gray-500 mt-0.5">exitosas</p>
                  </div>
                  {failCount > 0 && (
                    <div className="flex-1 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                      <p className="text-2xl font-bold text-red-400">{failCount}</p>
                      <p className="text-xs text-gray-500 mt-0.5">fallidas</p>
                    </div>
                  )}
                  {manualCount > 0 && (
                    <div className="flex-1 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-center">
                      <p className="text-2xl font-bold text-yellow-400">{manualCount}</p>
                      <p className="text-xs text-gray-500 mt-0.5">manuales</p>
                    </div>
                  )}
                </div>
              )}

              {/* Task list with live status */}
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      task.status === "running"
                        ? "bg-brand/10 border border-brand/20"
                        : task.status === "success"
                        ? "bg-green-500/5 border border-green-500/10"
                        : task.status === "failed"
                        ? "bg-red-500/5 border border-red-500/10"
                        : "bg-gray-900 border border-gray-800/50"
                    }`}
                  >
                    <div className="mt-0.5">
                      <StatusIcon status={task.status} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm ${
                          task.status === "running"
                            ? "text-brand-light"
                            : task.status === "success"
                            ? "text-green-300"
                            : task.status === "failed"
                            ? "text-red-300"
                            : "text-gray-500"
                        }`}
                      >
                        {task.description}
                      </p>
                      {task.error && (
                        <p className="text-xs text-red-400/70 mt-0.5 truncate">{task.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 flex-shrink-0">
          {phase === "confirm" && (
            <button
              onClick={execute}
              disabled={!confirmed}
              className="w-full py-3 rounded-xl bg-brand hover:bg-brand-light disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Ejecutar {plan.apiTasks.length} tareas en HubSpot
            </button>
          )}

          {phase === "executing" && (
            <div className="flex items-center justify-center gap-2 py-1">
              <svg className="w-4 h-4 text-brand-light animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-gray-400 text-sm">Ejecutando llamadas a la API de HubSpot...</span>
            </div>
          )}

          {phase === "done" && (
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors"
              >
                Cerrar
              </button>
              {plan.manualTasks.length > 0 && (
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl bg-brand hover:bg-brand-light text-white text-sm font-semibold transition-colors"
                >
                  Ver tareas manuales →
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
