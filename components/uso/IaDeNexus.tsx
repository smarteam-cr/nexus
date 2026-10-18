/**
 * components/uso/IaDeNexus.tsx — las pestañas «IA por cliente», «Procesos de IA» y «Conclusiones» de «Uso de Nexus».
 * Server Components: reciben los datos ya leídos (lib/uso/ia-server.ts) y no tienen estado; solo el gráfico semanal es
 * de cliente.
 *
 * ⛔ El gasto de IA va por proceso y por empresa, nunca por persona. Es una estimación con la tarifa de Anthropic, no
 * contabilidad, y cada bloque lo dice.
 */
import Link from "next/link";
import { Alert, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { PROCESO_POR_CLAVE, numero, pct, usd, type ClaveDeProceso, type UsoDeLoQuePropone } from "@/lib/uso/ia";
import type { ClienteConIa, DatosDeIa } from "@/lib/uso/ia-server";
import { UMBRALES, type Conclusion, type TemaDeConclusion } from "@/lib/uso/conclusiones";
import { direccionDeUso, type DiasDeIa, type VistaDeUso } from "@/lib/uso/vistas";
import { BarraDeUso, Cifra, LeyendaDeUso } from "./piezas";
import GastoPorSemana, { type SerieSemanal } from "./GastoPorSemana";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (iso: string) => {
  const cr = new Date(new Date(iso).getTime() - 6 * 3_600_000).toISOString();
  return `${Number(cr.slice(8, 10))} ${MESES[Number(cr.slice(5, 7)) - 1]}`;
};
const nombreDelProceso = (c: ClaveDeProceso) => PROCESO_POR_CLAVE.get(c)?.nombre ?? c;

const NOTA_DE_TARIFA = "Estimado con la tarifa de Anthropic: no es contabilidad.";

const TIPO_DE_EMPRESA: Record<string, string> = { PROSPECTO: "Prospecto", ALIADO: "Aliado", INTERNO: "Smarteam" };

function SinTabla() {
  return (
    <EmptyState
      title="Todavía no se mide el gasto de IA"
      description="Falta la tabla del medidor en la base (scripts/sql/2026-08-17-llm-call.sql). Cuando esté, cada llamada a Claude queda contada."
    />
  );
}

function AvisoDelTope({ datos }: { datos: DatosDeIa }) {
  if (!datos.llegoAlTope) return null;
  return (
    <Alert variant="warning">
      Hay más llamadas de las que se leen ({numero(datos.resumen.leidas)}): los totales son un piso, no el gasto entero.
    </Alert>
  );
}

// ── IA por cliente ─────────────────────────────────────────────────────────────

export function IaPorCliente({ datos }: { datos: DatosDeIa }) {
  if (datos.faltaLaTabla) return <SinTabla />;
  const { total, conCliente, sinCliente } = datos.resumen;
  if (total.llamadas === 0) {
    return <EmptyState title={`Sin IA en ${datos.dias} días`} description="Cuando Nexus llame a Claude para una cuenta, se cuenta acá." />;
  }
  const aproximadas = datos.clientes.reduce((s, c) => s + c.porAproximacion, 0);
  const cartera = datos.clientes.filter((c) => c.tipo === "CLIENTE" || c.tipo === "PROSPECTO");
  const deLaCasa = datos.clientes.filter((c) => c.tipo !== "CLIENTE" && c.tipo !== "PROSPECTO");
  const parte = (n: number) => (total.costo > 0 ? ` (${pct(n / total.costo)})` : "");

  return (
    <div className="space-y-6">
      <AvisoDelTope datos={datos} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Cifra titulo="Gasto en IA" valor={usd(total.costo)} pie={`${numero(total.llamadas)} llamadas desde el ${fechaCorta(datos.desde)}`} />
        <Cifra
          titulo="Sabemos de qué empresa es"
          valor={`${usd(conCliente.costo)}${parte(conCliente.costo)}`}
          pie={aproximadas ? `${numero(aproximadas)} llamadas ubicadas por su corrida o su reunión` : "cada llamada dice su empresa"}
        />
        <Cifra
          titulo="Sin empresa"
          valor={`${usd(sinCliente.costo)}${parte(sinCliente.costo)}`}
          pie={`${numero(sinCliente.llamadas)} llamadas que no dicen de qué empresa son`}
          tono={total.costo > 0 && sinCliente.costo / total.costo >= UMBRALES.parteSinEmpresa ? "warn" : undefined}
        />
      </div>

      <TablaDeEmpresas
        titulo="Clientes y prospectos"
        nota="De más a menos gasto. Al lado, qué se hizo con lo que Nexus propuso en esa cuenta."
        clientes={cartera}
        totalCosto={total.costo}
      />
      {deLaCasa.length > 0 && <TablaDeEmpresas titulo="Smarteam y aliados" clientes={deLaCasa} totalCosto={total.costo} />}

      <div className="space-y-1 text-xs text-fg-muted">
        <LeyendaDeUso />
        <p>
          {NOTA_DE_TARIFA} Una llamada sin empresa se ubica por su corrida o por la reunión que la disparó; si no, queda
          «Sin empresa»: no se adivina. El tipo de empresa es el de hoy.
          {datos.soloPropuesto > 0 &&
            ` Además, a ${numero(datos.soloPropuesto)} ${datos.soloPropuesto === 1 ? "empresa" : "empresas"} Nexus les propuso algo sin gastar IA (por ejemplo, una alerta de una regla).`}
        </p>
      </div>
    </div>
  );
}

const MAX_EMPRESAS = 60;

function TablaDeEmpresas({ titulo, nota, clientes, totalCosto }: { titulo: string; nota?: string; clientes: ClienteConIa[]; totalCosto: number }) {
  if (!clientes.length) return null;
  const visibles = clientes.slice(0, MAX_EMPRESAS);
  const resto = clientes.slice(MAX_EMPRESAS);
  const columnas = { gridTemplateColumns: "minmax(0, 1.4fr) 110px 80px minmax(0, 1.2fr) 200px" };
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">
          {titulo} <span className="font-normal text-fg-muted">· {clientes.length}</span>
        </h2>
        {nota && <span className="text-xs text-fg-muted">{nota}</span>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <div className="min-w-[860px]">
          <div className="grid gap-3 border-b border-line px-4 py-2 text-xs text-fg-muted" style={columnas}>
            <span>Empresa</span>
            <span className="text-right">Gasto</span>
            <span className="text-right">Llamadas</span>
            <span>En qué</span>
            <span>Lo que propuso Nexus</span>
          </div>
          {visibles.map((c, i) => (
            <div key={c.clientId} className={cn("grid items-center gap-3 px-4 py-2 text-[13px]", i > 0 && "border-t border-line")} style={columnas}>
              <span className="min-w-0 truncate">
                <Link href={`/clients/${c.clientId}`} className="text-fg transition-colors hover:text-brand">
                  {c.nombre}
                </Link>
                {TIPO_DE_EMPRESA[c.tipo] && <span className="ml-2 text-xs text-fg-muted">{TIPO_DE_EMPRESA[c.tipo]}</span>}
              </span>
              <span className="text-right tabular-nums text-fg" title={totalCosto > 0 ? `${pct(c.costo / totalCosto)} del gasto` : undefined}>
                {c.porAproximacion > 0 && <span className="text-fg-muted" title="Parte se ubicó por su corrida o su reunión">≈ </span>}
                {usd(c.costo)}
              </span>
              <span className="text-right tabular-nums text-fg-secondary">{numero(c.llamadas)}</span>
              <span className="min-w-0 truncate text-xs text-fg-secondary" title={c.procesos.map((p) => `${nombreDelProceso(p.clave)}: ${usd(p.costo)}`).join(" · ")}>
                {c.procesos
                  .slice(0, 2)
                  .map((p) => nombreDelProceso(p.clave))
                  .join(" · ")}
                {c.procesos.length > 2 && <span className="text-fg-muted"> · y {c.procesos.length - 2} más</span>}
              </span>
              <BarraDeUso u={c.propuesto} />
            </div>
          ))}
          {resto.length > 0 && (
            <p className="border-t border-line px-4 py-2 text-xs text-fg-muted">
              Y {resto.length} {resto.length === 1 ? "empresa" : "empresas"} más, con {usd(resto.reduce((s, c) => s + c.costo, 0))} entre todas.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Procesos de IA ─────────────────────────────────────────────────────────────

const PROCESOS_EN_EL_GRAFICO = 5;

export function ProcesosDeIa({ datos }: { datos: DatosDeIa }) {
  if (datos.faltaLaTabla) return <SinTabla />;
  const { total, porProceso, semanas } = datos.resumen;
  if (total.llamadas === 0) {
    return <EmptyState title={`Sin IA en ${datos.dias} días`} description="Cuando un proceso de Nexus llame a Claude, se cuenta acá." />;
  }
  const corridasConError = Object.values(datos.corridasConError).reduce((s, n) => s + (n ?? 0), 0);
  const solo = total.costo - total.costoDePersonas;

  const arriba = porProceso.slice(0, PROCESOS_EN_EL_GRAFICO).map((p) => p.clave);
  const series: SerieSemanal[] = [
    ...arriba.map((clave) => ({ nombre: nombreDelProceso(clave), valores: semanas.map((s) => s.porProceso[clave] ?? 0) })),
  ];
  if (porProceso.length > PROCESOS_EN_EL_GRAFICO) {
    series.push({
      nombre: "Los demás",
      valores: semanas.map((s) =>
        Object.entries(s.porProceso)
          .filter(([k]) => !arriba.includes(k as ClaveDeProceso))
          .reduce((t, [, v]) => t + (v ?? 0), 0),
      ),
    });
  }

  const columnas = { gridTemplateColumns: "minmax(0, 1.6fr) 100px 64px 72px 72px 96px 72px 200px" };
  return (
    <div className="space-y-6">
      <AvisoDelTope datos={datos} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Cifra titulo="Gasto en IA" valor={usd(total.costo)} pie={`${numero(total.llamadas)} llamadas en ${datos.dias} días`} />
        <Cifra
          titulo="Lo pidió una persona"
          valor={usd(total.costoDePersonas)}
          pie={`y ${usd(solo)}${total.costo > 0 ? ` (${pct(solo / total.costo)})` : ""} corre solo, sin que nadie lo pida`}
        />
        <Cifra
          titulo="Con error"
          valor={`${numero(total.conError)} llamadas`}
          pie={corridasConError ? `${numero(corridasConError)} corridas terminaron en error` : "ninguna corrida terminó en error"}
          tono={total.llamadas >= UMBRALES.llamadasMinimas && total.conError / total.llamadas >= UMBRALES.parteConError ? "warn" : undefined}
        />
      </div>

      {semanas.length > 1 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-fg">Semana a semana</h2>
            <span className="text-xs text-fg-muted">Dólares por semana, por proceso. La última semana va en curso.</span>
          </div>
          <GastoPorSemana semanas={semanas.map((s) => s.lunes)} series={series} />
        </section>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-fg">Proceso por proceso</h2>
          <LeyendaDeUso />
        </div>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <div className="min-w-[980px]">
            <div className="grid gap-3 border-b border-line px-4 py-2 text-xs text-fg-muted" style={columnas}>
              <span>Proceso</span>
              <span className="text-right">Gasto</span>
              <span className="text-right">Parte</span>
              <span className="text-right">Llamadas</span>
              <span className="text-right">Corridas</span>
              <span className="text-right">Con error</span>
              <span className="text-right">Empresas</span>
              <span>Lo que propone</span>
            </div>
            {porProceso.map((p, i) => {
              const def = PROCESO_POR_CLAVE.get(p.clave);
              const propuesto: UsoDeLoQuePropone | undefined = datos.propuestoPorProceso[p.clave];
              const corridasMal = datos.corridasConError[p.clave] ?? 0;
              return (
                <div key={p.clave} className={cn("grid items-center gap-3 px-4 py-2.5 text-[13px]", i > 0 && "border-t border-line")} style={columnas}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-fg" title={def?.queHace}>
                      {def?.nombre ?? p.clave}
                    </span>
                    <span className="block truncate text-xs text-fg-muted" title={p.slugs.length ? p.slugs.join(", ") : def?.queHace}>
                      {p.clave === "otros" && p.slugs.length ? p.slugs.join(", ") : def?.disparo}
                    </span>
                  </span>
                  <span className="text-right tabular-nums text-fg">{usd(p.costo)}</span>
                  <span className="text-right tabular-nums text-fg-secondary">{total.costo > 0 ? pct(p.costo / total.costo) : "—"}</span>
                  <span className="text-right tabular-nums text-fg-secondary">{numero(p.llamadas)}</span>
                  <span className="text-right tabular-nums text-fg-secondary">{p.corridas ? numero(p.corridas) : "—"}</span>
                  <span className={cn("text-right tabular-nums", p.conError ? "text-warn-ink" : "text-fg-muted")}>
                    {p.conError ? numero(p.conError) : "—"}
                    {corridasMal > 0 && <span className="block text-[11px]">{corridasMal} {corridasMal === 1 ? "corrida" : "corridas"}</span>}
                  </span>
                  <span className="text-right tabular-nums text-fg-secondary">{p.clientes ? numero(p.clientes) : "—"}</span>
                  {def && def.propone.length > 0 ? (
                    <BarraDeUso u={propuesto ?? { nacieron: 0, usados: 0, desestimados: 0, vencidos: 0, pendientes: 0 }} />
                  ) : (
                    <span className="text-xs text-fg-muted">no deja nada para decidir</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <p className="text-xs text-fg-muted">
          {NOTA_DE_TARIFA} «Corre solo» es lo que nadie pidió: leer cada reunión, el vigía y el avance del cronograma que
          sigue a cada reunión, que no cuenta como uso de nadie aunque la lectura la haya pedido una persona. Una corrida
          cuenta si hizo al menos una llamada.
        </p>
      </section>
    </div>
  );
}

// ── Conclusiones ───────────────────────────────────────────────────────────────

const TEMAS: { tema: TemaDeConclusion; titulo: string }[] = [
  { tema: "equipo", titulo: "Los equipos" },
  { tema: "propuesta", titulo: "Lo que propone Nexus" },
  { tema: "proceso", titulo: "Los procesos de IA" },
  { tema: "datos", titulo: "Los datos" },
];

const TONO: Record<Conclusion["tono"], { texto: string; clase: string }> = {
  atencion: { texto: "Para mirar", clase: "border-warn-line bg-warn-surface text-warn-ink" },
  info: { texto: "Para saber", clase: "border-info-line bg-info-surface text-info-ink" },
  bien: { texto: "Va bien", clase: "border-success-line bg-success-surface text-success-ink" },
};

const NOMBRE_DE_LA_VISTA: Record<VistaDeUso, string> = {
  equipo: "Equipo",
  propuesto: "Para qué se usa",
  clientes: "IA por cliente",
  procesos: "Procesos de IA",
  conclusiones: "Conclusiones",
  reuniones: "Reuniones sin grabar",
};

export function ConclusionesDeUso({ conclusiones, dias }: { conclusiones: Conclusion[]; dias: DiasDeIa }) {
  const paraMirar = conclusiones.filter((c) => c.tono === "atencion").length;
  return (
    <div className="space-y-6">
      <p className="text-[13px] text-fg-secondary">
        Lo que dicen los números, leído con reglas fijas (sin IA): el uso del equipo en las últimas 4 semanas, y lo que
        propone Nexus y el gasto de IA en los últimos {dias} días.{" "}
        <span className="font-semibold text-fg">
          {paraMirar === 0 ? "Nada pide atención." : `${paraMirar} ${paraMirar === 1 ? "cosa pide" : "cosas piden"} atención.`}
        </span>{" "}
        <span className="text-fg-muted">Sirve para entender el uso, no para evaluar a nadie.</span>
      </p>

      {conclusiones.length === 0 && (
        <EmptyState title="Nada que concluir todavía" description="Con más uso medido y más propuestas cerradas, las reglas empiezan a decir algo." />
      )}

      {TEMAS.map(({ tema, titulo }) => {
        const deEste = conclusiones.filter((c) => c.tema === tema);
        if (!deEste.length) return null;
        return (
          <section key={tema} className="space-y-2">
            <h2 className="text-sm font-semibold text-fg">{titulo}</h2>
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {deEste.map((c) => (
                <li key={c.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-[13px]">
                  <span className={cn("mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium", TONO[c.tono].clase)}>{TONO[c.tono].texto}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-fg">{c.titulo}</span>
                    <span className="block text-fg-secondary">{c.detalle}</span>
                  </span>
                  {c.ver && (
                    <Link href={direccionDeUso(c.ver, dias)} className="shrink-0 text-xs text-brand transition-colors hover:text-brand-light">
                      Ver en «{NOMBRE_DE_LA_VISTA[c.ver]}» →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <details className="rounded-xl border border-line bg-surface px-4 py-3 text-xs text-fg-secondary">
        <summary className="cursor-pointer text-[13px] font-medium text-fg">Cómo se leen</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Un equipo entra poco si suma menos de {UMBRALES.diasPorSemanaPocoUso} día con uso por persona y por semana. Con menos de {UMBRALES.diasMedidosMinimos} días medidos no se dice nada.</li>
          <li>
            Una propuesta casi nunca se usa si de lo cerrado (usado, desestimado o vencido) se usó menos del {pct(UMBRALES.parteCasiNunca)}; se usa con {pct(UMBRALES.parteSeUsa)} o más. Hacen falta {UMBRALES.cerradasMinimas} cerradas.
          </li>
          <li>
            Un proceso cuesta mucho para lo que se usa si se lleva el {pct(UMBRALES.parteDelGastoAlta)} del gasto de IA o más y de lo que propone se usa menos del {pct(UMBRALES.parteUsadaBaja)}.
          </li>
          <li>Un proceso falla seguido si el {pct(UMBRALES.parteConError)} de sus llamadas o más terminan con error, desde {UMBRALES.llamadasMinimas} llamadas.</li>
        </ul>
      </details>
    </div>
  );
}
