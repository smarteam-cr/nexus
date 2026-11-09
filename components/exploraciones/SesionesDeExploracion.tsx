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
import { Link2, LogOut, Pencil, Trash2 } from "lucide-react";
import { Alert, Button, ConfirmDialog, IconButton, Select, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Persona } from "@/lib/exploraciones/casillas";
import type { Operacion } from "@/lib/exploraciones/contenido";
import { aFecha, diaConAnio, diaCorto, hoyEnCostaRica } from "@/lib/exploraciones/fechas";
import { devolverALaExploracion, horario, sacarDeLaExploracion } from "@/lib/exploraciones/inicio";
import { CLAVE_DE_LA_PROXIMA, conLaSesion, enlaceDeLaSesion, type DondeVive } from "@/lib/exploraciones/enlace-de-la-sesion";
import { DURACION_POR_DEFECTO, duracionDeLaSesion } from "@/lib/exploraciones/contexto-de-la-exploracion";
import {
  ETIQUETA_DEL_ESTADO,
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
import DespuesDeLaSesion from "./DespuesDeLaSesion";
import DuranteLaSesion from "./DuranteLaSesion";
import { EquipoDeLaSesion } from "./EquipoDeLaSesion";
import Segmentos from "./Segmentos";
import { useLienzo, type MomentoDeLaSesion } from "./contexto";
import { diaLargo } from "./piezas-de-la-sesion";
import { useCorrida } from "./useCorrida";
import { nuevoIdDeSesion, useSesiones } from "./useSesiones";

const ORIGEN: Record<OrigenDeReunion, string> = { meet: "Google Meet", hubspot: "HubSpot", documento: "sumada a mano" };
/** Cómo se nombra cada pestaña de la sesión en el aviso de «Copiar enlace»: las palabras de los segmentos. */
const NOMBRE_DEL_MOMENTO: Record<MomentoDeLaSesion, string> = { antes: "su Preparación", durante: "En vivo", despues: "su Análisis" };

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
  const { exp, lugar, puedeEditar, guardando, cambiar, reuniones, sesion: seleccion } = useLienzo();
  const { todas, sesiones, guardar, claveDeLaProxima, proxima, agregar, estadoDe, yaEmpezo } = useSesiones();
  const toast = useToast();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  const estado = estadoDe(pestana);
  const s = pestana.sesion;
  const r = pestana.reunion;
  // «Quitar la sesión» (2026-11-08, quinta vuelta): con el diálogo de confirmación de la app, no una línea suelta.
  const [quitando, setQuitando] = useState(false);
  /* Solo una sesión guardada que todavía no pasó: ni la que ocurrió, ni la que ya empezó o espera su transcripción. Una que
     ya pasó se marca «no se hizo» o se saca de la exploración, no se borra. Y solo en la Preparación, como el enlace de antes:
     en «En vivo» se borraría lo marcado durante la llamada (revisión del 2026-11-08). */
  const sePuedeQuitar = puedeEditar && !!s && !pestana.hecha && estado !== "ocurrio" && !yaEmpezo(pestana) && momento === "antes";
  /* «Sacar de la exploración» (9 nov, Elías: «salen 2 sesiones, y no se puede borrar»): la que ya pasó, o la reunión que
     entró sola, se saca desde su propia cabecera y no solo con la X que aparece al pasar el cursor en el inicio de
     Exploración. Lo mismo que esa X (lib/exploraciones/inicio.ts › sacarDeLaExploracion): la reunión no se borra, en un
     prospecto pasa a «Fuera de la exploración», y se deshace desde el aviso. Con confirmación: se va lo que se preparó para
     ella. Ni en la próxima ni «En vivo» (ahí se borraría lo marcado durante la llamada, revisión del 9 nov). */
  const sePuedeSacar =
    puedeEditar && !sePuedeQuitar && momento !== "durante" && pestana.clave !== CLAVE_DE_LA_PROXIMA && pestana.clave !== claveDeLaProxima && (!!r || estado === "ocurrio");
  const [sacando, setSacando] = useState(false);
  const sacar = async () => {
    setSacando(false);
    const { ops, sacadas } = sacarDeLaExploracion(todas, [pestana.clave], exp.automaticas, reuniones);
    if (!ops.length || !(await cambiar(ops))) return;
    seleccion.elegir(claveDeLaProxima);
    toast.success("Sacaste la sesión de la exploración. La reunión no se borra.", {
      action: { label: "Deshacer", onClick: () => void cambiar(devolverALaExploracion(sacadas)) },
    });
  };
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

  /**
   * «Copiar enlace» (Elías, 2026-10-28): la dirección de ESTA sesión en la pestaña que se ve, para pasársela a alguien del
   * equipo. Es interna: quien la abre necesita su sesión de Nexus y acceso a la empresa (lib/exploraciones/enlace-de-la-sesion.ts).
   */
  const copiarEnlace = async () => {
    const donde: DondeVive | null =
      lugar === "preventa"
        ? { lugar: "preventa", exploracionId: exp.id }
        : exp.projectId
          ? { lugar: "proyecto", clientId: exp.empresa.clientId, projectId: exp.projectId }
          : null;
    const url = donde
      ? enlaceDeLaSesion(window.location.origin, donde, pestana.clave, momento)
      : conLaSesion(new URL(window.location.href), pestana.clave, momento).href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Enlace copiado: abre «${titulo ?? nombreDeLaPestana(pestana)}» en ${NOMBRE_DEL_MOMENTO[momento]}.`);
    } catch {
      toast.error("No se pudo copiar el enlace. Cópialo de la barra de direcciones.");
    }
  };

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
    // Con quién: los participantes de su reunión (2026-11-07) o, si no hay, quien decide.
    const quien = s?.conQuien?.[0]?.nombre ?? ((e.contenido.casillas.autoridad as Persona[] | undefined) ?? [])[0]?.nombre;
    if (quien) datos.push(`Con ${quien}`);
    datos.push(`${duracionDeLaSesion(s)} min`, "se guarda solo");
  } else if (s) {
    /* Sin formulario (2026-11-07, Elías): la fecha y la duración salen de la reunión asociada; sin ella, la línea de abajo
       ofrece «asociar una reunión» y acá no se dice «Sin agendar». Lo único que queda a mano es quitar la sesión. */
    if (s.fecha && !evento?.cancelada) datos.push(diaLargo(s.fecha));
    if (hora) datos.push(hora);
    datos.push(`${duracionDeLaSesion(s)} min`);
  } else if (r) {
    // Un prospecto: la reunión entró sola como sesión (se vuelve sesión guardada cuando le escribes algo).
    datos.push(diaLargo(r.fecha), "entró sola como sesión");
  } else {
    if (proxima.desde === "hubspot" && proxima.fecha) datos.push(`agendada en HubSpot para el ${diaConAnio(proxima.fecha)}`);
    datos.push(`${DURACION_POR_DEFECTO} min`);
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
        {/* La próxima sin planear no tiene id todavía: su enlace mañana abriría otra sesión. */}
        {pestana.clave !== CLAVE_DE_LA_PROXIMA && (
          <Button variant="secondary" size="sm" onClick={() => void copiarEnlace()} title="Copia la dirección de esta sesión, en esta pestaña, para pasársela a alguien del equipo">
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            Copiar enlace
          </Button>
        )}
        {sePuedeQuitar && (
          <Button variant="secondary" size="sm" disabled={guardando} onClick={() => setQuitando(true)} title="Quita esta sesión, que todavía no pasó, con su guía">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Quitar la sesión
          </Button>
        )}
        {sePuedeSacar && (
          <Button variant="secondary" size="sm" disabled={guardando} onClick={() => setSacando(true)} title="Saca esta sesión de la exploración. La reunión no se borra">
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Sacar de la exploración
          </Button>
        )}
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

      <ConfirmDialog
        open={sacando}
        title={`¿Sacar «${titulo ?? nombreDeLaPestana(pestana)}» de la exploración?`}
        description={
          exp.automaticas
            ? "La reunión no se borra: pasa a «Fuera de la exploración». Lo que preparaste para esta sesión se va con ella; lo puedes recuperar con «Deshacer» en el aviso."
            : "La reunión no se borra. Lo que preparaste para esta sesión se va con ella; lo puedes recuperar con «Deshacer» en el aviso."
        }
        confirmLabel="Sacar de la exploración"
        onCancel={() => setSacando(false)}
        onConfirm={() => void sacar()}
      />
      {s && (
        <ConfirmDialog
          open={quitando}
          title={`¿Quitar la sesión ${pestana.numero}?`}
          description="Se va con su guía, su objetivo y lo que preparaste para ella. Las sesiones que ya pasaron no se tocan."
          confirmLabel="Quitar la sesión"
          onCancel={() => setQuitando(false)}
          onConfirm={async () => {
            const ok = await guardar(sesiones.filter((x) => x.id !== s.id));
            setQuitando(false);
            if (ok) seleccion.elegir(claveDeLaProxima);
          }}
        />
      )}
    </header>
  );
}

export default function SesionesDeExploracion() {
  const { exp, cambiar, sesion: seleccion } = useLienzo();
  const { sesiones, hoy, pestanas, activa, esLaProxima, momento, estadoDeLaReunion } = useSesiones();
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
   * Abre la siguiente sesión en su Preparación: la próxima planeada después de esta o, si no hay, una nueva (con la fecha
   * del siguiente paso, si se acordó). `extra` va en el mismo cambio (lo que el cliente dijo y nadie siguió: se usa o se
   * descarta, DespuesDeLaSesion.tsx). Lo que queda para la próxima no se copia: la guía lo lee de esta sesión.
   */
  const armarLaSiguiente = async (extra: Operacion[] = []) => {
    const siguiente = siguienteDe()?.sesion ?? null;
    const fechaAcordada = (exp.estado.contenido.casillas.siguientePaso as { fecha?: string } | undefined)?.fecha;
    const destino: SesionPlaneada = siguiente ?? { id: nuevoIdDeSesion(), ...(fechaAcordada && fechaAcordada >= hoy ? { fecha: fechaAcordada } : {}) };
    const lista = siguiente ? sesiones : [...sesiones, destino];
    if (lista.length > MAX_SESIONES) return;
    const ops: Operacion[] = [...extra, ...(siguiente ? [] : [{ op: "agregarSesion" as const, sesion: destino }])];
    if (ops.length && !(await cambiar(ops))) return;
    seleccion.elegir(destino.id);
    seleccion.ponerMomento(destino.id, "antes");
    // La guía ya no se arma sola (2026-11-06): la Preparación pide el contexto de la sesión y la persona la arma.
  };
  const siguiente = siguienteDe();
  const numeroSiguiente = siguiente?.numero ?? Math.max(...pestanas.map((p) => p.numero), activa.numero) + 1;

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
          armarLaSiguiente={(extra) => void armarLaSiguiente(extra)}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center text-[13px] text-fg-muted">
          Esta sesión todavía no ocurre. Cuando ocurra y llegue su transcripción, acá aparece lo que salió.
        </p>
      )}
    </div>
  );
}
