"use client";

/**
 * HablarConNexus — «Hablar con Nexus» en la preventa (Elías, 21 nov): el botón de la barra de la izquierda y su cajón.
 *
 * La conversación es la genérica (components/chat-de-nexus/PanelDeNexus.tsx): la persona cuenta algo o pregunta algo de
 * la cuenta. Cuando Nexus entiende lo que contó, acá pasa lo de la preventa, en este orden:
 *   0. NADA se guarda solo (Elías, 21 nov: «resumelos» quedó guardado como nota). Se ve «Esto cambia lo que se sabe del
 *      cliente»: la nota con sus palabras y lo que Nexus entendió (los hechos), con «Guardar» y «No guardar», y
 *      «¿Era una pregunta? Respóndela» debajo de lo que escribió;
 *   1. con «Guardar», la nota va a «Lo que sabes del cliente», con las palabras de la persona, su nombre y la hora
 *      (la operación `nota` de siempre: el servidor pone quién y cuándo);
 *   2. el servidor deja sus hechos (destino: esta preventa; se ven debajo de la nota) y pregunta al agente de impacto si
 *      cambia la página de La escala: si cambia, la cuenta regresiva de 10 s (components/impacto/AvisoDeImpacto.tsx), y
 *      el aviso dice si contradice lo que aceptó el cliente;
 *   3. cada cambio a una tarjeta de la arquitectura de la venta, con «Aplicar» y «No», y «Aplicar todo» para los que
 *      quedan (avisa antes cuántos reemplazan algo). Nada se aplica sin un clic.
 * Lo propuesto, lo aplicado y el aviso viven acá y no en el cajón: cerrarlo y volver a abrirlo no los pierde. Cerrarlo
 * con la cuenta regresiva a la vista la CANCELA, y al volver no arranca otra.
 * GUARDADA (21 nov): al volver a la preventa, el cajón trae la última conversación de quien mira en esta preventa
 * (…/nexus/conversacion, lib/chat-de-nexus/guardada.ts), con lo propuesto y lo que se hizo con cada cambio; lo que no se
 * guardó vuelve con su «Guardar». La cuenta regresiva de una conversación de antes no vuelve a correr. «Nueva
 * conversación» (y «No guardar») la cierra.
 * SEGUIR (22 nov, etapa 0 del plan maestro): con la nota guardada y revisada, sin un «Aplicar» pendiente ni la cuenta
 * regresiva a la vista, el cuadro de escribir vuelve debajo (`alSeguir`): lo ya guardado queda marcado y no se repite en la
 * nota siguiente. Un «gracias» o un «ok» no se ofrece guardar (lib/chat-de-nexus/conversacion.ts › `esCortesia`).
 * Convive con «Agregar algo que sabes» (components/exploraciones/LoQueSabes.tsx): es otra puerta a las mismas notas.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Drawer } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto } from "@/components/ui/sistema";
import PanelDeNexus, { conversacionNueva, type ConversacionEnPantalla, type TurnoListo } from "@/components/chat-de-nexus/PanelDeNexus";
import AvisoDeImpacto from "@/components/impacto/AvisoDeImpacto";
import { OMITIDO_POR_EL_TOPE } from "@/lib/ai/tope-de-nexus";
import { diaConAnio } from "@/lib/exploraciones/fechas";
import { EVENTO_HECHOS_DE_LAS_NOTAS } from "@/lib/exploraciones/hechos-de-las-notas";
import { claveNuevaDeLoQueSabes, MAX_LO_QUE_SABES, loQueSabeElEquipo } from "@/lib/exploraciones/lo-que-sabes";
import {
  aplicarTodo,
  avisoDeReemplazos,
  comoSeVeElCambio,
  esCasillaParaNexus,
  planDeAplicarTodo,
  resumenDeAplicarTodo,
  type EstadoDelCambioEnPantalla,
  type ResultadoDeAplicarTodo,
} from "@/lib/exploraciones/nexus-en-la-preventa";
import { notaDeLaConversacion, type CambioPropuesto } from "@/lib/chat-de-nexus/conversacion";
import type { ConversacionGuardada } from "@/lib/chat-de-nexus/guardada";
import { useLienzo } from "./contexto";
import { CORRIENDO_LA_ESCALA, useRehacerLaEscala } from "./rehacer-la-escala";

/** Lo que responde …/nexus/guardado (los tipos del servidor, sin importarlo). */
interface Guardado {
  hechos: { estado: "escritos"; escritos: number } | { estado: "ya-estaban"; escritos: number } | { estado: "apagados" | "sin-hechos" | "sin-conversacion" | "la-nota-cambio" };
  impacto: { cambia: boolean; aviso: string; omitido?: string };
  /** La revisión no volvió (la red, el servidor o el agente): no se sabe si cambia La escala. */
  fallo?: true;
}

