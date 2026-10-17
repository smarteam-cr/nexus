"use client";

/**
 * El CRONOGRAMA DEL CICLO de un proyecto recurrente (docs/smartloop-plan.md, etapa 3; ficha E). Va arriba del Gantt en
 * la pieza Cronograma: cada caso de uso del ciclo es una fase, con su criterio de aceptación, sus semanas, su avance y
 * sus dependencias del cliente. Debajo, las sesiones fijas (las series del calendario con la empresa).
 *
 *  · «Armar las fases»: los casos de uso sin fase pasan a ser fases que ocupan el ciclo; se ajustan en el Gantt.
 *  · «Aprobar esta versión»: lo que se le presentó al cliente queda como versión aprobada; lo que cambie después se dice.
 *  · Una dependencia del cliente atrasada: Nexus propone correr lo que destraba, con un clic. No lo mueve solo.
 *
 * Los datos salen de GET /api/projects/[id]/ciclo/cronograma; cada cambio recarga y avisa (`onCambio`) para que el
 * Gantt de abajo se vuelva a montar.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Field, Input, Select } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { BotonAzul, BotonBlanco, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import type { CronogramaDelCicloVista } from "@/lib/servicios/cronograma-del-ciclo-server";
import type { PanelDelServicio } from "@/lib/servicios/panel-del-servicio-server";
import type { CasoEnElCronograma } from "@/lib/timeline/ciclo";

const DIA = new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "short", timeZone: "UTC" });
const DIA_Y_HORA = new Intl.DateTimeFormat("es-CR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" });
const FECHA = new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Costa_Rica" });
const dia = (iso: string | null) => (iso ? DIA.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : null);

const ESTADO: Record<CasoEnElCronograma["estado"], { texto: string; clase: string }> = {
  sin_fase: { texto: "Sin fase", clase: "border-line text-fg-muted" },
  pendiente: { texto: "Pendiente", clase: "border-line text-fg-secondary" },
  en_curso: { texto: "En curso", clase: "border-info-line bg-info-surface text-brand" },
  hecha: { texto: "Hecho", clase: "border-success-line bg-success-surface text-success-ink" },
};

function semanas(c: CasoEnElCronograma): string {
  if (c.inicio == null || c.fin == null) return "";
  const s = c.fin - c.inicio === 1 ? `S${c.inicio}` : `S${c.inicio}–S${c.fin - 1}`;
  return c.desde && c.hasta ? `${s} · ${dia(c.desde)} al ${dia(c.hasta)}` : s;
}

export default function CronogramaDelCiclo({ projectId, onCambio }: { projectId: string; onCambio?: () => void }) {
  const toast = useToast();
  const [vista, setVista] = useState<CronogramaDelCicloVista | null | undefined>(undefined);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sesiones, setSesiones] = useState<PanelDelServicio["sesiones"] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/ciclo/cronograma`, { cache: "no-store" }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    if (!r?.ok) {
      setError(j?.error ?? "No se pudo cargar el cronograma del ciclo.");
      return;
    }
    setError(null);
    setVista(j.vista ?? null);
    setPuedeEditar(!!j.puedeEditar);
  }, [projectId]);

  useEffect(() => {
    void cargar();
    let vivo = true;
    fetch(`/api/projects/${projectId}/panel-del-servicio`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: PanelDelServicio | null) => {
        if (vivo && j) setSesiones(j.sesiones);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [cargar, projectId]);

  const accion = async (clave: string, body: object, ok: string) => {
    setOcupado(clave);
    try {
      const r = await fetch(`/api/projects/${projectId}/ciclo/cronograma`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        toast.error(j?.error ?? "No se pudo guardar.");
        return false;
      }
      toast.success(ok);
      await cargar();
      onCambio?.();
      return true;
    } finally {
      setOcupado(null);
    }
  };

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (vista === undefined) {
    return (
      <div className="space-y-2 rounded-xl border border-line bg-surface p-5" aria-busy="true">
        <div className="skeleton-shimmer h-4 w-48 rounded" />
        <div className="skeleton-shimmer h-10 rounded-lg" />
        <div className="skeleton-shimmer h-10 rounded-lg" />
      </div>
    );
  }
  if (vista === null) {
    return (
      <section className="rounded-xl border border-line bg-surface p-5 text-[13px] text-fg-secondary">
        No hay un ciclo abierto. Ábrelo desde la tarjeta de la etapa, en el Resumen: su cronograma aparece acá.
      </section>
    );
  }

  const { ciclo, cronograma, aprobada } = vista;
  const conCasos = cronograma.casos.length > 0;

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-5" data-recorrido="ciclo.cronograma">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={ROTULO_DEL_SISTEMA}>Cronograma del ciclo {ciclo.numero}</p>
          <h2 className="mt-1 text-sm font-semibold text-fg">
            {ciclo.nombre ?? `Ciclo ${ciclo.numero}`}
            {ciclo.desde && ciclo.hasta && (
              <span className="font-normal text-fg-muted">
                {" "}
                · {dia(ciclo.desde)} al {dia(ciclo.hasta)}
              </span>
            )}
          </h2>
          <p className="mt-1 text-xs text-fg-muted">
            {conCasos
              ? `${cronograma.avance.hechos} de ${cronograma.avance.total} casos de uso hechos${
                  cronograma.dependenciasAtrasadas
                    ? ` · ${cronograma.dependenciasAtrasadas} ${cronograma.dependenciasAtrasadas === 1 ? "dependencia del cliente atrasada" : "dependencias del cliente atrasadas"}`
                    : ""
                }`
              : "Cada caso de uso del ciclo es una fase de este cronograma, con su criterio de aceptación."}
          </p>
        </div>
        {puedeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            {cronograma.sinFase > 0 && (
              <BotonAzul onClick={() => void accion("armar", { accion: "armar" }, "Los casos de uso ya son fases del cronograma.")} disabled={!!ocupado}>
                {ocupado === "armar" ? "Armando…" : `Armar ${cronograma.sinFase === 1 ? "la fase" : `las ${cronograma.sinFase} fases`}`}
              </BotonAzul>
            )}
            {conCasos && cronograma.sinFase === 0 && (
              <BotonBlanco
                onClick={() => void accion("aprobar", { accion: "aprobar" }, "Quedó como la versión aprobada.")}
                disabled={!!ocupado}
                title="Lo que se le presentó al cliente: lo que cambie después se va a decir acá."
              >
                {ocupado === "aprobar" ? "Guardando…" : aprobada ? "Aprobar esta versión de nuevo" : "Aprobar esta versión"}
              </BotonBlanco>
            )}
          </div>
        )}
      </div>

      {!ciclo.desde || !ciclo.hasta ? (
        <Alert variant="warning">El ciclo no tiene fechas: ponlas en la tarjeta de la etapa, en el Resumen, para armar su cronograma.</Alert>
      ) : null}

      {aprobada ? (
        aprobada.cambios.length > 0 ? (
          <Alert variant="warning">
            <p className="font-medium">Cambió desde la versión aprobada (v{aprobada.version}):</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {aprobada.cambios.slice(0, 6).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {aprobada.cambios.length > 6 && <p className="mt-1">… y {aprobada.cambios.length - 6} cambios más.</p>}
          </Alert>
        ) : (
          <p className="text-xs text-fg-muted">
            Versión aprobada v{aprobada.version}
            {aprobada.at ? ` · ${FECHA.format(new Date(aprobada.at))}` : ""}
            {aprobada.por ? ` · ${aprobada.por}` : ""}. No cambió desde ahí.
          </p>
        )
      ) : conCasos ? (
        <p className="text-xs text-fg-muted">Todavía sin versión aprobada: apruébala cuando se la presentes al cliente.</p>
      ) : null}

      {!conCasos ? (
        <p className="text-[13px] text-fg-muted">
          El ciclo todavía no tiene casos de uso. Súmalos en La cuenta › Casos de uso: cada uno va a ser una fase de este cronograma.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {cronograma.casos.map((c) => (
            <CasoDelCronograma
              key={c.casoId}
              caso={c}
              puedeEditar={puedeEditar}
              ocupado={ocupado}
              onDependencia={(titulo, semana) =>
                accion(`dep-${c.casoId}`, { accion: "dependencia", casoId: c.casoId, titulo, semana }, "Se sumó la dependencia del cliente.")
              }
              onCorrer={() => void accion(`correr-${c.casoId}`, { accion: "correr", casoId: c.casoId }, "Se corrió la fase.")}
            />
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <p className={ROTULO_DEL_SISTEMA}>Sesiones fijas</p>
        {!sesiones ? (
          <div className="skeleton-shimmer h-4 w-64 rounded" />
        ) : sesiones.fijas.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{sesiones.aviso ?? "No hay reuniones de una serie con la empresa en las próximas 6 semanas."}</p>
        ) : (
          <ul className="space-y-1">
            {sesiones.fijas.map((s) => (
              <li key={s.titulo} className="text-[13px] text-fg-secondary">
                <span className="text-fg">{s.titulo}</span>
                <span className="text-fg-muted">
                  {s.cada ? ` · ${s.cada}` : ""} · próxima {DIA_Y_HORA.format(new Date(s.proxima))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function CasoDelCronograma({
  caso,
  puedeEditar,
  ocupado,
  onDependencia,
  onCorrer,
}: {
  caso: CasoEnElCronograma;
  puedeEditar: boolean;
  ocupado: string | null;
  onDependencia: (titulo: string, semana: number) => Promise<boolean>;
  onCorrer: () => void;
}) {
  const [sumando, setSumando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [semana, setSemana] = useState(1);
  const largo = caso.inicio != null && caso.fin != null ? caso.fin - caso.inicio : 1;
  const estado = ESTADO[caso.estado];

  const guardar = async () => {
    if (!titulo.trim()) return;
    if (await onDependencia(titulo.trim(), semana)) {
      setTitulo("");
      setSemana(1);
      setSumando(false);
    }
  };

  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-fg">{caso.titulo}</p>
          <p className={cn("mt-0.5 text-xs", caso.criterio ? "text-fg-secondary" : "text-warn-ink")}>
            {caso.criterio ? `Criterio: ${caso.criterio}` : "Sin criterio de aceptación: no se va a poder medir si funcionó."}
            {caso.metrica ? <span className="text-fg-muted"> · {caso.metrica}</span> : null}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2 text-xs">
          {caso.estado !== "sin_fase" && <span className="tabular-nums text-fg-muted">{semanas(caso)}</span>}
          <span className={cn("rounded-full border px-2 py-0.5", estado.clase)}>{estado.texto}</span>
          {caso.atrasado && <span className="rounded-full border border-danger-line bg-danger-surface px-2 py-0.5 text-danger-ink">Atrasado</span>}
        </div>
      </div>

      {caso.estado !== "sin_fase" && (
        <div className="space-y-1">
          {caso.tareas.total > 0 && (
            <p className="text-xs text-fg-muted">
              Tareas de Smarteam: {caso.tareas.hechas} de {caso.tareas.total} hechas
            </p>
          )}
          {caso.dependencias.length > 0 && (
            <ul className="space-y-0.5">
              {caso.dependencias.map((d) => (
                <li key={d.id} className="flex items-baseline gap-2 text-xs">
                  <span
                    className={cn(
                      "rounded-full border px-1.5 tabular-nums",
                      d.hecha
                        ? "border-success-line bg-success-surface text-success-ink"
                        : d.atrasada
                          ? "border-danger-line bg-danger-surface text-danger-ink"
                          : "border-line text-fg-secondary",
                    )}
                  >
                    {d.hecha ? "Hecha" : d.vence ? DIA.format(new Date(d.vence)) : "Sin fecha"}
                  </span>
                  <span className={d.hecha ? "text-fg-muted" : "text-fg-secondary"}>Depende del cliente: {d.titulo}</span>
                </li>
              ))}
            </ul>
          )}
          {caso.propuesta && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info-line bg-info-surface px-3 py-2 text-xs">
              <span className="text-fg-secondary">{caso.propuesta.texto}</span>
              {puedeEditar && (
                <BotonTexto onClick={onCorrer} disabled={!!ocupado}>
                  {ocupado === `correr-${caso.casoId}` ? "Corriendo…" : `Correr ${caso.propuesta.semanas} ${caso.propuesta.semanas === 1 ? "semana" : "semanas"}`}
                </BotonTexto>
              )}
            </div>
          )}
          {puedeEditar &&
            (sumando ? (
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Qué tiene que entregar el cliente" className="min-w-[220px] flex-1">
                  <Input
                    autoFocus
                    value={titulo}
                    maxLength={300}
                    onChange={(e) => setTitulo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void guardar();
                      if (e.key === "Escape") setSumando(false);
                    }}
                    placeholder="La base de contactos"
                  />
                </Field>
                <Field label="Semana del caso">
                  <Select value={String(semana)} onChange={(e) => setSemana(Number(e.target.value))} className="w-24">
                    {Array.from({ length: Math.max(1, largo) }, (_, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </Select>
                </Field>
                <BotonBlanco onClick={() => void guardar()} disabled={!titulo.trim() || !!ocupado}>
                  Sumar
                </BotonBlanco>
                <BotonTexto onClick={() => setSumando(false)}>Cancelar</BotonTexto>
              </div>
            ) : (
              <button type="button" onClick={() => setSumando(true)} className="text-xs font-medium text-brand hover:text-brand-light">
                + Dependencia del cliente
              </button>
            ))}
        </div>
      )}
    </li>
  );
}
