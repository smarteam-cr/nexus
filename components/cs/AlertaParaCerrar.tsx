"use client";

/**
 * components/cs/AlertaParaCerrar.tsx — una alerta viva de Éxito del cliente, con «Resolver» y
 * «Descartar» (2026-10-07). La usan «A quién llamar» y el panel de cada cuenta: cerrar una alerta
 * es el mismo gesto en los dos lados.
 *
 * Al cerrarla se puede dejar una nota corta de qué se hizo (opcional, una línea; Enter cierra). La
 * alerta sale de la lista y vuelve solo con una señal nueva (lib/cs/alertas-reglas.ts); si volvió,
 * dice cómo se cerró la vez anterior.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { BotonTexto } from "@/components/ui/sistema";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
import { LARGO_DE_LA_NOTA, textoDelCierre } from "@/lib/cs/alertas-reglas";
import type { AlertaCerrada, AlertaDeCuenta } from "@/lib/cs/cartera-reglas";
import { Chip } from "./piezas";
import { dondeLoDijo } from "@/lib/cs/cita-de-alerta";
import { fmtDia } from "@/lib/cs/formato";

const SEVERIDAD: Record<string, { texto: string; tono: "atencion" | "neutro" }> = {
  HIGH: { texto: "Alta", tono: "atencion" },
  MEDIUM: { texto: "Media", tono: "neutro" },
  LOW: { texto: "Baja", tono: "neutro" },
};

type Cierre = "RESOLVED" | "DISMISSED";

const VERBO: Record<Cierre, string> = { RESOLVED: "Resolver", DISMISSED: "Descartar" };

/** Cierra una alerta (o la vuelve a abrir). Lanza si el servidor no la guardó. */
export async function cambiarEstadoDeAlerta(id: string, status: Cierre | "OPEN", nota?: string): Promise<void> {
  await fetchJson(`/api/cs/alerts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nota ? { status, nota } : { status }),
  });
}

export function AlertaParaCerrar({
  alerta,
  hoy,
  onCerrada,
  conProyecto = true,
  className,
}: {
  alerta: AlertaDeCuenta;
  hoy: string;
  /** Se llama cuando el servidor ya la cerró: quien la pinta la saca de la lista sin esperar. */
  onCerrada: (id: string) => void;
  /** Muestra el proyecto de la alerta (en el panel de la cuenta sí; en la lista ya se sabe la cuenta). */
  conProyecto?: boolean;
  className?: string;
}) {
  const toast = useToast();
  const [cerrando, setCerrando] = useState<Cierre | null>(null);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const s = SEVERIDAD[alerta.severidad] ?? SEVERIDAD.LOW;

  async function cerrar(status: Cierre) {
    setEnviando(true);
    try {
      await cambiarEstadoDeAlerta(alerta.id, status, nota.trim() || undefined);
      toast.success(status === "RESOLVED" ? "Alerta resuelta." : "Alerta descartada.");
      onCerrada(alerta.id);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cerrar la alerta.");
      setEnviando(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-1 rounded-xl border border-line bg-surface p-3", className)}>
      <span className="flex flex-wrap items-center gap-1.5">
        <Chip tono={s.tono}>{s.texto}</Chip>
        {alerta.delAgente ? <Chip tono="ia">Agente vigía</Chip> : <Chip>Aviso automático</Chip>}
        <span className="text-[13px] font-semibold text-fg">{alerta.titulo}</span>
      </span>
      {alerta.razon && <span className="line-clamp-3 text-xs text-fg-secondary">{alerta.razon}</span>}
      {/* La frase del cliente, verificada contra la reunión o el correo (2026-10-09): con ella la alerta pinta el color. */}
      {alerta.cita && (
        <span className="border-l-2 border-line pl-2 text-xs text-fg-secondary">
          «{alerta.cita.texto}» <span className="text-fg-muted">— {dondeLoDijo(alerta.cita, (d) => fmtDia(d, hoy))}</span>
        </span>
      )}
      {alerta.accion && <span className="text-xs text-fg-muted">Sugiere: {alerta.accion}</span>}
      {alerta.antes && (
        <span className="text-xs text-warn-ink">
          Volvió con una señal nueva. {textoDelCierre(alerta.antes, hoy)}.
        </span>
      )}

      {cerrando ? (
        <form
          className="mt-1 flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!enviando) void cerrar(cerrando);
          }}
        >
          <input
            autoFocus
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setCerrando(null);
                setNota("");
              }
            }}
            maxLength={LARGO_DE_LA_NOTA}
            placeholder={cerrando === "RESOLVED" ? "Qué se hizo (opcional)" : "Por qué no aplica (opcional)"}
            aria-label="Nota corta, opcional"
            className="w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg outline-none placeholder:text-fg-muted focus:border-brand"
          />
          <span className="flex items-center justify-end gap-1">
            <BotonTexto
              onClick={() => {
                setCerrando(null);
                setNota("");
              }}
              disabled={enviando}
            >
              Cancelar
            </BotonTexto>
            <button
              type="submit"
              disabled={enviando}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {enviando ? "Guardando…" : VERBO[cerrando]}
            </button>
          </span>
        </form>
      ) : (
        <span className="flex items-center gap-1">
          {conProyecto && alerta.proyecto && <span className="mr-auto truncate text-xs text-fg-muted">{alerta.proyecto}</span>}
          <span className={cn("flex gap-1", !(conProyecto && alerta.proyecto) && "ml-auto")}>
            <BotonTexto onClick={() => setCerrando("DISMISSED")}>Descartar</BotonTexto>
            <BotonTexto onClick={() => setCerrando("RESOLVED")} className="text-brand hover:text-brand-light">
              Resolver
            </BotonTexto>
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * Las alertas cerradas (resueltas o descartadas) de los últimos 30 días: ya no piden atención, pero
 * se consultan. «Volver a abrir» la devuelve a la lista tal cual y borra quién la cerró y su nota.
 */
export function AlertasCerradas({
  alertas,
  hoy,
  conCuenta = false,
}: {
  alertas: readonly AlertaCerrada[];
  hoy: string;
  /** En el índice se dice de qué cuenta es cada una; en el panel de la cuenta, no. */
  conCuenta?: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [reabiertas, setReabiertas] = useState<ReadonlySet<string>>(new Set());
  const visibles = alertas.filter((a) => !reabiertas.has(a.id));

  async function reabrir(id: string) {
    setAbriendo(id);
    try {
      await cambiarEstadoDeAlerta(id, "OPEN");
      setReabiertas((s) => new Set(s).add(id));
      toast.success("La alerta volvió a la lista.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo volver a abrir la alerta.");
    } finally {
      setAbriendo(null);
    }
  }

  if (visibles.length === 0) return <p className="text-[13px] text-fg-muted">Ninguna alerta cerrada en los últimos 30 días.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
      {visibles.map((a) => (
        <li key={a.id} className="flex flex-col gap-0.5 px-3 py-2.5">
          <span className="flex flex-wrap items-center gap-1.5">
            {conCuenta && (
              <Link href={`/customer-success/${a.clientId}`} className="text-[13px] font-semibold text-fg hover:text-brand">
                {a.cuenta}
              </Link>
            )}
            {a.delAgente && <Chip tono="ia">Agente vigía</Chip>}
            <span className={cn("text-[13px]", conCuenta ? "text-fg-secondary" : "font-semibold text-fg")}>{a.titulo}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="mr-auto text-xs text-fg-muted">
              {textoDelCierre({ estado: a.estado, fecha: a.cerradaEn, nota: a.nota, quien: a.quien }, hoy)}
            </span>
            <BotonTexto onClick={() => reabrir(a.id)} disabled={abriendo === a.id} className="flex-shrink-0">
              {abriendo === a.id ? "Abriendo…" : "Volver a abrir"}
            </BotonTexto>
          </span>
        </li>
      ))}
    </ul>
  );
}