type EstadoDelCambio = EstadoDelCambioEnPantalla;
/**
 * El aviso de La escala: a la vista, cerrado por la persona, cancelado al cerrar el cajón, o de una conversación de antes
 * (al volver a la página: la cuenta regresiva no se repite).
 */
type EstadoDelAviso = "abierto" | "cerrado" | "cancelado-al-cerrar" | "de-antes";

interface Listo {
  /** La nota guardada; null mientras la persona no apretó «Guardar» (o si volvió del servidor sin saber si se guardó). */
  clave: string | null;
  conversacion: string;
  cambios: CambioPropuesto[];
  /** Lo que Nexus entendió: las frases de los hechos, sin verificar (se verifican al guardar, contra la nota). */
  hechos: string[];
  /** Lo que contó la persona, tal cual: con esto se busca (o se vuelve a guardar) una nota que no se sabe si quedó. */
  nota: string;
  /** Volvió del servidor al abrir la página (no es de esta visita): solo entonces se busca su nota por el texto. */
  deAntes: boolean;
  /** Salió de «Guardarlo como nota» en una visita de antes: «¿Era una pregunta?» no vuelve. */
  contado: boolean;
}

const urlDeLaConversacion = (id: string) => `/api/sales/exploraciones/${id}/nexus/conversacion`;

/** Anota en el servidor lo que pasó con la conversación. Si no llega, se pierde solo eso: la tarjeta ya cambió. */
function anotar(exploracionId: string, cuerpo: { conversacion: string; estados: Record<string, "aplicado" | "descartado"> } | { conversacion: string; cerrar: true }) {
  void fetch(urlDeLaConversacion(exploracionId), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }).catch(() => {});
}

/**
 * La nota de una conversación que volvió del servidor sin su clave (la página se cerró entre guardarla y su revisión): si
 * ya está en «Lo que sabes» con las mismas palabras, es esa; si no, no quedó y se puede guardar ahora. Solo para lo que
 * vuelve de antes: lo de esta visita sin clave no se guardó, aunque una nota vieja diga lo mismo.
 */
function claveDeLaNota(notas: Record<string, string>, listo: Listo): string | null {
  if (listo.clave) return listo.clave;
  if (!listo.deAntes) return null;
  const t = listo.nota.trim();
  return t ? (loQueSabeElEquipo(notas).find((n) => n.texto.trim() === t)?.clave ?? null) : null;
}

/** Lo que va a «Lo que sabes del cliente» si la persona aprieta «Guardar»: sus palabras y lo que Nexus entendió. */
function PorGuardar({ listo, guardando, onGuardar, onNoGuardar }: { listo: Listo; guardando: boolean; onGuardar: () => void; onNoGuardar: () => void }) {
  const { exp, puedeEditar } = useLienzo();
  const llena = loQueSabeElEquipo(exp.estado.contenido.notas).length >= MAX_LO_QUE_SABES;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-fg-secondary">En «Lo que sabes del cliente», con tu nombre:</p>
      <p className="whitespace-pre-wrap rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-fg">{listo.nota}</p>
      {listo.hechos.length > 0 && (
        <>
          <p className="text-xs text-fg-secondary">Lo que Nexus entendió (queda como hechos de la cuenta, debajo de la nota):</p>
          <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-fg marker:text-fg-muted">
            {listo.hechos.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </>
      )}
      {llena && <Alert variant="warning">«Lo que sabes del cliente» ya tiene {MAX_LO_QUE_SABES} notas: quita una en la Preparación antes de guardar esta.</Alert>}
      {puedeEditar && (
        <div className="flex items-center gap-2">
          <BotonAzul disabled={guardando || llena} onClick={onGuardar}>
            {guardando ? "Guardando…" : "Guardar"}
          </BotonAzul>
          <BotonTexto disabled={guardando} onClick={onNoGuardar}>
            No guardar
          </BotonTexto>
        </div>
      )}
    </div>
  );
}

