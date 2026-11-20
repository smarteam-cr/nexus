"use client";

/**
 * components/trivias/EditorDeTrivia.tsx — crear y editar una trivia: el título y sus preguntas, cada una en su tarjeta
 * (tipo, texto, opciones con su color y letra, cuál es la correcta y el tiempo). En edición, además, lanzar una partida
 * y eliminarla. Lo usan /trivia/new (sin `inicial`) y /trivia/[id].
 *
 * Cada tarjeta guarda por separado las opciones de opción múltiple o encuesta y la correcta de verdadero o falso: cambiar
 * de tipo y volver no borra lo escrito. Lo que se manda al guardar sale de `aEntrada` y lo revisan las mismas reglas que
 * usa la ruta (lib/trivias/validar.ts), así que el aviso de acá es el mismo que daría el servidor, en las mismas palabras.
 */
import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Copy, Play, Plus, Trash2, X } from "lucide-react";
import {
  Alert,
  Button,
  ConfirmDialog,
  Field,
  IconButton,
  Input,
  Segmentado,
  Textarea,
  useToast,
  type OpcionSegmentada,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { colorDeOpcion } from "@/lib/trivias/colores";
import { MAXIMO_DE_LA_OPCION, MAXIMO_DEL_TEXTO, MAXIMO_DEL_TITULO, revisarTrivia } from "@/lib/trivias/validar";
import {
  ETIQUETA_DEL_TIPO,
  MAXIMO_DE_OPCIONES,
  MAXIMO_DE_PREGUNTAS,
  MAXIMO_DE_SEGUNDOS,
  MINIMO_DE_OPCIONES,
  MINIMO_DE_SEGUNDOS,
  OPCIONES_VERDADERO_FALSO,
  SEGUNDOS_POR_DEFECTO,
  TIPOS_DE_PREGUNTA,
  type PreguntaDeTrivia,
  type TipoDePregunta,
} from "@/lib/trivias/tipos";
import LanzarPartida from "./LanzarPartida";

// ── El estado de cada tarjeta ──────────────────────────────────────────────────

interface Tarjeta {
  /** Solo para React: no se pinta en el DOM (el servidor y el navegador la numeran distinto). */
  clave: string;
  tipo: TipoDePregunta;
  texto: string;
  /** Las opciones de opción múltiple y de encuesta. Se conservan mientras la pregunta es de verdadero o falso. */
  opciones: string[];
  /** Las correctas de opción múltiple. Se conservan mientras la pregunta es una encuesta. */
  correctas: number[];
  /** La correcta de verdadero o falso: 0 = Verdadero, 1 = Falso. */
  correctaVF: number | null;
  /** Tal como se escribe: un número a medio escribir no se corrige solo. */
  segundos: string;
}

let ultimaClave = 0;
const nuevaClave = () => `tarjeta-${++ultimaClave}`;

const opcionesVacias = () => Array.from({ length: MAXIMO_DE_OPCIONES }, () => "");

function tarjetaNueva(): Tarjeta {
  return {
    clave: nuevaClave(),
    tipo: "OPCION_MULTIPLE",
    texto: "",
    opciones: opcionesVacias(),
    correctas: [],
    correctaVF: null,
    segundos: String(SEGUNDOS_POR_DEFECTO),
  };
}

function tarjetaDesde(p: PreguntaDeTrivia): Tarjeta {
  const vf = p.tipo === "VERDADERO_FALSO";
  const primera = p.correctas[0];
  return {
    clave: nuevaClave(),
    tipo: p.tipo,
    texto: p.texto,
    opciones: vf ? opcionesVacias() : [...p.opciones],
    correctas: p.tipo === "OPCION_MULTIPLE" ? [...p.correctas] : [],
    correctaVF: vf && (primera === 0 || primera === 1) ? primera : null,
    segundos: String(p.segundos),
  };
}

/** Lo que se manda a la ruta: solo lo que cuenta para el tipo elegido. */
function aEntrada(t: Tarjeta) {
  const segundos = t.segundos.trim() === "" ? Number.NaN : Number(t.segundos);
  if (t.tipo === "VERDADERO_FALSO") {
    return {
      tipo: t.tipo,
      texto: t.texto,
      opciones: [...OPCIONES_VERDADERO_FALSO],
      correctas: t.correctaVF === null ? [] : [t.correctaVF],
      segundos,
    };
  }
  return { tipo: t.tipo, texto: t.texto, opciones: t.opciones, correctas: t.tipo === "ENCUESTA" ? [] : t.correctas, segundos };
}

interface Problema {
  mensaje: string;
  /** El índice de la pregunta con el problema; null si es del título. */
  pregunta: number | null;
}

type Revision =
  | { ok: true; datos: { titulo: string; preguntas: PreguntaDeTrivia[] } }
  | { ok: false; problema: Problema };

/**
 * El PRIMER problema, en palabras y con el número de la pregunta. Con las mismas reglas y palabras que el schema de la
 * ruta (lib/trivias/validar.ts, sin Zod: Zod no viaja al navegador).
 */
function revisar(entrada: { titulo: string; preguntas: ReturnType<typeof aEntrada>[] }): Revision {
  const r = revisarTrivia(entrada);
  return r.ok ? { ok: true, datos: r.datos } : { ok: false, problema: { mensaje: r.mensaje, pregunta: r.pregunta } };
}

/** «1 min 40 s». */
function duracion(segundos: number): string {
  if (segundos < 60) return `${segundos} s`;
  const min = Math.floor(segundos / 60);
  const s = segundos % 60;
  return s ? `${min} min ${s} s` : `${min} min`;
}

const TIPOS: OpcionSegmentada<TipoDePregunta>[] = TIPOS_DE_PREGUNTA.map((t) => ({ clave: t, etiqueta: ETIQUETA_DEL_TIPO[t] }));

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

// ── El editor ──────────────────────────────────────────────────────────────────

export interface EditorDeTriviaProps {
  /** La trivia guardada; sin ella, el editor crea una nueva. */
  inicial?: { id: string; titulo: string; preguntas: PreguntaDeTrivia[] };
}

export default function EditorDeTrivia({ inicial }: EditorDeTriviaProps) {
  const router = useRouter();
  const toast = useToast();

  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>(() =>
    inicial && inicial.preguntas.length > 0 ? inicial.preguntas.map(tarjetaDesde) : [tarjetaNueva()],
  );

  const entrada = useMemo(() => ({ titulo, preguntas: tarjetas.map(aEntrada) }), [titulo, tarjetas]);
  const huella = useMemo(() => JSON.stringify(entrada), [entrada]);
  const revision = useMemo(() => revisar(entrada), [entrada]);

  /** Lo último que quedó guardado: la diferencia con `huella` son los cambios sin guardar. */
  const [guardada, setGuardada] = useState(huella);
  const sinGuardar = huella !== guardada;

  const [mostrarProblema, setMostrarProblema] = useState(false);
  const [errorDelServidor, setErrorDelServidor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [lanzar, setLanzar] = useState(false);
  const [borrar, setBorrar] = useState(false);
  /** Adónde va el foco después del próximo cambio (subir, bajar, agregar…): el elemento con ese `data-foco`. */
  const [foco, setFoco] = useState<{ destino: string; centrar: boolean } | null>(null);

  // Una vez que se intentó guardar, el aviso sigue al día mientras se corrige y se va solo cuando ya no hay problema.
  const problema = mostrarProblema && !revision.ok ? revision.problema : null;
  const aviso = problema?.mensaje ?? errorDelServidor;

  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sinGuardar]);

  useEffect(() => {
    if (!foco) return;
    const el = document.querySelector<HTMLElement>(`[data-foco="${foco.destino}"]`);
    if (!el) return;
    if (foco.centrar) el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: foco.centrar });
  }, [foco]);

  const totalDeSegundos = tarjetas.reduce((suma, t) => {
    const s = Number(t.segundos);
    return suma + (Number.isFinite(s) && s > 0 ? Math.round(s) : 0);
  }, 0);

  // ── Cambios ──

  function editar(cambio: (prev: Tarjeta[]) => Tarjeta[]) {
    setErrorDelServidor(null);
    setTarjetas(cambio);
  }

  function cambiar(i: number, parcial: Partial<Tarjeta>) {
    editar((prev) => prev.map((t, j) => (j === i ? { ...t, ...parcial } : t)));
  }

  function cambiarOpcion(i: number, k: number, texto: string) {
    editar((prev) => prev.map((t, j) => (j === i ? { ...t, opciones: t.opciones.map((o, m) => (m === k ? texto : o)) } : t)));
  }

  function alternarCorrecta(i: number, k: number) {
    editar((prev) =>
      prev.map((t, j) => {
        if (j !== i) return t;
        const correctas = t.correctas.includes(k) ? t.correctas.filter((c) => c !== k) : [...t.correctas, k].sort((a, b) => a - b);
        return { ...t, correctas };
      }),
    );
  }

  function agregarOpcion(i: number) {
    const k = tarjetas[i]?.opciones.length ?? 0;
    if (k >= MAXIMO_DE_OPCIONES) return;
    editar((prev) => prev.map((t, j) => (j === i ? { ...t, opciones: [...t.opciones, ""] } : t)));
    setFoco({ destino: `${i}-opcion-${k}`, centrar: false });
  }

  function quitarOpcion(i: number, k: number) {
    editar((prev) =>
      prev.map((t, j) => {
        if (j !== i || t.opciones.length <= MINIMO_DE_OPCIONES) return t;
        return {
          ...t,
          opciones: t.opciones.filter((_, m) => m !== k),
          correctas: t.correctas.filter((c) => c !== k).map((c) => (c > k ? c - 1 : c)),
        };
      }),
    );
  }

  function mover(i: number, paso: -1 | 1) {
    const destino = i + paso;
    if (destino < 0 || destino >= tarjetas.length) return;
    editar((prev) => {
      const copia = [...prev];
      [copia[i], copia[destino]] = [copia[destino], copia[i]];
      return copia;
    });
    // El foco sigue a la tarjeta; si el botón usado quedó deshabilitado (llegó al borde), pasa al otro.
    const alBorde = paso === -1 ? destino === 0 : destino === tarjetas.length - 1;
    const boton = paso === -1 ? (alBorde ? "bajar" : "subir") : alBorde ? "subir" : "bajar";
    setFoco({ destino: `${destino}-${boton}`, centrar: true });
  }

  function duplicar(i: number) {
    if (tarjetas.length >= MAXIMO_DE_PREGUNTAS) return;
    editar((prev) => {
      const original = prev[i];
      if (!original) return prev;
      const copia: Tarjeta = {
        ...original,
        clave: nuevaClave(),
        opciones: [...original.opciones],
        correctas: [...original.correctas],
      };
      return [...prev.slice(0, i + 1), copia, ...prev.slice(i + 1)];
    });
    setFoco({ destino: `${i + 1}-texto`, centrar: true });
  }

  function quitar(i: number) {
    const quitada = tarjetas[i];
    if (!quitada || tarjetas.length <= 1) return;
    editar((prev) => prev.filter((_, j) => j !== i));
    setFoco({ destino: `${Math.min(i, tarjetas.length - 2)}-texto`, centrar: false });
    toast.info(`Quitaste la pregunta ${i + 1}.`, {
      action: {
        label: "Deshacer",
        onClick: () =>
          editar((prev) =>
            prev.length >= MAXIMO_DE_PREGUNTAS || prev.some((t) => t.clave === quitada.clave)
              ? prev
              : [...prev.slice(0, i), quitada, ...prev.slice(i)],
          ),
      },
    });
  }

  function agregar() {
    if (tarjetas.length >= MAXIMO_DE_PREGUNTAS) return;
    editar((prev) => [...prev, tarjetaNueva()]);
    setFoco({ destino: `${tarjetas.length}-texto`, centrar: true });
  }

  // ── Guardar, lanzar, eliminar ──

  async function guardar() {
    if (guardando) return;
    setErrorDelServidor(null);
    if (!revision.ok) {
      setMostrarProblema(true);
      const p = revision.problema.pregunta;
      setFoco({ destino: p === null ? "titulo" : `${p}-texto`, centrar: true });
      return;
    }
    setGuardando(true);
    const enviada = huella;
    try {
      if (!inicial) {
        const { id } = await fetchJson<{ id: string }>("/api/trivia", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify(revision.datos),
        });
        setGuardada(enviada);
        toast.success("Trivia creada.");
        // Sigue «guardando» hasta que abre su página: un segundo clic no crea otra.
        router.push(`/trivia/${id}`);
        return;
      }
      await fetchJson(`/api/trivia/${inicial.id}`, {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify(revision.datos),
      });
      setGuardada(enviada);
      setMostrarProblema(false);
      toast.success("Guardado.");
      router.refresh();
    } catch (e) {
      setErrorDelServidor(e instanceof ApiError ? e.message : "No se pudo guardar la trivia. Prueba de nuevo.");
    }
    setGuardando(false);
  }

  async function eliminar() {
    if (!inicial) return;
    try {
      await fetchJson(`/api/trivia/${inicial.id}`, { method: "DELETE" });
      setGuardada(huella);
      toast.success("Trivia eliminada.");
      router.push("/trivia");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar la trivia. Prueba de nuevo.");
      setBorrar(false);
    }
  }

  const estado = inicial
    ? sinGuardar
      ? "Tienes cambios sin guardar. Guárdalos para poder lanzar una partida."
      : "Todo guardado."
    : sinGuardar
      ? "Todavía no la guardas."
      : "Ponle un título y escribe las preguntas.";

  return (
    <div className="space-y-6">
      <div
        className={cn(
          "rounded-xl border bg-surface p-4 sm:p-5",
          problema && problema.pregunta === null ? "border-danger-line" : "border-line",
        )}
      >
        <Field label="Título" hint="Lo ven todos en la sala de espera y en el teléfono.">
          <Input
            data-foco="titulo"
            value={titulo}
            maxLength={MAXIMO_DEL_TITULO}
            placeholder="Por ejemplo: Repaso de la semana"
            onChange={(e) => {
              setErrorDelServidor(null);
              setTitulo(e.target.value);
            }}
          />
        </Field>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-semibold text-fg">Preguntas</h2>
          <p className="text-xs text-fg-muted">
            {tarjetas.length} {tarjetas.length === 1 ? "pregunta" : "preguntas"} · {duracion(totalDeSegundos)} de tiempo
            para responder
          </p>
        </div>

        <ol className="space-y-4">
          {tarjetas.map((t, i) => (
            <TarjetaDePregunta
              key={t.clave}
              tarjeta={t}
              indice={i}
              total={tarjetas.length}
              conProblema={problema?.pregunta === i}
              onCambiar={(parcial) => cambiar(i, parcial)}
              onCambiarOpcion={(k, texto) => cambiarOpcion(i, k, texto)}
              onAlternarCorrecta={(k) => alternarCorrecta(i, k)}
              onAgregarOpcion={() => agregarOpcion(i)}
              onQuitarOpcion={(k) => quitarOpcion(i, k)}
              onMover={(paso) => mover(i, paso)}
              onDuplicar={() => duplicar(i)}
              onQuitar={() => quitar(i)}
            />
          ))}
        </ol>

        {tarjetas.length < MAXIMO_DE_PREGUNTAS ? (
          <Button variant="secondary" size="lg" className="w-full border-dashed" onClick={agregar}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Agregar pregunta
          </Button>
        ) : (
          <p className="text-center text-xs text-fg-muted">
            Llegaste al máximo de {MAXIMO_DE_PREGUNTAS} preguntas por trivia.
          </p>
        )}
      </section>

      <div className="sticky bottom-4 z-10 space-y-2">
        {aviso && (
          <div className="rounded-lg bg-surface shadow-lg">
            <Alert variant="danger">{aviso}</Alert>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 shadow-lg">
          <p
            aria-live="polite"
            className={cn("mr-auto min-w-0 text-xs", inicial && sinGuardar ? "text-warn-ink" : "text-fg-muted")}
          >
            {estado}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {inicial && (
              <Button variant="destructive" onClick={() => setBorrar(true)} disabled={guardando}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Eliminar
              </Button>
            )}
            {inicial && (
              <Button variant="secondary" onClick={() => setLanzar(true)} disabled={sinGuardar || guardando}>
                <Play className="h-4 w-4" aria-hidden="true" />
                Lanzar partida
              </Button>
            )}
            <Button variant="primary" onClick={guardar} loading={guardando} disabled={Boolean(inicial) && !sinGuardar}>
              Guardar
            </Button>
          </div>
        </div>
      </div>

      {inicial && <LanzarPartida triviaId={inicial.id} abierto={lanzar} onCerrar={() => setLanzar(false)} />}
      {inicial && (
        <ConfirmDialog
          open={borrar}
          onCancel={() => setBorrar(false)}
          onConfirm={eliminar}
          title="¿Eliminar esta trivia?"
          description="Las partidas ya jugadas se conservan en el historial."
          confirmLabel="Eliminar"
          variant="destructive"
        />
      )}
    </div>
  );
}

// ── Una pregunta ───────────────────────────────────────────────────────────────

interface TarjetaDePreguntaProps {
  tarjeta: Tarjeta;
  indice: number;
  total: number;
  conProblema: boolean;
  onCambiar: (parcial: Partial<Tarjeta>) => void;
  onCambiarOpcion: (k: number, texto: string) => void;
  onAlternarCorrecta: (k: number) => void;
  onAgregarOpcion: () => void;
  onQuitarOpcion: (k: number) => void;
  onMover: (paso: -1 | 1) => void;
  onDuplicar: () => void;
  onQuitar: () => void;
}

function TarjetaDePregunta({
  tarjeta: t,
  indice: i,
  total,
  conProblema,
  onCambiar,
  onCambiarOpcion,
  onAlternarCorrecta,
  onAgregarOpcion,
  onQuitarOpcion,
  onMover,
  onDuplicar,
  onQuitar,
}: TarjetaDePreguntaProps) {
  const n = i + 1;
  const idDeLasOpciones = useId();
  const cerca = t.texto.length >= MAXIMO_DEL_TEXTO - 50;
  const icono = "h-4 w-4";

  return (
    <li
      className={cn(
        "space-y-4 rounded-xl border bg-surface p-4 sm:p-5",
        conProblema ? "border-danger-line" : "border-line",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-fg">Pregunta {n}</h3>
        <div className="flex items-center gap-0.5">
          <IconButton
            aria-label={`Subir la pregunta ${n}`}
            data-foco={`${i}-subir`}
            icon={<ArrowUp className={icono} />}
            disabled={i === 0}
            onClick={() => onMover(-1)}
          />
          <IconButton
            aria-label={`Bajar la pregunta ${n}`}
            data-foco={`${i}-bajar`}
            icon={<ArrowDown className={icono} />}
            disabled={i === total - 1}
            onClick={() => onMover(1)}
          />
          <IconButton
            aria-label={`Duplicar la pregunta ${n}`}
            icon={<Copy className={icono} />}
            disabled={total >= MAXIMO_DE_PREGUNTAS}
            onClick={onDuplicar}
          />
          <IconButton
            aria-label={`Eliminar la pregunta ${n}`}
            variant="destructive"
            icon={<Trash2 className={icono} />}
            disabled={total <= 1}
            onClick={onQuitar}
          />
        </div>
      </div>

      <div>
        <Segmentado
          opciones={TIPOS}
          valor={t.tipo}
          onCambio={(tipo) => onCambiar({ tipo })}
          etiqueta={`Tipo de la pregunta ${n}`}
        />
      </div>

      <Field
        label="Pregunta"
        hint={cerca ? `${t.texto.length} de ${MAXIMO_DEL_TEXTO} caracteres.` : undefined}
      >
        <Textarea
          data-foco={`${i}-texto`}
          rows={2}
          value={t.texto}
          maxLength={MAXIMO_DEL_TEXTO}
          placeholder={t.tipo === "VERDADERO_FALSO" ? "Escribe una afirmación que sea verdadera o falsa" : "Escribe la pregunta"}
          onChange={(e) => onCambiar({ texto: e.target.value })}
        />
      </Field>

      {t.tipo === "VERDADERO_FALSO" ? (
        <div className="space-y-2">
          <p id={idDeLasOpciones} className="text-xs font-medium text-fg-secondary">
            ¿Cuál es la respuesta correcta?
          </p>
          <div role="group" aria-labelledby={idDeLasOpciones} className="grid grid-cols-2 gap-2">
            {OPCIONES_VERDADERO_FALSO.map((opcion, k) => {
              const color = colorDeOpcion(k);
              const elegida = t.correctaVF === k;
              return (
                <button
                  key={opcion}
                  type="button"
                  aria-pressed={elegida}
                  onClick={() => onCambiar({ correctaVF: k })}
                  className={cn(
                    "flex min-w-0 items-center gap-3 rounded-xl border-2 p-2 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                    elegida ? "border-success-line bg-success-surface" : "border-line bg-surface hover:bg-surface-hover",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-sm font-bold"
                    style={{ background: color.fondo, color: color.texto }}
                  >
                    {color.letra}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{opcion}</span>
                  {elegida && (
                    <span className="inline-flex flex-none items-center gap-1 text-xs font-medium text-success-ink">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Correcta</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p id={idDeLasOpciones} className="text-xs font-medium text-fg-secondary">
              Opciones
            </p>
            <p className="text-xs text-fg-muted">
              {t.tipo === "ENCUESTA"
                ? "Sin respuesta correcta ni puntos: al final se ve cuántos eligieron cada una."
                : "Marca la correcta. Si marcas más de una, cualquiera vale."}
            </p>
          </div>
          <ul aria-labelledby={idDeLasOpciones} className="space-y-2">
            {t.opciones.map((opcion, k) => {
              const color = colorDeOpcion(k);
              const correcta = t.correctas.includes(k);
              const sePuedeQuitar = t.opciones.length > MINIMO_DE_OPCIONES;
              return (
                <li key={k} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-sm font-bold"
                    style={{ background: color.fondo, color: color.texto }}
                  >
                    {color.letra}
                  </span>
                  <Field label={`Opción ${color.letra}`} labelClassName="sr-only" className="min-w-0 flex-1 space-y-0">
                    <Input
                      data-foco={`${i}-opcion-${k}`}
                      value={opcion}
                      maxLength={MAXIMO_DE_LA_OPCION}
                      placeholder={`Opción ${color.letra}`}
                      onChange={(e) => onCambiarOpcion(k, e.target.value)}
                    />
                  </Field>
                  {t.tipo === "OPCION_MULTIPLE" && (
                    <button
                      type="button"
                      aria-pressed={correcta}
                      aria-label={`Opción ${color.letra} correcta`}
                      onClick={() => onAlternarCorrecta(k)}
                      className={cn(
                        "inline-flex h-[38px] flex-none items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                        correcta
                          ? "border-success-line bg-success-surface text-success-ink"
                          : "border-line text-fg-muted hover:bg-surface-hover hover:text-fg-secondary",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-full border",
                          correcta ? "border-success bg-success text-success-fg" : "border-line",
                        )}
                      >
                        {correcta && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span className="hidden sm:inline">Correcta</span>
                    </button>
                  )}
                  <IconButton
                    aria-label={`Quitar la opción ${color.letra}`}
                    icon={<X className={icono} />}
                    disabled={!sePuedeQuitar}
                    className={cn(!sePuedeQuitar && "invisible")}
                    onClick={() => onQuitarOpcion(k)}
                  />
                </li>
              );
            })}
          </ul>
          {t.opciones.length < MAXIMO_DE_OPCIONES && (
            <Button variant="ghost" size="sm" onClick={onAgregarOpcion}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Agregar opción
            </Button>
          )}
        </div>
      )}

      <Field label="Tiempo (segundos)" hint={`De ${MINIMO_DE_SEGUNDOS} a ${MAXIMO_DE_SEGUNDOS}.`} className="w-36">
        <Input
          type="number"
          inputMode="numeric"
          min={MINIMO_DE_SEGUNDOS}
          max={MAXIMO_DE_SEGUNDOS}
          step={5}
          value={t.segundos}
          onChange={(e) => onCambiar({ segundos: e.target.value })}
        />
      </Field>
    </li>
  );
}
