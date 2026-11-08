"use client";

/**
 * TarjetaDelRadar — al pasar el cursor por una dimensión del radar de La escala, su tarjeta (2026-11-08, cuarta vuelta con
 * Centauro Solutions). Es la tarjeta de la página de resultado del diagnóstico (ResultadoDelTestVista ›
 * TarjetaDeLaDimension: nombre, puntaje, nivel y la lectura) para uso INTERNO: con los tokens de la app, la lectura la
 * escribe el agente («cómo está», en simple) y suma qué preguntar para explorarla más, cada pregunta con su botón para
 * llevarla a la próxima sesión (lib/exploraciones/tarjetas-de-la-escala.ts › `opsParaLlevar`).
 *
 * La ubica la misma regla que la del diagnóstico (lib/tests-diagnostico/tarjeta-del-radar.ts): junto a la dimensión,
 * sin taparla. A diferencia de esa, se puede tocar: queda abierta mientras el cursor va del radar a ella. El texto sale de
 * la última corrida de «Ubicar con las reuniones»; sin corrida, del porqué del nivel y la pregunta de la escala.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useToast } from "@/components/ui";
import { PUNTO_DE_NIVEL } from "@/components/escala/niveles";
import { cn } from "@/lib/cn";
import type { Letra } from "@/lib/escala/documento/tipos";
import { diaCorto } from "@/lib/exploraciones/fechas";
import { llevadaDesdeLaEscala, opsParaLlevar, opsParaQuitar, tarjetaParaMostrar, yaLlevada } from "@/lib/exploraciones/tarjetas-de-la-escala";
import { posicionDeLaTarjeta } from "@/lib/tests-diagnostico/tarjeta-del-radar";
import { useLienzo } from "./contexto";
import { useSesiones } from "./useSesiones";

/** Lo que el radar sabe de cada dimensión dibujada (de cualquiera de las áreas elegidas). */
export interface DimensionDeLaTarjeta {
  id: string;
  nombre: string;
  area: string;
  nivel: Letra | null;
  puntaje: number | null;
  clase: "evidencia" | "hipotesis" | null;
  porQue: string | null;
  pregunta: string;
}

/**
 * Llevar una pregunta a la próxima sesión (`opsParaLlevar`) y deshacerlo (`opsParaQuitar`). Lo usan la tarjeta, el
 * detalle de la dimensión y «Para explorar más». `puede` es false en la cuenta (no tiene sesiones) o sin permiso de
 * edición; `sesion` null: no hay una próxima planeada.
 */
export function useLlevarALaSesion() {
  const { exp, cambiar, puedeEditar, guardando, lugar } = useLienzo();
  const { proxima } = useSesiones();
  const toast = useToast();
  const sesion = proxima.sesionId ? (exp.estado.contenido.sesiones.find((s) => s.id === proxima.sesionId) ?? null) : null;
  const destino = `la sesión ${proxima.numero}`;
  const estado = (pregunta: string): "va" | "llevada" | "no" =>
    llevadaDesdeLaEscala(pregunta, sesion) ? "llevada" : yaLlevada(pregunta, sesion) ? "va" : "no";
  const aplicar = async (r: ReturnType<typeof opsParaLlevar>, ok: string) => {
    if (!r.ok) return void toast.error(r.error);
    if (r.ops.length && (await cambiar(r.ops))) toast.success(ok);
  };
  const llevar = (pregunta: string, dimensionId: string) => aplicar(opsParaLlevar({ pregunta, dimensionId, sesion }), `Va a ${destino}: la guía la toma al armarse.`);
  const quitar = (pregunta: string) => aplicar(opsParaQuitar({ pregunta, sesion }), `Ya no va a ${destino}.`);
  return { puede: lugar !== "cuenta" && puedeEditar, hayProxima: !!sesion, guardando, destino, estado, llevar, quitar };
}

