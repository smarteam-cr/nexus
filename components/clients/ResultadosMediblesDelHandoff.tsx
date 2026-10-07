"use client";

/**
 * components/clients/ResultadosMediblesDelHandoff.tsx — la LISTA de resultados medibles de un
 * proyecto (2026-10-02): R1…, cómo se mide, línea base, meta, plazo, quién lo necesita y qué lo frena.
 *
 * «Resultados que el cliente necesita alcanzar» se escribe como texto en el handoff; Nexus lo lee y
 * lo deja como lista. Es la única captura: los objetivos cuantitativos del diagnóstico la muestran, y
 * la línea base que se complete acá (o allá) es la misma. Sin línea base, «Por validar». La IA la
 * propone y el CSE del proyecto la CONFIRMA. Ver lib/handoff/resultados-medibles.ts.
 *
 * ── DÓNDE SE EDITA (2026-10-05, pedido de Elías) ─────────────────────────────
 * En Información del cliente, como «Resultados que persigue» (primero en «Lo que busca»): ahí se
 * edita y se confirma, y al confirmar la ficha su texto sale de lo confirmado acá. El Resumen del
 * proyecto la muestra en `soloLectura`, con el enlace para ir a editarla. Antes estaba dos veces, en
 * dos formatos: la tabla en el Resumen y un texto suelto en la ficha.
 *
 * Tarjetas y no tabla: en la ficha va en media columna. Lo sin confirmar se lee como sugerencia de la
 * IA (azul, con la chispa, y «Confirmar» al lado); confirmar le quita la marca, sin pintarlo de verde
 * ni moverlo (memoria «IA arriba, una sola vez»).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CampoEditable, ResultadoMedible } from "@/lib/handoff/resultados-medibles";
import { sinConfirmar, sinDato } from "@/lib/handoff/resultados-medibles";
import { BotonAzul, BotonBlanco, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";

const CHIP_POR_VALIDAR = "inline-block rounded-full border border-warn-line bg-warn-surface px-2 py-px text-[11px] font-semibold text-warn-ink";
const INPUT =
  "w-full rounded-md border border-line bg-surface px-2 py-1 text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none";

export default function ResultadosMediblesDelHandoff({
  projectId,
  canEdit,
  canConfirm = false,
  onCuenta,
  onCambio,
  soloLectura = false,
  enlaceParaEditar,
}: {
  projectId: string;
  canEdit: boolean;
  /** Celda `handoff.confirmarResultados` (CSE, CSL, Ventas). */
  canConfirm?: boolean;
  /** Cuántos hay y cuántos falta confirmar (la fila del Resumen y la ficha lo muestran). */
  onCuenta?: (total: number, sinConfirmar: number) => void;
  /** Algo cambió en la lista (se editó, se confirmó o se releyó): la ficha recalcula su texto. */
  onCambio?: () => void;
  /** Solo se lee (el Resumen): sin campos, sin botones, con el enlace a donde se edita. */
  soloLectura?: boolean;
  /** Dónde se edita (Información del cliente), para el enlace de la vista de solo lectura. */
  enlaceParaEditar?: string;
}) {
  const [resultados, setResultados] = useState<ResultadoMedible[] | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editable = canEdit && !soloLectura;
  const confirma = canConfirm && !soloLectura;

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
        onCambio?.();
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
    } else onCambio?.();
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
      else {
        setResultados(j?.resultados ?? []);
        onCambio?.();
      }
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

  if (soloLectura) {
    return (
      <div className="flex flex-col gap-2">
        {resultados.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Todavía no hay resultados de este proyecto.</p>
        ) : (
          <ol className="flex flex-col">
            {resultados.map((r, i) => (
              <ResultadoLeido key={r.id} r={r} primero={i === 0} />
            ))}
          </ol>
        )}
        {enlaceParaEditar && (
          <Link href={enlaceParaEditar} className="self-start text-[13px] font-medium text-brand hover:text-brand-light">
            {pendientes > 0
              ? `Confirmar ${pendientes === 1 ? "el pendiente" : `los ${pendientes} pendientes`} en Información del cliente →`
              : resultados.length
                ? "Editar en Información del cliente →"
                : "Ir a Información del cliente →"}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {(editable || (confirma && pendientes > 0)) && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {editable && (
            <BotonBlanco onClick={() => void releer()} disabled={leyendo}>
              {leyendo ? "Leyendo el handoff…" : resultados.length ? "Releer del handoff" : "Leer del handoff"}
            </BotonBlanco>
          )}
          {confirma && pendientes > 0 && (
            <BotonAzul onClick={() => void confirmar(null)} disabled={confirmando}>
              {confirmando ? "Confirmando…" : pendientes === resultados.length ? "Confirmar todos" : `Confirmar los ${pendientes} pendientes`}
            </BotonAzul>
          )}
        </div>
      )}

      {aviso && <p className="text-xs text-info-ink">{aviso}</p>}
      {error && <p className="text-xs text-danger-ink">{error}</p>}

      {resultados.length === 0 ? (
        <p className="text-[13px] text-fg-muted">
          Todavía no hay resultados leídos del handoff.{editable ? " «Leer del handoff» los saca de ahí, o de las reuniones si el handoff no los tiene." : ""}
        </p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {resultados.map((r) => (
            <TarjetaDeResultado
              key={r.id}
              r={r}
              editable={editable}
              confirma={confirma}
              confirmando={confirmando}
              onGuardar={(campo, v) => void guardar(r.id, campo, v)}
              onConfirmar={() => void confirmar([r.id])}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

/** La etiqueta cuadrada del id (R1, R2…), la misma de las preguntas de las sesiones. */
function Etiqueta({ id }: { id: string }) {
  return (
    <span className="inline-flex h-[26px] min-w-[26px] flex-shrink-0 items-center justify-center rounded-[7px] bg-surface-hover px-1 text-[11px] font-semibold text-fg-secondary">
      {id}
    </span>
  );
}

function Dato({ etiqueta, valor, porValidar }: { etiqueta: string; valor: string; porValidar?: boolean }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-fg-muted">{etiqueta}: </span>
      {porValidar ? <span className={CHIP_POR_VALIDAR}>Por validar</span> : <span className="text-fg-secondary">{sinDato(valor) ? "—" : valor}</span>}
    </span>
  );
}

/** Un resultado en el Resumen: se lee en dos líneas. */
function ResultadoLeido({ r, primero }: { r: ResultadoMedible; primero: boolean }) {
  const pendiente = sinConfirmar(r);
  return (
    <li className={cn("flex items-start gap-2.5 py-2.5", !primero && "border-t border-line")}>
      <Etiqueta id={r.id} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[13.5px] leading-5 text-fg">{r.resultado}</span>
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <Dato etiqueta="Línea base" valor={r.lineaBase} porValidar={sinDato(r.lineaBase)} />
          <Dato etiqueta="Meta" valor={r.meta} />
          <Dato etiqueta="Plazo" valor={r.plazo} />
        </span>
      </div>
      {pendiente && (
        <span className="inline-flex flex-shrink-0 items-center gap-1 text-xs text-brand" title="La propuso la IA; el CSE todavía no la confirmó">
          <IconoDeSugerencia className="h-3 w-3" />
          Sin confirmar
        </span>
      )}
    </li>
  );
}

/** Un resultado en Información del cliente: se edita y se confirma. */
function TarjetaDeResultado({
  r,
  editable,
  confirma,
  confirmando,
  onGuardar,
  onConfirmar,
}: {
  r: ResultadoMedible;
  editable: boolean;
  confirma: boolean;
  confirmando: boolean;
  onGuardar: (campo: CampoEditable, valor: string) => void;
  onConfirmar: () => void;
}) {
  const pendiente = sinConfirmar(r);
  return (
    <li
      className={cn(
        "flex flex-col gap-2.5 rounded-lg border px-3.5 py-3",
        pendiente ? "border-info-line bg-info-surface" : "border-line bg-surface",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Etiqueta id={r.id} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5" title={r.fuentes?.length ? `Fuentes: ${r.fuentes.join(", ")}` : undefined}>
          {pendiente && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand">
              <IconoDeSugerencia className="h-3 w-3" />
              Lo propone la IA · sin confirmar
            </span>
          )}
          <span className="text-[13.5px] font-semibold leading-5 text-fg">{r.resultado}</span>
          {r.metrica && <span className="text-xs text-fg-muted">Se mide con: {r.metrica}</span>}
        </div>
        {pendiente && confirma && (
          <BotonAzul onClick={onConfirmar} disabled={confirmando} className="flex-shrink-0 px-[11px] py-[5px]">
            Confirmar
          </BotonAzul>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {(
          [
            ["lineaBase", "Línea base"],
            ["meta", "Meta"],
            ["plazo", "Plazo"],
          ] as const
        ).map(([campo, etiqueta]) => (
          <label key={campo} className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5">
              <span className={ROTULO_DEL_SISTEMA}>{etiqueta}</span>
              {campo === "lineaBase" && sinDato(r.lineaBase) && <span className={CHIP_POR_VALIDAR}>Por validar</span>}
            </span>
            {/* La `key` con el valor remonta la celda cuando cambia desde afuera (releer el handoff). */}
            <Celda key={`${r.id}-${campo}-${r[campo]}`} valor={r[campo]} editable={editable} onGuardar={(v) => onGuardar(campo, v)} />
          </label>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className={ROTULO_DEL_SISTEMA}>Quién lo necesita</span>
        <Celda key={`${r.id}-quien-${r.quienLoNecesita ?? ""}`} valor={r.quienLoNecesita ?? ""} editable={editable} onGuardar={(v) => onGuardar("quienLoNecesita", v)} />
      </label>

      {(editable || (r.retos?.length ?? 0) > 0) && (
        <div className="flex flex-col gap-1">
          <span className={ROTULO_DEL_SISTEMA}>Lo que lo frena</span>
          <Retos key={`${r.id}-retos-${(r.retos ?? []).join("|")}`} retos={r.retos ?? []} editable={editable} onGuardar={(v) => onGuardar("retos", v)} />
        </div>
      )}
    </li>
  );
}

function Retos({ retos, editable, onGuardar }: { retos: string[]; editable: boolean; onGuardar: (v: string) => void }) {
  const [texto, setTexto] = useState(retos.join("\n"));
  if (!editable) {
    return retos.length ? (
      <ul className="list-disc pl-4 text-[13px] text-fg-secondary">
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
      className={cn(INPUT, "resize-y text-fg-secondary")}
    />
  );
}

function Celda({ valor, editable, onGuardar }: { valor: string; editable: boolean; onGuardar: (v: string) => void }) {
  const [texto, setTexto] = useState(sinDato(valor) ? "" : valor);
  if (!editable) return <span className="text-[13px] text-fg-secondary">{sinDato(valor) ? "—" : valor}</span>;
  return (
    <input
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        if (texto.trim() !== (sinDato(valor) ? "" : valor)) onGuardar(texto.trim());
      }}
      placeholder="por validar"
      className={INPUT}
    />
  );
}
