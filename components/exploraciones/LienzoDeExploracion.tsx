"use client";

/**
 * LienzoDeExploracion — el lienzo de la exploración de venta de una empresa.
 *
 * Una GUÍA, no un formulario (pedido de Elías, 2026-10-01: «una guía muy fácil de rellenar»).
 * Con el MISMO caparazón que el proyecto (pedido de Elías, 2026-10-01): el nombre de la pieza con el
 * desplegable del recorrido (components/canvas/SelectorDePiezas.tsx). El Resumen abre primero: qué
 * sigue, lo que el agente propuso para revisar y las tarjetas del marco de calificación. Después,
 * Exploración (con quién se habla y la guía de la reunión; las respuestas las anota el agente con la
 * transcripción), la escala (dónde parece estar cada equipo, con hipótesis y evidencia), los casos de
 * uso y la propuesta. Lo que propone el agente aparece en su lugar, para usarlo o descartarlo. La
 * pieza abierta queda en la dirección (`?pieza=`): recargar o compartir el enlace abre la misma.
 */
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui";
import { SelectorDePiezas, type EstadoDePieza, type FilaDePieza } from "@/components/canvas/SelectorDePiezas";
import type { Letra } from "@/lib/escala/documento/tipos";
import { CASILLAS_DE_LAS_REUNIONES, CASILLAS_DEL_RESUMEN } from "@/lib/exploraciones/casillas";
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
import { LienzoContexto, type Lienzo, type OpcionesDeCambio, type PasoDelLienzoUI } from "./contexto";
import ManejoDeObjeciones from "./ManejoDeObjeciones";
import PasoCasosDeUso from "./PasoCasosDeUso";
import PasoEscala from "./PasoEscala";
import PasoExploracion from "./PasoExploracion";
import PasoPropuesta from "./PasoPropuesta";
import Resumen from "./Resumen";

const NOMBRE_DEL_PASO: Record<PasoDelLienzoUI, string> = {
  resumen: "Resumen",
  exploracion: "Exploración",
  escala: "La escala",
  casos: "Casos de uso",
  propuesta: "Propuesta",
};

/** Las piezas del recorrido, en orden (el Resumen va aparte, arriba del desplegable). */
const PIEZAS = ["exploracion", "escala", "casos", "propuesta"] as const;

/** Lo que dice el punto de cada pieza en el title de la fila. */
const AYUDA_DEL_ESTADO: Record<EstadoDePieza, string> = {
  generada: "Ya tiene contenido",
  pendiente: "Hay algo para revisar o hacer",
  vacia: "Todavía sin contenido",
};

const esPieza = (x: string | null | undefined): x is PasoDelLienzoUI => !!x && x in NOMBRE_DEL_PASO;

/** Las casillas del resumen (las tarjetas, las objeciones y las particularidades) se revisan ahí: no cuentan en otra pieza. */
const DEL_RESUMEN = new Set<string>([...CASILLAS_DEL_RESUMEN, ...CASILLAS_DE_LAS_REUNIONES]);

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
  const [guardando, setGuardando] = useState(false);
  const [paso, setPasoCrudo] = useState<PasoDelLienzoUI>(esPieza(piezaInicial) ? piezaInicial : "resumen");
  const [desplegado, setDesplegado] = useState(false);
  // La pieza abierta queda en la dirección, sin otra navegación (no vuelve a pedir la página).
  const setPaso = useCallback((p: PasoDelLienzoUI) => {
    setPasoCrudo(p);
    setDesplegado(false);
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
    puedeEditar,
    guardando,
    cambiar,
    recargar,
    alDia,
    nombreDeNivel,
    pendientesPara,
    irA,
  };

  const sigue = queSigueConPaso(exp.estado, chequeo, sinLeer);
  const deCadaPaso = (p: PasoDelLienzoUI) =>
    revisables.filter((it) => {
      const d = it.destino;
      if (d.tipo === "casoDeUso") return p === "casos";
      if (d.tipo === "nivel" || d.tipo === "falta") return p === "escala";
      if (d.tipo === "aExplorar") return p === "escala";
      if (d.tipo === "casilla") return !DEL_RESUMEN.has(d.clave) && p === "exploracion";
      return p === "exploracion";
    }).length;
  // «Usar todas» no toca los casos de uso: esos se eligen uno por uno, en su paso.
  const paraUsarTodas = revisables.filter((it) => it.destino.tipo !== "casoDeUso");

  /* El punto de cada pieza: verde si ya tiene contenido, ámbar si hay algo para revisar o hacer,
     hueco si todavía nada. Lo calcula la pantalla con lo que ya tiene: abrir el desplegable no pide nada. */
  const lista = listaParaProponer(exp.estado, chequeo).every((p) => p.cumplido);
  const filaDe = (p: (typeof PIEZAS)[number]): FilaDePieza => {
    const porRevisar = deCadaPaso(p);
    let estado: EstadoDePieza;
    let aviso: FilaDePieza["aviso"] = porRevisar > 0 ? { corto: `${porRevisar} para revisar` } : null;
    switch (p) {
      case "exploracion": {
        const leyo = exp.estado.propuesta.corridas.some((c) => c.modo === "preparar" || c.modo === "leer");
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
        if (propuestas.length === 0 && lista) aviso = { corto: "Lista para proponer" };
        break;
    }
    return { clave: p, etiqueta: NOMBRE_DEL_PASO[p], estado, ayuda: AYUDA_DEL_ESTADO[estado], aviso };
  };

  return (
    <LienzoContexto.Provider value={lienzo}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <SelectorDePiezas
            titulo={NOMBRE_DEL_PASO[paso]}
            abierto={desplegado}
            onCambiarAbierto={setDesplegado}
            resumen={{
              activo: paso === "resumen",
              ayuda: "Qué sigue, lo que propuso el agente y lo que se sabe del prospecto.",
              onElegir: () => setPaso("resumen"),
            }}
            activa={paso === "resumen" ? null : paso}
            onElegir={(clave) => esPieza(clave) && setPaso(clave)}
            filas={PIEZAS.map(filaDe)}
          />
          <ManejoDeObjeciones />
        </div>

        {paso === "resumen" && <Resumen sigue={sigue} nombreDelPaso={(p) => NOMBRE_DEL_PASO[p]} paraUsarTodas={paraUsarTodas} />}
        {paso === "exploracion" && <PasoExploracion />}
        {paso === "escala" && <PasoEscala />}
        {paso === "casos" && <PasoCasosDeUso />}
        {paso === "propuesta" && <PasoPropuesta />}
      </div>
    </LienzoContexto.Provider>
  );
}
