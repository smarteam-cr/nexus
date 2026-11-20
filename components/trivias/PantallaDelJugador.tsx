"use client";

/**
 * components/trivias/PantallaDelJugador.tsx — el teléfono de quien juega una trivia (/trivia/play/[code]).
 *
 * Entra a la partida con su usuario de Nexus (POST …/join, sin apodos) y desde ahí consulta el estado en vivo
 * (useEstadoEnVivo). Cada momento de la partida es una vista: la sala de espera, la pregunta con sus botones de
 * colores, «respuesta enviada», el resultado de la pregunta, las posiciones y el final.
 *
 * - La hora que manda es la del SERVIDOR: la cuenta regresiva llega a cero cuando el servidor deja de aceptar
 *   respuestas, y con el tiempo en cero los botones se apagan aunque la consulta todavía no haya vuelto.
 * - Al tocar una opción se bloquean todas en el acto (un toque, una respuesta) y se muestra «enviada» apenas el
 *   servidor la acepta, sin esperar a la próxima consulta.
 * - Mientras dura la partida se pide que la pantalla no se apague (Wake Lock), si el navegador lo permite.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Clock, Flag, Hourglass, Lock, SearchX, Users, Vote, WifiOff, X } from "lucide-react";
import { Alert, Button, Skeleton, buttonVariants, useToast } from "@/components/ui";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
import { COLORES_DEL_PODIO, colorDeOpcion } from "@/lib/trivias/colores";
import { formatearPuntos } from "@/lib/trivias/formato";
import { tieneMedalla } from "@/lib/trivias/reglas";
import type { EstadoParaJugador, PreguntaVisible } from "@/lib/trivias/tipos";
import { CuentaRegresiva, segundosRestantes } from "./CuentaRegresiva";
import { useAhora, useEstadoEnVivo } from "./useEstadoEnVivo";

// ── Piezas chicas ───────────────────────────────────────────────────────────

const numero = formatearPuntos;

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] || nombre;

const MEDALLA = ["🥇", "🥈", "🥉"] as const;
const NOMBRE_DE_LA_MEDALLA = ["oro", "plata", "bronce"] as const;

/**
 * Cada segundo en la sala de espera y en las posiciones: de ahí sale la pregunta siguiente, y en «velocidad» verla
 * tarde cuesta puntos (los cuenta el servidor desde que se abrió). Con la pregunta en pantalla, cada segundo y medio
 * alcanza (la cuenta regresiva corre sola); con la pregunta cerrada, cada dos.
 */
function ritmoDelJugador(e: EstadoParaJugador | null): number {
  if (!e) return 1000;
  const { estado, cerrada } = e.partida;
  if (estado === "ESPERA" || estado === "POSICIONES") return 1000;
  if (estado === "PREGUNTA" && !cerrada) return 1500;
  // La partida terminó: nada va a cambiar, solo se mira de vez en cuando.
  if (estado === "FINALIZADA") return 10_000;
  return 2000;
}

/** La sesión venció (el portero contestó con la página de entrada): al login, y de vuelta acá. */
function irAlLogin() {
  window.location.href = `/?next=${encodeURIComponent(window.location.pathname)}`;
}

const ICONO_DEL_AVISO = {
  candado: Lock,
  buscar: SearchX,
  bandera: Flag,
  reloj: Hourglass,
  "sin-conexion": WifiOff,
} as const;

/** Una pantalla simple de aviso (sin partida que mostrar). La usan también las páginas del servidor. */
export function AvisoDelJuego({
  titulo,
  texto,
  icono = "bandera",
  enlaceAEntrar = false,
  children,
}: {
  titulo: string;
  texto?: string;
  icono?: keyof typeof ICONO_DEL_AVISO;
  /** Muestra el botón para escribir otro código (/trivia/play). */
  enlaceAEntrar?: boolean;
  children?: ReactNode;
}) {
  const Icono = ICONO_DEL_AVISO[icono];
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-5 px-4 py-10 text-center">
      <span
        className="flex size-16 items-center justify-center rounded-2xl border border-line bg-surface-muted text-fg-muted"
        aria-hidden="true"
      >
        <Icono className="size-7" strokeWidth={1.75} />
      </span>
      <div className="space-y-2">
        <h1 className="text-xl font-bold text-fg">{titulo}</h1>
        {texto && <p className="text-sm leading-relaxed text-fg-muted">{texto}</p>}
      </div>
      {children}
      {enlaceAEntrar && (
        <Link
          href="/trivia/play"
          className={cn(buttonVariants({ variant: "primary", size: "lg" }), "h-12 w-full text-base")}
        >
          Escribir otro código
        </Link>
      )}
    </div>
  );
}

