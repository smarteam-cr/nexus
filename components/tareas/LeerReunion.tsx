"use client";

/**
 * components/tareas/LeerReunion.tsx — «Leer una reunión» en tres pasos (docs/tareas-plan.md §5.4).
 *
 * 1. Elegir la reunión: las internas en las que estuviste, las más recientes arriba (o buscadas por título). Si está
 *    dos veces, se lee la que tiene notas, y lo dice.
 * 2. Qué es: planning, cierre o las dos (el día marca la de por defecto) y de qué equipo es (decide quién recibe «Por
 *    asignar»). Con más de 7 días no avisa a nadie, salvo «Avisar igual».
 * 3. Lo que salió: cuántas, de quién, si hizo falta la IA y cuánto costó, y los proyectos que sugiere. La lectura corre
 *    en el servidor; esta pantalla la consulta cada dos segundos hasta que termina.
 *    Nivel 2 (§7.3): si las notas no traían próximos pasos, Nexus lee la conversación solo; si no, «¿Faltó algo?» la
 *    lee con un clic, con lo que cuesta más o menos a la vista.
 *
 * Una reunión se lee UNA vez: elegir una ya leída va directo al paso 3.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Interruptor, Modal, Segmentado, Select } from "@/components/ui";
import { BotonAzul, BotonTexto, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { EQUIPOS } from "@/lib/tareas/equipos";
import { DIAS_PARA_AVISAR_UNA_LECTURA, MIN_CARACTERES_DE_CONVERSACION } from "@/lib/tareas/reglas";
import { diaYHora } from "@/lib/tareas/semana";
import { apiTareas, type ConversacionDeLaLectura, type EstadoDeLectura, type ReunionParaLeer } from "./api";
import { Chip } from "./chips";
import { useAsistenteDeTareas } from "./AsistenteDeTareas";

type Paso = "elegir" | "que_es" | "resultado";
type Rol = "planning" | "cierre" | "ambos";

const ROLES = [
  { clave: "planning" as const, etiqueta: "Planning", title: "Lo que se planeó para la semana" },
  { clave: "cierre" as const, etiqueta: "Cierre", title: "La retro: qué se hizo y qué sigue" },
  { clave: "ambos" as const, etiqueta: "Las dos", title: "Se revisó la semana y se planeó la siguiente" },
];

const TERMINADA = new Set(["lista", "sin_ia", "sin_texto", "copia", "error"]);

/** «≈ US$0,03»: lo que cuesta más o menos leer la conversación. */
function usd(n: number): string {
  return `US$${n.toFixed(n < 0.01 ? 3 : 2).replace(".", ",")}`;
}

function diasDesde(iso: string): number {
  return Math.floor((Date.now() - +new Date(iso)) / 86_400_000);
}

