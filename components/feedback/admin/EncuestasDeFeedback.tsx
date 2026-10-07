"use client";

/**
 * Encuestas de /feedback (2026-10-06): todo lo que le preguntas al equipo, en dos clases que se ven separadas arriba.
 *
 * - Tus preguntas: las escribes tú, para quien elijas, sobre una pantalla. Una tarjeta por pregunta (no una fila por
 *   persona): cuántos contestaron, a quién se le espera y si ya la vio, y lo que dijo cada uno (la respuesta es un
 *   reporte y se abre en la Bandeja o en su tema). «Nueva pregunta» abre un cajón con los cuatro pasos y la burbuja
 *   tal como le aparece a la persona. La primera vez, la pestaña explica cómo funciona.
 * - Automáticas: «¿cuánto te tomó?», que se hacen solas (lib/tiempos, un módulo propio que Feedback configura).
 *
 * Diseño «Feedback · Encuestas (v2)» (Claude Design): la versión anterior mezclaba las dos cosas sin decir cuál era
 * cuál y escondía el formulario en el panel. La clase abierta va en la dirección (`?clase=automaticas`); Personas
 * trae a las personas marcadas (`?para=`) con el cajón ya abierto.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Segmentado } from "@/components/ui/Segmentado";
import { BotonEnlace, QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { useMe } from "@/hooks/useMe";
import {
  IDEAS_DE_PREGUNTA,
  agruparPedidos,
  estadoEnTexto,
  metaDeLaPregunta,
  queSigueDeEncuestas,
  respuestasSinRevisar,
  textoDeEspera,
  type PersonaDeLaPregunta,
  type PreguntaAgrupada,
} from "@/lib/feedback/encuestas";
import type { DatosDeEncuestas } from "@/lib/feedback/queries";
import { fechaCorta, numeroDeReporte } from "@/lib/feedback/reglas";
import { EVENTO_DEL_RECORRIDO, type AccionDelRecorrido } from "@/lib/recorridos/tipos";
import type { DatosDeTiempos } from "@/lib/tiempos/tipos";
import TiemposDeFeedback, { AntesDeActivarlas } from "@/components/tiempos/admin/TiemposDeFeedback";
import { CuerpoDelPedido } from "../PedidoDeOpinion";
import { Iniciales } from "../piezas";
import { DisposicionDeFeedback } from "./Disposicion";
import NuevaPregunta, { enDias } from "./NuevaPregunta";

export type ClaseDeEncuesta = "preguntas" | "automaticas";

/** Las cerradas que se ven antes de «Ver las N». */
const CERRADAS_A_LA_VISTA = 4;
/** Quienes no reportan, en el panel, antes de «Ver los N». */
const CALLADOS_A_LA_VISTA = 6;

/** La pregunta de muestra de «Cómo funciona». */
const PREGUNTA_DE_MUESTRA = "¿Qué te falta en la ficha de una empresa antes de llamarla?";

