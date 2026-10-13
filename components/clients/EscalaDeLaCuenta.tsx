"use client";

/**
 * components/clients/EscalaDeLaCuenta.tsx — La cuenta › La escala (2026-10-12, pedido de Elías).
 *
 * Dónde está la empresa en cada área de la escala, con la fecha y de dónde sale, venga o no de una preventa. Sin una
 * posición, dice cómo posicionarla. Datos: GET /api/clients/[id]/escala (lib/exploraciones/escala-de-la-empresa.ts).
 * Interno: el cliente no lo ve.
 */
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Alert, EmptyState } from "@/components/ui";
import { SkeletonPanel, SkeletonText } from "@/components/ui/Skeleton";
import { BotonBlanco, QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { PUNTO_DE_NIVEL, nombreDe } from "@/components/escala/niveles";
import type { EscalaDeLaEmpresa, PosicionDeLaEmpresa } from "@/lib/exploraciones/escala-de-la-empresa";
import type { Letra } from "@/lib/escala/documento/tipos";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** La fecha en la hora de Costa Rica (UTC-6), armada a mano: así servidor y navegador dicen lo mismo. */
function fecha(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 6 * 3_600_000);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function Nivel({ letra, niveles, hipotesis }: { letra: Letra | null; niveles: { letra: Letra; nombre: string }[]; hipotesis?: boolean }) {
  if (!letra) return <span className="text-[13px] text-fg-muted">Sin nivel</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-fg">
      <span
        aria-hidden="true"
        className={cn("h-2.5 w-2.5 flex-shrink-0 rounded-full", hipotesis ? "border-2 bg-transparent" : PUNTO_DE_NIVEL[letra])}
        style={hipotesis ? { borderColor: `var(--color-nivel-${{ D: "deficiente", I: "inicial", F: "funcional", E: "eficiente", O: "optimo" }[letra]})` } : undefined}
      />
      {nombreDe(niveles, letra)}
      {letra === "F" && <span className="rounded-full border border-line bg-surface px-1.5 text-[11px] text-fg-muted">La base</span>}
      {hipotesis && <span className="text-[11px] text-fg-muted">· hipótesis</span>}
    </span>
  );
}

const deDonde = (p: PosicionDeLaEmpresa) => (p.proyecto ? `La escala de la Exploración de «${p.proyecto.nombre}»` : "La escala de la preventa");