// ── Entrar ──────────────────────────────────────────────────────────────────

type Entrada =
  | { fase: "entrando" }
  | { fase: "dentro"; inicial: EstadoParaJugador; enviadoEn: number; recibidoEn: number }
  | { fase: "terminada" }
  | { fase: "no-existe" }
  | { fase: "error"; mensaje: string };

export function PantallaDelJugador({ codigo, nombre }: { codigo: string; nombre: string }) {
  const [entrada, setEntrada] = useState<Entrada>({ fase: "entrando" });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    const enviadoEn = Date.now();
    fetchJson<EstadoParaJugador>(`/api/trivia/play/${codigo}/join`, { method: "POST" })
      .then((estado) => {
        if (!vigente) return;
        // Sin `ahora` no es un estado: el portero devolvió la página de entrada porque la sesión venció.
        if (!estado || typeof estado.ahora !== "number" || !estado.partida) {
          irAlLogin();
          return;
        }
        setEntrada({ fase: "dentro", inicial: estado, enviadoEn, recibidoEn: Date.now() });
      })
      .catch((e: unknown) => {
        if (!vigente) return;
        if (e instanceof ApiError && e.status === 409) setEntrada({ fase: "terminada" });
        else if (e instanceof ApiError && e.status === 404) setEntrada({ fase: "no-existe" });
        else setEntrada({ fase: "error", mensaje: e instanceof ApiError ? e.message : "No pudimos entrar a la partida." });
      });
    return () => {
      vigente = false;
    };
  }, [codigo, intento]);

  if (entrada.fase === "dentro") {
    return (
      <PartidaEnVivo
        codigo={codigo}
        nombre={nombre}
        inicial={entrada.inicial}
        enviadoEn={entrada.enviadoEn}
        recibidoEn={entrada.recibidoEn}
      />
    );
  }
  if (entrada.fase === "entrando") return <Entrando />;
  if (entrada.fase === "terminada") {
    return (
      <AvisoDelJuego
        icono="bandera"
        titulo="Esta partida ya terminó"
        texto="Ya no se puede entrar a esta. Pídele a quien conduce la trivia el código de la próxima."
        enlaceAEntrar
      />
    );
  }
  if (entrada.fase === "no-existe") return <NoHayPartida codigo={codigo} />;
  return (
    <AvisoDelJuego icono="sin-conexion" titulo="No pudimos entrar a la partida" texto={entrada.mensaje}>
      <Button
        variant="primary"
        size="lg"
        className="h-12 w-full text-base"
        onClick={() => {
          setEntrada({ fase: "entrando" });
          setIntento((i) => i + 1);
        }}
      >
        Intentar de nuevo
      </Button>
    </AvisoDelJuego>
  );
}

function NoHayPartida({ codigo }: { codigo: string }) {
  return (
    <AvisoDelJuego
      icono="buscar"
      titulo="No hay una partida con ese código"
      texto={`Revisa que ${codigo} sea el código que muestra la pantalla de la trivia.`}
      enlaceAEntrar
    />
  );
}

/** Mientras entra: la forma de la sala de espera. */
function Entrando() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-4 py-10"
    >
      <span className="sr-only">Entrando a la partida…</span>
      <Skeleton className="size-12" rounded="full" />
      <Skeleton className="h-7 w-3/4" delay={40} />
      <Skeleton className="h-4 w-1/2" delay={80} />
      <Skeleton className="mt-4 h-9 w-56" rounded="full" delay={120} />
    </div>
  );
}

// ── La partida en vivo ──────────────────────────────────────────────────────

