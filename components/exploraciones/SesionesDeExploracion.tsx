"use client";

/**
 * SesionesDeExploracion — la sesión elegida en la barra de la izquierda, con su «antes», su «durante»
 * y su «después» (rediseño del 2026-10-07, tableros «Preventa · Sesiones de exploración»). Acá vive
 * el encabezado (el título, si ya ocurrió, la línea de datos y el control Antes/Durante/Después) y lo
 * que cruza de una sesión a otra: llevar lo que quedó abierto a la siguiente, con de qué sesión viene.
 * Cada momento está en su archivo: AntesDeLaSesion, DuranteLaSesion y DespuesDeLaSesion.
 */
import { useEffect, useState } from "react";
import { Alert, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Persona } from "@/lib/exploraciones/casillas";
import type { Operacion } from "@/lib/exploraciones/contenido";
import { aFecha, diaConAnio, diaCorto, diaYHora, hoyEnCostaRica } from "@/lib/exploraciones/fechas";
import {
  DURACION_DE_LA_SESION,
  ETIQUETA_DEL_ESTADO,
  focoDeLaGuia,
  guiaVieja,
  MAX_PARA_EXPLORAR,
  MAX_SESIONES,
  nombreDeLaPestana,
  type EstadoDeLaSesion,
  type OrigenDeReunion,
  type PestanaDeSesion,
  type SesionPlaneada,
} from "@/lib/exploraciones/guia";
import { EVENTO_DEL_RECORRIDO, type AccionDelRecorrido } from "@/lib/recorridos/tipos";
import AntesDeLaSesion from "./AntesDeLaSesion";
import DespuesDeLaSesion, { type Llevar } from "./DespuesDeLaSesion";
import DuranteLaSesion from "./DuranteLaSesion";
import Segmentos from "./Segmentos";
import { useLienzo, type MomentoDeLaSesion } from "./contexto";
import { diaLargo } from "./piezas-de-la-sesion";
import { useCorrida } from "./useCorrida";
import { nuevoIdDeSesion, useSesiones } from "./useSesiones";

const ORIGEN: Record<OrigenDeReunion, string> = { meet: "Google Meet", hubspot: "HubSpot", documento: "sumada a mano" };

const TONO_DEL_ESTADO: Record<EstadoDeLaSesion, string> = {
  ocurrio: "border-success-line bg-success-surface text-success-ink",
  proxima: "border-info-line bg-info-surface text-brand",
  despues: "border-line bg-surface-muted text-fg-muted",
};

/** Si la sesión ya ocurrió, es la próxima o todavía no ocurre (lib/exploraciones/guia.ts). */
function EstadoDeLaSesionChip({ estado, noSeHizo }: { estado: EstadoDeLaSesion; noSeHizo?: boolean }) {
  if (noSeHizo) return <span className="rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[11.5px] font-semibold text-fg-muted">No se hizo</span>;
  return <span className={cn("rounded-full border px-2 py-0.5 text-[11.5px] font-semibold", TONO_DEL_ESTADO[estado])}>{ETIQUETA_DEL_ESTADO[estado]}</span>;
}

