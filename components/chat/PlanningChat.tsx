"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import ExecutionModal from "./ExecutionModal";

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
}

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

interface PlanData {
  summary: string;
  businessContext: string;
  apiTasks: ApiTask[];
  manualTasks: ManualTask[];
}

interface SuggestionOption {
  label: string;
  description: string;
}

interface Props {
  implementationId: string;
  initialMessages: Message[];
  hasPlan: boolean;
  status: string;
}

const ACTION_LABELS: Record<string, { label: string; emoji: string }> = {
  CREATE_PROPERTY: { label: "Propiedad personalizada", emoji: "🏷️" },
  UPDATE_PROPERTY: { label: "Actualizar propiedad", emoji: "✏️" },
  CREATE_PROPERTY_GROUP: { label: "Grupo de propiedades", emoji: "📂" },
  CREATE_PIPELINE: { label: "Pipeline", emoji: "📊" },
  CREATE_PIPELINE_STAGE: { label: "Etapa de pipeline", emoji: "🔵" },
  CREATE_CUSTOM_OBJECT_SCHEMA: { label: "Objeto personalizado", emoji: "🏗️" },
  CREATE_ASSOCIATION_TYPE: { label: "Tipo de asociación", emoji: "🔗" },
  CREATE_LIST: { label: "Lista", emoji: "📋" },
  CREATE_FORM: { label: "Formulario", emoji: "📝" },
  CREATE_WEBHOOK_SUBSCRIPTION: { label: "Webhook", emoji: "🪝" },
  INVITE_USER: { label: "Usuario", emoji: "👤" },
};

function parsePlanFromContent(content: string): {
  textBefore: string;
  plan: PlanData | null;
  textAfter: string;
} {
  const match = content.match(/([\s\S]*?)```json\s*([\s\S]*?)\s*```([\s\S]*)/);
  if (!match) return { textBefore: content, plan: null, textAfter: "" };

  try {
    const parsed = JSON.parse(match[2]) as PlanData;
    if (parsed.apiTasks && parsed.manualTasks) {
      return {
        textBefore: match[1].trim(),
        plan: parsed,
        textAfter: match[3].trim(),
      };
    }
  } catch {
    // not a valid plan
  }
  return { textBefore: content, plan: null, textAfter: "" };
}

