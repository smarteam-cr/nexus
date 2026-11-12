"use client";

/**
 * PasoEscala — dónde parece estar cada equipo en la escala, y por qué.
 *
 * Tercera vuelta (2026-11-08, Elías con Centauro Solutions): «lo importante es que el vendedor VEA la escala, con los
 * nodos y el puntaje, exactamente como se ve en el diagnóstico de rendimiento». En este orden:
 *   1. Arriba, «Ubicar con las reuniones» (solo la preventa: el agente lee las transcripciones de las sesiones y ubica las
 *      tres áreas con su evidencia, y lo que no tiene evidencia directa como hipótesis por explorar) y «Acceso».
 *   2. Lo que sugiere el agente, en una franja: cuántas con evidencia y cuántas por explorar, «Pasar las N al mapa» y la
 *      lista solo si se pide. Sin «Usadas hoy» (el aviso de cada uso ya deshace).
 *   3. Dónde está hoy: una frase de lo explorado (equipos-de-la-escala.ts) y las tres áreas como botones que se
 *      PRESIONAN (cuarta vuelta, 2026-11-08: «se pueden elegir varias, y se ven en el mismo radar, una sobre otra, cada
 *      una de un color»). Se ven con el RADAR DEL DIAGNÓSTICO (`RadarDeUnaEmpresa`, el mismo de la página del cliente:
 *      nodos, puntaje y nivel en el centro); la principal (la última elegida) lleva los nombres y el detalle, las otras
 *      van encima con su color. Un área con algo se ve aunque no esté en juego. (La rueda, la vista «Mapa», se quitó el 9
 *      nov: Elías pidió sacarla; lo que solo ella mostraba está en DECISIONS.) Al pasar el cursor por una dimensión sale su TARJETA (TarjetaDelRadar.tsx: cómo está y qué
 *      preguntar, con «Llevar a la sesión N»); tocarla abre la dimensión con sus cinco niveles.
 *      Debajo, «Lo que más frena a cada equipo» con el puente a «Casos de uso», y «Para explorar más» cada equipo,
 *      ordenados por hipótesis: ahí vive la lectura «Preparación para engagement avanzado» (en Marketing). Novena vuelta
 *      (8 nov): lo de debajo del radar no depende de las áreas elegidas (elegir Marketing ya no corre nada), se pueden
 *      soltar todas («Selecciona un departamento») y se fue «De dónde sale cada nivel» (Elías: «me parece irrelevante»).
 *   4. Con qué se mide, qué va primero y el agente, al pie.
 * Se fue «Qué explorar en la próxima sesión»: la guía ya elige primero lo que no tiene evidencia, y cada dimensión
 * conserva «Explorarla a fondo».
 *
 * LA PÁGINA DEL CLIENTE, EDITABLE (8 nov; Elías: «la página de resultados debe verse igual externo que interno, pero
 * interno debe funcionar como un artefacto que se puede editar»): «Dónde está hoy» abre en «Como lo ve el cliente»
 * (PaginaDeLaEscala.tsx): la misma página pública, con los mismos datos, donde se edita en su lugar la descripción, lo que
 * dice cada tarjeta y el nivel de cada parte (arrastrándolo en el radar). La vista de antes sigue entera al lado:
 * «Comparar áreas» (el selector con ✓, las áreas superpuestas, las hipótesis sugeridas dibujadas y la tarjeta con
 * «Llevar a la sesión N»). Lo de debajo (lo que frena a cada equipo, para explorar más) es de las dos. Desde el 9 nov la
 * página abre en su pestaña «Resumen» (la portada que presenta el vendedor) y no hay botón «Qué ve el cliente»: qué
 * equipos ve se elige en «Acceso».
 *
 * ESCALA ÚNICA (2026-10-28): la misma pieza es La cuenta › La escala de la ficha del cliente (`lugar = "cuenta"`). Ahí
 * no va «Explorarla a fondo» (la cuenta no tiene sesiones), y el agente es el de la ficha (`agente`: «Actualizar
 * escala»), no «Ubicar con las reuniones». «Acceso» (30 oct, cuenta y preventa): el enlace con que el cliente la ve y
 * qué equipos ve (AccesoALaEscala.tsx).
 */
