"use client";

import { useState, useRef, useEffect } from "react";

interface ApiTask {
  id: string;
  action: string;
  resource: string;
  description: string;
  params: Record<string, unknown>;
}

interface ManualTask {
  id: string;
  title: string;
  description: string;
  steps: string[];
  helpUrl?: string;
}

interface Plan {
  summary: string;
  businessContext: string;
  apiTasks: ApiTask[];
  manualTasks: ManualTask[];
}

interface ExecutionLog {
  id: string;
  action: string;
  resource: string;
  status: string;
  details: Record<string, unknown>;
  createdAt: string;
}

interface ExecutionEvent {
  type: string;
  taskId?: string;
  index?: number;
  total?: number;
  status?: string;
  message?: string;
  result?: { status: string; error?: string; data?: unknown };
  successCount?: number;
  failCount?: number;
  manualTaskCount?: number;
}

interface Props {
  implementationId: string;
  plan: Plan;
  existingLogs: ExecutionLog[];
  status: string;
}

const STATUS_ICON: Record<string, string> = {
  SUCCESS: "✓",
  FAILED: "✗",
  MANUAL_REQUIRED: "👤",
  running: "⟳",
  pending: "○",
};

const STATUS_COLOR: Record<string, string> = {
  SUCCESS: "text-green-400",
  FAILED: "text-red-400",
  MANUAL_REQUIRED: "text-yellow-400",
  running: "text-blue-400 animate-pulse",
  pending: "text-gray-600",
};

export default function ExecutionView({
  implementationId,
  plan,
  existingLogs,
  status: initialStatus,
}: Props) {
  const [logs, setLogs] = useState<ExecutionLog[]>(existingLogs);
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    existingLogs.forEach((l) => {
      const task = plan.apiTasks.find((t) => t.action === l.action && t.resource === l.resource);
      if (task) map[task.id] = l.status;
    });
    return map;
  });
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(
    initialStatus === "DONE" && existingLogs.length > 0
  );
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [completedManual, setCompletedManual] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<ExecutionEvent | null>(null);
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, currentTaskId]);

  const startExecution = async () => {
    setIsRunning(true);
    setTaskStatuses({});
    setLogs([]);

    try {
      const response = await fetch("/api/ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ implementationId }),
      });

      if (!response.ok) throw new Error("Execution failed");

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6)) as ExecutionEvent;

          if (data.type === "task_start") {
            setCurrentTaskId(data.taskId ?? null);
            setTaskStatuses((prev) => ({
              ...prev,
              [data.taskId!]: "running",
            }));
          } else if (data.type === "task_complete") {
            setCurrentTaskId(null);
            setTaskStatuses((prev) => ({
              ...prev,
              [data.taskId!]: data.result?.status ?? "FAILED",
            }));
            setLogs((prev) => [
              ...prev,
              {
                id: data.taskId!,
                action: "",
                resource: "",
                status: data.result?.status ?? "FAILED",
                details: data.result as Record<string, unknown>,
                createdAt: new Date().toISOString(),
              },
            ]);
          } else if (data.type === "done") {
            setIsDone(true);
            setIsRunning(false);
            setSummary(data);
          }
        }
      }
    } catch {
      setIsRunning(false);
    }
  };

  const alreadyExecuted = existingLogs.length > 0 && initialStatus === "DONE";

  return (
    <div className="flex flex-col h-[calc(100vh-57px)] overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {/* Left: API Tasks */}
        <div className="w-1/2 border-r border-gray-800 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">⚡ Tareas API</h2>
              <p className="text-xs text-gray-500">{plan.apiTasks.length} acciones automatizables</p>
            </div>
            {!alreadyExecuted && !isDone && (
              <button
                onClick={startExecution}
                disabled={isRunning}
                className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-light disabled:opacity-50 text-white text-xs font-medium transition-colors"
              >
                {isRunning ? "Ejecutando..." : "▶ Ejecutar todo"}
              </button>
            )}
          </div>

          {/* Plan summary */}
          <div className="px-4 py-3 bg-gray-900/50 border-b border-gray-800">
            <p className="text-xs text-gray-400">{plan.summary}</p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {plan.apiTasks.map((task, i) => {
              const taskStatus = taskStatuses[task.id] ?? (alreadyExecuted ? "SUCCESS" : "pending");
              return (
                <div
                  key={task.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    currentTaskId === task.id
                      ? "border-blue-500/50 bg-blue-500/5"
                      : taskStatus === "SUCCESS"
                      ? "border-green-500/20 bg-green-500/5"
                      : taskStatus === "FAILED"
                      ? "border-red-500/20 bg-red-500/5"
                      : "border-gray-800 bg-gray-900/50"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`flex-shrink-0 text-sm mt-0.5 ${STATUS_COLOR[taskStatus]}`}
                    >
                      {STATUS_ICON[taskStatus]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white">{task.description}</p>
                      <p className="text-xs text-gray-500 mt-0.5 font-mono">{task.resource}</p>
                    </div>
                    <span className="flex-shrink-0 text-xs text-gray-600">#{i + 1}</span>
                  </div>
                </div>
              );
            })}
            <div ref={logsRef} />
          </div>

          {/* Summary */}
          {summary && (
            <div className="px-4 py-3 border-t border-gray-800 bg-gray-900/50">
              <p className="text-xs text-gray-400">{summary.message}</p>
              <div className="flex gap-3 mt-1">
                <span className="text-xs text-green-400">✓ {summary.successCount} exitosas</span>
                {(summary.failCount ?? 0) > 0 && (
                  <span className="text-xs text-red-400">✗ {summary.failCount} fallidas</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Manual Tasks */}
        <div className="w-1/2 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">👤 Tareas Manuales</h2>
            <p className="text-xs text-gray-500">
              {plan.manualTasks.length} acciones que debes hacer en HubSpot
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {plan.manualTasks.map((task, i) => {
              const done = completedManual.has(task.id);
              return (
                <div
                  key={task.id}
                  className={`p-4 rounded-xl border ${
                    done
                      ? "border-green-500/20 bg-green-500/5 opacity-60"
                      : "border-gray-800 bg-gray-900"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="text-xs text-gray-500">Paso {i + 1}</span>
                      <h3 className="text-sm font-medium text-white">{task.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>
                    </div>
                    <button
                      onClick={() =>
                        setCompletedManual((prev) => {
                          const next = new Set(prev);
                          if (done) next.delete(task.id);
                          else next.add(task.id);
                          return next;
                        })
                      }
                      className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                        done
                          ? "bg-green-500 border-green-500 text-white"
                          : "border-gray-600 hover:border-green-500"
                      }`}
                    >
                      {done && (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  </div>

                  <ol className="space-y-1 mt-3">
                    {task.steps.map((step, si) => (
                      <li key={si} className="flex gap-2 text-xs text-gray-400">
                        <span className="flex-shrink-0 text-gray-600">{si + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>

                  {task.helpUrl && (
                    <a
                      href={task.helpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-3 text-xs text-blue-400 hover:text-blue-300"
                    >
                      Ver documentación →
                    </a>
                  )}
                </div>
              );
            })}

            {plan.manualTasks.length === 0 && (
              <div className="text-center py-10 text-gray-600 text-sm">
                No hay tareas manuales — ¡todo se puede hacer via API!
              </div>
            )}
          </div>

          {/* Progress */}
          {plan.manualTasks.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-800">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Progreso manual</span>
                <span>{completedManual.size}/{plan.manualTasks.length}</span>
              </div>
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${(completedManual.size / plan.manualTasks.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