/** El botón blanco con borde del tablero («Rearmar la guía»). */
function BotonClaro({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function EncabezadoDeLaSesion({ pestana, esLaProxima, momento, alMomento }: { pestana: PestanaDeSesion; esLaProxima: boolean; momento: MomentoDeLaSesion; alMomento: (m: MomentoDeLaSesion) => void }) {
  const { exp, escala, mapa, reuniones, puedeEditar, guardando, sesion: seleccion } = useLienzo();
  const { todas, sesiones, guardar, claveDeLaProxima, proxima, agregar, estadoDe } = useSesiones();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  const estado = estadoDe(pestana);
  const s = pestana.sesion;
  const r = pestana.reunion;
  const [editando, setEditando] = useState(false);
  const [cambiandoReunion, setCambiandoReunion] = useState(false);
  const [titulo, setTitulo] = useState(s?.titulo ?? "");
  const [visto, setVisto] = useState(s?.titulo);
  if (visto !== s?.titulo) {
    setVisto(s?.titulo);
    setTitulo(s?.titulo ?? "");
  }
  const cambiarSesion = (nueva: SesionPlaneada) => void guardar(sesiones.map((x) => (x.id === nueva.id ? nueva : x)));
  const guia = esLaProxima ? exp.estado.propuesta.guia : s ? (exp.estado.propuesta.guias[s.id] ?? null) : null;
  const e = exp.estado;
  const foco = focoDeLaGuia(e.contenido.casillas, escala, e.areas, mapa.posiciones, e.contenido.aExplorar);
  const vieja = esLaProxima && !!guia && guiaVieja(guia, foco.huecos, foco.enfoque);
  const leyendo = corriendo && corrida?.modo === "leer";

  const elegirReunion = (valor: string) => {
    if (!s) return;
    const [origen, ...resto] = valor.split(":");
    const reunion = valor ? { id: resto.join(":"), origen: origen as OrigenDeReunion } : undefined;
    void guardar(sesiones.map((x) => (x.id === s.id ? { ...x, reunion } : x)));
    setCambiandoReunion(false);
  };

  const enlace = (texto: string, onClick: () => void) => (
    <button type="button" className="text-brand hover:underline" onClick={onClick}>
      {texto}
    </button>
  );

  // La línea de datos de debajo del título: en el «después», la reunión; en el «durante», con quién; en el «antes», cuándo.
  const datos: React.ReactNode[] = [];
  if (momento === "despues" && r) {
    datos.push(diaLargo(r.fecha), ORIGEN[r.origen], r.titulo);
    if (r.corta) datos.push(<span className="text-warn-ink">sin transcripción</span>);
    else datos.push(r.leida ? <span className="text-success-ink">leída por el agente ✓</span> : <span className="text-warn-ink">sin leer</span>);
    if (puedeEditar && s && reuniones.length > 0) datos.push(enlace("cambiar reunión", () => setCambiandoReunion((x) => !x)));
  } else if (momento === "despues" && s) {
    datos.push(s.fecha ? diaLargo(s.fecha) : "sin fecha", "todavía sin reunión: cuando llegue la transcripción se liga sola");
    if (puedeEditar && reuniones.length > 0) datos.push(enlace("elegirla", () => setCambiandoReunion((x) => !x)));
  } else if (momento === "durante") {
    const quien = ((e.contenido.casillas.autoridad as Persona[] | undefined) ?? [])[0]?.nombre;
    if (quien) datos.push(`Con ${quien}`);
    datos.push(`${DURACION_DE_LA_SESION} min`, "se guarda solo");
  } else if (s) {
    datos.push(s.fecha ? diaLargo(s.fecha) : "Sin agendar");
    if (s.titulo) datos.push(s.titulo);
    datos.push(`${DURACION_DE_LA_SESION} min`);
    if (puedeEditar) datos.push(enlace(editando ? "listo" : "editar", () => setEditando((x) => !x)));
  } else if (r) {
    datos.push(diaLargo(r.fecha), "esta reunión no está en tus sesiones");
    if (puedeEditar && sesiones.length < MAX_SESIONES)
      datos.push(
        enlace("sumarla a mis sesiones", () =>
          void guardar([...sesiones, { id: nuevoIdDeSesion(), titulo: r.titulo.slice(0, 120), fecha: hoyEnCostaRica(aFecha(r.fecha)), reunion: { id: r.id, origen: r.origen } }]),
        ),
      );
  } else {
    datos.push(proxima.desde === "hubspot" && proxima.fecha ? `agendada en HubSpot para el ${diaConAnio(proxima.fecha)}` : "Sin agendar", `${DURACION_DE_LA_SESION} min`);
    if (puedeEditar) datos.push(enlace("ponerle fecha", agregar));
  }

  return (
    <header data-recorrido="preventa.sesion.cabecera" className="space-y-3">
      {/* En pantallas chicas la barra de la izquierda no lista las sesiones: se eligen acá. */}
      <Select className="w-full lg:hidden" aria-label="Elegir la sesión" value={pestana.clave} onChange={(ev) => seleccion.elegir(ev.target.value)}>
        {todas.map((p) => (
          <option key={p.clave} value={p.clave}>
            {nombreDeLaPestana(p)}
            {p.fecha ? ` · ${diaCorto(p.fecha)}` : ""}
            {p.clave === claveDeLaProxima ? " · próxima" : ""}
          </option>
        ))}
      </Select>

      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-[22px] font-bold leading-7 text-fg">{nombreDeLaPestana(pestana)}</h2>
            <EstadoDeLaSesionChip estado={estado} noSeHizo={pestana.noSeHizo} />
          </div>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            {datos.map((d, i) => (
              <span key={i}>
                {i > 0 && " · "}
                {d}
              </span>
            ))}
          </p>
        </div>
        <span className="flex-1" />
        <div data-recorrido="preventa.sesion.momento">
          <Segmentos
            etiqueta="Antes, durante y después de la sesión"
            opciones={[
              { clave: "antes", nombre: "Antes" },
              { clave: "durante", nombre: "Durante" },
              { clave: "despues", nombre: "Después", ...(estado === "ocurrio" ? {} : { desactivada: "Todavía no ocurre" }) },
            ]}
            valor={momento}
            onCambiar={alMomento}
          />
        </div>
        {momento === "antes" && esLaProxima && puedeEditar && (
          <BotonClaro disabled={lanzando || corriendo} onClick={() => void lanzar("guia")} title={guia ? (vieja ? "La guía es de antes de lo último que se supo" : `Guía armada el ${diaYHora(guia.en)}`) : "Todavía es la guía de base"}>
            {lanzando ? "Armando…" : guia ? "Rearmar la guía" : "Armar la guía"}
          </BotonClaro>
        )}
        {momento === "despues" && r && !r.leida && !r.corta && puedeEditar && (
          <button
            type="button"
            disabled={lanzando || corriendo}
            onClick={() => void lanzar("leer", r.origen === "meet" ? { sesionId: r.id } : {})}
            className="rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
          >
            {leyendo ? "Leyendo…" : "Leer con el agente"}
          </button>
        )}
      </div>

      {leyendo && (
        <p className="text-[13px] text-fg-secondary" role="status">
          El agente está leyendo: {corrida?.fase ?? "empezando…"}
        </p>
      )}
      {corrida?.estado === "ERROR" && corrida.modo === "leer" && <Alert variant="danger">{corrida.error}</Alert>}

      {cambiandoReunion && s && (
        <Select
          className="w-auto max-w-md text-[13px]"
          aria-label="Elegir la reunión de esta sesión"
          disabled={guardando}
          value={s.reunion ? `${s.reunion.origen}:${s.reunion.id}` : ""}
          onChange={(ev) => elegirReunion(ev.target.value)}
        >
          <option value="">La del mismo día</option>
          {reuniones.map((x) => (
            <option key={`${x.origen}:${x.id}`} value={`${x.origen}:${x.id}`}>
              {diaCorto(x.fecha)} · {x.titulo.slice(0, 60)}
            </option>
          ))}
        </Select>
      )}

      {editando && s && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="h-9 w-72 max-w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-fg"
            value={titulo}
            placeholder="De qué va esta sesión (opcional)"
            aria-label={`Tema de la sesión ${pestana.numero}`}
            onChange={(ev) => setTitulo(ev.target.value)}
            onBlur={() => {
              const t = titulo.trim();
              if (t !== (s.titulo ?? "")) cambiarSesion({ ...s, ...(t ? { titulo: t } : { titulo: undefined }) });
            }}
          />
          <input
            type="date"
            className="h-9 rounded-lg border border-line bg-surface px-3 text-[13px] text-fg"
            value={s.fecha ?? ""}
            disabled={guardando}
            aria-label={`Fecha de la sesión ${pestana.numero}`}
            onChange={(ev) => cambiarSesion({ ...s, fecha: ev.target.value || undefined })}
          />
          <button
            type="button"
            className="text-xs text-fg-muted hover:text-fg hover:underline"
            disabled={guardando}
            onClick={() => {
              void guardar(sesiones.filter((x) => x.id !== s.id));
              seleccion.elegir(claveDeLaProxima);
              setEditando(false);
            }}
          >
            Quitar la sesión
          </button>
        </div>
      )}
    </header>
  );
}

/** Sin los puntos que ya no están en `explorar`: el registro de dónde viene cada uno no crece solo. */
function soloLoQueSigue(s: SesionPlaneada): SesionPlaneada {
  const de = Object.fromEntries(Object.entries(s.explorarDe ?? {}).filter(([t]) => s.explorar?.includes(t)));
  const { explorarDe: _viejo, ...resto } = s;
  void _viejo;
  return Object.keys(de).length ? { ...resto, explorarDe: de } : resto;
}

export default function SesionesDeExploracion() {
  const { exp, cambiar, sesion: seleccion } = useLienzo();
  const { lanzar } = useCorrida();
  const { sesiones, hoy, pestanas, activa, esLaProxima, momento, guardar } = useSesiones();

  // El recorrido de la preventa muestra los tres momentos de la sesión abierta (lib/recorridos/contenido/preventa.ts).
  const ponerMomento = seleccion.ponerMomento;
  const claveActiva = activa.clave;
  useEffect(() => {
    const alPedido = (e: Event) => {
      const a = (e as CustomEvent<AccionDelRecorrido>).detail;
      if (a?.evento === "preventa.momento" && (a.valor === "antes" || a.valor === "durante" || a.valor === "despues")) ponerMomento(claveActiva, a.valor);
    };
    window.addEventListener(EVENTO_DEL_RECORRIDO, alPedido);
    return () => window.removeEventListener(EVENTO_DEL_RECORRIDO, alPedido);
  }, [ponerMomento, claveActiva]);

  /** La siguiente sesión: la próxima planeada después de esta que todavía no pasó. */
  const siguienteDe = () => {
    const idx = pestanas.findIndex((p) => p.clave === activa.clave);
    return pestanas.slice(idx + 1).find((p) => p.sesion && !p.hecha) ?? null;
  };

  /**
   * Lleva un punto de «Quedó abierto» a la siguiente sesión (o, sin `llevar`, la abre y le pide la
   * guía al agente). La siguiente es la próxima planeada después de esta o, si no hay, una nueva (con
   * la fecha del siguiente paso, si se acordó). Cada punto recuerda de qué sesión viene: si esta es
   * una reunión suelta, se vuelve sesión en el mismo cambio.
   */
  const armarLaSiguiente = async (llevar?: Llevar) => {
    let lista: SesionPlaneada[] = [...sesiones];
    let origenId = activa.sesion?.id ?? null;
    if (llevar && !origenId && activa.reunion && lista.length < MAX_SESIONES) {
      const r = activa.reunion;
      const nueva: SesionPlaneada = { id: nuevoIdDeSesion(), reunion: { id: r.id, origen: r.origen }, fecha: hoyEnCostaRica(aFecha(r.fecha)) };
      lista.push(nueva);
      origenId = nueva.id;
    }
    const siguiente = siguienteDe()?.sesion ?? null;
    const fechaAcordada = (exp.estado.contenido.casillas.siguientePaso as { fecha?: string } | undefined)?.fecha;
    const destino: SesionPlaneada = siguiente ?? { id: nuevoIdDeSesion(), ...(fechaAcordada && fechaAcordada >= hoy ? { fecha: fechaAcordada } : {}) };
    const conLoLlevado = llevar
      ? soloLoQueSigue({
          ...destino,
          explorar: [...(destino.explorar ?? []).filter((x) => x !== llevar.texto), llevar.texto].slice(-MAX_PARA_EXPLORAR),
          explorarDe: { ...(destino.explorarDe ?? {}), ...(origenId ? { [llevar.texto]: origenId } : {}) },
        })
      : destino;
    lista = siguiente ? lista.map((s) => (s.id === destino.id ? conLoLlevado : s)) : [...lista, conLoLlevado];
    if (lista.length > MAX_SESIONES) return;
    const ops: Operacion[] = [...(llevar?.item ? [{ op: "usar" as const, itemId: llevar.item.id, valor: llevar.item.valor }] : []), { op: "sesiones", sesiones: lista }];
    const ok = await cambiar(ops);
    if (!ok) return;
    if (llevar) {
      // La reunión suelta se volvió sesión: queda elegida, en su «después».
      if (!activa.sesion && origenId) {
        seleccion.elegir(origenId);
        seleccion.ponerMomento(origenId, "despues");
      }
      return;
    }
    seleccion.elegir(destino.id);
    seleccion.ponerMomento(destino.id, "antes");
    void lanzar("guia");
  };
  /** Desmarca un punto: sale de la sesión a la que se había llevado. */
  const soltar = (texto: string) =>
    void guardar(sesiones.map((s) => (s.explorar?.includes(texto) ? soloLoQueSigue({ ...s, explorar: s.explorar.filter((x) => x !== texto) }) : s)));

  const siguiente = siguienteDe();
  const numeroSiguiente = siguiente?.numero ?? Math.max(...pestanas.map((p) => p.numero), activa.numero) + 1;
  const llevados = siguiente?.sesion && activa.sesion ? Object.values(siguiente.sesion.explorarDe ?? {}).filter((id) => id === activa.sesion?.id).length : 0;

  return (
    <div className="space-y-5">
      <EncabezadoDeLaSesion pestana={activa} esLaProxima={esLaProxima} momento={momento} alMomento={(m) => seleccion.ponerMomento(activa.clave, m)} />
      {momento === "antes" ? (
        <AntesDeLaSesion key={activa.clave} pestana={activa} esLaProxima={esLaProxima} />
      ) : momento === "durante" ? (
        <DuranteLaSesion key={activa.clave} pestana={activa} esLaProxima={esLaProxima} />
      ) : activa.hecha ? (
        <DespuesDeLaSesion
          key={activa.clave}
          pestana={activa}
          numeroSiguiente={numeroSiguiente}
          claveSiguiente={siguiente?.clave ?? null}
          llevados={llevados}
          armarLaSiguiente={(l) => void armarLaSiguiente(l)}
          soltar={soltar}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center text-[13px] text-fg-muted">
          Esta sesión todavía no ocurre. Cuando llegue su reunión de Meet o HubSpot, o la sumes en «Contexto adicional», acá aparece lo que salió.
        </p>
      )}
    </div>
  );
}