import { useEffect, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { BOTON_DE_HERRAMIENTA, BOTON_DE_HERRAMIENTA_ACTIVO } from "@/components/ui/sistema";
import { PUNTO_DE_NIVEL } from "@/components/escala/niveles";
import RadarDeUnaEmpresa from "@/components/escala/RadarDeUnaEmpresa";
import {
  alTocarUnArea,
  alTocarUnNodo,
  areasAlCambiar,
  areasDelResumen,
  partesPorEje,
  principalYFuera,
  sinNingunaElegida,
  SIN_CAMBIO,
  type AreaSuperpuesta,
  type CambioDeAreas,
  type EleccionDeAreas,
} from "@/lib/escala/areas-superpuestas";
import { claveDeLaEleccion, guardarLaEleccion, leerLaEleccion, suscribirseALoGuardado, textoGuardado } from "@/lib/escala/eleccion-guardada";
import { cn } from "@/lib/cn";
import type { AreaDelChequeo } from "@/lib/escala/chequeo";
import type { ClaveDeCapa } from "@/lib/escala/documento/tipos";
import { esHipotesisDeNivel, type DestinoDePropuesta, type ItemPropuesto } from "@/lib/exploraciones/contenido";
import type { AreaDelLienzo, DimensionDelLienzo, EscalaDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import { fraseDelFreno, ordenParaExplorar, partesParaExplorar, resumenDeLoExplorado } from "@/lib/exploraciones/equipos-de-la-escala";
import { chequeoDelMapa, cuentaDelArea, fraseDeLaCuenta, loQueLaFrena, type PosicionEnElMapa } from "@/lib/exploraciones/mapa";
import { diaCorto } from "@/lib/exploraciones/fechas";
import AccesoALaEscala from "./AccesoALaEscala";
import ListaQueSeAnima from "./ListaQueSeAnima";
import { AL_LUGAR, DEL_LUGAR, useLienzo } from "./contexto";
import FranjaDeSugerencias, { IconoDeSugerencia } from "./FranjaDeSugerencias";
import { ConQueSeMide } from "./Identificacion";
import PanelDelAgente from "./PanelDelAgente";
import { piezaDelDestino } from "./piezas";
import { BotonUsarTodas, FilaSugerida } from "./Propuestas";
import PreparacionParaEngagement from "./PreparacionParaEngagement";
import { QueVaPrimero } from "./QueVaPrimero";
import { useAreasDeLaEscala } from "./useAreasDeLaEscala";
import { useCorrida } from "./useCorrida";
import { ConTarjetas, PreguntaParaLlevar, useLlevarALaSesion, type DimensionDeLaTarjeta } from "./TarjetaDelRadar";
import { DetalleDeDimension } from "./DetalleDeLaDimension";
import PaginaDeLaEscala from "./PaginaDeLaEscala";

/** «A», «A y B», «A, B y C». */
const enLista = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** Dónde cae una sugerencia de esta pieza, en una línea: «Ventas · Datos», «Áreas», «Con qué se mide». */
function dondeCae(d: DestinoDePropuesta, escala: EscalaDelLienzo): string {
  const deDim = (id: string) => {
    const area = escala.areas.find((a) => a.dimensiones.some((x) => x.id === id));
    const dim = area?.dimensiones.find((x) => x.id === id);
    return area && dim ? `${area.nombre} · ${dim.nombre}` : id;
  };
  switch (d.tipo) {
    case "nivel":
    case "aExplorar":
      return deDim(d.dimensionId);
    case "falta":
      return deDim(d.criterioId.split(".").slice(0, 2).join("."));
    case "area":
      return "Áreas";
    case "edicion":
    case "perfil":
      return "Con qué se mide";
    default:
      return "La escala";
  }
}

/** Un área fuera de la preventa: se suma desde su pestaña. */
function AreaFuera({ area, onSumar }: { area: AreaDelLienzo; onSumar: () => void }) {
  const { puedeEditar, guardando, lugar } = useLienzo();
  const enLaCuenta = lugar === "cuenta";
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface-muted px-5 py-7 text-center">
      <p className="text-sm font-semibold text-fg">
        {enLaCuenta ? `${area.nombre} no está en juego en la escala de la cuenta` : `Todavía no hay nada de ${area.nombre} en las reuniones`}
      </p>
      <p className="max-w-[460px] text-[13px] text-fg-muted">
        {enLaCuenta
          ? "Súmala si el cliente la trabaja o paga licencias que no usa. Después, «Actualizar escala» la ubica con lo que Nexus ya sabe."
          : lugar === "preventa"
            ? "Si se habló de ella, «Ubicar con las reuniones» la llena con hipótesis por explorar, aunque no esté en juego. Súmala a la preventa si el prospecto la nombra o paga licencias que no usa."
            : "Súmala si el cliente la nombra o paga licencias que no usa. Al sumarla, el agente la ubica en la escala con lo que ya sabe."}
      </p>
      {puedeEditar && (
        <Button size="sm" variant="secondary" className="mt-1" disabled={guardando} onClick={onSumar}>
          Sumar {area.nombre} {AL_LUGAR[lugar]}
        </Button>
      )}
    </div>
  );
}

// ── 1 · Ubicar con las reuniones (solo la preventa) ─────────────────────────

/**
 * El agente que ubica la escala con las TRANSCRIPCIONES de las sesiones (modo «posicionar», el mismo de «Actualizar
 * escala» de la cuenta): lo lanza una persona, nunca corre solo ni en cada visita. Dice cuándo corrió por última vez.
 */
function UbicarConLasReuniones() {
  const { exp, puedeEditar } = useLienzo();
  const { corriendo, lanzando, lanzar } = useCorrida();
  if (!puedeEditar) return null;
  const ultima = [...exp.estado.propuesta.corridas].reverse().find((c) => c.modo === "posicionar");
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {/* El orden de los dos botones (Elías, 11 nov): ubicar acá, confirmar en el mapa y armar el Resumen en la página. */}
      <span className="text-xs text-fg-muted">1 Ubicar con las reuniones · 2 Confirmar en el mapa · 3 Armar el Resumen, en la página del cliente</span>
      {ultima && <span className="text-xs text-fg-muted">Ubicada el {diaCorto(ultima.en)}</span>}
      <Button
        size="sm"
        variant="primary"
        loading={lanzando}
        disabled={corriendo}
        title="El agente lee las transcripciones de las sesiones y ubica Ventas, Marketing y Servicio: lo que dijo el cliente con su cita, y lo demás como hipótesis por explorar. Nada se confirma solo."
        onClick={() => void lanzar("posicionar")}
      >
        {corriendo ? "Ubicando…" : ultima ? "Volver a ubicar con las reuniones" : "Ubicar con las reuniones"}
      </Button>
    </span>
  );
}

// ── 2 · Lo que sugiere el agente, arriba y una vez ──────────────────────────

const deLaEscala = (d: DestinoDePropuesta) => piezaDelDestino(d) === "escala";

/** Las hipótesis de nivel que el agente sugiere y se dibujan en el radar (nadie las usó todavía). */
function hipotesisPendientes(posiciones: Readonly<Record<string, PosicionEnElMapa>>): ItemPropuesto[] {
  return Object.values(posiciones).flatMap((p) => (p.origen === "propuesto" && p.clase === "hipotesis" && p.pendiente && esHipotesisDeNivel(p.pendiente) ? [p.pendiente] : []));
}

/**
 * Una franja: cuántas sugerencias con evidencia y cuántas por explorar, y «Pasar las N al mapa». Las por explorar ya se
 * ven en el radar con su aro punteado; usarlas es lo que las deja llegar a la página del cliente como «por explorar».
 */
