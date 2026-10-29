"use client";

/**
 * LienzoDeExploracion — el lienzo de la exploración de venta de una empresa.
 *
 * Una GUÍA, no un formulario (pedido de Elías, 2026-10-01: «una guía muy fácil de rellenar»).
 * Pensado para escritorio (rediseño del 2026-10-03: «no se está aprovechando bien el espacio»), en
 * tres columnas: a la izquierda las piezas y las sesiones (RielDePiezas), al centro una sola tarea, y
 * a la derecha lo que conviene tener a la vista en cualquier pieza (PanelDeContexto: qué sigue, la
 * arquitectura de la venta, la escala, las objeciones y lo que propuso el agente). Lo que propone el
 * agente aparece en su lugar, para usarlo o descartarlo. La pieza abierta queda en la dirección
 * (`?pieza=`): recargar o compartir el enlace abre la misma. Las casillas se abren en un cajón que
 * vive acá, para poder abrirlas desde cualquier columna.
 *
 * ── EN UN PROYECTO (2026-10-07) ─────────────────────────────────────────────
 * Con `proyecto`, el mismo lienzo es la pieza Exploración de la ficha del cliente: la exploración de
 * Customer Success (lib/exploraciones/marco.ts). Sin riel ni panel propios: las sesiones se pintan por
 * portal debajo de la fila «Exploración» del riel de la ficha (con «Informe anterior»; los cuestionarios
 * son su propia pieza desde el 2026-10-11) y el panel de la derecha, en el de la ficha. Al centro, la página de inicio o la sesión elegida.
 *
 * ── LA PÁGINA DE INICIO (etapa A, 2026-10-09) ──────────────────────────────
 * Exploración abre en su página de inicio (InicioDeLaExploracion): la próxima sesión, las sesiones con
 * su reunión, «+ Agregar sesión», las fuentes manuales y las instrucciones. Elegir una sesión sale del
 * inicio; tocar «Exploración» en el riel (o en el de la ficha, con el evento `exploracion:inicio`)
 * vuelve. Cada sesión tiene su dirección (`?sesion=<id>&momento=analisis`, 2026-10-28; lib/exploraciones/enlace-de-la-sesion.ts):
 * elegirla la escribe, «Atrás» vuelve a la anterior y abrir el enlace abre esa sesión en esa pestaña. El «Contexto adicional» de
 * la exploración se retiró: las demás piezas con agente tienen el suyo, sin lista de reuniones.
 *
 * ── EN LA CUENTA (escala única, 2026-10-28) ────────────────────────────────
 * Con `cuenta`, el mismo lienzo es La cuenta › La escala de la ficha del cliente: solo la pieza La escala, sobre la
 * exploración de «Información del cliente» (lib/exploraciones/escala-de-la-cuenta.ts). Sin riel ni panel: la ficha
 * pone su encabezado, el agente («Actualizar escala»), la historia y el camino de crecimiento. Cuando cambia la
 * edición o el perfil, la escala del lienzo es otra: la vuelve a pedir la ficha (`alRefrescar`), no la página.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Drawer, useToast } from "@/components/ui";
import { useUndo, useUndoScope } from "@/components/ui/UndoProvider";
import { useMe } from "@/hooks/useMe";
import type { EstadoDePieza } from "@/components/canvas/SelectorDePiezas";
import type { Letra } from "@/lib/escala/documento/tipos";
import { CASILLAS_DEL_RESUMEN, type ClaveDeCasilla } from "@/lib/exploraciones/casillas";
import { listaParaProponer, queSigueConPaso } from "@/lib/exploraciones/calidad";
import {
  aplicarOperaciones,
  destinoValido,
  esHipotesisDeNivel,
  propuestaVigente,
  VALIDADOR_LIBRE,
  type DestinoDePropuesta,
  type ItemPropuesto,
  type Operacion,
  type Validez,
} from "@/lib/exploraciones/contenido";
import { avisoDelLote, queHaceUsar, usadasDeHoy, type LugarDelLote } from "@/lib/exploraciones/usar-sugerencias";
import { idsDeLaEscala, type EscalaDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import { chequeoConfirmado, chequeoDelMapa, posicionesDelMapa } from "@/lib/exploraciones/mapa";
import { definicionEnElMarco, marcoDe } from "@/lib/exploraciones/marco";
import { queSigueDelProyecto } from "@/lib/exploraciones/avance-del-proyecto";
import { sePuedeReintentar } from "@/lib/exploraciones/reintento";
import { estadoDeLaConexion } from "@/lib/exploraciones/senales";
import type { ExploracionParaLaPantalla } from "@/lib/exploraciones/servidor";
import { hoyEnCostaRica } from "@/lib/exploraciones/fechas";
import { opcionesDeLasPestanas, pestanasDeSesiones } from "@/lib/exploraciones/guia";
import { esParaEstaExploracion, EVENTO_GUIA_CAMBIADA, type AvisoDeLaGuia } from "@/lib/exploraciones/aviso-de-la-guia";
import { conLaSesion, esDeEsteProyecto, modoDeEscritura, sesionQuePideLaDireccion, sinLaSesion } from "@/lib/exploraciones/enlace-de-la-sesion";
import { Casilla } from "./Casilla";
import ManejoDeObjeciones from "./ManejoDeObjeciones";
import { LienzoContexto, type Lienzo, type LugarDelLienzo, type ModoDelSelector, type MomentoDeLaSesion, type OpcionesDeCambio, type PasoDelLienzoUI } from "./contexto";
import PanelDeContexto from "./PanelDeContexto";
import { NOMBRE_DEL_PASO, piezaDelDestino } from "./piezas";
import PasoCasosDeUso from "./PasoCasosDeUso";
import { PasoInformacion, PasoProcesos, type InfoDeLaEmpresa } from "./PasoDeLaEmpresa";
import PasoEscala from "./PasoEscala";
import PasoExploracion from "./PasoExploracion";
import PasoPreparacion from "./PasoPreparacion";
import PasoAnalisis from "@/components/analizador-venta/PasoAnalisis";
import { useAnalisisDeLaVenta } from "@/components/analizador-venta/useAnalisisDeLaVenta";
import ContextoDeLaPreventa, { type ModoDelContexto } from "./ContextoDeLaPreventa";
import BuscarReunionesDeLaPreventa from "./BuscarReunionesDeLaPreventa";
import { MirarCalendario } from "./MirarCalendario";
import SugerenciasDeAsociacion from "./SugerenciasDeAsociacion";

/**
 * El «Contexto adicional» de cada pieza de la preventa (2026-10-09): Preparación (sus fuentes y sus
 * instrucciones), Casos de uso (no lee reuniones: lee el lienzo) y La escala (sin agente propio). Las
 * demás no lo llevan: Exploración tiene su página de inicio, y el Resumen y la Propuesta no leen nada.
 */
