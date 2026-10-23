"use client";

/**
 * SesionesDeExploracion — la sesión elegida en la barra de la izquierda, con su preparación, su «en
 * vivo» y su análisis (rediseño del 2026-10-07, tableros «Preventa · Sesiones de exploración»; las
 * pestañas se llamaban Antes, Durante y Después hasta el mismo día, y por dentro siguen esas claves).
 * Acá vive el encabezado (el título, si ya ocurrió, la línea de datos y las tres pestañas) y lo que
 * cruza de una sesión a otra: llevar lo que quedó abierto a la siguiente, con de qué sesión viene y a
 * qué apunta. Cada momento está en su archivo: AntesDeLaSesion, DuranteLaSesion y DespuesDeLaSesion.
 * El estado de la guía y su botón viven en la preparación (AntesDeLaSesion › EstadoDeLaGuia).
 *
 * Etapa A (2026-10-09): debajo de los datos, en qué está la reunión de la sesión (los seis estados del
 * tablero Sesion.dc.html: sin reunión, unida a una agendada, esperando la transcripción, leída, sin
 * transcripción ni notas, cancelada en el calendario), sin mentir sobre la lectura sola. Unir o cambiar
 * la reunión abre el selector de «Agregar sesión» en modo «unir».
 */
import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Alert, IconButton, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Persona } from "@/lib/exploraciones/casillas";
import type { Operacion } from "@/lib/exploraciones/contenido";
import { aFecha, diaConAnio, diaCorto, hoyEnCostaRica } from "@/lib/exploraciones/fechas";
import { horario } from "@/lib/exploraciones/inicio";
import {
  DURACION_DE_LA_SESION,
  ETIQUETA_DEL_ESTADO,
  MAX_PARA_EXPLORAR,
  MAX_SESIONES,
  MAX_TITULO_DE_LA_SESION,
  nombreDeLaPestana,
  tituloAGuardar,
  tituloDeLaSesion,
  type EstadoDeLaSesion,
  type OrigenDeReunion,
  type PestanaDeSesion,
  type SesionPlaneada,
} from "@/lib/exploraciones/guia";
import { EVENTO_DEL_RECORRIDO, type AccionDelRecorrido } from "@/lib/recorridos/tipos";
import AntesDeLaSesion from "./AntesDeLaSesion";
import DespuesDeLaSesion, { type Llevar } from "./DespuesDeLaSesion";
import DuranteLaSesion from "./DuranteLaSesion";
import { EquipoDeLaSesion } from "./EquipoDeLaSesion";
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

/** Un punto ámbar: la reunión de la sesión pide algo (o espera). */
function PuntoAmbar() {
  return <span aria-hidden className="h-[7px] w-[7px] flex-none rounded-full bg-warning" />;
}