export function LeerReunion({ abierto, onCerrar, onLeida }: { abierto: boolean; onCerrar: () => void; onLeida: () => void }) {
  const [paso, setPaso] = useState<Paso>("elegir");
  const [q, setQ] = useState("");
  const [reuniones, setReuniones] = useState<ReunionParaLeer[] | null>(null);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [elegida, setElegida] = useState<ReunionParaLeer | null>(null);
  const asistente = useAsistenteDeTareas();
  const [rol, setRol] = useState<Rol>("planning");
  const [equipo, setEquipo] = useState<string>("marketing");
  const [avisarIgual, setAvisarIgual] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [lecturaId, setLecturaId] = useState<string | null>(null);
  const [lectura, setLectura] = useState<EstadoDeLectura | null>(null);
  const [errorLectura, setErrorLectura] = useState<string | null>(null);
  const [pidiendoConversacion, setPidiendoConversacion] = useState(false);
  /** Sube al pedir la conversación: vuelve a consultar la lectura hasta que termine. */
  const [vuelta, setVuelta] = useState(0);
  const avisadoRef = useRef(false);
  const conversacionAvisadaRef = useRef(false);

  // Al abrir, empieza de cero.
  useEffect(() => {
    if (!abierto) return;
    setPaso("elegir");
    setQ("");
    setElegida(null);
    setLecturaId(null);
    setLectura(null);
    setErrorLectura(null);
    setAvisarIgual(false);
    avisadoRef.current = false;
    conversacionAvisadaRef.current = false;
  }, [abierto]);

  // La lista: al abrir y al buscar (con una pausa corta mientras se escribe).
  useEffect(() => {
    if (!abierto || paso !== "elegir") return;
    let vivo = true;
    const t = setTimeout(
      () => {
        apiTareas
          .reuniones(q.trim() || undefined)
          .then((r) => {
            if (!vivo) return;
            setReuniones(r.reuniones);
            setErrorLista(null);
          })
          .catch((e) => vivo && setErrorLista(e instanceof Error ? e.message : "No se pudieron traer tus reuniones."));
      },
      q ? 300 : 0,
    );
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [abierto, paso, q]);

  // La lectura, cada dos segundos hasta que termina.
  useEffect(() => {
    if (!abierto || !lecturaId) return;
    let vivo = true;
    let t: ReturnType<typeof setTimeout> | null = null;
    let fallos = 0;
    const mirar = async () => {
      try {
        const l = await apiTareas.lectura(lecturaId);
        if (!vivo) return;
        setLectura(l);
        if (TERMINADA.has(l.estado) && l.conversacion?.estado !== "leyendo") {
          if (!avisadoRef.current && l.estado !== "error") {
            avisadoRef.current = true;
            onLeida();
          } else if (vuelta > 0 && !conversacionAvisadaRef.current) {
            conversacionAvisadaRef.current = true;
            onLeida();
          }
          return;
        }
      } catch (e) {
        if (!vivo) return;
        // Un corte de red no detiene la consulta: lo dice y vuelve a mirar, cada vez más espaciado.
        setErrorLectura(e instanceof Error ? e.message : "No se pudo consultar la lectura.");
        fallos++;
        t = setTimeout(mirar, Math.min(2000 * 2 ** fallos, 30_000));
        return;
      }
      fallos = 0;
      setErrorLectura(null);
      t = setTimeout(mirar, 2000);
    };
    void mirar();
    return () => {
      vivo = false;
      if (t) clearTimeout(t);
    };
  }, [abierto, lecturaId, onLeida, vuelta]);

  function elegir(fila: ReunionParaLeer) {
    // Una reunión que está dos veces se lee por la otra fila, la que tiene las notas.
    const r = fila.gemelaDe ? (reuniones?.find((x) => x.id === fila.gemelaDe) ?? { ...fila, id: fila.gemelaDe, gemelaDe: null, lectura: null }) : fila;
    setElegida(r);
    // Se leyó cuando no tenía notas y ahora sí: se vuelve a leer.
    const llegaronLasNotas = r.lectura?.estado === "sin_texto" && (r.conNotas || r.actionItems > 0);
    if (r.lectura && r.lectura.estado !== "error" && !llegaronLasNotas) {
      setLecturaId(r.lectura.id);
      setPaso("resultado");
      return;
    }
    setRol(r.rolSugerido);
    setEquipo(r.equipoSugerido ?? "marketing");
    setAvisarIgual(false);
    setPaso("que_es");
  }

  const leer = useCallback(async () => {
    if (!elegida) return;
    setEnviando(true);
    setErrorLectura(null);
    try {
      const r = await apiTareas.leer({ sessionId: elegida.id, rol, equipo, avisarIgual });
      setLecturaId(r.id);
      setPaso("resultado");
    } catch (e) {
      setErrorLectura(e instanceof Error ? e.message : "No se pudo pedir la lectura.");
    } finally {
      setEnviando(false);
    }
  }, [elegida, rol, equipo, avisarIgual]);

  const leerConversacion = useCallback(async () => {
    if (!lecturaId) return;
    setPidiendoConversacion(true);
    setErrorLectura(null);
    try {
      await apiTareas.leerConversacion(lecturaId);
      conversacionAvisadaRef.current = false;
      setVuelta((v) => v + 1);
    } catch (e) {
      setErrorLectura(e instanceof Error ? e.message : "No se pudo pedir la lectura de la conversación.");
    } finally {
      setPidiendoConversacion(false);
    }
  }, [lecturaId]);

  const vieja = elegida ? diasDesde(elegida.inicio) > DIAS_PARA_AVISAR_UNA_LECTURA : false;
  const leyendo = !!lecturaId && (!lectura || !TERMINADA.has(lectura.estado) || lectura.conversacion?.estado === "leyendo");

  const footer =
    paso === "elegir" ? (
      <BotonTexto onClick={onCerrar}>Cancelar</BotonTexto>
    ) : paso === "que_es" ? (
      <>
        <BotonTexto onClick={() => setPaso("elegir")}>Volver</BotonTexto>
        <BotonAzul onClick={() => void leer()} disabled={enviando || !elegida}>
          {enviando ? "Pidiendo la lectura…" : "Leer la reunión"}
        </BotonAzul>
      </>
    ) : (
      <>
        {asistente && elegida && !leyendo ? (
          <BotonTexto
            onClick={() => {
              asistente.abrir({ chip: { tipo: "reunion", id: elegida.id, etiqueta: `la reunión «${elegida.titulo}»` } });
              onCerrar();
            }}
          >
            Preguntarle al asistente
          </BotonTexto>
        ) : null}
        <BotonAzul onClick={onCerrar} disabled={leyendo}>
          {leyendo ? "Leyendo…" : "Ver mis tareas"}
        </BotonAzul>
      </>
    );

  return (
    <Modal
      open={abierto}
      onClose={onCerrar}
      size="xl"
      title="Leer una reunión"
      description={paso === "elegir" ? "Paso 1 de 3 · Elige la reunión" : paso === "que_es" ? "Paso 2 de 3 · Qué fue la reunión" : "Paso 3 de 3 · Lo que salió"}
      footer={<div className="flex w-full items-center justify-end gap-2">{footer}</div>}
    >
      {paso === "elegir" && (
        <div className="space-y-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por título (por ejemplo, «Sprint planning»)"
            aria-label="Buscar una reunión"
            autoFocus
            className="h-9 w-full rounded-md border border-line bg-surface px-3 text-[13px] text-fg outline-none placeholder:text-fg-muted"
          />
          {errorLista && <p className="text-[13px] text-danger-ink">{errorLista}</p>}
          {!reuniones && !errorLista && <p className="text-[13px] text-fg-muted">Buscando tus reuniones…</p>}
          {reuniones && reuniones.length === 0 && (
            <p className="rounded-lg border border-line bg-surface-muted px-3 py-3 text-[13px] text-fg-muted">
              {q ? "Ninguna reunión tuya con ese título." : "No encontramos reuniones internas tuyas recientes. Prueba buscando por el título."}
            </p>
          )}
          {reuniones && reuniones.length > 0 && (
            <ul className="max-h-[52vh] divide-y divide-line overflow-y-auto rounded-lg border border-line">
              {reuniones.map((r) => {
                const sinTexto = !r.conNotas && r.actionItems === 0;
                const conConversacion = r.largoTranscript >= MIN_CARACTERES_DE_CONVERSACION;
                return (
                  <li key={r.id}>
                    <button type="button" onClick={() => elegir(r)} className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-fg">{r.titulo}</span>
                        <span className="mt-0.5 block text-xs text-fg-muted">
                          {diaYHora(r.inicio)} · {r.participantes === 1 ? "1 persona" : `${r.participantes} personas`}
                          {r.cliente ? ` · ${r.cliente}` : ""}
                        </span>
                        {r.gemelaDe && <span className="mt-0.5 block text-xs text-fg-muted">Está dos veces en tu calendario: se lee la otra, que tiene las notas.</span>}
                      </span>
                      <span className="flex flex-shrink-0 flex-col items-end gap-1">
                        {r.lectura && r.lectura.estado !== "error" ? (
                          <Chip tono="verde">Ya se leyó</Chip>
                        ) : sinTexto && conConversacion ? (
                          <Chip title="Sin notas de Gemini: Nexus lee la conversación.">Con la conversación</Chip>
                        ) : sinTexto ? (
                          <Chip tono="ambar" title="Sin notas de Gemini, sin tareas y sin conversación grabada: no hay qué leer.">Sin notas</Chip>
                        ) : (
                          <Chip>{r.conNotas ? "Con notas de Gemini" : `${r.actionItems} tareas anotadas`}</Chip>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {paso === "que_es" && elegida && (
        <div className="space-y-5">
          <div className="rounded-lg border border-line bg-surface-muted px-3 py-2.5">
            <p className="text-sm font-medium text-fg">{elegida.titulo}</p>
            <p className="text-xs text-fg-muted">{diaYHora(elegida.inicio)}</p>
          </div>
          <div className="space-y-2">
            <p className={ROTULO_DEL_SISTEMA}>¿Qué fue?</p>
            <Segmentado opciones={ROLES} valor={rol} onCambio={setRol} etiqueta="Qué fue la reunión" />
            <p className="text-xs text-fg-muted">
              {rol === "planning"
                ? "Las tareas que salgan van a la semana de esta reunión."
                : rol === "cierre"
                  ? "Lo que diga de cada tarea queda como sugerencia para cuando cada persona revise su semana."
                  : "Se lee lo que se cerró y lo que se planeó."}
            </p>
          </div>
          <div className="space-y-2">
            <p className={ROTULO_DEL_SISTEMA}>¿De qué equipo es la reunión?</p>
            <Select value={equipo} onChange={(e) => setEquipo(e.target.value)} className="h-9 w-64 py-1.5 text-[13px]" aria-label="Equipo de la reunión">
              {EQUIPOS.map((e) => (
                <option key={e.clave} value={e.clave}>
                  {e.nombre}
                </option>
              ))}
            </Select>
            <p className="text-xs text-fg-muted">Lo que no tenga dueño claro va a «Por asignar» de este equipo.</p>
          </div>
          {vieja && (
            <div className="space-y-2 rounded-lg border border-warn-line bg-warn-surface px-3 py-2.5">
              <p className="text-[13px] text-warn-ink">
                Tiene más de {DIAS_PARA_AVISAR_UNA_LECTURA} días: las propuestas quedan en Tareas, pero no se avisa a nadie.
              </p>
              <Interruptor activo={avisarIgual} onCambio={setAvisarIgual} etiqueta="Avisar igual" texto="Avisar igual a cada persona" />
            </div>
          )}
          {errorLectura && <p className="text-[13px] text-danger-ink">{errorLectura}</p>}
        </div>
      )}

      {paso === "resultado" && (
        <ResultadoDeLaLectura reunion={elegida} lectura={lectura} error={errorLectura} pidiendo={pidiendoConversacion} onLeerConversacion={() => void leerConversacion()} />
      )}
    </Modal>
  );
}

function ResultadoDeLaLectura({
  reunion,
  lectura,
  error,
  pidiendo,
  onLeerConversacion,
}: {
  reunion: ReunionParaLeer | null;
  lectura: EstadoDeLectura | null;
  error: string | null;
  pidiendo: boolean;
  onLeerConversacion: () => void;
}) {
  if (!lectura || lectura.estado === "leyendo" || lectura.estado === "en_espera") {
    return (
      <div className="space-y-2 py-6 text-center">
        <p className="text-sm text-fg">Nexus está leyendo {reunion ? `«${reunion.titulo}»` : "la reunión"}…</p>
        <p className="text-xs text-fg-muted">Suele tardar menos de un minuto. Puedes cerrar esto: las propuestas llegan igual a «Por decidir».</p>
        {error && <p className="text-[13px] text-danger-ink">{error}</p>}
      </div>
    );
  }
  if (lectura.estado === "error") {
    return (
      <div className="rounded-lg border border-danger-line bg-danger-surface px-3 py-2.5 text-[13px] text-danger-ink">
        No se pudo leer: {lectura.error ?? "error desconocido"}. Vuelve a elegirla para intentarlo otra vez.
      </div>
    );
  }
  const r = lectura.resumen;
  if (lectura.estado === "copia" || r?.copiaDe) {
    return <p className="text-[13px] text-fg-secondary">Esta reunión tiene la misma conversación que otra que ya se leyó: sus propuestas ya están en Tareas.</p>;
  }
  // La leyó la lectura de seguimiento de la reunión (una reunión con un cliente o un prospecto): ya leyó la
  // conversación entera, así que no se ofrece «¿Faltó algo?».
  if (r?.modelo === "seguimiento") return <ResultadoDelSeguimiento r={r} />;
  const conversacion = (
    <SeccionDeLaConversacion lectura={lectura} pidiendo={pidiendo} onLeer={onLeerConversacion} error={error} />
  );
  // Sin notas ni tareas anotadas: lo único que queda es la conversación (sola, o con «¿Faltó algo?»).
  if (lectura.estado === "sin_texto" || (r && r.lineas === 0)) {
    const hayConversacion = !!r?.conversacion || lectura.conversacion.estado === "leyendo" || lectura.conversacion.puede;
    return (
      <div className="space-y-4">
        {!r?.conversacion && (
          <p className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2.5 text-[13px] text-warn-ink">
            {r?.sinNotas === false ? "Las notas de Gemini no traen próximos pasos con dueño." : "La reunión no tiene notas de Gemini ni tareas anotadas."}
            {hayConversacion ? "" : " Tampoco tiene conversación grabada: no hay qué leer. Si las notas llegan después, vuelve a elegirla."}
          </p>
        )}
        {conversacion}
      </div>
    );
  }
  if (!r) return <p className="text-[13px] text-fg-muted">La lectura terminó, pero no trae resumen.</p>;

  return (
    <div className="space-y-5">
      <Cifras
        datos={[
          { rotulo: "Propuestas", valor: r.propuestas },
          { rotulo: "Por asignar", valor: r.porAsignar },
          { rotulo: "Ya estaban", valor: r.yaEstaban },
          { rotulo: "Líneas leídas", valor: r.lineas },
        ]}
      />
      <ParaQuienYProyectos porPersona={r.porPersona} proyectos={r.proyectos} />

      <p className="text-xs text-fg-muted">
        {r.modelo === "codigo"
          ? r.costo
            ? `Las notas ya decían de quién era cada cosa; la IA solo escribió el contexto de cada tarea · ${r.costo.entrada.toLocaleString("es-CR")} tokens de entrada y ${r.costo.salida.toLocaleString("es-CR")} de salida.`
            : "Se leyó sin IA: las notas ya decían de quién era cada cosa."
          : r.modelo === "haiku"
            ? `Hizo falta la IA (${r.motivosDelModelo.join(", ") || "para ordenar las líneas"})${r.costo ? ` · ${r.costo.entrada.toLocaleString("es-CR")} tokens de entrada y ${r.costo.salida.toLocaleString("es-CR")} de salida` : ""}.`
            : "La IA no estaba disponible: se leyó solo con reglas, y lo dudoso quedó por asignar."}
        {r.cierres > 0 ? ` La retro dijo algo de ${r.cierres === 1 ? "1 tarea" : `${r.cierres} tareas`}: lo verás al revisar tu semana.` : ""}
        {r.omitidas.lapida > 0 ? ` ${r.omitidas.lapida === 1 ? "1 línea no se propuso" : `${r.omitidas.lapida} líneas no se propusieron`} porque alguien ya la había descartado.` : ""}
      </p>
      {conversacion}
    </div>
  );
}

/** Lo que dejó para Tareas la lectura de seguimiento de la reunión (lib/sessions/post-process.ts). */
function ResultadoDelSeguimiento({ r }: { r: NonNullable<EstadoDeLectura["resumen"]> }) {
  const costo = r.costo ? ` · ${r.costo.entrada.toLocaleString("es-CR")} tokens de entrada y ${r.costo.salida.toLocaleString("es-CR")} de salida` : "";
  return (
    <div className="space-y-5">
      <Cifras
        datos={[
          { rotulo: "Propuestas", valor: r.propuestas },
          { rotulo: "Por asignar", valor: r.porAsignar },
          { rotulo: "Ya estaban", valor: r.yaEstaban },
          { rotulo: "Compromisos leídos", valor: r.lineas },
        ]}
      />
      <ParaQuienYProyectos porPersona={r.porPersona} proyectos={r.proyectos} />
      <p className="text-xs text-fg-muted">
        {r.lineas === 0
          ? `La leyó el seguimiento de la reunión: leyó la conversación entera y no encontró compromisos${costo}.`
          : `La leyó el seguimiento de la reunión: leyó la conversación entera y dejó lo que se comprometió cada lado${costo}.`}
        {r.omitidas.lapida > 0 ? ` ${r.omitidas.lapida === 1 ? "1 compromiso no se propuso" : `${r.omitidas.lapida} compromisos no se propusieron`} porque alguien ya lo había descartado.` : ""}
      </p>
    </div>
  );
}

function Cifras({ datos }: { datos: { rotulo: string; valor: number }[] }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-3", datos.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
      {datos.map((d) => (
        <div key={d.rotulo} className="rounded-lg border border-line px-3 py-2">
          <dt className={ROTULO_DEL_SISTEMA}>{d.rotulo}</dt>
          <dd className="text-xl font-semibold tabular-nums text-fg">{d.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

function ParaQuienYProyectos({ porPersona, proyectos }: { porPersona: { email: string; nombre: string; propuestas: number }[]; proyectos: { id: string; nombre: string; nuevo: boolean }[] }) {
  return (
    <>
      {porPersona.length > 0 && (
        <section className="space-y-1.5">
          <p className={ROTULO_DEL_SISTEMA}>Para quién</p>
          <ul className="space-y-1">
            {porPersona.map((p) => (
              <li key={p.email} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-fg">{p.nombre}</span>
                <span className="tabular-nums text-fg-muted">{p.propuestas === 1 ? "1 propuesta" : `${p.propuestas} propuestas`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {proyectos.length > 0 && (
        <section className="space-y-1.5">
          <p className={ROTULO_DEL_SISTEMA}>Proyectos</p>
          <ul className="space-y-1.5">
            {proyectos.map((p) => (
              <li key={p.id} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px]", p.nuevo ? "border-info-line bg-info-surface text-brand" : "border-line text-fg")}>
                {p.nuevo && <IconoDeSugerencia className="h-3.5 w-3.5" />}
                {p.nuevo ? `Nexus sugiere el proyecto «${p.nombre}»` : `Se sumaron tareas a «${p.nombre}»`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** El nivel 2: lo que salió de la conversación, «Leyendo la conversación…», o el botón «¿Faltó algo?». */
function SeccionDeLaConversacion({ lectura, pidiendo, onLeer, error }: { lectura: EstadoDeLectura; pidiendo: boolean; onLeer: () => void; error: string | null }) {
  const c: ConversacionDeLaLectura | undefined = lectura.resumen?.conversacion;
  const estado = lectura.conversacion.estado ?? c?.estado ?? null;
  const motivo = lectura.conversacion.motivo ?? c?.motivo ?? null;
  const boton = lectura.conversacion.puede ? (
    <BotonTexto onClick={onLeer} disabled={pidiendo}>
      {pidiendo
        ? "Pidiendo…"
        : `${estado === "error" || estado === "sin_ia" ? "Volver a leer la conversación" : "¿Faltó algo? Leer la conversación"}${lectura.conversacion.costoEstimado !== null ? ` (≈ ${usd(lectura.conversacion.costoEstimado)})` : ""}`}
    </BotonTexto>
  ) : null;

  if (estado === "leyendo") {
    return (
      <section className="space-y-1 rounded-lg border border-line px-3 py-2.5">
        <p className="text-[13px] text-fg">Nexus está leyendo la conversación…</p>
        <p className="text-xs text-fg-muted">Puede tardar hasta un minuto. Lo que salga llega a «Por decidir» de cada persona.</p>
      </section>
    );
  }
  if (c && estado === "lista") {
    return (
      <section className="space-y-3 border-t border-line pt-4">
        <div className="flex items-center gap-2">
          <IconoDeSugerencia className="h-3.5 w-3.5 text-brand" />
          <p className="text-sm font-semibold text-fg">De la conversación</p>
        </div>
        <Cifras
          datos={[
            { rotulo: "Propuestas", valor: c.propuestas },
            { rotulo: "Por asignar", valor: c.porAsignar },
            { rotulo: "Ya estaban", valor: c.yaEstaban + c.sumadas },
          ]}
        />
        <ParaQuienYProyectos porPersona={c.porPersona} proyectos={c.proyectos} />
        <p className="text-xs text-fg-muted">
          {c.como === "automatica" ? "Las notas no traían próximos pasos: Nexus leyó la conversación. " : ""}
          {c.propuestas + c.porAsignar === 0 ? "No encontró compromisos nuevos. " : "Cada propuesta lleva el pedazo de la conversación que la dice. "}
          {c.recortada ? "La conversación era muy larga: se leyeron los primeros turnos. " : ""}
          {c.costo ? `${c.costo.entrada.toLocaleString("es-CR")} tokens de entrada y ${c.costo.salida.toLocaleString("es-CR")} de salida.` : ""}
          {c.omitidas.lapida > 0 ? ` ${c.omitidas.lapida === 1 ? "1 no se propuso" : `${c.omitidas.lapida} no se propusieron`} porque alguien ya la había descartado.` : ""}
        </p>
      </section>
    );
  }
  if (estado === "error" || estado === "sin_ia") {
    return (
      <section className="space-y-2">
        <p className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2.5 text-[13px] text-warn-ink">
          {motivo === "sin_turnos"
            ? "La transcripción no trae quién dijo qué: no hay una conversación que leer."
            : motivo === "salida_invalida"
              ? "No se pudo leer la conversación: la IA devolvió algo que no se pudo usar."
              : "No se pudo leer la conversación: la IA no respondió o falló."}
        </p>
        {boton}
        {error && <p className="text-[13px] text-danger-ink">{error}</p>}
      </section>
    );
  }
  if (!boton) return error ? <p className="text-[13px] text-danger-ink">{error}</p> : null;
  return (
    <section className="space-y-1">
      {boton}
      <p className="text-xs text-fg-muted">Nexus lee lo que se dijo en la reunión y propone los compromisos que no quedaron en las notas. Nada entra solo.</p>
      {error && <p className="text-[13px] text-danger-ink">{error}</p>}
    </section>
  );
}