function QuedoGuardada({ clave }: { clave: string }) {
  const { exp } = useLienzo();
  const autor = exp.estado.contenido.autoresDeLasNotas?.[clave];
  const cuando = autor
    ? ` el ${diaConAnio(Date.parse(autor.en))}, a las ${new Date(autor.en).toLocaleTimeString("es-CR", { hour: "numeric", minute: "2-digit" })}${autor.por ? `, por ${autor.por.split("@")[0]}` : ""}`
    : "";
  return (
    <p className="text-[13px] text-fg">
      <span aria-hidden className="text-success-ink">
        ✓{" "}
      </span>
      Guardado en «Lo que sabes del cliente»{cuando}.
    </p>
  );
}

function Cambio({
  cambio,
  estado,
  ocupado,
  sinGuardar,
  onAplicar,
  onNo,
}: {
  cambio: CambioPropuesto;
  estado: EstadoDelCambio;
  ocupado: boolean;
  /** La nota todavía no se guardó: el cambio se ve, y se aplica después (la nota es lo que lo respalda). */
  sinGuardar: boolean;
  onAplicar: () => void;
  onNo: () => void;
}) {
  const { exp, puedeEditar } = useLienzo();
  const se = comoSeVeElCambio(exp.estado.contenido, cambio.destino, cambio.valor);
  if (!se) return null;
  const pendiente = estado === "propuesto" || estado === "aplicando";
  return (
    <li className="rounded-lg border border-line bg-surface px-3 py-2.5">
      <p className="text-xs font-semibold text-fg">
        {se.donde}
        <span className="ml-1.5 font-normal text-fg-muted">{pendiente && se.reemplaza.length ? "· reemplaza" : se.suma ? "· se suma" : "· se escribe"}</span>
      </p>
      {pendiente && se.reemplaza.length > 0 && <p className="mt-1 text-xs text-fg-muted line-through">{se.reemplaza.join(" · ")}</p>}
      <ul className="mt-1 space-y-0.5">
        {se.queda.map((l, i) => (
          <li key={i} className="text-[13px] text-fg">
            {l}
          </li>
        ))}
      </ul>
      {cambio.porque && <p className="mt-1 text-xs text-fg-secondary">{cambio.porque}</p>}
      <p className="mt-1 text-2xs text-fg-muted">Lo dijiste: «{cambio.cita}»</p>
      <div className="mt-2 flex items-center gap-2">
        {estado === "aplicado" ? (
          <span className="text-xs font-medium text-success-ink">Aplicado</span>
        ) : estado === "descartado" ? (
          <span className="text-xs text-fg-muted">No se aplicó</span>
        ) : se.yaEsta ? (
          <span className="text-xs text-fg-muted">Ya está en la tarjeta</span>
        ) : sinGuardar ? (
          <span className="text-xs text-fg-muted">Lo aplicas después de guardar la nota.</span>
        ) : (
          puedeEditar && (
            <>
              <BotonBlanco disabled={ocupado || estado === "aplicando"} onClick={onAplicar}>
                {estado === "aplicando" ? "Aplicando…" : "Aplicar"}
              </BotonBlanco>
              <BotonTexto disabled={ocupado || estado === "aplicando"} onClick={onNo}>
                No
              </BotonTexto>
            </>
          )
        )}
      </div>
    </li>
  );
}

function TextoDeLosHechos({ g }: { g: Guardado["hechos"] }) {
  if (g.estado !== "escritos" && g.estado !== "ya-estaban") return null;
  return (
    <p className="text-xs text-fg-secondary">
      Quedan {g.escritos === 1 ? "un hecho" : `${g.escritos} hechos`} de la cuenta anotados con tu nombre, como los de una reunión. Los ves debajo de la nota, en
      «Lo que sabes del cliente».
    </p>
  );
}