/** La respuesta que este teléfono mandó a una pregunta (antes de que la consulta en vivo la traiga). */
interface Envio {
  pregunta: number;
  opcion: number;
  /** El servidor ya la aceptó. */
  confirmada: boolean;
}

function PartidaEnVivo({
  codigo,
  nombre,
  inicial,
  enviadoEn,
  recibidoEn,
}: {
  codigo: string;
  nombre: string;
  inicial: EstadoParaJugador;
  enviadoEn: number;
  recibidoEn: number;
}) {
  const toast = useToast();
  const {
    estado: enVivo,
    error,
    refrescar,
    aplicar,
    ahoraDelServidor,
  } = useEstadoEnVivo<EstadoParaJugador>(`/api/trivia/play/${codigo}`, ritmoDelJugador);

  // Lo que trajo «entrar» se ve ya y corrige el reloj; la primera consulta en vivo lo reemplaza.
  useEffect(() => {
    aplicar(inicial, enviadoEn, recibidoEn);
  }, [aplicar, inicial, enviadoEn, recibidoEn]);

  const estado = enVivo ?? inicial;
  const { partida, pregunta, yo } = estado;
  const abierta = partida.estado === "PREGUNTA" && !partida.cerrada && pregunta !== null;
  const reloj = useAhora(ahoraDelServidor, abierta);
  // El reloj queda quieto mientras no hay pregunta: al abrirse una, nunca puede ir detrás de la última consulta.
  const ahora = Math.max(reloj, estado.ahora);
  const sinTiempo = abierta && segundosRestantes(partida.cierraAt, ahora) === 0;

  // Se acabó el tiempo en este teléfono: se pregunta ya por el resultado, sin esperar la vuelta normal.
  useEffect(() => {
    if (!sinTiempo) return;
    const t = window.setTimeout(() => void refrescar(), 350);
    return () => window.clearTimeout(t);
  }, [sinTiempo, refrescar]);

  // ── Responder ──
  const [envio, setEnvio] = useState<Envio | null>(null);
  const enviandoEn = useRef<number | null>(null);
  const indice = pregunta?.indice ?? -1;
  const miEnvio = envio && envio.pregunta === indice ? envio : null;

  const responder = useCallback(
    async (preguntaIndice: number, opcion: number) => {
      if (enviandoEn.current === preguntaIndice) return; // dos toques seguidos: vale el primero
      enviandoEn.current = preguntaIndice;
      setEnvio({ pregunta: preguntaIndice, opcion, confirmada: false });
      try {
        const r = await fetchJson<{ ok?: boolean }>(`/api/trivia/play/${codigo}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pregunta: preguntaIndice, opcion }),
        });
        if (r.ok !== true) {
          irAlLogin();
          return;
        }
        setEnvio({ pregunta: preguntaIndice, opcion, confirmada: true });
      } catch (e) {
        setEnvio(null);
        if (e instanceof ApiError && e.status === 409) toast.info(e.message);
        else toast.error(e instanceof ApiError ? e.message : "No se pudo enviar tu respuesta. Prueba de nuevo.");
      } finally {
        if (enviandoEn.current === preguntaIndice) enviandoEn.current = null;
      }
      void refrescar();
    },
    [codigo, refrescar, toast],
  );

  // ── Que la pantalla no se apague mientras dura la partida ──
  const terminada = partida.estado === "FINALIZADA";
  useEffect(() => {
    if (terminada || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let vigente = true;
    let candado: WakeLockSentinel | null = null;
    const pedir = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const nuevo = await navigator.wakeLock.request("screen");
        if (!vigente) {
          void nuevo.release();
          return;
        }
        candado = nuevo;
      } catch {
        // Sin permiso o con ahorro de batería: la pantalla se apaga como siempre.
      }
    };
    void pedir();
    // El navegador suelta el candado al esconder la pestaña; al volver se pide de nuevo.
    document.addEventListener("visibilitychange", pedir);
    return () => {
      vigente = false;
      document.removeEventListener("visibilitychange", pedir);
      candado?.release().catch(() => undefined);
    };
  }, [terminada]);

  if (error?.status === 404) return <NoHayPartida codigo={codigo} />;

  const puntos = yo?.puntos ?? 0;
  const lugar = yo?.lugar ?? null;
  const jugadores = yo?.jugadores ?? 0;
  const quien = primerNombre(yo?.nombre ?? nombre);

  let momento: ReactNode;
  let clave: string;
  if (partida.estado === "FINALIZADA") {
    clave = "final";
    momento = (
      <Final
        quien={quien}
        puntos={puntos}
        lugar={lugar}
        jugadores={jugadores}
        empezo={partida.abiertaAt !== null}
      />
    );
  } else if (partida.estado === "ESPERA" || !pregunta) {
    clave = "espera";
    momento = <SalaDeEspera quien={quien} jugadores={jugadores} codigo={partida.codigo} />;
  } else if (abierta) {
    const elegida = estado.miRespuesta?.opcion ?? (miEnvio?.confirmada ? miEnvio.opcion : null);
    if (elegida !== null) {
      clave = `enviada-${pregunta.indice}`;
      momento = (
        <RespuestaEnviada
          pregunta={pregunta}
          opcion={elegida}
          abiertaAt={partida.abiertaAt}
          cierraAt={partida.cierraAt}
          ahora={ahora}
        />
      );
    } else {
      clave = `pregunta-${pregunta.indice}`;
      momento = (
        <PreguntaAbierta
          pregunta={pregunta}
          total={partida.totalDePreguntas}
          abiertaAt={partida.abiertaAt}
          cierraAt={partida.cierraAt}
          ahora={ahora}
          sinTiempo={sinTiempo}
          envio={miEnvio}
          onElegir={responder}
        />
      );
    }
  } else {
    const veredicto = veredictoDe(estado, pregunta, miEnvio?.confirmada === true);
    const comun = {
      pregunta,
      total: partida.totalDePreguntas,
      veredicto,
      correctas: estado.correctas ?? [],
      miOpcion: estado.miRespuesta?.opcion ?? null,
      puntos,
      lugar,
      jugadores,
    };
    if (partida.estado === "POSICIONES") {
      clave = `posiciones-${pregunta.indice}`;
      momento = <Posiciones {...comun} esUltima={pregunta.indice >= partida.totalDePreguntas - 1} />;
    } else {
      clave = `resultado-${pregunta.indice}`;
      momento = <Resultado {...comun} />;
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center gap-3 px-4 py-2.5">
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{partida.titulo}</h1>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold tabular-nums text-brand-dark">
            <span>{numero(puntos)} pts</span>
            {lugar !== null && (
              <span className="border-l border-brand/30 pl-1.5">
                <span className="sr-only">lugar </span>#{lugar}
              </span>
            )}
          </span>
        </div>
      </header>

      {error && (
        <div className="mx-auto w-full max-w-md px-4 pt-3">
          <Alert variant="warning">{error.mensaje} Seguimos intentando.</Alert>
        </div>
      )}

      <section aria-live="polite" className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8 pt-5">
        <div key={clave} className="flex flex-1 flex-col">
          {momento}
        </div>
      </section>
    </div>
  );
}

// ── La sala de espera ───────────────────────────────────────────────────────

function SalaDeEspera({ quien, jugadores, codigo }: { quien: string; jugadores: number; codigo: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6 text-center">
      <span
        className="flex size-20 items-center justify-center rounded-full bg-success-surface text-success-ink"
        aria-hidden="true"
      >
        <Check className="size-10" strokeWidth={2.5} />
      </span>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-fg">¡Ya estás dentro, {quien}!</h2>
        <p className="text-base text-fg-secondary">Espera a que empiece la trivia.</p>
      </div>
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-2.5 rounded-full bg-brand motion-safe:animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-muted px-4 py-2 text-sm text-fg-secondary">
        <Users className="size-4 shrink-0" aria-hidden="true" />
        {jugadores <= 1 ? "Por ahora solo estás tú en la sala" : `Ya hay ${numero(jugadores)} jugadores en la sala`}
      </p>
      <div className="space-y-1 text-xs text-fg-muted">
        <p>Deja esta pantalla abierta: las preguntas aparecen solas.</p>
        <p>
          Código de la partida{" "}
          <span className="font-mono font-semibold tracking-widest text-fg-secondary">{codigo}</span>
        </p>
      </div>
    </div>
  );
}

// ── La pregunta abierta ─────────────────────────────────────────────────────

function EncabezadoDePregunta({ pregunta, total }: { pregunta: PreguntaVisible; total: number }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
      Pregunta {pregunta.indice + 1} de {total}
      {pregunta.tipo === "ENCUESTA" && " · Encuesta"}
    </p>
  );
}

function PreguntaAbierta({
  pregunta,
  total,
  abiertaAt,
  cierraAt,
  ahora,
  sinTiempo,
  envio,
  onElegir,
}: {
  pregunta: PreguntaVisible;
  total: number;
  abiertaAt: number | null;
  cierraAt: number | null;
  ahora: number;
  sinTiempo: boolean;
  envio: Envio | null;
  onElegir: (pregunta: number, opcion: number) => void;
}) {
  const esVerdaderoFalso = pregunta.tipo === "VERDADERO_FALSO";
  const bloqueada = sinTiempo || envio !== null;
  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="space-y-2">
        <EncabezadoDePregunta pregunta={pregunta} total={total} />
        <h2 className="break-words text-xl font-semibold leading-snug text-fg">{pregunta.texto}</h2>
        {pregunta.tipo === "ENCUESTA" && (
          <p className="text-sm text-fg-muted">No hay respuesta correcta: elige la que más se parezca a lo que piensas.</p>
        )}
      </div>

      <CuentaRegresiva abiertaAt={abiertaAt} cierraAt={cierraAt} segundos={pregunta.segundos} ahora={ahora} />

      <div
        role="group"
        aria-label="Opciones"
        className={cn("grid gap-3", esVerdaderoFalso ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2")}
      >
        {pregunta.opciones.map((texto, i) => (
          <BotonDeOpcion
            key={i}
            indice={i}
            texto={texto}
            vertical={esVerdaderoFalso}
            disabled={bloqueada}
            apagada={sinTiempo || (envio !== null && envio.opcion !== i)}
            enviando={envio?.opcion === i && !envio.confirmada}
            onClick={() => onElegir(pregunta.indice, i)}
          />
        ))}
      </div>

      <p className="min-h-5 text-center text-sm text-fg-muted">
        {sinTiempo
          ? "Se acabó el tiempo. Ya viene el resultado…"
          : envio
            ? "Enviando tu respuesta…"
            : "Toca una opción. Solo puedes responder una vez."}
      </p>
    </div>
  );
}

function BotonDeOpcion({
  indice,
  texto,
  vertical,
  disabled,
  apagada,
  enviando,
  onClick,
}: {
  indice: number;
  texto: string;
  vertical: boolean;
  disabled: boolean;
  apagada: boolean;
  enviando: boolean;
  onClick: () => void;
}) {
  const color = colorDeOpcion(indice);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Opción ${color.letra}: ${texto}`}
      style={{ background: color.fondo, color: color.texto }}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-base font-semibold leading-snug shadow-md",
        "transition-[opacity,transform,filter] duration-150 select-none touch-manipulation",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "enabled:hover:brightness-110 enabled:active:scale-[0.97] disabled:cursor-not-allowed",
        vertical ? "min-h-[120px] flex-col justify-center text-center" : "min-h-[72px] text-left",
        apagada && "opacity-35 shadow-none",
        enviando && "ring-4 ring-fg/25 ring-offset-2 ring-offset-surface",
      )}
    >
      <LetraDeOpcion letra={color.letra} />
      <span className="min-w-0 flex-1 break-words">{texto}</span>
      {enviando && (
        <span
          className="size-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

function LetraDeOpcion({ letra }: { letra: string }) {
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-black/20 text-lg font-bold"
      aria-hidden="true"
    >
      {letra}
    </span>
  );
}

/** Una opción mostrada (no se toca): la que elegiste, o la correcta. */
function FichaDeOpcion({ indice, texto }: { indice: number; texto: string }) {
  const color = colorDeOpcion(indice);
  return (
    <div
      className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-base font-semibold leading-snug shadow-sm"
      style={{ background: color.fondo, color: color.texto }}
    >
      <LetraDeOpcion letra={color.letra} />
      <span className="min-w-0 flex-1 break-words">
        <span className="sr-only">{color.letra}: </span>
        {texto}
      </span>
    </div>
  );
}

// ── Respuesta enviada ───────────────────────────────────────────────────────

function RespuestaEnviada({
  pregunta,
  opcion,
  abiertaAt,
  cierraAt,
  ahora,
}: {
  pregunta: PreguntaVisible;
  opcion: number;
  abiertaAt: number | null;
  cierraAt: number | null;
  ahora: number;
}) {
  const esEncuesta = pregunta.tipo === "ENCUESTA";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-4 text-center">
      <span
        className="flex size-20 items-center justify-center rounded-full bg-brand-soft text-brand-dark"
        aria-hidden="true"
      >
        {esEncuesta ? <Vote className="size-10" strokeWidth={2} /> : <Check className="size-10" strokeWidth={2.5} />}
      </span>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-fg">{esEncuesta ? "¡Voto enviado!" : "¡Respuesta enviada!"}</h2>
        <p className="text-base text-fg-secondary">Espera a que se cierre la pregunta.</p>
      </div>
      <div className="w-full space-y-2">
        <p className="text-xs font-medium text-fg-muted">Elegiste</p>
        <FichaDeOpcion indice={opcion} texto={pregunta.opciones[opcion] ?? ""} />
      </div>
      <CuentaRegresiva
        className="w-full"
        abiertaAt={abiertaAt}
        cierraAt={cierraAt}
        segundos={pregunta.segundos}
        ahora={ahora}
      />
    </div>
  );
}

// ── El resultado de la pregunta ─────────────────────────────────────────────

type Veredicto =
  | { tipo: "acierto"; puntos: number }
  | { tipo: "error" }
  | { tipo: "voto" }
  | { tipo: "sin-voto" }
  | { tipo: "sin-tiempo" }
  /** Respondió, pero la consulta todavía no trae su resultado (llega en la próxima vuelta). */
  | { tipo: "pendiente" };

function veredictoDe(estado: EstadoParaJugador, pregunta: PreguntaVisible, envioConfirmado: boolean): Veredicto {
  const esEncuesta = pregunta.tipo === "ENCUESTA";
  const mia = estado.miRespuesta;
  if (mia?.resultado) {
    if (esEncuesta || mia.resultado.esCorrecta === null) return { tipo: "voto" };
    return mia.resultado.esCorrecta ? { tipo: "acierto", puntos: mia.resultado.puntos } : { tipo: "error" };
  }
  if (mia || envioConfirmado) return { tipo: "pendiente" };
  return esEncuesta ? { tipo: "sin-voto" } : { tipo: "sin-tiempo" };
}

const TONO = {
  acierto: "border-success-line bg-success-surface text-success-ink",
  error: "border-danger-line bg-danger-surface text-danger-ink",
  aviso: "border-warn-line bg-warn-surface text-warn-ink",
  neutro: "border-info-line bg-info-surface text-info-ink",
} as const;

function presentacion(v: Veredicto): {
  tono: keyof typeof TONO;
  icono: ReactNode;
  titulo: string;
  detalle: string | null;
} {
  const tamano = "size-full";
  switch (v.tipo) {
    case "acierto":
      return {
        tono: "acierto",
        icono: <Check className={tamano} strokeWidth={2.75} />,
        titulo: "¡Correcto!",
        detalle: `+${numero(v.puntos)} puntos`,
      };
    case "error":
      return { tono: "error", icono: <X className={tamano} strokeWidth={2.75} />, titulo: "Incorrecto", detalle: null };
    case "voto":
      return {
        tono: "neutro",
        icono: <Vote className={tamano} strokeWidth={2.25} />,
        titulo: "¡Gracias por votar!",
        detalle: "Las encuestas no dan puntos.",
      };
    case "sin-voto":
      return {
        tono: "aviso",
        icono: <Clock className={tamano} strokeWidth={2.25} />,
        titulo: "No alcanzaste a votar",
        detalle: "Las encuestas no dan puntos.",
      };
    case "sin-tiempo":
      return {
        tono: "aviso",
        icono: <Clock className={tamano} strokeWidth={2.25} />,
        titulo: "Se acabó el tiempo",
        detalle: "Esta vez no sumaste puntos.",
      };
    case "pendiente":
      return {
        tono: "neutro",
        icono: <Hourglass className={tamano} strokeWidth={2.25} />,
        titulo: "Respuesta enviada",
        detalle: "Ya viene tu resultado…",
      };
  }
}

interface DatosDelResultado {
  pregunta: PreguntaVisible;
  total: number;
  veredicto: Veredicto;
  correctas: number[];
  miOpcion: number | null;
  puntos: number;
  lugar: number | null;
  jugadores: number;
}

function TarjetaDelVeredicto({ veredicto, compacta = false }: { veredicto: Veredicto; compacta?: boolean }) {
  const p = presentacion(veredicto);
  if (compacta) {
    return (
      <div className={cn("flex items-center gap-3 rounded-2xl border px-4 py-3 text-left", TONO[p.tono])}>
        <span className="size-6 shrink-0" aria-hidden="true">
          {p.icono}
        </span>
        <p className="min-w-0 flex-1 text-base font-bold">{p.titulo}</p>
        {veredicto.tipo === "acierto" && (
          <p className="shrink-0 text-base font-semibold tabular-nums">{p.detalle}</p>
        )}
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-3xl border px-6 py-7 text-center", TONO[p.tono])}>
      <span className="size-14" aria-hidden="true">
        {p.icono}
      </span>
      <p className="text-3xl font-extrabold leading-tight">{p.titulo}</p>
      {p.detalle && (
        <p className={cn("font-semibold", veredicto.tipo === "acierto" ? "text-xl tabular-nums" : "text-sm")}>
          {p.detalle}
        </p>
      )}
    </div>
  );
}

/** «La correcta era: B · texto» (o las correctas, si valía más de una). */
function LasCorrectas({ pregunta, correctas }: { pregunta: PreguntaVisible; correctas: number[] }) {
  if (correctas.length === 0) return null;
  return (
    <div className="w-full space-y-2">
      <p className="text-xs font-medium text-fg-muted">
        {correctas.length === 1 ? "La correcta era:" : "Valía cualquiera de estas:"}
      </p>
      {correctas.map((i) => (
        <FichaDeOpcion key={i} indice={i} texto={pregunta.opciones[i] ?? ""} />
      ))}
    </div>
  );
}

function Resultado({ pregunta, total, veredicto, correctas, miOpcion, puntos, lugar, jugadores }: DatosDelResultado) {
  const mostrarCorrectas = veredicto.tipo === "error" || veredicto.tipo === "sin-tiempo";
  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="space-y-1.5">
        <EncabezadoDePregunta pregunta={pregunta} total={total} />
        <h2 className="line-clamp-3 break-words text-base font-medium leading-snug text-fg-secondary">
          {pregunta.texto}
        </h2>
      </div>
      <TarjetaDelVeredicto veredicto={veredicto} />
      {mostrarCorrectas && <LasCorrectas pregunta={pregunta} correctas={correctas} />}
      {veredicto.tipo === "voto" && miOpcion !== null && (
        <div className="w-full space-y-2">
          <p className="text-xs font-medium text-fg-muted">Votaste:</p>
          <FichaDeOpcion indice={miOpcion} texto={pregunta.opciones[miOpcion] ?? ""} />
        </div>
      )}
      <div className="mt-auto grid grid-cols-2 gap-3 pt-2">
        <Cifra antes="Llevas" valor={numero(puntos)} despues="puntos" />
        {lugar !== null ? (
          <Cifra antes="Vas en el lugar" valor={numero(lugar)} despues={`de ${numero(jugadores)}`} />
        ) : (
          <Cifra antes="Jugando" valor={numero(jugadores)} despues={jugadores === 1 ? "persona" : "personas"} />
        )}
      </div>
    </div>
  );
}

function Cifra({ antes, valor, despues }: { antes: string; valor: string; despues: string }) {
  return (
    <p className="flex flex-col items-center gap-0.5 rounded-2xl border border-line bg-surface-muted px-3 py-3 text-center">
      <span className="text-xs text-fg-muted">{antes}</span>
      <span className="text-2xl font-bold tabular-nums text-fg">{valor}</span>
      <span className="text-xs text-fg-muted">{despues}</span>
    </p>
  );
}

// ── Las posiciones ──────────────────────────────────────────────────────────

function Posiciones({
  pregunta,
  total,
  veredicto,
  correctas,
  puntos,
  lugar,
  jugadores,
  esUltima,
}: DatosDelResultado & { esUltima: boolean }) {
  const mostrarCorrectas = veredicto.tipo === "error" || veredicto.tipo === "sin-tiempo";
  return (
    <div className="flex flex-1 flex-col gap-5 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
        Posiciones tras la pregunta {pregunta.indice + 1} de {total}
      </p>
      <h2 className="sr-only">Tu lugar</h2>
      {lugar !== null && <Lugar lugar={lugar} jugadores={jugadores} frase="Vas en el lugar" puntos={puntos} />}
      <p className="text-lg text-fg-secondary">
        Llevas <strong className="font-bold tabular-nums text-fg">{numero(puntos)}</strong> puntos
      </p>
      <TarjetaDelVeredicto veredicto={veredicto} compacta />
      {mostrarCorrectas && <LasCorrectas pregunta={pregunta} correctas={correctas} />}
      <p className="mt-auto pt-2 text-sm text-fg-muted">
        {esUltima
          ? "Era la última pregunta: ya viene el resultado final."
          : "Mira la pantalla de la trivia: ya viene la siguiente pregunta."}
      </p>
    </div>
  );
}

/** Medalla solo para el podio de verdad: la misma regla que la pantalla proyectada (lib/trivias/reglas.ts). */
const enElPodio = tieneMedalla;

function Lugar({ lugar, jugadores, frase, puntos }: { lugar: number; jugadores: number; frase: string; puntos: number }) {
  const podio = enElPodio(lugar, puntos) ? COLORES_DEL_PODIO[lugar - 1] : null;
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-line bg-surface-muted px-6 py-6">
      <p className="text-sm font-medium text-fg-secondary">{frase}</p>
      {podio && (
        <span className="text-4xl leading-none" role="img" aria-label={`Medalla de ${NOMBRE_DE_LA_MEDALLA[lugar - 1]}`}>
          {MEDALLA[lugar - 1]}
        </span>
      )}
      <span
        className={cn(
          "flex size-24 items-center justify-center rounded-full text-5xl font-extrabold tabular-nums shadow-md",
          !podio && "bg-brand-soft text-brand-dark",
        )}
        style={podio ? { background: podio.fondo, color: podio.texto } : undefined}
      >
        {numero(lugar)}
      </span>
      <p className="text-sm text-fg-muted">
        de {numero(jugadores)} {jugadores === 1 ? "jugador" : "jugadores"}
      </p>
    </div>
  );
}

// ── El final ────────────────────────────────────────────────────────────────

function Final({
  quien,
  puntos,
  lugar,
  jugadores,
  empezo,
}: {
  quien: string;
  puntos: number;
  lugar: number | null;
  jugadores: number;
  /** Se llegó a abrir al menos una pregunta (si no, se terminó desde la sala de espera). */
  empezo: boolean;
}) {
  const frase = !empezo
    ? "Se cerró antes de la primera pregunta."
    : enElPodio(lugar, puntos) && lugar === 1
      ? `¡Ganaste, ${quien}!`
      : enElPodio(lugar, puntos)
        ? `¡Llegaste al podio, ${quien}!`
        : `¡Gracias por jugar, ${quien}!`;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-4 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-fg">¡Terminó la trivia!</h2>
        <p className="text-base text-fg-secondary">{frase}</p>
      </div>
      {empezo && lugar !== null && <Lugar lugar={lugar} jugadores={jugadores} frase="Quedaste en el lugar" puntos={puntos} />}
      {empezo && (
        <p className="text-lg text-fg-secondary">
          Terminaste con <strong className="font-bold tabular-nums text-fg">{numero(puntos)}</strong> puntos
        </p>
      )}
      <Link
        href="/trivia/play"
        className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "h-12 w-full text-base")}
      >
        Entrar a otra trivia
      </Link>
    </div>
  );
}
