"use client";

/**
 * piezas-de-la-sesion — lo que comparten la preparación, el «en vivo» y el análisis de una sesión de
 * exploración (rediseño del 2026-10-07, tableros «Preventa · Sesiones de exploración»): la guía de la
 * sesión con de dónde viene cada pregunta, la etiqueta cuadrada de cada pregunta, el chip de
 * procedencia, la línea de qué es, y cómo se edita una sesión que todavía no existe (una reunión
 * suelta o la próxima sin planear se vuelven sesión al primer cambio).
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { definicionEnElMarco, esTarjeta, MARCO_DE_VENTA, type Marco } from "@/lib/exploraciones/marco";
import type { Operacion } from "@/lib/exploraciones/contenido";
import { aFecha, conEspaciosComunes, diaCorto, hoyEnCostaRica } from "@/lib/exploraciones/fechas";
import {
  focoDeLaGuia,
  ladoDeLaPregunta,
  MAX_SESIONES,
  ordenDeLaConversacion,
  preguntasParaMostrar,
  procedenciasDeLaSesion,
  textoDeLaProcedencia,
  type PestanaDeSesion,
  type PreguntaParaMostrar,
  type Procedencia,
  type SesionPlaneada,
} from "@/lib/exploraciones/guia";
import type { EscalaDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import { contextoDelPlan, guiaDeAntesDelPlan, QUE_BUSCA_CADA_PASO } from "@/lib/exploraciones/plan-de-la-guia";
import { aplicarAjustes, apuntaDelTema } from "@/lib/exploraciones/ajustes-de-la-guia";
import { useLienzo, type MomentoDeLaSesion } from "./contexto";
import { NivelChip } from "./QueVaPrimero";
import { nuevoIdDeSesion, useSesiones } from "./useSesiones";

/** «jueves 8 oct»: el día de la semana, como en el tablero. */
export function diaLargo(v: string): string {
  try {
    return conEspaciosComunes(
      new Intl.DateTimeFormat("es-CR", { weekday: "long", day: "numeric", month: "short", timeZone: "America/Costa_Rica" }).format(aFecha(v)).replace(/\.$/, "").replace(",", ""),
    );
  } catch {
    return diaCorto(v);
  }
}

/** El rótulo chico de un bloque, en mayúscula. */
export function Rotulo({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted", className)}>{children}</p>;
}

/** Una tarjeta blanca con su encabezado. */
export function Tarjeta({
  titulo,
  detalle,
  accion,
  children,
  className,
}: {
  titulo: React.ReactNode;
  detalle?: React.ReactNode;
  accion?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-xl border border-line bg-surface", className)}>
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-line px-[18px] py-3.5">
        <h3 className="text-[15px] font-semibold text-fg">{titulo}</h3>
        {detalle && <span className="text-[12.5px] text-fg-muted">{detalle}</span>}
        {accion && (
          <>
            <span className="flex-1" />
            {accion}
          </>
        )}
      </header>
      {children}
    </section>
  );
}

/** El nombre de lo que pregunta una pregunta: la tarjeta del marco (con su nombre en ese marco) o la dimensión. */
export function nombreDelPara(para: string, escala: EscalaDelLienzo, marco: Marco = MARCO_DE_VENTA): string {
  if (esTarjeta(para)) return definicionEnElMarco(para, marco).etiqueta;
  return escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === para)?.nombre ?? para;
}

/**
 * Qué cubre la próxima sesión, con lo que ya se sabe del cliente: lo decide el plan (plan-de-la-guia.ts: unas 5 preguntas
 * que parten de lo que el cliente ya respondió), en la preventa y en un proyecto (con su estrategia, 2026-10-19). Es lo
 * mismo que recibe el agente al armar la guía (guia-pedido.ts › `contextoDeLaGuia`). `sinPlan`: la guía de un proyecto
 * armada antes del plan, que se muestra como se armó; lo que ya sabemos se calcula igual.
 */
