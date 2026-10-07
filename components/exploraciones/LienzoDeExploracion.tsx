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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Drawer, useToast } from "@/components/ui";
import type { EstadoDePieza } from "@/components/canvas/SelectorDePiezas";
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
import { sePuedeReintentar } from "@/lib/exploraciones/reintento";
import type { ExploracionParaLaPantalla } from "@/lib/exploraciones/servidor";
import { Casilla } from "./Casilla";
import ManejoDeObjeciones from "./ManejoDeObjeciones";
import { LienzoContexto, type Lienzo, type MomentoDeLaSesion, type OpcionesDeCambio, type PasoDelLienzoUI } from "./contexto";
import PanelDeContexto from "./PanelDeContexto";
import { NOMBRE_DEL_PASO, piezaDelDestino } from "./piezas";
import PasoCasosDeUso from "./PasoCasosDeUso";
import { PasoInformacion, PasoProcesos, type InfoDeLaEmpresa } from "./PasoDeLaEmpresa";
import PasoEscala from "./PasoEscala";
import PasoExploracion from "./PasoExploracion";
import PasoPreparacion from "./PasoPreparacion";
import ContextoDeLaPreventa from "./ContextoDeLaPreventa";
import PasoPropuesta from "./PasoPropuesta";
import Resumen, { lineasDe } from "./Resumen";
import RevisarSugerencias from "./RevisarSugerencias";
import RielDePiezas, { type FilaDelRiel } from "./RielDePiezas";
import { EVENTO_DEL_RECORRIDO, type AccionDelRecorrido } from "@/lib/recorridos/tipos";

/** Qué es cada pieza, en una línea, debajo de su nombre. Exploración y lo de la cuenta llevan su propio encabezado. */
const DE_QUE_VA: Record<Exclude<PasoDelLienzoUI, "exploracion" | "informacion" | "procesos">, string> = {
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

export default function LienzoDeExploracion({
  inicial,
  escala,
  puedeEditar,
  puedeProponer,
  infoDeLaEmpresa,
  piezaInicial,
}: {
  inicial: ExploracionParaLaPantalla;
  escala: EscalaDelLienzo;
  puedeEditar: boolean;
  puedeProponer: boolean;
  /** Dónde vive la información de la empresa (la misma de la ficha del cliente). */
  infoDeLaEmpresa: InfoDeLaEmpresa;
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
  const [objecionesAbiertas, setObjecionesAbiertas] = useState(false);
  const [revision, setRevision] = useState<{ abierto: boolean; filtro: "todo" | PasoDelLienzoUI }>({ abierto: false, filtro: "todo" });
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
    puedeProponer: puedeEditar && puedeProponer,
    guardando,
    cambiar,
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
      elegir: setSesionElegida,
      momentos,
      ponerMomento: (clave, m) => setMomentos((x) => ({ ...x, [clave]: m })),
    },
  };

  /* El recorrido de la preventa pasa por todas las piezas (lib/recorridos/contenido/preventa.ts): cada
     paso pide la suya. Se cierran los cajones, que taparían lo que señala. */
  useEffect(() => {
    const alPedido = (e: Event) => {
      const a = (e as CustomEvent<AccionDelRecorrido>).detail;
      if (a?.evento !== "preventa.pieza" || !esPieza(a.valor)) return;
      setCasillaAbierta(null);
      setObjecionesAbiertas(false);
      setRevision((r) => ({ ...r, abierto: false }));
      setPaso(a.valor);
    };
    window.addEventListener(EVENTO_DEL_RECORRIDO, alPedido);
    return () => window.removeEventListener(EVENTO_DEL_RECORRIDO, alPedido);
  }, [setPaso]);

  const sigue = queSigueConPaso(exp.estado, chequeo, sinLeer);
  const deCadaPaso = (p: PasoDelLienzoUI) => revisables.filter((it) => piezaDelDestino(it.destino) === p).length;

  /* El punto de cada pieza: verde si ya tiene contenido, ámbar si hay algo para revisar o hacer,
     hueco si todavía nada. Lo calcula la pantalla con lo que ya tiene. */
  const lista = listaParaProponer(exp.estado, chequeo).every((p) => p.cumplido);
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
    }
    return { clave: p, etiqueta: NOMBRE_DEL_PASO[p], estado, ayuda: AYUDA_DEL_ESTADO[estado], aviso, sugeridas: porRevisar };
  };
  const delResumen = deCadaPaso("resumen");
  const confirmadas = CASILLAS_DEL_RESUMEN.filter((c) => lineasDe(c, exp.estado.contenido.casillas[c]).length > 0).length;

  return (
    <LienzoContexto.Provider value={lienzo}>
      <div className="flex-1 bg-surface-muted lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] xl:grid-cols-[14.5rem_minmax(0,1fr)_18.75rem]">
        <aside className="border-b border-line bg-surface px-3 py-4 lg:sticky lg:top-0 lg:h-[calc(100vh-3.5rem)] lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r lg:py-4">
          <RielDePiezas
            paso={paso}
            onElegir={setPaso}
            resumen={{ sugeridas: delResumen, confirmadas, estado: confirmadas > 0 ? "generada" : "vacia" }}
            filas={PIEZAS.map(filaDe)}
            clientId={exp.empresa.clientId}
          />
        </aside>

        <main className="min-w-0 px-6 pb-10 pt-6 xl:px-8">
          {paso !== "exploracion" && paso !== "informacion" && paso !== "procesos" && (
            <header className="mb-5">
              <h2 className="text-lg font-semibold text-fg">{NOMBRE_DEL_PASO[paso]}</h2>
              <p className="text-sm text-fg-muted">{DE_QUE_VA[paso]}</p>
            </header>
          )}
          {/* El «Contexto adicional» (2026-10-06): el mismo en todas las piezas que lee el agente. La
              cuenta es la ficha de la empresa y tiene lo suyo. */}
          {paso !== "informacion" && paso !== "procesos" && (
            <div className="mb-6">
              <ContextoDeLaPreventa />
            </div>
          )}
          {paso === "resumen" && <Resumen />}
          {paso === "preparacion" && <PasoPreparacion />}
          {paso === "exploracion" && <PasoExploracion />}
          {paso === "informacion" && <PasoInformacion info={infoDeLaEmpresa} />}
          {paso === "procesos" && <PasoProcesos />}
          {paso === "escala" && <PasoEscala />}
          {paso === "casos" && <PasoCasosDeUso />}
          {paso === "propuesta" && <PasoPropuesta />}
        </main>

        <aside className="border-t border-line bg-surface-muted p-5 lg:col-span-2 xl:sticky xl:top-0 xl:col-span-1 xl:h-[calc(100vh-3.5rem)] xl:self-start xl:overflow-y-auto xl:border-l xl:border-t-0">
          <PanelDeContexto sigue={sigue} nombreDelPaso={(p) => NOMBRE_DEL_PASO[p]} paso={paso} />
        </aside>
      </div>

      <ManejoDeObjeciones abierto={objecionesAbiertas} onCerrar={() => setObjecionesAbiertas(false)} />
      <RevisarSugerencias abierto={revision.abierto} filtroInicial={revision.filtro} onCerrar={() => setRevision((r) => ({ ...r, abierto: false }))} />

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