/** Una pregunta con su botón «Llevar a la sesión N»; ya llevada, «✓ Va a la sesión N · Quitar». */
export function PreguntaParaLlevar({ pregunta, dimensionId, llevar }: { pregunta: string; dimensionId: string; llevar: ReturnType<typeof useLlevarALaSesion> }) {
  const estado = llevar.estado(pregunta);
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-line bg-surface-muted px-2.5 py-2">
      <span className="text-[13px] font-medium leading-[1.45] text-fg">{pregunta}</span>
      {llevar.puede &&
        (!llevar.hayProxima ? (
          <span className="text-xs text-fg-muted">Planea la próxima sesión en Exploración para llevarle preguntas.</span>
        ) : estado === "no" ? (
          <button
            type="button"
            disabled={llevar.guardando}
            onClick={() => void llevar.llevar(pregunta, dimensionId)}
            className="self-start text-xs font-semibold text-brand hover:underline disabled:opacity-60"
          >
            Llevar a {llevar.destino}
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-success-ink">
            ✓ Va a {llevar.destino}
            {estado === "llevada" && (
              <button type="button" disabled={llevar.guardando} onClick={() => void llevar.quitar(pregunta)} className="font-medium text-fg-muted hover:text-fg hover:underline">
                Quitar
              </button>
            )}
          </span>
        ))}
    </li>
  );
}

/** «Para explorar más, pregunta», con lo que escribió el agente (o la pregunta de la escala): en la tarjeta y en el detalle. */
export function PreguntasDeLaDimension({ dimensionId, porQue, preguntaDeLaEscala, conNivel }: { dimensionId: string; porQue: string | null; preguntaDeLaEscala: string; conNivel: boolean }) {
  const { exp } = useLienzo();
  const llevar = useLlevarALaSesion();
  const t = tarjetaParaMostrar(exp.estado.propuesta.tarjetasDeLaEscala?.porDimension[dimensionId], { porQue, preguntaDeLaEscala, conNivel });
  if (!t.preguntas.length) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {t.preguntas.map((q) => (
        <PreguntaParaLlevar key={q} pregunta={q} dimensionId={dimensionId} llevar={llevar} />
      ))}
    </ul>
  );
}

interface Abierta {
  id: string;
  x: number;
  y: number;
}

/** Lo que espera para cerrarse: el cursor alcanza a ir del nodo a la tarjeta. */
const CERRAR_MS = 450;

/** El radar que se ve: se dibujan dos (el grande y el compacto) y el CSS esconde uno según el ancho. */
const radarVisible = (caja: HTMLElement | null) => [...(caja?.querySelectorAll("svg.rde-svg") ?? [])].find((s) => s.getBoundingClientRect().width > 0) ?? null;

/**
 * Envuelve el radar: escucha el cursor (y el foco del teclado) sobre los `[data-d]` y muestra la tarjeta de esa
 * dimensión. `dimensiones` trae las de todas las áreas dibujadas.
 */
export function ConTarjetas({ dimensiones, children }: { dimensiones: Readonly<Record<string, DimensionDeLaTarjeta>>; children: ReactNode }) {
  const [abierta, setAbierta] = useState<Abierta | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = useRef<number | null>(null);
  const cancelarCierre = useCallback(() => {
    if (cerrar.current !== null) window.clearTimeout(cerrar.current);
    cerrar.current = null;
  }, []);
  const cerrarLuego = useCallback(() => {
    cancelarCierre();
    cerrar.current = window.setTimeout(() => setAbierta(null), CERRAR_MS);
  }, [cancelarCierre]);
  useEffect(() => cancelarCierre, [cancelarCierre]);
  // Escape la cierra, como todo lo que flota.
  useEffect(() => {
    if (!abierta) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierta(null);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierta]);

  const abrirDesde = (el: Element | null, x: number, y: number) => {
    const id = el?.closest?.("[data-d]")?.getAttribute("data-d");
    if (!id || !dimensiones[id]) return;
    cancelarCierre();
    setAbierta((a) => (a?.id === id ? a : { id, x, y }));
  };

  return (
    <div
      ref={caja}
      onPointerOver={(e) => {
        if (e.pointerType === "touch") return;
        abrirDesde(e.target as Element, e.clientX, e.clientY);
      }}
      onPointerOut={(e) => {
        if (e.pointerType === "touch") return;
        const hacia = e.relatedTarget as Element | null;
        if (hacia?.closest?.("[data-tarjeta-interna]") || hacia?.closest?.("[data-d]")) return;
        cerrarLuego();
      }}
      onFocus={(e) => {
        const r = (e.target as Element).getBoundingClientRect();
        abrirDesde(e.target as Element, r.left + r.width / 2, r.top + r.height / 2);
      }}
      onBlur={(e) => {
        if (!(e.relatedTarget as Element | null)?.closest?.("[data-tarjeta-interna]")) cerrarLuego();
      }}
    >
      {children}
      {abierta && dimensiones[abierta.id] && (
        <Tarjeta key={abierta.id} d={dimensiones[abierta.id]} donde={abierta} contenedor={caja} onEntrar={cancelarCierre} onSalir={cerrarLuego} />
      )}
    </div>
  );
}

