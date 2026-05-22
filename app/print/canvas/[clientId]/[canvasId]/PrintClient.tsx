"use client";

import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ── Tipos exportados para la página server ────────────────────────────────

export interface PrintCard {
  id: string;
  title: string;
  content: string;
}

export interface PrintBlock {
  id: string;
  blockType: string;
  content: string | null;
  data: unknown;
}

export interface PrintSection {
  key: string;
  label: string;
  type: "cards" | "blocks";
  cards: PrintCard[];
  blocks: PrintBlock[];
}

export interface ProjectMeta {
  name: string | null;
  pipelineName: string | null;
  cseEncargado: string | null;
  createdAt: string | null;
}

export interface CanvasPrintData {
  clientName: string;
  clientCompany: string | null;
  clientIndustry: string | null;
  canvasName: string;
  isDefault: boolean;
  sections: PrintSection[];
  generatedAt: string;
  projectMeta: ProjectMeta;
}

// ── Render helpers ────────────────────────────────────────────────────────

function MarkdownView({ content }: { content: string }) {
  if (!content?.trim()) return null;
  return (
    <div className="cp-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function BlockView({ block }: { block: PrintBlock }) {
  const type = block.blockType?.toUpperCase();
  const data = block.data as Record<string, unknown> | null;

  if (type === "HEADING") {
    const level = (data?.level as number) ?? 2;
    if (level === 3) return <h3 className="cp-h3">{block.content}</h3>;
    return <h3 className="cp-h2">{block.content}</h3>;
  }

  if (type === "TABLE") {
    const headers = (data?.headers as string[]) ?? [];
    const rows = (data?.rows as string[][]) ?? [];
    if (!headers.length) return null;
    return (
      <table className="cp-table">
        <thead><tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, ri) => (
          <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
        ))}</tbody>
      </table>
    );
  }

  if (type === "METRIC") {
    const label = (data?.label as string) ?? "";
    const value = (data?.value as string) ?? "";
    const comparison = (data?.comparison as string) ?? "";
    return (
      <div className="cp-metric">
        <div className="cp-metric-label">{label}</div>
        <div className="cp-metric-value">{value}</div>
        {comparison && <div className="cp-metric-comp">{comparison}</div>}
      </div>
    );
  }

  if (type === "CALLOUT") {
    const variant = (data?.variant as string) ?? "info";
    const title = (data?.title as string) ?? "";
    return (
      <div className={`cp-callout cp-callout-${variant}`}>
        {title && <div className="cp-callout-title">{title}</div>}
        <MarkdownView content={block.content ?? ""} />
      </div>
    );
  }

  if (type === "FLOWCHART") {
    return (
      <div className="cp-flowchart-note">
        <em>[Diagrama de flujo — ver en pantalla para visualización interactiva]</em>
      </div>
    );
  }

  return <MarkdownView content={block.content ?? ""} />;
}

// ── Componente principal ──────────────────────────────────────────────────

