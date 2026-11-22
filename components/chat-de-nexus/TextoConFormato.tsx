"use client";

/**
 * TextoConFormato — lo que responde Nexus en «Hablar con Nexus», pintado como Markdown simple: párrafos, listas y
 * negritas (Elías, 21 nov: «es importante que se vea bien formateado»; se veían los `**` crudos). La regla de la
 * respuesta (lib/chat-de-nexus/respuesta.ts) le pide al modelo ese Markdown y nada más.
 *
 * Mismo criterio que el Markdown del asistente (components/asistente/ChatDelAsistente.tsx): clases por elemento y no
 * `prose` (el cajón es angosto), y sin `rehype-raw` a propósito: el HTML que escriba el modelo no se ejecuta. Los títulos
 * se pintan como un párrafo en negrita: en una burbuja de chat un h1 grita. SOLO pasan los elementos de la lista
 * (`PERMITIDOS`): nada de imágenes ni tablas. La respuesta se arma con transcripciones y notas que Smarteam no controla, y
 * una imagen se pide sola al abrir el panel (podría sacar datos de la cuenta en su dirección); lo demás queda como texto.
 */
import ReactMarkdown from "react-markdown";

const PERMITIDOS = ["p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "ol", "ul", "li", "strong", "em", "code", "pre", "blockquote", "a"];

export default function TextoConFormato({ children, apagado = false }: { children: string; apagado?: boolean }) {
  return (
    <div className={apagado ? "text-fg-muted [&>*+*]:mt-2" : "text-fg [&>*+*]:mt-2"}>
      <ReactMarkdown
        allowedElements={PERMITIDOS}
        unwrapDisallowed
        components={{
          p: ({ children }) => <p>{children}</p>,
          h1: ({ children }) => <p className="font-semibold">{children}</p>,
          h2: ({ children }) => <p className="font-semibold">{children}</p>,
          h3: ({ children }) => <p className="font-semibold">{children}</p>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5 marker:text-fg-muted">{children}</ol>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 marker:text-fg-muted">{children}</ul>,
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          code: ({ children }) => <code className="rounded bg-surface-hover px-1 py-0.5 text-xs">{children}</code>,
          a: ({ children, href }) => (
            <a href={href} className="text-brand underline" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