function Tarjeta({
  d,
  donde,
  contenedor,
  onEntrar,
  onSalir,
}: {
  d: DimensionDeLaTarjeta;
  donde: Abierta;
  contenedor: RefObject<HTMLDivElement | null>;
  onEntrar: () => void;
  onSalir: () => void;
}) {
  const { exp, nombreDeNivel, lugar } = useLienzo();
  const yo = useRef<HTMLDivElement>(null);

  /* Se ubica una vez al abrirse (cada dimensión es su propia tarjeta: `key`), con el radar y el rótulo de ese momento,
     escribiendo en el DOM como la del diagnóstico (AnimacionesDelResultado › ubicar): sin estado, sin un render de más. */
  useLayoutEffect(() => {
    const el = yo.current;
    if (!el) return;
    const svg = radarVisible(contenedor.current);
    const radar = svg?.getBoundingClientRect();
    const rotulo = svg?.querySelector(`.rde-rotulo[data-d="${CSS.escape(d.id)}"], .rde-numero[data-d="${CSS.escape(d.id)}"]`)?.getBoundingClientRect() ?? null;
    const p = posicionDeLaTarjeta({
      vw: window.innerWidth,
      vh: window.innerHeight,
      w: el.offsetWidth || 360,
      h: el.offsetHeight || 260,
      x: donde.x,
      y: donde.y,
      radar: radar ?? { left: donde.x, right: donde.x, top: donde.y, bottom: donde.y },
      rotulo,
    });
    el.style.transform = `translate(${p.left}px, ${p.top}px)`;
    if (p.altoMaximo !== null) el.style.maxHeight = `${p.altoMaximo}px`;
    el.style.visibility = "visible";
  }, [contenedor, d.id, donde.x, donde.y]);

  const guardadas = exp.estado.propuesta.tarjetasDeLaEscala;
  const t = tarjetaParaMostrar(guardadas?.porDimension[d.id], { porQue: d.porQue, preguntaDeLaEscala: d.pregunta, conNivel: !!d.nivel });

  return (
    <div
      ref={yo}
      data-tarjeta-interna=""
      aria-label={`${d.nombre}: cómo está y qué preguntar`}
      onPointerEnter={onEntrar}
      onPointerLeave={onSalir}
      style={{ left: 0, top: 0, visibility: "hidden" }}
      className="fixed z-50 flex w-[min(360px,calc(100vw-24px))] flex-col gap-2.5 overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-xl"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
            {d.area} · {d.id}
          </p>
          <p className="text-sm font-semibold text-fg">{d.nombre}</p>
        </div>
        {d.nivel && (
          <div className="flex items-center gap-2">
            {d.puntaje !== null && (
              <span className="text-lg font-bold tabular-nums text-fg">
                {Math.round(d.puntaje)}
                <small className="text-xs font-medium text-fg-muted">/100</small>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-muted px-2 py-0.5 text-xs font-semibold text-fg">
              <span className={cn("h-2 w-2 rounded-full", PUNTO_DE_NIVEL[d.nivel])} aria-hidden="true" />
              {nombreDeNivel(d.nivel)}
            </span>
          </div>
        )}
      </div>
      {d.clase && (
        <span
          className={cn(
            "self-start rounded-full border px-2 py-px text-[11px] font-semibold",
            d.clase === "evidencia" ? "border-success-line bg-success-surface text-success-ink" : "border-warn-line bg-warn-surface text-warn-ink",
          )}
        >
          {d.clase === "evidencia" ? "✓ Con evidencia" : "○ Por explorar"}
        </span>
      )}
      {t.comoEsta && <p className="text-[13px] leading-[1.5] text-fg-secondary">{t.comoEsta}</p>}
      {t.preguntas.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Para explorar más, pregunta</p>
          <PreguntasDeLaDimension dimensionId={d.id} porQue={d.porQue} preguntaDeLaEscala={d.pregunta} conNivel={!!d.nivel} />
        </div>
      )}
      <p className="text-[11px] text-fg-muted">
        {t.deAgente && guardadas
          ? `Lo escribió Nexus con las reuniones el ${diaCorto(guardadas.en)}. `
          : lugar === "preventa"
            ? "Con «Ubicar con las reuniones», Nexus la escribe con lo que se habló. "
            : ""}
        Toca el nodo para ver los cinco niveles.
      </p>
    </div>
  );
}