/** «Aplicar todo»: los cambios que siguen propuestos, uno tras otro, con la misma regla del «Aplicar» de cada uno. */
function AplicarTodo({
  cambios,
  estados,
  ponerEstado,
  ocupado,
  setOcupado,
}: {
  cambios: CambioPropuesto[];
  estados: Record<string, EstadoDelCambio>;
  ponerEstado: (id: string, e: EstadoDelCambio) => void;
  ocupado: boolean;
  setOcupado: (v: boolean) => void;
}) {
  const { exp, puedeEditar, cambiar, loGuardado } = useLienzo();
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDeAplicarTodo | null>(null);
  const plan = planDeAplicarTodo(exp.estado.contenido, cambios, estados);
  const aviso = avisoDeReemplazos(plan.reemplazos);

  const alAplicarTodo = async () => {
    setConfirmando(false);
    setResultado(null);
    setOcupado(true);
    try {
      const r = await aplicarTodo({
        cambios,
        estados,
        // Sobre lo último guardado: el cambio de antes pudo dejar este repetido («Ya está»).
        contenidoDeAhora: () => loGuardado().estado.contenido,
        // La misma operación del «Aplicar»; el lienzo la reintenta sola si chocó con algo que no toca (reintento.ts).
        aplicar: async (clave, valor) => {
          let motivo = "";
          const ok = await cambiar([{ op: "sumarACasilla", clave, valor }], {
            sinAvisoDeError: true,
            alFallar: (m) => {
              motivo = m;
            },
          });
          return ok ? { ok: true } : { ok: false, motivo: motivo || "No se pudo guardar." };
        },
        ponerEstado,
      });
      setResultado(r);
    } catch {
      setResultado({ aplicados: 0, yaEstaban: 0, fallidos: [{ donde: "Aplicar todo", motivo: "Algo falló a la mitad: revisa cada tarjeta." }], aMano: 0 });
    } finally {
      setOcupado(false);
    }
  };

  const conBoton = puedeEditar && plan.pendientes.length >= 2;
  if (!conBoton && !resultado) return null;
  return (
    <div className="flex flex-col gap-2">
      {conBoton && !confirmando && (
        <div className="flex flex-wrap items-center gap-2">
          <BotonAzul disabled={ocupado} onClick={() => (aviso ? setConfirmando(true) : void alAplicarTodo())}>
            {ocupado ? "Aplicando…" : `Aplicar todo (${plan.pendientes.length})`}
          </BotonAzul>
          {aviso && <span className="text-2xs text-warn-ink">{plan.reemplazos === 1 ? "Uno reemplaza lo que hay" : `${plan.reemplazos} reemplazan lo que hay`}</span>}
        </div>
      )}
      {confirmando && aviso && (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface px-3 py-2.5">
          <p className="text-[13px] text-fg">{aviso}</p>
          <div className="flex items-center gap-2">
            <BotonAzul onClick={() => void alAplicarTodo()}>Aplicar los {plan.pendientes.length}</BotonAzul>
            <BotonTexto onClick={() => setConfirmando(false)}>Cancelar</BotonTexto>
          </div>
        </div>
      )}
      {resultado && (
        <div role="status" className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-3 py-2.5">
          <p className="text-[13px] text-fg">{resumenDeAplicarTodo(resultado)}</p>
          {resultado.fallidos.length > 0 && (
            <ul className="space-y-0.5">
              {resultado.fallidos.map((f, i) => (
                <li key={i} className="text-xs text-danger-ink">
                  {f.donde}: {f.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function LoQueQuedo({
  listo,
  guardado,
  guardando,
  errorAlGuardar,
  estados,
  ponerEstado,
  aviso,
  ponerAviso,
  guardarLaNota,
  noGuardar,
}: {
  listo: Listo;
  guardado: Guardado | null;
  guardando: boolean;
  errorAlGuardar: string | null;
  estados: Record<string, EstadoDelCambio>;
  ponerEstado: (id: string, e: EstadoDelCambio) => void;
  aviso: EstadoDelAviso;
  ponerAviso: (a: EstadoDelAviso) => void;
  /** «Guardar»: la nota va a «Lo que sabes del cliente». */
  guardarLaNota: () => void;
  /** «No guardar»: no queda nada y empieza una conversación nueva. */
  noGuardar: () => void;
}) {
  const { cambiar, exp } = useLienzo();
  const clave = claveDeLaNota(exp.estado.contenido.notas, listo);
  const regenerar = useRehacerLaEscala();
  const [error, setError] = useState<string | null>(null);
  // Mientras corre «Aplicar todo», los «Aplicar» de cada uno esperan: no se mandan dos veces.
  const [ocupado, setOcupado] = useState(false);
  const cambios = listo.cambios.filter((c) => esCasillaParaNexus(c.destino));

  const aplicar = async (c: CambioPropuesto) => {
    // Sin la nota guardada no se aplica: es lo que respalda el cambio («Lo dijiste: …»).
    if (!clave || !esCasillaParaNexus(c.destino)) return;
    ponerEstado(c.id, "aplicando");
    setError(null);
    const ok = await cambiar([{ op: "sumarACasilla", clave: c.destino, valor: c.valor }]);
    ponerEstado(c.id, ok ? "aplicado" : "propuesto");
    if (!ok) setError("No se pudo aplicar. Revisa la tarjeta y vuelve a intentarlo.");
  };

  let escala: ReactNode = null;
  if (!errorAlGuardar && clave) {
    if (!guardado) escala = <p className="text-2xs text-fg-muted">Nexus revisa si esto cambia la página de La escala…</p>;
    else if (guardado.fallo)
      escala = <Alert variant="warning">No pude revisar si esto cambia la página de La escala (ni si contradice lo que aceptó el cliente). Revísala tú en «La escala».</Alert>;
    else if (!guardado.impacto.cambia)
      escala = (
        <p className="text-xs text-fg-muted">
          {guardado.impacto.omitido === "sin-entregable"
            ? "La escala todavía no tiene su Resumen armado: no hay página que rehacer."
            : guardado.impacto.omitido === OMITIDO_POR_EL_TOPE
              ? "Nexus llegó al tope del mes para conversar y no revisó si esto cambia la página de La escala. Revísala tú en «La escala»."
              : "No cambia la página de La escala."}
        </p>
      );
    else if (aviso === "abierto")
      escala = <AvisoDeImpacto key={clave} aviso={guardado.impacto.aviso} regenerar={regenerar} corriendo={CORRIENDO_LA_ESCALA} onCerrar={() => ponerAviso("cerrado")} />;
    else if (aviso === "de-antes")
      escala = (
        <p className="text-xs text-fg-muted">
          Cuando guardaste esta nota, Nexus avisó que cambia la página de La escala: {guardado.impacto.aviso} Mira cómo quedó en «La escala».
        </p>
      );
    else if (aviso === "cancelado-al-cerrar")
      escala = (
        <p className="text-xs text-fg-muted">
          Cerraste el panel con el aviso de La escala a la vista: si la cuenta no había llegado a 0, se canceló y no arrancó otra; si ya la estaba
          rehaciendo, eso siguió en el servidor. Mira cómo quedó en «La escala».
        </p>
      );
  }

  return (
    <section aria-label="Esto cambia lo que se sabe del cliente" className="flex flex-col gap-3 rounded-xl border border-line bg-surface-muted p-4">
      <h3 className="text-sm font-semibold text-fg">Esto cambia lo que se sabe del cliente</h3>
      {clave ? <QuedoGuardada clave={clave} /> : <PorGuardar listo={listo} guardando={guardando} onGuardar={guardarLaNota} onNoGuardar={noGuardar} />}
      {errorAlGuardar && <Alert variant="danger">{errorAlGuardar}</Alert>}
      {guardado && <TextoDeLosHechos g={guardado.hechos} />}
      {escala}

      {cambios.length > 0 ? (
        <>
          <p className="text-xs text-fg-secondary">{cambios.length === 1 ? "Un cambio para la arquitectura de la venta:" : `${cambios.length} cambios para la arquitectura de la venta:`}</p>
          {clave && <AplicarTodo cambios={cambios} estados={estados} ponerEstado={ponerEstado} ocupado={ocupado} setOcupado={setOcupado} />}
          <ul className="flex flex-col gap-2">
            {cambios.map((c) => (
              <Cambio
                key={c.id}
                cambio={c}
                estado={estados[c.id] ?? "propuesto"}
                ocupado={ocupado}
                sinGuardar={!clave}
                onAplicar={() => void aplicar(c)}
                onNo={() => ponerEstado(c.id, "descartado")}
              />
            ))}
          </ul>
        </>
      ) : (
        <p className="text-xs text-fg-muted">No cambia ninguna tarjeta de la arquitectura de la venta.</p>
      )}
      {error && <Alert variant="danger">{error}</Alert>}
    </section>
  );
}

export default function HablarConNexus() {
  const { exp, puedeEditar, cambiar, lugar } = useLienzo();
  const [abierto, setAbierto] = useState(false);
  const [listo, setListo] = useState<Listo | null>(null);
  const [guardado, setGuardado] = useState<Guardado | null>(null);
  const [errorAlGuardar, setErrorAlGuardar] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [estados, setEstados] = useState<Record<string, EstadoDelCambio>>({});
  const [aviso, setAviso] = useState<EstadoDelAviso>("abierto");
  // La conversación vive acá y no en el cajón: cerrarlo no la borra.
  const [conversacion, setConversacion] = useState<ConversacionEnPantalla>(conversacionNueva);
  // La nota de la conversación que se ve: una revisión que vuelve tarde (ya se empezó otra) no la pisa.
  const viva = useRef<string | null>(null);
  // Si la persona ya empezó a escribir, la conversación guardada que llega tarde no la pisa.
  const tocada = useRef(false);
  const activo = lugar === "preventa" && puedeEditar;

  // Al volver a la preventa: la última conversación de quien mira, con lo propuesto y lo que hizo con cada cambio.
  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    void (async () => {
      try {
        const r = await fetch(urlDeLaConversacion(exp.id));
        const j = (await r.json().catch(() => null)) as { conversacion?: ConversacionGuardada | null } | null;
        const c = r.ok ? j?.conversacion : null;
        if (!vigente || !c || tocada.current) return;
        setConversacion({ id: c.id, mensajes: c.mensajes });
        if (c.listo) {
          viva.current = c.listo.notaClave;
          setListo({ clave: c.listo.notaClave, conversacion: c.id, cambios: c.listo.cambios, hechos: c.listo.hechos, nota: notaDeLaConversacion(c.mensajes), deAntes: true, contado: c.listo.contado });
          setEstados(c.listo.estados);
          setGuardado(
            // Sin la revisión guardada no se sabe si cambiaba La escala: se dice así, nunca «no cambia».
            c.listo.guardado ? (c.listo.guardado as Guardado) : { hechos: { estado: "apagados" }, impacto: { cambia: false, aviso: "" }, fallo: true },
          );
          setAviso("de-antes");
        }
      } catch {
        // Sin la conversación de antes, el cajón arranca vacío: nada se pierde de la preventa.
      }
    })();
    return () => {
      vigente = false;
    };
  }, [activo, exp.id]);

  // Primero en la preventa: ni en la escala de la cuenta ni en la exploración de un proyecto.
  if (!activo) return null;
  const llena = loQueSabeElEquipo(exp.estado.contenido.notas).length >= MAX_LO_QUE_SABES;

  const revisar = async (conversacion: string, clave: string) => {
    const sinRevision: Guardado = { hechos: { estado: "apagados" }, impacto: { cambia: false, aviso: "" }, fallo: true };
    try {
      const r = await fetch(`/api/sales/exploraciones/${exp.id}/nexus/guardado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversacion, clave }),
      });
      const j = (await r.json().catch(() => null)) as (Guardado & { error?: string }) | null;
      if (viva.current === clave) setGuardado(r.ok && j?.impacto ? j : sinRevision);
      // Los hechos que dejó se ven debajo de la nota: «Lo que sabes del cliente» los vuelve a pedir.
      window.dispatchEvent(new CustomEvent(EVENTO_HECHOS_DE_LAS_NOTAS, { detail: exp.id }));
    } catch {
      // La nota ya quedó: sin la revisión, La escala se puede rehacer a mano.
      if (viva.current === clave) setGuardado(sinRevision);
    }
  };

  /** Nexus entendió lo que contó: se muestra qué cambia y NO se guarda nada hasta el «Guardar». */
  const alQuedarListo = async ({ conversacion, nota, turno }: { conversacion: string; nota: string; turno: TurnoListo }) => {
    viva.current = null;
    setListo({ clave: null, conversacion, cambios: turno.cambios, hechos: turno.hechos.map((h) => h.frase), nota, deAntes: false, contado: false });
    setGuardado(null);
    setErrorAlGuardar(null);
    setEstados({});
    setAviso("abierto");
  };

  /** «Guardar»: la nota va a «Lo que sabes del cliente»; después, de fondo, sus hechos y la revisión de La escala. */
  const guardar = async () => {
    if (!listo || guardando) return;
    const clave = claveNuevaDeLoQueSabes();
    setGuardando(true);
    setErrorAlGuardar(null);
    setGuardado(null);
    setAviso("abierto");
    const ok = await cambiar([{ op: "nota", paso: clave, texto: listo.nota }]);
    setGuardando(false);
    if (!ok) {
      setErrorAlGuardar("No se pudo guardar la nota. Vuelve a intentarlo: lo que contaste sigue acá.");
      return;
    }
    viva.current = clave;
    setListo((l) => (l && l.conversacion === listo.conversacion ? { ...l, clave } : l));
    void revisar(listo.conversacion, clave);
  };

  /** «¿Era una pregunta? Respóndela»: lo que iba a guardarse se olvida y la conversación sigue (el panel la responde). */
  const volverAConversar = () => {
    viva.current = null;
    setListo(null);
    setGuardado(null);
    setErrorAlGuardar(null);
    setEstados({});
    setAviso("abierto");
  };

  const ponerEstado = (id: string, e: EstadoDelCambio) => {
    setEstados((x) => ({ ...x, [id]: e }));
    // Lo que se aplicó o se descartó queda en la conversación guardada; «aplicando» es solo de la pantalla.
    if (listo && (e === "aplicado" || e === "descartado")) anotar(exp.id, { conversacion: listo.conversacion, estados: { [id]: e } });
  };

  const olvidar = () => {
    // La de ahora queda cerrada: al volver, el cajón arranca vacío.
    if (conversacion.mensajes.length || listo) anotar(exp.id, { conversacion: conversacion.id, cerrar: true });
    tocada.current = true;
    viva.current = null;
    setConversacion(conversacionNueva());
    setListo(null);
    setGuardado(null);
    setErrorAlGuardar(null);
    setEstados({});
    setAviso("abierto");
  };

  // Seguir conversando después de guardar (22 nov): con la nota guardada y revisada, sin un «Aplicar» pendiente ni la
  // cuenta regresiva de La escala a la vista (mandar algo nuevo los borraría de la pantalla).
  const sePuedeSeguir =
    !!listo?.clave &&
    !!guardado &&
    !listo.cambios.some((c) => esCasillaParaNexus(c.destino) && (estados[c.id] ?? "propuesto") !== "aplicado" && estados[c.id] !== "descartado") &&
    !(guardado.impacto.cambia && !guardado.fallo && aviso === "abierto");

  const cerrar = () => {
    setAbierto(false);
    // Cerrar con la cuenta regresiva a la vista la cancela (se desmonta), y al volver no arranca otra. Mientras la
    // revisión no volvió, tampoco: si vuelve con el cajón cerrado, no hay cuenta que mostrar.
    if (listo && aviso === "abierto" && (!guardado || guardado.impacto.cambia)) setAviso("cancelado-al-cerrar");
  };

  return (
    <>
      <Button variant="secondary" size="sm" className="mb-3 w-full" onClick={() => setAbierto(true)}>
        Hablar con Nexus
      </Button>
      <Drawer
        open={abierto}
        onClose={cerrar}
        title="Hablar con Nexus"
        description="Cuéntale lo que sabes del cliente, o pregúntale lo que se habló, escrito o dictado. Si le cuentas algo, te pregunta lo que falte y te muestra qué cambia antes de guardarlo."
        size="lg"
      >
        {/* Lleno, solo al empezar: a media conversación el aviso va junto al «Guardar» y la conversación sigue a la vista. */}
        {llena && !listo && !conversacion.mensajes.length ? (
          <Alert variant="warning">«Lo que sabes del cliente» ya tiene {MAX_LO_QUE_SABES} notas: quita una en la Preparación antes de contar otra.</Alert>
        ) : (
          <PanelDeNexus
            urlDelTurno={`/api/sales/exploraciones/${exp.id}/nexus`}
            placeholder="Ej.: «Marco habló con el gerente por WhatsApp: pierden unos US$ 40.000 al mes en cartera vencida.» O pregunta: «¿Qué dijeron de la cobranza?»"
            alQuedarListo={alQuedarListo}
            terminado={listo !== null}
            conversacion={conversacion}
            alCambiar={(c) => {
              tocada.current = true;
              setConversacion(c);
            }}
            alReiniciar={olvidar}
            sePuedePreguntar={!!listo && !listo.clave && !listo.contado && !guardando && !claveDeLaNota(exp.estado.contenido.notas, listo)}
            alVolverAConversar={volverAConversar}
            alSeguir={sePuedeSeguir ? volverAConversar : undefined}
          >
            {listo && (
              <LoQueQuedo
                key={listo.clave ?? listo.conversacion}
                listo={listo}
                guardado={guardado}
                guardando={guardando}
                errorAlGuardar={errorAlGuardar}
                estados={estados}
                ponerEstado={ponerEstado}
                aviso={aviso}
                ponerAviso={setAviso}
                guardarLaNota={() => void guardar()}
                noGuardar={olvidar}
              />
            )}
          </PanelDeNexus>
        )}
      </Drawer>
    </>
  );
}