function SugerenciasDeLaEscala() {
  const { revisables, escala, mapa } = useLienzo();
  const [verLista, setVerLista] = useState(false);
  const conEvidencia = revisables.filter((it) => deLaEscala(it.destino));
  const porExplorar = hipotesisPendientes(mapa.posiciones);
  const todas = [...conEvidencia, ...porExplorar];
  if (!todas.length) return null;
  const niveles = conEvidencia.filter((it) => it.destino.tipo === "nivel").length;
  const otras = conEvidencia.length - niveles;
  const partes = [
    niveles ? `${niveles} ${niveles === 1 ? "nivel" : "niveles"} con lo que dijo el cliente` : null,
    porExplorar.length ? `${porExplorar.length} por explorar` : null,
    otras ? `${otras} ${otras === 1 ? "cambio" : "cambios"} más (áreas, qué explorar, con qué se mide)` : null,
  ].filter((x): x is string => !!x);
  return (
    <section aria-label="Lo que sugiere el agente" className="space-y-1.5">
      <FranjaDeSugerencias
        acciones={
          <>
            {conEvidencia.length > 0 && (
              <button type="button" onClick={() => setVerLista((v) => !v)} className={verLista ? BOTON_DE_HERRAMIENTA_ACTIVO : BOTON_DE_HERRAMIENTA}>
                {verLista ? "Ocultar la lista" : "Revisar una por una"}
              </button>
            )}
            <BotonUsarTodas items={todas} lugar="escala" />
          </>
        }
      >
        El agente sugiere {partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}` : partes[0]} en La escala. Las por explorar son el aro punteado del radar. Nada se confirma solo.
      </FranjaDeSugerencias>
      {verLista && (
        <ul className="space-y-1.5">
          {conEvidencia.map((it) => (
            <FilaSugerida key={it.id} item={it} destino={dondeCae(it.destino, escala)} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── 3 · Dónde está hoy: las áreas se eligen y se ven en el mismo radar ───────

/**
 * El color de cada área cuando se ven juntas (cuarta vuelta, 2026-11-08). Hex: el radar va sobre blanco, como en la página
 * del cliente. Ninguno es el de un nivel (rojo, ámbar, verde, azul claro, violeta): el color dice el área, el punto del
 * nivel dice el nivel.
 */
const COLOR_DEL_AREA: Record<string, string> = { "1": "#0b58d3", "2": "#db2777", "3": "#0d9488" };
const colorDelArea = (id: string) => COLOR_DEL_AREA[id] ?? "#475569";

/** El chequeo de UN área con lo que dibuja el mapa, esté o no en juego. */
const calculoDelArea = (escala: EscalaDelLienzo, area: AreaDelLienzo, posiciones: Readonly<Record<string, PosicionEnElMapa>>): AreaDelChequeo | undefined =>
  chequeoDelMapa(escala, [area.id], posiciones).areas[0];

const tieneAlgo = (area: AreaDelLienzo, posiciones: Readonly<Record<string, PosicionEnElMapa>>) => area.dimensiones.some((d) => d.aplica && posiciones[d.id]);

/**
 * Cómo se ve un área presionada (sexta vuelta, 8 nov; Elías: «casi no se nota»): borde de 2 px y fondo tintado con el
 * color del área, y una sombra interior que la hunde. La suelta queda apenas levantada (`shadow-sm`). El tinte se mezcla
 * con `--surface`, así que flipea con el tema.
 */
/* Elegida se nota de lejos (8 nov, Elías: «todavía debería notarse más cuáles están seleccionados»): fondo con su color,
   borde de su color y la marca ✓; la no elegida lleva el círculo vacío en el mismo lugar, así que no cambia de tamaño. */
const presionada = (color: string): CSSProperties => ({
  borderColor: color,
  background: `color-mix(in srgb, ${color} 16%, var(--surface))`,
  boxShadow: `inset 0 2px 5px color-mix(in srgb, ${color} 28%, transparent)`,
});

function MarcaDeElegida({ elegida, color }: { elegida: boolean; color: string }) {
  return elegida ? (
    <span className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full" style={{ background: color }} aria-hidden="true">
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 6.3 5 8.7 9.5 3.5" />
      </svg>
    </span>
  ) : (
    <span className="h-[18px] w-[18px] flex-shrink-0 rounded-full border-[1.5px] border-line bg-surface" aria-hidden="true" />
  );
}

/** Un área como botón que se presiona: su nivel y cuánto tiene con evidencia, o que está fuera. */
function BotonDeArea({ area, elegida, orden, onElegir }: { area: AreaDelLienzo; elegida: boolean; orden: number; onElegir: () => void }) {
  const { mapa, escala, nombreDeNivel, lugar } = useLienzo();
  const conAlgo = tieneAlgo(area, mapa.posiciones);
  const calculo = orden > 0 || conAlgo ? calculoDelArea(escala, area, mapa.posiciones) : undefined;
  const cuenta = calculo ? cuentaDelArea(calculo, mapa.posiciones) : null;
  const todo = !!cuenta && cuenta.hipotesis === 0 && cuenta.sinDato === 0;
  const color = colorDelArea(area.id);
  return (
    <button
      type="button"
      aria-pressed={elegida}
      onClick={onElegir}
      className={cn(
        "flex flex-col items-stretch gap-1 rounded-xl text-left transition-[background-color,border-color,box-shadow] duration-150",
        // Con el borde de 2 px, un píxel menos de relleno: el botón no cambia de tamaño al presionarlo.
        elegida
          ? "border-2 px-[13px] py-[11px]"
          : calculo
            ? "border border-line bg-surface px-3.5 py-3 shadow-sm hover:bg-surface-hover"
            : "border border-dashed border-line bg-surface-muted px-3.5 py-3 hover:bg-surface-hover",
      )}
      style={elegida ? presionada(color) : undefined}
    >
      <span className="flex items-center justify-between gap-1.5">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
          <MarcaDeElegida elegida={elegida} color={color} />
          {area.nombre}
        </span>
        {orden > 0 ? (
          <span className="text-[11px] tabular-nums text-fg-muted">{orden}.º en juego</span>
        ) : conAlgo ? (
          <span className="text-[11px] text-fg-muted">salió en las reuniones</span>
        ) : null}
      </span>
      {calculo ? (
        <>
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
            {calculo.nivel ? (
              <>
                <span className={cn("h-2 w-2 rounded-full", PUNTO_DE_NIVEL[calculo.nivel])} aria-hidden="true" />
                {nombreDeNivel(calculo.nivel)}
                {calculo.puntaje !== null && <span className="text-xs tabular-nums text-fg-muted">{Math.round(calculo.puntaje)}/100</span>}
                <span className={cn("text-[11px] font-semibold", todo ? "text-success-ink" : "text-warn-ink")}>{todo ? "con evidencia" : "parece"}</span>
              </>
            ) : (
              <span className="text-fg-muted">Sin ubicar todavía</span>
            )}
          </span>
          {cuenta && (
            <span className="text-xs text-fg-muted">{fraseDeLaCuenta(cuenta)}</span>
          )}
        </>
      ) : (
        <>
          <span className="text-[13px] text-fg-muted">Fuera {DEL_LUGAR[lugar]}</span>
          <span className="text-xs text-fg-muted">Sin nada de las reuniones todavía</span>
        </>
      )}
    </button>
  );
}

/** Lo que el radar le pasa a `RadarDeUnaEmpresa` de un área: sus dimensiones con lo que dibuja el mapa. */
function dimensionesDelRadar(area: AreaDelLienzo, calculo: AreaDelChequeo, posiciones: Readonly<Record<string, PosicionEnElMapa>>) {
  const aplican = new Set(area.dimensiones.filter((d) => d.aplica).map((d) => d.id));
  return calculo.dimensiones
    .filter((d) => aplican.has(d.id))
    .map((d) => {
      const p = posiciones[d.id];
      return {
        clave: d.id,
        nombre: d.nombre,
        capa: d.capa,
        preguntada: !!p,
        sinMedir: true,
        nivel: d.nivel,
        noLoSe: !!p?.noSabe,
        porExplorar: p?.clase === "hipotesis",
        puntaje: d.puntaje,
      };
    });
}

/** Lo que dura la animación de un área que entra o sale (radar-de-una-empresa.css), con un margen. */
const MS_DE_LA_ANIMACION = 400;

/**
 * Las áreas del radar con su `fase` mientras se animan: la recién sumada «entra», la recién sacada «sale» (se sigue
 * dibujando, con su último dibujo, hasta que termina) y las demás quietas (lib/escala/areas-superpuestas.ts ›
 * `areasAlCambiar`). Lo de antes se guarda en estado (no en un ref) y se compara al dibujar, como pide React.
 */
function useAreasConFase(ahora: readonly AreaSuperpuesta[]): AreaSuperpuesta[] {
  const firma = JSON.stringify(ahora);
  const [antes, setAntes] = useState({ firma, areas: ahora });
  const [cambio, setCambio] = useState<CambioDeAreas<AreaSuperpuesta>>(SIN_CAMBIO);
  if (antes.firma !== firma) {
    setAntes({ firma, areas: ahora });
    const nombres = (xs: readonly AreaSuperpuesta[]) => xs.map((a) => a.area).join("|");
    if (nombres(antes.areas) !== nombres(ahora)) setCambio(areasAlCambiar(antes.areas, ahora, cambio));
  }
  useEffect(() => {
    if (!cambio.entran.length && !cambio.salen.length) return;
    const t = window.setTimeout(() => setCambio(SIN_CAMBIO), MS_DE_LA_ANIMACION);
    return () => window.clearTimeout(t);
  }, [cambio]);
  return [...cambio.salen.map((a): AreaSuperpuesta => ({ ...a, fase: "sale" })), ...ahora.map((a): AreaSuperpuesta => (cambio.entran.includes(a.area) ? { ...a, fase: "entra" } : a))];
}

/**
 * El radar del diagnóstico de rendimiento (`RadarDeUnaEmpresa`, el mismo componente de la página del cliente) con lo que
 * dibuja el mapa: el área principal con sus nombres y, encima, las otras áreas elegidas, cada una de su color. Una
 * hipótesis va con aro punteado («por explorar»); lo que no tiene nada, con el eje punteado («Sin medir»). Al pasar el
 * cursor por una dimensión sale su tarjeta (TarjetaDelRadar.tsx), con una sección por área si hay varias en ese eje;
 * tocarla abre su detalle. Sumar o sacar un área no vuelve a dibujar el radar desde cero: solo esa entra o sale.
 */
function RadarDeLasAreas({ principal, otras, onElegir }: { principal: AreaDelLienzo; otras: readonly AreaDelLienzo[]; onElegir: (id: string) => void }) {
  const { mapa, escala } = useLienzo();
  const calculo = calculoDelArea(escala, principal, mapa.posiciones);
  const dibujadas = [principal, ...otras];
  // Lo que muestra la tarjeta de cada dimensión dibujada, de cualquiera de las áreas, y cada área como la dibuja el radar.
  const tarjetas: Record<string, DimensionDeLaTarjeta> = {};
  const areas: AreaSuperpuesta[] = [];
  for (const a of calculo ? dibujadas : []) {
    const c = a.id === principal.id ? calculo : calculoDelArea(escala, a, mapa.posiciones);
    if (!c) continue;
    const color = colorDelArea(a.id);
    for (const d of c.dimensiones) {
      const dl = a.dimensiones.find((x) => x.id === d.id);
      if (!dl?.aplica) continue;
      const p = mapa.posiciones[d.id];
      tarjetas[d.id] = { id: d.id, nombre: d.nombre, area: a.nombre, color, nivel: d.nivel, puntaje: d.puntaje, clase: p?.clase ?? null, porQue: p?.porQue ?? null, pregunta: dl.pregunta };
    }
    areas.push({ area: a.nombre, color, dimensiones: dimensionesDelRadar(a, c, mapa.posiciones) });
  }
  // Con la principal adentro: si la sacan, se va como las demás.
  const conFase = useAreasConFase(areas);
  if (!calculo) return null;
  /* Cada área que puede ser la principal, para que el radar se dibuje en la caja que las abarca a todas: elegir otro equipo
     no le cambia el alto (8 nov, Elías: «la altura sube porque hay más contenido o menos»). */
  const frenoDe = (c: AreaDelChequeo) => {
    const fr = loQueLaFrena(c);
    return fr?.dimensiones[0] && c.objetivo ? { clave: fr.dimensiones[0], objetivo: c.objetivo } : null;
  };
  const todasLasAreas = escala.areas.flatMap((a) => {
    const c = a.id === principal.id ? calculo : calculoDelArea(escala, a, mapa.posiciones);
    return c ? [{ dimensiones: dimensionesDelRadar(a, c, mapa.posiciones), frena: frenoDe(c) }] : [];
  });
  const nombreDeCapa = (c: ClaveDeCapa) => escala.capas.find((x) => x.clave === c)?.nombre ?? c;
  const dimsDeLaPrincipal = areas[0]?.dimensiones ?? [];
  const superpuestas = conFase.filter((a) => a.area !== principal.nombre);
  const elegirDesde = (e: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => {
    const id = (e.target as Element).closest("[data-d]")?.getAttribute("data-d");
    if (id && tarjetas[id]) onElegir(id);
  };
  return (
    <ConTarjetas dimensiones={tarjetas} porEje={partesPorEje(dimsDeLaPrincipal, superpuestas)} principal={principal.id}>
      {/* El radar es SVG estático (sin JavaScript propio): el clic se lee del `data-d` del nodo, la porción o el nombre.
          El foco y el rol de botón los tiene cada nodo del SVG. */}
      <div
        className="rounded-xl border border-line p-4"
        style={{ background: "#ffffff" }}
        onClick={elegirDesde}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") elegirDesde(e);
        }}
      >
        {/* Como mucho del ancho que tiene en la página del resultado: en una pantalla grande el radar crecía y sus rótulos
            (y con ellos la tarjeta) quedaban más lejos de los vértices que allá. */}
        <div className="mx-auto max-w-[1340px]">
          {/* Cada área siempre de su color, también sola: al sacar las demás, la que queda no cambia de color. */}
          <RadarDeUnaEmpresa
            area={principal.nombre}
            dimensiones={dimsDeLaPrincipal}
            capas={(["base", "produccion"] as const).map((c) => ({ clave: c, nombre: nombreDeCapa(c), nivel: calculo.capas[c].nivel, puntaje: calculo.capas[c].puntaje }))}
            niveles={escala.niveles}
            resultado={{ nivel: calculo.nivel, puntaje: calculo.puntaje }}
            frena={frenoDe(calculo)}
            color={colorDelArea(principal.id)}
            otras={superpuestas}
            todasLasAreas={todasLasAreas}
          />
        </div>
      </div>
    </ConTarjetas>
  );
}

/** «pagina»: como lo ve el cliente, editable (la de entrada); «nodos»: comparar áreas en el radar. */
type Vista = "pagina" | "nodos";
const NOMBRE_DE_LA_VISTA: Record<Vista, string> = { pagina: "Como lo ve el cliente", nodos: "Comparar áreas" };

/**
 * El área principal (la de los nombres y el detalle): su nivel, el radar con las otras elegidas encima y la dimensión
 * abierta. Lo que la frena va debajo, con los otros equipos (`LoQueFrenaACadaEquipo`).
 */
function AreaConAlgo({
  area,
  otras,
  enJuego,
  abierta: abiertaId,
  onAbrir,
  onAlternar,
}: {
  area: AreaDelLienzo;
  otras: readonly AreaDelLienzo[];
  enJuego: boolean;
  abierta: string | null;
  onAbrir: (id: string | null) => void;
  onAlternar: () => void;
}) {
  const { mapa, escala, nombreDeNivel, puedeEditar, guardando, lugar } = useLienzo();
  const calculo = calculoDelArea(escala, area, mapa.posiciones);
  if (!calculo) return null;
  const cuenta = cuentaDelArea(calculo, mapa.posiciones);
  const todoConEvidencia = cuenta.hipotesis === 0 && cuenta.sinDato === 0;
  const verbo = todoConEvidencia ? "está en" : "parece estar en";
  const aplican = area.dimensiones.filter((d) => d.aplica).length;
  const abierta = abiertaId ? area.dimensiones.find((d) => d.id === abiertaId) : null;

  return (
    <div data-recorrido="preventa.escala.mapa" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-fg">
            {/* El cuadro del color siempre, también sola: que aparezca al sumar otra área corría el título. */}
            <span className="h-3 w-3 rounded-[3px]" style={{ background: colorDelArea(area.id) }} aria-hidden="true" />
            {area.nombre}
            {calculo.nivel ? (
              <>
                <span className="font-normal text-fg-secondary">{verbo}</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", PUNTO_DE_NIVEL[calculo.nivel])} aria-hidden="true" />
                  {nombreDeNivel(calculo.nivel)}
                </span>
                {calculo.puntaje !== null && <span className="text-sm font-normal tabular-nums text-fg-muted">{Math.round(calculo.puntaje)}/100</span>}
              </>
            ) : (
              <span className="font-normal text-fg-muted">todavía sin ubicar</span>
            )}
          </p>
          <p className="text-xs text-fg-muted">
            {fraseDeLaCuenta(cuenta, aplican)}
            {!enJuego && ` · no está en juego ${DEL_LUGAR[lugar]}`}
          </p>
        </div>
        {puedeEditar && (
          <button type="button" disabled={guardando} onClick={onAlternar} className="px-1.5 py-1 text-xs font-semibold text-fg-muted hover:text-fg hover:underline">
            {enJuego ? `Sacar ${area.nombre} ${DEL_LUGAR[lugar]}` : `Sumar ${area.nombre} ${AL_LUGAR[lugar]}`}
          </button>
        )}
      </div>

      {/* «Por qué está ahí» bajó a «Lo que más frena a cada equipo», debajo del radar y de los tres equipos (novena vuelta):
          arriba del radar no queda nada que cambie de alto al elegir o soltar un área. */}
      <figure className="m-0 flex flex-col gap-2">
        {/* Sin `key`: sumar, sacar o cambiar la principal actualiza el radar sin volver a montarlo (antes la animación de
            entrada arrancaba de cero en cada clic, 8 nov). */}
        <RadarDeLasAreas principal={area} otras={otras} onElegir={onAbrir} />
        {/* Siempre el mismo texto (novena vuelta): «Encima, Marketing…» le sumaba un renglón al elegir Marketing y corría lo
            de abajo. Qué áreas se ven lo dice la leyenda, en su renglón fijo. */}
        <figcaption className="text-xs text-fg-muted">
          Pasa el cursor por una dimensión para ver cómo está en cada área elegida y qué preguntar; tócala para ver sus cinco niveles. «Ver puntajes» muestra el puntaje de cada una.
        </figcaption>
      </figure>

      {abierta && <DetalleDeDimension key={abierta.id} d={abierta} onCerrar={() => onAbrir(null)} />}
    </div>
  );
}

/**
 * Lo que más frena a cada equipo y el puente a «Casos de uso» (novena vuelta, 8 nov, Elías: «piensa en lo que necesita
 * ver una persona que haya explorado: dónde se posiciona el cliente en todas las escalas, en los departamentos, y cómo
 * eso se traduce en casos de uso»). Antes era «Por qué está ahí», arriba del radar y solo de la principal. Ahora va
 * debajo, con un renglón por equipo en juego o con algo (`areasDelResumen`): no depende de cuáles están elegidos, así
 * que elegir o soltar un área no lo cambia de alto.
 */
/** Los equipos que se resumen debajo del radar: UNA regla para los dos bloques (en juego o con algo, elegidos o no). */
function useAreasDelResumen(): AreaDelLienzo[] {
  const { exp, escala, mapa } = useLienzo();
  return areasDelResumen(escala.areas, exp.estado.areas, (a) => tieneAlgo(a, mapa.posiciones));
}

function LoQueFrenaACadaEquipo() {
  const { exp, escala, mapa, nombreDeNivel, lugar, irA } = useLienzo();
  const areas = useAreasDelResumen();
  if (!areas.length) return null;
  const nombreDeCapa = (c: string) => escala.capas.find((x) => x.clave === c)?.nombre ?? c;
  return (
    <section aria-label="Lo que más frena a cada equipo" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-col gap-0.5">
        <h4 className="text-sm font-semibold text-fg">Lo que más frena a cada equipo</h4>
        <p className="text-xs text-fg-muted">La escala ubica a cada equipo en su capa más baja: subir lo que lo frena es lo que lo mueve.</p>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {areas.map((area) => {
          const calculo = calculoDelArea(escala, area, mapa.posiciones);
          if (!calculo) return null;
          const frena = loQueLaFrena(calculo);
          const cuenta = cuentaDelArea(calculo, mapa.posiciones);
          const orden = exp.estado.areas.indexOf(area.id) + 1;
          const dims = frena?.dimensiones.map((id) => area.dimensiones.find((d) => d.id === id)).filter((d): d is DimensionDelLienzo => !!d) ?? [];
          return (
            <li key={area.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:gap-4">
              <span className="inline-flex flex-shrink-0 items-center gap-2 text-sm font-semibold text-fg sm:w-[240px]">
                <span className="h-3 w-3 flex-shrink-0 rounded-[3px]" style={{ background: colorDelArea(area.id) }} aria-hidden="true" />
                {area.nombre}
                {calculo.nivel ? (
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <span className={cn("h-2 w-2 rounded-full", PUNTO_DE_NIVEL[calculo.nivel])} aria-hidden="true" />
                    {nombreDeNivel(calculo.nivel)}
                    {calculo.puntaje !== null && <span className="text-xs font-normal tabular-nums text-fg-muted">{Math.round(calculo.puntaje)}/100</span>}
                  </span>
                ) : (
                  <span className="text-xs font-normal text-fg-muted">sin ubicar</span>
                )}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] leading-[1.45] text-fg-secondary">
                  {fraseDelFreno({
                    conNivel: !!calculo.nivel,
                    frena: frena ? { nombres: dims.map((d) => d.nombre), nivel: nombreDeNivel(frena.nivel), capa: nombreDeCapa(frena.capa) } : null,
                    faltan: calculo.faltan.length,
                  })}
                </span>
                {/* Lo que decían los botones de las áreas (8 nov: en «Como lo ve el cliente» no hay botones). */}
                <span className="text-xs text-fg-muted">
                  {fraseDeLaCuenta(cuenta)}
                  {orden > 0 ? ` · ${orden}.º en juego` : " · salió en las reuniones"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {lugar === "preventa" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info-line bg-info-surface px-3 py-2.5">
          <p className="flex items-start gap-2 text-[13px] leading-[1.45] text-fg">
            <IconoDeSugerencia className="mt-0.5 h-[15px] w-[15px] flex-shrink-0 text-brand" />
            Los casos de uso salen de aquí: lo que se le puede proponer según dónde está cada equipo y lo que lo frena.
          </p>
          <Button size="sm" variant="primary" onClick={() => irA("casos")}>
            Ver los casos de uso →
          </Button>
        </div>
      )}
    </section>
  );
}

const MAX_HIPOTESIS_A_LA_VISTA = 4;

/**
 * «Para explorar más esta área» (cuarta vuelta, 2026-11-08): una sugerencia por cada equipo en juego o con algo que tiene
 * hipótesis o partes sin dato, ordenadas por hipótesis (Elías: «entre más hipótesis tiene un área, más se puede
 * explorar»). Desde la novena vuelta no depende de las áreas elegidas en el radar. Cada hipótesis con su primera pregunta
 * y «Llevar a la sesión N». La lectura «Preparación para engagement avanzado» (antes un bloque fijo debajo de «Con qué se
 * mide») vive en la de Marketing: es una lectura de Marketing.
 */
function ParaExplorarMas() {
  const { escala, mapa, exp, nombreDeNivel } = useLienzo();
  const cuentas = useAreasDeLaEscala();
  const llevar = useLlevarALaSesion();
  /* Los equipos en juego o con algo, elegidos o no (novena vuelta): elegir Marketing hacía entrar su tarjeta, a veces
     ANTES de la de Ventas (van por hipótesis), y corría lo de abajo. */
  const deLaLista = useAreasDelResumen();
  const ids = new Set(deLaLista.map((a) => a.id));
  const enOrden = ordenParaExplorar(cuentas.filter((c) => ids.has(c.id)));
  // Marketing (en juego o con algo) sin nada que explorar igual muestra su lectura de engagement.
  const conEngagement = !!escala.preparacion && ids.has(AREA_DEL_ENGAGEMENT);
  const lista = conEngagement && !enOrden.some((c) => c.id === AREA_DEL_ENGAGEMENT) ? [...enOrden, ...cuentas.filter((c) => c.id === AREA_DEL_ENGAGEMENT)] : enOrden;
  const tarjetas = exp.estado.propuesta.tarjetasDeLaEscala?.porDimension ?? {};
  /* Cada tarjeta entra creciendo y sale plegándose en su lugar: sumar o sacar un área no hace saltar la página (8 nov).
     La que sale se dibuja con lo de siempre (ya no está elegida, pero sus datos siguen). */
  return (
    <ListaQueSeAnima ids={lista.map((c) => c.id)} espacio={3} etiqueta="Para explorar más">
      {(id) => {
        const c = cuentas.find((x) => x.id === id);
        const area = escala.areas.find((a) => a.id === id);
        if (!c || !area) return null;
        const { hipotesis, sinDato } = partesParaExplorar(area.dimensiones, (id) => mapa.posiciones[id]?.clase ?? null);
        const nHip = hipotesis.length;
        return (
          <div key={c.id} className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colorDelArea(c.id) }} aria-hidden="true" />
                Para explorar más {area.nombre}
              </h4>
              <span className="text-xs text-fg-muted">
                {nHip} {nHip === 1 ? "hipótesis" : "hipótesis"} por confirmar{sinDato.length ? ` · ${sinDato.length} sin dato` : ""}
              </span>
            </div>
            {hipotesis.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {hipotesis.slice(0, MAX_HIPOTESIS_A_LA_VISTA).map((d) => {
                  const p = mapa.posiciones[d.id];
                  const pregunta = tarjetas[d.id]?.preguntas[0] ?? d.pregunta;
                  return (
                    <li key={d.id} className="flex flex-col gap-1">
                      <span className="text-[13px] text-fg-secondary">
                        <span className="tabular-nums text-fg-muted">{d.id}</span> <span className="font-semibold text-fg">{d.nombre}</span>
                        {p && <span className="text-warn-ink"> · ○ {nombreDeNivel(p.nivel)}, por explorar</span>}
                      </span>
                      <ul>
                        <PreguntaParaLlevar pregunta={pregunta} dimensionId={d.id} llevar={llevar} />
                      </ul>
                    </li>
                  );
                })}
                {hipotesis.length > MAX_HIPOTESIS_A_LA_VISTA && (
                  <li className="text-xs text-fg-muted">
                    Y {hipotesis.length - MAX_HIPOTESIS_A_LA_VISTA} más: pasa el cursor por su nodo en el radar para ver qué preguntar.
                  </li>
                )}
              </ul>
            )}
            {sinDato.length > 0 && (
              <p className="text-xs text-fg-muted">Sin dato todavía: {enLista(sinDato.map((d) => d.nombre))}.</p>
            )}
            {c.id === AREA_DEL_ENGAGEMENT && !!escala.preparacion && (
              <details className="group rounded-lg border border-line">
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-fg-secondary hover:text-fg">Preparación para engagement avanzado</summary>
                <div className="px-1 pb-1">
                  <PreparacionParaEngagement />
                </div>
              </details>
            )}
          </div>
        );
      }}
    </ListaQueSeAnima>
  );
}

/** El área cuya lectura es «Preparación para engagement avanzado» (lib/escala/preparacion.ts lee el nivel de Marketing). */
const AREA_DEL_ENGAGEMENT = "2";

function DondeEstaHoy() {
  const { exp, escala, mapa, cambiar, nombreDeNivel, lugar, puedeEditar, guardando } = useLienzo();
  const enJuego = exp.estado.areas;
  const [vista, setVista] = useState<Vista>("pagina");
  const [abierta, setAbierta] = useState<string | null>(null);
  const areas = useAreasDeLaEscala();
  // De entrada, la más explorada: la que tiene más con evidencia; si no, la primera en juego.
  const masExplorada = [...areas].sort((a, b) => b.conEvidencia - a.conEvidencia || b.sesiones - a.sesiones)[0];
  const deEntrada =
    (masExplorada && masExplorada.conEvidencia > 0 ? masExplorada.id : undefined) ?? escala.areas.find((a) => enJuego.includes(a.id))?.id ?? escala.areas[0]?.id;
  /* Las áreas presionadas, en el orden en que se eligieron (cuarta vuelta, Elías: «un clic en un área la deja presionada
     y la muestra en la escala; se pueden elegir varias»). La principal (la que tiene los nombres y el detalle) es la
     última elegida con algo dibujado. */
  /* La elección sobrevive a recargar (novena vuelta: volvía a una sola), en ESTE navegador y por exploración
     (lib/escala/eleccion-guardada.ts): es de quien mira, no de la exploración. Gana lo elegido en esta visita; si no,
     lo guardado; si no, la de entrada. Lo guardado se lee con `useSyncExternalStore`: el servidor no tiene el navegador
     (da `null`) y React no confunde el HTML del servidor con el de la pantalla. */
  const [enEstaVisita, setEnEstaVisita] = useState<EleccionDeAreas | null>(null);
  const clave = claveDeLaEleccion(lugar, exp.id);
  const texto = useSyncExternalStore(suscribirseALoGuardado, () => textoGuardado(clave), () => null);
  const guardada = leerLaEleccion(texto, escala.areas.map((a) => a.id));
  const actual = enEstaVisita ?? guardada;
  const principalId = actual?.principalId ?? null;
  const ids = (actual ? actual.elegidas : deEntrada ? [deEntrada] : []).filter((id) => escala.areas.some((a) => a.id === id));
  const fijar = (e: EleccionDeAreas) => {
    setEnEstaVisita({ elegidas: [...e.elegidas], principalId: e.principalId });
    guardarLaEleccion(clave, e);
  };
  const elegidas = ids.map((id) => escala.areas.find((a) => a.id === id)!);
  const conAlgo = (id: string) => {
    const a = escala.areas.find((x) => x.id === id);
    return !!a && (enJuego.includes(id) || tieneAlgo(a, mapa.posiciones));
  };
  /* La principal (la de los nombres, el centro y el detalle) se queda al sumar otra área: la nueva entra encima y solo
     cambia el radar (8 nov, Elías: «solo actualice la escala»). Cambia al tocar un nodo de otra área o al sacar la
     principal (pasa a la última elegida con algo). Cada elegida sin nada se muestra con «Sumar…», debajo del radar
     (lib/escala/areas-superpuestas.ts › `principalYFuera`). */
  const eleccion = { elegidas: ids, principalId };
  const visto = principalYFuera(eleccion, conAlgo);
  const principal = elegidas.find((a) => a.id === visto.principal) ?? null;
  const fuera = elegidas.filter((a) => visto.fuera.includes(a.id));
  // Se pueden soltar todas (novena vuelta): sin ninguna, no hay radar y arriba se pide elegir un departamento.
  const ninguna = sinNingunaElegida(eleccion);
  const otras = principal ? elegidas.filter((a) => a.id !== principal.id && conAlgo(a.id) && calculoDelArea(escala, a, mapa.posiciones)) : [];
  const orden = (id: string) => enJuego.indexOf(id) + 1;
  const elegir = (id: string) => {
    const area = escala.areas.find((a) => a.id === id);
    if (!area) return;
    const nueva = alTocarUnArea(eleccion, id, conAlgo);
    fijar(nueva);
    // La dimensión abierta se cierra solo si era del área que sale.
    if (!nueva.elegidas.includes(id) && abierta && area.dimensiones.some((d) => d.id === abierta)) setAbierta(null);
  };
  // Tocar una dimensión de otra área la vuelve la principal y abre su detalle.
  const abrir = (id: string | null) => {
    if (id && principal && !principal.dimensiones.some((d) => d.id === id)) {
      const de = elegidas.find((a) => a.dimensiones.some((d) => d.id === id));
      if (de) fijar(alTocarUnNodo(eleccion, de.id));
    }
    setAbierta(id);
  };
  // Sumar o sacar se deshace con el mismo botón: la lista entera, en el orden en que se eligieron.
  const alternar = (id: string) => void cambiar([{ op: "areas", areas: enJuego.includes(id) ? enJuego.filter((a) => a !== id) : [...enJuego, id] }]);
  /* Solo cuando NINGUNA elegida tiene algo: ocupan el lugar del radar. Con radar, una elegida sin nada se dice en el
     renglón de alto fijo de arriba, con su «Sumar…» (novena vuelta: debajo del radar corría lo de abajo). */
  const avisosDeFuera = (
    <ListaQueSeAnima ids={fuera.map((a) => a.id)} espacio={3}>
      {(id) => {
        const a = escala.areas.find((x) => x.id === id);
        return a ? <AreaFuera area={a} onSumar={() => alternar(a.id)} /> : null;
      }}
    </ListaQueSeAnima>
  );

  return (
    <section aria-label="Dónde está hoy" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-fg">Dónde está hoy</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-fg-muted">
            {lugar === "preventa" ? "Objetivo de la primera venta" : "El objetivo"}: llevar cada área en juego a {nombreDeNivel("F")}
          </span>
          <div role="radiogroup" aria-label="Cómo se ve la escala" className="inline-flex gap-1">
            {(["pagina", "nodos"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={vista === v} onClick={() => setVista(v)} className={vista === v ? BOTON_DE_HERRAMIENTA_ACTIVO : BOTON_DE_HERRAMIENTA}>
                {NOMBRE_DE_LA_VISTA[v]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[13px] leading-[1.5] text-fg-secondary">{resumenDeLoExplorado(areas)}</p>
      {vista === "pagina" ? (
        <PaginaDeLaEscala />
      ) : (
        <>
      <div data-recorrido="preventa.escala.areas" role="group" aria-label="Áreas que se ven en la escala" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {escala.areas.map((a) => (
          <BotonDeArea key={a.id} area={a} elegida={ids.includes(a.id)} orden={orden(a.id)} onElegir={() => elegir(a.id)} />
        ))}
      </div>
      {/* El mismo renglón con o sin áreas elegidas (alto fijo): pedir un departamento no corre lo de abajo más de lo que
          se va con el radar. */}
      <p role="status" className="flex h-5 items-center gap-2 overflow-hidden whitespace-nowrap text-xs leading-5 text-fg-muted">
        {ninguna ? (
          <span className="text-[13px] font-semibold text-brand">Selecciona un departamento para ver dónde está en la escala.</span>
        ) : principal && fuera.length > 0 ? (
          <>
            <span
              className="truncate"
              title={
                lugar === "preventa"
                  ? "Si se habló de ella, «Ubicar con las reuniones» la llena con hipótesis por explorar, aunque no esté en juego."
                  : "Al sumarla, el agente la ubica en la escala con lo que ya sabe."
              }
            >
              {enLista(fuera.map((a) => a.nombre))} todavía no {fuera.length === 1 ? "tiene" : "tienen"} nada de las reuniones: no se dibuja.
            </span>
            {puedeEditar &&
              fuera.map((a) => (
                <button key={a.id} type="button" disabled={guardando} onClick={() => alternar(a.id)} className="flex-shrink-0 font-semibold text-brand hover:underline disabled:opacity-60">
                  Sumar {a.nombre} {AL_LUGAR[lugar]}
                </button>
              ))}
          </>
        ) : (
          "Toca un área para sumarla a la escala o sacarla: varias se ven en el mismo radar, cada una de su color."
        )}
      </p>
      {ninguna ? null : principal ? (
        <AreaConAlgo
          area={principal}
          otras={otras}
          enJuego={enJuego.includes(principal.id)}
          abierta={abierta}
          onAbrir={abrir}
          onAlternar={() => alternar(principal.id)}
        />
      ) : (
        avisosDeFuera
      )}
        </>
      )}
      <LoQueFrenaACadaEquipo />
      <ParaExplorarMas />
    </section>
  );
}

/** `agente`: el panel del agente de este lugar (en la cuenta, «Actualizar escala»). Sin él, el de la exploración. */
export default function PasoEscala({ agente }: { agente?: ReactNode } = {}) {
  const { exp, lugar } = useLienzo();
  const hayAreas = exp.estado.areas.length > 0;
  // El título y de qué va la pieza los pone el lienzo, como en las demás piezas.
  return (
    <div className="flex flex-col gap-5">
      {lugar !== "proyecto" && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {lugar === "preventa" && <UbicarConLasReuniones />}
          <AccesoALaEscala />
        </div>
      )}
      <SugerenciasDeLaEscala />
      <DondeEstaHoy />
      <ConQueSeMide />
      {hayAreas && (
        <div data-recorrido="preventa.escala.primero">
          <QueVaPrimero />
        </div>
      )}
      {agente ?? <PanelDelAgente modoPrincipal="leer" compacto />}
    </div>
  );
}