export default function EncuestasDeFeedback({
  encabezado,
  datos,
  tiempos,
  faltaElSqlDeTiempos,
  paraInicial,
  claseInicial,
}: {
  encabezado: ReactNode;
  datos: DatosDeEncuestas;
  /** «¿Cuánto te tomó?»; null si sus tablas todavía no están. */
  tiempos: DatosDeTiempos | null;
  /** El SQL que falta aplicar para las preguntas de tiempo, si falta. */
  faltaElSqlDeTiempos: string | null;
  /** `?para=`: las personas que se marcaron en Personas. Abre «Nueva pregunta» con ellas. */
  paraInicial: string[];
  claseInicial: ClaseDeEncuesta;
}) {
  const me = useMe();
  const deQuien = me?.name?.split(" ")[0] || "Dirección";
  const [clase, setClase] = useState<ClaseDeEncuesta>(paraInicial.length > 0 ? "preguntas" : claseInicial);
  const [nueva, setNueva] = useState<{ n: number; para: string[]; pregunta: string } | null>(
    paraInicial.length > 0 ? { n: 0, para: paraInicial, pregunta: "" } : null,
  );
  const [todasLasCerradas, setTodasLasCerradas] = useState(false);

  const grupos = useMemo(() => agruparPedidos(datos.pedidos), [datos.pedidos]);
  const hayPreguntas = grupos.abiertas.length + grupos.cerradas.length > 0;
  const queSigue = queSigueDeEncuestas(grupos, datos.equipo, respuestasSinRevisar(datos.pedidos));
  const activas = tiempos ? tiempos.encuestas.filter((e) => e.activa).length : 0;

  /** La clase abierta va en la dirección sin volver a pedir la página: los datos de las dos ya están. */
  const cambiarClase = useCallback((c: ClaseDeEncuesta) => {
    setClase(c);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("vista", "encuestas");
      if (c === "automaticas") url.searchParams.set("clase", "automaticas");
      else url.searchParams.delete("clase");
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* sin la dirección al día: la clase se ve igual */
    }
  }, []);

  // El recorrido de Feedback pide la clase de cada paso (lib/recorridos/contenido/feedback.ts).
  useEffect(() => {
    const alPedido = (e: Event) => {
      const a = (e as CustomEvent<AccionDelRecorrido>).detail;
      if (a?.evento === "feedback.encuestas" && (a.valor === "preguntas" || a.valor === "automaticas")) cambiarClase(a.valor);
    };
    window.addEventListener(EVENTO_DEL_RECORRIDO, alPedido);
    return () => window.removeEventListener(EVENTO_DEL_RECORRIDO, alPedido);
  }, [cambiarClase]);

  const abrirNueva = (para: string[] = [], pregunta = "") => setNueva((v) => ({ n: (v?.n ?? 0) + 1, para, pregunta }));
  const cerrarNueva = () => {
    setNueva(null);
    // Lo que vino de Personas ya se usó: al recargar no vuelve a abrirse.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("para")) {
        url.searchParams.delete("para");
        window.history.replaceState(window.history.state, "", url);
      }
    } catch {
      /* nada */
    }
  };

  const callados = datos.equipo.filter((m) => m.callado);

  const panel =
    clase === "preguntas" ? (
      <>
        <QueSigue
          accion={
            queSigue.aLaBandeja ? (
              <Link href="/feedback" className="text-xs font-semibold text-brand transition-colors hover:text-brand-light">
                Ir a la Bandeja →
              </Link>
            ) : undefined
          }
        >
          {queSigue.texto}
        </QueSigue>
        <QuienesNoReportan callados={callados} onPreguntar={(email) => abrirNueva([email])} />
        <LasDosClases />
      </>
    ) : (
      <>
        <QueSigue>{tiempos?.queSigue ?? "Las preguntas automáticas todavía no están disponibles."}</QueSigue>
        {tiempos && <AntesDeActivarlas hayActivas={activas > 0} />}
        <LasDosClases />
      </>
    );

  return (
    <DisposicionDeFeedback
      encabezado={encabezado}
      herramientas={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div data-recorrido="feedback.encuestas.clases">
            <Segmentado<ClaseDeEncuesta>
              etiqueta="Qué preguntas"
              valor={clase}
              onCambio={cambiarClase}
              opciones={[
                { clave: "preguntas", etiqueta: "Tus preguntas", cuenta: grupos.abiertas.length + grupos.cerradas.length },
                { clave: "automaticas", etiqueta: "Automáticas", cuenta: tiempos ? `${activas} ${activas === 1 ? "activa" : "activas"}` : undefined },
              ]}
            />
          </div>
          {clase === "preguntas" && (
            <Button variant="primary" data-recorrido="feedback.encuestas.nueva" className="px-3.5 font-semibold" onClick={() => abrirNueva()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nueva pregunta
            </Button>
          )}
        </div>
      }
      panel={panel}
      etiquetaPanel="Encuestas"
    >
      {clase === "preguntas" ? (
        hayPreguntas ? (
          <div data-recorrido="feedback.encuestas.preguntas" className="space-y-6">
            {grupos.abiertas.length > 0 && (
              <section aria-label="Abiertas" className="space-y-2.5">
                <p className={ROTULO_DEL_SISTEMA}>Abiertas · {grupos.abiertas.length}</p>
                {grupos.abiertas.map((g) => (
                  <TarjetaDePregunta key={g.clave} g={g} />
                ))}
              </section>
            )}
            {grupos.cerradas.length > 0 && (
              <section aria-label="Cerradas" className="space-y-2.5">
                <p className={ROTULO_DEL_SISTEMA}>Cerradas · {grupos.cerradas.length}</p>
                {(todasLasCerradas ? grupos.cerradas : grupos.cerradas.slice(0, CERRADAS_A_LA_VISTA)).map((g) => (
                  <TarjetaDePregunta key={g.clave} g={g} />
                ))}
                {grupos.cerradas.length > CERRADAS_A_LA_VISTA && (
                  <BotonEnlace onClick={() => setTodasLasCerradas((v) => !v)}>
                    {todasLasCerradas ? "Ver menos" : `Ver las ${grupos.cerradas.length} cerradas`}
                  </BotonEnlace>
                )}
              </section>
            )}
          </div>
        ) : (
          <ComoFunciona deQuien={deQuien} onIdea={(texto) => abrirNueva([], texto)} />
        )
      ) : tiempos ? (
        <TiemposDeFeedback datos={tiempos} />
      ) : (
        faltaElSqlDeTiempos && (
          <Alert variant="warning">
            Las preguntas automáticas todavía no están disponibles: falta aplicar {faltaElSqlDeTiempos} y reiniciar con el cliente de Prisma nuevo.
          </Alert>
        )
      )}

      {nueva && (
        <NuevaPregunta
          key={nueva.n}
          equipo={datos.equipo}
          paraInicial={nueva.para}
          preguntaInicial={nueva.pregunta}
          deQuien={deQuien}
          onCerrar={cerrarNueva}
        />
      )}
    </DisposicionDeFeedback>
  );
}