const MODO_DEL_CONTEXTO: Partial<Record<PasoDelLienzoUI, ModoDelContexto>> = {
  preparacion: "preparacion",
  casos: "casos",
  escala: "sinAgente",
};
import PasoPropuesta from "./PasoPropuesta";
import Resumen, { lineasDe } from "./Resumen";
import RevisarSugerencias from "./RevisarSugerencias";
import { MirarHubspot } from "./MirarHubspot";
import RielDePiezas, { Sesiones, type FilaDelRiel } from "./RielDePiezas";
import { EVENTO_DEL_RECORRIDO, type AccionDelRecorrido } from "@/lib/recorridos/tipos";

/** Qué es cada pieza, en una línea, debajo de su nombre. Exploración y lo de la cuenta llevan su propio encabezado. */
const DE_QUE_VA: Record<Exclude<PasoDelLienzoUI, "exploracion" | "informacion" | "procesos">, string> = {
  resumen: "Lo que se sabe del prospecto. Toca una tarjeta para completarla o revisar lo que propuso el agente.",
  preparacion: "Con quién vas a hablar, qué es la empresa y cómo abrir la conversación.",
  escala: "Dónde parece estar cada equipo, con hipótesis y evidencia.",
  casos: "Lo que se le puede proponer, según dónde está cada equipo.",
  propuesta: "La propuesta comercial, armada con lo confirmado.",
  analisis: "Cómo se ha trabajado a este prospecto, sesión por sesión, y qué falta diagnosticar antes de proponer.",
};

/**
 * Las piezas del recorrido, en orden (el Resumen va aparte, arriba de todas). «Análisis» (S5, 2026-10-27) va al final y
 * solo para quien ve el análisis de la venta (los super admin mientras se prueba).
 */
const PIEZAS = ["preparacion", "exploracion", "escala", "casos", "propuesta", "analisis"] as const;

/** Lo que dice el punto de cada pieza en el title de la fila. */
const AYUDA_DEL_ESTADO: Record<EstadoDePieza, string> = {
  generada: "Ya tiene contenido",
  pendiente: "Hay algo para revisar o hacer",
  vacia: "Todavía sin contenido",
};

const esPieza = (x: string | null | undefined): x is PasoDelLienzoUI => !!x && x in NOMBRE_DEL_PASO;

/** Las sesiones que muestra esta exploración: las mismas de useSesiones. */
function sesionesQueSeMuestran(e: ExploracionParaLaPantalla, reuniones: NonNullable<ExploracionParaLaPantalla["reuniones"]>) {
  const opciones = opcionesDeLasPestanas(e.automaticas, e.estado.contenido.fuera);
  return pestanasDeSesiones(e.estado.contenido.sesiones, reuniones, hoyEnCostaRica(), opciones);
}

/** Dónde vive la exploración de un proyecto en la ficha del cliente. */
export interface EnElProyecto {
  /** El panel de la derecha de la ficha (null si está oculto). */
  slotDelPanel: HTMLElement | null;
  /** Debajo de la fila «Exploración» del riel de la ficha (null si no está a la vista). */
  slotDeSesiones: HTMLElement | null;
  /** El informe viejo en solo lectura; null si el proyecto no lo tenía. */
  informeAnterior: ReactNode | null;
}

type VistaDelProyecto = "sesiones" | "informe";

/** La escala de la cuenta en la ficha del cliente (ver arriba). */
export interface EnLaCuenta {
  /** Vuelve a pedir la exploración y la escala (cambió la edición o el perfil). */
  alRefrescar: () => void;
  /** El agente de la cuenta («Actualizar escala»), en el lugar del de la preventa. */
  agente: ReactNode;
  /** Lo propio de la ficha, debajo de la escala: el camino de crecimiento y la historia. */
  despues?: ReactNode;
}

