"use client";

/**
 * PasoEscala — dónde parece estar cada equipo en la escala, y por qué.
 *
 * Tercera vuelta (2026-11-08, Elías con Centauro Solutions): «lo importante es que el vendedor VEA la escala, con los
 * nodos y el puntaje, exactamente como se ve en el diagnóstico de rendimiento». En este orden (el del 26 nov, Elías: «la
 * pantalla interna no tiene que explicarse»; quien la abre sabe que Nexus la precargó y que le toca validarla):
 *   1. Arriba de todo, qué falta validar («Faltan 4 de 12 por validar» o «✓ Validado por Marco · 26 nov»), «Validar (N)»
 *      (lo principal: lo propuesto una por una), «Usar todas» y el único botón de la IA, «Actualizar con Nexus»
 *      (`ArribaDelDiagnostico`). Debajo, en la preventa, la LÍNEA de cómo se ubicó la escala, sin botón
 *      (`LineaDeLaUbicacion`). Reemplaza a la franja «El agente sugiere… por explorar… Nada se confirma solo».
 *      Después, «Como lo ve el cliente» / «Comparar áreas» y, a la derecha, «Publicar» y «Acceso».
 *   2. (Hasta el 26 nov: la franja de lo que sugiere el agente, con «Revisar una por una» y «Pasar las N al mapa».)
 *   3. La página (sin el título «Dónde está hoy» desde el 24 nov, ni la frase de lo explorado ni el objetivo: Elías,
 *      «demasiada información»). Un solo vocabulario para cada parte (lib/exploraciones/validar-la-escala.ts): lo que
 *      propuso Nexus, sin rótulo; «✓ validado»; «sin dato». Y debajo, «Para completar el diagnóstico»
 *      (`ParaCompletarElDiagnostico`).
 *      En «Comparar áreas», las tres áreas como botones que se
 *      PRESIONAN (cuarta vuelta, 2026-11-08: «se pueden elegir varias, y se ven en el mismo radar, una sobre otra, cada
 *      una de un color»). Se ven con el RADAR DEL DIAGNÓSTICO (`RadarDeUnaEmpresa`, el mismo de la página del cliente:
 *      nodos, puntaje y nivel en el centro); la principal (la última elegida) lleva los nombres y el detalle, las otras
 *      van encima con su color. Un área con algo se ve aunque no esté en juego. (La rueda, la vista «Mapa», se quitó el 9
 *      nov: Elías pidió sacarla; lo que solo ella mostraba está en DECISIONS.) Al pasar el cursor por una dimensión sale su TARJETA (TarjetaDelRadar.tsx: cómo está y qué
 *      preguntar, con «Llevar a la sesión N»); tocarla abre la dimensión con sus cinco niveles.
 *      Debajo, «Para completar el diagnóstico» (24 nov: junta «Lo que más frena a cada equipo», con el puente a «Casos de
 *      uso», y «Para explorar más», ordenados por hipótesis, con la lectura «Preparación para engagement avanzado» en
 *      Marketing; cada pregunta, con «Responder con Nexus» en la preventa). Novena vuelta (8 nov): lo de debajo del radar
 *      no depende de las áreas elegidas (elegir Marketing ya no corre nada), se pueden soltar todas («Selecciona un
 *      departamento») y se fue «De dónde sale cada nivel» (Elías: «me parece irrelevante»).
 *   4. Con qué se mide, qué va primero y el agente, al pie.
 * Se fue «Qué explorar en la próxima sesión»: la guía ya elige primero lo que no tiene evidencia, y cada dimensión
 * conserva «Explorarla a fondo».
 *
 * LA PÁGINA DEL CLIENTE, EDITABLE (8 nov; Elías: «la página de resultados debe verse igual externo que interno, pero
 * interno debe funcionar como un artefacto que se puede editar»): la escala abre en «Como lo ve el cliente»
 * (PaginaDeLaEscala.tsx): la misma página pública, con los mismos datos, donde se edita en su lugar la descripción, lo que
 * dice cada tarjeta y el nivel de cada parte (arrastrándolo en el radar). La vista de antes sigue entera al lado:
 * «Comparar áreas» (el selector con ✓, las áreas superpuestas, las hipótesis sugeridas dibujadas y la tarjeta con
 * «Llevar a la sesión N»). Lo de debajo («Para completar el diagnóstico») es de las dos. Desde el 9 nov la
 * página abre en su pestaña «Resumen» (la portada que presenta el vendedor) y no hay botón «Qué ve el cliente»: qué
 * equipos ve se elige en «Acceso».
 *
 * ESCALA ÚNICA (2026-10-28): la misma pieza es La cuenta › La escala de la ficha del cliente (`lugar = "cuenta"`). Ahí
 * no va «Explorarla a fondo» (la cuenta no tiene sesiones), y el agente es el de la ficha (`agente`: «Actualizar
 * escala»), no «Ubicar con las reuniones». «Acceso» (30 oct, cuenta y preventa): el enlace con que el cliente la ve y
 * qué equipos ve (AccesoALaEscala.tsx).
 */
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Button, Segmentado, Selector, useToast } from "@/components/ui";
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
import type { AreaDelLienzo, DimensionDelLienzo, EscalaDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import { fraseDelFreno, ordenParaExplorar, partesParaExplorar } from "@/lib/exploraciones/equipos-de-la-escala";
import { abrirNexusEnLaPreventa } from "@/lib/exploraciones/abrir-nexus";
import { lasNotasNuevas, leidoHasta, respuestaDe, ultimaUbicacion } from "@/lib/exploraciones/completar-el-diagnostico";
import { cuantoLleva } from "@/lib/exploraciones/corrida-del-resumen";
import { diaCorto } from "@/lib/exploraciones/fechas";
import { chequeoDelMapa, loQueLaFrena, type PosicionEnElMapa } from "@/lib/exploraciones/mapa";
import { cortadasQueSeLeenEnteras, lineaDeLaEscala, marcasQueCambiaron, type LineaDeLaEscala } from "@/lib/exploraciones/linea-de-la-escala";
import {
  cuentaDeLaValidacion,
  enlaceDeLoSinDato,
  estadoDeLaParte,
  franjaDeArriba,
  fraseDeLaValidacion,
  lineaDeLaValidacion,
  paraValidar,
  partesQueCuentan,
  porQueQuedoAtras,
  queHaceActualizar,
  rotuloDeLaParte,
  validacionDelArea,
  validadoDespues,
} from "@/lib/exploraciones/validar-la-escala";
import { useMe } from "@/hooks/useMe";
import AccesoALaEscala from "./AccesoALaEscala";
import PublicarLaEscala from "./PublicarLaEscala";
import ListaQueSeAnima from "./ListaQueSeAnima";
import { AL_LUGAR, DEL_LUGAR, useLienzo } from "./contexto";
import { IconoDeSugerencia } from "./FranjaDeSugerencias";
import { ConQueSeMide } from "./Identificacion";
import PanelDelAgente from "./PanelDelAgente";
import { piezaDelDestino } from "./piezas";
import { BotonUsarTodas } from "./Propuestas";
import ValidarLaEscala from "./ValidarLaEscala";
import { useResumenEnCurso } from "./useResumenEnCurso";
import { useResumenEnLaPagina } from "./useResumenEnLaPagina";
import PreparacionParaEngagement from "./PreparacionParaEngagement";
import { QueVaPrimero } from "./QueVaPrimero";
import { useAreasDeLaEscala } from "./useAreasDeLaEscala";
import { useSesiones } from "./useSesiones";
import { useUbicarLaEscala } from "./useUbicarLaEscala";
import { ConTarjetas, PreguntaParaLlevar, useLlevarALaSesion, type DimensionDeLaTarjeta } from "./TarjetaDelRadar";
import { DetalleDeDimension } from "./DetalleDeLaDimension";
import PaginaDeLaEscala from "./PaginaDeLaEscala";
import { RanuraDeArriba } from "./ranura-de-arriba";

/** «A», «A y B», «A, B y C». */
const enLista = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** Un área fuera de la preventa: se suma desde su pestaña. Sin la ayuda «Súmala si…» (26 nov: la pantalla no se explica). */
function AreaFuera({ area, onSumar }: { area: AreaDelLienzo; onSumar: () => void }) {
  const { puedeEditar, guardando, lugar } = useLienzo();
  const enLaCuenta = lugar === "cuenta";
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface-muted px-5 py-7 text-center">
      <p className="text-sm font-semibold text-fg">
        {enLaCuenta ? `${area.nombre} no está en juego en la escala de la cuenta` : `Todavía no hay nada de ${area.nombre} en las reuniones`}
      </p>
      {puedeEditar && (
        <Button size="sm" variant="secondary" className="mt-1" disabled={guardando} onClick={onSumar}>
          Sumar {area.nombre} {AL_LUGAR[lugar]}
        </Button>
      )}
    </div>
  );
}

