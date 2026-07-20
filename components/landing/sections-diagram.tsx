"use client";

/**
 * components/landing/sections-diagram.tsx
 *
 * DiagramSection — el motor de diagramas interactivo (FlowchartViewer, el lienzo
 * de Procesos) expuesto como sección del motor de landings (`sectionType: "diagram"`).
 * Estreno: canvas Desarrollo (`arquitectura`, `relacion_objetos`).
 *
 * CONVERSIÓN LAZY, en orden de prioridad:
 *   1. `data.diagram` con nodos  → tal cual (el grafo vivo, con posiciones del CSE).
 *   2. spec del agente           → specToDiagram / relacionToDiagram (generación
 *      vieja sin post-proceso, o regeneración por sección que solo trajo la spec).
 *   3. `cadena` legacy (tech_architecture) → cadenaToDiagram — migración automática
 *      SIN tocar la DB: persiste recién en el primer Guardar del CSE.
 *
 * GUARDADO: únicamente por el botón Guardar del viewer (gestos discretos, nunca por
 * frame) → onChange({ ...data, diagram }) → upsertCardData del workspace. `diagram`
 * vive FUERA del schema del agente → preserveNonSchemaKeys lo acarrea entre
 * regeneraciones por sección (las posiciones del CSE sobreviven).
 *
 * READ (externo): el viewer se monta sin onSave y con readOnly — el cliente/dev
 * explora (pan, zoom, fullscreen, clic → panel de detalle) pero no edita.
 */
import { useMemo, type FC } from "react";
import dynamic from "next/dynamic";
import { Editable, RemoveBtn, AddBtn, replaceAt, removeAt, appendItem } from "./inline";
import { landingLang, t } from "./i18n";
import { SortableItems } from "./sortable";
import type { SectionProps, DiagramSectionData } from "./types";
import type { FlowchartData } from "@/components/flowchart/FlowchartViewer";
import { DiagramStatic } from "./diagram-static";
import {
  specToDiagram,
  relacionToDiagram,
  cadenaToDiagram,
  type IntegrationDiagram,
} from "@/lib/flowchart/spec-to-diagram";

// Mismo patrón que KickoffSections: React Flow solo en el browser.
const FlowchartViewer = dynamic(() => import("@/components/flowchart/FlowchartViewer"), {
  ssr: false,
  loading: () => <div className="skeleton-shimmer" style={{ height: 420, borderRadius: 14, border: "1px solid var(--border)" }} />,
});

/** Resuelve el grafo a mostrar según la capa disponible (ver header). */
function resolveDiagram(data: DiagramSectionData): IntegrationDiagram | null {
  const saved = data.diagram as FlowchartData | undefined;
  if (saved && Array.isArray(saved.nodes) && saved.nodes.length > 0) return saved as IntegrationDiagram;
  if (data.objetos?.length || data.asociaciones?.length) return relacionToDiagram(data).diagram;
  if (data.sistemas?.length || data.conexiones?.length) return specToDiagram(data).diagram;
  if (data.cadena?.length || data.nodos?.length) return cadenaToDiagram(data);
  return null;
}

const textBlank = (data: DiagramSectionData) =>
  !(data.intro ?? "").trim() && !(data.fueraDeAlcance ?? []).length && !(data.opcionales ?? []).length;

export const DiagramSection: FC<SectionProps<DiagramSectionData>> = ({ data, ctx, editable, onChange }) => {
  const lang = landingLang(ctx.lang);
  const diagram = useMemo(() => resolveDiagram(data), [data]);
  const fuera = data.fueraDeAlcance ?? [];
  const opcionales = data.opcionales ?? [];
  const set = (next: Partial<DiagramSectionData>) => onChange?.({ ...data, ...next });

  // En lectura, una sección sin grafo ni texto no muestra ni el encabezado
  // (precedente sections-roles: el propio componente decide su vacío real).
  if (!editable && !diagram?.nodes?.length && textBlank(data)) return null;

  return (
    <>
      <Editable as="p" className="stl-intro" editable={editable} value={data.intro ?? ""}
        placeholder="La idea central del flujo en 1-2 frases…" onCommit={(v) => set({ intro: v })} />

      {diagram && diagram.nodes.length > 0 && (
        ctx.pdfMode ? (
          // PDF (Puppeteer): SVG estático síncrono — React Flow monta async y el
          // export dispararía antes de que el canvas exista.
          <div style={{ marginTop: 18, border: "1px solid var(--border)", borderRadius: 22, padding: 12, background: "#fff" }}>
            <DiagramStatic diagram={diagram as FlowchartData} />
          </div>
        ) : (
          <div
            style={{
              height: "clamp(380px, 58vh, 640px)", marginTop: 18,
              border: "1px solid var(--border)", borderRadius: 22, overflow: "hidden",
              background: "var(--bg, #fff)",
            }}
          >
            <FlowchartViewer
              data={diagram as FlowchartData}
              // El primer Guardar de un legacy convertido PERSISTE la conversión.
              onSave={editable && onChange ? async (updated) => onChange({ ...data, diagram: updated }) : undefined}
              readOnly={!editable}
            />
          </div>
        )
      )}

      {/* Fuera de alcance + opcionales — mismo markup que TechArchitectureSection. */}
      {(fuera.length > 0 || opcionales.length > 0 || editable) && (
        <div className="stl-grid stl-grid-2" style={{ marginTop: 28 }}>
          <div className="stl-field-card">
            <div className="stl-field-label">{t(lang, "fueraDeAlcance")}</div>
            <SortableItems items={fuera} disabled={!editable} onReorder={(next) => set({ fueraDeAlcance: next })}
              container={(nodes) => <div className="stl-ba-list">{nodes}</div>}>
              {(txt, i, handle) => (
                <div className="stl-item stl-plain-li">
                  {handle}
                  {editable && <RemoveBtn onClick={() => set({ fueraDeAlcance: removeAt(fuera, i) })} />}
                  <Editable as="span" editable={editable} value={txt} placeholder="Qué NO incluye esta fase…"
                    onCommit={(v) => set({ fueraDeAlcance: replaceAt(fuera, i, v) })} />
                </div>
              )}
            </SortableItems>
            {editable && <AddBtn label="Agregar" onClick={() => set({ fueraDeAlcance: appendItem(fuera, "") })} />}
          </div>
          <div className="stl-field-card">
            <div className="stl-field-label">{t(lang, "opcionales")}</div>
            <SortableItems items={opcionales} disabled={!editable} onReorder={(next) => set({ opcionales: next })}
              container={(nodes) => <div className="stl-ba-list">{nodes}</div>}>
              {(o, i, handle) => (
                <div className="stl-item stl-plain-li">
                  {handle}
                  {editable && <RemoveBtn onClick={() => set({ opcionales: removeAt(opcionales, i) })} />}
                  <Editable as="span" editable={editable} value={o.nombre} placeholder="Integración / módulo…"
                    onCommit={(v) => set({ opcionales: replaceAt(opcionales, i, { ...o, nombre: v }) })} />
                  {(o.detalle || editable) && (
                    <>
                      {" — "}
                      <Editable as="span" editable={editable} value={o.detalle} placeholder="detalle…"
                        onCommit={(v) => set({ opcionales: replaceAt(opcionales, i, { ...o, detalle: v }) })} />
                    </>
                  )}
                </div>
              )}
            </SortableItems>
            {editable && <AddBtn label="Agregar" onClick={() => set({ opcionales: appendItem(opcionales, { nombre: "", detalle: "" }) })} />}
          </div>
        </div>
      )}
    </>
  );
};
