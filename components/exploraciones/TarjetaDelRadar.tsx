"use client";

/**
 * TarjetaDelRadar — al pasar el cursor por una dimensión del radar de La escala, su tarjeta (2026-11-08, cuarta vuelta con
 * Centauro Solutions). Es la tarjeta de la página de resultado del diagnóstico (ResultadoDelTestVista ›
 * TarjetaDeLaDimension: nombre, puntaje, nivel y la lectura) para uso INTERNO: con los tokens de la app, la lectura la
 * escribe el agente («cómo está», en simple) y suma qué preguntar para explorarla más, cada pregunta con su botón para
 * llevarla a la próxima sesión (lib/exploraciones/tarjetas-de-la-escala.ts › `opsParaLlevar`).
 *
 * El movimiento es EL MISMO CÓDIGO de la página del diagnóstico (components/escala/movimiento-del-radar.ts, 8 nov): el
 * resalte del eje, el vértice y el rótulo, el fundido, el imán y la regla que la ubica junto a la dimensión sin taparla.
 * Se deja alcanzar: queda abierta mientras el cursor va del radar a ella. Con áreas superpuestas, la tarjeta es la del EJE:
 * una sección por área, cada una con su color y lo mismo que la tarjeta de un área (8 nov, Elías: «si hago hover en una
 * dimensión y tengo dos departamentos seleccionados, debe aparecer la información de cada departamento»); va junto al
 * rótulo del eje. El texto sale de la última corrida de «Ubicar con las reuniones»; sin corrida, del porqué del nivel y
 * la pregunta de la escala.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useToast } from "@/components/ui";
import { PUNTO_DE_NIVEL } from "@/components/escala/niveles";
import { cn } from "@/lib/cn";
import type { Letra } from "@/lib/escala/documento/tipos";
import { diaCorto } from "@/lib/exploraciones/fechas";
import { llevadaDesdeLaEscala, opsParaLlevar, opsParaQuitar, tarjetaParaMostrar, yaLlevada } from "@/lib/exploraciones/tarjetas-de-la-escala";
import { conIman, imanDelRadar, resaltarElRadar, ubicarLaTarjeta, type TarjetaPedida } from "@/components/escala/movimiento-del-radar";
import { useLienzo } from "./contexto";
import { useSesiones } from "./useSesiones";

/** Lo que el radar sabe de cada dimensión dibujada (de cualquiera de las áreas elegidas). */
export interface DimensionDeLaTarjeta {
  id: string;
  nombre: string;
  area: string;
  /** El color del área en el radar: con varias áreas en la tarjeta, cada sección lo lleva. */
  color?: string;
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

/**
 * Envuelve el radar y le da el movimiento de la página de resultado del test (components/escala/movimiento-del-radar.ts,
 * el mismo código): al pasar el cursor (o enfocar, o tocar) una dimensión se resaltan su eje, su vértice y su rótulo,
 * entra su tarjeta con un fundido junto a la dimensión y los vértices se corren apenas hacia el cursor (el imán). La
 * tarjeta se deja alcanzar para tocar «Llevar a la sesión N». `dimensiones` trae las de todas las áreas dibujadas;
 * `porEje`, las de cada eje (lib/escala/areas-superpuestas.ts › `partesPorEje`): con dos o más, la tarjeta las muestra
 * todas, la principal primero. `principal`: el área de los ejes; al cambiar (tocar un nodo de otra área, sacarla), el
 * radar se redibuja con otras claves y el movimiento se rearma: limpia el resalte viejo y abre la tarjeta del eje que
 * queda bajo el cursor, con todas sus áreas.
 */
export function ConTarjetas({
  dimensiones,
  porEje,
  principal,
  children,
}: {
  dimensiones: Readonly<Record<string, DimensionDeLaTarjeta>>;
  porEje?: Readonly<Record<string, readonly string[]>>;
  principal?: string;
  children: ReactNode;
}) {
  const [abierta, setAbierta] = useState<TarjetaPedida | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const tarjeta = useRef<HTMLDivElement>(null);
  const rearmar = useRef<(() => void) | null>(null);
  const principalDeAntes = useRef(principal);

  // Después de que React dibujó el radar de la nueva principal (antes de pintar), el movimiento se rearma.
  useLayoutEffect(() => {
    if (principalDeAntes.current === principal) return;
    principalDeAntes.current = principal;
    rearmar.current?.();
  }, [principal]);

  useEffect(() => {
    const raiz = caja.current;
    if (!raiz) return;
    const soltarElRadar = resaltarElRadar(raiz, {
      mostrar: (t) => setAbierta(t),
      ocultar: () => setAbierta(null),
      abierta: () => tarjeta.current,
    });
    rearmar.current = soltarElRadar.rearmar;
    const soltarElIman = conIman() ? imanDelRadar(raiz) : () => undefined;
    return () => {
      rearmar.current = null;
      soltarElRadar();
      soltarElIman();
    };
  }, []);

  const ds = abierta ? (porEje?.[abierta.eje] ?? [abierta.clave]).map((id) => dimensiones[id]).filter((x): x is DimensionDeLaTarjeta => !!x) : [];
  return (
    <div ref={caja}>
      {children}
      {/* La tarjeta de un eje con varias áreas es una sola: pasar de un vértice a otro del mismo eje no la vuelve a abrir. */}
      {abierta && ds.length > 0 && <Tarjeta key={ds.length > 1 ? `eje:${abierta.eje}` : abierta.clave} ref={tarjeta} ds={ds} donde={abierta} />}
    </div>
  );
}

/** El ancho de la tarjeta según cuántas áreas caen en el eje: cada una con su columna de ~320 px. */
const ANCHO_DE_LA_TARJETA = {
  1: "w-[min(360px,calc(100vw-24px))]",
  2: "w-[min(660px,calc(100vw-24px))]",
  3: "w-[min(960px,calc(100vw-24px))]",
} as const;
const COLUMNAS_DE_LA_TARJETA = { 1: "", 2: "md:grid-cols-2 md:gap-5", 3: "md:grid-cols-3 md:gap-5" } as const;

function Tarjeta({ ds, donde, ref }: { ds: readonly DimensionDeLaTarjeta[]; donde: TarjetaPedida; ref: RefObject<HTMLDivElement | null> }) {
  const { exp, lugar } = useLienzo();

  /* Se ubica al abrirse (cada dimensión es su propia tarjeta: `key`) y al reubicarla, con la misma regla que la del
     diagnóstico, escribiendo en el DOM: sin estado, sin un render de más. Después entra con el fundido. */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // `ubicarLaTarjeta` ya midió la tarjeta escondida (opacidad 0): desde ahí el fundido corre al marcarla visible.
    ubicarLaTarjeta(el, donde);
    el.style.visibility = "visible";
    el.setAttribute("data-visible", "");
  }, [ref, donde]);

  const guardadas = exp.estado.propuesta.tarjetasDeLaEscala;
  const varias = ds.length > 1;
  const deAgente = ds.some((d) => tarjetaParaMostrar(guardadas?.porDimension[d.id], { porQue: d.porQue, preguntaDeLaEscala: d.pregunta, conNivel: !!d.nivel }).deAgente);

  return (
    <div
      ref={ref}
      data-tarjeta-interna=""
      aria-label={varias ? `${ds[0].nombre}, en ${ds.map((d) => d.area).join(", ")}: cómo está y qué preguntar` : `${ds[0].nombre}: cómo está y qué preguntar`}
      style={{ left: 0, top: 0, visibility: "hidden" }}
      className={cn(
        "fixed z-50 flex flex-col gap-2.5 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-4 opacity-0 shadow-xl transition-opacity duration-150 ease-out data-[visible]:opacity-100 motion-reduce:transition-none",
        ANCHO_DE_LA_TARJETA[Math.min(ds.length, 3) as 1 | 2 | 3],
      )}
    >
      {/* Con varias áreas en el eje, una al lado de la otra en la misma fila (novena vuelta, 8 nov, Elías: «deben aparecer
          los dos departamentos en un mismo row»); en una ventana angosta, una debajo de la otra. */}
      <div className={cn("grid grid-cols-1 gap-3", COLUMNAS_DE_LA_TARJETA[Math.min(ds.length, 3) as 1 | 2 | 3])}>
        {ds.map((d, i) => (
          <SeccionDeLaTarjeta key={d.id} d={d} separada={i > 0} />
        ))}
      </div>
      <p className="text-[11px] text-fg-muted">
        {deAgente && guardadas
          ? `Lo escribió Nexus con las reuniones el ${diaCorto(guardadas.en)}. `
          : lugar === "preventa"
            ? "Con «Ubicar con las reuniones», Nexus la escribe con lo que se habló. "
            : ""}
        Toca el nodo para ver los cinco niveles.
      </p>
    </div>
  );
}