// ── 1 · La línea de la ubicación: si hay algo nuevo que llevar a la escala (solo la preventa) ──

/**
 * UNA línea (24 nov; Elías: «lo único que hay que entender es si alguna parte tiene que actualizarse»): si hay reuniones
 * de después de la última vez que se ubicó la escala (o de que se armó el Resumen). Lo que dice, en
 * lib/exploraciones/linea-de-la-escala.ts. Desde el 26 nov no tiene botón: ubicar (el agente que lee las TRANSCRIPCIONES
 * de las sesiones, modo «posicionar») lo lanza «Actualizar con Nexus», arriba, que lee el estado de esta línea; la línea va
 * debajo de esa cabecera, con el proyecto de contexto. Lo lanza una persona, nunca corre solo ni en cada visita.
 */
function useLineaDeLaUbicacion(): {
  linea: LineaDeLaEscala;
  proyectos: ReturnType<typeof useUbicarLaEscala>["proyectos"];
  contexto: string | null;
  elegir: (id: string | null) => void;
  corriendo: boolean;
  lanzando: boolean;
  ubicar: () => Promise<unknown> | void;
} {
  const { exp } = useLienzo();
  const { pestanas } = useSesiones();
  /* La preventa de un cliente (24 nov) parte de lo que ya sabemos: el botón lo dice mientras no haya sesiones de
     diagnóstico, y se elige el proyecto que se lee como contexto. La elección la comparte el aviso de arriba del Resumen
     (25 nov, `useUbicarLaEscala`): los dos botones lanzan el mismo pedido. */
  const { conLoQueYaSabemos, proyectos, contexto, elegir, ubicar, corriendo, lanzando, ubicando } = useUbicarLaEscala();
  const ultima = ultimaUbicacion(exp.estado.propuesta.corridas);
  const reunionesDeLaLinea = pestanas.flatMap((p) => (p.reunion && !p.noSeHizo ? [{ ...p.reunion, ...(conLoQueYaSabemos && p.sesion?.deLoQueYaSabemos ? { deTrabajo: true as const } : {}) }] : []));
  const linea = lineaDeLaEscala({
    reuniones: reunionesDeLaLinea,
    ubicadaEn: ultima?.en ?? null,
    leyo: ultima?.leyo,
    resumenEn: exp.estado.contenido.resumenDeLaEscala?.at ?? null,
    // Las reuniones largas que ese Resumen leyó cortadas (24 nov): rehacerlo las lee enteras.
    cortadas: cortadasQueSeLeenEnteras(exp.estado.contenido.resumenDeLaEscala),
    // Otro trabajo del agente (leer una reunión, la guía) no ubica la escala: la frase no cambia, solo el botón espera.
    ubicando,
    conLoQueYaSabemos,
    // D4: si cambió la clase de una reunión después de armar el Resumen, «Lo que hicimos» dice la cuenta de antes.
    marcasCambiadas: marcasQueCambiaron(exp.estado.contenido.resumenDeLaEscala?.hicimos.sesiones, reunionesDeLaLinea),
    // Las notas del equipo que «Ubicar» no leyó la última vez (25 nov): una nota puede fijar un nivel.
    notasSinUbicar: lasNotasNuevas({
      notas: exp.estado.contenido.notas,
      autores: exp.estado.contenido.autoresDeLasNotas,
      corridas: exp.estado.propuesta.corridas,
      resumenDesde: null,
      enLaPreventa: true,
    }).sinUbicar,
  });
  return { linea, proyectos, contexto, elegir, corriendo, lanzando, ubicar };
}

