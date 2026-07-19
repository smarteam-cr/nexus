"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import type { AgentOutputType } from "@prisma/client";
import { useMe } from "@/hooks/useMe";
import { Button, Input, Textarea, Field, Alert, BackLink, buttonVariants } from "@/components/ui";
import { AGENT_OUTPUT_TYPES } from "@/lib/agents/output-types";

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
  outputType: AgentOutputType;
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
  outputType: AgentOutputType;
  scope: "CLIENT" | "GLOBAL";
}

interface EffectivePrompt {
  systemPrompt: string;
  additionalInstructions: string | null;
  formatInstructions: string | null;
  nota: string;
}

interface AgentFormClientProps {
  agentId: string;
  initialData: AgentData | null;
}

export default function AgentFormClient({ agentId, initialData }: AgentFormClientProps) {
  const router = useRouter();
  const isNew = agentId === "new";
  const me = useMe();
  // Editar agentes = celda agentes.manage del mapa efectivo (delegable; SA all-true).
  // El endpoint PUT/DELETE ya usa withPermission("agentes","manage") — la UI lo espeja.
  const isSuperAdmin = me?.permissions?.sections?.agentes?.manage === true;

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
  // "Prompt efectivo": lo que realmente se envía (DB + format instructions del código).
  const [effective, setEffective] = useState<EffectivePrompt | null>(null);
  const [loadingEffective, setLoadingEffective] = useState(false);

  function toggleStage(stage: number) {
    setForm((prev) => ({
      ...prev,
      associatedStages: prev.associatedStages.includes(stage)
        ? prev.associatedStages.filter((s) => s !== stage)
        : [...prev.associatedStages, stage].sort(),
    }));
  }

  async function loadEffectivePrompt() {
    if (effective || loadingEffective) return;
    setLoadingEffective(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/effective-prompt`);
      if (res.ok) setEffective((await res.json()) as EffectivePrompt);
    } catch {
      /* el <details> queda con el aviso de carga */
    } finally {
      setLoadingEffective(false);
    }
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

  // Radios/checkboxes con label propio (Field es para controles de texto).
  const optionLabel = "flex items-center gap-2 cursor-pointer select-none";

  return (
    <div>
      <BackLink href="/agents" className="mb-4">
        Agentes
      </BackLink>

      <h1 className="text-xl font-semibold text-fg mb-6">
        {isNew ? "Nuevo agente" : "Editar agente"}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <fieldset disabled={!isSuperAdmin} className="space-y-5 border-0 p-0 m-0 min-w-0">
        <Field label="Nombre" required>
          <Input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ej: Analizador de cliente, Generador de diagnóstico..."
            required
          />
        </Field>

        <Field label="Descripción" hint="Para qué sirve este agente (opcional).">
          <Input
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Para qué sirve este agente..."
          />
        </Field>

        {/* Etapas asociadas */}
        <div>
          <p className="block text-xs font-medium text-fg-secondary mb-1.5">Etapas donde aparece</p>
          <div className="flex gap-4">
            <label className={optionLabel}>
              <input
                type="checkbox"
                checked={form.associatedStages.length === 0}
                onChange={() => setForm({ ...form, associatedStages: [] })}
                className="w-4 h-4 rounded accent-brand"
              />
              <span className="text-sm text-fg-muted">Todas las etapas</span>
            </label>
            {([1, 2, 3] as const).map((stage) => {
              const labels: Record<number, string> = { 1: "Diagnóstico", 2: "MVP", 3: "Adopción" };
              return (
                <label key={stage} className={optionLabel}>
                  <input
                    type="checkbox"
                    checked={form.associatedStages.includes(stage)}
                    onChange={() => toggleStage(stage)}
                    className="w-4 h-4 rounded accent-brand"
                  />
                  <span className="text-sm text-fg-muted">{labels[stage]}</span>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-fg-muted mt-1.5">
            Si no seleccionas ninguna etapa específica, el agente aparece en todas
          </p>
        </div>

        {/* Paso específico */}
        {form.associatedStages.length > 0 && (
          <Field
            label="Paso específico"
            hint="Índice del paso dentro de la etapa (0 = primer paso). Vacío = aplica a todos los pasos de las etapas seleccionadas."
          >
            <Input
              type="number"
              min={0}
              value={form.associatedStep ?? ""}
              onChange={(e) => setForm({ ...form, associatedStep: e.target.value === "" ? null : parseInt(e.target.value) })}
              placeholder="Ej: 0 (Análisis inicial), 1 (Kickoff)…"
            />
          </Field>
        )}

        {/* Nombre de sección */}
        {form.associatedStages.length > 0 && form.associatedStep !== null && (
          <Field
            label="Nombre de la sección"
            hint="El bloque visual dentro de la subetapa donde aparece este agente. Vacío = se usa el nombre del agente."
          >
            <Input
              type="text"
              value={form.sectionLabel}
              onChange={(e) => setForm({ ...form, sectionLabel: e.target.value })}
              placeholder="Ej: Contexto del cliente, Preparación para el Kick-off…"
            />
          </Field>
        )}

        {/* Tipo de output — catálogo ÚNICO (lib/agents/output-types): los 6 valores
            del enum, con los deprecated visibles solo si el agente ya los usa. */}
        <div>
          <p className="block text-xs font-medium text-fg-secondary mb-2">Tipo de output</p>
          <div className="flex flex-col gap-2">
            {AGENT_OUTPUT_TYPES.filter((t) => !t.deprecated || form.outputType === t.value).map((t) => (
              <label key={t.value} className={optionLabel}>
                <input
                  type="radio"
                  name="outputType"
                  value={t.value}
                  checked={form.outputType === t.value}
                  onChange={() => setForm({ ...form, outputType: t.value })}
                  className="accent-brand"
                />
                <span className="text-sm text-fg-secondary">{t.label}</span>
                <span className="text-xs text-fg-muted">— {t.hint}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Scope */}
        <div>
          <p className="block text-xs font-medium text-fg-secondary mb-2">Scope</p>
          <div className="flex gap-3">
            {(["CLIENT", "GLOBAL"] as const).map((s) => (
              <label key={s} className={optionLabel}>
                <input
                  type="radio"
                  name="scope"
                  value={s}
                  checked={form.scope === s}
                  onChange={() => setForm({ ...form, scope: s })}
                  className="accent-brand"
                />
                <span className="text-sm text-fg-secondary">
                  {s === "CLIENT" ? "Por cliente" : "Global"}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-fg-muted mt-1">
            Por cliente: requiere un cliente seleccionado para ejecutarse.
            Global: no está asociado a un cliente específico.
          </p>
        </div>

        <Field
          label="Prompt principal"
          required
          hint="Define el rol, objetivo y comportamiento del agente. Recibe automáticamente el contexto del cliente y del paso actual."
        >
          <Textarea
            value={form.systemPrompt}
            onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
            placeholder="Eres un consultor de transformación digital especializado en HubSpot. Tu objetivo es analizar la información del cliente y generar..."
            rows={8}
            className="font-mono resize-y"
            required
          />
        </Field>

        <Field
          label="Instrucciones adicionales"
          hint="Restricciones, formato de respuesta, tono, estructura esperada (opcional)."
        >
          <Textarea
            value={form.additionalInstructions}
            onChange={(e) => setForm({ ...form, additionalInstructions: e.target.value })}
            placeholder="Responde siempre en español. Usa secciones con encabezados claros. Sé conciso pero completo..."
            rows={4}
            className="resize-y"
          />
        </Field>

        {/* Prompt EFECTIVO — lo que realmente se envía (base DB + formato del código).
            Calibrar sin verlo es calibrar a ciegas: el systemPrompt es solo una parte. */}
        {!isNew && (
          <details
            className="rounded-lg border border-line bg-surface-muted px-3 py-2.5"
            onToggle={(e) => {
              if ((e.target as HTMLDetailsElement).open) void loadEffectivePrompt();
            }}
          >
            <summary className="text-xs font-medium text-fg-secondary cursor-pointer select-none">
              Ver el prompt efectivo (lo que se envía al modelo)
            </summary>
            {effective ? (
              <div className="mt-3 space-y-3">
                <p className="text-[11px] text-fg-muted">{effective.nota}</p>
                {effective.formatInstructions && (
                  <pre className="text-[11px] text-fg-secondary bg-surface border border-line rounded-lg p-3 whitespace-pre-wrap max-h-64 overflow-y-auto">
                    {effective.formatInstructions}
                  </pre>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-fg-muted">
                {loadingEffective ? "Cargando…" : "No se pudo cargar."}
              </p>
            )}
          </details>
        )}

        {/* Estado */}
        <div>
          <p className="block text-xs font-medium text-fg-secondary mb-2">Estado</p>
          <div className="flex gap-4">
            {(["ACTIVE", "DRAFT"] as const).map((s) => (
              <label key={s} className={optionLabel}>
                <input
                  type="radio"
                  name="status"
                  checked={form.status === s}
                  onChange={() => setForm({ ...form, status: s })}
                  className="accent-brand"
                />
                <span className={`text-sm font-medium ${s === "ACTIVE" ? "text-green-400" : "text-fg-muted"}`}>
                  {s === "ACTIVE" ? "Activo" : "Borrador"}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-fg-muted mt-1.5">
            Solo los agentes Activos aparecen en el workspace de clientes
          </p>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}
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
            <p className="text-sm text-fg-muted">
              Solo lectura · tu rol no tiene el permiso <span className="text-fg-secondary font-medium">Administrar agentes</span>.
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
