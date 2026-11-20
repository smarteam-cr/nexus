"use client";

/**
 * components/trivias/ConsolaDelAnfitrion.tsx — la pantalla del anfitrión: la que se comparte en Meet mientras se juega.
 *
 * Un ESCENARIO grande (lo que ve la sala) y debajo la barra de control (lo que toca el anfitrión). «Proyectar» pone el
 * mismo escenario y la misma barra a pantalla completa. Los momentos siguen la máquina de estados de la partida
 * (lib/trivias/reglas.ts › siguientePaso):
 *   sala de espera (código + QR + quién entró) → pregunta con cuenta regresiva → la misma pregunta cerrada, con cuántos
 *   eligieron cada opción y la correcta → los 5 primeros → … → el podio.
 *
 * El estado llega por polling corto (useEstadoEnVivo): más rápido con una pregunta abierta. Cada botón manda `desde`
 * (lo que hay en pantalla); si la partida ya cambió, el servidor responde 409 y la pantalla se pone al día sola. Después
 * de un clic que salió bien, el botón sigue ocupado hasta que llega el estado nuevo: un segundo clic sería otro 409.
 *
 * Quien solo puede leer (sin `trivias.write`) ve el escenario sin los botones que mueven la partida.
 */
import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  ConfirmDialog,
  PantallaCompleta,
  Skeleton,
  SkeletonPanel,
  pedirPantallaCompletaDelNavegador,
  useToast,
} from "@/components/ui";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
import { COLORES_DEL_PODIO } from "@/lib/trivias/colores";
import type { AccionDelAnfitrion } from "@/lib/trivias/schema";
import { ETIQUETA_DEL_TIPO, type EstadoParaAnfitrion, type Posicion } from "@/lib/trivias/tipos";
import { CodigoQr } from "./CodigoQr";
import { CuentaRegresiva, segundosRestantes } from "./CuentaRegresiva";
import { formatearCodigo, formatearPuntos } from "@/lib/trivias/formato";
import { Podio } from "./Podio";
import { TableroDeOpciones } from "./TableroDeOpciones";
import { useAhora, useEstadoEnVivo } from "./useEstadoEnVivo";

interface Props {
  partidaId: string;
  codigo: string;
  titulo: string;
  /** Tiene `trivias.write`: ve los botones que mueven la partida. */
  puedeConducir: boolean;
}

/** Cada cuánto se consulta: más seguido con una pregunta abierta (la cuenta de respuestas sube a la vista de todos). */
function ritmoDeConsulta(e: EstadoParaAnfitrion | null): number {
  if (e?.partida.estado === "PREGUNTA" && !e.partida.cerrada) return 1000;
  if (!e || e.partida.estado === "ESPERA") return 1500;
  return 2000;
}

/** Lo que identifica el momento en pantalla: cambia con cada botón que sale bien. */
function claveDelMomento(e: EstadoParaAnfitrion): string {
  return `${e.partida.estado}|${e.partida.preguntaActual}|${e.partida.cerrada ? 1 : 0}`;
}

// La dirección para el QR sale del navegador (la misma en local, en el 3004 y en producción). En el servidor no hay:
// el QR aparece al hidratar, sin que el HTML del servidor y el del cliente difieran.
const sinSuscripcion = () => () => {};
function useOrigen(): string | null {
  return useSyncExternalStore(sinSuscripcion, () => window.location.origin, () => null);
}

interface BotonPrincipal {
  etiqueta: string;
  accion: AccionDelAnfitrion | "detalle";
  variante: "primary" | "secondary";
  deshabilitado?: boolean;
  /** Por qué está deshabilitado (o qué va a pasar), al lado del botón. */
  motivo?: string;
}

