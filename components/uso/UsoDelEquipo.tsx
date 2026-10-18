"use client";

/**
 * components/uso/UsoDelEquipo.tsx — la pestaña «Equipo» de «Uso de Nexus» (etapa 4a de docs/mi-dia-plan.md).
 *
 * Arriba, tres números; al centro, los días con uso de cada persona en las últimas 4 semanas, por equipo (el color es
 * cuántas veces abrió Nexus ese día); al tocar a alguien, qué secciones abre y a qué hora suele entrar. En orden
 * alfabético dentro de cada equipo, sin ranking: sirve para entender el uso, no para evaluar a nadie.
 */
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { UsoDelEquipo as Datos, UsoDeLaPersona } from "@/lib/uso/lectura-server";
import { usoPorEquipo } from "@/lib/uso/por-equipo";

const DIAS_DE_LA_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const fechaCorta = (dia: string) => `${Number(dia.slice(8, 10))} ${MESES[Number(dia.slice(5, 7)) - 1]}`;

/** Los cortes del color: 0 · 1–2 · 3–5 · 6–10 · más de 10 aperturas en el día. */
const CORTES = [
  { hasta: 0, pct: 0, texto: "Sin uso" },
  { hasta: 2, pct: 22, texto: "1 a 2" },
  { hasta: 5, pct: 45, texto: "3 a 5" },
  { hasta: 10, pct: 70, texto: "6 a 10" },
  { hasta: Infinity, pct: 95, texto: "Más de 10" },
];

function colorDe(n: number): React.CSSProperties | undefined {
  const c = CORTES.find((x) => n <= x.hasta)!;
  return c.pct ? { backgroundColor: `color-mix(in srgb, var(--color-brand) ${c.pct}%, transparent)` } : undefined;
}