/** El proyecto que se lee como contexto al ubicar la escala (antes, al final de la línea de la ubicación). */
function SelectorDelContexto({ u }: { u: ReturnType<typeof useLineaDeLaUbicacion> }) {
  const { puedeEditar } = useLienzo();
  const { proyectos, contexto, elegir, corriendo, lanzando } = u;
  if (!puedeEditar || !proyectos.length) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
      Con el contexto de
      <Selector
        etiqueta="El proyecto que se lee como contexto al ubicar la escala"
        placeholder="Sin un proyecto"
        valor={contexto ?? SIN_PROYECTO}
        disabled={corriendo || lanzando}
        opciones={[...proyectos.map((x) => ({ value: x.id, label: x.nombre })), { value: SIN_PROYECTO, label: "Sin un proyecto", hint: "Solo las reuniones y la memoria" }]}
        onElegir={(v) => elegir(v === SIN_PROYECTO ? null : v)}
      />
    </span>
  );
}

/** El valor de «Sin un proyecto» en el selector del contexto (un id de proyecto nunca empieza así). */
const SIN_PROYECTO = "-sin-proyecto";

/** «Para completar el diagnóstico», debajo de la página: adonde lleva «N sin dato: respóndelas…». */
const ID_DE_PARA_COMPLETAR = "para-completar-el-diagnostico";
const MARCA_AL_LLEGAR = ["ring-2", "ring-brand", "ring-offset-4", "ring-offset-surface-muted"];

/** Baja a «Para completar el diagnóstico» y la marca un momento (27 nov, Elías: «que uno le dé clic y le tire ahí»). */
function irAParaCompletar() {
  const el = document.getElementById(ID_DE_PARA_COMPLETAR);
  if (!el) return;
  const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" });
  el.focus({ preventScroll: true });
  el.classList.add(...MARCA_AL_LLEGAR);
  window.setTimeout(() => el.classList.remove(...MARCA_AL_LLEGAR), 1800);
}

// ── 2 · Arriba del diagnóstico: el estado, lo que sigue y «Actualizar con Nexus» ─────────────────────────────────────

/**
 * Lo que registra el agente de la cuenta (EscalaDeLaCuenta › `AgenteDeLaCuenta`, con su proyecto y su venta de contexto)
 * para que «Actualizar con Nexus» lo lance desde arriba (26 nov): en la cuenta, ubicar es «actualizar» de su ruta.
 */
export interface UbicarDeLaCuenta {
  ubicar: () => void;
  lanzando: boolean;
  corriendo: boolean;
}
export const RegistrarUbicarDeLaCuenta = createContext<((u: UbicarDeLaCuenta | null) => void) | null>(null);

/** La línea de la ubicación que mira «Actualizar con Nexus» (en la cuenta, una armada con lo que registró el agente). */
type LineaQueMira = { estado: LineaDeLaEscala["estado"]; boton: { fuerte: boolean }; texto?: string };

/**
 * «Actualizar con Nexus» (26 nov, Elías: un solo botón de la IA). Reemplaza a «Ubicar con las reuniones» / «Volver a
 * ubicar» / «Actualizar» (la línea de la ubicación), «Actualizar escala» (el agente de la cuenta), y «Armar el Resumen con
 * IA» / «Rehacer con IA» / «Volver a ubicar» del Resumen. Qué hace lo decide `queHaceActualizar`: ubica si hay algo que
 * la escala no leyó; con algo por validar no rehace el Resumen; sin nada por validar, arma o rehace el Resumen si quedó
 * atrás. Sin Resumen y listo para armarlo dice «Generar con Nexus» (27 nov). Nada se confirma ni se publica solo.
 * Devuelve también por qué quedó atrás (`motivo`): la franja amarilla lo dice al lado del botón.
 */