export default function PrintClient({
  data,
  autoPrint,
}: {
  data: CanvasPrintData;
  autoPrint: boolean;
}) {
  const dateStr = new Date(data.generatedAt).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Nombre sugerido para "Save as PDF" del browser: usa document.title.
  // Formato: "{Cliente} - {Proyecto} - {YYYY-MM-DD}"
  useEffect(() => {
    const safe = (s: string) =>
      s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
    const isoDate = new Date(data.generatedAt).toISOString().slice(0, 10); // YYYY-MM-DD
    const projectPart = data.projectMeta.name?.trim() || data.canvasName;
    const title = `${safe(data.clientName)} - ${safe(projectPart)} - ${isoDate}`;
    const prev = document.title;
    document.title = title;
    return () => { document.title = prev; };
  }, [data.clientName, data.projectMeta.name, data.canvasName, data.generatedAt]);

  // Auto-print: esperar a que el title ya esté seteado (el browser captura el title
  // al abrir el dialog para sugerir el filename).
  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => window.print(), 500);
    return () => clearTimeout(t);
  }, [autoPrint]);

  const createdAtStr = data.projectMeta.createdAt
    ? new Date(data.projectMeta.createdAt).toLocaleDateString("es-ES", {
        day: "numeric", month: "long", year: "numeric",
      })
    : null;

  const totalItems = data.sections.reduce(
    (sum, s) => sum + (s.type === "cards" ? s.cards.length : s.blocks.length),
    0,
  );

  return (
    <div className="cp-root">
      {/* Toolbar — solo pantalla */}
      <div className="cp-toolbar no-print">
        <div>
          <strong>{data.clientName}</strong> · {data.canvasName}
        </div>
        <button onClick={() => window.print()} className="cp-button">
          Imprimir / Guardar como PDF
        </button>
      </div>

      {/* Documento imprimible */}
      <article className="cp-doc">
        {/* Header del documento */}
        <header className="cp-header">
          <div className="cp-header-main">
            <h1 className="cp-title">{data.clientName}</h1>
            <p className="cp-subtitle">{data.canvasName}</p>
          </div>

          {/* Meta del proyecto */}
          {(data.projectMeta.name ||
            data.projectMeta.pipelineName ||
            data.projectMeta.cseEncargado ||
            createdAtStr) && (
            <dl className="cp-meta-grid">
              {data.projectMeta.name && (
                <div className="cp-meta-item">
                  <dt>Proyecto</dt>
                  <dd>{data.projectMeta.name}</dd>
                </div>
              )}
              {data.projectMeta.pipelineName && (
                <div className="cp-meta-item">
                  <dt>Pipeline</dt>
                  <dd>{data.projectMeta.pipelineName}</dd>
                </div>
              )}
              {data.projectMeta.cseEncargado && (
                <div className="cp-meta-item">
                  <dt>CSE encargado</dt>
                  <dd>{data.projectMeta.cseEncargado}</dd>
                </div>
              )}
              {data.clientIndustry && (
                <div className="cp-meta-item">
                  <dt>Industria</dt>
                  <dd>{data.clientIndustry}</dd>
                </div>
              )}
              {createdAtStr && (
                <div className="cp-meta-item">
                  <dt>Creado</dt>
                  <dd>{createdAtStr}</dd>
                </div>
              )}
              <div className="cp-meta-item">
                <dt>Generado</dt>
                <dd>{dateStr}</dd>
              </div>
            </dl>
          )}
        </header>

        {totalItems === 0 ? (
          <p className="cp-empty">Este canvas aún no tiene contenido para exportar.</p>
        ) : (
          data.sections.map((section) => {
            const hasContent =
              (section.type === "cards" && section.cards.length > 0) ||
              (section.type === "blocks" && section.blocks.length > 0);
            if (!hasContent) return null;

            // Detectar si las cards de esta sección son cortas (caben en 2 col)
            // o largas (mejor full-width).
            const itemCount =
              section.type === "cards" ? section.cards.length : section.blocks.length;
            const avgLen =
              section.type === "cards"
                ? section.cards.reduce((sum, c) => sum + (c.content?.length ?? 0), 0) /
                  Math.max(itemCount, 1)
                : 0;
            // Si hay 2+ cards y el promedio es menor a 1200 chars, usamos 2 columnas
            const useColumns = section.type === "cards" && itemCount >= 2 && avgLen < 1200;

            return (
              <section key={section.key} className="cp-section">
                <h2 className="cp-section-title">{section.label}</h2>
                <div className={useColumns ? "cp-cards-cols" : "cp-cards-single"}>
                  {section.type === "cards" &&
                    section.cards.map((card) => (
                      <div key={card.id} className="cp-card">
                        <h3 className="cp-card-title">{card.title}</h3>
                        <MarkdownView content={card.content} />
                      </div>
                    ))}
                  {section.type === "blocks" &&
                    section.blocks.map((block) => (
                      <div key={block.id} className="cp-block">
                        <BlockView block={block} />
                      </div>
                    ))}
                </div>
              </section>
            );
          })
        )}

        <footer className="cp-footer">
          <span>Nexus · Smarteam</span>
          <span>{dateStr}</span>
        </footer>
      </article>
    </div>
  );
}