/** Extrae opciones de bullet points del último mensaje del asistente */
function extractSuggestions(content: string): SuggestionOption[] {
  if (!content) return [];
  const lines = content.split("\n");
  const options: SuggestionOption[] = [];

  for (const line of lines) {
    const match = line.match(/^[\s]*(?:[-*]|\d+[.):])\s+(.+)/);
    if (match) {
      const raw = match[1].replace(/\*\*/g, "").replace(/`/g, "").trim();
      if (raw.length === 0 || raw.length > 140) continue;
      // Ignorar bullets que son preguntas (terminan en ?)
      if (raw.endsWith("?")) continue;
      // Si tiene ": " cerca del inicio, separar en label + description
      const colonIdx = raw.indexOf(": ");
      if (colonIdx > 0 && colonIdx < 50) {
        options.push({ label: raw.slice(0, colonIdx).trim(), description: raw.slice(colonIdx + 2).trim() });
      } else {
        options.push({ label: raw, description: "" });
      }
    }
  }

  // Solo mostrar si hay entre 2 y 7 opciones (evita listas genéricas largas)
  return options.length >= 2 && options.length <= 7 ? options : [];
}

/** Devuelve el texto antes del primer bullet point (intro sin la lista) */
function extractIntroText(content: string): string {
  const lines = content.split("\n");
  const firstBulletIdx = lines.findIndex((l) =>
    /^[\s]*[-*]\s/.test(l) || /^[\s]*\d+[.)]\s/.test(l)
  );
  if (firstBulletIdx <= 0) return content;
  return lines.slice(0, firstBulletIdx).join("\n").trim();
}

/** Extrae la última pregunta (termina en ?) del mensaje del asistente */
function extractQuestion(content: string): string {
  // Buscar la última frase que termine en ?
  const clean = content.replace(/```[\s\S]*?```/g, "").replace(/\*\*/g, "");
  const lines = clean.split("\n").reverse();
  for (const line of lines) {
    const l = line.trim();
    if (l.endsWith("?") && l.length > 10 && l.length < 300) return l;
  }
  return "";
}

/** Card interactivo que reemplaza el input cuando el AI hace una pregunta con opciones */
function QuestionCard({
  question,
  options,
  onSubmit,
  onSkip,
}: {
  question: string;
  options: SuggestionOption[];
  onSubmit: (text: string) => void;
  onSkip: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [custom, setCustom] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const canSubmit = selected.size > 0 || custom.trim().length > 0;
  const hasCustom = custom.trim().length > 0;

  const handleSubmit = () => {
    const parts = [...selected]
      .sort((a, b) => a - b)
      .map((i) => options[i].label);
    if (custom.trim()) parts.push(custom.trim());
    onSubmit(parts.join(", "));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && canSubmit) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border border-gray-700 rounded-2xl bg-gray-900 overflow-hidden">
      {/* Header con pregunta */}
      {question && (
        <div className="px-5 py-4 border-b border-gray-800">
          <p className="text-white text-sm font-medium leading-snug">{question}</p>
        </div>
      )}

      {/* Opciones — sin divide-y para que border-gray-800 use el override de light mode */}
      <div>
        {options.map((opt, i) => {
          const isChecked = selected.has(i);
          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              className={`w-full flex items-start gap-4 px-5 py-3.5 text-left transition-colors ${
                i > 0 ? "border-t border-gray-800" : ""
              } ${isChecked ? "bg-brand/10" : "hover:bg-gray-800/60"}`}
            >
              {/* Checkbox */}
              <div
                className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                  isChecked
                    ? "bg-brand border-brand"
                    : "border-gray-600"
                }`}
              >
                {isChecked && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>

              {/* Texto */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${isChecked ? "text-white" : "text-gray-200"}`}>
                  {opt.label}
                </p>
                {opt.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{opt.description}</p>
                )}
              </div>

              {/* Número */}
              <div
                className={`flex-shrink-0 w-6 h-6 rounded text-xs font-semibold flex items-center justify-center transition-colors ${
                  isChecked
                    ? "bg-brand text-white"
                    : "bg-gray-800 text-gray-500"
                }`}
              >
                {i + 1}
              </div>
            </button>
          );
        })}

        {/* Campo abierto — clickeable, checkbox reactivo al contenido del input */}
        <div
          className="flex items-center gap-4 px-5 py-3.5 border-t border-gray-800 cursor-text"
          onClick={() => customInputRef.current?.focus()}
        >
          <div
            className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
              hasCustom ? "bg-brand border-brand" : "border-gray-600"
            }`}
          >
            {hasCustom && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <input
            ref={customInputRef}
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe algo más..."
            className="flex-1 bg-transparent text-sm text-gray-300 placeholder-gray-600 outline-none px-2.5 py-1.5"
          />
          <div
            className={`flex-shrink-0 w-6 h-6 rounded text-xs font-semibold flex items-center justify-center transition-colors ${
              hasCustom ? "bg-brand text-white" : "bg-gray-800 text-gray-500"
            }`}
          >
            {options.length + 1}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3.5 border-t border-gray-800 flex items-center justify-between gap-3">
        <button
          onClick={onSkip}
          className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
        >
          Omitir
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="px-5 py-2 rounded-lg bg-brand hover:bg-brand-light disabled:opacity-35 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center gap-1.5"
        >
          Continuar
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function groupApiTasks(tasks: ApiTask[]): Record<string, ApiTask[]> {
  return tasks.reduce(
    (acc, task) => {
      if (!acc[task.action]) acc[task.action] = [];
      acc[task.action].push(task);
      return acc;
    },
    {} as Record<string, ApiTask[]>
  );
}

function PlanCard({
  plan,
  onExecute,
}: {
  plan: PlanData;
  implementationId: string;
  onExecute: () => void;
}) {
  const grouped = groupApiTasks(plan.apiTasks);

  return (
    <div className="rounded-2xl border border-brand/30 bg-brand/5 overflow-hidden">
      <div className="px-5 py-4 border-b border-brand/20 bg-brand/10">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-brand-light">⚡</span>
          <span className="text-white font-semibold text-sm">Plan de implementación listo</span>
        </div>
        <p className="text-gray-300 text-sm leading-relaxed">{plan.summary}</p>
        {plan.businessContext && (
          <p className="text-gray-500 text-xs mt-1.5 leading-relaxed">{plan.businessContext}</p>
        )}
      </div>

      <div className="p-5 grid md:grid-cols-2 gap-5">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-green-400 text-xs font-semibold uppercase tracking-wider">
              Auto via API · {plan.apiTasks.length} tareas
            </span>
          </div>
          <div className="space-y-2.5">
            {Object.entries(grouped).map(([action, tasks]) => {
              const info = ACTION_LABELS[action] ?? { label: action, emoji: "⚙️" };
              return (
                <div key={action} className="text-sm">
                  <div className="flex items-center gap-1.5 text-gray-200">
                    <span>{info.emoji}</span>
                    <span className="font-medium">
                      {tasks.length > 1 ? `${tasks.length} ` : ""}
                      {info.label}{tasks.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="ml-5 mt-0.5 space-y-0.5">
                    {tasks.slice(0, 2).map((t) => (
                      <p key={t.id} className="text-gray-500 text-xs truncate">· {t.description}</p>
                    ))}
                    {tasks.length > 2 && (
                      <p className="text-gray-600 text-xs">· y {tasks.length - 2} más</p>
                    )}
                  </div>
                </div>
              );
            })}
            {plan.apiTasks.length === 0 && (
              <p className="text-gray-600 text-xs">Sin tareas automáticas</p>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <svg className="w-3 h-3 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <span className="text-yellow-400 text-xs font-semibold uppercase tracking-wider">
              Manual en HubSpot · {plan.manualTasks.length} tareas
            </span>
          </div>
          <div className="space-y-2.5">
            {plan.manualTasks.slice(0, 4).map((task) => (
              <div key={task.id} className="text-sm">
                <div className="flex items-center gap-1.5 text-gray-200">
                  <span>📋</span>
                  <span className="font-medium truncate">{task.title}</span>
                </div>
                <p className="ml-5 text-gray-500 text-xs mt-0.5 line-clamp-1">{task.description}</p>
              </div>
            ))}
            {plan.manualTasks.length > 4 && (
              <p className="text-gray-600 text-xs ml-5">· y {plan.manualTasks.length - 4} tareas más</p>
            )}
            {plan.manualTasks.length === 0 && (
              <p className="text-gray-600 text-xs">Sin tareas manuales</p>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 pb-5 space-y-3">
        <div className="flex gap-2 p-3 rounded-xl bg-gray-900/50 border border-gray-800 text-xs text-gray-400">
          <svg className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            La herramienta ejecutará las{" "}
            <strong className="text-gray-300">{plan.apiTasks.length} tareas automáticas</strong> vía tu
            conexión OAuth de HubSpot. Las{" "}
            <strong className="text-gray-300">{plan.manualTasks.length} tareas manuales</strong> tendrán
            instrucciones paso a paso detalladas.
          </span>
        </div>
        <button
          onClick={onExecute}
          className="w-full py-3 rounded-xl bg-brand hover:bg-brand-light text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Ejecutar implementación en HubSpot
        </button>
      </div>
    </div>
  );
}

export default function PlanningChat({
  implementationId,
  initialMessages,
  hasPlan,
}: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(
    initialMessages.length === 0
      ? [
          {
            role: "assistant",
            content:
              "¡Hola! Soy tu consultor de implementación de HubSpot. Ya estoy conectado a tu portal y analizando su estado actual.\n\nPara diseñar la mejor arquitectura para tu negocio, cuéntame:\n\n**¿A qué se dedica tu empresa y cuál es el principal objetivo que quieres lograr con esta implementación de HubSpot?**",
          },
        ]
      : initialMessages
  );
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [planDetected, setPlanDetected] = useState(hasPlan);
  const [activePlan, setActivePlan] = useState<PlanData | null>(null);
  const [showModal, setShowModal] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Derivar sugerencias del último mensaje del asistente (solo cuando no está cargando y no hay plan)
  const lastAssistantIdx = messages.reduce(
    (last, msg, i) => (msg.role === "assistant" ? i : last),
    -1
  );
  const lastAssistantMsg = lastAssistantIdx >= 0 ? messages[lastAssistantIdx] : null;
  const hasPlanInMsg = lastAssistantMsg
    ? parsePlanFromContent(lastAssistantMsg.content).plan !== null
    : false;

  const suggestions =
    !isLoading && lastAssistantMsg && !hasPlanInMsg
      ? extractSuggestions(lastAssistantMsg.content)
      : [];

  const questionTitle =
    suggestions.length > 0 && lastAssistantMsg
      ? extractQuestion(lastAssistantMsg.content)
      : "";

  const sendMessage = async (text?: string) => {
    const toSend = (text ?? input).trim();
    if (!toSend || isLoading) return;

    const userMessage: Message = { role: "user", content: toSend };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ implementationId, message: toSend }),
      });

      if (!response.ok) throw new Error("Request failed");

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: fullText };
          return updated;
        });
      }

      const { plan } = parsePlanFromContent(fullText);
      if (plan) {
        setPlanDetected(true);
        setActivePlan(plan);
        router.refresh();
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Lo siento, hubo un error al procesar tu mensaje. Por favor intenta de nuevo.",
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const findPlanInHistory = (): PlanData | null => {
    if (activePlan) return activePlan;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant") {
        const { plan } = parsePlanFromContent(m.content);
        if (plan) return plan;
      }
    }
    return null;
  };

  const handleOpenModal = () => {
    const plan = findPlanInHistory();
    if (plan) {
      setActivePlan(plan);
      setShowModal(true);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      {/* Modal de ejecución */}
      {showModal && activePlan && (
        <ExecutionModal
          plan={activePlan}
          implementationId={implementationId}
          onClose={() => setShowModal(false)}
          onDone={() => router.refresh()}
        />
      )}

      {/* Banner plan listo */}
      {planDetected && (
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-2.5 bg-green-500/10 border-b border-green-500/20">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-green-400 text-sm font-medium">
              Plan listo — las tareas automáticas están pendientes de ejecutar
            </span>
          </div>
          <button
            onClick={handleOpenModal}
            className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-light text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Ejecutar en HubSpot
          </button>
        </div>
      )}

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((msg, i) => {
            // Si es el último mensaje del asistente y hay QuestionCard activo,
            // mostrar solo el texto introductorio (sin repetir la pregunta/lista)
            const isLastAssistantWithCard =
              i === lastAssistantIdx && suggestions.length > 0;

            // Durante streaming del último mensaje: si ya aparecieron bullets,
            // ocultar la lista y mostrar solo el intro + loader para evitar
            // el desplazamiento raro cuando el QuestionCard toma las opciones.
            const isStreamingLastMsg =
              isLoading && i === messages.length - 1 && msg.role === "assistant";
            const streamingHasBullets =
              isStreamingLastMsg &&
              msg.content.length > 0 &&
              /^[\s]*(?:[-*]|\d+[.):])\s+/m.test(msg.content);

            const rawContent =
              isLastAssistantWithCard || streamingHasBullets
                ? extractIntroText(msg.content)
                : msg.content;

            const { textBefore, plan, textAfter } =
              msg.role === "assistant"
                ? parsePlanFromContent(rawContent)
                : { textBefore: rawContent, plan: null, textAfter: "" };

            return (
              <div
                key={i}
                className={`flex gap-3 min-w-0 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                    msg.role === "user"
                      ? "bg-brand/20 text-brand-light"
                      : "bg-blue-500/20 text-blue-400"
                  }`}
                >
                  {msg.role === "user" ? "Tú" : "IA"}
                </div>

                <div
                  className={`flex flex-col gap-3 min-w-0 ${
                    msg.role === "user" ? "items-end" : "items-start"
                  } max-w-2xl flex-1`}
                >
                  {(textBefore || (!plan && msg.content)) && (
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-brand/10 border border-brand/20 text-gray-200"
                          : "bg-gray-900 border border-gray-800 text-gray-300"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        msg.content ? (
                          <div className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown>{textBefore || msg.content}</ReactMarkdown>
                            {textAfter && <ReactMarkdown>{textAfter}</ReactMarkdown>}
                            {/* Loader inline cuando se están generando las opciones */}
                            {streamingHasBullets && (
                              <span className="inline-flex gap-1 mt-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:0ms]" />
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:150ms]" />
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:300ms]" />
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:0ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:150ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:300ms]" />
                          </span>
                        )
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  )}

                  {msg.role === "assistant" && !msg.content && (
                    <div className="rounded-2xl px-4 py-3 bg-gray-900 border border-gray-800">
                      <span className="inline-flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:300ms]" />
                      </span>
                    </div>
                  )}

                  {plan && (
                    <div className="w-full min-w-0">
                      <PlanCard
                        plan={plan}
                        implementationId={implementationId}
                        onExecute={() => {
                          setActivePlan(plan);
                          setShowModal(true);
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Área de input */}
      <div className="flex-shrink-0 border-t border-gray-800 px-4 py-4">
        <div className="max-w-3xl mx-auto space-y-3">
          {/* QuestionCard — reemplaza el textarea cuando hay opciones */}
          {suggestions.length > 0 ? (
            <QuestionCard
              question={questionTitle}
              options={suggestions}
              onSubmit={(text) => sendMessage(text)}
              onSkip={() => sendMessage("Omitir")}
            />
          ) : (
            <>
              <div className="flex gap-3">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    planDetected
                      ? "Puedes ajustar el plan o hacer preguntas..."
                      : "Describe tu negocio o responde las preguntas..."
                  }
                  rows={2}
                  disabled={isLoading}
                  className="flex-1 px-4 py-3 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm placeholder-gray-500 outline-none focus:border-brand resize-none transition-colors disabled:opacity-50"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={isLoading || !input.trim()}
                  className="px-4 py-3 rounded-xl bg-brand hover:bg-brand-light disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors self-end"
                >
                  {isLoading ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-600 text-center">
                Shift+Enter para nueva línea · Enter para enviar
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
