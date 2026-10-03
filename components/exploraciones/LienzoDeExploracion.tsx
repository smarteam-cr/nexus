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
 */
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { Drawer, useToast } from "@/components/ui";
import type { EstadoDePieza, FilaDePieza } from "@/components/canvas/SelectorDePiezas";
import type { Letra } from "@/lib/escala/documento/tipos";
import { CASILLAS_DEL_RESUMEN, definicionDe, type ClaveDeCasilla } from "@/lib/exploraciones/casillas";
import { listaParaProponer, queSigueConPaso } from "@/lib/exploraciones/calidad";
import {
  aplicarOperaciones,
  destinoValido,
  esHipotesisDeNivel,
  propuestaVigente,
  VALIDADOR_LIBRE,
  type DestinoDePropuesta,
  type Operacion,
  type Validez,
} from "@/lib/exploraciones/contenido";
import { idsDeLaEscala, type EscalaDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import { chequeoConfirmado, chequeoDelMapa, posicionesDelMapa } from "@/lib/exploraciones/mapa";
import type { ExploracionParaLaPantalla } from "@/lib/exploraciones/servidor";
import { Casilla } from "./Casilla";
import { LienzoContexto, type Lienzo, type MomentoDeLaSesion, type OpcionesDeCambio, type PasoDelLienzoUI } from "./contexto";
import PanelDeContexto from "./PanelDeContexto";
import PasoCasosDeUso from "./PasoCasosDeUso";
import PasoEscala from "./PasoEscala";
import PasoExploracion from "./PasoExploracion";
import PasoPreparacion from "./PasoPreparacion";
import PasoPropuesta from "./PasoPropuesta";
import Resumen, { lineasDe } from "./Resumen";
import RielDePiezas from "./RielDePiezas";

const NOMBRE_DEL_PASO: Record<PasoDelLienzoUI, string> = {
  resumen: "Resumen",
  preparacion: "Preparación",
  exploracion: "Exploración",
  escala: "La escala",
  casos: "Casos de uso",
  propuesta: "Propuesta",
};

/** Qué es cada pieza, en una línea, debajo de su nombre. Exploración lleva su propio encabezado (la sesión). */
const DE_QUE_VA: Record<Exclude<PasoDelLienzoUI, "exploracion">, string> = {
  resumen: "Lo que se sabe del prospecto. Toca una tarjeta para completarla o revisar lo que propuso el agente.",
  preparacion: "Con quién vas a hablar, qué es la empresa y cómo abrir la conversación.",
  escala: "Dónde parece estar cada equipo, con hipótesis y evidencia.",
  casos: "Lo que se le puede proponer, según dónde está cada equipo.",
  propuesta: "La propuesta comercial, armada con lo confirmado.",
};

/** Las piezas del recorrido, en orden (el Resumen va aparte, arriba de todas). */
const PIEZAS = ["preparacion", "exploracion", "escala", "casos", "propuesta"] as const;

/** Lo que dice el punto de cada pieza en el title de la fila. */
const AYUDA_DEL_ESTADO: Record<EstadoDePieza, string> = {
  generada: "Ya tiene contenido",
  pendiente: "Hay algo para revisar o hacer",
  vacia: "Todavía sin contenido",
};

const esPieza = (x: string | null | undefined): x is PasoDelLienzoUI => !!x && x in NOMBRE_DEL_PASO;

/**
 * En qué pieza se revisa lo que propuso el agente: cada casilla en la suya (`paso` en casillas.ts:
 * las del resumen se revisan en el Resumen y no cuentan en otra pieza), la escala, el perfil, las
 * áreas y los niveles en La escala, y los casos en Casos de uso.
 */
function piezaDelDestino(d: DestinoDePropuesta): PasoDelLienzoUI {
  switch (d.tipo) {
    case "casoDeUso":
      return "casos";
    case "nivel":
    case "falta":
    case "aExplorar":
      return "escala";
    case "casilla":
      return definicionDe(d.clave).paso;
    default:
      return "escala";
  }
}

export default function LienzoDeExploracion({
  inicial,
  escala,
  puedeEditar,
  piezaInicial,
}: {
  inicial: ExploracionParaLaPantalla;
  escala: EscalaDelLienzo;
  puedeEditar: boolean;
  /** La de `?pieza=` en la dirección; sin ella, el Resumen. */
  piezaInicial?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [exp, setExp] = useState(inicial);
  const [sinLeer, setSinLeer] = useState(inicial.sinLeer ?? []);
  const [proyectos, setProyectos] = useState(inicial.proyectos ?? []);
  const [documentos, setDocumentos] = useState(inicial.documentos ?? []);
  const [propuestas, setPropuestas] = useState(inicial.propuestas ?? []);
  const [reuniones, setReuniones] = useState(inicial.reuniones ?? []);
  const [guardando, setGuardando] = useState(false);
  const [paso, setPasoCrudo] = useState<PasoDelLienzoUI>(esPieza(piezaInicial) ? piezaInicial : "resumen");
  const [sesionElegida, setSesionElegida] = useState<string | null>(null);
  const [momentos, setMomentos] = useState<Record<string, MomentoDeLaSesion>>({});
  const [casillaAbierta, setCasillaAbierta] = useState<ClaveDeCasilla | null>(null);
  // El pie del cajón: ahí van «Guardar» y «Cancelar», fijos abajo aunque el formulario sea largo.
  const [pie, setPie] = useState<HTMLDivElement | null>(null);
  // La pieza abierta queda en la dirección, sin otra navegación (no vuelve a pedir la página).
  const setPaso = useCallback((p: PasoDelLienzoUI) => {
    setPasoCrudo(p);
    try {
      const url = new URL(window.location.href);
      if (p === "resumen") url.searchParams.delete("pieza");
      else url.searchParams.set("pieza", p);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      /* sin la dirección, igual cambia de pieza */
    }
  }, []);

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
        const res = await fetch(`/api/sales/exploraciones/${base.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: base.version, operaciones: ops }),
        });
        const data = (await res.json().catch(() => ({}))) as { exploracion?: ExploracionParaLaPantalla; error?: string };
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
        if (opciones.refrescar) router.refresh();
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
    [router, toast],
  );

  const cambiar = useCallback(
    (ops: Operacion[], opciones?: OpcionesDeCambio): Promise<boolean> => {
      // En pantalla primero, con la misma regla que aplica el servidor.
      setExp((actual) => {
        const r = aplicarOperaciones(actual.estado, ops, validez, VALIDADOR_LIBRE);
        return r.ok ? { ...actual, estado: r.estado } : actual;
      });
      const deLaEpoca = epoca.current;
      const p = cola.current.then(() => (deLaEpoca === epoca.current ? enviar(ops, opciones) : false));
      cola.current = p.catch(() => undefined);
      return p;
    },
    [enviar, validez],
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
          /* La preparación eligió la industria o el perfil: la escala del lienzo es otra (la arma el
             servidor con esos dos), así que se vuelve a pedir la página. */
          if (antes.edicion !== ahora.edicion || antes.perfilCierre !== ahora.perfilCierre || antes.perfilDespues !== ahora.perfilDespues) {
            router.refresh();
          }
        }
      } catch {
        /* se queda con lo que tiene: el próximo cambio trae lo último */
      }
    });
    cola.current = p;
    return p;
  }, [router]);

  // Lo confirmado CON evidencia: lo mismo que lee el servidor para la propuesta y el handoff.
  const chequeo = useMemo(() => chequeoConfirmado(escala, exp.estado), [exp.estado, escala]);

  // Lo pendiente que todavía tiene dónde ir: lo de una dimensión o un criterio que ya no está no se cuenta ni se usa.
  const pendientes = useMemo(() => propuestaVigente(exp.estado).filter((it) => destinoValido(it.destino, validez)), [exp.estado, validez]);
  // Las hipótesis de nivel son el mapa: no se «usan», se confirman en las reuniones.
  const revisables = useMemo(() => pendientes.filter((it) => !esHipotesisDeNivel(it)), [pendientes]);
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

  const lienzo: Lienzo = {
    exp,
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
    puedeEditar,
    guardando,
    cambiar,
    recargar,
    alDia,
    nombreDeNivel,
    pendientesPara,
    irA,
    abrirCasilla: setCasillaAbierta,
    sesion: {
      elegida: sesionElegida,
      elegir: setSesionElegida,
      momentos,
      ponerMomento: (clave, m) => setMomentos((x) => ({ ...x, [clave]: m })),
    },
  };

  const sigue = queSigueConPaso(exp.estado, chequeo, sinLeer);
  const deCadaPaso = (p: PasoDelLienzoUI) => revisables.filter((it) => piezaDelDestino(it.destino) === p).length;
  // «Usar todas» no toca los casos de uso: esos se eligen uno por uno, en su paso.
  const paraUsarTodas = revisables.filter((it) => it.destino.tipo !== "casoDeUso");

  /* El punto de cada pieza: verde si ya tiene contenido, ámbar si hay algo para revisar o hacer,
     hueco si todavía nada. Lo calcula la pantalla con lo que ya tiene. */
  const lista = listaParaProponer(exp.estado, chequeo).every((p) => p.cumplido);
  const filaDe = (p: (typeof PIEZAS)[number]): FilaDePieza => {
    const porRevisar = deCadaPaso(p);
    let estado: EstadoDePieza;
    let aviso: FilaDePieza["aviso"] = porRevisar > 0 ? { corto: `${porRevisar} por revisar` } : null;
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
        estado = porRevisar > 0 ? "pendiente" : chequeo.completo ? "generada" : "vacia";
        break;
      case "casos":
        estado = porRevisar > 0 ? "pendiente" : Object.keys(exp.estado.contenido.casosDeUso).length > 0 ? "generada" : "vacia";
        break;
      case "propuesta":
        estado = propuestas.length > 0 ? "generada" : lista ? "pendiente" : "vacia";
        if (propuestas.length === 0 && lista) aviso = { corto: "Lista", largo: "Lista para proponer" };
        break;
    }
    return { clave: p, etiqueta: NOMBRE_DEL_PASO[p], estado, ayuda: AYUDA_DEL_ESTADO[estado], aviso };
  };
  const delResumen = deCadaPaso("resumen");
  const confirmadas = CASILLAS_DEL_RESUMEN.filter((c) => lineasDe(c, exp.estado.contenido.casillas[c]).length > 0).length;
  const porPieza = (["resumen", ...PIEZAS] as PasoDelLienzoUI[]).map((p) => ({ paso: p, cuantas: deCadaPaso(p) }));

  return (
    <LienzoContexto.Provider value={lienzo}>
      <div className="flex-1 lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] xl:grid-cols-[13.5rem_minmax(0,1fr)_19rem]">
        <aside className="border-b border-line bg-surface px-3 py-3 lg:sticky lg:top-0 lg:h-[calc(100vh-3.5rem)] lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r lg:py-5">
          <RielDePiezas
            paso={paso}
            onElegir={setPaso}
            resumen={{ aviso: delResumen > 0 ? `${delResumen} por revisar` : `${confirmadas}/8`, estado: delResumen > 0 ? "pendiente" : confirmadas > 0 ? "generada" : "vacia" }}
            filas={PIEZAS.map(filaDe)}
          />
        </aside>

        <main className="min-w-0 px-6 py-6 xl:px-8">
          {paso !== "exploracion" && (
            <header className="mb-6">
              <h2 className="text-lg font-semibold text-fg">{NOMBRE_DEL_PASO[paso]}</h2>
              <p className="text-sm text-fg-muted">{DE_QUE_VA[paso]}</p>
            </header>
          )}
          {paso === "resumen" && <Resumen paraUsarTodas={paraUsarTodas} />}
          {paso === "preparacion" && <PasoPreparacion />}
          {paso === "exploracion" && <PasoExploracion />}
          {paso === "escala" && <PasoEscala />}
          {paso === "casos" && <PasoCasosDeUso />}
          {paso === "propuesta" && <PasoPropuesta />}
        </main>

        <aside className="border-t border-line bg-surface-muted px-5 py-6 lg:col-span-2 xl:sticky xl:top-0 xl:col-span-1 xl:h-[calc(100vh-3.5rem)] xl:self-start xl:overflow-y-auto xl:border-l xl:border-t-0">
          <PanelDeContexto sigue={sigue} porPieza={porPieza} nombreDelPaso={(p) => NOMBRE_DEL_PASO[p]} />
        </aside>
      </div>

      <Drawer
        open={casillaAbierta !== null}
        onClose={() => setCasillaAbierta(null)}
        title={casillaAbierta ? definicionDe(casillaAbierta).etiqueta : undefined}
        description={casillaAbierta ? definicionDe(casillaAbierta).ayuda : undefined}
        size="lg"
        footer={puedeEditar ? <div ref={setPie} className="flex items-center gap-2" /> : undefined}
      >
        {casillaAbierta && <Casilla key={casillaAbierta} clave={casillaAbierta} sinTitulo editarDeEntrada pie={pie} onListo={() => setCasillaAbierta(null)} />}
      </Drawer>
    </LienzoContexto.Provider>
  );
}
