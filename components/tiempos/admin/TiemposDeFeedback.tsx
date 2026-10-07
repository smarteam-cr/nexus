"use client";

/**
 * Feedback › Encuestas › Automáticas (2026-10-05) — las preguntas que se hacen solas cuando alguien termina algo:
 * «¿cuánto te tomó?».
 *
 * Arriba, una tarjeta por momento con su interruptor, cómo le aparece a la persona y a quién le llega; debajo, lo que
 * dicen las respuestas: por tipo de fase, cuántas hay de las 20 que hacen falta para calibrar, lo que anotaron, lo que
 * supone la carga y qué pasa con eso. Nunca por persona: sirve para calibrar la carga, no para evaluar a nadie.
 *
 * Hasta el 2026-10-06 era la pestaña «Tiempos». Desde «Feedback · Encuestas (v2)» es la segunda clase de encuestas,
 * al lado de las preguntas que escribe dirección (components/feedback/admin/EncuestasDeFeedback.tsx), que también
 * pone el panel. Los documentos publicados se miden en el CSV: la carga todavía no tiene un supuesto por documento.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Interruptor } from "@/components/ui/Interruptor";
import { Segmentado } from "@/components/ui/Segmentado";
import { BOTON_DE_HERRAMIENTA, BotonBlanco, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { fetchJson } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
import { META_PARA_CALIBRAR, MINIMO_PARA_MEDIANA, formatoMinutos, type CalibracionDeTipo, type Momento } from "@/lib/tiempos/reglas";
import type { DatosDeTiempos, FilaDeEncuesta, PeriodoDeTiempos } from "@/lib/tiempos/tipos";
import AjustarPregunta from "./AjustarPregunta";

const CABECERA = "text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted";

/** Lo que dice cada tarjeta: cuándo sale, cómo se llama y qué ve la persona. */
const TARJETA: Record<Momento, { cuando: string; titulo: (e: FilaDeEncuesta) => string; vista: string }> = {
  TAREA_HECHA: { cuando: "Al marcar una tarea como hecha", titulo: (e) => e.config.pregunta, vista: "La tarea que marcó, con su cliente y su fase" },
  DOCUMENTO_PUBLICADO: { cuando: "Al publicar un documento", titulo: (e) => e.config.pregunta, vista: "El documento que publicó, la primera vez" },
  CIERRE_SEMANA: { cuando: "Los viernes", titulo: () => "Tu semana", vista: "Cuánto de la semana fue con clientes, por proyecto" },
};

function tasaEnTexto(e: FilaDeEncuesta): { linea: string; detalle: string } {
  if (!e.disponible) return { linea: "Sin pantalla todavía", detalle: "" };
  const t = e.tasa;
  if (e.preguntas === 0) return { linea: e.activa ? "Sin respuestas todavía" : "Pausada: nadie la recibe", detalle: "" };
  const partes = [
    t.noLoHice > 0 ? `${t.noLoHice} «No lo hice yo»` : null,
    t.omitidas > 0 ? `${t.omitidas} omitidas` : null,
    t.vencidas > 0 ? `${t.vencidas} vencidas` : null,
    t.esperando > 0 ? `${t.esperando} esperando` : null,
  ].filter(Boolean);
  return {
    linea: t.porcentaje === null ? `${t.esperando} esperando respuesta` : `${t.respondidas} de ${t.cerradas} contestadas · ${t.porcentaje} %`,
    detalle: partes.join(" · "),
  };
}

/** Cuánto se aleja lo anotado de lo que supone la carga: «+40 min», «−15 min», «igual». */
function diferencia(mediana: number, supuesto: number): string {
  const d = Math.round(mediana - supuesto);
  if (d === 0) return "igual";
  return `${d > 0 ? "+" : "−"}${formatoMinutos(Math.abs(d))}`;
}