function IconoDeCalendario({ azul }: { azul: boolean }) {
  return (
    <svg className={cn("h-[15px] w-[15px] flex-none", azul ? "text-brand" : "text-fg-muted")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

/**
 * En qué está la reunión de la sesión, debajo de su línea de datos (los seis estados del tablero
 * Sesion.dc.html, más «solo notas de Gemini»). Lo que ya dice la línea de datos (leída, sin leer, casi
 * sin conversación) no se repite.
 */
function LineaDeLaReunion({ pestana, onSumarMinuta }: { pestana: PestanaDeSesion; onSumarMinuta: () => void }) {
  const { puedeEditar, guardando, sesion: seleccion } = useLienzo();
  const { estadoDeLaReunion } = useSesiones();
  const estado = estadoDeLaReunion(pestana);
  const s = pestana.sesion;
  const e = s?.evento;
  // Unida a una reunión de la agenda de HubSpot (todavía no ocurre): su título lo guardó la sesión al unirla.
  const deHubspot = !e && s?.reunion?.origen === "hubspot";
  const tituloDelEvento = e?.titulo ?? pestana.reunion?.titulo ?? (deHubspot ? (s?.titulo ?? null) : null);
  const donde = deHubspot ? "en HubSpot" : "en el calendario";
  const unida = tituloDelEvento ? `Unida a «${tituloDelEvento}» ${donde}` : deHubspot ? "Unida a una reunión de HubSpot" : "Unida a una reunión del calendario";
  const unir = () => (s ? seleccion.buscarReunion({ tipo: "unir", sesionId: s.id }) : seleccion.buscarReunion({ tipo: "nueva", elegir: true }));
  const enlace = (texto: string, onClick: () => void, fuerte = false) =>
    puedeEditar ? (
      <button type="button" disabled={guardando} className={cn("text-brand hover:underline disabled:opacity-50", fuerte && "font-semibold")} onClick={onClick}>
        {texto}
      </button>
    ) : null;
  /** El ícono y, separadas por «·», las partes que haya (un enlace que no se puede usar no deja un «·» suelto). */
  const linea = (icono: React.ReactNode, ...partes: React.ReactNode[]) => (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg-muted">
      {icono}
      {partes
        .filter((x) => x !== null && x !== false)
        .map((x, i) => (
          <span key={i} className="inline-flex items-center gap-2">
            {i > 0 && <span aria-hidden>·</span>}
            {x}
          </span>
        ))}
    </p>
  );
  switch (estado) {
    case "sinReunion":
      return linea(<IconoDeCalendario azul={false} />, <span className="text-fg-secondary">Sin reunión del calendario</span>, enlace("asociar una reunión", unir, true), "la guía se puede preparar igual");
    case "agendada":
      return (
        <>
          {linea(<IconoDeCalendario azul />, <span className="text-fg-secondary">{unida}</span>, "cuando ocurra, Nexus espera su transcripción y la lee sola", enlace("cambiar reunión", unir))}
          {!deHubspot && <p className="mt-1 text-xs text-fg-muted">Si la mueven en el calendario, la sesión toma la fecha nueva.</p>}
        </>
      );
    case "esperando":
      return linea(<PuntoAmbar />, <span className="font-medium text-warn-ink">Esperando la transcripción</span>, "Meet puede tardar hasta una hora; cuando llegue, el agente la lee solo");
    case "sinTexto":
      return linea(<PuntoAmbar />, <span className="font-medium text-warn-ink">Terminó sin transcripción ni notas de Gemini</span>, enlace("sumar la minuta", onSumarMinuta), "o dile qué pasó con ella");
    case "cancelada":
      return linea(
        <PuntoAmbar />,
        <span className="font-medium text-warn-ink">{e ? `La reunión del ${diaCorto(e.inicio)} se canceló en el calendario` : "La reunión se canceló en el calendario"}</span>,
        "la sesión y su guía siguen",
        enlace("asociar otra reunión", unir, true),
      );
    case "soloNotasSinLeer":
      return linea(<PuntoAmbar />, <span className="font-medium text-warn-ink">Solo notas de Gemini, sin leer</span>, "léela: cuando llegue la transcripción, se vuelve a leer");
    case "leida":
      return e ? linea(<IconoDeCalendario azul={false} />, <span>{unida}</span>) : null;
    default:
      return null;
  }
}

function EncabezadoDeLaSesion({
  pestana,
  momento,
  alMomento,
  onSumarMinuta,
}: {
  pestana: PestanaDeSesion;
  momento: MomentoDeLaSesion;
  alMomento: (m: MomentoDeLaSesion) => void;
  onSumarMinuta: () => void;
}) {
  const { exp, puedeEditar, guardando, sesion: seleccion } = useLienzo();
  const { todas, sesiones, guardar, claveDeLaProxima, proxima, agregar, estadoDe, yaEmpezo } = useSesiones();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  const estado = estadoDe(pestana);
  const s = pestana.sesion;
  const r = pestana.reunion;
  const [editando, setEditando] = useState(false);
  const titulo = tituloDeLaSesion(pestana);
  const [renombrando, setRenombrando] = useState(false);
  const [nombre, setNombre] = useState("");
  const cancelado = useRef(false);
  const cambiarSesion = (nueva: SesionPlaneada) => void guardar(sesiones.map((x) => (x.id === nueva.id ? nueva : x)));

  /**
   * Cambia el nombre de la sesión (Elías, 2026-10-08). Vacío o igual al del calendario, vuelve a seguir
   * el de su reunión. Una reunión que no estaba en tus sesiones, o la próxima sin planear, se vuelve
   * sesión con ese nombre.
   */
  const renombrar = async () => {
    setRenombrando(false);
    if (cancelado.current) return;
    const nuevo = tituloAGuardar(nombre, r?.titulo);
    if (s) {
      if ((s.titulo?.trim() || undefined) === nuevo) return;
      const { titulo: _viejo, ...resto } = s;
      void _viejo;
      cambiarSesion(nuevo ? { ...resto, titulo: nuevo } : resto);
      return;
    }
    if (!nuevo || sesiones.length >= MAX_SESIONES) return;
    const nueva: SesionPlaneada = r
      ? { id: nuevoIdDeSesion(), titulo: nuevo, fecha: hoyEnCostaRica(aFecha(r.fecha)), reunion: { id: r.id, origen: r.origen } }
      : { id: nuevoIdDeSesion(), titulo: nuevo };
    const ok = await guardar([...sesiones, nueva]);
    if (!ok) return;
    seleccion.elegir(nueva.id);
    seleccion.ponerMomento(nueva.id, momento);
  };
  const e = exp.estado;
  const leyendo = corriendo && corrida?.modo === "leer";

  const cambiarReunion = () => {
    if (s) seleccion.buscarReunion({ tipo: "unir", sesionId: s.id });
  };
  const evento = s?.evento;
  const hora = evento && !evento.cancelada ? horario(evento.inicio, evento.fin) : "";

  const enlace = (texto: string, onClick: () => void) => (
    <button type="button" className="text-brand hover:underline" onClick={onClick}>
      {texto}
    </button>
  );

  // La línea de datos de debajo del título: en el análisis, la reunión; en vivo, con quién; en la preparación, cuándo.
  const datos: React.ReactNode[] = [];
  if (momento === "despues" && r) {
    // El nombre del calendario va en el título; acá solo si le cambiaste el nombre a la sesión.
    datos.push(diaLargo(r.fecha), ORIGEN[r.origen]);
    if (titulo !== r.titulo.trim()) datos.push(`en el calendario: «${r.titulo}»`);
    if (r.corta) datos.push(<span className="text-warn-ink">sin transcripción</span>);
    else if (r.texto === "nada" && !r.leida) datos.push(<span className="text-warn-ink">sin transcripción ni notas</span>);
    else datos.push(r.leida ? <span className="text-success-ink">leída por el agente ✓</span> : <span className="text-warn-ink">sin leer</span>);
    // La del mismo día, sin que nadie la eligiera: se dice, para poder cambiarla.
    if (pestana.ligadaPor === "fecha") datos.push("ligada por fecha");
    if (puedeEditar && s) datos.push(enlace("cambiar reunión", cambiarReunion));
  } else if (momento === "despues" && s) {
    datos.push(s.fecha ? diaLargo(s.fecha) : "sin fecha");
    if (hora) datos.push(hora);
    if (evento) datos.push("Google Meet");
  } else if (momento === "durante") {
    const quien = ((e.contenido.casillas.autoridad as Persona[] | undefined) ?? [])[0]?.nombre;
    if (quien) datos.push(`Con ${quien}`);
    datos.push(`${DURACION_DE_LA_SESION} min`, "se guarda solo");
  } else if (s) {
    // Cancelada en el calendario, la sesión vuelve a estar sin agendar (su guía sigue).
    datos.push(s.fecha && !evento?.cancelada ? diaLargo(s.fecha) : "Sin agendar");
    if (hora) datos.push(hora);
    datos.push(`${DURACION_DE_LA_SESION} min`);
    if (puedeEditar) datos.push(enlace(editando ? "listo" : "editar", () => setEditando((x) => !x)));
  } else if (r) {
    // Un prospecto: la reunión entró sola como sesión (se vuelve sesión guardada cuando le escribes algo).
    datos.push(diaLargo(r.fecha), "entró sola como sesión");
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
            {tituloDeLaSesion(p) ? ` · ${tituloDeLaSesion(p)}` : ""}
            {p.fecha ? ` · ${diaCorto(p.fecha)}` : ""}
            {p.clave === claveDeLaProxima ? " · próxima" : ""}
          </option>
        ))}
      </Select>

      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0">
          {/* Con título, el número va arriba, chico; sin título, la sesión se llama «Sesión N». */}
          {titulo && <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{pestana.noSeHizo ? "Sesión" : `Sesión ${pestana.numero}`}</p>}
          <div className="flex flex-wrap items-center gap-2.5">
            {renombrando ? (
              <input
                autoFocus
                className="h-9 w-[28rem] max-w-full rounded-lg border border-line bg-surface px-3 text-[17px] font-semibold text-fg"
                value={nombre}
                maxLength={MAX_TITULO_DE_LA_SESION}
                placeholder={r ? r.titulo : nombreDeLaPestana(pestana)}
                aria-label="Nombre de la sesión"
                disabled={guardando}
                onChange={(ev) => setNombre(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") ev.currentTarget.blur();
                  if (ev.key === "Escape") {
                    cancelado.current = true;
                    ev.currentTarget.blur();
                  }
                }}
                onBlur={() => void renombrar()}
              />
            ) : (
              <h2 className="min-w-0 break-words text-[22px] font-bold leading-7 text-fg">{titulo ?? nombreDeLaPestana(pestana)}</h2>
            )}
            {puedeEditar && !renombrando && (
              <IconButton
                aria-label="Cambiar el nombre de la sesión"
                size="xs"
                disabled={guardando}
                icon={<Pencil className="h-3.5 w-3.5" />}
                onClick={() => {
                  cancelado.current = false;
                  setNombre(titulo ?? "");
                  setRenombrando(true);
                }}
              />
            )}
            <EstadoDeLaSesionChip estado={estado} noSeHizo={pestana.noSeHizo} />
          </div>
          {renombrando && (
            <p className="mt-1 text-[12px] text-fg-muted">
              {r ? `Si lo dejas vacío, vuelve al nombre del calendario: «${r.titulo}».` : `Si lo dejas vacío, se llama «${nombreDeLaPestana(pestana)}».`} Enter guarda; Esc deja el de antes.
            </p>
          )}
          <p className="mt-0.5 text-[13px] text-fg-muted">
            {datos.map((d, i) => (
              <span key={i}>
                {i > 0 && " · "}
                {d}
              </span>
            ))}
          </p>
          {/* Con qué equipo del cliente es (2026-10-23): decide qué pregunta la guía. */}
          <div className="mt-1.5">
            <EquipoDeLaSesion pestana={pestana} momento={momento} />
          </div>
          {momento !== "durante" && <LineaDeLaReunion pestana={pestana} onSumarMinuta={onSumarMinuta} />}
        </div>
        <span className="flex-1" />
        <div data-recorrido="preventa.sesion.momento">
          {/* Preparación, En vivo y Análisis (Elías, 2026-10-07); las claves siguen siendo antes, durante y después. */}
          <Segmentos
            etiqueta="Preparación, en vivo y análisis de la sesión"
            tamano="grande"
            opciones={[
              { clave: "antes", nombre: "Preparación" },
              { clave: "durante", nombre: "En vivo" },
              { clave: "despues", nombre: "Análisis", ...(estado === "ocurrio" || yaEmpezo(pestana) ? {} : { desactivada: "Todavía no ocurre" }) },
            ]}
            valor={momento}
            onCambiar={alMomento}
          />
        </div>
        {momento === "despues" && r && !r.leida && !r.corta && r.texto !== "nada" && puedeEditar && (
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

      {editando && s && (
        <div className="flex flex-wrap items-center gap-2">
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

/** Sin los puntos que ya no están en `explorar`: el registro de dónde viene y a qué apunta cada uno no crece solo. */
function soloLoQueSigue(s: SesionPlaneada): SesionPlaneada {
  const sigue = ([t]: [string, string]) => !!s.explorar?.includes(t);
  const de = Object.fromEntries(Object.entries(s.explorarDe ?? {}).filter(sigue));
  const para = Object.fromEntries(Object.entries(s.explorarPara ?? {}).filter(sigue));
  const { explorarDe: _de, explorarPara: _para, ...resto } = s;
  void _de;
  void _para;
  return { ...resto, ...(Object.keys(de).length ? { explorarDe: de } : {}), ...(Object.keys(para).length ? { explorarPara: para } : {}) };
}

export default function SesionesDeExploracion() {
  const { exp, cambiar, sesion: seleccion } = useLienzo();
  const { lanzar } = useCorrida();
  const { sesiones, hoy, pestanas, activa, esLaProxima, momento, guardar, estadoDeLaReunion } = useSesiones();
  /* «Sumar la minuta» abierto en el análisis de esta sesión (lo abre el enlace del encabezado o el de «¿Qué
     pasó?»). Vive acá porque sumar la minuta de una reunión suelta la vuelve sesión: cambia de pestaña. */
  const [minuta, setMinuta] = useState<string | null>(null);
  const estadoDeLaReunionActiva = estadoDeLaReunion(activa);

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
          explorarPara: { ...(destino.explorarPara ?? {}), ...(llevar.para ? { [llevar.texto]: llevar.para } : {}) },
        })
      : destino;
    lista = siguiente ? lista.map((s) => (s.id === destino.id ? conLoLlevado : s)) : [...lista, conLoLlevado];
    if (lista.length > MAX_SESIONES) return;
    const ops: Operacion[] = [...(llevar?.item ? [{ op: "usar" as const, itemId: llevar.item.id, valor: llevar.item.valor }] : []), { op: "sesiones", sesiones: lista }];
    const ok = await cambiar(ops);
    if (!ok) return;
    if (llevar) {
      // La reunión suelta se volvió sesión: queda elegida, en su análisis.
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
      <EncabezadoDeLaSesion
        pestana={activa}
        momento={momento}
        alMomento={(m) => seleccion.ponerMomento(activa.clave, m)}
        onSumarMinuta={() => {
          setMinuta(activa.sesion?.id ?? activa.clave);
          seleccion.ponerMomento(activa.clave, "despues");
        }}
      />
      {momento === "antes" ? (
        <AntesDeLaSesion key={activa.clave} pestana={activa} esLaProxima={esLaProxima} />
      ) : momento === "durante" ? (
        <DuranteLaSesion key={activa.clave} pestana={activa} esLaProxima={esLaProxima} />
      ) : estadoDeLaReunionActiva === "esperando" ? (
        <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center text-[13px] text-fg-muted">
          Esperando la transcripción. Meet puede tardar hasta una hora; cuando llegue, el agente la lee solo y acá aparece lo que salió.
        </p>
      ) : activa.hecha || estadoDeLaReunionActiva === "sinTexto" ? (
        <DespuesDeLaSesion
          key={activa.clave}
          pestana={activa}
          minutaAbierta={minuta !== null && (minuta === activa.clave || minuta === activa.sesion?.id)}
          onMinuta={setMinuta}
          numeroSiguiente={numeroSiguiente}
          claveSiguiente={siguiente?.clave ?? null}
          llevados={llevados}
          armarLaSiguiente={(l) => void armarLaSiguiente(l)}
          soltar={soltar}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center text-[13px] text-fg-muted">
          Esta sesión todavía no ocurre. Cuando ocurra y llegue su transcripción, acá aparece lo que salió.
        </p>
      )}
    </div>
  );
}
