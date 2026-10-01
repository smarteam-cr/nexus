"use client";

/**
 * LienzoDeExploracion — el lienzo de la exploración de venta de una empresa.
 *
 * Una GUÍA, no un formulario (pedido de Elías, 2026-10-01: «una guía muy fácil de rellenar»).
 * Arriba de todo, el resumen: qué sigue, las ocho tarjetas del marco de calificación (lo que el
 * vendedor necesita ver de un vistazo para poder proponer) y lo que el agente propuso para revisar.
 * Abajo, cuatro pestañas: Exploración (con quién se habla y la guía de la reunión; las respuestas
 * las anota el agente con la transcripción), la escala (dónde parece estar cada equipo, con
 * hipótesis y evidencia), los casos de uso y el traspaso. Lo que propone el agente aparece en su
 * lugar, para usarlo o descartarlo.
 */
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { Tabs, useToast } from "@/components/ui";
import type { Letra } from "@/lib/escala/documento/tipos";
import { CASILLAS_DEL_RESUMEN } from "@/lib/exploraciones/casillas";
import { queSigueConPaso } from "@/lib/exploraciones/calidad";
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
import PasoCasosDeUso from "./PasoCasosDeUso";
import PasoEscala from "./PasoEscala";
import PasoExploracion from "./PasoExploracion";
import PasoTraspaso from "./PasoTraspaso";
import Resumen from "./Resumen";

const NOMBRE_DEL_PASO: Record<PasoDelLienzoUI, string> = {
  exploracion: "Exploración",
  escala: "La escala",
  casos: "Casos de uso",
  traspaso: "Traspaso",
};

/** Las casillas del resumen se revisan en sus tarjetas, arriba: no cuentan en ninguna pestaña. */
const DEL_RESUMEN = new Set<string>(CASILLAS_DEL_RESUMEN);

export default function LienzoDeExploracion({
  inicial,
  escala,
  puedeEditar,
}: {
  inicial: ExploracionParaLaPantalla;
  escala: EscalaDelLienzo;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [exp, setExp] = useState(inicial);
  const [sinLeer, setSinLeer] = useState(inicial.sinLeer ?? []);
  const [proyectos, setProyectos] = useState(inicial.proyectos ?? []);
  const [guardando, setGuardando] = useState(false);
  const [paso, setPaso] = useState<PasoDelLienzoUI>("exploracion");

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
  const irA = useCallback((p: PasoDelLienzoUI) => {
    setPaso(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const lienzo: Lienzo = {
    exp,
    escala,
    chequeo,
    mapa,
    pendientes,
    revisables,
    sinLeer,
    proyectos,
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
    }).length || undefined;
  // «Usar todas» no toca los casos de uso: esos se eligen uno por uno, en su paso.
  const paraUsarTodas = revisables.filter((it) => it.destino.tipo !== "casoDeUso");

  const pasos = (["exploracion", "escala", "casos", "traspaso"] as const).map((key) => ({
    key,
    label: NOMBRE_DEL_PASO[key],
    count: key === "traspaso" ? undefined : deCadaPaso(key),
  }));

  return (
    <LienzoContexto.Provider value={lienzo}>
      <div className="space-y-5">
        <Resumen sigue={{ ...sigue, paso: sigue.paso === paso ? null : sigue.paso }} nombreDelPaso={(p) => NOMBRE_DEL_PASO[p]} paraUsarTodas={paraUsarTodas} />

        <Tabs<PasoDelLienzoUI> aria-label="Pasos de la exploración" value={paso} onChange={setPaso} items={pasos} />

        {paso === "exploracion" && <PasoExploracion />}
        {paso === "escala" && <PasoEscala />}
        {paso === "casos" && <PasoCasosDeUso />}
        {paso === "traspaso" && <PasoTraspaso />}
      </div>
    </LienzoContexto.Provider>
  );
}
