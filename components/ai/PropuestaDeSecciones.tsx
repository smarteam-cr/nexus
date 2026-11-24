"use client";
/**
 * components/ai/PropuestaDeSecciones.tsx — la propuesta del assist de documento («✨ Mejorar con IA») DENTRO del chat «Nexus»
 * (24 nov): qué secciones cambia, con su casilla, por qué, sus avisos y las fuentes que consultó. La usan
 * components/ai/DocumentAssist.tsx (artefactos y documentos sin chat) y components/roles/RoleWorkspace.tsx (el perfil de un
 * puesto). Antes era un `<AgentProposal>` en la página, debajo de una ventana modal; ahora va en el hilo del chat, con la cara
 * de las demás propuestas del chat (`PropuestaEnElHilo`).
 */
import { PropuestaEnElHilo } from "@/components/asistente/CajonDeNexus";

/** Lo que devuelve un endpoint .../assist (espejo de DocumentAssistResult). */
export interface PropuestaDeAssist {
  proposal: Record<string, unknown>;
  summary: string[];
  reasoning?: string;
  warnings: string[];
  citations: { url: string; title: string }[];
}

export default function PropuestaDeSecciones({
  propuesta,
  elegidas,
  alElegir,
  nombreDe,
  onAplicar,
  onDescartar,
  aplicando,
}: {
  propuesta: PropuestaDeAssist;
  elegidas: ReadonlySet<string>;
  alElegir: (key: string, va: boolean) => void;
  /** El nombre visible de una sección (de las defs del documento). */
  nombreDe: (key: string) => string;
  onAplicar: () => void;
  onDescartar: () => void;
  aplicando: boolean;
}) {
  const keys = Object.keys(propuesta.proposal);
  return (
    <PropuestaEnElHilo
      titulo={keys.length === 1 ? "Nexus propone cambiar una sección" : `Nexus propone cambiar ${keys.length} secciones`}
      subtitulo="Marca las que van. Nada se guarda hasta que apliques."
      nota={propuesta.reasoning}
      aplicar={{ rotulo: elegidas.size === keys.length ? "Aplicar" : `Aplicar (${elegidas.size})`, alHacer: onAplicar, apagado: elegidas.size === 0, ocupado: aplicando }}
      descartar={{ rotulo: "Descartar la propuesta", alHacer: onDescartar, apagado: aplicando }}
    >
      {propuesta.summary.length > 0 && <p className="mb-1.5 text-[11px] text-fg-muted">{propuesta.summary.join(" · ")}</p>}
      {propuesta.warnings.length > 0 && (
        <ul className="mb-1.5 space-y-0.5 text-[11px] text-warn-ink">
          {propuesta.warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}
      <div className="space-y-1.5">
        {keys.map((key) => (
          <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-fg">
            <input type="checkbox" checked={elegidas.has(key)} onChange={(e) => alElegir(key, e.target.checked)} disabled={aplicando} className="accent-brand" />
            {nombreDe(key)}
          </label>
        ))}
      </div>
      {propuesta.citations.length > 0 && (
        <div className="pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Fuentes consultadas</p>
          <ul className="space-y-0.5">
            {propuesta.citations.map((c) => (
              <li key={c.url}>
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="break-all text-[11px] text-brand hover:underline">
                  {c.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PropuestaEnElHilo>
  );
}
