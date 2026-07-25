"use client";

/**
 * components/canvas/implementacion-sections/PromptsBreezeSection.tsx
 *
 * EL ÚNICO componente propio del canvas "Implementación": los prompts para Breeze.
 * Todo el resto reusa renderers del motor (props_table, process_mapping, prosa, CTA).
 *
 * Por qué este sí necesita componente: su unidad es un PROMPT LITERAL multilínea que se
 * copia y se pega en Breeze — con su objetivo, su precondición y su estado de
 * verificación. Ningún renderer del catálogo muestra un bloque monoespaciado con botón
 * de copiar; los `detail` de una línea no lo expresan.
 *
 * El badge ámbar "Sin verificar" aparece cuando `estado === "sin_verificar"`: el agente
 * generó sin la spec de Breeze cargada (o la spec no cubre esa capacidad), y el CSE
 * valida antes de pegar. Es la mitad visible del gate de conocimiento.
 */
import { useState, type FC } from "react";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "@/components/landing/inline";
import { SortableItems } from "@/components/landing/sortable";
import type { SectionProps } from "@/components/landing/types";

export interface BreezePrompt {
  titulo?: string;
  objetivo?: string;
  prompt?: string;
  precondicion?: string;
  estado?: string; // "listo" | "sin_verificar"
}
export interface PromptsBreezeData {
  intro?: string;
  prompts?: BreezePrompt[];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      style={{
        flexShrink: 0,
        fontSize: 12,
        fontWeight: 600,
        padding: "4px 10px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: copied ? "var(--bg-soft)" : "var(--bg)",
        color: "var(--text-2)",
        cursor: "pointer",
      }}
      title="Copiar el prompt para pegarlo en Breeze"
    >
      {copied ? "Copiado ✓" : "Copiar"}
    </button>
  );
}

export const PromptsBreezeSection: FC<SectionProps<PromptsBreezeData>> = ({ data, editable, onChange }) => {
  const prompts = data.prompts ?? [];
  const set = (next: Partial<PromptsBreezeData>) => onChange?.({ ...data, ...next });
  const setPrompt = (i: number, patch: Partial<BreezePrompt>) =>
    set({ prompts: replaceAt(prompts, i, { ...prompts[i], ...patch }) });

  return (
    <>
      {(editable || data.intro) && (
        <Editable
          as="p"
          className="stl-lead"
          editable={editable}
          value={data.intro ?? ""}
          placeholder="Cómo usar estos prompts (opcional)…"
          onCommit={(v) => set({ intro: v })}
        />
      )}

      <SortableItems
        items={prompts}
        disabled={!editable}
        onReorder={(next) => set({ prompts: next })}
        container={(nodes) => <div className="stl-stack">{nodes}</div>}
      >
        {(p, i, handle) => (
          <div className="stl-item stl-card">
            {handle}
            {editable && <RemoveBtn onClick={() => set({ prompts: removeAt(prompts, i) })} />}

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Editable
                as="h3"
                className="stl-card-title"
                editable={editable}
                value={p.titulo ?? ""}
                placeholder="Qué crea este prompt…"
                onCommit={(v) => setPrompt(i, { titulo: v })}
              />
              {p.estado === "sin_verificar" && (
                <span
                  aria-label="Sin verificar contra la spec de Breeze"
                  style={{
                    flexShrink: 0,
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "rgba(245, 158, 11, 0.12)",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    color: "#b45309",
                    whiteSpace: "nowrap",
                  }}
                  title="Generado sin la spec de Breeze cargada — validá la capacidad antes de pegar"
                >
                  ⚠ Sin verificar
                </span>
              )}
              {p.prompt ? <CopyButton text={p.prompt} /> : null}
            </div>

            {(editable || p.objetivo) && (
              <Editable
                as="p"
                className="stl-card-detail"
                editable={editable}
                value={p.objetivo ?? ""}
                placeholder="Para qué (1 línea)…"
                onCommit={(v) => setPrompt(i, { objetivo: v })}
              />
            )}

            {/* El prompt LITERAL: monoespaciado, tal como se pega en Breeze. El wrapper
                pone el estilo (Editable solo acepta className). */}
            <div
              style={{
                marginTop: 8,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12.5,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                background: "var(--bg-soft)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 12,
                color: "var(--text)",
              }}
            >
              <Editable
                as="div"
                editable={editable}
                value={p.prompt ?? ""}
                placeholder="El prompt literal, tal como se pega en Breeze…"
                onCommit={(v) => setPrompt(i, { prompt: v })}
              />
            </div>

            {(editable || p.precondicion) && (
              <div style={{ marginTop: 8 }}>
                <span className="eyebrow">Antes de correrlo</span>
                <Editable
                  as="p"
                  className="stl-card-detail"
                  editable={editable}
                  value={p.precondicion ?? ""}
                  placeholder="Qué debe existir antes (opcional)…"
                  onCommit={(v) => setPrompt(i, { precondicion: v })}
                />
              </div>
            )}
          </div>
        )}
      </SortableItems>

      {editable && (
        <AddBtn
          label="Agregar prompt"
          onClick={() => set({ prompts: appendItem(prompts, { titulo: "", prompt: "", estado: "sin_verificar" }) })}
        />
      )}
    </>
  );
};