export function useFocoDeLaGuia(sesionId: string | null, opciones: { sinPlan?: boolean } = {}) {
  const { exp, escala, mapa, marco } = useLienzo();
  const e = exp.estado;
  const delPlan = contextoDelPlan({ estado: e, tests: exp.leido.tests, escala, posiciones: mapa.posiciones, sesionId, marco: marco.clave });
  const foco = focoDeLaGuia(e.contenido.casillas, escala, e.areas, mapa.posiciones, e.contenido.aExplorar, marco, opciones.sinPlan ? undefined : delPlan);
  return { foco, saber: delPlan.saber };
}

/**
 * La guía de una sesión, con de dónde viene cada pregunta. La próxima usa la guía viva (o la guardada
 * para ella) sobre lo que falta HOY; una que ya pasó, la que se guardó para ella, tal como se armó.
 */
export function useGuiaDeLaSesion(pestana: PestanaDeSesion, esLaProxima: boolean) {
  const { exp, escala, marco } = useLienzo();
  const { todas } = useSesiones();
  const e = exp.estado;
  const guardada = pestana.sesion ? (e.propuesta.guias[pestana.sesion.id] ?? null) : null;
  const guia = guardada ?? (esLaProxima ? e.propuesta.guia : null);
  // Lo ya generado no se reescribe solo: la guía de un proyecto armada antes del plan se ve como se armó.
  const antesDelPlan = guiaDeAntesDelPlan(guia, marco.clave);
  const { foco, saber } = useFocoDeLaGuia(pestana.sesion?.id ?? null, { sinPlan: antesDelPlan });
  const procedencias = procedenciasDeLaSesion(pestana, todas);
  const conPlan = foco.plan && saber ? { plan: foco.plan, saber } : undefined;
  const deLaGuia: PreguntaParaMostrar[] = esLaProxima
    ? preguntasParaMostrar(guia, foco.huecos, foco.enfoque, escala, procedencias, marco, conPlan)
    : guia
      ? preguntasParaMostrar(guia, guia.huecos, guia.enfoque, escala, procedencias, marco)
      : [];
  // Lo que decidió el vendedor sobre la guía de esta sesión (sus preguntas, las cambiadas, las quitadas): validación 71.
  const preguntas = aplicarAjustes(deLaGuia, pestana.sesion?.ajustesDeLaGuia, apuntaDelTema(escala));
  return { guia, foco, saber, antesDelPlan, procedencias, preguntas, enOrden: ordenDeLaConversacion(preguntas) };
}

/**
 * La etiqueta cuadrada de una pregunta: la letra del marco (azul) o el número de la dimensión (ámbar).
 * Un punto llevado de otra sesión lleva la de lo que apunta; solo si nadie sabe todavía a qué apunta
 * (se llevó después de armar la guía), una flecha gris: «viene de antes» (Elías, 2026-10-07: el «¿»
 * no se entendía).
 */
export function EtiquetaDePregunta({ p }: { p: PreguntaParaMostrar }) {
  const { marco } = useLienzo();
  const lado = ladoDeLaPregunta(p);
  const para = p.apunta?.para ?? p.para;
  const base = "flex h-[26px] min-w-[26px] flex-none items-center justify-center rounded-[7px] px-1 text-[11px] font-bold";
  // Una pregunta tuya sin tema: un «+» neutro.
  if (!lado && p.tipo === "propia") {
    return (
      <span className={cn(base, "bg-surface-hover text-fg-secondary")} title="Pregunta que sumaste, sin tema" aria-hidden="true">
        +
      </span>
    );
  }
  if (!lado) {
    return (
      <span className={cn(base, "bg-surface-hover text-fg-secondary")} title="Viene de una sesión anterior: actualiza la guía para ubicarla" aria-hidden="true">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 3v5a2 2 0 0 0 2 2h6M9.5 7.5L12 10l-2.5 2.5" />
        </svg>
      </span>
    );
  }
  // Lo vendido (solo en un proyecto): una «V» neutra, para no confundirse con el marco ni con la escala.
  if (lado === "vendido") {
    return (
      <span className={cn(base, "bg-surface-hover text-fg")} title="Lo vendido" aria-hidden="true">
        V
      </span>
    );
  }
  const letra = lado === "dimension" ? para : (marco.letras[para]?.letra ?? para.charAt(0).toUpperCase());
  return (
    <span className={cn(base, lado === "dimension" ? "bg-warn-surface text-warn-ink" : "bg-info-surface text-brand")} aria-hidden="true">
      {letra}
    </span>
  );
}

