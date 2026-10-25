"use client";

/**
 * components/sessions/AgregarReunion.tsx — «Agregar una reunión» (etapa 4f del roadmap de «Para ti», 2026-10-15).
 *
 * Una reunión que no pasó por Meet (Zoom, Teams, presencial, una llamada), o lo que pasó en una de Meet que no dejó
 * transcripción ni notas. Lo que pasó entra como la transcripción (pegada o en un archivo) o como lo que la persona
 * recuerda. Después Nexus la lee como a cualquier otra: minuta, tareas y lo demás.
 *
 * Antes de crear una reunión nueva se muestran las del cliente ese día: si es una de ellas, se le agrega lo que pasó y
 * no queda dos veces. Las reglas viven en lib/sessions/reunion-a-mano.ts; la escritura, en la ruta del cliente.
 *
 * Desde el 2026-10-25 (T5), con la transcripción de audio prendida: «El audio» agrega la reunión sin texto y, en el
 * mismo cajón, sube la grabación (components/sessions/SubirAudio.tsx); Google la transcribe y Nexus la lee.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input, Segmentado, Select, Textarea } from "@/components/ui";
import { Drawer } from "@/components/ui/Drawer";
import { useToast } from "@/components/ui/Toast";
import { useMe } from "@/hooks/useMe";
import { SubirAudio } from "@/components/sessions/SubirAudio";
import {
  ACEPTA_ARCHIVO_DE_REUNION,
  MAX_BYTES_ARCHIVO,
  MIN_RECUERDO,
  MIN_TRANSCRIPCION,
  diaEnCostaRica,
  leerPersonasEscritas,
  problemaDelContenido,
  textoDelArchivo,
  type TipoDeContenido,
} from "@/lib/sessions/reunion-a-mano";

interface Opciones {
  cliente: { id: string; nombre: string };
  proyectos: { id: string; nombre: string }[];
  reunionesDelDia: { id: string; titulo: string; inicio: string; tieneTexto: boolean; aMano: boolean; porQueNo: string | null }[];
  equipo: { email: string; nombre: string }[];
  /** Se puede subir el audio (T5). */
  audio?: boolean;
}

/** Lo que se agrega: lo que pasó escrito, o el audio de una presencial (T5). */
type QueSeAgrega = TipoDeContenido | "audio";

export interface AgregarReunionProps {
  open: boolean;
  onClose: () => void;
  /** El cliente, si ya se sabe (la ficha). Sin él, se elige de `clientes`. */
  clienteFijo?: { id: string; nombre: string };
  clientes?: { id: string; nombre: string }[];
  /** El proyecto que se marca al abrir (la ficha de un proyecto). */
  proyectoInicial?: string;
  onAgregada?: (sessionId: string) => void;
}

const OTRA = "__otra__";