/** Qué pasa con un tipo de fase: ¿la carga ya usa lo anotado? */
function quePasa(c: CalibracionDeTipo): { texto: string; listo: boolean } {
  if (c.calibra) return { texto: "La carga ya usa lo anotado", listo: true };
  const faltan = META_PARA_CALIBRAR - c.respuestas;
  const base = `Usa el supuesto: ${faltan === 1 ? "falta 1 respuesta" : `faltan ${faltan} respuestas`}`;
  if (c.mediana === null) return { texto: base, listo: false };
  const d = diferencia(c.mediana, c.supuesto);
  return { texto: `${base} · ${d === "igual" ? "lo anotado coincide" : `lo anotado va ${d}`}`, listo: false };
}

/** Lo que conviene saber antes de prenderlas (o, prendidas, cómo se usan): va en el panel de Encuestas. */
export function AntesDeActivarlas({ hayActivas }: { hayActivas: boolean }) {
  return (
    <div className="space-y-2">
      <p className={ROTULO_DEL_SISTEMA}>{hayActivas ? "Cómo se usan" : "Antes de activarlas"}</p>
      <ul className="list-disc space-y-1.5 pl-[18px] text-[13px] leading-[1.45] text-fg-secondary">
        {hayActivas ? (
          <li>Calibran las horas de la carga por tipo de fase. Nunca se muestran por persona.</li>
        ) : (
          <li>Cuéntale al equipo qué va a ver y para qué: es para calibrar la carga, no para evaluar a nadie.</li>
        )}
        <li>«Omitir» y «No lo hice yo» quedan anotados y no cuentan en contra de nadie.</li>
        <li>Lo que no se contesta queda tres días en «Para ti» y después vence.</li>
        <li>No se pregunta por una tarea marcada dos semanas tarde: nadie se acuerda.</li>
      </ul>
    </div>
  );
}