function useActualizarConNexus({
  linea,
  ubicar,
  porValidar,
  validadas,
}: {
  linea: LineaQueMira;
  /** null: en la cuenta, mientras el agente no registró cómo se lanza (no hay botón). */
  ubicar: { ubicar: () => unknown; lanzando: boolean; corriendo: boolean } | null;
  porValidar: number;
  validadas: number;
}) {
  const { exp, puedeEditar, lugar } = useLienzo();
  const toast = useToast();
  const resumen = useResumenEnCurso(exp.id);
  const enLaPagina = useResumenEnLaPagina(exp.id);
  const guardado = exp.estado.contenido.resumenDeLaEscala;
  // Las notas que el Resumen no leyó (las mismas del aviso de arriba del Resumen): rehacerlo las lee.
  const laQueLoArmo = resumen.terminada && resumen.terminada.id === guardado?.agentRunId ? { estado: "DONE", empezo: resumen.terminada.empezo } : null;
  const notasDelResumen = guardado?.at
    ? lasNotasNuevas({
        notas: exp.estado.contenido.notas,
        autores: exp.estado.contenido.autoresDeLasNotas,
        corridas: exp.estado.propuesta.corridas,
        resumenDesde: leidoHasta(guardado.at, laQueLoArmo),
        enLaPreventa: lugar === "preventa",
      }).delResumen.total
    : 0;
  /* La página trae la firma del servidor, pero solo cuando está a la vista: lo validado después de armar el Resumen
     también lo deja atrás (desde «Comparar áreas», la página no se vuelve a pedir). */
  const atrasos = {
    escalaCambio: enLaPagina.escalaCambio,
    formatoViejo: enLaPagina.formatoViejo,
    notas: notasDelResumen,
    validadoDespues: validadoDespues(exp.estado.contenido.chequeo, guardado?.at ?? null),
  };
  const atrasado = atrasos.escalaCambio || atrasos.formatoViejo || atrasos.notas > 0 || atrasos.validadoDespues;
  const que = queHaceActualizar({
    linea,
    porValidar,
    validadas,
    resumen: { hay: !!guardado?.at, corriendo: resumen.corriendo, detenida: !!resumen.corrida?.detenida, atrasado },
  });
  const motivo = porQueQuedoAtras({ detenida: !!resumen.corrida?.detenida, ...atrasos, lineaAtrasada: linea.estado === "resumenAtrasado" ? (linea.texto ?? null) : null });
  const armarElResumen = async () => {
    const r = await resumen.armar();
    if (!r.ok) {
      // Si arrancó y terminó mal, el aviso de arriba del Resumen dice por qué; si ni arrancó, se dice acá.
      if (!r.corrida) toast.error(r.error);
      return;
    }
    const n = r.corrida.descartados.length;
    toast.success(
      `Listo en ${cuantoLleva(r.corrida.empezo, Date.parse(r.corrida.termino ?? new Date().toISOString()))}.${n ? ` ${n === 1 ? "Una cosa no pasó" : `${n} cosas no pasaron`} la verificación: está en el Historial.` : ""}`,
    );
    // Ya estaba corriendo otra (otra pestaña, otra persona): lo que se sumó después de que empezó no entró.
    if (r.ajena) toast.info("Ya se estaba rehaciendo cuando lo pediste: si sumaste algo después, vuelve a pedirlo.");
  };
  const esperando = que.accion === "esperar" || !!ubicar?.lanzando || resumen.lanzando;
  const boton =
    puedeEditar && ubicar ? (
      <Button
        size="sm"
        variant={que.fuerte ? "primary" : "secondary"}
        loading={esperando}
        // Otro trabajo del agente en esta preventa (leer una reunión, la guía): espera a que termine.
        disabled={esperando || (que.accion === "ubicar" && ubicar.corriendo)}
        title={que.queHace}
        onClick={() => void (que.accion === "resumen" ? armarElResumen() : ubicar.ubicar())}
      >
        {esperando ? "Nexus está actualizando…" : !guardado?.at && que.accion === "resumen" ? "Generar con Nexus" : "Actualizar con Nexus"}
      </Button>
    ) : null;
  // Quedó atrás aunque lo que sigue no sea rehacerlo (hay algo por validar): la franja lo dice igual (revisión del 27 nov).
  const quedoAtras = !!guardado?.at && (atrasado || !!resumen.corrida?.detenida || linea.estado === "resumenAtrasado");
  return { que, hayResumen: !!guardado?.at, quedoAtras, motivo, boton };
}

/** Lo que falta validar, para la línea de estado y «Validar (N)». */
function useLoQueFaltaValidar() {
  const { exp, escala, mapa, revisables } = useLienzo();
  const me = useMe();
  const partes = partesQueCuentan(escala.areas, exp.estado.areas, mapa.posiciones);
  const deLaPieza = revisables.filter((it) => piezaDelDestino(it.destino) === "escala");
  const items = paraValidar({ partes, posiciones: mapa.posiciones, revisablesDeLaEscala: deLaPieza });
  const cuenta = cuentaDeLaValidacion({ partes, posiciones: mapa.posiciones, confirmado: exp.estado.contenido.chequeo, pendientes: deLaPieza });
  return { items, cuenta, linea: lineaDeLaValidacion(cuenta, me?.email ?? null) };
}

/**
 * ARRIBA DEL DIAGNÓSTICO. 26 nov: qué falta validar, «Validar (N)» y un solo «Actualizar con Nexus». 27 nov (Elías: «la
 * misma información, mejor ordenada»; diseño «Cabecera del Diagnóstico de rendimiento», v2):
 *   · sin Resumen, un recuadro «Falta generar el diagnóstico» con el botón («Generar con Nexus») y el estado adentro;
 *   · con Resumen, una línea de estado (lo validado, «N sin dato: respóndelas…» que baja a «Para completar el
 *     diagnóstico», cuándo se ubicó y el contexto) y, si hay algo que hacer, una franja con el porqué y el botón al lado
 *     (`franjaDeArriba`); si no, el botón va al final de la línea, sin destacarse.
 */
function ArribaDelDiagnostico({ deLaCuenta }: { deLaCuenta: UbicarDeLaCuenta | null }) {
  const { lugar } = useLienzo();
  return lugar === "preventa" ? <ArribaEnLaPreventa /> : <ArribaEnLaCuenta deLaCuenta={deLaCuenta} />;
}

function ArribaEnLaPreventa() {
  const u = useLineaDeLaUbicacion();
  const f = useLoQueFaltaValidar();
  const act = useActualizarConNexus({ linea: u.linea, ubicar: { ubicar: u.ubicar, lanzando: u.lanzando, corriendo: u.corriendo }, porValidar: f.items.length, validadas: f.cuenta.validadas });
  return <EstadoDelDiagnostico f={f} act={act} linea={u.linea} contexto={<SelectorDelContexto u={u} />} />;
}