export default function EscalaDeLaCuenta({
  clientId,
  slotDelPanel,
  onAbrirExploracion,
}: {
  clientId: string;
  slotDelPanel: HTMLElement | null;
  /** Abre la Exploración de un proyecto (ahí se confirma cada nivel con su evidencia). */
  onAbrirExploracion: (projectId: string) => void;
}) {
  const [datos, setDatos] = useState<EscalaDeLaEmpresa | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/clients/${clientId}/escala`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error ?? "No se pudo cargar la escala de la empresa.");
        return j as EscalaDeLaEmpresa;
      })
      .then((j) => vivo && setDatos(j))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar la escala de la empresa."));
    return () => {
      vivo = false;
    };
  }, [clientId]);

  const encabezado = (
    <div>
      <h2 className="text-[22px] font-bold leading-tight text-fg">La escala</h2>
      <p className="mt-1 text-[13px] text-fg-muted">Dónde está la empresa en cada área, con la fecha y de dónde sale. Sirve venga o no de una preventa.</p>
    </div>
  );

  if (error) {
    return (
      <div className="space-y-6 px-8 pb-10 pt-6">
        {encabezado}
        <Alert variant="danger">{error}</Alert>
      </div>
    );
  }
  if (!datos) {
    return (
      <div className="space-y-6 px-8 pb-10 pt-6" aria-busy="true">
        {encabezado}
        <SkeletonPanel minH="min-h-[260px]">
          <SkeletonText lines={4} />
        </SkeletonPanel>
      </div>
    );
  }
  if (datos.estado === "sin-escala") {
    return (
      <div className="space-y-6 px-8 pb-10 pt-6">
        {encabezado}
        <Alert variant="warning">Todavía no hay una versión publicada de la escala.</Alert>
      </div>
    );
  }

  const actual = datos.posiciones[0] ?? null;
  const proyecto = datos.proyectos[0] ?? null;
  const queSigue = !actual
    ? "La empresa todavía no está posicionada en la escala: confirma el nivel de cada dimensión en La escala de la Exploración de un proyecto."
    : actual.areas.some((a) => a.conNivel < a.aplican)
      ? `Faltan dimensiones sin nivel en ${actual.areas.filter((a) => a.conNivel < a.aplican).map((a) => a.nombre).join(" y ")}.`
      : null;

  return (
    <div className="space-y-6 px-8 pb-10 pt-6">
      {encabezado}
      {slotDelPanel &&
        queSigue &&
        createPortal(
          <QueSigue
            accion={
              proyecto ? <BotonBlanco onClick={() => onAbrirExploracion((actual?.proyecto ?? proyecto).id)}>Abrir la Exploración</BotonBlanco> : null
            }
          >
            {queSigue}
          </QueSigue>,
          slotDelPanel,
        )}

      {!actual ? (
        <EmptyState
          title="La empresa todavía no está posicionada en la escala"
          description="Sin una posición con fecha no hay de dónde partir ni cómo medir cuánto se movió. Se posiciona de tres maneras: confirmando cada nivel en La escala de la Exploración de un proyecto, mandando el cuestionario de la escala al cliente, o en el Diagnóstico."
          action={proyecto ? <BotonBlanco onClick={() => onAbrirExploracion(proyecto.id)}>Abrir la Exploración de «{proyecto.nombre}»</BotonBlanco> : undefined}
        />
      ) : (
        <>
          <p className="text-[13px] text-fg-secondary">
            Hoy, según <span className="font-medium text-fg">{deDonde(actual)}</span> · {fecha(actual.fecha)}
            {actual.edicion ? ` · edición ${actual.edicion}` : ""}
          </p>
          <div className="grid gap-4 xl:grid-cols-2">
            {actual.areas.map((a) => (
              <section key={a.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-fg">{a.nombre}</h3>
                  <span className="flex items-baseline gap-2">
                    <Nivel letra={a.nivel} niveles={datos.niveles} />
                    {a.puntaje !== null && <span className="text-xs tabular-nums text-fg-muted">{a.puntaje} de 100</span>}
                  </span>
                </div>
                {(["base", "produccion"] as const).map((capa) => (
                  <div key={capa} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2 border-b border-line pb-1">
                      <span className={ROTULO_DEL_SISTEMA}>{a.capas[capa].nombre}</span>
                      <Nivel letra={a.capas[capa].nivel} niveles={datos.niveles} />
                    </div>
                    <ul className="flex flex-col">
                      {a.dimensiones
                        .filter((d) => d.capa === capa)
                        .map((d) => (
                          <li key={d.id} className={cn("flex items-baseline justify-between gap-3 py-1 text-[13px]", !d.aplica && "opacity-60")}>
                            <span className="min-w-0 text-fg-secondary">
                              <span className="tabular-nums text-fg-muted">{d.id}</span> {d.nombre}
                            </span>
                            {d.aplica ? (
                              <Nivel letra={d.nivel} niveles={datos.niveles} hipotesis={d.clase === "hipotesis"} />
                            ) : (
                              <span className="text-xs text-fg-muted">No aplica</span>
                            )}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
                <p className="text-xs text-fg-muted">
                  {a.conNivel} de {a.aplican} dimensiones con nivel. El área queda en su capa más baja, y la capa en su dimensión más débil.
                </p>
              </section>
            ))}
          </div>

          {datos.posiciones.length > 1 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-fg">Historial</h3>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {datos.posiciones.map((p) => (
                  <li key={p.exploracionId} className="flex flex-wrap items-baseline justify-between gap-3 px-4 py-2.5 text-[13px]">
                    <span className="text-fg-secondary">
                      <span className="tabular-nums text-fg">{fecha(p.fecha)}</span> · {deDonde(p)}
                    </span>
                    <span className="flex flex-wrap gap-3">
                      {p.areas.map((a) => (
                        <span key={a.id} className="inline-flex items-baseline gap-1.5">
                          <span className="text-fg-muted">{a.nombre}</span>
                          <Nivel letra={a.nivel} niveles={datos.niveles} />
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
