"use client";

/**
 * components/clients/ResultadosMediblesDelHandoff.tsx — la LISTA de resultados medibles del handoff
 * (2026-10-02), debajo del documento.
 *
 * «Resultados que el cliente necesita alcanzar» se escribe como texto; Nexus lo lee y lo deja como
 * lista (R1…: cómo se mide, línea base, meta, plazo). Es la única captura: los objetivos
 * cuantitativos del diagnóstico la muestran, y la línea base que se complete acá (o allá) es la
 * misma. Sin línea base, «Por validar». Ver lib/handoff/resultados-medibles.ts.
 *
 * Unida con la ronda del 2026-10-02 (decisión de Elías): cada resultado dice además QUIÉN lo necesita
 * y los RETOS que lo frenan, y el CSE del proyecto lo CONFIRMA. Si el handoff no escribió la sección,
 * «Leer del handoff» la propone desde las reuniones (y lo avisa).
 */
import { useEffect, useState } from "react";
import type { CampoEditable, ResultadoMedible } from "@/lib/handoff/resultados-medibles";
import { sinConfirmar, sinDato } from "@/lib/handoff/resultados-medibles";
import { BotonAzul, BotonBlanco } from "@/components/ui/sistema";

const CHIP = "inline-block rounded-full border px-2 py-px text-[11px] font-semibold";