function botonDelMomento(e: EstadoParaAnfitrion, ahora: number): BotonPrincipal {
  const p = e.partida;
  switch (p.estado) {
    case "ESPERA":
      return e.jugadores.length === 0
        ? {
            etiqueta: "Empezar",
            accion: "empezar",
            variante: "primary",
            deshabilitado: true,
            motivo: "Podrás empezar cuando entre al menos una persona.",
          }
        : { etiqueta: "Empezar", accion: "empezar", variante: "primary" };
    case "PREGUNTA":
      if (p.cerrada) return { etiqueta: "Mostrar resultados", accion: "posiciones", variante: "primary" };
      // El reloj llegó a cero y el servidor todavía no lo dijo: en un momento aparece cómo respondieron.
      if (segundosRestantes(p.cierraAt, ahora) === 0) {
        return {
          etiqueta: "Cerrar la pregunta",
          accion: "cerrar",
          variante: "secondary",
          deshabilitado: true,
          motivo: "Se acabó el tiempo.",
        };
      }
      return { etiqueta: "Cerrar la pregunta", accion: "cerrar", variante: "secondary" };
    case "POSICIONES":
      return p.preguntaActual >= p.totalDePreguntas - 1
        ? { etiqueta: "Ver el podio", accion: "terminar", variante: "primary" }
        : { etiqueta: "Siguiente pregunta", accion: "siguiente", variante: "primary" };
    case "FINALIZADA":
      return { etiqueta: "Ver el detalle", accion: "detalle", variante: "primary" };
  }
}