export default function TiemposDeFeedback({ datos }: { datos: DatosDeTiempos }) {
  const router = useRouter();
  const toast = useToast();
  const [ajustando, setAjustando] = useState<FilaDeEncuesta | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);

  const alternar = async (e: FilaDeEncuesta) => {
    setCambiando(e.momento);
    try {
      await fetchJson(`/api/tiempos/encuestas/${e.momento}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activa: !e.activa }),
      });
      toast.success(e.activa ? "Pausada: no se hacen más preguntas." : "Activa: la próxima vez que pase, se pregunta.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cambiar.");
    } finally {
      setCambiando(null);
    }
  };

  const irAPeriodo = (p: PeriodoDeTiempos) =>
    router.push(p === "todo" ? "/feedback?vista=encuestas&clase=automaticas" : `/feedback?vista=encuestas&clase=automaticas&periodo=${p}`);

  return (
    <div className="space-y-6">
      <p className="max-w-[760px] text-[13px] leading-[1.45] text-fg-secondary">
        Se hacen solas cuando alguien termina algo, siempre la misma: <b className="font-semibold text-fg">«¿cuánto te tomó?»</b>. Con las respuestas, la
        carga de Customer Success deja de usar horas supuestas y pasa a usar lo que de verdad toma cada tipo de tarea. Nunca se muestran por persona.
      </p>

      <div data-recorrido="feedback.encuestas.automaticas" className="grid gap-3 lg:grid-cols-3">
        {datos.encuestas.map((e) => {
          const t = tasaEnTexto(e);
          const tarjeta = TARJETA[e.momento];
          return (
            <article
              key={e.momento}
              className={cn("flex flex-col gap-3 rounded-xl border border-line px-4 py-3.5", e.disponible ? "bg-surface" : "bg-surface-muted")}
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0 space-y-0.5">
                  <p className={ROTULO_DEL_SISTEMA}>{tarjeta.cuando}</p>
                  <h3 className="text-[15px] font-semibold leading-5 text-fg">{tarjeta.titulo(e)}</h3>
                </div>
                <Interruptor
                  activo={e.activa}
                  onCambio={() => void alternar(e)}
                  etiqueta={e.nombre}
                  texto={e.disponible ? (e.activa ? "Activa" : "Pausada") : "Todavía no"}
                  deshabilitado={!e.disponible || cambiando === e.momento}
                  title={e.disponible ? undefined : (e.motivoNoDisponible ?? undefined)}
                />
              </div>

              <div className="space-y-1.5 rounded-[10px] border border-line bg-surface-muted px-3 py-2.5">
                <p className={cn(ROTULO_DEL_SISTEMA, "text-[10px]")}>Así le aparece</p>
                <p className="text-xs text-fg-secondary">{tarjeta.vista}</p>
                {e.disponible && (
                  <p className="flex flex-wrap gap-1">
                    {[...e.config.opciones.map((o) => o.texto), "Otro…"].map((o) => (
                      <span key={o} className="rounded-full border border-line bg-surface px-2 text-[11px] leading-[18px] text-fg-secondary">
                        {o}
                      </span>
                    ))}
                  </p>
                )}
              </div>

              <p className="text-xs text-fg-muted">{e.disponible ? e.resumen : (e.motivoNoDisponible ?? e.cuando)}</p>

              <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2.5">
                <div className="min-w-0">
                  <p className="text-xs tabular-nums text-fg-secondary">{t.linea}</p>
                  {t.detalle && <p className="text-[11px] text-fg-muted">{t.detalle}</p>}
                </div>
                {e.disponible && <BotonBlanco onClick={() => setAjustando(e)}>Ajustar</BotonBlanco>}
              </div>
            </article>
          );
        })}
      </div>

      <section aria-label="Lo que dicen las respuestas" data-recorrido="feedback.encuestas.respuestas" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-fg">Lo que dicen las respuestas</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Segmentado<PeriodoDeTiempos>
              etiqueta="Período"
              valor={datos.periodo}
              onCambio={irAPeriodo}
              opciones={[
                { clave: "30", etiqueta: "30 días" },
                { clave: "56", etiqueta: "8 semanas" },
                { clave: "todo", etiqueta: "Desde el inicio" },
              ]}
            />
            <a href={`/api/tiempos/exportar?periodo=${datos.periodo}`} className={BOTON_DE_HERRAMIENTA} download>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
              </svg>
              Exportar CSV
            </a>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-surface-muted">
                <th className={cn(CABECERA, "px-4 py-2.5")}>Tarea de una fase de</th>
                <th className={cn(CABECERA, "w-[220px] px-3 py-2.5")}>Respuestas</th>
                <th className={cn(CABECERA, "px-3 py-2.5 text-right")} title="La mediana de lo que anotaron">
                  Lo que anotaron
                </th>
                <th className={cn(CABECERA, "px-3 py-2.5 text-right")}>La carga supone</th>
                <th className={cn(CABECERA, "px-4 py-2.5")}>Qué pasa</th>
              </tr>
            </thead>
            <tbody>
              {datos.calibracion.map((c) => {
                const pct = Math.min(100, Math.round((c.respuestas / META_PARA_CALIBRAR) * 100));
                const q = quePasa(c);
                return (
                  <tr key={c.tipo} className="border-t border-line first:border-t-0 hover:bg-surface-muted">
                    <td className="px-4 py-2.5 font-semibold text-fg">{c.nombre}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover" aria-hidden>
                          <span className={cn("block h-full rounded-full", c.calibra ? "bg-success" : "bg-fg-muted")} style={{ width: `${pct}%` }} />
                        </span>
                        <span className="min-w-[48px] text-right tabular-nums text-fg-secondary">
                          {c.respuestas} de {META_PARA_CALIBRAR}
                        </span>
                      </span>
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", c.mediana === null ? "text-fg-muted" : "font-semibold text-fg")}>
                      {c.mediana === null ? "—" : formatoMinutos(c.mediana)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-fg-secondary">{formatoMinutos(c.supuesto)}</td>
                    <td className={cn("px-4 py-2.5 text-xs", q.listo ? "font-semibold text-success-ink" : "text-fg-muted")}>{q.texto}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-fg-muted">
          Con {META_PARA_CALIBRAR} respuestas de un tipo, la carga usa lo anotado en vez del supuesto. Con menos de {MINIMO_PARA_MEDIANA} no se muestra lo
          anotado: un número suelto engaña. Los documentos publicados se miden aparte, en el CSV.
        </p>
      </section>

      {ajustando && (
        <AjustarPregunta
          encuesta={ajustando}
          datos={datos}
          onCerrar={() => setAjustando(null)}
          onGuardada={() => {
            setAjustando(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
