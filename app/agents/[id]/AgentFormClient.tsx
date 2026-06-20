"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { useMe } from "@/hooks/useMe";
import { Button, Input, Textarea, buttonVariants } from "@/components/ui";

interface AgentData {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  additionalInstructions: string | null;
  status: "ACTIVE" | "DRAFT";
  associatedStages: number[];
  associatedStep: number | null;
  sectionLabel: string | null;
  outputType: "CARDS" | "STREAM" | "FLOWCHART" | "CARDS_AND_FLOWCHARTS";
  scope: "CLIENT" | "GLOBAL";
  pinnedKnowledgeIds?: string[];
}

interface AgentForm {
  name: string;
  description: string;
  systemPrompt: string;
  additionalInstructions: string;
  status: "ACTIVE" | "DRAFT";
  associatedStages: number[];
  associatedStep: number | null;
  sectionLabel: string;
  outputType: "CARDS" | "STREAM" | "FLOWCHART" | "CARDS_AND_FLOWCHARTS";
  scope: "CLIENT" | "GLOBAL";
}

interface AgentFormClientProps {
  agentId: string;
  initialData: AgentData | null;
}

export default function AgentFormClient({ agentId, initialData }: AgentFormClientProps) {
  const router = useRouter();
  const isNew = agentId === "new";
  const me = useMe();
  const isSuperAdmin = me?.isSuperAdmin ?? false;

  const [form, setForm] = useState<AgentForm>({
    name: initialData?.name ?? "",
    description: initialData?.description ?? "",
    systemPrompt: initialData?.systemPrompt ?? "",
    additionalInstructions: initialData?.additionalInstructions ?? "",
    status: initialData?.status ?? "DRAFT",
    associatedStages: initialData?.associatedStages ?? [],
    associatedStep:   initialData?.associatedStep ?? null,
    sectionLabel:     initialData?.sectionLabel ?? "",
    outputType:       initialData?.outputType ?? "CARDS",
    scope:            initialData?.scope ?? "CLIENT",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleStage(stage: number) {
    setForm((prev) => ({
      ...prev,
      associatedStages: prev.associatedStages.includes(stage)
        ? prev.associatedStages.filter((s) => s !== stage)
        : [...prev.associatedStages, stage].sort(),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.systemPrompt.trim()) {
      setError("El nombre y el prompt principal son obligatorios");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const url = isNew ? "/api/agents" : `/api/agents/${agentId}`;
      const method = isNew ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Error guardando el agente");
      router.push("/agents");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar el agente "${form.name}"? Esta acción no se puede deshacer.`)) return;
    setSaving(true);
    try {
      await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
      router.push("/agents");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 px-8 py-8 max-w-2xl overflow-y-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/agents" className="hover:text-gray-300 transition-colors">
          Agentes
        </Link>
        <span>/</span>
        <span className="text-gray-300">{isNew ? "Nuevo agente" : "Editar agente"}</span>
      </div>

      <h1 className="text-xl font-bold text-white mb-6">
        {isNew ? "Nuevo agente" : "Editar agente"}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <fieldset disabled={!isSuperAdmin} className="space-y-5 border-0 p-0 m-0 min-w-0">
        {/* Nombre */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Nombre <span className="text-red-400">*</span>
          </label>
          <Input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ej: Analizador de cliente, Generador de diagnóstico..."
            required
          />
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Descripción <span className="text-gray-600 font-normal">(opcional)</span>
          </label>
          <Input
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Para qué sirve este agente..."
          />
        </div>

        {/* Etapas asociadas */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Etapas donde aparece
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.associatedStages.length === 0}
                onChange={() => setForm({ ...form, associatedStages: [] })}
                className="w-4 h-4 rounded accent-brand"
              />
              <span className="text-sm text-gray-400">Todas las etapas</span>
            </label>
            {([1, 2, 3] as const).map((stage) => {
              const labels: Record<number, string> = { 1: "Diagnóstico", 2: "MVP", 3: "Adopción" };
              return (
                <label key={stage} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.associatedStages.includes(stage)}
                    onChange={() => toggleStage(stage)}
                    className="w-4 h-4 rounded accent-brand"
                  />
                  <span className="text-sm text-gray-400">{labels[stage]}</span>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-gray-600 mt-1.5">
            Si no seleccionas ninguna etapa específica, el agente aparece en todas
          </p>
        </div>

        {/* Paso específico */}
        {form.associatedStages.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Paso específico <span className="text-gray-500 font-normal text-xs">(opcional)</span>
            </label>
            <p className="text-xs text-gray-600 mb-2">
              Índice del paso dentro de la etapa (0 = primer paso, 1 = segundo, etc.).
              Vacío = aplica a todos los pasos de las etapas seleccionadas.
            </p>
            <Input
              type="number"
              min={0}
              value={form.associatedStep ?? ""}
              onChange={(e) => setForm({ ...form, associatedStep: e.target.value === "" ? null : parseInt(e.target.value) })}
              placeholder="Ej: 0 (Análisis inicial), 1 (Kickoff)…"
            />
          </div>
        )}

        {/* Nombre de sección */}
        {form.associatedStages.length > 0 && form.associatedStep !== null && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Nombre de la sección{" "}
              <span className="text-gray-500 font-normal text-xs">(opcional)</span>
            </label>
            <p className="text-xs text-gray-600 mb-2">
              Define el bloque visual dentro de la subetapa donde aparece este agente.
              Si se deja vacío, se usa el nombre del agente como título de sección.
            </p>
            <Input
              type="text"
              value={form.sectionLabel}
              onChange={(e) => setForm({ ...form, sectionLabel: e.target.value })}
              placeholder="Ej: Contexto del cliente, Preparación para el Kick-off…"
            />
          </div>
        )}

        {/* Tipo de output */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Tipo de output</label>
          <div className="flex gap-3 flex-wrap">
            {(["CARDS", "STREAM", "FLOWCHART", "CARDS_AND_FLOWCHARTS"] as const).map((type) => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="outputType"
                  value={type}
                  checked={form.outputType === type}
                  onChange={() => setForm({ ...form, outputType: type })}
                  className="accent-brand"
                />
                <span className="text-sm text-gray-300">
                  {type === "CARDS" ? "Cards editables"
                    : type === "STREAM" ? "Texto libre (streaming)"
                    : type === "FLOWCHART" ? "Diagrama de flujo"
                    : "Cards + Diagramas de flujo"}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Cards: el agente devuelve JSON y genera cards modificables.
            Streaming: output de texto libre en modal.
            Flowchart: el agente devuelve JSON con nodos y aristas para un diagrama interactivo.
          </p>
        </div>

        {/* Scope */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Scope</label>
          <div className="flex gap-3">
            {(["CLIENT", "GLOBAL"] as const).map((s) => (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  value={s}
                  checked={form.scope === s}
                  onChange={() => setForm({ ...form, scope: s })}
                  className="accent-brand"
                />
                <span className="text-sm text-gray-300">
                  {s === "CLIENT" ? "Por cliente" : "Global"}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Por cliente: requiere un cliente seleccionado para ejecutarse.
            Global: no está asociado a un cliente específico.
          </p>
        </div>

        {/* Prompt principal */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Prompt principal <span className="text-red-400">*</span>
          </label>
          <p className="text-xs text-gray-600 mb-2">
            Define el rol, objetivo y comportamiento del agente. Recibirá automáticamente el contexto del cliente y del paso actual.
          </p>
          <Textarea
            value={form.systemPrompt}
            onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
            placeholder="Eres un consultor de transformación digital especializado en HubSpot. Tu objetivo es analizar la información del cliente y generar..."
            rows={8}
            className="font-mono resize-y"
            required
          />
        </div>

        {/* Instrucciones adicionales */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Instrucciones adicionales <span className="text-gray-600 font-normal">(opcional)</span>
          </label>
          <p className="text-xs text-gray-600 mb-2">
            Restricciones, formato de respuesta, tono, estructura esperada...
          </p>
          <Textarea
            value={form.additionalInstructions}
            onChange={(e) => setForm({ ...form, additionalInstructions: e.target.value })}
            placeholder="Responde siempre en español. Usa secciones con encabezados claros. Sé conciso pero completo..."
            rows={4}
            className="resize-y"
          />
        </div>

        {/* Estado */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Estado</label>
          <div className="flex gap-4">
            {(["ACTIVE", "DRAFT"] as const).map((s) => (
              <label key={s} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  name="status"
                  checked={form.status === s}
                  onChange={() => setForm({ ...form, status: s })}
                  className="accent-brand"
                />
                <span className={`text-sm font-medium ${s === "ACTIVE" ? "text-green-400" : "text-gray-500"}`}>
                  {s === "ACTIVE" ? "Activo" : "Borrador"}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-1.5">
            Solo los agentes Activos aparecen en el workspace de clientes
          </p>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        </fieldset>

        {/* Botones — crear/editar/borrar agentes es solo Super Admin */}
        {isSuperAdmin ? (
          <div className="flex items-center justify-between pt-2 pb-8">
            <div className="flex gap-3">
              <Button type="submit" variant="primary" size="lg" loading={saving}>
                {isNew ? "Crear agente" : "Guardar cambios"}
              </Button>
              <Link
                href="/agents"
                className={buttonVariants({ variant: "secondary", size: "lg" })}
              >
                Cancelar
              </Link>
            </div>

            {!isNew && (
              <Button
                type="button"
                variant="destructive"
                size="md"
                onClick={handleDelete}
                disabled={saving}
              >
                Eliminar agente
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between pt-2 pb-8">
            <p className="text-sm text-gray-500">
              Solo lectura · solo un <span className="text-gray-300 font-medium">Super Admin</span> puede crear o editar agentes.
            </p>
            <Link
              href="/agents"
              className={buttonVariants({ variant: "secondary", size: "md" })}
            >
              Volver
            </Link>
          </div>
        )}
      </form>
    </div>
  );
}