/**
 * Lo de una dimensión en la tarjeta: el DEPARTAMENTO en grande y con su color (novena vuelta, 8 nov, Elías: «el nombre del
 * departamento mucho más grande, que se note más»), la dimensión, puntaje y nivel, evidencia o por explorar, «cómo está»
 * y qué preguntar. Con varias áreas, cada una es una columna; desde la segunda, una línea a su izquierda (o arriba, si se
 * apilan en una ventana angosta).
 */
function SeccionDeLaTarjeta({ d, separada }: { d: DimensionDeLaTarjeta; separada: boolean }) {
  const { exp, nombreDeNivel } = useLienzo();
  const t = tarjetaParaMostrar(exp.estado.propuesta.tarjetasDeLaEscala?.porDimension[d.id], { porQue: d.porQue, preguntaDeLaEscala: d.pregunta, conNivel: !!d.nivel });
  return (
    <section
      aria-label={`${d.area} · ${d.nombre}`}
      className={cn("flex min-w-0 flex-col gap-2.5", separada && "border-t border-line pt-3 md:border-l md:border-t-0 md:pl-5 md:pt-0")}
    >
      <p className="flex items-center gap-2 text-xl font-bold leading-tight text-fg">
        {d.color && <span className="h-3.5 w-3.5 flex-shrink-0 rounded-[4px]" style={{ background: d.color }} aria-hidden="true" />}
        {d.area}
      </p>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{d.id}</p>
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
    </section>
  );
}