export default function ResultadosMediblesDelHandoff({
  projectId,
  canEdit,
  canConfirm = false,
  onCuenta,
}: {
  projectId: string;
  canEdit: boolean;
  /** Celda `handoff.confirmarResultados` (CSE, CSL, Ventas). */
  canConfirm?: boolean;
  /** Cuántos hay y cuántos falta confirmar: lo pinta la fila de «Alrededor del handoff». */
  onCuenta?: (total: number, sinConfirmar: number) => void;
}) {
  const [resultados, setResultados] = useState<ResultadoMedible[] | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
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
    setAviso(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/handoff-resultados`, { method: "POST" });
      const j = (await r.json().catch(() => null)) as { resultados?: ResultadoMedible[]; propuestos?: boolean; error?: string } | null;
      if (!r.ok) setError(j?.error ?? "No se pudieron leer los resultados del handoff.");
      else {
        setResultados(j?.resultados ?? []);
        if (j?.propuestos) {
          setAviso("El handoff no los tenía escritos: los propuso la IA desde las reuniones del proyecto. Revísalos y confírmalos.");
        }
      }
    } catch {
      setError("No se pudieron leer los resultados del handoff. Revisa la conexión.");
    } finally {
      setLeyendo(false);
    }
  };

  const guardar = async (id: string, campo: CampoEditable, valor: string) => {
    const antes = resultados;
    setResultados((rs) =>
      (rs ?? []).map((r) =>
        r.id !== id ? r : campo === "retos" ? { ...r, retos: valor.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) } : { ...r, [campo]: valor },
      ),
    );
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

  const confirmar = async (ids: string[] | null) => {
    setConfirmando(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/handoff-resultados`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { ids } : {}),
      });
      const j = (await r.json().catch(() => null)) as { resultados?: ResultadoMedible[]; error?: string } | null;
      if (!r.ok) setError(j?.error ?? "No se pudo confirmar. Vuelve a intentarlo.");
      else setResultados(j?.resultados ?? []);
    } catch {
      setError("No se pudo confirmar. Revisa la conexión.");
    } finally {
      setConfirmando(false);
    }
  };

  const pendientes = resultados ? resultados.filter((r) => sinConfirmar(r)).length : 0;
  const total = resultados?.length ?? 0;
  useEffect(() => {
    if (resultados !== null) onCuenta?.(total, pendientes);
  }, [resultados, total, pendientes, onCuenta]);

  if (resultados === null) return null;

  /* Vive adentro de su fila de «Alrededor del handoff» (rediseño del 2026-10-04): el título y la
     cuenta los pone la fila; acá van la explicación y las acciones. */
  return (
    <div>
      <div className="flex flex-wrap items-start gap-3 mb-3">
        <p className="flex-1 min-w-[240px] text-xs text-fg-muted">
          Salen de «Resultados que el cliente necesita alcanzar». Se capturan una sola vez: los objetivos del diagnóstico
          toman de acá su línea base y su meta. Sin línea base, o sin confirmar por el CSE, quedan «Por validar».
        </p>
        {canEdit && (
          <BotonBlanco onClick={() => void releer()} disabled={leyendo}>
            {leyendo ? "Leyendo el handoff…" : resultados.length ? "Releer del handoff" : "Leer del handoff"}
          </BotonBlanco>
        )}
        {canConfirm && pendientes > 0 && (
          <BotonAzul onClick={() => void confirmar(null)} disabled={confirmando}>
            {confirmando ? "Confirmando…" : pendientes === resultados.length ? "Confirmar todos" : `Confirmar los ${pendientes} pendientes`}
          </BotonAzul>
        )}
      </div>

      {aviso && <p className="text-xs text-info-ink mb-2">{aviso}</p>}
      {error && <p className="text-xs text-danger-ink mb-2">{error}</p>}

      {resultados.length === 0 ? (
        <p className="text-xs text-fg-muted">Todavía no hay resultados leídos de este handoff.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-fg-muted">
                <th className="py-1.5 pr-3 font-semibold">#</th>
                <th className="py-1.5 pr-3 font-semibold">Resultado y lo que lo frena</th>
                <th className="py-1.5 pr-3 font-semibold">Quién lo necesita</th>
                <th className="py-1.5 pr-3 font-semibold">Cómo se mide</th>
                <th className="py-1.5 pr-3 font-semibold">Línea base</th>
                <th className="py-1.5 pr-3 font-semibold">Meta</th>
                <th className="py-1.5 pr-3 font-semibold">Plazo</th>
                <th className="py-1.5 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {resultados.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="py-2 pr-3 font-bold text-fg">{r.id}</td>
                  <td className="py-2 pr-3 text-fg min-w-[220px]">
                    <div title={r.fuentes?.length ? `Fuentes: ${r.fuentes.join(", ")}` : undefined}>{r.resultado}</div>
                    <Retos
                      key={`${r.id}-retos-${(r.retos ?? []).join("|")}`}
                      retos={r.retos ?? []}
                      editable={canEdit}
                      onGuardar={(v) => void guardar(r.id, "retos", v)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Celda
                      key={`${r.id}-quien-${r.quienLoNecesita ?? ""}`}
                      valor={r.quienLoNecesita ?? ""}
                      editable={canEdit}
                      porValidar={false}
                      onGuardar={(v) => void guardar(r.id, "quienLoNecesita", v)}
                    />
                  </td>
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
                  <td className="py-2 whitespace-nowrap">
                    {sinConfirmar(r) ? (
                      <div className="flex flex-col items-start gap-1">
                        <span className={`${CHIP} bg-warn-surface text-warn-ink border-warn-line`}>Sin confirmar</span>
                        {canConfirm && (
                          <button
                            type="button"
                            onClick={() => void confirmar([r.id])}
                            disabled={confirmando}
                            className="text-[11px] font-semibold text-brand hover:underline disabled:opacity-50"
                          >
                            Confirmar
                          </button>
                        )}
                      </div>
                    ) : (
                      <span
                        className={`${CHIP} bg-success-surface text-success-ink border-success-line`}
                        title={r.confirmadoPor ? `Confirmado por ${r.confirmadoPor}` : undefined}
                      >
                        Confirmado
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Retos({ retos, editable, onGuardar }: { retos: string[]; editable: boolean; onGuardar: (v: string) => void }) {
  const [texto, setTexto] = useState(retos.join("\n"));
  if (!editable) {
    return retos.length ? (
      <ul className="mt-1 list-disc pl-4 text-fg-secondary">
        {retos.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    ) : null;
  }
  return (
    <textarea
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        if (texto.trim() !== retos.join("\n")) onGuardar(texto);
      }}
      rows={Math.max(2, retos.length)}
      placeholder="Lo que lo frena, uno por línea"
      className="mt-1 w-full min-w-[200px] px-2 py-1 bg-surface border border-line rounded-md text-fg-secondary focus:outline-none focus:border-brand"
    />
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
      <span className={`${CHIP} bg-warn-surface text-warn-ink border-warn-line`}>Por validar</span>
    ) : (
      <span className="text-fg-secondary">{sinDato(valor) ? "—" : valor}</span>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {porValidar && <span className={`self-start ${CHIP} bg-warn-surface text-warn-ink border-warn-line`}>Por validar</span>}
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