/** «09:30» de una fecha ISO, en hora de Costa Rica (a mano: Node y el navegador escriben distinto). */
function horaCR(iso: string): string {
  const d = new Date(+new Date(iso) - 6 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function AgregarReunion({ open, onClose, clienteFijo, clientes, proyectoInicial, onAgregada }: AgregarReunionProps) {
  const toast = useToast();
  const router = useRouter();
  const me = useMe();
  const archivoRef = useRef<HTMLInputElement>(null);

  const [clientId, setClientId] = useState(clienteFijo?.id ?? "");
  const [fecha, setFecha] = useState(() => diaEnCostaRica(new Date()));
  const [hora, setHora] = useState("");
  const [opciones, setOpciones] = useState<Opciones | null>(null);
  const [cargando, setCargando] = useState(false);
  const [cual, setCual] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [duracion, setDuracion] = useState("");
  const [equipo, setEquipo] = useState<Set<string>>(new Set());
  const [delCliente, setDelCliente] = useState("");
  const [proyectos, setProyectos] = useState<Set<string>>(new Set(proyectoInicial ? [proyectoInicial] : []));
  const [tipo, setTipo] = useState<QueSeAgrega>("recuerdo");
  // T5: la reunión ya se agregó y espera su audio.
  const [paraElAudio, setParaElAudio] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [leyendoArchivo, setLeyendoArchivo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quien la agrega suele haber estado: se marca de entrada (se puede sacar).
  const [marcoAMe, setMarcoAMe] = useState(false);
  if (me?.email && !marcoAMe) {
    setMarcoAMe(true);
    setEquipo((prev) => new Set([...prev, me.email.toLowerCase()]));
  }

  // Las opciones del cliente y las reuniones de ese día.
  useEffect(() => {
    if (!open || !clientId) return;
    const ctrl = new AbortController();
    setCargando(true);
    fetch(`/api/clients/${clientId}/reuniones-a-mano?fecha=${fecha}`, { signal: ctrl.signal })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? "No se pudo cargar el cliente.");
        return data as Opciones;
      })
      .then((o) => {
        setOpciones(o);
        setCual((prev) => (prev && (prev === OTRA || o.reunionesDelDia.some((r) => r.id === prev)) ? prev : null));
        setProyectos((prev) => new Set([...prev].filter((id) => o.proyectos.some((p) => p.id === id))));
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "No se pudo cargar el cliente.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCargando(false);
      });
    return () => ctrl.abort();
  }, [open, clientId, fecha]);

  const delDia = opciones?.reunionesDelDia ?? [];
  const hayQueElegir = delDia.length > 0 && cual === null;
  const esNueva = delDia.length === 0 || cual === OTRA;
  const existente = !esNueva ? delDia.find((r) => r.id === cual) ?? null : null;

  const conAudio = tipo === "audio";
  const problema = useMemo(() => (tipo !== "audio" && texto.trim() ? problemaDelContenido(tipo, texto) : null), [tipo, texto]);
  const puedeGuardar =
    !!clientId &&
    !!opciones &&
    !hayQueElegir &&
    !problema &&
    (conAudio || texto.trim().length > 0) &&
    (!esNueva || titulo.trim().length > 0) &&
    !(existente && existente.porQueNo) &&
    !guardando;

  function alternar(set: Set<string>, valor: string): Set<string> {
    const n = new Set(set);
    if (n.has(valor)) n.delete(valor);
    else n.add(valor);
    return n;
  }

  async function subirArchivo(f: File) {
    setLeyendoArchivo(true);
    setError(null);
    try {
      // Se lee acá, en el navegador: lo que se guarda es el texto, y así no hay archivo que suba al servidor.
      if (f.size > MAX_BYTES_ARCHIVO) throw new Error("El archivo es demasiado grande. Pega el texto en vez de subirlo.");
      if (!/\.(txt|vtt|srt|md)$/i.test(f.name)) throw new Error("Ese archivo no se lee acá. Si es Word o PDF, abre el archivo, copia el texto y pégalo.");
      const leido = textoDelArchivo(f.name, await f.text());
      if (!leido.texto) throw new Error("El archivo no trae texto.");
      setTexto(leido.texto);
      setTipo(leido.tipoSugerido);
      if (leido.recortado) toast.info("El archivo era más largo que el tope: se cortó al final.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setLeyendoArchivo(false);
      if (archivoRef.current) archivoRef.current.value = "";
    }
  }

  async function guardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch(`/api/clients/${clientId}/reuniones-a-mano`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha,
          hora: hora || null,
          duracionMin: duracion ? Number(duracion) : null,
          titulo,
          proyectoIds: [...proyectos],
          equipo: [...equipo],
          delCliente: leerPersonasEscritas(delCliente),
          contenido: { tipo, texto: conAudio ? "" : texto },
          reunionExistenteId: existente?.id ?? null,
          confirmarOtra: cual === OTRA,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 409 && Array.isArray(data.reunionesDelDia)) {
        setOpciones((o) => (o ? { ...o, reunionesDelDia: data.reunionesDelDia } : o));
        setCual(null);
        setError(data.error ?? "Ese día ya hay reuniones de este cliente.");
        return;
      }
      if (!r.ok) throw new Error(data.error ?? "No se pudo agregar la reunión.");
      if (conAudio) {
        // La reunión ya está: en el mismo cajón se sube la grabación.
        setParaElAudio(data.sessionId);
        onAgregada?.(data.sessionId);
        return;
      }
      toast.success(data.lectura?.mensaje ?? "Reunión agregada.", {
        action: { label: "Abrir la reunión", onClick: () => router.push(`/sessions/${data.sessionId}`) },
      });
      onAgregada?.(data.sessionId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar la reunión.");
    } finally {
      setGuardando(false);
    }
  }

  const nombreCliente = clienteFijo?.nombre ?? opciones?.cliente.nombre ?? "este cliente";

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      title="Agregar una reunión"
      description="Una de Zoom, Teams, presencial o por teléfono, o una de Meet que no dejó transcripción. Nexus la lee como a cualquier otra."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          {paraElAudio ? (
            <Button variant="primary" onClick={() => router.push(`/sessions/${paraElAudio}`)}>
              Abrir la reunión
            </Button>
          ) : (
            <Button variant="primary" onClick={guardar} disabled={!puedeGuardar || cargando}>
              {guardando ? "Agregando…" : conAudio ? "Agregar y subir el audio" : existente ? "Agregar lo que pasó" : "Agregar reunión"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {paraElAudio && (
          <section className="space-y-3">
            <Alert variant="success">La reunión quedó agregada. Ahora sube la grabación: Google la transcribe y Nexus la lee.</Alert>
            <SubirAudio
              sessionId={paraElAudio}
              inicial={null}
              alTerminarLaSubida={() => toast.success("El audio se subió: Google lo está transcribiendo. Lo verás en la reunión.")}
            />
          </section>
        )}
        {error && (
          <Alert variant="danger" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        <section className="space-y-4">
          {!clienteFijo && (
            <Field label="Cliente" required>
              <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Elige el cliente…</option>
                {(clientes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha" required>
              <Input type="date" value={fecha} max={diaEnCostaRica(new Date())} onChange={(e) => setFecha(e.target.value)} />
            </Field>
            <Field label="Hora" hint="Si no la sabes, déjala vacía.">
              <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </Field>
          </div>
        </section>

        {clientId && delDia.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-fg">
              Ese día hay {delDia.length === 1 ? "una reunión" : `${delDia.length} reuniones`} de {nombreCliente}. ¿Es una de estas?
            </h2>
            <div className="space-y-1.5" role="radiogroup" aria-label="¿Es una de estas reuniones?">
              {delDia.map((r) => (
                <label
                  key={r.id}
                  className={`flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm ${r.porQueNo ? "opacity-60" : "cursor-pointer hover:bg-surface-hover"}`}
                >
                  <input type="radio" name="cual" className="mt-1" disabled={!!r.porQueNo} checked={cual === r.id} onChange={() => setCual(r.id)} />
                  <span className="min-w-0">
                    <span className="text-fg">
                      {horaCR(r.inicio)} · {r.titulo}
                    </span>
                    <span className="block text-xs text-fg-muted">{r.porQueNo ?? "Sin transcripción ni notas: se le agrega lo que pasó."}</span>
                  </span>
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-hover">
                <input type="radio" name="cual" checked={cual === OTRA} onChange={() => setCual(OTRA)} />
                <span className="text-fg">Es otra reunión</span>
              </label>
            </div>
          </section>
        )}

        {clientId && opciones && esNueva && (
          <section className="space-y-4">
            <div className="grid grid-cols-[1fr_8rem] gap-3">
              <Field label="Título" required>
                <Input value={titulo} maxLength={200} placeholder="Llamada con Ana sobre el pipeline" onChange={(e) => setTitulo(e.target.value)} />
              </Field>
              <Field label="Duración (min)">
                <Input type="number" min={0} max={600} value={duracion} onChange={(e) => setDuracion(e.target.value)} />
              </Field>
            </div>

            <Field label="Del equipo, quién estuvo">
              <div className="max-h-40 overflow-y-auto rounded-lg border border-line p-2">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {opciones.equipo.map((m) => (
                    <label key={m.email} className="flex cursor-pointer items-center gap-2 text-sm text-fg-secondary">
                      <input type="checkbox" checked={equipo.has(m.email)} onChange={() => setEquipo((s) => alternar(s, m.email))} />
                      <span className="truncate">{m.nombre}</span>
                    </label>
                  ))}
                </div>
              </div>
            </Field>

            <Field
              label={`De ${nombreCliente}, quién estuvo`}
              hint="Nombres o correos, separados por coma. Si estuvo alguien del cliente, anótalo: sin eso, la reunión cuenta como solo del equipo."
            >
              <Input value={delCliente} placeholder="Ana Pérez, luis@empresa.com" onChange={(e) => setDelCliente(e.target.value)} />
            </Field>
          </section>
        )}

        {clientId && opciones && opciones.proyectos.length > 0 && (cual !== null || delDia.length === 0) && (
          <Field label="Proyectos" hint="De qué proyecto se habló. Si no es de ninguno, déjalo vacío: queda en la cuenta.">
            <div className="space-y-1">
              {opciones.proyectos.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm text-fg-secondary">
                  <input type="checkbox" checked={proyectos.has(p.id)} onChange={() => setProyectos((s) => alternar(s, p.id))} />
                  <span>{p.nombre}</span>
                </label>
              ))}
            </div>
          </Field>
        )}

        {!paraElAudio && clientId && opciones && (cual !== null || delDia.length === 0) && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-fg">Lo que pasó</h2>
              <Segmentado
                etiqueta="Qué vas a agregar"
                opciones={[
                  { clave: "recuerdo", etiqueta: "Lo que recuerdas" },
                  { clave: "transcripcion", etiqueta: "La transcripción" },
                  ...(opciones.audio ? [{ clave: "audio" as const, etiqueta: "El audio" }] : []),
                ]}
                valor={tipo}
                onCambio={(k) => setTipo(k)}
              />
            </div>
            {conAudio ? (
              <p className="text-[13px] leading-[19px] text-fg-secondary">
                Para una reunión presencial que grabaste con el teléfono: al agregarla, subes el audio aquí mismo. Google lo transcribe en unos
                minutos y Nexus la lee como cualquier otra.
              </p>
            ) : (
            <>
            <Field
              label={tipo === "recuerdo" ? "Con tus palabras" : "La transcripción"}
              hint={
                tipo === "recuerdo"
                  ? `De qué se habló, qué se acordó y qué quedó pendiente. Un resumen o unas notas alcanzan (${MIN_RECUERDO} caracteres o más). Nexus no lo toma como palabras del cliente.`
                  : `De Zoom, Teams o una grabación (${MIN_TRANSCRIPCION} caracteres o más). Si cada renglón dice quién habló («Ana: …»), mejor.`
              }
              error={problema}
            >
              <Textarea rows={10} value={texto} onChange={(e) => setTexto(e.target.value)} />
            </Field>
            <div className="flex items-center gap-2">
              <input
                ref={archivoRef}
                type="file"
                accept={ACEPTA_ARCHIVO_DE_REUNION}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void subirArchivo(f);
                }}
              />
              <Button variant="secondary" size="sm" onClick={() => archivoRef.current?.click()} disabled={leyendoArchivo}>
                {leyendoArchivo ? "Leyendo el archivo…" : "Subir un archivo"}
              </Button>
              <span className="text-xs text-fg-muted">.txt, .vtt o .srt (Zoom y Teams). Se muestra acá para que lo revises.</span>
            </div>
            </>
            )}
          </section>
        )}

      </div>
    </Drawer>
  );
}

/** El botón que abre el formulario. */
export function BotonAgregarReunion(props: Omit<AgregarReunionProps, "open" | "onClose"> & { etiqueta?: string; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  const { etiqueta = "+ Agregar reunión", className, ...resto } = props;
  return (
    <>
      <Button variant="secondary" size="sm" className={className} onClick={() => setAbierto(true)}>
        {etiqueta}
      </Button>
      {abierto && <AgregarReunion {...resto} open={abierto} onClose={() => setAbierto(false)} />}
    </>
  );
}
