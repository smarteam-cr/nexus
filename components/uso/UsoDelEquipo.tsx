/**
 * components/uso/UsoDelEquipo.tsx — la pestaña «Equipo» de «Uso de Nexus»: cuánto usa Nexus cada persona y cada equipo
 * en el período elegido (rehecha el 2026-11-07, pedido de Elías: sin el mapa por día).
 *
 * Por persona, dos barras: los días que entró y las llamadas a la IA que disparó (con su costo; al pasar el mouse, los
 * agentes que más usó). Cada equipo cierra con su total. En orden alfabético dentro de cada equipo, sin ranking: sirve
 * para entender el uso, no para evaluar a nadie. Barras con divs y tokens: el estándar de gráficos de Nexus queda para
 * el rediseño. Las llamadas de un modelo sin tarifa no suman al costo: se dicen al lado («· 3 sin tarifa»). Quien ya no
 * está aparece al final de su equipo si tuvo uso en el período (lib/uso/periodo.ts).
 */
import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { UsoPorPeriodo } from "@/lib/uso/lectura-server";
import type { UsoDeUnaPersona } from "@/lib/uso/periodo";
import { numero, usd } from "@/lib/uso/ia";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (dia: string) => `${Number(dia.slice(8, 10))} ${MESES[Number(dia.slice(5, 7)) - 1]}`;

const COLUMNAS = "grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-4";

export default function UsoDelEquipo({ datos }: { datos: UsoPorPeriodo }) {
  if (!datos.equipos.length) {
    return <EmptyState title="Sin personas del equipo" description="No hay personas activas en el equipo para mostrar." />;
  }
  const empiezaAntes = datos.medidoDesde && datos.rango.desde < datos.medidoDesde;
  // Con alguna llamada sin tarifa, la columna del texto se ensancha en todas las filas: las barras siguen comparables.
  const anchoDeLaIa = datos.equipos.some((e) => e.total.sinTarifa > 0) ? "w-48" : "w-32";
  return (
    <section className="space-y-2" aria-labelledby="uso-del-periodo">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="uso-del-periodo" className="text-sm font-semibold text-fg">
          Uso por persona · {datos.rango.nombre}
        </h2>
        <span className="text-xs text-fg-muted">
          {datos.faltaLaTabla
            ? "Los días todavía no se miden: falta la tabla del registro de uso."
            : empiezaAntes
              ? `Las pantallas se miden desde el ${fechaCorta(datos.medidoDesde!)}; la IA por persona, desde agosto.`
              : "Días: días distintos en que entró. IA: llamadas que disparó."}
        </span>
      </div>
      <div className="rounded-xl border border-line bg-surface">
        <div className={cn(COLUMNAS, "border-b border-line px-4 py-2 text-[11px] text-fg-muted")}>
          <span>Persona</span>
          <span>Días que entró</span>
          <span>Uso de la IA (llamadas · costo)</span>
        </div>
        {datos.equipos.map((e) => (
          <div key={e.equipo} className="border-b border-line px-4 py-2 last:border-b-0">
            <p className="pb-1 text-xs font-semibold text-fg-secondary">
              {e.equipo}{" "}
              <span className="font-normal text-fg-muted">
                · {e.personas.length} {e.personas.length === 1 ? "persona" : "personas"}
              </span>
            </p>
            <div className="space-y-1">
              {e.personas.map((p) => (
                <FilaDePersona key={p.email} p={p} maximo={datos.maximo} anchoDeLaIa={anchoDeLaIa} />
              ))}
            </div>
            <div className={cn(COLUMNAS, "mt-1 border-t border-line pt-1.5 text-xs text-fg-secondary")}>
              <span className="font-semibold">Total del equipo</span>
              <span className="tabular-nums" title="La suma de los días de cada persona">
                {numero(e.total.dias)} días · {e.total.conUso} de {e.personas.length} con uso
              </span>
              <span className="tabular-nums">
                {numero(e.total.llamadas)} llamadas · {usd(e.total.costo)}
                <SinTarifa n={e.total.sinTarifa} />
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FilaDePersona({ p, maximo, anchoDeLaIa }: { p: UsoDeUnaPersona; maximo: { dias: number; llamadas: number }; anchoDeLaIa: string }) {
  const agentes = p.agentes.length
    ? `Los agentes que más usó:\n${p.agentes.map((a) => `· ${a.nombre}: ${numero(a.llamadas)}`).join("\n")}`
    : undefined;
  return (
    <div className={cn(COLUMNAS, "text-[13px]")}>
      <span className="truncate text-fg">{p.nombre}</span>
      <Barra valor={p.dias} maximo={maximo.dias} texto={numero(p.dias)} anchoTexto="w-8" />
      <Barra
        valor={p.llamadas}
        maximo={maximo.llamadas}
        texto={
          <>
            {numero(p.llamadas)} · {usd(p.costo)}
            <SinTarifa n={p.sinTarifa} />
          </>
        }
        anchoTexto={anchoDeLaIa}
        title={agentes}
      />
    </div>
  );
}

/** Las llamadas de un modelo sin tarifa: están en las llamadas, no en el costo. */
function SinTarifa({ n }: { n: number }) {
  if (!n) return null;
  return <span className="text-fg-muted"> · {numero(n)} sin tarifa</span>;
}

function Barra({ valor, maximo, texto, anchoTexto, title }: { valor: number; maximo: number; texto: ReactNode; anchoTexto: string; title?: string }) {
  const ancho = maximo > 0 ? Math.max(valor > 0 ? 2 : 0, Math.round((valor / maximo) * 100)) : 0;
  return (
    <span className="flex min-w-0 items-center gap-2" title={title}>
      <span className="h-3 flex-1 overflow-hidden rounded-[3px] bg-surface-muted">
        <span className="block h-full rounded-[3px] bg-brand" style={{ width: `${ancho}%` }} />
      </span>
      <span className={cn(anchoTexto, "shrink-0 tabular-nums", valor ? "text-fg-secondary" : "text-fg-muted")}>{texto}</span>
    </span>
  );
}
