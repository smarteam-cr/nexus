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
 *
 * Desde el 2026-10-07 («Rentabilidad · diseño», tablero Encuestas) arriba va la ENCUESTA DE ARRANQUE: se manda una vez y
 * da un primer número por tarea clave; y abajo, las 12 tareas clave con lo que hay en los cronogramas y lo que dijo el
 * equipo. Nada de esto entra solo a la carga: lo propone «Ajustar el cálculo» y lo confirma la CSL o dirección.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Interruptor } from "@/components/ui/Interruptor";
import { Segmentado } from "@/components/ui/Segmentado";
import { BOTON_DE_HERRAMIENTA, BotonAzul, BotonBlanco, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { fetchJson } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
import { FAMILIAS_POR_NOMBRE } from "@/lib/tiempos/familias";
import {
  DIAS_PARA_EL_ARRANQUE,
  META_DE_TAREA_CLAVE,
  META_PARA_CALIBRAR,
  MINIMO_DEL_ARRANQUE,
  MINIMO_PARA_MEDIANA,
  NO_LA_HAGO,
  formatoMinutos,
  leerConfig,
  type CalibracionDeTipo,
  type Momento,
} from "@/lib/tiempos/reglas";
import type { DatosDeTiempos, EstadoDelArranque, FilaDeEncuesta, FilaDeFamilia, PeriodoDeTiempos } from "@/lib/tiempos/tipos";
import AjustarPregunta from "./AjustarPregunta";

const CABECERA = "text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted";

/** Lo que dice cada tarjeta: cuándo sale, cómo se llama y qué ve la persona. */
const TARJETA: Record<Momento, { cuando: string; titulo: (e: FilaDeEncuesta) => string; vista: string }> = {
  TAREA_HECHA: { cuando: "Al marcar una tarea como hecha", titulo: (e) => e.config.pregunta, vista: "La tarea que marcó, con su cliente y su fase" },
  DOCUMENTO_PUBLICADO: { cuando: "Al publicar o presentar un documento", titulo: (e) => e.config.pregunta, vista: "El documento que publicó o presentó, la primera vez" },
  CIERRE_SEMANA: { cuando: "Los viernes", titulo: () => "Tu semana", vista: "Cuánto de la semana fue con clientes, por proyecto" },
  ARRANQUE: { cuando: "Se manda una vez", titulo: () => "Encuesta de arranque", vista: "Cuánto le toma normalmente cada tarea clave" },
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 6 * 60 * 60 * 1000);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
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

/** Qué pasa con un tipo de fase: ¿ya hay respuestas para proponer un número nuevo? */
function quePasa(c: CalibracionDeTipo): { texto: string; listo: boolean } {
  const comparado = c.mediana !== null && c.estimadoMediana !== null ? diferencia(c.mediana, c.estimadoMediana) : null;
  const vs = comparado === null ? "" : comparado === "igual" ? " · lo anotado coincide" : ` · lo anotado va ${comparado}`;
  if (c.calibra) return { texto: `Ya alcanza: lo propone «Ajustar el cálculo»${vs}`, listo: true };
  const faltan = META_PARA_CALIBRAR - c.respuestas;
  return { texto: `${faltan === 1 ? "Falta 1 respuesta" : `Faltan ${faltan} respuestas`}${vs}`, listo: false };
}

/** Lo que conviene saber antes de prenderlas (o, prendidas, cómo se usan): va en el panel de Encuestas. */
export function AntesDeActivarlas({ hayActivas }: { hayActivas: boolean }) {
  return (
    <div className="space-y-2">
      <p className={ROTULO_DEL_SISTEMA}>{hayActivas ? "Cómo se usan" : "Antes de activarlas"}</p>
      <ul className="list-disc space-y-1.5 pl-[18px] text-[13px] leading-[1.45] text-fg-secondary">
        {hayActivas ? (
          <li>Calibran las horas de la carga por tipo de fase y por tarea clave. Nunca se muestran por persona.</li>
        ) : (
          <li>Cuéntale al equipo qué va a ver y para qué: es para calibrar la carga, no para evaluar a nadie.</li>
        )}
        <li>Nada entra solo a la carga: lo propone «Ajustar el cálculo» y lo confirma la CSL o dirección.</li>
        <li>Las tareas clave se preguntan siempre; las demás, todas hasta tener {META_PARA_CALIBRAR} por tipo y después 1 de cada 3.</li>
        <li>«No lo hice yo» pregunta quién la hizo y le pasa la pregunta a esa persona. «Omitir» no cuenta en contra de nadie.</li>
        <li>Lo que no se contesta queda tres días en «Para ti» y después vence. No se pregunta por una tarea marcada dos semanas tarde.</li>
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
        Se hacen solas cuando alguien termina algo, siempre la misma: <b className="font-semibold text-fg">«¿cuánto te tomó?»</b>. Con las respuestas, Nexus
        propone en «Ajustar el cálculo» las horas que de verdad toma cada tipo de tarea, y la CSL o dirección las confirma. Nunca se muestran por persona.
      </p>

      <EncuestaDeArranque arranque={datos.arranque} />

      <div data-recorrido="feedback.encuestas.automaticas" className="grid gap-3 lg:grid-cols-3">
        {datos.encuestas.filter((e) => e.momento !== "ARRANQUE").map((e) => {
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

      <TareasClave familias={datos.familias} />

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
                <th className={cn(CABECERA, "px-3 py-2.5 text-right")} title="La mediana de lo que suponía la carga para esas mismas tareas, con la parte de Smarteam y el factor de la cuenta">
                  La carga suponía
                </th>
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
                    <td className="px-3 py-2.5 text-right tabular-nums text-fg-secondary" title={`Sin el factor de la cuenta: ${formatoMinutos(c.supuesto)} por tarea`}>
                      {c.estimadoMediana === null ? <span className="text-fg-muted">{formatoMinutos(c.supuesto)} base</span> : formatoMinutos(c.estimadoMediana)}
                    </td>
                    <td className={cn("px-4 py-2.5 text-xs", q.listo ? "font-semibold text-success-ink" : "text-fg-muted")}>{q.texto}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-fg-muted">
          Con {META_PARA_CALIBRAR} respuestas de un tipo, «Ajustar el cálculo» propone un número nuevo comparando cada respuesta con lo que suponía la carga para
          esa misma tarea. Con menos de {MINIMO_PARA_MEDIANA} no se muestra lo anotado: un número suelto engaña. Los documentos publicados se miden aparte, en el
          CSV.
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

/** La encuesta de arranque: se manda una vez y da un primer número por tarea clave en una semana. */
function EncuestaDeArranque({ arranque }: { arranque: EstadoDelArranque }) {
  const router = useRouter();
  const toast = useToast();
  const [mandando, setMandando] = useState(false);
  const config = leerConfig(null, "ARRANQUE");
  const ejemplos = FAMILIAS_POR_NOMBRE.filter((f) => ["integracion", "pipeline", "migracion"].includes(f.clave));

  const mandar = async () => {
    setMandando(true);
    try {
      const r = await fetchJson<{ personas: number; preguntas: number }>("/api/tiempos/arranque", { method: "POST" });
      toast.success(
        r.personas === 0
          ? "Ya la tenían todas las personas a las que le llega."
          : `Mandada a ${r.personas} ${r.personas === 1 ? "persona" : "personas"}: le llega a «Para ti».`,
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo mandar.");
    } finally {
      setMandando(false);
    }
  };

  const mandada = arranque.mandadaEl !== null;
  return (
    <section aria-label="Encuesta de arranque" data-recorrido="feedback.encuestas.arranque" className="grid gap-4 rounded-xl border border-line bg-surface px-5 py-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-3">
        <div className="space-y-1">
          <p className={ROTULO_DEL_SISTEMA}>{mandada ? `Mandada el ${fecha(arranque.mandadaEl!)}` : "Nueva · se manda una vez"}</p>
          <h3 className="text-[15px] font-semibold leading-5 text-fg">Encuesta de arranque</h3>
          <p className="max-w-[640px] text-[13px] leading-[1.45] text-fg-secondary">
            A cada persona de {arranque.aQuien}: cuánto le toma normalmente cada tarea clave. Son {FAMILIAS_POR_NOMBRE.length} preguntas de un clic, unos 3
            minutos. Le llega a «Para ti» y vence en {DIAS_PARA_EL_ARRANQUE} días.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {mandada ? (
            <>
              <p className="text-xs tabular-nums text-fg-secondary">
                A {arranque.personas} {arranque.personas === 1 ? "persona" : "personas"} · {arranque.completas} {arranque.completas === 1 ? "completa" : "completas"} ·{" "}
                {arranque.aMedias} a medias · {arranque.sinEmpezar} sin empezar
                {arranque.vencidas > 0 ? ` · ${arranque.vencidas} ${arranque.vencidas === 1 ? "pregunta vencida" : "preguntas vencidas"}` : ""}
              </p>
              <BotonBlanco onClick={() => void mandar()} disabled={mandando} title="Solo le llega a quien todavía no la tenía">
                {mandando ? "Mandando…" : "Mandar a quien falte"}
              </BotonBlanco>
            </>
          ) : (
            <BotonAzul onClick={() => void mandar()} disabled={mandando}>
              {mandando ? "Mandando…" : "Mandar la encuesta de arranque"}
            </BotonAzul>
          )}
        </div>
        <div className="space-y-1.5 rounded-[10px] border border-line bg-surface-muted px-3 py-2.5">
          <p className={cn(ROTULO_DEL_SISTEMA, "text-[10px]")}>Así la ve cada persona</p>
          <p className="text-xs font-semibold text-fg">{config.pregunta}</p>
          <p className="text-xs text-fg-muted">Piensa en una cuenta típica, de principio a fin. Si no la haces, dilo.</p>
          <ul className="space-y-1.5 pt-1">
            {ejemplos.map((f) => (
              <li key={f.clave} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="w-[200px] text-xs text-fg-secondary">{f.enLaPregunta}</span>
                {[...config.opciones.map((o) => o.texto), NO_LA_HAGO].map((o) => (
                  <span key={o} className="rounded-full border border-line bg-surface px-2 text-[11px] leading-[18px] text-fg-secondary">
                    {o}
                  </span>
                ))}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-fg-muted">Y {FAMILIAS_POR_NOMBRE.length - ejemplos.length} tareas más. Lo que suponía la carga se ve recién al contestar.</p>
        </div>
      </div>
      <div className="space-y-2 text-[13px] leading-[1.45] text-fg-secondary">
        <p className={ROTULO_DEL_SISTEMA}>Por qué hace falta</p>
        <p>
          Una tarea clave se termina pocas veces al mes en toda la cartera. Si solo se pregunta al terminarla, juntar suficientes respuestas lleva más de un
          año.
        </p>
        <p>
          El arranque da un primer número por tarea en una semana: la mediana de lo que dice cada persona, desde {MINIMO_DEL_ARRANQUE} respuestas. Ninguna
          pantalla dice quién contestó qué.
        </p>
        <p>Ese número no entra solo a la carga: aparece en «Ajustar el cálculo» y la CSL o dirección lo confirman.</p>
      </div>
    </section>
  );
}

/** Las 12 tareas clave: cuántas hay en los cronogramas y qué dijo el equipo, en el arranque y al terminarlas. */
function TareasClave({ familias }: { familias: FilaDeFamilia[] }) {
  const total = familias.reduce((n, f) => n + f.tareas, 0);
  const hechas = familias.reduce((n, f) => n + f.hechas, 0);
  const respuesta = (r: { respuestas: number; mediana: number | null }) =>
    r.respuestas === 0 ? "—" : r.mediana === null ? `${r.respuestas} (pocas)` : `${formatoMinutos(r.mediana)} · ${r.respuestas}`;
  return (
    <section aria-label="Las tareas clave" data-recorrido="feedback.encuestas.tareas-clave" className="space-y-2">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold text-fg">Las {familias.length} tareas clave</h2>
        <p className="text-xs text-fg-muted">
          Se reconocen por el título de la tarea. Cuentan las tareas de Smarteam o compartidas de todos los cronogramas, sin las sesiones.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[900px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-line bg-surface-muted">
              <th className={cn(CABECERA, "px-4 py-2.5")}>Tarea clave</th>
              <th className={cn(CABECERA, "px-3 py-2.5")}>Se reconoce por</th>
              <th className={cn(CABECERA, "px-3 py-2.5 text-right")}>Tareas</th>
              <th className={cn(CABECERA, "px-3 py-2.5 text-right")}>Hechas</th>
              <th className={cn(CABECERA, "px-3 py-2.5 text-right")}>Proyectos</th>
              <th className={cn(CABECERA, "px-3 py-2.5 text-right")} title={`La mediana de lo que dijo el equipo, desde ${MINIMO_DEL_ARRANQUE} respuestas`}>
                Arranque
              </th>
              <th className={cn(CABECERA, "px-3 py-2.5 text-right")} title={`La mediana de lo que tomaron al terminarlas; con ${META_DE_TAREA_CLAVE} se confirma`}>
                Al terminar
              </th>
              <th className={cn(CABECERA, "px-4 py-2.5 text-right")}>La carga usa</th>
            </tr>
          </thead>
          <tbody>
            {familias.map((f) => (
              <tr key={f.clave} className="border-t border-line first:border-t-0 hover:bg-surface-muted">
                <td className="px-4 py-2.5 font-semibold text-fg">{f.nombre}</td>
                <td className="px-3 py-2.5 text-xs text-fg-muted">{f.seReconocePor}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-fg-secondary">{f.tareas}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-fg-secondary">{f.hechas}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-fg-secondary">{f.proyectos}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-fg-secondary" title={f.arranque.noLaHacen > 0 ? `${f.arranque.noLaHacen} dicen «No la hago»` : undefined}>
                  {respuesta(f.arranque)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-fg-secondary">{respuesta(f.alTerminar)}</td>
                <td className="px-4 py-2.5 text-right text-xs text-fg-muted">
                  {f.supuestoHoras === null ? "Su tipo de fase" : <span className="font-semibold tabular-nums text-fg">{formatoMinutos(f.supuestoHoras * 60)}</span>}
                </td>
              </tr>
            ))}
            <tr className="border-t border-line bg-surface-muted">
              <td className="px-4 py-2.5 font-semibold text-fg">Total</td>
              <td className="px-3 py-2.5 text-xs text-fg-muted">Una tarea cae en la primera que calza; las demás son comunes</td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-fg">{total}</td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-fg">{hechas}</td>
              <td colSpan={4} />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-fg-muted">
        Las comunes se siguen preguntando para calibrar las horas de su tipo de fase. Más adelante, el agente del cronograma puede marcar la tarea clave al
        crearla en vez de leer el título.
      </p>
    </section>
  );
}