/** Quién escribió una pregunta que no es la de la guía: «Tuya», «Del asistente» o «Regenerada» (neutro: no pide nada). */
export function ChipDeLaMarca({ marca, cambiada }: { marca: NonNullable<PreguntaParaMostrar["marca"]>; cambiada: boolean }) {
  const texto = marca === "tuya" ? (cambiada ? "Editada por ti" : "Tuya") : marca === "asistente" ? (cambiada ? "Cambiada por el asistente" : "Del asistente") : "Regenerada";
  return <span className="rounded-full border border-line bg-surface-muted px-2 py-px text-[11.5px] text-fg-secondary">{texto}</span>;
}

/** «Quedó abierto en la sesión 1» / «Pasó de la sesión 2»: ámbar, porque pide atención. */
export function ChipDeProcedencia({ procedencia }: { procedencia: Procedencia }) {
  return (
    <span className="rounded-full border border-warn-line bg-warn-surface px-2 py-px text-[11.5px] text-warn-ink">{textoDeLaProcedencia(procedencia)}</span>
  );
}

/**
 * De qué es una pregunta, en una línea: «Arquitectura · Quién decide» o «Escala · Datos · hoy creemos
 * ● Deficiente hipótesis». `corta` quita el «Arquitectura · / Escala ·» (la vista por sección ya lo dice).
 */
export function DeQueEs({ p, corta = false, conProcedencia = true }: { p: PreguntaParaMostrar; corta?: boolean; conProcedencia?: boolean }) {
  const { escala, mapa, exp, marco } = useLienzo();
  const variasAreas = exp.estado.areas.length > 1;
  const lado = ladoDeLaPregunta(p);
  const para = p.apunta?.para ?? p.para;
  let que: React.ReactNode;
  if (lado === "dimension") {
    const area = escala.areas.find((a) => a.dimensiones.some((d) => d.id === para));
    const pos = mapa.posiciones[para];
    const nombre = [corta ? null : "Escala", variasAreas ? area?.nombre : null, nombreDelPara(para, escala, marco)].filter(Boolean).join(" · ");
    que = (
      <>
        <span className="text-xs text-fg-muted">
          {nombre} · {pos ? (pos.clase === "evidencia" ? "está en" : "hoy creemos") : "sin dato"}
        </span>
        {pos && <NivelChip nivel={pos.nivel} className="text-fg-secondary" />}
        {pos?.clase === "hipotesis" && <span className="text-xs text-warn-ink">hipótesis</span>}
      </>
    );
  } else if (lado === "tarjeta") {
    que = (
      <span className="text-xs text-fg-muted">
        {[corta ? null : marco.clave === "cs" ? "Estrategia" : "Arquitectura", nombreDelPara(para, escala, marco), para === "presupuesto" ? "al final: primero la meta, después la plata" : null].filter(Boolean).join(" · ")}
      </span>
    );
  } else if (lado === "vendido") {
    que = <span className="text-xs text-fg-muted">{[corta ? null : "Lo vendido", p.tema].filter(Boolean).join(" · ")}</span>;
  } else {
    que = null;
  }
  return (
    <div className="mt-[5px] flex flex-wrap items-center gap-1.5">
      {que}
      {p.paso && p.paso !== "situacion" && <span className="text-xs text-fg-muted">· {QUE_BUSCA_CADA_PASO[p.paso]}</span>}
      {conProcedencia && p.procedencia && <ChipDeProcedencia procedencia={p.procedencia} />}
      {p.marca && <ChipDeLaMarca marca={p.marca} cambiada={!!p.cambiada} />}
      {p.tipo === "abierto" && p.contexto && <span className="basis-full text-xs text-fg-muted">Se dijo: {p.contexto}</span>}
    </div>
  );
}

