"use client";

/**
 * components/tareas/PorCliente.tsx — «Tareas internas por cliente» (docs/tareas-plan.md §4.3).
 *
 * Una fila por empresa (o proyecto interno), agrupadas por para quién: abiertas hoy, hechas en el período, horas y
 * proyectos. Una fila se abre para ver sus tareas abiertas; cada una lleva al cajón de la tarea en Mis tareas. Todo es
 * sobre lo que ves. Una línea arriba aclara que el cronograma de cada proyecto va aparte.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, Segmentado } from "@/components/ui";
import { BotonBlanco, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { NOMBRE_DEL_AMBITO, type Ambito } from "@/lib/tareas/ambito";
import { rangoDeLaSemana } from "@/lib/tareas/semana";
import type { GrupoPorCliente, PeriodoPorCliente, PorClienteDatos } from "@/lib/tareas/tipos";
import { horas } from "./chips";
import { FilaDeTarea } from "./FilaDeTarea";
import { BotonDelAsistente } from "./AsistenteDeTareas";

const PERIODOS: { clave: PeriodoPorCliente; etiqueta: string }[] = [
  { clave: "semana", etiqueta: "Esta semana" },
  { clave: "mes", etiqueta: "Este mes" },
  { clave: "trimestre", etiqueta: "Trimestre" },
];

const NOMBRE_DEL_GRUPO: Record<Ambito, string> = {
  cliente: "Clientes",
  prospecto: "Prospectos",
  aliado: "Aliados",
  interno: "Interno",
  sin_clasificar: NOMBRE_DEL_AMBITO.sin_clasificar,
};

export default function PorCliente({ datos }: { datos: PorClienteDatos }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState<string | null>(null);
  const porAmbito = new Map<Ambito, GrupoPorCliente[]>();
  for (const g of datos.grupos) porAmbito.set(g.ambito, [...(porAmbito.get(g.ambito) ?? []), g]);
  const totalAbiertas = datos.grupos.reduce((a, g) => a + g.abiertas, 0);
  const totalHechas = datos.grupos.reduce((a, g) => a + g.hechas, 0);

  return (
    <div className={SHELL_DEFAULT}>
      <div className="space-y-5 pb-12">
        <PageHeader
          title="Tareas internas por cliente"
          description="El trabajo interno del equipo que ves, por para quién es. El cronograma de cada proyecto va aparte."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <BotonBlanco onClick={() => router.push("/tareas")}>Mis tareas</BotonBlanco>
              <BotonDelAsistente />
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-3">
          <Segmentado
            opciones={PERIODOS}
            valor={datos.periodo}
            onCambio={(p) => router.push(`/tareas/por-cliente?periodo=${p}`)}
            etiqueta="Período de lo hecho"
          />
          <span className="text-xs text-fg-muted">
            {totalAbiertas === 1 ? "1 abierta" : `${totalAbiertas} abiertas`} hoy · {totalHechas === 1 ? "1 hecha" : `${totalHechas} hechas`} desde la semana del {rangoDeLaSemana(datos.desde)}
          </span>
        </div>

        {datos.grupos.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-6 text-[13px] text-fg-muted">Todavía no hay tareas que veas, abiertas o hechas en este período.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="hidden grid-cols-[minmax(0,1fr)_88px_88px_96px_minmax(0,1fr)] gap-3 border-b border-line bg-surface-muted px-4 py-2 md:grid">
              <span className={ROTULO_DEL_SISTEMA}>Para quién</span>
              <span className={cn(ROTULO_DEL_SISTEMA, "text-right")}>Abiertas</span>
              <span className={cn(ROTULO_DEL_SISTEMA, "text-right")}>Hechas</span>
              <span className={cn(ROTULO_DEL_SISTEMA, "text-right")}>Horas</span>
              <span className={ROTULO_DEL_SISTEMA}>Proyectos</span>
            </div>
            {(["cliente", "prospecto", "aliado", "interno", "sin_clasificar"] as const).map((a) => {
              const grupos = porAmbito.get(a);
              if (!grupos?.length) return null;
              return (
                <section key={a} aria-label={NOMBRE_DEL_GRUPO[a]}>
                  <p className="border-b border-line px-4 pb-1.5 pt-3 text-xs font-semibold text-fg-secondary">
                    {NOMBRE_DEL_GRUPO[a]} · {grupos.length}
                  </p>
                  <ul className="divide-y divide-line">
                    {grupos.map((g) => (
                      <li key={g.clave}>
                        <button
                          type="button"
                          aria-expanded={abierta === g.clave}
                          onClick={() => setAbierta((x) => (x === g.clave ? null : g.clave))}
                          disabled={g.abiertas === 0}
                          className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover disabled:cursor-default disabled:hover:bg-transparent md:grid-cols-[minmax(0,1fr)_88px_88px_96px_minmax(0,1fr)]"
                        >
                          <span className="min-w-0 truncate text-[13px] font-medium text-fg">
                            {g.abiertas > 0 && <span className="mr-1.5 inline-block w-3 text-fg-muted">{abierta === g.clave ? "▾" : "▸"}</span>}
                            {g.etiqueta}
                          </span>
                          <span className="text-right text-[13px] tabular-nums text-fg">{g.abiertas}</span>
                          <span className="hidden text-right text-[13px] tabular-nums text-fg-secondary md:block">{g.hechas}</span>
                          <span className="hidden text-right text-[13px] tabular-nums text-fg-secondary md:block">
                            {g.minutos ? horas(g.minutos) : "—"}
                            {g.sinEstimar > 0 && <span className="block text-[11px] text-fg-muted">+{g.sinEstimar} sin estimar</span>}
                          </span>
                          <span className="hidden min-w-0 truncate text-xs text-fg-muted md:block">
                            {g.proyectos.length ? g.proyectos.map((p) => `${p.nombre} (${p.abiertas})`).join(" · ") : "Sin proyecto"}
                          </span>
                        </button>
                        {abierta === g.clave && (
                          <ul className="divide-y divide-line border-t border-line bg-surface-muted">
                            {g.tareas.map((t) => (
                              <FilaDeTarea key={t.id} t={t} conResponsable onAbrir={(x) => router.push(`/tareas?t=${x.id}`)} />
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