export default function UsoDelEquipo({ datos }: { datos: Datos }) {
  const [elegida, setElegida] = useState<string | null>(null);
  const equipos = useMemo(() => {
    const por = new Map<string, UsoDeLaPersona[]>();
    for (const p of datos.personas) por.set(p.equipo, [...(por.get(p.equipo) ?? []), p]);
    return [...por.entries()];
  }, [datos.personas]);

  if (datos.faltaLaTabla) {
    return (
      <EmptyState
        title="Todavía no se mide"
        description="Falta la tabla del registro de uso en la base (scripts/sql/2026-10-16-uso-de-nexus.sql). Cuando esté, Nexus cuenta cada sección que abre cada persona."
      />
    );
  }

  const lunes = datos.dias[datos.dias.length - 7];
  const conUsoEstaSemana = datos.personas.filter((p) => p.diasEstaSemana > 0).length;
  const promedioDias = datos.personas.length
    ? datos.personas.reduce((s, p) => s + p.diasConUso, 0) / datos.personas.length
    : 0;
  const persona = datos.personas.find((p) => p.email === elegida) ?? null;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Numero titulo="Con uso esta semana" valor={`${conUsoEstaSemana} de ${datos.personas.length}`} pie={`desde el lunes ${fechaCorta(lunes)}`} />
        <Numero
          titulo="Días con uso por persona"
          valor={promedioDias.toLocaleString("es-CR", { maximumFractionDigits: 1 })}
          pie={`promedio de las últimas 4 semanas, de ${datos.dias.filter((d) => d <= datos.hoy).length} días`}
        />
        <Numero
          titulo="Se mide desde"
          valor={datos.medidoDesde ? fechaCorta(datos.medidoDesde) : "hoy"}
          pie="antes de eso no hay registro: un día vacío no es un día sin uso"
        />
      </div>

      <section className="space-y-2" aria-labelledby="dias-con-uso">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="dias-con-uso" className="text-sm font-semibold text-fg">
            Días con uso, por persona
          </h2>
          <Leyenda />
        </div>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <div className="min-w-[760px]">
            <div className="grid items-end gap-px px-4 pb-1 pt-3 text-[11px] text-fg-muted" style={{ gridTemplateColumns: `200px repeat(${datos.dias.length}, minmax(0, 1fr)) 64px` }}>
              <span />
              {datos.dias.map((d, i) => (
                <span key={d} className={cn("text-center", d === datos.hoy && "font-semibold text-fg")}>
                  {i % 7 === 0 ? fechaCorta(d) : DIAS_DE_LA_SEMANA[i % 7]}
                </span>
              ))}
              <span className="text-right">Días</span>
            </div>
            {equipos.map(([equipo, personas]) => (
              <div key={equipo} className="border-t border-line px-4 py-2">
                <p className="pb-1 text-xs font-semibold text-fg-secondary">
                  {equipo} <span className="font-normal text-fg-muted">· {personas.length} {personas.length === 1 ? "persona" : "personas"}</span>
                </p>
                {personas.map((p) => (
                  <button
                    key={p.email}
                    type="button"
                    onClick={() => setElegida(p.email === elegida ? null : p.email)}
                    aria-pressed={p.email === elegida}
                    className={cn(
                      "grid w-full items-center gap-px rounded py-0.5 text-left text-[13px] transition-colors hover:bg-surface-hover",
                      p.email === elegida && "bg-surface-hover",
                    )}
                    style={{ gridTemplateColumns: `200px repeat(${datos.dias.length}, minmax(0, 1fr)) 64px` }}
                    title={`Ver qué abre ${p.nombre}`}
                  >
                    <span className="truncate pr-2 text-fg">{p.nombre}</span>
                    {datos.dias.map((d) => {
                      const n = p.porDia[d] ?? 0;
                      const futuro = d > datos.hoy;
                      return (
                        <span
                          key={d}
                          className={cn("h-5 rounded-[3px]", futuro ? "bg-transparent" : "bg-surface-muted")}
                          style={futuro ? undefined : colorDe(n)}
                          title={futuro ? undefined : `${fechaCorta(d)}: ${n === 0 ? "sin uso" : `${n} ${n === 1 ? "apertura" : "aperturas"}`}`}
                        />
                      );
                    })}
                    <span className="text-right tabular-nums text-fg-secondary">{p.diasConUso}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-fg-muted">
          Una apertura es entrar a una sección de Nexus, o volver a ella después de 30 minutos. No se guarda qué cliente ni
          qué documento se miró. Toca a una persona para ver qué abre.
        </p>
      </section>

      {persona && <DetalleDeLaPersona p={persona} />}

      {datos.porSeccion.length > 0 && <QueUsaCadaEquipo personas={datos.personas} />}
    </div>
  );
}

function DetalleDeLaPersona({ p }: { p: UsoDeLaPersona }) {
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4" aria-labelledby="detalle-persona">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="detalle-persona" className="text-sm font-semibold text-fg">
          {p.nombre} <span className="font-normal text-fg-muted">· {p.equipo}</span>
        </h2>
        <span className="text-xs text-fg-muted">
          {p.horaPrimera && p.horaUltima
            ? `Suele entrar a las ${p.horaPrimera} y lo último del día es a las ${p.horaUltima}.`
            : p.ultimoDia
              ? `Lo último que abrió fue el ${fechaCorta(p.ultimoDia)}.`
              : "Todavía no abrió Nexus desde que se mide."}
        </span>
      </div>
      {p.secciones.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Sin uso en las últimas 4 semanas.</p>
      ) : (
        <div className="divide-y divide-line">
          {p.secciones.map((s) => (
            <div key={s.clave} className="flex items-center justify-between gap-4 py-2 text-[13px]">
              <span className="text-fg">{s.nombre}</span>
              <span className="tabular-nums text-fg-secondary">
                {s.dias} {s.dias === 1 ? "día" : "días"} <span className="text-fg-muted">· {s.aperturas} aperturas</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Qué secciones abre cada equipo: cuántas personas del equipo la abrieron en las 4 semanas. Una celda vacía es una
 * sección que nadie del equipo abrió.
 */
function QueUsaCadaEquipo({ personas }: { personas: readonly UsoDeLaPersona[] }) {
  const { secciones, equipos } = useMemo(() => usoPorEquipo(personas), [personas]);
  const columnas = { gridTemplateColumns: `180px repeat(${secciones.length}, minmax(76px, 1fr))` };
  return (
    <section className="space-y-2" aria-labelledby="que-usa-cada-equipo">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="que-usa-cada-equipo" className="text-sm font-semibold text-fg">
          Qué usa cada equipo, en las últimas 4 semanas
        </h2>
        <span className="text-xs text-fg-muted">Personas del equipo que abrieron cada sección. Vacío: nadie del equipo la abrió.</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <div style={{ minWidth: 180 + secciones.length * 80 }}>
          <div className="grid gap-px border-b border-line px-4 py-2 text-[11px] text-fg-muted" style={columnas}>
            <span>Equipo</span>
            {secciones.map((s) => (
              <span key={s.clave} className="truncate text-center" title={s.nombre}>
                {s.nombre}
              </span>
            ))}
          </div>
          {equipos.map((e) => (
            <div key={e.equipo} className="grid items-center gap-px border-t border-line px-4 py-1.5 text-[13px] first:border-t-0" style={columnas}>
              <span className="truncate text-fg">
                {e.equipo} <span className="text-xs text-fg-muted">· {e.personas}</span>
              </span>
              {secciones.map((s) => {
                const c = e.porSeccion[s.clave];
                const parte = c ? c.personas / e.personas : 0;
                return (
                  <span
                    key={s.clave}
                    className={cn("rounded-[3px] py-1 text-center tabular-nums", c ? "text-fg" : "text-fg-muted")}
                    style={c ? { backgroundColor: `color-mix(in srgb, var(--color-brand) ${Math.round(12 + parte * 45)}%, transparent)` } : undefined}
                    title={c ? `${e.equipo} · ${s.nombre}: ${c.personas} de ${e.personas} · ${c.dias} ${c.dias === 1 ? "día" : "días"} de uso` : `Nadie de ${e.equipo} abrió ${s.nombre}`}
                  >
                    {c ? `${c.personas}/${e.personas}` : "—"}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Numero({ titulo, valor, pie }: { titulo: string; valor: string; pie: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-fg-muted">{titulo}</p>
      <p className="text-xl font-semibold tabular-nums text-fg">{valor}</p>
      <p className="text-xs text-fg-muted">{pie}</p>
    </div>
  );
}

function Leyenda() {
  return (
    <span className="flex items-center gap-2 text-[11px] text-fg-muted">
      Aperturas en el día:
      {CORTES.map((c) => (
        <span key={c.texto} className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-[3px] bg-surface-muted" style={colorDe(c.hasta === Infinity ? 11 : c.hasta)} />
          {c.texto}
        </span>
      ))}
    </span>
  );
}
