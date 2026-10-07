"use client";

/**
 * BuscarReunionesDeLaPreventa — el buscador de reuniones del «Contexto adicional» de la preventa
 * (Elías, 2026-10-07: «siempre se debe poder buscar y agregar cualquier sesión de Meet del usuario o
 * del cliente»). Dos grupos: las reuniones de la empresa que la preventa todavía no lista (son viejas
 * o no estaban entre las más recientes) y las de tu calendario. Con 3 letras o más se busca en todo
 * tu calendario, también en las que no tienen cliente asignado. Sumar una sin cliente la asigna a la
 * empresa; una de otro cliente se muestra con su motivo y se asigna en Sesiones.
 */
import { useEffect, useState } from "react";
import { Modal, useToast } from "@/components/ui";
import { coincideConLaBusqueda, MIN_BUSQUEDA_CALENDARIO } from "@/lib/sessions/candidatas-internas";
import type { ReunionDeLaEmpresa } from "@/lib/exploraciones/fuentes";
import { diaConAnio } from "@/lib/exploraciones/fechas";
import { resumirSala, textoDeSala } from "@/lib/sessions/participantes";
import { useLienzo } from "./contexto";

interface DelCalendario {
  sessionId: string;
  title: string;
  date: string;
  participants: string[];
  organizerEmail: string | null;
  sinTranscripcion: boolean;
  sinDuenio: boolean;
  soloEquipo?: boolean;
  motivoNoAdoptable: string | null;
}

interface Respuesta {
  deLaEmpresa: ReunionDeLaEmpresa[];
  calendario: { sesiones: DelCalendario[]; hayMas: boolean };
}

type Fila =
  | { separador: string }
  | { sessionId: string; title: string; date: string; participants: string[]; organizerEmail: string | null; sinTranscripcion: boolean; sinDuenio?: boolean; soloEquipo?: boolean; motivo: string | null };

function FilaDeReunion({ f, ocupado, sumar }: { f: Exclude<Fila, { separador: string }>; ocupado: boolean; sumar: () => void }) {
  const sala = textoDeSala(resumirSala(f.participants, f.organizerEmail));
  return (
    <li className="flex items-start gap-2 rounded-lg border border-line px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-xs text-fg">{f.title || "Sin título"}</span>
          <span className="flex-shrink-0 text-[10px] text-fg-muted">{diaConAnio(f.date)}</span>
          {f.sinDuenio && (
            <span className="flex-shrink-0 rounded-full border border-line bg-surface-muted px-1.5 py-0.5 text-[9px] font-medium text-fg-muted">
              {f.soloEquipo === false ? "sin cliente asignado" : "reunión del equipo"}
            </span>
          )}
          {f.sinTranscripcion && (
            <span className="flex-shrink-0 rounded-full border border-warn-line bg-warn-surface px-1.5 py-0.5 text-[9px] font-medium text-warn-ink">sin transcripción</span>
          )}
        </div>
        {f.motivo && <div className="mt-0.5 text-[10px] text-warn-ink">{f.motivo}</div>}
        {sala && <div className="mt-0.5 truncate text-[10px] text-fg-muted">{sala}</div>}
      </div>
      {f.motivo ? (
        <a
          href={`/sessions?s=${encodeURIComponent(f.sessionId)}`}
          target="_blank"
          rel="noopener noreferrer"
          title={f.motivo}
          className="flex-shrink-0 text-[11px] font-semibold text-brand hover:text-brand-dark"
        >
          Asignar en Sesiones
        </a>
      ) : f.sinTranscripcion ? (
        <span className="flex-shrink-0 text-[11px] text-fg-muted" title="Sin transcripción el agente no tiene qué leer.">
          No se puede leer
        </span>
      ) : (
        <button
          type="button"
          disabled={ocupado}
          onClick={sumar}
          title={f.sinDuenio ? "No es de ningún cliente todavía: al sumarla queda como reunión de esta empresa." : undefined}
          className="flex-shrink-0 text-[11px] font-semibold text-brand transition-colors hover:text-brand-dark disabled:opacity-40"
        >
          {f.sinDuenio ? "Sumar y asignar" : "Sumar"}
        </button>
      )}
    </li>
  );
}