export default function ConsolaDelAnfitrion({ partidaId, codigo, titulo, puedeConducir }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { estado, error, refrescar, ahoraDelServidor } = useEstadoEnVivo<EstadoParaAnfitrion>(
    `/api/trivia/games/${partidaId}`,
    ritmoDeConsulta,
  );
  const abierta = estado?.partida.estado === "PREGUNTA" && !estado.partida.cerrada;
  const reloj = useAhora(ahoraDelServidor, abierta);
  // `useAhora` se queda quieto fuera de una pregunta abierta: al abrirse la siguiente, el estado recién llegado trae
  // la hora del servidor y evita que la cuenta arranque, por un instante, con un número viejo.
  const ahora = Math.max(reloj, estado?.ahora ?? 0);
  const origen = useOrigen();

  const [proyectando, setProyectando] = useState(false);
  const [enviando, setEnviando] = useState<AccionDelAnfitrion | null>(null);
  const [esperandoDesde, setEsperandoDesde] = useState<string | null>(null);
  const [confirmarFin, setConfirmarFin] = useState(false);
  const [abriendoDetalle, startTransition] = useTransition();

  const esperandoEstadoNuevo = estado !== null && esperandoDesde === claveDelMomento(estado);
  const ocupado = enviando !== null || esperandoEstadoNuevo;

  async function avanzar(accion: AccionDelAnfitrion) {
    if (!estado || ocupado) return;
    const desde = claveDelMomento(estado);
    setEnviando(accion);
    try {
      await fetchJson(`/api/trivia/games/${partidaId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion,
          desde: { estado: estado.partida.estado, pregunta: estado.partida.preguntaActual },
        }),
      });
      setEsperandoDesde(desde);
      // Por si el estado nuevo tarda (sin red un momento): el botón no queda ocupado para siempre.
      window.setTimeout(() => setEsperandoDesde((v) => (v === desde ? null : v)), 5000);
      await refrescar();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.info(e.message);
        await refrescar();
      } else {
        toast.error(e instanceof ApiError ? e.message : "No pudimos mover la partida. Prueba de nuevo.");
      }
    } finally {
      setEnviando(null);
    }
  }

  function proyectar() {
    // El navegador solo da la pantalla completa en el mismo clic de la persona.
    pedirPantallaCompletaDelNavegador();
    setProyectando(true);
  }

  if (error?.status === 404) {
    return <Alert variant="danger">No encontramos esa partida.</Alert>;
  }
  if (!estado) {
    if (error) {
      return (
        <Alert variant="danger" title="No pudimos leer la partida">
          {error.mensaje} Lo seguimos intentando.
        </Alert>
      );
    }
    return <EsqueletoDelEscenario />;
  }

  const principal = botonDelMomento(estado, ahora);
  const finalizada = estado.partida.estado === "FINALIZADA";
  // En la tabla de la última pregunta, «Ver el podio» ya termina la partida: no hace falta el otro botón.
  const ultimaTabla = estado.partida.estado === "POSICIONES" && principal.accion === "terminar";
  const mostrarPrincipal = puedeConducir || principal.accion === "detalle";

  function alTocarPrincipal() {
    if (principal.accion === "detalle") startTransition(() => router.refresh());
    else void avanzar(principal.accion);
  }

  const barra = (enProyeccion: boolean) => (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {!enProyeccion && (
          <Button variant="secondary" onClick={proyectar}>
            <IconoProyectar />
            Proyectar
          </Button>
        )}
        {puedeConducir && !finalizada && !ultimaTabla && (
          <Button variant="destructive" onClick={() => setConfirmarFin(true)} disabled={ocupado}>
            Terminar la partida
          </Button>
        )}
        {!puedeConducir && !finalizada && (
          <p className="text-sm text-fg-muted">Puedes mirar la partida; para conducirla necesitas permiso de edición.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {error && (
          <p role="status" className="text-sm text-warn-ink">
            No pudimos actualizar la pantalla; lo seguimos intentando.
          </p>
        )}
        {mostrarPrincipal && principal.motivo && <p className="text-sm text-fg-muted">{principal.motivo}</p>}
        {mostrarPrincipal && (
          <Button
            variant={principal.variante}
            size="lg"
            onClick={alTocarPrincipal}
            disabled={principal.deshabilitado || (principal.accion !== "detalle" && ocupado)}
            loading={
              principal.accion === "detalle"
                ? abriendoDetalle
                : enviando === principal.accion || (esperandoEstadoNuevo && !principal.deshabilitado)
            }
          >
            {principal.etiqueta}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Escenario estado={estado} ahora={ahora} codigo={codigo} origen={origen} className="min-h-[60vh]" />
      {barra(false)}

      {proyectando && (
        <PantallaCompleta etiqueta={`Proyección de la trivia «${titulo}»`}>
          <div className="flex h-full flex-col gap-4 p-4 md:gap-6 md:p-8">
            <div className="flex items-center justify-between gap-4">
              <p className="min-w-0 truncate text-lg font-semibold text-fg">{titulo}</p>
              <Button variant="secondary" size="sm" onClick={() => setProyectando(false)}>
                Salir
              </Button>
            </div>
            <Escenario
              estado={estado}
              ahora={ahora}
              codigo={codigo}
              origen={origen}
              className="min-h-0 flex-1 overflow-y-auto"
            />
            {barra(true)}
          </div>
        </PantallaCompleta>
      )}

      <ConfirmDialog
        open={confirmarFin}
        onCancel={() => setConfirmarFin(false)}
        onConfirm={async () => {
          await avanzar("terminar");
          setConfirmarFin(false);
        }}
        title="¿Terminar la partida?"
        description="Se muestra el podio con los puntos que hay hasta ahora."
        confirmLabel="Terminar la partida"
        variant="destructive"
      />
    </div>
  );
}

// ── El escenario: lo que ve la sala ─────────────────────────────────────────

function Escenario({
  estado,
  ahora,
  codigo,
  origen,
  className,
}: {
  estado: EstadoParaAnfitrion;
  ahora: number;
  codigo: string;
  origen: string | null;
  className?: string;
}) {
  return (
    <section
      aria-label="Pantalla de la partida"
      className={cn("flex flex-col rounded-2xl border border-line bg-surface p-5 sm:p-8 md:p-10", className)}
    >
      {estado.partida.estado === "ESPERA" && (
        <SalaDeEspera codigo={codigo} origen={origen} jugadores={estado.jugadores} />
      )}
      {estado.partida.estado === "PREGUNTA" && <MomentoDePregunta estado={estado} ahora={ahora} codigo={codigo} />}
      {estado.partida.estado === "POSICIONES" && (
        <MomentoDePosiciones
          posiciones={estado.posiciones}
          numero={estado.partida.preguntaActual + 1}
          total={estado.partida.totalDePreguntas}
          codigo={codigo}
        />
      )}
      {estado.partida.estado === "FINALIZADA" && <MomentoDelPodio posiciones={estado.posiciones} />}
    </section>
  );
}

function CabeceraDelMomento({ texto, etiqueta, codigo }: { texto: string; etiqueta?: string; codigo: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold text-fg-secondary md:text-xl">{texto}</span>
        {etiqueta && (
          <span className="rounded-full border border-line bg-surface-muted px-3 py-1 text-sm font-medium text-fg-secondary">
            {etiqueta}
          </span>
        )}
      </div>
      {/* El código sigue a la vista: se puede entrar con la partida empezada. */}
      <span className="rounded-full border border-line bg-surface-muted px-3 py-1 text-sm text-fg-secondary">
        Código <span className="ml-1 font-mono font-bold tracking-wider text-fg">{formatearCodigo(codigo)}</span>
      </span>
    </div>
  );
}

function SalaDeEspera({
  codigo,
  origen,
  jugadores,
}: {
  codigo: string;
  origen: string | null;
  jugadores: { id: string; nombre: string }[];
}) {
  const url = origen ? `${origen}/trivia/play/${codigo}` : null;
  const direccion = origen ? `${origen.replace(/^[a-z]+:\/\//i, "")}/trivia/play` : null;
  const n = jugadores.length;
  return (
    <div className="m-auto flex w-full max-w-5xl flex-col gap-8 md:gap-10">
      <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:gap-12">
        <div className="space-y-6 text-center md:text-left">
          <div className="space-y-1">
            <p className="text-lg text-fg-secondary md:text-xl">Entra desde tu teléfono a</p>
            <p className="break-all text-2xl font-semibold text-fg md:text-4xl">{direccion ?? " "}</p>
          </div>
          <div className="space-y-1">
            <p className="text-lg text-fg-secondary md:text-xl">y escribe el código</p>
            <p className="font-mono text-6xl font-bold tracking-[0.12em] text-brand md:text-8xl">
              {formatearCodigo(codigo)}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          {url ? (
            <CodigoQr
              texto={url}
              etiqueta={`Código QR para entrar a la partida ${formatearCodigo(codigo)}`}
              className="h-60 w-60 rounded-xl border border-line"
            />
          ) : (
            <div className="h-60 w-60 rounded-xl border border-line" aria-hidden="true" />
          )}
          <p className="text-sm text-fg-muted">o apunta la cámara al código</p>
        </div>
      </div>

      <div className="space-y-4 border-t border-line pt-6 md:pt-8">
        <p className="text-center text-xl font-semibold text-fg md:text-2xl" aria-live="polite">
          {n === 0 ? "Esperando a que entren los jugadores…" : n === 1 ? "1 jugador" : `${n} jugadores`}
        </p>
        {n > 0 && (
          <ul className="flex flex-wrap justify-center gap-2 md:gap-3">
            {jugadores.map((j) => (
              <li
                key={j.id}
                className="max-w-full truncate rounded-full border border-line bg-surface-muted px-4 py-2 text-base font-medium text-fg md:text-lg"
              >
                {j.nombre}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function cuantosRespondieron(respondieron: number, jugadores: number): string {
  return `${respondieron} de ${jugadores} ${respondieron === 1 ? "respondió" : "respondieron"}`;
}

function MomentoDePregunta({ estado, ahora, codigo }: { estado: EstadoParaAnfitrion; ahora: number; codigo: string }) {
  const { partida, pregunta, distribucion } = estado;
  if (!pregunta) {
    return <p className="m-auto text-center text-xl text-fg-muted">No pudimos leer esta pregunta.</p>;
  }
  const cerrada = partida.cerrada;
  const encuesta = pregunta.tipo === "ENCUESTA";
  const correctas = cerrada ? pregunta.correctas : null;
  const aciertos =
    cerrada && !encuesta && distribucion && correctas
      ? correctas.reduce((suma, i) => suma + (distribucion[i] ?? 0), 0)
      : null;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-6 md:gap-8">
      <CabeceraDelMomento
        texto={`Pregunta ${pregunta.indice + 1} de ${partida.totalDePreguntas}`}
        etiqueta={ETIQUETA_DEL_TIPO[pregunta.tipo]}
        codigo={codigo}
      />
      <p className="text-balance break-words text-center text-3xl font-semibold leading-tight text-fg md:text-5xl">
        {pregunta.texto}
      </p>
      {cerrada ? (
        <p className="text-center text-lg font-medium text-fg-secondary md:text-xl">
          {encuesta
            ? "Así votaron"
            : (correctas?.length ?? 0) > 1
              ? "Las respuestas correctas"
              : "La respuesta correcta"}
        </p>
      ) : (
        <CuentaRegresiva
          abiertaAt={partida.abiertaAt}
          cierraAt={partida.cierraAt}
          segundos={pregunta.segundos}
          ahora={ahora}
          tamano="lg"
          className="mx-auto w-full max-w-3xl"
        />
      )}
      <TableroDeOpciones
        opciones={pregunta.opciones}
        correctas={correctas}
        distribucion={cerrada ? distribucion : null}
      />
      <p className="text-center text-xl font-semibold tabular-nums text-fg md:text-2xl">
        {cuantosRespondieron(estado.respondieron, estado.jugadores.length)}
        {aciertos !== null && (
          <span className="text-fg-secondary"> · {aciertos === 1 ? "1 acertó" : `${aciertos} acertaron`}</span>
        )}
      </p>
    </div>
  );
}

function MomentoDePosiciones({
  posiciones,
  numero,
  total,
  codigo,
}: {
  posiciones: Posicion[];
  numero: number;
  total: number;
  codigo: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 md:gap-8">
      <CabeceraDelMomento texto={`Después de la pregunta ${numero} de ${total}`} codigo={codigo} />
      <p className="text-center text-4xl font-bold text-fg md:text-5xl">Posiciones</p>
      {posiciones.length === 0 ? (
        <p className="text-center text-xl text-fg-muted">Todavía no hay jugadores en la partida.</p>
      ) : (
        <ol className="space-y-3">
          {posiciones.map((p) => {
            const podio = p.lugar <= 3 ? COLORES_DEL_PODIO[p.lugar - 1] : null;
            return (
              <li
                key={p.jugadorId}
                className="flex items-center gap-4 rounded-2xl border border-line bg-surface-muted px-4 py-3 md:gap-6 md:px-6 md:py-4"
              >
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl font-bold tabular-nums md:h-14 md:w-14 md:text-2xl",
                    !podio && "border border-line bg-surface text-fg",
                  )}
                  style={podio ? { background: podio.fondo, color: podio.texto } : undefined}
                >
                  {p.lugar}
                  <span className="sr-only">.º lugar</span>
                </span>
                <span className="min-w-0 flex-1 truncate text-2xl font-semibold text-fg md:text-3xl">{p.nombre}</span>
                <span className="shrink-0 text-2xl font-bold tabular-nums text-fg md:text-3xl">
                  {formatearPuntos(p.puntos)}
                  <span className="ml-2 text-base font-medium text-fg-muted md:text-lg">puntos</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function MomentoDelPodio({ posiciones }: { posiciones: Posicion[] }) {
  return (
    <div className="m-auto flex w-full max-w-5xl flex-col items-center gap-8 md:gap-12">
      <div className="space-y-1 text-center">
        <p className="text-lg text-fg-secondary md:text-xl">Terminó la trivia</p>
        <p className="text-4xl font-bold text-fg md:text-6xl">Podio</p>
      </div>
      {posiciones.length > 0 ? (
        <Podio posiciones={posiciones} tamano="escenario" className="w-full" />
      ) : (
        <p className="text-xl text-fg-muted">Nadie entró a esta partida.</p>
      )}
    </div>
  );
}

// ── Piezas chicas ───────────────────────────────────────────────────────────

function IconoProyectar() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
    </svg>
  );
}

/** Antes del primer estado: la forma del escenario y de la barra (calza con loading.tsx). */
function EsqueletoDelEscenario() {
  return (
    <div className="space-y-4" aria-busy="true">
      <SkeletonPanel
        minH="min-h-[60vh]"
        className="rounded-2xl"
        bodyClassName="flex flex-col items-center justify-center gap-5 p-8"
      >
        <Skeleton className="h-5 w-56 max-w-full" />
        <Skeleton className="h-12 w-96 max-w-full" delay={60} />
        <Skeleton className="h-5 w-40 max-w-full" delay={120} />
      </SkeletonPanel>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-28" rounded="lg" />
        <Skeleton className="h-10 w-40" rounded="lg" delay={60} />
      </div>
    </div>
  );
}