/** La sesión que nace de una pestaña que todavía no es sesión: una reunión suelta (con su reunión y su día) o la próxima sin planear. */
function sesionDeLaPestana(p: PestanaDeSesion): SesionPlaneada {
  const r = p.reunion;
  return { id: nuevoIdDeSesion(), ...(r ? { reunion: { id: r.id, origen: r.origen }, fecha: hoyEnCostaRica(aFecha(r.fecha)) } : {}) };
}

/**
 * Cambiar una sesión, aunque todavía no exista: si la pestaña es una reunión suelta o la próxima sin
 * planear, la sesión se crea en el mismo cambio y queda elegida (en el mismo momento). `extra` suma
 * operaciones con el id de la sesión (una nota). Sin `cambio`, solo van las extra. Devuelve el id de
 * la sesión, o null si no se pudo guardar.
 */
export function useEditarLaSesion(pestana: PestanaDeSesion, momento: MomentoDeLaSesion) {
  const { cambiar, sesion: seleccion } = useLienzo();
  const { sesiones } = useSesiones();
  return async (cambio: ((s: SesionPlaneada) => SesionPlaneada) | null, extra: (id: string) => Operacion[] = () => []): Promise<string | null> => {
    const existente = pestana.sesion;
    if (!existente && sesiones.length >= MAX_SESIONES) return null;
    const base = existente ?? sesionDeLaPestana(pestana);
    const nueva = cambio ? cambio(base) : base;
    const ops: Operacion[] = [];
    if (!existente) ops.push({ op: "sesiones", sesiones: [...sesiones, nueva] });
    else if (cambio) ops.push({ op: "sesiones", sesiones: sesiones.map((x) => (x.id === existente.id ? nueva : x)) });
    ops.push(...extra(nueva.id));
    if (!ops.length) return nueva.id;
    const ok = await cambiar(ops);
    if (ok && !existente) {
      seleccion.elegir(nueva.id);
      seleccion.ponerMomento(nueva.id, momento);
    }
    return ok ? nueva.id : null;
  };
}

/**
 * Un texto que se guarda solo (al dejar de escribir y al salir del campo), en `contenido.notas`. Lo
 * que quedó sin guardar al cambiar de sesión o de momento se guarda igual. `clave` sale del id de la
 * sesión, que puede no existir todavía (`editar` la crea).
 */
export function useNotaQueSeGuarda(guardada: string, guardar: (texto: string) => Promise<unknown>) {
  const [texto, setTexto] = useState(guardada);
  const [estado, setEstado] = useState<"quieto" | "guardando" | "guardado" | "error">("quieto");
  const ultimo = useRef(guardada);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ahora = async (valor: string) => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = null;
    if (valor === ultimo.current) return;
    setEstado("guardando");
    const ok = await guardar(valor);
    if (!ok) return setEstado("error");
    ultimo.current = valor;
    setEstado("guardado");
  };
  const alEscribir = (v: string) => {
    setTexto(v);
    setEstado("quieto");
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => void ahora(v), 1500);
  };
  const pendiente = useRef(texto);
  pendiente.current = texto;
  useEffect(
    () => () => {
      if (espera.current) {
        clearTimeout(espera.current);
        void ahora(pendiente.current);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al desmontar
    [],
  );
  return { texto, estado, alEscribir, alSalir: () => void ahora(texto) };
}

export function EstadoDelGuardado({ estado }: { estado: "quieto" | "guardando" | "guardado" | "error" }) {
  if (estado === "quieto") return null;
  return (
    <span className={cn("text-[11.5px]", estado === "error" ? "text-danger-ink" : "text-fg-muted")}>
      {estado === "guardando" ? "Guardando…" : estado === "guardado" ? "Guardado" : "No se pudo guardar"}
    </span>
  );
}