export default function LienzoDeExploracion({
  inicial,
  escala,
  puedeEditar,
  puedeProponer,
  infoDeLaEmpresa,
  piezaInicial,
  proyecto,
  cuenta,
  conAsistente = false,
  veAnalisisDeVenta = false,
  veTendenciaDelEquipo = false,
}: {
  inicial: ExploracionParaLaPantalla;
  escala: EscalaDelLienzo;
  puedeEditar: boolean;
  puedeProponer: boolean;
  /** Dónde vive la información de la empresa (la misma de la ficha del cliente). En un proyecto no hace falta: la ficha la tiene. */
  infoDeLaEmpresa?: InfoDeLaEmpresa;
  /** La de `?pieza=` en la dirección; sin ella, el Resumen. */
  piezaInicial?: string | null;
  /** La exploración de un proyecto, dentro de la ficha del cliente (ver arriba). */
  proyecto?: EnElProyecto;
  /** La escala de la cuenta, dentro de la ficha del cliente (ver arriba). */
  cuenta?: EnLaCuenta;
  /** El chat de la cuenta está en la pantalla: la guía ofrece «Mejorar con el asistente» (validación 71). */
  conAsistente?: boolean;
  /** Quien mira ve el análisis de la venta (S4 y S5): quien entra a la preventa (2026-10-28). Nunca en un proyecto. */
  veAnalisisDeVenta?: boolean;
  /** Ve el enlace a la tendencia de cada vendedor («Análisis de la venta»): solo los super admin. */
  veTendenciaDelEquipo?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const enProyecto = !!proyecto;
  const lugar: LugarDelLienzo = cuenta ? "cuenta" : proyecto ? "proyecto" : "preventa";
  /* `?sesion=<id>&momento=analisis` (los enlaces de «Copiar enlace» y de «Para ti»): se abre esa sesión, en esa pestaña,
     en vez de la página de inicio. Una que ya no está en ESTA exploración abre el inicio con un aviso (más abajo). */
  const direccion = useSearchParams();
  const [alAbrir] = useState(() =>
    sesionQuePideLaDireccion(direccion, {
      sesiones: sesionesQueSeMuestran(inicial, inicial.reuniones ?? []),
      enProyecto,
      projectId: inicial.projectId,
      // En la preventa, una sesión sin `?pieza=` abre Exploración; con otra pieza, no se abre.
      enLaPieza: !cuenta && (enProyecto || !esPieza(piezaInicial) || piezaInicial === "exploracion"),
    }),
  );
  const [exp, setExp] = useState(inicial);
  const [sinLeer, setSinLeer] = useState(inicial.sinLeer ?? []);
  const [proyectos, setProyectos] = useState(inicial.proyectos ?? []);
  const [documentos, setDocumentos] = useState(inicial.documentos ?? []);
  const [propuestas, setPropuestas] = useState(inicial.propuestas ?? []);
  const [reuniones, setReuniones] = useState(inicial.reuniones ?? []);
  const [escalaAnterior, setEscalaAnterior] = useState(inicial.escalaAnterior ?? null);
  const [guardando, setGuardando] = useState(false);
  const conAnalisis = veAnalisisDeVenta && !proyecto && !cuenta;
  const [paso, setPasoCrudo] = useState<PasoDelLienzoUI>(
    cuenta
      ? "escala"
      : proyecto
        ? "exploracion"
        : esPieza(piezaInicial) && (piezaInicial !== "analisis" || conAnalisis)
          ? piezaInicial
          : alAbrir.sesion || alAbrir.perdida
            ? "exploracion"
            : "resumen",
  );
  const [vista, setVista] = useState<VistaDelProyecto>("sesiones");
  const [sesionElegida, setSesionElegida] = useState<string | null>(alAbrir.sesion);
  const [enInicio, setEnInicio] = useState(!alAbrir.sesion);
  const [selector, setSelector] = useState<ModoDelSelector | null>(null);
  const [momentos, setMomentos] = useState<Record<string, MomentoDeLaSesion>>(() =>
    alAbrir.sesion && alAbrir.momento ? { [alAbrir.sesion]: alAbrir.momento } : {},
  );
  const [casillaAbierta, setCasillaAbierta] = useState<ClaveDeCasilla | null>(null);
  const [objecionesAbiertas, setObjecionesAbiertas] = useState(false);
  const [revision, setRevision] = useState<{ abierto: boolean; filtro: "todo" | PasoDelLienzoUI }>({ abierto: false, filtro: "todo" });
  // El pie del cajón: ahí van «Guardar» y «Cancelar», fijos abajo aunque el formulario sea largo.
  const [pie, setPie] = useState<HTMLDivElement | null>(null);
  /* La escala del lienzo la arma el servidor con la edición y el perfil: si cambian, se vuelve a pedir. En la cuenta la
     pide la ficha (no hay página que refrescar); en la preventa y en un proyecto, la página. Por referencia: los
     callbacks de abajo no se rehacen cada vez que la ficha se vuelve a pintar. */
  const alRefrescar = useRef(cuenta?.alRefrescar);
  useEffect(() => {
    alRefrescar.current = cuenta?.alRefrescar;
  }, [cuenta?.alRefrescar]);
  const refrescarLaEscala = useCallback(() => (alRefrescar.current ? alRefrescar.current() : router.refresh()), [router]);
  // La pieza abierta, por referencia: entrar a Exploración desde OTRA pieza arranca en su página de inicio.
  const pasoActual = useRef(paso);
  useEffect(() => {
    pasoActual.current = paso;
  }, [paso]);
  // La pieza abierta queda en la dirección, sin otra navegación (no vuelve a pedir la página).
  const setPaso = useCallback((p: PasoDelLienzoUI) => {
    // En un proyecto (o en la cuenta) hay una sola pieza: la dirección es la de la ficha.
    if (enProyecto || lugar === "cuenta") return;
    if (p === "exploracion" && pasoActual.current !== "exploracion") setEnInicio(true);
    pasoActual.current = p;
    setPasoCrudo(p);
    try {
      // Fuera de Exploración la dirección deja de nombrar una sesión.
      const url = p === "exploracion" ? new URL(window.location.href) : sinLaSesion(new URL(window.location.href));
      if (p === "resumen") url.searchParams.delete("pieza");
      else url.searchParams.set("pieza", p);
      /* Con `null` y no con `window.history.state`: así Next se entera de la dirección nueva. Con su estado, la daba por
         no cambiada y, en el próximo refresco, volvía a escribir la vieja (la sesión anterior en la barra). */
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* sin la dirección, igual cambia de pieza */
    }
  }, [enProyecto, lugar]);

  /* Lo último que confirmó el servidor, y la fila de pedidos: cada uno sale con la versión que dejó
     el anterior. */
  const confirmada = useRef(inicial);
  const cola = useRef<Promise<unknown>>(Promise.resolve());
  /* La «época» de la fila: sube con cada conflicto (409). Un cambio que se encoló ANTES del conflicto
     se armó sobre algo que otra persona ya cambió: no se manda (si saliera con la versión nueva,
     pisaría ese cambio sin que nadie se entere). */
  const epoca = useRef(0);

  /* Un `router.refresh()` (cambió la edición o el perfil) trae la fila: se adopta solo si es MÁS
     NUEVA que la última confirmada. Una respuesta que leyó la base antes de un cambio posterior
     haría retroceder la pantalla, y el próximo cambio chocaría como si fuera de otra persona. */
  const [vistaDe, setVistaDe] = useState(inicial.actualizadaEn);
  if (vistaDe !== inicial.actualizadaEn) {
    setVistaDe(inicial.actualizadaEn);
    const actual = confirmada.current;
    if (inicial.version > actual.version || (inicial.version === actual.version && inicial.actualizadaEn >= actual.actualizadaEn)) {
      setExp(inicial);
      confirmada.current = inicial;
    }
    if (inicial.sinLeer) setSinLeer(inicial.sinLeer);
    if (inicial.proyectos) setProyectos(inicial.proyectos);
    if (inicial.documentos) setDocumentos(inicial.documentos);
    if (inicial.propuestas) setPropuestas(inicial.propuestas);
    if (inicial.reuniones) setReuniones(inicial.reuniones);
    if (inicial.escalaAnterior !== undefined) setEscalaAnterior(inicial.escalaAnterior);
  }

  const validez = useMemo<Validez>(() => {
    const ids = idsDeLaEscala(escala);
    return {
      dimensiones: ids.dimensiones,
      criterios: ids.criterios,
      areas: new Set(escala.areas.map((a) => a.id)),
      ediciones: new Set(escala.ediciones.map((e) => e.slug)),
      perfilesHabituales: Object.fromEntries(escala.ediciones.map((e) => [e.slug, e.perfilHabitual])),
      escalaVersion: escala.version,
    };
  }, [escala]);

  const enviar = useCallback(
    async (ops: Operacion[], opciones: OpcionesDeCambio = {}): Promise<boolean> => {
      const base = confirmada.current;
      setGuardando(true);
      try {
        const mandar = async (version: number) => {
          const r = await fetch(`/api/sales/exploraciones/${base.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ version, operaciones: ops }),
          });
          return { res: r, data: (await r.json().catch(() => ({}))) as { exploracion?: ExploracionParaLaPantalla; error?: string } };
        };
        let { res, data } = await mandar(base.version);
        /* Chocó, pero lo que cambió en el servidor (casi siempre el agente al preparar) no es lo que
           cambia esta operación: se manda una vez más sobre lo último, sin molestar a nadie
           (lib/exploraciones/reintento.ts). */
        if (res.status === 409 && data.exploracion && sePuedeReintentar(ops, base.estado, data.exploracion.estado)) {
          ({ res, data } = await mandar(data.exploracion.version));
        }
        if (res.status === 409) epoca.current += 1;
        if (data.exploracion) {
          confirmada.current = data.exploracion;
          setExp(data.exploracion);
        } else {
          setExp(confirmada.current);
        }
        if (!res.ok) {
          toast.error(data.error ?? "No se pudo guardar.");
          // Sin la fila en la respuesta, se pide la de ahora: el rechazo pudo venir de algo que cambió.
          if (!data.exploracion) void recargar();
          return false;
        }
        if (opciones.refrescar) refrescarLaEscala();
        if (opciones.exito) toast.success(opciones.exito);
        return true;
      } catch {
        setExp(confirmada.current);
        toast.error("No se pudo guardar. Revisa tu conexión.");
        return false;
      } finally {
        setGuardando(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `recargar` se declara abajo y es estable
    [refrescarLaEscala, toast],
  );

  const me = useMe();
  const miCorreo = me?.email ?? null;
  const cambiar = useCallback(
    (ops: Operacion[], opciones?: OpcionesDeCambio): Promise<boolean> => {
      // En pantalla primero, con la misma regla que aplica el servidor (que anota quién y cuándo de verdad).
      setExp((actual) => {
        const r = aplicarOperaciones(actual.estado, ops, validez, VALIDADOR_LIBRE, { por: miCorreo, en: new Date().toISOString() });
        return r.ok ? { ...actual, estado: r.estado } : actual;
      });
      const deLaEpoca = epoca.current;
      const p = cola.current.then(() => (deLaEpoca === epoca.current ? enviar(ops, opciones) : false));
      cola.current = p.catch(() => undefined);
      return p;
    },
    [enviar, validez, miCorreo],
  );

  /* K12 (2026-10-28): usar una sugerencia dice qué hizo y se puede deshacer —con el aviso o con Ctrl+Z fuera de un campo
     de texto (components/ui/UndoProvider.tsx)—. La pila vive en la página: se pierde al recargar, y lo usado hoy queda
     en «Usadas hoy» (contenido.usadas) para revertirlo desde ahí. */
  const { pushUndo } = useUndo();
  const raiz = useRef<HTMLDivElement>(null);
  const scopeDelDeshacer = `exploracion:${inicial.id}`;
  useUndoScope(scopeDelDeshacer, raiz);

  const deshacer = useCallback(
    async (ids: string[], que?: string): Promise<boolean> => {
      const pedidas = (confirmada.current.estado.contenido.usadas ?? []).filter((u) => ids.includes(u.id));
      if (!pedidas.length) {
        toast.info("Eso ya se deshizo.");
        return false;
      }
      const refrescar = pedidas.some((u) => u.item.destino.tipo === "edicion" || u.item.destino.tipo === "perfil");
      const ok = await cambiar([{ op: "deshacerUso", ids: pedidas.map((u) => u.id) }], { refrescar });
      if (!ok) return false;
      const quedan = (confirmada.current.estado.contenido.usadas ?? []).filter((u) => ids.includes(u.id)).length;
      if (quedan > 0) {
        const hechas = pedidas.length - quedan;
        toast.info(
          `${hechas === 1 ? "Se deshizo 1" : `Se deshicieron ${hechas}`} de ${pedidas.length}: ${
            quedan === 1 ? "una cambió después de usarla y quedó como está" : `${quedan} cambiaron después de usarlas y quedaron como están`
          }.`,
        );
      } else if (pedidas.length === 1) {
        // Qué se deshizo, con las mismas palabras del «Usar» (sobre lo de ahora, que ya es lo de antes de usarla).
        const nivel = (l: Letra) => escala.niveles.find((n) => n.letra === l)?.nombre ?? l;
        const dicho = que ?? queHaceUsar(pedidas[0].item, confirmada.current.estado, escala, nivel, marcoDe(inicial.marco)).texto;
        toast.success(`Deshiciste: ${dicho}. La sugerencia volvió a la lista.`);
      } else {
        toast.success(`Deshiciste las ${pedidas.length} sugerencias: volvieron a la lista.`);
      }
      return true;
    },
    [cambiar, toast, escala, inicial.marco],
  );

  const usar = useCallback(
    async (items: ItemPropuesto[], o: { lugar?: LugarDelLote } = {}): Promise<boolean> => {
      if (!items.length) return false;
      // Lo que va a escribir, dicho ANTES de usarla (después ya no hay «antes» con que comparar).
      const nivel = (l: Letra) => escala.niveles.find((n) => n.letra === l)?.nombre ?? l;
      const efecto = items.length === 1 ? queHaceUsar(items[0], confirmada.current.estado, escala, nivel, marcoDe(inicial.marco)) : null;
      const refrescar = items.some((it) => it.destino.tipo === "edicion" || it.destino.tipo === "perfil");
      const ops: Operacion[] =
        items.length === 1
          ? [{ op: "usar", itemId: items[0].id, valor: items[0].valor }]
          : [{ op: "usarVarias", items: items.map((it) => ({ itemId: it.id, valor: it.valor })) }];
      const ok = await cambiar(ops, { refrescar });
      if (!ok) return false;
      // Solo lo que de verdad quedó anotado: un ítem que ya estaba igual no tiene nada que deshacer.
      const anotadas = new Set((confirmada.current.estado.contenido.usadas ?? []).map((u) => u.id));
      const ids = items.map((it) => it.id).filter((id) => anotadas.has(id));
      if (!ids.length) return true;
      pushUndo({
        scope: scopeDelDeshacer,
        label: efecto ? `Usaste: ${efecto.texto}` : avisoDelLote(o.lugar ?? "otro", ids.length),
        undo: async () => {
          await deshacer(ids, efecto?.texto);
        },
      });
      return true;
    },
    [cambiar, deshacer, escala, inicial.marco, pushUndo, scopeDelDeshacer],
  );

  /** Espera a que salgan los cambios en fila (antes de armar la propuesta, por ejemplo). */
  const alDia = useCallback((): Promise<void> => cola.current.then(() => undefined), []);

  const recargar = useCallback((): Promise<void> => {
    const p = cola.current.then(async () => {
      try {
        const res = await fetch(`/api/sales/exploraciones/${confirmada.current.id}`);
        const data = (await res.json().catch(() => ({}))) as { exploracion?: ExploracionParaLaPantalla };
        if (data.exploracion) {
          const antes = confirmada.current.estado;
          const ahora = data.exploracion.estado;
          confirmada.current = data.exploracion;
          setExp(data.exploracion);
          if (data.exploracion.sinLeer) setSinLeer(data.exploracion.sinLeer);
          if (data.exploracion.proyectos) setProyectos(data.exploracion.proyectos);
          if (data.exploracion.documentos) setDocumentos(data.exploracion.documentos);
          if (data.exploracion.propuestas) setPropuestas(data.exploracion.propuestas);
          if (data.exploracion.reuniones) setReuniones(data.exploracion.reuniones);
          if (data.exploracion.escalaAnterior !== undefined) setEscalaAnterior(data.exploracion.escalaAnterior);
          /* La preparación eligió la industria o el perfil: la escala del lienzo es otra (la arma el
             servidor con esos dos), así que se vuelve a pedir la página. */
          if (antes.edicion !== ahora.edicion || antes.perfilCierre !== ahora.perfilCierre || antes.perfilDespues !== ahora.perfilDespues) {
            refrescarLaEscala();
          }
        }
      } catch {
        /* se queda con lo que tiene: el próximo cambio trae lo último */
      }
    });
    cola.current = p;
    return p;
  }, [refrescarLaEscala]);

  // Lo confirmado CON evidencia: lo mismo que lee el servidor para la propuesta y el handoff.
  const chequeo = useMemo(() => chequeoConfirmado(escala, exp.estado), [exp.estado, escala]);

  // Lo pendiente que todavía tiene dónde ir: lo de una dimensión o un criterio que ya no está no se cuenta ni se usa.
  const pendientes = useMemo(() => propuestaVigente(exp.estado).filter((it) => destinoValido(it.destino, validez)), [exp.estado, validez]);
  /* Las hipótesis de nivel son el mapa: no se «usan», se confirman en las reuniones. Y con conversación
     (agendada o una reunión que ya pasó), la estrategia de conexión sobra: no se cuenta para revisar. */
  const enContacto = estadoDeLaConexion({ agenda: exp.leido.agenda, reuniones }).tipo !== "sin-contacto";
  const revisables = useMemo(
    () => pendientes.filter((it) => !esHipotesisDeNivel(it) && !(enContacto && it.destino.tipo === "casilla" && it.destino.clave === "estrategiaDeConexion")),
    [pendientes, enContacto],
  );
  const mapa = useMemo(() => {
    const posiciones = posicionesDelMapa(exp.estado, pendientes);
    return { posiciones, chequeo: chequeoDelMapa(escala, exp.estado.areas, posiciones) };
  }, [exp.estado, pendientes, escala]);
  const pendientesPara = useCallback((filtro: (d: DestinoDePropuesta) => boolean) => revisables.filter((it) => filtro(it.destino)), [revisables]);
  const nombreDeNivel = useCallback((l: Letra) => escala.niveles.find((n) => n.letra === l)?.nombre ?? l, [escala]);
  const irA = useCallback(
    (p: PasoDelLienzoUI) => {
      setPaso(p);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [setPaso],
  );

  const marco = marcoDe(exp.marco);
  const lienzo: Lienzo = {
    exp,
    marco,
    lugar,
    escala,
    chequeo,
    mapa,
    pendientes,
    revisables,
    sinLeer,
    proyectos,
    documentos,
    propuestas,
    reuniones,
    escalaAnterior,
    puedeEditar,
    puedeProponer: puedeEditar && puedeProponer,
    conAsistente: puedeEditar && conAsistente,
    veAnalisisDeVenta: conAnalisis,
    veTendenciaDelEquipo,
    guardando,
    cambiar,
    usar,
    deshacer,
    queHace: (it) => queHaceUsar(it, exp.estado, escala, nombreDeNivel, marco),
    usadasHoy: usadasDeHoy(exp.estado.contenido.usadas),
    recargar,
    alDia,
    nombreDeNivel,
    pendientesPara,
    irA,
    abrirCasilla: setCasillaAbierta,
    abrirRevision: (pieza) => setRevision({ abierto: true, filtro: pieza ?? "todo" }),
    abrirObjeciones: () => setObjecionesAbiertas(true),
    sesion: {
      elegida: sesionElegida,
      elegir: (clave) => {
        setSesionElegida(clave);
        setEnInicio(false);
      },
      momentos,
      ponerMomento: (clave, m) => setMomentos((x) => ({ ...x, [clave]: m })),
      enInicio,
      irAlInicio: () => setEnInicio(true),
      buscarReunion: setSelector,
    },
  };

  /* El recorrido de la preventa pasa por todas las piezas (lib/recorridos/contenido/preventa.ts): cada
     paso pide la suya. Se cierran los cajones, que taparían lo que señala. */
  useEffect(() => {
    const alPedido = (e: Event) => {
      const a = (e as CustomEvent<AccionDelRecorrido>).detail;
      // La página de inicio de Exploración («inicio») o la próxima sesión («proxima»).
      if (a?.evento === "preventa.sesion") {
        setSelector(null);
        if (enProyecto) setVista("sesiones");
        if (a.valor === "inicio") setEnInicio(true);
        else {
          setSesionElegida(null);
          setEnInicio(false);
        }
        return;
      }
      if (a?.evento !== "preventa.pieza" || !esPieza(a.valor)) return;
      setCasillaAbierta(null);
      setObjecionesAbiertas(false);
      setSelector(null);
      setRevision((r) => ({ ...r, abierto: false }));
      setPaso(a.valor);
    };
    window.addEventListener(EVENTO_DEL_RECORRIDO, alPedido);
    return () => window.removeEventListener(EVENTO_DEL_RECORRIDO, alPedido);
  }, [setPaso, enProyecto]);

  /* El chat de Nexus aplicó una lista que cambia esta guía (CEMACO, 2026-10-20: la pantalla mostraba las preguntas viejas
     hasta recargar): se vuelve a leer la exploración. Lo que la persona está escribiendo vive en cada campo y se queda. */
  const expId = exp.id;
  useEffect(() => {
    const alCambiar = (e: Event) => {
      if (esParaEstaExploracion((e as CustomEvent<AvisoDeLaGuia>).detail, expId)) void recargar();
    };
    window.addEventListener(EVENTO_GUIA_CAMBIADA, alCambiar);
    return () => window.removeEventListener(EVENTO_GUIA_CAMBIADA, alCambiar);
  }, [expId, recargar]);

  /* En la ficha del cliente, tocar «Exploración» cuando ya está abierta vuelve a la página de inicio
     (components/clients/RielDelCliente.tsx emite el evento). */
  useEffect(() => {
    if (!enProyecto) return;
    const alInicio = () => {
      setVista("sesiones");
      setEnInicio(true);
    };
    window.addEventListener("exploracion:inicio", alInicio);
    return () => window.removeEventListener("exploracion:inicio", alInicio);
  }, [enProyecto]);

  /* ── La sesión en la dirección (Elías, 2026-10-28: «que cada sesión genere una URL diferente») ──────────────
     La sesión abierta y su pestaña elegida a mano viven en `?sesion=` y `?momento=` (lib/exploraciones/enlace-de-la-sesion.ts).
     Elegir otra sesión, otra pestaña o volver al inicio deja una entrada en el historial, así «Atrás» vuelve a lo
     anterior; salir de Exploración solo la saca (modoDeEscritura). Se escribe sin navegar (no vuelve a pedir la página) y
     con `null` de estado, para que Next adopte la dirección nueva: con el suyo la daba por no cambiada y, en el próximo
     refresco (cambiar el responsable, la edición), volvía a escribir la vieja. */
  const mostradas = useMemo(() => sesionesQueSeMuestran(exp, reuniones), [exp, reuniones]);
  const mostradasAhora = useRef(mostradas);
  useEffect(() => {
    mostradasAhora.current = mostradas;
  }, [mostradas]);
  const enLaPieza = lugar !== "cuenta" && (enProyecto ? vista === "sesiones" : paso === "exploracion");
  const sesionDeLaUrl = enLaPieza && !enInicio ? sesionElegida : null;
  const momentoDeLaUrl = sesionDeLaUrl ? (momentos[sesionDeLaUrl] ?? null) : null;
  const primeraEscritura = useRef(true);
  useEffect(() => {
    if (lugar === "cuenta") return;
    const primera = primeraEscritura.current;
    primeraEscritura.current = false;
    try {
      const actual = new URL(window.location.href);
      if (!esDeEsteProyecto(actual.searchParams, enProyecto, exp.projectId)) return;
      const deseada = conLaSesion(actual, sesionDeLaUrl, momentoDeLaUrl);
      if (deseada.href === actual.href) return;
      if (modoDeEscritura({ primera, enLaPieza }) === "agregar") window.history.pushState(null, "", deseada.href);
      else window.history.replaceState(null, "", deseada.href);
    } catch {
      /* sin la dirección, la sesión igual se abre */
    }
  }, [lugar, enProyecto, exp.projectId, enLaPieza, sesionDeLaUrl, momentoDeLaUrl]);

  // «Atrás» y «Adelante»: la pantalla vuelve a lo que dice la dirección.
  useEffect(() => {
    if (lugar === "cuenta") return;
    const alVolver = () => {
      const url = new URL(window.location.href);
      if (!esDeEsteProyecto(url.searchParams, enProyecto, exp.projectId)) return;
      let enExploracion = true;
      if (!enProyecto) {
        const p = url.searchParams.get("pieza");
        const nuevo: PasoDelLienzoUI = esPieza(p) && (p !== "analisis" || conAnalisis) ? p : "resumen";
        pasoActual.current = nuevo;
        setPasoCrudo(nuevo);
        enExploracion = nuevo === "exploracion";
      }
      const { sesion: clave, momento } = sesionQuePideLaDireccion(url.searchParams, {
        sesiones: mostradasAhora.current,
        enProyecto,
        projectId: exp.projectId,
        enLaPieza: enExploracion,
      });
      if (clave) {
        if (enProyecto) setVista("sesiones");
        setSesionElegida(clave);
        setEnInicio(false);
        setMomentos((m) => {
          const resto = { ...m };
          delete resto[clave];
          return momento ? { ...resto, [clave]: momento } : resto;
        });
      } else if (enExploracion) {
        setEnInicio(true);
      }
      /* Si la dirección a la que se volvió nombra algo que ya no está, se corrige EN SU LUGAR: escribirla después con
         un pushState borraría el «Adelante». */
      const canonica = conLaSesion(url, clave, momento);
      if (canonica.href !== url.href) window.history.replaceState(null, "", canonica.href);
    };
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, [lugar, enProyecto, exp.projectId, conAnalisis]);

  // Un enlace a una sesión que ya no está (la quitaron, o es de otra exploración): se abre el inicio y se dice.
  const avisado = useRef(false);
  useEffect(() => {
    if (!alAbrir.perdida || avisado.current) return;
    avisado.current = true;
    toast.info("La sesión de ese enlace ya no está en esta exploración. Te dejamos en su inicio.");
  }, [alAbrir.perdida, toast]);

  // Lo que falta en las sesiones va primero en «Qué sigue» (la exploración de un cliente arranca vacía).
  const hoy = hoyEnCostaRica();
  const sesionesParaSigue = {
    pestanas: mostradas,
    automaticas: exp.automaticas,
  };
  const sigue = enProyecto
    ? { texto: queSigueDelProyecto(exp.estado, chequeo, sinLeer, revisables.length, sesionesParaSigue), paso: null }
    : queSigueConPaso(exp.estado, chequeo, sinLeer, hoy, sesionesParaSigue);
  const deCadaPaso = (p: PasoDelLienzoUI) => revisables.filter((it) => piezaDelDestino(it.destino) === p).length;

  /* El punto de cada pieza: verde si ya tiene contenido, ámbar si hay algo para revisar o hacer,
     hueco si todavía nada. Lo calcula la pantalla con lo que ya tiene. */
  const lista = listaParaProponer(exp.estado, chequeo).every((p) => p.cumplido);
  // El punto de «Análisis»: verde con alguna sesión analizada, ámbar si hay alguna con transcripción sin analizar.
  const analisisDeVenta = useAnalisisDeLaVenta(exp.id, conAnalisis);
  const conHipotesis = Object.values(mapa.posiciones).some((p) => p.clase === "hipotesis");
  const filaDe = (p: (typeof PIEZAS)[number]): FilaDelRiel => {
    const porRevisar = deCadaPaso(p);
    let estado: EstadoDePieza;
    let aviso: FilaDelRiel["aviso"] = null;
    switch (p) {
      case "preparacion": {
        const preparo = exp.estado.propuesta.corridas.some((c) => c.modo === "preparar");
        estado = porRevisar > 0 ? "pendiente" : preparo ? "generada" : "vacia";
        break;
      }
      case "exploracion": {
        const leyo = exp.estado.propuesta.corridas.some((c) => c.modo === "leer");
        estado = porRevisar > 0 || sinLeer.length > 0 ? "pendiente" : leyo ? "generada" : "vacia";
        if (!aviso && sinLeer.length > 0) aviso = { corto: `${sinLeer.length} sin leer`, largo: "Reuniones o documentos que el agente todavía no leyó" };
        break;
      }
      case "escala":
        estado = porRevisar > 0 ? "pendiente" : chequeo.completo ? "generada" : conHipotesis ? "pendiente" : "vacia";
        if (!porRevisar && !chequeo.completo && conHipotesis) aviso = { corto: "hipótesis", largo: "El mapa sale en parte de hipótesis: confírmalas en las reuniones" };
        break;
      case "casos":
        estado = porRevisar > 0 ? "pendiente" : Object.keys(exp.estado.contenido.casosDeUso).length > 0 ? "generada" : "vacia";
        break;
      case "propuesta":
        estado = propuestas.length > 0 ? "generada" : lista ? "pendiente" : "vacia";
        if (propuestas.length === 0 && lista) aviso = { corto: "Lista", largo: "Lista para proponer" };
        break;
      case "analisis": {
        const rs = analisisDeVenta.datos?.reuniones ?? [];
        const sinAnalizar = rs.filter((r) => r.texto === "transcripcion" && !r.detalle?.resultado).length;
        estado = sinAnalizar > 0 ? "pendiente" : rs.some((r) => r.detalle?.resultado) ? "generada" : "vacia";
        if (sinAnalizar > 0) aviso = { corto: `${sinAnalizar} sin analizar`, largo: "Reuniones de venta con transcripción que nadie analizó" };
        break;
      }
    }
    return { clave: p, etiqueta: NOMBRE_DEL_PASO[p], estado, ayuda: AYUDA_DEL_ESTADO[estado], aviso, sugeridas: porRevisar };
  };
  const delResumen = deCadaPaso("resumen");
  const confirmadas = CASILLAS_DEL_RESUMEN.filter((c) => lineasDe(c, exp.estado.contenido.casillas[c]).length > 0).length;

  /* Lo que comparten las dos formas: el cajón de cada casilla y el de lo que sugirió el agente. */
  const cajones = (
    <>
      <MirarCalendario />
      <BuscarReunionesDeLaPreventa modo={selector} onCerrar={() => setSelector(null)} />
      <ManejoDeObjeciones abierto={objecionesAbiertas} onCerrar={() => setObjecionesAbiertas(false)} />
      <RevisarSugerencias abierto={revision.abierto} filtroInicial={revision.filtro} onCerrar={() => setRevision((r) => ({ ...r, abierto: false }))} />
      <Drawer
        open={casillaAbierta !== null}
        onClose={() => setCasillaAbierta(null)}
        title={casillaAbierta ? definicionEnElMarco(casillaAbierta, marco).etiqueta : undefined}
        description={casillaAbierta ? definicionEnElMarco(casillaAbierta, marco).ayuda : undefined}
        size="lg"
        footer={puedeEditar ? <div ref={setPie} className="flex items-center gap-2" /> : undefined}
      >
        {casillaAbierta && <Casilla key={casillaAbierta} clave={casillaAbierta} sinTitulo editarDeEntrada pie={pie} onListo={() => setCasillaAbierta(null)} />}
      </Drawer>
    </>
  );

  if (cuenta) {
    return (
      <LienzoContexto.Provider value={lienzo}>
        <div ref={raiz} className="space-y-8">
          <PasoEscala agente={cuenta.agente} />
          {cuenta.despues}
        </div>
        {cajones}
      </LienzoContexto.Provider>
    );
  }

  if (proyecto) {
    const extras = [
      ...(proyecto.informeAnterior ? [{ clave: "informe", etiqueta: "Informe anterior", activa: vista === "informe", onClick: () => setVista("informe") }] : []),
    ];
    return (
      <LienzoContexto.Provider value={lienzo}>
        {proyecto.slotDeSesiones &&
          createPortal(
            <Sesiones
              abierta={vista === "sesiones"}
              alElegir={(clave) => {
                setVista("sesiones");
                lienzo.sesion.elegir(clave);
              }}
              extras={extras}
            />,
            proyecto.slotDeSesiones,
          )}
        {proyecto.slotDelPanel && createPortal(<PanelDeContexto sigue={sigue} nombreDelPaso={(p) => NOMBRE_DEL_PASO[p]} paso="exploracion" />, proyecto.slotDelPanel)}
        <div ref={raiz} className="space-y-6">
          {/* K5 (2026-10-27): «¿Es la sesión 2 con Marketing?», y el lienzo que se pone al día solo. */}
          <SugerenciasDeAsociacion />
          <div hidden={vista !== "sesiones"}>
            <PasoExploracion />
          </div>
          {vista === "informe" && proyecto.informeAnterior}
        </div>
        {cajones}
      </LienzoContexto.Provider>
    );
  }

  return (
    <LienzoContexto.Provider value={lienzo}>
      <MirarHubspot />
      <div ref={raiz} className="flex-1 bg-surface-muted lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] xl:grid-cols-[14.5rem_minmax(0,1fr)_18.75rem]">
        <aside className="border-b border-line bg-surface px-3 py-4 lg:sticky lg:top-0 lg:h-[calc(100vh-3.5rem)] lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r lg:py-4">
          <RielDePiezas
            paso={paso}
            onElegir={setPaso}
            resumen={{ sugeridas: delResumen, confirmadas, estado: confirmadas > 0 ? "generada" : "vacia" }}
            filas={PIEZAS.filter((p) => p !== "analisis" || conAnalisis).map(filaDe)}
            clientId={exp.empresa.clientId}
          />
        </aside>

        <main className="min-w-0 px-6 pb-10 pt-6 xl:px-8">
          {/* K5 (2026-10-27): «¿Es la sesión 2 con Marketing?», en cualquier pieza, y el lienzo que se pone al día solo. */}
          <SugerenciasDeAsociacion />
          {paso !== "exploracion" && paso !== "informacion" && paso !== "procesos" && (
            <header className="mb-5">
              <h2 className="text-lg font-semibold text-fg">{NOMBRE_DEL_PASO[paso]}</h2>
              <p className="text-sm text-fg-muted">{DE_QUE_VA[paso]}</p>
            </header>
          )}
          {/* El «Contexto adicional» de las piezas que leen algo (2026-10-09): sin lista de reuniones,
              que son las sesiones de Exploración. Ver MODO_DEL_CONTEXTO. */}
          {MODO_DEL_CONTEXTO[paso] && (
            <div className="mb-6">
              <ContextoDeLaPreventa modo={MODO_DEL_CONTEXTO[paso]!} />
            </div>
          )}
          {paso === "resumen" && <Resumen />}
          {paso === "preparacion" && <PasoPreparacion />}
          {paso === "exploracion" && <PasoExploracion />}
          {paso === "informacion" && infoDeLaEmpresa && <PasoInformacion info={infoDeLaEmpresa} />}
          {paso === "procesos" && <PasoProcesos />}
          {paso === "escala" && <PasoEscala />}
          {paso === "casos" && <PasoCasosDeUso />}
          {paso === "propuesta" && <PasoPropuesta />}
          {paso === "analisis" && conAnalisis && <PasoAnalisis />}

        </main>

        <aside className="border-t border-line bg-surface-muted p-5 lg:col-span-2 xl:sticky xl:top-0 xl:col-span-1 xl:h-[calc(100vh-3.5rem)] xl:self-start xl:overflow-y-auto xl:border-l xl:border-t-0">
          <PanelDeContexto sigue={sigue} nombreDelPaso={(p) => NOMBRE_DEL_PASO[p]} paso={paso} />
        </aside>
      </div>

      {cajones}
    </LienzoContexto.Provider>
  );
}