/** La primera vez: cómo funciona, en tres pasos, con la burbuja tal como la ve el equipo y preguntas para empezar. */
function ComoFunciona({ deQuien, onIdea }: { deQuien: string; onIdea: (texto: string) => void }) {
  const paso = (n: number, titulo: string) => (
    <span className="flex items-center gap-2.5">
      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-line text-xs font-semibold text-fg-secondary">{n}</span>
      <span className="text-[15px] font-semibold text-fg">{titulo}</span>
    </span>
  );
  return (
    <section aria-label="Cómo funciona" data-recorrido="feedback.encuestas.preguntas" className="flex flex-col gap-6 rounded-xl border border-line bg-surface p-7">
      <div className="max-w-[640px] space-y-1">
        <h2 className="text-lg font-semibold leading-[26px] text-fg">Pregúntale al equipo justo donde trabaja</h2>
        <p className="text-sm text-fg-secondary">
          Una pregunta concreta sobre una pantalla funciona mejor que «¿algún comentario?» en una reunión: la persona contesta cuando está usando esa
          pantalla, con la pantalla a la vista.
        </p>
      </div>
      <ol className="grid gap-4 md:grid-cols-3">
        <li className="flex flex-col gap-2.5">
          {paso(1, "Escribes la pregunta")}
          <span className="text-[13px] text-fg-secondary">Eliges a quién y sobre qué pantalla. Puedes mandarla a varias personas a la vez.</span>
        </li>
        <li className="flex flex-col gap-2.5">
          {paso(2, "Le aparece al entrar ahí")}
          <span className="text-[13px] text-fg-secondary">Abajo a la derecha, hasta que conteste o diga «Ahora no». No le llega correo.</span>
          <CuerpoDelPedido deQuien={deQuien} hasta={`${enDias(7)}T12:00:00`} pregunta={PREGUNTA_DE_MUESTRA} />
        </li>
        <li className="flex flex-col gap-2.5">
          {paso(3, "Su respuesta llega acá")}
          <span className="text-[13px] text-fg-secondary">
            Con una captura de la pantalla, como cualquier reporte: la ves debajo de tu pregunta y en la Bandeja, donde decides qué hacer con ella.
          </span>
        </li>
      </ol>
      <div className="space-y-2.5 border-t border-line pt-5">
        <p className={ROTULO_DEL_SISTEMA}>Para empezar, una de estas</p>
        <div className="flex flex-wrap gap-2">
          {IDEAS_DE_PREGUNTA.map((i) => (
            <button
              key={i.corta}
              type="button"
              onClick={() => onIdea(i.texto)}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-left text-[13px] text-fg-secondary transition-colors hover:border-info-line hover:bg-info-surface"
            >
              {i.texto}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Una pregunta: a quiénes, cuántos contestaron, a quién se le espera y lo que dijo cada uno. */
function TarjetaDePregunta({ g }: { g: PreguntaAgrupada }) {
  const total = g.personas.length;
  const pct = total === 0 ? 0 : Math.round((g.contestaron / total) * 100);
  const espera = textoDeEspera(g);
  return (
    <article className="flex flex-col rounded-xl border border-line bg-surface">
      <div className="flex flex-col gap-2.5 px-[18px] py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="text-xs text-fg-muted">{metaDeLaPregunta(g)}</p>
            <p className="text-[15px] font-semibold leading-[21px] text-fg">«{g.pregunta}»</p>
          </div>
          <span
            className={cn(
              "flex-none whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold leading-5",
              g.abierta ? "border-warn-line bg-warn-surface text-warn-ink" : "border-line bg-surface text-fg-secondary",
            )}
          >
            {g.abierta ? `${g.faltan === 1 ? "Falta 1" : `Faltan ${g.faltan}`}` : "Cerrada"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex" aria-hidden="true">
            {g.personas.map((p, i) => (
              <Cara key={p.pedidoId} p={p} primera={i === 0} />
            ))}
          </span>
          <span className="text-[13px] font-semibold text-fg">
            Contestaron {g.contestaron} de {total}
          </span>
          <span className="h-1.5 min-w-[120px] max-w-[220px] flex-1 overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
            <span className="block h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
          </span>
          {espera && <span className="text-xs text-fg-muted">{espera}</span>}
        </div>
        <p className="sr-only">{g.personas.map(estadoEnTexto).join(". ")}</p>
      </div>
      {g.respuestas.length > 0 && (
        <div className="border-t border-line">
          {g.respuestas.map((r, i) => (
            <Link
              key={r.reporteId}
              href={`/feedback?reporte=${r.reporteId}`}
              className={cn("flex items-start gap-2.5 px-[18px] py-3 transition-colors hover:bg-surface-muted", i > 0 && "border-t border-line")}
            >
              <Iniciales texto={r.iniciales} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-xs text-fg-muted">
                  <span className="font-semibold text-fg-secondary">{r.nombre}</span> contestó{r.fecha ? ` · ${fechaCorta(r.fecha)}` : ""} · {numeroDeReporte(r.numero)}
                </span>
                <span className="line-clamp-3 text-[13px] leading-[1.45] text-fg">«{r.cuerpo}»</span>
              </span>
              <span className="flex-none pt-0.5 text-xs font-semibold text-brand">{r.enTema ? "Abrir en su tema" : "Abrir en la Bandeja"}</span>
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}

/** El círculo de una persona: verde si contestó, con borde punteado si dijo «Ahora no» o no llegó a contestar. */
function Cara({ p, primera }: { p: PersonaDeLaPregunta; primera: boolean }) {
  return (
    <span
      title={estadoEnTexto(p)}
      className={cn(
        "flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] text-[10px] font-bold",
        !primera && "-ml-1",
        p.estado === "contesto"
          ? "border-success-line bg-success-surface text-success-ink"
          : p.estado === "espera"
            ? "border-line bg-surface-hover text-fg-muted"
            : "border-dashed border-fg-muted/50 bg-surface-hover text-fg-muted",
      )}
    >
      {p.iniciales}
    </span>
  );
}

/** El panel: a quién conviene preguntarle (no mandó nada en 30 días). */
function QuienesNoReportan({ callados, onPreguntar }: { callados: DatosDeEncuestas["equipo"]; onPreguntar: (email: string) => void }) {
  const [todos, setTodos] = useState(false);
  const visibles = todos ? callados : callados.slice(0, CALLADOS_A_LA_VISTA);
  return (
    <div data-recorrido="feedback.encuestas.callados" className="space-y-2">
      <p className={ROTULO_DEL_SISTEMA}>No reportan hace 30 días · {callados.length}</p>
      {callados.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Todos mandaron algo en los últimos 30 días.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {visibles.map((m, i) => (
            <div key={m.email} className={cn("flex items-center gap-2.5 px-3 py-2.5", i > 0 && "border-t border-line")}>
              <Iniciales texto={m.iniciales} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-fg">{m.nombre}</span>
                <span className="block truncate text-xs text-fg-muted">
                  {m.rol} · {m.ultimo ? `último: ${fechaCorta(m.ultimo)}` : "nunca"}
                </span>
              </span>
              <BotonEnlace onClick={() => onPreguntar(m.email)} className="flex-none">
                Preguntarle
              </BotonEnlace>
            </div>
          ))}
          {callados.length > CALLADOS_A_LA_VISTA && (
            <button
              type="button"
              onClick={() => setTodos((v) => !v)}
              className="w-full border-t border-line px-3 py-2 text-left text-xs font-semibold text-brand transition-colors hover:bg-surface-hover hover:text-brand-light"
            >
              {todos ? "Ver menos" : `Ver los ${callados.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Al pie del panel: qué es cada clase. */
function LasDosClases() {
  return (
    <div className="space-y-1.5 border-t border-line pt-4">
      <p className={ROTULO_DEL_SISTEMA}>Las dos clases de encuestas</p>
      <p className="text-[13px] text-fg-secondary">
        <b className="font-semibold text-fg">Tus preguntas</b>: las escribes tú, para quien elijas, sobre una pantalla.
      </p>
      <p className="text-[13px] text-fg-secondary">
        <b className="font-semibold text-fg">Automáticas</b>: «¿cuánto te tomó?», solas, al terminar algo.
      </p>
    </div>
  );
}