export default function BuscarReunionesDeLaPreventa({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { exp, reuniones, recargar } = useLienzo();
  const toast = useToast();
  const [busqueda, setBusqueda] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  // La respuesta se guarda con la clave que la pidió: una vieja nunca se pinta debajo de una búsqueda nueva.
  const [datos, setDatos] = useState<{ clave: string; r: Respuesta | null; error?: boolean } | null>(null);
  const q = busqueda.trim();
  const clave = abierto ? (q.length >= MIN_BUSQUEDA_CALENDARIO ? q : "") : null;
  const pendiente = clave !== null && datos?.clave !== clave;

  useEffect(() => {
    if (clave === null) return;
    const ctrl = new AbortController();
    const t = setTimeout(
      () => {
        fetch(`/api/sales/exploraciones/${exp.id}/reuniones?q=${encodeURIComponent(clave)}`, { signal: ctrl.signal })
          .then((r) => {
            if (!r.ok) throw new Error(String(r.status));
            return r.json() as Promise<Respuesta>;
          })
          .then((r) => setDatos({ clave, r }))
          .catch(() => {
            if (!ctrl.signal.aborted) setDatos({ clave, r: null, error: true });
          });
      },
      clave ? 300 : 0,
    );
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [clave, exp.id]);

  const yaListadas = new Set(reuniones.filter((r) => r.origen === "meet").map((r) => r.id));
  const r = datos?.clave === clave ? datos.r : null;
  const deLaEmpresa = (r?.deLaEmpresa ?? []).filter((s) => !yaListadas.has(s.sessionId) && coincideConLaBusqueda(s, q));
  const enLaEmpresa = new Set(deLaEmpresa.map((s) => s.sessionId));
  const delCalendario = (r?.calendario.sesiones ?? []).filter(
    (s) => !yaListadas.has(s.sessionId) && !enLaEmpresa.has(s.sessionId) && coincideConLaBusqueda(s, q),
  );
  const filas: Fila[] = [
    ...(deLaEmpresa.length ? [{ separador: "De la empresa" }, ...deLaEmpresa.map((s) => ({ ...s, motivo: null }))] : []),
    ...(delCalendario.length
      ? [{ separador: "De tu calendario · al sumarla queda como reunión de la empresa" }, ...delCalendario.map((s) => ({ ...s, motivo: s.motivoNoAdoptable }))]
      : []),
  ];

  const sumar = async (sessionId: string) => {
    setOcupado(sessionId);
    try {
      const res = await fetch(`/api/sales/exploraciones/${exp.id}/reuniones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, elegida: true }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(d.error ?? "No se pudo sumar la reunión.");
        return;
      }
      toast.success("Reunión sumada: aparece en Exploración y el agente la lee con «Leer con el agente».");
      await recargar();
    } catch {
      toast.error("No se pudo sumar la reunión: revisa la conexión.");
    } finally {
      setOcupado(null);
    }
  };

  return (
    <Modal
      open={abierto}
      onClose={() => {
        onCerrar();
        setBusqueda("");
      }}
      title="Buscar una reunión"
      size="xl"
    >
      <input
        type="text"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar en la empresa y en tu calendario — título, persona o dominio…"
        aria-label="Buscar una reunión"
        aria-describedby="ayuda-buscar-reunion"
        autoFocus
        className="mb-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-brand focus:outline-none"
      />
      <p id="ayuda-buscar-reunion" className="mb-3 text-[11px] text-fg-muted">
        {pendiente ? (
          "Buscando…"
        ) : datos?.error ? (
          <span className="text-warn-ink">No se pudo buscar. Prueba de nuevo en un momento.</span>
        ) : clave ? (
          `Se buscó en todo tu calendario${r?.calendario.hayMas ? " — hay más resultados: afina la búsqueda" : ""}.`
        ) : (
          `Arriba, las reuniones de la empresa que la preventa todavía no tiene; abajo, tus reuniones más recientes. Con ${MIN_BUSQUEDA_CALENDARIO} letras o más se busca en todo tu calendario, también en las que no tienen cliente asignado.`
        )}
      </p>
      {filas.length === 0 ? (
        <p className="py-2 text-xs text-fg-muted">
          {pendiente ? "Buscando…" : q ? `Ninguna reunión coincide con «${q}», ni de la empresa ni en tu calendario.` : "No hay más reuniones para sumar."}
        </p>
      ) : (
        <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto">
          {filas.map((f) =>
            "separador" in f ? (
              <li key={`sep-${f.separador}`} className="pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                {f.separador}
              </li>
            ) : (
              <FilaDeReunion key={f.sessionId} f={f} ocupado={ocupado !== null} sumar={() => void sumar(f.sessionId)} />
            ),
          )}
        </ul>
      )}
    </Modal>
  );
}
