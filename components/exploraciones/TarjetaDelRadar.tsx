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
import { opsParaLlevar, tarjetaParaMostrar, yaLlevada } from "@/lib/exploraciones/tarjetas-de-la-escala";
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
 * Llevar una pregunta a la exploración: a lo que se lleva la próxima sesión o, sin una planeada, a «explorar a fondo» de
 * su dimensión (`opsParaLlevar`). Lo usan la tarjeta y «Para explorar más». `puede` es false en la cuenta (no tiene
 * sesiones) o sin permiso de edición.
 */
export function useLlevarALaSesion() {
  const { exp, cambiar, puedeEditar, guardando, lugar } = useLienzo();
  const { proxima } = useSesiones();
  const toast = useToast();
  const sesion = proxima.sesionId ? (exp.estado.contenido.sesiones.find((s) => s.id === proxima.sesionId) ?? null) : null;
  const destino = sesion ? `la sesión ${proxima.numero}` : "la próxima sesión";
  const yaVa = (pregunta: string, dimensionId: string) => yaLlevada(pregunta, { sesion, razonDeExplorar: exp.estado.contenido.aExplorar[dimensionId]?.razon ?? null });
  const llevar = async (pregunta: string, dimensionId: string) => {
    const r = opsParaLlevar({ pregunta, dimensionId, sesion });
    if (!r.ok) return void toast.error(r.error);
    if (!r.ops.length) return;
    if (await cambiar(r.ops)) toast.success(r.a === "sesion" ? `Va a ${destino}: la guía la toma al armarse.` : "Se explora a fondo en la próxima sesión, con esa pregunta.");
  };
  return { puede: lugar !== "cuenta" && puedeEditar, guardando, destino, yaVa, llevar };
}

/** Una pregunta con su botón «Llevar a la sesión N» (o «✓ Va a la sesión N»). */
export function PreguntaParaLlevar({ pregunta, dimensionId, llevar }: { pregunta: string; dimensionId: string; llevar: ReturnType<typeof useLlevarALaSesion> }) {
  const va = llevar.yaVa(pregunta, dimensionId);
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-line bg-surface-muted px-2.5 py-2">
      <span className="text-[13px] font-medium leading-[1.45] text-fg">{pregunta}</span>
      {llevar.puede && (
        <button
          type="button"
          disabled={llevar.guardando || va}
          onClick={() => void llevar.llevar(pregunta, dimensionId)}
          className={cn("self-start text-xs font-semibold", va ? "text-success-ink" : "text-brand hover:underline disabled:opacity-60")}
        >
          {va ? `✓ Va a ${llevar.destino}` : `Llevar a ${llevar.destino}`}
        </button>
      )}
    </li>
  );
}

interface Abierta {
  id: string;
  x: number;
  y: number;
}

const CERRAR_MS = 220;

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
  const llevar = useLlevarALaSesion();
  const yo = useRef<HTMLDivElement>(null);

  /* Se ubica una vez al abrirse (cada dimensión es su propia tarjeta: `key`), con el radar y el rótulo de ese momento,
     escribiendo en el DOM como la del diagnóstico (AnimacionesDelResultado › ubicar): sin estado, sin un render de más. */
  useLayoutEffect(() => {
    const el = yo.current;
    if (!el) return;
    const radar = contenedor.current?.querySelector("svg")?.getBoundingClientRect();
    const rotulo = contenedor.current?.querySelector(`.rde-rotulo[data-d="${CSS.escape(d.id)}"]`)?.getBoundingClientRect() ?? null;
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
      role="status"
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
          <ul className="flex flex-col gap-1.5">
            {t.preguntas.map((q) => (
              <PreguntaParaLlevar key={q} pregunta={q} dimensionId={d.id} llevar={llevar} />
            ))}
          </ul>
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
