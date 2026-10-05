/**
 * components/clients/TextoConFormato.tsx — pinta el formato mínimo de Nexus: «- » viñetas,
 * «1. » listas numeradas, **negrita** y *cursiva*.
 *
 * Es el mismo subconjunto que `textoAHtml` (lib/clients/ficha.ts) convierte para HubSpot, pintado
 * como React (sin `dangerouslySetInnerHTML`): lo que la IA propone en la ficha se lee como va a
 * quedar, y no como un texto seguido con guiones y asteriscos sueltos (pedido de Elías, 2026-10-04).
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Negrita y cursiva dentro de una línea. */
function enLinea(texto: string): ReactNode[] {
  // La negrita admite asteriscos adentro (`**a *b* c**`), igual que `textoAHtml`.
  const partes = texto.split(/(\*\*.+?\*\*|\*[^*\s][^*]*\*)/g);
  return partes.map((p, i) => {
    if (/^\*\*.+\*\*$/.test(p)) return <strong key={i} className="font-semibold text-fg">{enLinea(p.slice(2, -2))}</strong>;
    if (/^\*[^*\s][^*]*\*$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    return p;
  });
}

type Bloque = { tipo: "p"; lineas: string[] } | { tipo: "ul" | "ol"; items: string[] };

function aBloques(texto: string): Bloque[] {
  const bloques: Bloque[] = [];
  for (const cruda of texto.replace(/\r\n?/g, "\n").split("\n")) {
    const linea = cruda.trimEnd();
    const vineta = /^\s*[-*•]\s+(.*)$/.exec(linea);
    const numero = /^\s*\d+[.)]\s+(.*)$/.exec(linea);
    const ultimo = bloques[bloques.length - 1];
    if (vineta || numero) {
      const tipo = vineta ? "ul" : "ol";
      const item = (vineta ?? numero)![1];
      if (ultimo && ultimo.tipo === tipo) ultimo.items.push(item);
      else bloques.push({ tipo, items: [item] });
      continue;
    }
    if (!linea.trim()) {
      bloques.push({ tipo: "p", lineas: [] }); // corta el párrafo; los vacíos se filtran abajo
      continue;
    }
    const titulo = /^#{1,6}\s+(.*)$/.exec(linea);
    const texto = titulo ? `**${titulo[1]}**` : linea;
    if (ultimo && ultimo.tipo === "p" && ultimo.lineas.length > 0) ultimo.lineas.push(texto);
    else bloques.push({ tipo: "p", lineas: [texto] });
  }
  return bloques.filter((b) => (b.tipo === "p" ? b.lineas.length > 0 : b.items.length > 0));
}

export function TextoConFormato({ texto, className }: { texto: string; className?: string }) {
  return (
    <div className={cn("space-y-1.5 leading-relaxed", className)}>
      {aBloques(texto).map((b, i) =>
        b.tipo === "p" ? (
          <p key={i}>
            {b.lineas.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {enLinea(l)}
              </span>
            ))}
          </p>
        ) : b.tipo === "ul" ? (
          <ul key={i} className="list-disc space-y-0.5 pl-5 marker:text-fg-muted">
            {b.items.map((it, j) => (
              <li key={j}>{enLinea(it)}</li>
            ))}
          </ul>
        ) : (
          <ol key={i} className="list-decimal space-y-0.5 pl-5 marker:text-fg-muted">
            {b.items.map((it, j) => (
              <li key={j}>{enLinea(it)}</li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
