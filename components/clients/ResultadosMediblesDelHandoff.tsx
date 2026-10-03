"use client";

/**
 * components/clients/ResultadosMediblesDelHandoff.tsx — la LISTA de resultados medibles del handoff
 * (2026-10-02), debajo del documento.
 *
 * «Resultados que el cliente necesita alcanzar» se escribe como texto; Nexus lo lee y lo deja como
 * lista (R1…: cómo se mide, línea base, meta, plazo). Es la única captura: los objetivos
 * cuantitativos del diagnóstico la muestran, y la línea base que se complete acá (o allá) es la
 * misma. Sin línea base, «Por validar». Ver lib/handoff/resultados-medibles.ts.
 */
import { useEffect, useState } from "react";
import type { CampoEditable, ResultadoMedible } from "@/lib/handoff/resultados-medibles";
import { sinDato } from "@/lib/handoff/resultados-medibles";

export default function ResultadosMediblesDelHandoff({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [resultados, setResultados] = useState<ResultadoMedible[] | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/handoff-resultados`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { resultados?: ResultadoMedible[] } | null) => {
        if (vivo) setResultados(Array.isArray(j?.resultados) ? j!.resultados : []);
      })
      .catch(() => vivo && setResultados([]));
    return () => {
      vivo = false;
    };
  }, [projectId]);

  const releer = async () => {
    setLeyendo(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/handoff-resultados`, { method: "POST" });
      const j = (await r.json().catch(() => null)) as { resultados?: ResultadoMedible[]; error?: string } | null;
      if (!r.ok) setError(j?.error ?? "No se pudieron leer los resultados del handoff.");
      else setResultados(j?.resultados ?? []);
    } catch {
      setError("No se pudieron leer los resultados del handoff. Revisa la conexión.");
    } finally {
      setLeyendo(false);
    }
  };

  const guardar = async (id: string, campo: CampoEditable, valor: string) => {
    const antes = resultados;
    setResultados((rs) => (rs ?? []).map((r) => (r.id === id ? { ...r, [campo]: valor } : r)));
    setError(null);
    const r = await fetch(`/api/projects/${projectId}/handoff-resultados`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, campo, valor }),
    }).catch(() => null);
    if (!r?.ok) {
      const j = (await r?.json().catch(() => null)) as { error?: string } | null;
      setResultados(antes);
      setError(j?.error ?? "No se pudo guardar. Vuelve a intentarlo.");
    }
  };

  if (resultados === null) return null;

  return (
    <div className="mb-5 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start gap-3 mb-3">
        <div className="flex-1 min-w-[240px]">
          <h3 className="text-sm font-bold text-fg">Resultados medibles</h3>
          <p className="text-xs text-fg-secondary mt-0.5">
            Salen de «Resultados que el cliente necesita alcanzar». Se capturan una sola vez: los objetivos del diagnóstico
            toman de acá su línea base y su meta. Sin línea base, quedan «Por validar».
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={releer}
            disabled={leyendo}
            className="text-xs font-semibold text-brand border border-brand/40 hover:bg-brand/10 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            {leyendo ? "Leyendo el handoff…" : resultados.length ? "Releer del handoff" : "Leer del handoff"}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-danger-ink mb-2">{error}</p>}

      {resultados.length === 0 ? (
        <p className="text-xs text-fg-muted">Todavía no hay resultados medibles leídos de este handoff.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-fg-muted">
                <th className="py-1.5 pr-3 font-semibold">#</th>
                <th className="py-1.5 pr-3 font-semibold">Resultado</th>
                <th className="py-1.5 pr-3 font-semibold">Cómo se mide</th>
                <th className="py-1.5 pr-3 font-semibold">Línea base</th>
                <th className="py-1.5 pr-3 font-semibold">Meta</th>
                <th className="py-1.5 font-semibold">Plazo</th>
              </tr>
            </thead>
            <tbody>
              {resultados.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="py-2 pr-3 font-bold text-fg">{r.id}</td>
                  <td className="py-2 pr-3 text-fg">{r.resultado}</td>
                  <td className="py-2 pr-3 text-fg-secondary">{r.metrica || "—"}</td>
                  {(["lineaBase", "meta", "plazo"] as const).map((campo) => (
                    <td key={campo} className="py-2 pr-3">
                      {/* La `key` con el valor remonta la celda cuando cambia desde afuera (releer
                          el handoff): así el borrador local arranca del dato nuevo sin un efecto. */}
                      <Celda
                        key={`${r.id}-${campo}-${r[campo]}`}
                        valor={r[campo]}
                        editable={canEdit}
                        porValidar={campo === "lineaBase" && sinDato(r.lineaBase)}
                        onGuardar={(v) => void guardar(r.id, campo, v)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Celda({
  valor,
  editable,
  porValidar,
  onGuardar,
}: {
  valor: string;
  editable: boolean;
  porValidar: boolean;
  onGuardar: (v: string) => void;
}) {
  const [texto, setTexto] = useState(sinDato(valor) ? "" : valor);
  if (!editable) {
    return porValidar ? (
      <span className="inline-block rounded-full bg-warn-surface text-warn-ink border border-warn-line px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
        Por validar
      </span>
    ) : (
      <span className="text-fg-secondary">{sinDato(valor) ? "—" : valor}</span>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {porValidar && (
        <span className="self-start rounded-full bg-warn-surface text-warn-ink border border-warn-line px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
          Por validar
        </span>
      )}
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          if (texto.trim() !== (sinDato(valor) ? "" : valor)) onGuardar(texto.trim());
        }}
        placeholder="por validar"
        className="w-full min-w-[110px] px-2 py-1 bg-surface border border-line rounded-md text-fg focus:outline-none focus:border-brand"
      />
    </div>
  );
}
