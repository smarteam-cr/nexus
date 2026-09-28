"use client";

/**
 * components/escala/Guia.tsx — los documentos de la escala, para leerlos en Nexus.
 *
 * La matriz se recorre en las otras vistas; acá está TODO lo demás, tal cual se publicó: por qué
 * existe la escala, cómo se aplica (la regla estricta, los hábitos, el perfil, la regla de
 * asignación, qué se trabaja primero…), la referencia (glosario, riesgos, historial), la
 * especificación del cálculo y el manual de operación. Nada se reescribe: es el texto publicado,
 * con un índice. Así «lo que dice la escala» se consulta en un solo lugar.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";
import { slugDe } from "@/lib/escala/documento/parsear";
import type { DocumentoDeLaEscala } from "@/lib/escala/documento/documentos";
import { indiceDe, prepararDocumento } from "@/lib/escala/guia";
import type { DocumentoParaDescargar } from "@/lib/escala/vista";
import { Segmentado } from "./piezas";

/** El texto plano de lo que ReactMarkdown pasa como hijos de un encabezado. */
function textoDe(nodo: ReactNode): string {
  if (typeof nodo === "string" || typeof nodo === "number") return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(textoDe).join("");
  if (nodo && typeof nodo === "object" && "props" in nodo) return textoDe((nodo as { props: { children?: ReactNode } }).props.children);
  return "";
}

const COMPONENTES: Components = {
  h1: ({ children }) => (
    <h2 id={slugDe(textoDe(children))} className="mt-10 scroll-mt-4 border-b border-line pb-2 text-xl font-bold text-fg first:mt-0">
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h3 id={slugDe(textoDe(children))} className="mt-8 scroll-mt-4 text-lg font-semibold text-fg">
      {children}
    </h3>
  ),
  h3: ({ children }) => <h4 className="mt-6 text-base font-semibold text-fg">{children}</h4>,
  h4: ({ children }) => <h5 className="mt-4 text-sm font-semibold text-fg">{children}</h5>,
  p: ({ children }) => <p className="mt-3 text-sm leading-relaxed text-fg-secondary">{children}</p>,
  ul: ({ children }) => <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-secondary marker:text-fg-muted">{children}</ul>,
  ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-fg-secondary marker:text-fg-muted">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  em: ({ children }) => <em className="text-fg">{children}</em>,
  code: ({ children }) => <code className="rounded bg-surface-hover px-1 py-0.5 font-mono text-xs text-fg">{children}</code>,
  hr: () => <hr className="my-8 border-line" />,
  blockquote: ({ children }) => (
    <div className="mt-3 rounded-lg border border-info-line bg-info-surface px-4 py-1 text-info-ink [&_p]:text-info-ink">{children}</div>
  ),
  table: ({ children }) => (
    <div className="mt-4 overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-muted">{children}</thead>,
  th: ({ children }) => <th className="border-b border-line px-3 py-2 font-semibold text-fg">{children}</th>,
  td: ({ children }) => <td className="border-b border-line px-3 py-2 align-top leading-relaxed text-fg-secondary">{children}</td>,
  a: ({ children, href }) => (
    <a href={href} className="text-info-ink underline" target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

export default function Guia({ documentos }: { documentos: DocumentoParaDescargar[] }) {
  const publicados = documentos.filter((d) => d.version);
  const [elegido, setElegido] = useState<DocumentoDeLaEscala>(publicados[0]?.clave ?? "escala");
  const [textos, setTextos] = useState<Partial<Record<DocumentoDeLaEscala, string>>>({});
  const [error, setError] = useState<{ doc: DocumentoDeLaEscala; mensaje: string } | null>(null);

  // Se pide cada documento la primera vez que se abre (la escala sin la matriz pesa ~40 KB).
  useEffect(() => {
    if (textos[elegido] !== undefined) return;
    let vigente = true;
    fetch(`/api/escala/documentos/${elegido}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`No se pudo abrir el documento (${r.status}).`))))
      .then((t) => {
        if (vigente) setTextos((prev) => ({ ...prev, [elegido]: t }));
      })
      .catch((e: unknown) => {
        if (vigente) setError({ doc: elegido, mensaje: e instanceof Error ? e.message : "No se pudo abrir el documento." });
      });
    return () => {
      vigente = false;
    };
  }, [elegido, textos]);

  const markdown = useMemo(() => {
    const t = textos[elegido];
    return t === undefined ? null : prepararDocumento(t, elegido);
  }, [textos, elegido]);
  const indice = useMemo(() => (markdown ? indiceDe(markdown) : []), [markdown]);
  const doc = documentos.find((d) => d.clave === elegido);

  return (
    <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
      <nav aria-label="Índice del documento" className="self-start rounded-xl border border-line bg-surface p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <p className="px-1 pb-2 text-2xs font-bold uppercase tracking-wide text-fg-muted">Índice</p>
        <ol className="flex flex-col">
          {indice.map((h) => (
            <li key={h.id + h.texto}>
              <a
                href={`#${h.id}`}
                className={cn(
                  "block rounded-md px-1.5 py-1 text-left hover:bg-surface-hover",
                  h.nivel === 1 ? "mt-2 text-xs font-semibold text-fg" : "pl-3 text-xs text-fg-secondary",
                )}
              >
                {h.texto}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="min-w-0 max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Segmentado<DocumentoDeLaEscala>
            etiqueta="Documento"
            valor={elegido}
            onCambio={setElegido}
            opciones={documentos.map((d) => ({
              clave: d.clave,
              etiqueta: d.titulo,
              title: d.version ? `${d.paraQuien} Versión ${d.version}.` : "Todavía no está publicado en Nexus.",
              deshabilitada: !d.version,
            }))}
          />
          {doc?.version && <span className="text-xs text-fg-muted">Versión {doc.version} · tal cual está publicada en Nexus</span>}
        </div>
        {error && error.doc === elegido ? (
          <p className="rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-sm text-danger-ink">{error.mensaje}</p>
        ) : markdown === null ? (
          <p className="text-sm text-fg-muted">Cargando el documento…</p>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTES}>
            {markdown}
          </ReactMarkdown>
        )}
      </article>
    </div>
  );
}
