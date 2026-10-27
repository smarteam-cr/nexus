"use client";

/**
 * PasoAnalisis — la pieza «Análisis» del prospecto, en la preventa (S5, 2026-10-27; antes «el analizador por cliente»,
 * docs/analizador-reuniones-venta-plan.md › «El rediseño de Elías (2026-10-26)»). Va en la lista junto a Exploración, La
 * escala, Casos de uso y Propuesta, y la ve quien entra a la preventa (abierto el 2026-10-28).
 *
 * Arriba, la lectura de conjunto (lib/analizador-venta/conjunto.ts, sin IA): cómo se ha trabajado a este prospecto y qué
 * falta diagnosticar antes de proponer, cruzado con el mapa de la escala de la preventa. Debajo, todas las reuniones de
 * venta con la empresa, una debajo de la otra (las de exploración y también las de propuesta): cómo se trabajó cada una,
 * quién habló, qué se exploró y qué quedó sin explorar, el siguiente paso y si tuvo continuidad. Cada una abre su sesión
 * en Exploración › Análisis, donde está «Cómo trabajaste esta sesión» (S4).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Button, EmptyState, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { lecturaDeConjunto, type DimensionEnJuego } from "@/lib/analizador-venta/conjunto";
import { continuidadDelSiguientePaso, loDeLaSesion } from "@/lib/analizador-venta/revision";
import type { ReunionDeVentaVista } from "@/lib/analizador-venta/reuniones-de-venta-server";
import { nombreDeLaPestana, tituloDeLaSesion, type PestanaDeSesion } from "@/lib/exploraciones/guia";
import { useLienzo } from "@/components/exploraciones/contexto";
import { useSesiones } from "@/components/exploraciones/useSesiones";
import { BarraDeQuienHablo, ChipDelValor, fechaDelAnalisis, textoDeLaContinuidad } from "./piezas";
import { useAnalisisDeLaVenta } from "./useAnalisisDeLaVenta";

const TEXTO: Record<ReunionDeVentaVista["texto"], { texto: string; clase: string }> = {
  transcripcion: { texto: "Con transcripción", clase: "bg-success-surface text-success-ink" },
  solo_notas: { texto: "Solo notas", clase: "bg-surface-muted text-fg-secondary" },
  nada: { texto: "Sin texto", clase: "bg-warn-surface text-warn-ink" },
};

function Cifra({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="min-w-0">
      <p className="text-lg font-semibold tabular-nums text-fg">{valor}</p>
      <p className="text-xs text-fg-muted">{rotulo}</p>
    </div>
  );
}

export default function PasoAnalisis() {
  const { exp, escala, mapa, propuestas, puedeEditar, veAnalisisDeVenta, veTendenciaDelEquipo, irA, sesion } = useLienzo();
  const { todas } = useSesiones();
  const { datos, error, analizar } = useAnalisisDeLaVenta(exp.id, !!veAnalisisDeVenta);

  const toast = useToast();
  const [analizando, setAnalizando] = useState<string | null>(null);

  const enJuego = useMemo<DimensionEnJuego[]>(
    () =>
      escala.areas
        .filter((a) => exp.estado.areas.includes(a.id))
        .flatMap((a) =>
          a.dimensiones
            .filter((d) => d.aplica)
            .map((d) => {
              const p = mapa.posiciones[d.id];
              return { nombre: d.nombre, area: a.nombre, diagnosticada: p?.origen === "confirmado" && p.clase === "evidencia" };
            }),
        ),
    [escala, exp.estado.areas, mapa.posiciones],
  );
  const reuniones = useMemo(() => datos?.reuniones ?? [], [datos]);
  const conjunto = useMemo(
    () =>
      lecturaDeConjunto(
        reuniones.map((r) => ({ conTranscripcion: r.texto === "transcripcion", quienHablo: r.quienHablo ?? null, resultado: r.detalle?.resultado ?? null, confirmado: !!r.detalle?.confirmado })),
        enJuego,
      ),
    [reuniones, enJuego],
  );

  if (!veAnalisisDeVenta) return null;
  if (!datos && error) return <Alert variant="danger">{error}</Alert>;
  // Sin datos y sin error es que la lectura todavía no vuelve (o no empezó): nunca «no hay reuniones» antes de saberlo.
  if (!datos) return <p className="text-sm text-fg-muted">Leyendo las reuniones de venta…</p>;
  if (!reuniones.length) {
    return <EmptyState title="Todavía no hay reuniones de venta con esta empresa" description="Cuando ocurra la primera sesión con transcripción, aquí ves cómo se trabajó." />;
  }

  // La sesión de la preventa de cada reunión, y si ya había una propuesta armada: así se ven las de propuesta.
  const pestanaDe = (id: string) => todas.find((p) => p.reunion?.origen === "meet" && p.reunion.id === id) ?? null;
  const primeraPropuesta = propuestas.map((p) => p.creadaEn).sort()[0] ?? null;
  const abrir = (p: PestanaDeSesion) => {
    irA("exploracion");
    sesion.elegir(p.clave);
    sesion.ponerMomento(p.clave, "despues");
  };
  const analizarLa = async (id: string) => {
    setAnalizando(id);
    try {
      const x = await analizar(id);
      toast.success(`Listo: ${x.juicios} juicios con su cita.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo analizar la reunión.");
    } finally {
      setAnalizando(null);
    }
  };

  return (
    <div className="space-y-6">
      <section aria-label="Cómo se ha trabajado a este prospecto" className="space-y-4 rounded-xl border border-line bg-surface px-[18px] py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-[15px] font-semibold text-fg">Cómo se ha trabajado a este prospecto</h3>
        </div>
        <p className="text-[13.5px] leading-[20px] text-fg">{conjunto.frase}</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Cifra valor={String(conjunto.reuniones)} rotulo={conjunto.reuniones === 1 ? "reunión de venta" : "reuniones de venta"} />
          <Cifra valor={`${conjunto.conTranscripcion} de ${conjunto.reuniones}`} rotulo="con transcripción" />
          <Cifra valor={`${conjunto.analizadas}`} rotulo={`analizadas · ${conjunto.confirmadas} confirmadas`} />
          <Cifra valor={conjunto.clienteHablo === null ? "—" : `${conjunto.clienteHablo} %`} rotulo="habló el cliente, en promedio" />
        </div>
        <div className="space-y-2 rounded-lg bg-surface-muted p-3.5">
          <p className="text-xs font-semibold text-fg-secondary">Qué falta diagnosticar antes de proponer</p>
          {!enJuego.length ? (
            <p className="text-[13px] text-fg-muted">La preventa todavía no tiene áreas en juego: elígelas en La escala para saber qué falta.</p>
          ) : !conjunto.falta.sinTocar.length && !conjunto.falta.soloTocadas.length ? (
            <p className="text-[13px] text-fg">Las dimensiones de las áreas en juego ya se exploraron o están confirmadas con evidencia.</p>
          ) : (
            <>
              {conjunto.falta.sinTocar.length > 0 && (
                <p className="text-[13px] leading-[19px] text-fg">
                  <span className="font-semibold text-warn-ink">Sin tocar en ninguna sesión:</span> {conjunto.falta.sinTocar.map((d) => d.nombre).join(", ")}.
                </p>
              )}
              {conjunto.falta.soloTocadas.length > 0 && (
                <p className="text-[13px] leading-[19px] text-fg">
                  <span className="font-semibold">Se tocaron sin profundizar:</span> {conjunto.falta.soloTocadas.map((d) => d.nombre).join(", ")}.
                </p>
              )}
            </>
          )}
          {conjunto.falta.etapas.length > 0 && (
            <p className="text-[13px] leading-[19px] text-fg">
              <span className="font-semibold">Del proceso consultivo, no se hizo en ninguna sesión:</span> {conjunto.falta.etapas.map((e) => e.nombre.toLowerCase()).join(", ")}.
            </p>
          )}
          <p className="text-xs text-fg-muted">
            Cuenta lo que exploraron las sesiones analizadas y lo que la escala ya tiene confirmado con evidencia. Lo de cada sesión es una propuesta de Nexus hasta que alguien
            la confirma.
          </p>
        </div>
      </section>

      <section aria-label="Las reuniones, una por una" className="space-y-3">
        <h3 className="text-sm font-semibold text-fg">Sesión por sesión</h3>
        <ol className="space-y-3">
          {reuniones.map((r) => {
            const p = pestanaDe(r.id);
            const deLaPropuesta = !!primeraPropuesta && r.fecha >= primeraPropuesta;
            const lo = r.detalle?.resultado ? loDeLaSesion(r.detalle.resultado) : null;
            const t = TEXTO[r.texto];
            const continuidad = lo ? textoDeLaContinuidad(continuidadDelSiguientePaso({ siguientePaso: lo.siguientePaso, fecha: r.fecha, despues: reuniones.map((x) => x.fecha), ahora: new Date() })) : null;
            return (
              <li key={r.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-[18px] py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                      {[p && !p.noSeHizo ? nombreDeLaPestana(p) : "Reunión de venta", deLaPropuesta ? "de propuesta" : "de exploración"].join(" · ")}
                    </p>
                    <p className="truncate text-sm font-semibold text-fg">{(p && tituloDeLaSesion(p)) || r.titulo}</p>
                    <p className="text-xs text-fg-muted">
                      {fechaDelAnalisis(r.fecha)}
                      {r.vendedores.length ? ` · ${r.vendedores.join(", ")}` : ""}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", t.clase)}>{t.texto}</span>
                  {r.detalle?.confirmado ? (
                    <span className="rounded-full bg-success-surface px-2.5 py-0.5 text-[11px] font-semibold text-success-ink">Confirmado</span>
                  ) : r.detalle?.resultado ? (
                    <span className="rounded-full bg-info-surface px-2.5 py-0.5 text-[11px] font-semibold text-brand">Propuesta</span>
                  ) : null}
                </header>
                <div className="grid gap-4 px-[18px] py-3.5 md:grid-cols-2">
                  <div className="min-w-0 space-y-2">
                    {lo ? (
                      <>
                        <div className="flex flex-wrap gap-1.5">
                          <ChipDelValor j={lo.consultiva} />
                          <ChipDelValor j={lo.posicion} />
                        </div>
                        <p className="text-[13px] leading-[19px] text-fg">{lo.resumen}</p>
                      </>
                    ) : r.detalle?.estado === "ERROR" ? (
                      <p className="text-[13px] text-warn-ink">El análisis falló: {r.detalle.error ?? "sin detalle"}.</p>
                    ) : r.texto === "transcripcion" ? (
                      <p className="text-[13px] text-fg-muted">Sin analizar todavía.</p>
                    ) : (
                      <p className="text-[13px] text-fg-muted">{r.motivo ?? "Sin transcripción: no se puede analizar."}</p>
                    )}
                    {r.quienHablo && <BarraDeQuienHablo q={r.quienHablo} />}
                  </div>
                  <div className="min-w-0 space-y-2 text-[13px] leading-[19px]">
                    {lo && (
                      <>
                        {lo.exploradas.length > 0 && (
                          <p className="text-fg">
                            <span className="font-semibold">Se exploró:</span> {lo.exploradas.join(", ")}.
                          </p>
                        )}
                        {(lo.tocadas.length > 0 || lo.sinExplorar.length > 0) && (
                          <p className="text-fg">
                            <span className="font-semibold text-warn-ink">Quedó sin explorar:</span> {[...lo.sinExplorar.map((x) => x.dimension), ...lo.tocadas.map((x) => `${x.dimension} (solo se tocó)`)].join(", ")}.
                          </p>
                        )}
                        <p className="text-fg">
                          <span className="font-semibold">Siguiente paso:</span> {lo.siguientePaso?.lectura ?? "el análisis no lo juzgó."}
                        </p>
                        {continuidad && <p className={cn("text-xs", continuidad.aviso ? "text-warn-ink" : "text-fg-muted")}>{continuidad.texto}</p>}
                      </>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {p && (
                        <Button size="sm" variant="secondary" onClick={() => abrir(p)}>
                          Abrir la sesión
                        </Button>
                      )}
                      {puedeEditar && r.texto === "transcripcion" && !r.detalle?.resultado && (
                        <Button size="sm" variant={p ? "ghost" : "secondary"} loading={analizando === r.id} disabled={!!analizando} onClick={() => void analizarLa(r.id)}>
                          Analizar
                        </Button>
                      )}
                      {!p && <span className="text-xs text-fg-muted">No es una sesión de Exploración: confírmala desde la sesión cuando la sumes.</span>}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {veTendenciaDelEquipo && (
        <p className="text-xs text-fg-muted">
          El criterio con que se analiza cada sesión y la tendencia de cada vendedor:{" "}
          <Link href="/sales/analisis" className="font-semibold text-brand hover:text-brand-dark">
            Análisis de la venta
          </Link>
          .
        </p>
      )}
    </div>
  );
}
