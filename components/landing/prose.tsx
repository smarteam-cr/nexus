"use client";

/**
 * components/landing/prose.tsx
 *
 * Primitivas de MARKDOWN del motor de landing: `Prose` (bloque de prosa con la
 * tipografía del documento) e `InlineMD` (markdown inline sin <p> envolvente,
 * para celdas de tabla y fragmentos). Vivían en components/canvas/KickoffBlock.tsx
 * (renderer legacy, borrado en la Ola 4 del plan de puestos) — se movieron acá
 * porque las consume el motor nuevo (kickoff-sections/KickoffSections).
 *
 * NOTA: `.kl-prose` (app/kickoff-landing.css) A PROPÓSITO por ahora — el swap
 * kl-* → .stl es la Ola 6 (una cosa por commit; esa ola porta las métricas
 * exactas a landing-engine.css antes de tocar la clase).
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Prose({ content }: { content: string }) {
  return (
    <div className="kl-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

/** Markdown inline (sin <p> envolvente) — para celdas de tabla: parsea **bold**, *italic*, links. */
export function InlineMD({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: (props) => <>{props.children}</> }}>
      {children}
    </ReactMarkdown>
  );
}