/** En la cuenta lo lanza el agente de la ficha (lo que registró); sin él todavía, no hay botón. */
function ArribaEnLaCuenta({ deLaCuenta }: { deLaCuenta: UbicarDeLaCuenta | null }) {
  const { exp } = useLienzo();
  const f = useLoQueFaltaValidar();
  /* Nunca se ubicó en la cuenta, aunque traiga niveles copiados de la preventa (revisión del 26 nov): lo primero es leer lo
     que Nexus sabe de la cuenta, no armar el Resumen con lo de la preventa. */
  const nunca = !exp.estado.propuesta.corridas.some((c) => c.modo === "posicionar");
  const linea: LineaQueMira = deLaCuenta?.corriendo
    ? { estado: "ubicando", boton: { fuerte: false } }
    : nunca
      ? { estado: "sinUbicar", boton: { fuerte: true }, texto: "Nexus todavía no leyó lo que sabe de la cuenta." }
      : { estado: "alDia", boton: { fuerte: false } };
  const act = useActualizarConNexus({ linea, ubicar: deLaCuenta, porValidar: f.items.length, validadas: f.cuenta.validadas });
  return <EstadoDelDiagnostico f={f} act={act} linea={null} textoDeLoNuevo={linea.texto} contexto={null} />;
}

function EstadoDelDiagnostico({
  f,
  act,
  linea,
  textoDeLoNuevo,
  contexto,
}: {
  f: ReturnType<typeof useLoQueFaltaValidar>;
  act: ReturnType<typeof useActualizarConNexus>;
  /** La línea de la ubicación (solo la preventa). */
  linea: LineaDeLaEscala | null;
  /** En la cuenta, lo que dice la franja de lo nuevo (no hay línea de la ubicación). */
  textoDeLoNuevo?: string;
  contexto: ReactNode;
}) {
  const { puedeEditar } = useLienzo();
  const [validando, setValidando] = useState(false);
  const franja = franjaDeArriba({ hayResumen: act.hayResumen, accion: act.que.accion, fuerte: act.que.fuerte, atrasado: act.quedoAtras });
  // En la franja amarilla el botón va solo cuando lo que sigue es rehacer el Resumen; si no, en la línea de estado.
  const botonEnLaFranja = franja === "nuevo" || (franja === "atras" && act.que.accion === "resumen");
  const sinDato = enlaceDeLoSinDato(f.cuenta.sinDato);
  const validacion = (
    <span role="status" className={cn("font-semibold", f.linea?.completa ? "text-success-ink" : "text-fg")}>
      {f.linea ? `${f.linea.completa ? "✓ " : ""}${f.linea.texto}` : "Todavía no hay nada que validar"}
    </span>
  );
  const enlace = sinDato ? (
    <button type="button" onClick={irAParaCompletar} className="font-semibold text-brand hover:underline">
      {sinDato} ↓
    </button>
  ) : null;
  const validar = (
    <>
      {puedeEditar && f.items.length > 0 && (
        <Button size="sm" variant="primary" onClick={() => setValidando(true)}>
          Validar ({f.items.length})
        </Button>
      )}
      {f.items.length > 1 && <BotonUsarTodas items={f.items} lugar="escala" etiqueta="Usar todas" secundario />}
    </>
  );
  const drawer = <ValidarLaEscala items={f.items} abierto={validando} onCerrar={() => setValidando(false)} />;

  if (franja === "sinDiagnostico")
    return (
      <section aria-label="Falta generar el diagnóstico" className="flex flex-col gap-2.5 rounded-xl border border-info-line bg-info-surface px-5 py-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-[15px] font-semibold text-fg">Falta generar el diagnóstico</h3>
          <p className="text-[13px] leading-[1.45] text-fg-secondary">
            {[linea?.texto, "Mientras no exista, el cliente no ve esta pestaña: su enlace abre en la página de un equipo."].filter(Boolean).join(" ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-xs">
          {act.boton}
          {validar}
          {contexto}
          {validacion}
          {enlace}
        </div>
        {drawer}
      </section>
    );

  // Lo que dice la línea de la ubicación va en la franja solo cuando es su porqué (lo nuevo, o el motivo de la amarilla).
  const enLaFranja = franja === "nuevo" || (franja === "atras" && !!linea && act.motivo === linea.texto);
  // En la cuenta no hay línea de la ubicación: lo nuevo (nunca se ubicó) va en la línea de estado si no tiene franja.
  const ubicacion = linea ? (enLaFranja ? null : linea.texto) : franja === "nuevo" ? null : (textoDeLoNuevo ?? null);
  return (
    <section aria-label="Cómo va el diagnóstico" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px]">
          {validacion}
          {enlace}
          {(ubicacion || contexto) && (
            <span aria-hidden="true" className="text-fg-muted">
              ·
            </span>
          )}
          {ubicacion && <span className="text-xs text-fg-muted">{ubicacion}</span>}
          {contexto}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {validar}
          {!botonEnLaFranja && act.boton}
        </div>
      </div>
      {franja === "atras" && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[10px] border border-warn-line bg-warn-surface px-3.5 py-2.5">
          <p className="text-[13px] text-warn-ink">
            <span className="font-semibold">El diagnóstico quedó atrás.</span> {act.motivo}
            {!botonEnLaFranja && (f.items.length > 0 ? " Valida lo que falta y después actualízalo." : " Primero Nexus tiene que leer lo nuevo.")}
          </p>
          {botonEnLaFranja && act.boton}
        </div>
      )}
      {franja === "nuevo" && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[10px] border border-info-line bg-info-surface px-3.5 py-2.5">
          <p className="text-[13px] text-fg">{linea?.texto ?? textoDeLoNuevo ?? "Hay algo nuevo que la escala todavía no leyó."}</p>
          {act.boton}
        </div>
      )}
      {drawer}
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

/** Un área como botón que se presiona: su nivel y cuánto tiene validado, o que está fuera. */
function BotonDeArea({ area, elegida, orden, onElegir }: { area: AreaDelLienzo; elegida: boolean; orden: number; onElegir: () => void }) {
  const { mapa, escala, nombreDeNivel, lugar } = useLienzo();
  const conAlgo = tieneAlgo(area, mapa.posiciones);
  const calculo = orden > 0 || conAlgo ? calculoDelArea(escala, area, mapa.posiciones) : undefined;
  const cuenta = calculo ? validacionDelArea(area.dimensiones, mapa.posiciones) : null;
  const todo = !!cuenta && cuenta.porValidar === 0 && cuenta.sinDato === 0;
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
                {/* Un solo vocabulario (26 nov): «✓ validado» cuando no falta nada; lo propuesto, sin rótulo. */}
                {todo && <span className="text-[11px] font-semibold text-success-ink">✓ validado</span>}
              </>
            ) : (
              <span className="text-fg-muted">Sin ubicar todavía</span>
            )}
          </span>
          {cuenta && (
            <span className="text-xs text-fg-muted">{fraseDeLaValidacion(cuenta)}</span>
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
      tarjetas[d.id] = { id: d.id, nombre: d.nombre, area: a.nombre, color, nivel: d.nivel, puntaje: d.puntaje, estado: estadoDeLaParte(p), porQue: p?.porQue ?? null, pregunta: dl.pregunta };
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
 * abierta. Lo que la frena va debajo, con los otros equipos (`ParaCompletarElDiagnostico`).
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
  const cuenta = validacionDelArea(area.dimensiones, mapa.posiciones);
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
                <span className="font-normal text-fg-secondary">está en</span>
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
            {fraseDeLaValidacion(cuenta, aplican)}
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

/** Los equipos que se resumen debajo de la página: UNA regla para todo lo de abajo (en juego o con algo, elegidos o no). */
function useAreasDelResumen(): AreaDelLienzo[] {
  const { exp, escala, mapa } = useLienzo();
  return areasDelResumen(escala.areas, exp.estado.areas, (a) => tieneAlgo(a, mapa.posiciones));
}

/** Cuántas preguntas de un equipo se ven antes de «Ver N más». */
const PREGUNTAS_A_LA_VISTA = 4;

/**
 * PARA COMPLETAR EL DIAGNÓSTICO (24 nov, Elías con TEC · AE: «un lugar para completar lo que falta»), debajo de la página.
 * Junta lo que eran dos bloques:
 *   · «Lo que más frena a cada equipo» (novena vuelta, 8 nov; antes «Por qué está ahí», arriba del radar): por equipo, su
 *     nivel, lo que lo frena y cuánto tiene con evidencia, y en la preventa el puente «Ver los casos de uso →»;
 *   · «Para explorar más» (cuarta vuelta, 8 nov): cada hipótesis con su pregunta y «Llevar a la sesión N», lo «sin dato» y
 *     la lectura «Preparación para engagement avanzado» de Marketing.
 * Desde el 24 nov cada parte por explorar O sin dato trae su pregunta (lo sin dato era una lista de nombres) y, en la
 * preventa, «Responder con Nexus»: abre el MISMO chat «Nexus» de la derecha (una sola puerta, HablarConNexus.tsx) con esa
 * pregunta, su equipo y su parte. Lo que se responde, guardado, es una nota de «Lo que sabes del cliente» y el Resumen la
 * lee al rehacerse (`notasComoFuentes`); arriba de la página aparece «Hay N respuestas nuevas» con «Rehacer con IA». Una
 * pregunta con respuesta lo dice (lib/exploraciones/completar-el-diagnostico.ts › `respuestaDe`). Primero los equipos con
 * más hipótesis (Elías: «entre más hipótesis tiene un área, más se puede explorar»); no depende de las áreas elegidas en el
 * radar (novena vuelta), así que elegir o soltar una no lo cambia de alto.
 */
function ParaCompletarElDiagnostico() {
  const { exp, escala, mapa, nombreDeNivel, lugar, irA, puedeEditar } = useLienzo();
  const cuentas = useAreasDeLaEscala();
  const llevar = useLlevarALaSesion();
  const deLaLista = useAreasDelResumen();
  const [conTodas, setConTodas] = useState<ReadonlySet<string>>(() => new Set());
  if (!deLaLista.length) return null;
  const ids = new Set(deLaLista.map((a) => a.id));
  const primero = ordenParaExplorar(cuentas.filter((c) => ids.has(c.id))).map((c) => c.id);
  const orden = [...primero, ...deLaLista.map((a) => a.id).filter((id) => !primero.includes(id))];
  const tarjetas = exp.estado.propuesta.tarjetasDeLaEscala?.porDimension ?? {};
  // El chat de la preventa (HablarConNexus) solo existe ahí y para quien puede editar: en la cuenta no hay conversación.
  const conNexus = lugar === "preventa" && puedeEditar;
  const nombreDeCapa = (c: string) => escala.capas.find((x) => x.clave === c)?.nombre ?? c;
  const { notas, autoresDeLasNotas } = exp.estado.contenido;
  const alternar = (id: string) =>
    setConTodas((x) => {
      const y = new Set(x);
      if (y.has(id)) y.delete(id);
      else y.add(id);
      return y;
    });
  return (
    <section id={ID_DE_PARA_COMPLETAR} tabIndex={-1} aria-label="Para completar el diagnóstico" className="flex scroll-mt-6 flex-col gap-3 rounded-xl outline-none transition-shadow">
      <div className="flex flex-col gap-0.5">
        <h4 className="text-sm font-semibold text-fg">Para completar el diagnóstico</h4>
        {/* Sin la explicación de lo que hace Nexus con una respuesta (26 nov: la pantalla no se explica). */}
        <p className="text-xs text-fg-muted">Lo que más frena a cada equipo y lo que falta saber de cada parte.</p>
      </div>
      {/* Sin `etiqueta`: la sección de arriba ya se llama así (dos regiones con el mismo nombre, una dentro de la otra). */}
      <ListaQueSeAnima ids={orden} espacio={3}>
        {(id) => {
          const area = escala.areas.find((a) => a.id === id);
          if (!area) return null;
          const calculo = calculoDelArea(escala, area, mapa.posiciones);
          const cuenta = calculo ? validacionDelArea(area.dimensiones, mapa.posiciones) : null;
          const frena = calculo ? loQueLaFrena(calculo) : null;
          const dims = frena?.dimensiones.map((x) => area.dimensiones.find((d) => d.id === x)).filter((d): d is DimensionDelLienzo => !!d) ?? [];
          const enJuego = exp.estado.areas.indexOf(area.id) + 1;
          const { hipotesis, sinDato } = partesParaExplorar(area.dimensiones, (x) => mapa.posiciones[x]?.clase ?? null);
          const preguntas = [...hipotesis.map((d) => ({ d, esHipotesis: true })), ...sinDato.map((d) => ({ d, esHipotesis: false }))];
          const todas = conTodas.has(area.id);
          return (
            <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h5 className="inline-flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                  <span className="h-3 w-3 flex-shrink-0 rounded-[3px]" style={{ background: colorDelArea(area.id) }} aria-hidden="true" />
                  {area.nombre}
                  {calculo?.nivel ? (
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <span className={cn("h-2 w-2 rounded-full", PUNTO_DE_NIVEL[calculo.nivel])} aria-hidden="true" />
                      {nombreDeNivel(calculo.nivel)}
                      {calculo.puntaje !== null && <span className="text-xs font-normal tabular-nums text-fg-muted">{Math.round(calculo.puntaje)}/100</span>}
                    </span>
                  ) : (
                    <span className="text-xs font-normal text-fg-muted">sin ubicar</span>
                  )}
                </h5>
                {/* Lo que decían los botones de las áreas (8 nov: en «Como lo ve el cliente» no hay botones). */}
                <span className="text-xs text-fg-muted">
                  {cuenta ? `${fraseDeLaValidacion(cuenta)} · ` : ""}
                  {enJuego > 0 ? `${enJuego}.º en juego` : "salió en las reuniones"}
                </span>
              </div>
              {calculo && (
                <p className="text-[13px] leading-[1.45] text-fg-secondary">
                  {fraseDelFreno({
                    conNivel: !!calculo.nivel,
                    frena: frena ? { nombres: dims.map((d) => d.nombre), nivel: nombreDeNivel(frena.nivel), capa: nombreDeCapa(frena.capa) } : null,
                    faltan: calculo.faltan.length,
                  })}
                </p>
              )}
              {preguntas.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {(todas ? preguntas : preguntas.slice(0, PREGUNTAS_A_LA_VISTA)).map(({ d }) => {
                    const p = mapa.posiciones[d.id];
                    const rotulo = rotuloDeLaParte(estadoDeLaParte(p));
                    const pregunta = tarjetas[d.id]?.preguntas[0] ?? d.pregunta;
                    const respuesta = respuestaDe(notas, autoresDeLasNotas, area.nombre, d.nombre);
                    return (
                      <PreguntaParaLlevar
                        key={d.id}
                        pregunta={pregunta}
                        dimensionId={d.id}
                        llevar={llevar}
                        encima={
                          <span className="text-xs text-fg-secondary">
                            <span className="tabular-nums text-fg-muted">{d.id}</span> <span className="font-semibold text-fg">{d.nombre}</span>
                            {/* Un solo vocabulario (26 nov): el nivel que propuso Nexus sin rótulo, «✓ validado», «sin dato». */}
                            {p && <span className="text-fg-secondary"> · {nombreDeNivel(p.nivel)}</span>}
                            {rotulo && <span className={estadoDeLaParte(p) === "validada" ? "font-semibold text-success-ink" : "text-fg-muted"}> · {rotulo}</span>}
                          </span>
                        }
                        nota={
                          respuesta ? (
                            <span className="text-xs font-medium text-success-ink">✓ Respondida{respuesta.en ? ` el ${diaCorto(respuesta.en)}` : ""}: está en «Lo que sabes del cliente».</span>
                          ) : null
                        }
                        otras={
                          conNexus ? (
                            <button
                              type="button"
                              onClick={() => abrirNexusEnLaPreventa({ exploracionId: exp.id, pregunta: { equipo: area.nombre, dimension: d.nombre, dimensionId: d.id, pregunta } })}
                              className="text-xs font-semibold text-brand hover:underline"
                            >
                              {/* Una sola entrada al chat «Nexus» (26 nov): antes, ya respondida, decía «Sumar algo con Nexus». */}
                              Responder con Nexus
                            </button>
                          ) : null
                        }
                      />
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-fg-muted">No falta nada que preguntar.</p>
              )}
              {preguntas.length > PREGUNTAS_A_LA_VISTA && (
                <button type="button" onClick={() => alternar(area.id)} className="self-start text-xs font-semibold text-fg-secondary hover:text-fg hover:underline">
                  {todas ? "Ver menos" : `Ver ${preguntas.length - PREGUNTAS_A_LA_VISTA} más`}
                </button>
              )}
              {area.id === AREA_DEL_ENGAGEMENT && !!escala.preparacion && (
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

/** El área cuya lectura es «Preparación para engagement avanzado» (lib/escala/preparacion.ts lee el nivel de Marketing). */
const AREA_DEL_ENGAGEMENT = "2";

/** «Como lo ve el cliente» / «Comparar áreas»: en la fila del título, con lo demás de la página (27 nov). */
function ComoSeVe({ vista, onVista }: { vista: Vista; onVista: (v: Vista) => void }) {
  return <Segmentado etiqueta="Cómo se ve la escala" opciones={(["pagina", "nodos"] as const).map((v) => ({ clave: v, etiqueta: NOMBRE_DE_LA_VISTA[v] }))} valor={vista} onCambio={onVista} />;
}

/**
 * La fila de arriba (27 nov, Elías: «cómo lo ve el cliente, comparar áreas y acceso, a la par»): el título a la izquierda
 * (sin «Dónde está cada equipo en la escala.») y, juntos a la derecha, cómo se ve, «✨ Mejorar con IA» e «Historial» (los
 * pone la página a la vista por la ranura, ranura-de-arriba.tsx) y «Acceso».
 */
function FilaDeArriba({ titulo, vista, onVista, onRanura }: { titulo?: string; vista: Vista; onVista: (v: Vista) => void; onRanura: (el: HTMLElement | null) => void }) {
  const { lugar } = useLienzo();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      {titulo ? <h2 className="text-lg font-semibold text-fg">{titulo}</h2> : <span aria-hidden="true" />}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ComoSeVe vista={vista} onVista={onVista} />
        <div ref={onRanura} className="contents" />
        {lugar !== "proyecto" && <AccesoALaEscala />}
      </div>
    </div>
  );
}

/**
 * La escala: la página (o «Comparar áreas»), debajo la línea de cómo se ubicó (`linea`, solo la preventa) y «Para
 * completar el diagnóstico». Hasta el 24 nov se titulaba «Dónde está hoy» (Elías, con TEC · AE: «quitar»).
 */
function DondeEstaHoy({ vista }: { vista: Vista }) {
  const { exp, escala, mapa, cambiar, lugar, puedeEditar, guardando } = useLienzo();
  const enJuego = exp.estado.areas;
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
    <section aria-label="Diagnóstico de rendimiento" className="flex flex-col gap-3">
      {/* Sin «Objetivo de la primera venta» ni la frase de lo explorado (24 nov, Elías: «demasiada información»), y sin el
          título «Dónde está hoy» (24 nov, noche): si hay algo que actualizar lo dice la línea de debajo de la página; dónde
          está cada equipo, la página y «Para completar el diagnóstico». */}
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
            <span className="truncate">
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
      <ParaCompletarElDiagnostico />
    </section>
  );
}

/**
 * `agente`: el panel del agente de este lugar (en la cuenta, el de la ficha). Sin él, el de la exploración. `titulo`: el
 * nombre de la pieza, en la fila de arriba (la preventa; en la cuenta el título lo pone la ficha).
 */
export default function PasoEscala({ agente, titulo }: { agente?: ReactNode; titulo?: string } = {}) {
  const { exp, lugar } = useLienzo();
  const hayAreas = exp.estado.areas.length > 0;
  const [vista, setVista] = useState<Vista>("pagina");
  // Lo que registra el agente de la cuenta para que «Actualizar con Nexus» lo lance desde arriba (26 nov).
  const [deLaCuenta, setDeLaCuenta] = useState<UbicarDeLaCuenta | null>(null);
  // Donde la página pone «✨ Mejorar con IA» e «Historial» (la fila de arriba).
  const [ranura, setRanura] = useState<HTMLElement | null>(null);
  // El título y de qué va la pieza los pone el lienzo, como en las demás piezas.
  return (
    <RegistrarUbicarDeLaCuenta.Provider value={setDeLaCuenta}>
    <RanuraDeArriba.Provider value={ranura}>
    <div className="flex flex-col gap-5">
      {/* 27 nov (diseño «Cabecera del Diagnóstico de rendimiento», v2): el título con cómo se ve, la IA, el historial y
          «Acceso» a la par; debajo, el estado y lo que sigue con «Actualizar con Nexus»; «Publicar» en su franja, como
          «Subir al cliente» del kickoff; y la página. */}
      <div className="flex flex-col gap-3.5">
        <FilaDeArriba titulo={titulo} vista={vista} onVista={setVista} onRanura={setRanura} />
        <ArribaDelDiagnostico deLaCuenta={deLaCuenta} />
        {lugar !== "proyecto" && <PublicarLaEscala />}
      </div>
      <DondeEstaHoy vista={vista} />
      <ConQueSeMide />
      {hayAreas && (
        <div data-recorrido="preventa.escala.primero">
          <QueVaPrimero />
        </div>
      )}
      {agente ?? <PanelDelAgente modoPrincipal="leer" compacto />}
    </div>
    </RanuraDeArriba.Provider>
    </RegistrarUbicarDeLaCuenta.Provider>
  );
}

/**
 * El agente de la cuenta registra cómo se lanza (26 nov): «Actualizar con Nexus», arriba, lo usa. El registro se hace una
 * vez y se renueva solo cuando cambia si está lanzando o corriendo; `ubicar` llama siempre a lo último.
 */
export function useRegistrarUbicarDeLaCuenta(ubicar: () => void, estado: { lanzando: boolean; corriendo: boolean }): void {
  const registrar = useContext(RegistrarUbicarDeLaCuenta);
  const ultimo = useRef(ubicar);
  useEffect(() => {
    ultimo.current = ubicar;
  });
  const { lanzando, corriendo } = estado;
  useEffect(() => {
    registrar?.({ ubicar: () => ultimo.current(), lanzando, corriendo });
  }, [registrar, lanzando, corriendo]);
  useEffect(() => () => registrar?.(null), [registrar]);
}
