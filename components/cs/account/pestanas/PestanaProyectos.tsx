"use client";

/**
 * components/cs/account/pestanas/PestanaProyectos.tsx — «Proyectos» (rediseño del 2026-10-05): la
 * tabla de los proyectos activos, por qué se movió el plan (las desviaciones confirmadas que
 * corrieron fechas, con quién las causó) y lo que se cerró hace poco.
 */
import { fmtDia, plural } from "@/lib/cs/formato";
import type { CsAccountData } from "@/lib/cs/load-account";
import { Chip, TituloDeSeccion } from "../../piezas";
import ActiveProjectsSection from "../ActiveProjectsSection";
import { Vacio } from "./comun";

/** Quién causó la desviación, dicho como en el cronograma (`TaskParty`). */
const QUIEN: Record<string, { texto: string; atencion: boolean }> = {
  CLIENTE: { texto: "Cliente", atencion: true },
  SMARTEAM: { texto: "Smarteam", atencion: false },
  AMBOS: { texto: "Ambos", atencion: false },
  DEV: { texto: "Desarrollo", atencion: false },
};

export default function PestanaProyectos({ data, puedeCurar }: { data: CsAccountData; puedeCurar: boolean }) {
  const activos = data.cuenta.proyectos.filter((x) => x.activo);
  const bloqueados = activos.filter((x) => x.bloqueado).length;
  const corrimiento = Math.max(0, ...activos.map((x) => x.cierre.corrimientoDias ?? 0));
  const cerrados = data.cuenta.proyectos.filter((x) => !x.activo);
  const semanasDesviadas = data.desvios.reduce((s, d) => s + d.semanas, 0);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <TituloDeSeccion
          titulo="Proyectos"
          ayuda={`${plural(data.projects.length, "activo", "activos")}. Lo que se entrega y si va a tiempo.`}
          derecha={
            <>
              {bloqueados > 0 && <Chip tono="atencion">{plural(bloqueados, "bloqueado", "bloqueados")}</Chip>}
              {corrimiento >= 7 && <Chip tono="atencion">Cierre corrido +{Math.round(corrimiento / 7)} semanas</Chip>}
            </>
          }
        />
        <ActiveProjectsSection
          projects={data.projects}
          projectOps={data.projectOps}
          csePorProyecto={Object.fromEntries(data.cuenta.proyectos.map((p) => [p.id, { nombre: p.cseNombre, deBaja: p.cseDeBaja ?? null }]))}
          puedeCurar={puedeCurar}
        />
      </section>

      <section className="flex flex-col gap-3">
        <TituloDeSeccion
          titulo="Por qué se movió el plan"
          ayuda={
            data.desvios.length
              ? `Las desviaciones confirmadas en el cronograma que corrieron fechas: ${plural(semanasDesviadas, "semana", "semanas")} en total, con quién las causó.`
              : "Las desviaciones confirmadas en el cronograma que corrieron fechas, con quién las causó."
          }
        />
        {data.desvios.length === 0 ? (
          <Vacio>Ningún proyecto de esta cuenta registra desviaciones que hayan movido fechas.</Vacio>
        ) : (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {data.desvios.map((d, i) => {
              const quien = QUIEN[d.quien] ?? { texto: d.quien, atencion: false };
              return (
                <div key={`${d.fecha}-${i}`} className="grid grid-cols-[96px_110px_minmax(0,1fr)_80px] items-center gap-4 px-4 py-3">
                  <span className="text-sm font-semibold tabular-nums text-warn-ink">+{plural(d.semanas, "semana", "semanas")}</span>
                  <span>
                    <Chip tono={quien.atencion ? "atencion" : "neutro"}>{quien.texto}</Chip>
                  </span>
                  <span className="flex min-w-0 flex-col gap-px">
                    <span className="text-[13px] text-fg">{d.titulo}</span>
                    <span className="text-xs text-fg-muted">{d.proyecto}</span>
                  </span>
                  <span className="text-right text-xs text-fg-muted">{fmtDia(d.fecha, data.hoy)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {cerrados.length > 0 && (
        <section className="flex flex-col gap-3">
          <TituloDeSeccion titulo="Cerrados hace poco" ayuda="La fecha es la del último cambio del proyecto: Nexus no guarda la del cierre exacto." />
          <div className="divide-y divide-line rounded-xl border border-line bg-surface px-4">
            {cerrados.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[13px]">
                <span>
                  <b className="font-semibold text-fg">{x.nombre}</b>
                  {x.cerradoEn && <span className="text-fg-muted"> · hacia el {fmtDia(x.cerradoEn, data.hoy)}</span>}
                </span>
                {(x.cierre.corrimientoDias ?? 0) >= 7 ? (
                  <Chip>+{Math.round((x.cierre.corrimientoDias ?? 0) / 7)} semanas</Chip>
                ) : (
                  <span className="text-xs text-fg-muted">{x.etapa ?? "Cerrado"}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
