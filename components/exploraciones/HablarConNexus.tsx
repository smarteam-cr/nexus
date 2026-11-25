"use client";

/**
 * HablarConNexus — «Hablar con Nexus» en la preventa (Elías, 21 nov): el cajón «Nexus».
 *
 * UNA SOLA PUERTA (23 nov, etapa 2 del plan maestro, aprobada por la coordinadora): el cajón lo abre el botón «Nexus» de
 * arriba (BotonDeNexus.tsx; el botón del riel se quitó) con `abrirNexusEnLaPreventa` (lib/exploraciones/abrir-nexus.ts).
 * Adentro, desde el 24 nov (una sola conversación), tareas, el siguiente paso y la guía se piden en la MISMA caja: los
 * prepara el chat de la cuenta con esta conversación como historia y vuelven al hilo como una lista con «Aplicar»
 * (PanelDeNexus.tsx; sin las notas de la cuenta, que van a HubSpot). El enlace «Tareas, siguiente paso o la guía», que abría
 * otro chat, se quitó (Elías: «Quitarlo»). Y «✨ Mejorar con IA» de La escala lo abre con el lugar puesto como chip (el Resumen, un área
 * o, desde el 24 nov, una sección): con el chip, lo que se escribe es un pedido de cambio a la página y la propuesta por pieza se ve adentro
 * (PedirleANexus.tsx); quitar el chip vuelve a la conversación. En la escala de la cuenta (sin conversación) el cajón abre
 * solo con el chip.
 * UN SOLO CHAT (24 nov, Elías: «todo debe abrir el mismo chat con la misma interfaz»): ya no es una ventana modal; es el
 * chat «Nexus» de todos (components/asistente/CajonDeNexus.tsx), lateral y sin fondo oscuro, con «Nueva conversación»
 * arriba, la caja fija abajo y el lugar de La escala como chip sobre la caja.
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
 * RESPONDER CON NEXUS (24 nov, «Para completar el diagnóstico» de La escala): la misma conversación, con la pregunta como
 * chip («Ventas · Datos: ¿…?»). Lo primero que escribe la persona sale con «Sobre Ventas · Datos (…): » adelante
 * (`prefijoDeLaRespuesta`): Nexus sabe qué se responde, y con «Guardar» la nota lo lleva. Después el chip se va.
 * UN SOLO CONTEXTO (25 nov, Elías probando TEC · AE): «✨ Mejorar con IA» de La escala ya no abre otro chat (era
 * PedirleANexus, un pedido y una propuesta, que no respondía preguntas y borraba el pedido anterior del hilo). Abre ESTA
 * conversación con la parte como chip: el chip solo dice a qué parte va un cambio; se puede preguntar de la cuenta y
 * conversar igual, y desde «Nexus» de arriba también se pide un cambio a la página (va al Resumen). La propuesta va en el
 * hilo (./PropuestaDeLaEscala.tsx) y lo hecho con cada cambio queda en la conversación guardada. PedirleANexus queda solo
 * para La escala de la cuenta, donde no hay conversación. Lo que Nexus contesta con el cajón cerrado no sale como aviso: el
 * botón «Nexus» lleva un punto rojo hasta que se abre.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto } from "@/components/ui/sistema";
import PanelDeNexus, { conversacionNueva, type ConversacionEnPantalla, type TurnoListo } from "@/components/chat-de-nexus/PanelDeNexus";
import { useRouter } from "next/navigation";
import AvisoDeImpacto from "@/components/impacto/AvisoDeImpacto";
import { OMITIDO_POR_EL_TOPE } from "@/lib/ai/tope-de-nexus";
import { diaConAnio } from "@/lib/exploraciones/fechas";
import { EVENTO_HECHOS_DE_LAS_NOTAS } from "@/lib/exploraciones/hechos-de-las-notas";
import { claveNuevaDeLoQueSabes, MAX_LO_QUE_SABES, loQueSabeElEquipo } from "@/lib/exploraciones/lo-que-sabes";
import {
  aplicarTodo,
  avisoAlDejarLaConversacion,
  avisoDeReemplazos,
  seVeLaCuentaDeLaEscala,
  comoSeVeElCambio,
  esCasillaParaNexus,
  planDeAplicarTodo,
  resumenDeAplicarTodo,
  type EstadoDelAvisoDeLaEscala,
  type EstadoDelCambioEnPantalla,
  type ResultadoDeAplicarTodo,
} from "@/lib/exploraciones/nexus-en-la-preventa";
import { notaDeLaConversacion, type CambioPropuesto } from "@/lib/chat-de-nexus/conversacion";
import type { ConversacionGuardada } from "@/lib/chat-de-nexus/guardada";
import { useLienzo } from "./contexto";
import { CORRIENDO_LA_ESCALA, useRehacerLaEscala } from "./rehacer-la-escala";
import PedirleANexus from "./PedirleANexus";
import PropuestaDeLaEscala, { type ErrorAlAplicar, type HechoEnLaEscala } from "./PropuestaDeLaEscala";
import {
  avisarQueNexusCambioLaEscala,
  EVENTO_ABRIR_NEXUS,
  marcarNexusSinLeer,
  type GuiaEnElCajon,
  type LugarDeLaEscalaEnElCajon,
  type PedidoDeAbrirNexus,
} from "@/lib/exploraciones/abrir-nexus";
import type { EscalaEnLaConversacion, EstadoEnLaEscala } from "@/lib/chat-de-nexus/escala-en-la-conversacion";
import type { EstadoDelCambio as EstadoDelCambioEnLaEscala } from "@/lib/pedirle-a-nexus/recordado";
import { prefijoDeLaRespuesta, type PreguntaParaResponder } from "@/lib/exploraciones/completar-el-diagnostico";

/** Lo que responde …/nexus/guardado (los tipos del servidor, sin importarlo). */
interface Guardado {
  hechos: { estado: "escritos"; escritos: number } | { estado: "ya-estaban"; escritos: number } | { estado: "apagados" | "sin-hechos" | "sin-conversacion" | "la-nota-cambio" };
  impacto: { cambia: boolean; aviso: string; omitido?: string };
  /** La revisión no volvió (la red, el servidor o el agente): no se sabe si cambia La escala. */
  fallo?: true;
}

type EstadoDelCambio = EstadoDelCambioEnPantalla;
/**
 * El aviso de La escala: a la vista, cerrado por la persona, cancelado al dejar la conversación (cerrar el chat o pasar al
 * pedido de La escala), o de una conversación de antes (al volver a la página: la cuenta regresiva no se repite).
 */
type EstadoDelAviso = EstadoDelAvisoDeLaEscala;

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

/**
 * Anota en el servidor lo que se hizo con los cambios de una propuesta a La escala de la conversación (25 nov). Si no
 * llega, se pierde solo eso: la página ya cambió.
 */
function anotarLaEscala(exploracionId: string, conversacion: string, vuelta: string, estadosDeLaEscala: Record<string, EstadoDelCambioEnLaEscala>) {
  void fetch(urlDeLaConversacion(exploracionId), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversacion, vuelta, estadosDeLaEscala }) }).catch(() => {});
}

/** Los estados de una propuesta a La escala con los nuevos: «pendiente» (después de «Deshacer») sale de la lista. */
function conLosEstados(antes: Record<string, EstadoEnLaEscala>, nuevos: Record<string, EstadoDelCambioEnLaEscala>): Record<string, EstadoEnLaEscala> {
  const r: Record<string, EstadoEnLaEscala> = { ...antes };
  for (const [k, v] of Object.entries(nuevos)) {
    if (v === "pendiente") delete r[k];
    else r[k] = v;
  }
  return r;
}

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
          Dejaste la conversación con el aviso de La escala a la vista: si la cuenta no había llegado a 0, se canceló y no arrancó otra; si ya la
          estaba rehaciendo, eso siguió en el servidor. Mira cómo quedó en «La escala».
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

/** El chat vacío de la preventa: qué se le cuenta o se le pregunta, con sus ejemplos (solo con el chat vacío). */
const VACIO_DE_LA_PREVENTA = {
  intro: "Cuéntale lo que sabes del cliente, o pregúntale lo que se habló, escrito o dictado. Por ejemplo:",
  ejemplos: ["Marco habló con el gerente por WhatsApp: pierden unos US$ 40.000 al mes en cartera vencida.", "¿Qué dijeron de la cobranza?"],
  cierre: "Si le cuentas algo, te pregunta lo que falte y te muestra qué cambia antes de guardarlo: lo guardas tú.",
} as const;

/**
 * El chat vacío abierto desde «Mejorar con IA» de la guía (24 nov): con el chip, se le piden cambios a la guía; los pedidos
 * listos van en botones sobre la caja, así que acá no hay ejemplos (revisión del 24 nov: invitaba a contar y lo contado
 * salía como pedido sobre la guía).
 */
const VACIO_DE_LA_GUIA = {
  intro: "Pídele un cambio a la guía de la sesión: más preguntas, otras repreguntas, preguntas más cortas o quitar alguna. Toca un pedido de abajo o escríbelo.",
  ejemplos: [],
  cierre: "Lo que propone queda en una lista que apruebas. Para contar o preguntar algo del cliente, quita el chip de la guía con su ✕.",
} as const;

/**
 * El chat vacío abierto desde «✨ Mejorar con IA» de La escala (25 nov, un solo contexto): se pide un cambio a esa parte o se
 * pregunta de la cuenta, en la misma conversación.
 */
const vacioDeLaEscala = (e: LugarDeLaEscalaEnElCajon) => ({
  intro: `Pídele un cambio a ${e.foco ? `«${e.foco}»` : `la página «${e.nombre}»`} de La escala, o pregúntale lo que sabe de la cuenta. Por ejemplo:`,
  ejemplos: ["Enfócalo más en el reto principal de Ventas.", "¿Qué se dijo de esto en las reuniones?"],
  cierre: `Cada cambio te lo muestra con el antes y el después: tú lo aplicas, y nada se publica solo. El chip solo dice a qué parte va un cambio; ${
    e.foco ? `con su ✕ pides sobre toda la página «${e.nombre}».` : "con su ✕ lo quitas, y lo que pidas cambiar va al Resumen."
  }`,
});

/** El chat vacío abierto desde «Responder con Nexus» (24 nov): la pregunta entera, y adónde va lo que se responde. */
const vacioDeLaRespuesta = (p: PreguntaParaResponder) => ({
  intro: `${p.equipo} · ${p.dimension}: ${p.pregunta}`,
  ejemplos: [] as string[],
  cierre:
    "Cuéntale lo que sabes, escrito o dictado. Si falta algo, te pregunta; después te muestra la nota y la guardas tú en «Lo que sabes del cliente». El Resumen la lee cuando lo rehaces.",
});

/**
 * El mismo chat vacío para quien puede pedirle a Nexus lo de la cuenta (el permiso del chat de la cuenta): una sola
 * conversación (24 nov), así que también se le piden tareas, el siguiente paso o cambios a la guía, con su ejemplo.
 */
const VACIO_CON_PEDIDOS = {
  intro: "Cuéntale lo que sabes del cliente, pregúntale lo que se habló o pídele una tarea, el siguiente paso o un cambio a la guía. Por ejemplo:",
  ejemplos: [...VACIO_DE_LA_PREVENTA.ejemplos, "Crea una tarea para llamar al gerente el viernes."],
  cierre: "Nada se guarda ni se aplica sin tu clic: lo que cuentas lo guardas tú, y lo que pides queda en una lista que apruebas.",
} as const;

export default function HablarConNexus() {
  const { exp, puedeEditar, cambiar, lugar, conAsistente, recargar } = useLienzo();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  // El ancho del chat, como en los demás: «Más ancho» para leer una propuesta larga.
  const [ancho, setAncho] = useState<"normal" | "amplio">("normal");
  const alternarAncho = () => setAncho((a) => (a === "amplio" ? "normal" : "amplio"));
  /** El lugar de La escala desde el que se pidió «✨ Mejorar con IA» (el chip); null: la conversación. */
  const [escala, setEscala] = useState<LugarDeLaEscalaEnElCajon | null>(null);
  /** La guía desde la que se pidió «Mejorar con IA» (24 nov): el chip de la conversación; null, la conversación de siempre. */
  const [guia, setGuia] = useState<GuiaEnElCajon | null>(null);
  /** La pregunta de La escala que se responde («Responder con Nexus», 24 nov): chip y prefijo del próximo mensaje. */
  const [pregunta, setPregunta] = useState<PreguntaParaResponder | null>(null);
  const [listo, setListo] = useState<Listo | null>(null);
  const [guardado, setGuardado] = useState<Guardado | null>(null);
  const [errorAlGuardar, setErrorAlGuardar] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [estados, setEstados] = useState<Record<string, EstadoDelCambio>>({});
  const [aviso, setAviso] = useState<EstadoDelAviso>("abierto");
  // Cada «Nexus» o «✨ Mejorar con IA» lleva el cursor a la caja, aunque el chat ya estuviera abierto.
  const [pedidoDeFoco, setPedidoDeFoco] = useState(0);
  // Hay conversación: la preventa, para quien la puede cambiar (en la escala de la cuenta no hay; la exploración de un
  // proyecto tampoco). Una sola regla: la usan el cajón y la cuenta regresiva de La escala.
  const activo = lugar === "preventa" && puedeEditar;
  // Si la cuenta regresiva de La escala está en pantalla AHORA: al dejar la conversación, solo esa no vuelve a correr.
  const cuentaALaVista = useRef(false);
  const seVeLaCuenta = seVeLaCuentaDeLaEscala({
    chatAbierto: abierto,
    // Con el chip de La escala la conversación sigue a la vista en la preventa (25 nov); en la cuenta no hay conversación.
    enLaConversacion: activo || !escala,
    notaGuardada: !!listo?.clave,
    revision: guardado ? { cambia: guardado.impacto.cambia, fallo: !!guardado.fallo } : null,
    aviso,
  });
  useEffect(() => {
    cuentaALaVista.current = seVeLaCuenta;
  }, [seVeLaCuenta]);
  // La conversación vive acá y no en el cajón: cerrarlo no la borra.
  const [conversacion, setConversacion] = useState<ConversacionEnPantalla>(conversacionNueva);
  /** Lo último aplicado de cada propuesta a La escala de la conversación, con su «Deshacer» (por vuelta; no va a la base). */
  const [hechosDeLaEscala, setHechosDeLaEscala] = useState<Record<string, HechoEnLaEscala>>({});
  /** Mientras se aplica (o se deshace) un cambio a La escala, la caja espera. */
  const [aplicandoLaEscala, setAplicandoLaEscala] = useState(false);
  /** Lo que salió mal al aplicar cada propuesta (por vuelta): sobrevive a cerrar el cajón (revisión del 25 nov). */
  const [erroresDeLaEscala, setErroresDeLaEscala] = useState<Record<string, ErrorAlAplicar>>({});
  // Si el cajón está abierto AHORA: una respuesta que llega con el cajón cerrado marca el botón «Nexus» (25 nov).
  const abiertoAhora = useRef(abierto);
  useEffect(() => {
    abiertoAhora.current = abierto;
    // Abrirlo es haberlo visto: el punto del botón se va.
    if (abierto) marcarNexusSinLeer(exp.id, false);
  }, [abierto, exp.id]);
  // La nota de la conversación que se ve: una revisión que vuelve tarde (ya se empezó otra) no la pisa.
  const viva = useRef<string | null>(null);
  // Si la persona ya empezó a escribir, la conversación guardada que llega tarde no la pisa.
  const tocada = useRef(false);

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

  // Lo abren el botón «Nexus» de arriba y «✨ Mejorar con IA» de La escala (con el lugar como chip).
  useEffect(() => {
    const alPedir = (e: Event) => {
      const p = (e as CustomEvent<PedidoDeAbrirNexus>).detail;
      // Solo el cajón de ESTA exploración (otra puede estar cargada y oculta en la misma pantalla).
      if (!p || p.exploracionId !== exp.id) return;
      if (p.escala) {
        if (!puedeEditar) return;
        // Desde La escala no se vuelve a la guía al quitar ese chip: la conversación queda sin chip.
        setGuia(null);
        setPregunta(null);
        // En la escala de la cuenta (sin conversación) se pasa al pedido de un paso: la cuenta regresiva que estaba a la
        // vista no vuelve a correr. En la preventa es la MISMA conversación (25 nov): no se deja nada.
        if (!activo) setAviso((a) => avisoAlDejarLaConversacion(a, cuentaALaVista.current));
        setEscala(p.escala);
        setAbierto(true);
        // Con el chat ya abierto, el cursor va igual a la caja (otra sección de La escala).
        setPedidoDeFoco((n) => n + 1);
      } else if (activo) {
        // La conversación: desde la guía, con su chip y sus sugerencias; desde una pregunta de La escala, con la pregunta
        // como chip; desde el botón «Nexus», sin chip.
        setEscala(null);
        setGuia(p.guia ?? null);
        setPregunta(p.pregunta ?? null);
        setAbierto(true);
        setPedidoDeFoco((n) => n + 1);
      }
    };
    window.addEventListener(EVENTO_ABRIR_NEXUS, alPedir);
    return () => window.removeEventListener(EVENTO_ABRIR_NEXUS, alPedir);
  }, [activo, puedeEditar, exp.id]);

  // La conversación, solo en la preventa (ni en la escala de la cuenta ni en la exploración de un proyecto). Pedirle un
  // cambio a La escala, donde haya escala y se pueda editar.
  if (!activo && !escala) return null;
  const llena = loQueSabeElEquipo(exp.estado.contenido.notas).length >= MAX_LO_QUE_SABES;
  const llenaAlEmpezar = llena && !listo && !conversacion.mensajes.length;
  /** La guía como chip (24 nov): solo con el permiso del chat de la cuenta, que es el que la cambia. */
  const conLaGuia = !!guia && conAsistente;
  /** Con un chip de pedido (la guía o La escala) no se cuenta nada: las notas llenas no apagan la caja. */
  const conChipDePedido = conLaGuia || !!escala;

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
    // Cerrar con la cuenta regresiva a la vista la cancela (se desmonta), y al volver no arranca otra. Si la revisión no
    // había vuelto, la cuenta no se veía: al volver se ve por primera vez, con su «Cancelar» (segunda revisión del 24 nov).
    setAviso((a) => avisoAlDejarLaConversacion(a, cuentaALaVista.current));
  };

  /** Lo aplicado a La escala se guarda por su propia ruta: el lienzo y la página de La escala se ponen al día. */
  const alCambiarLaEscala = () => {
    void recargar();
    avisarQueNexusCambioLaEscala();
  };

  // La misma cara que todos los chats (components/asistente/CajonDeNexus.tsx, 24 nov). En la preventa, UNA conversación (25
  // nov): La escala va como chip de la conversación. En la escala de la cuenta, sin conversación, el pedido de un paso.
  return (
    <>
      {escala && !activo && (
        <PedirleANexus
          key={escala.lugar.pagina === "resumen" ? "resumen" : escala.lugar.areaId}
          abierto={abierto}
          onClose={cerrar}
          exploracionId={exp.id}
          lugar={escala.lugar}
          lugarNombre={escala.nombre}
          foco={escala.foco}
          onQuitarFoco={() => setEscala({ ...escala, foco: null })}
          ancho={ancho}
          onAncho={alternarAncho}
          pedidoDeFoco={pedidoDeFoco}
          alCambiar={alCambiarLaEscala}
        />
      )}
      {activo && (
        <PanelDeNexus
          abierto={abierto}
          onClose={cerrar}
          // Siempre a la vista y entera (como en el pedido a La escala hasta el 25 nov): nada se guarda, aplica ni publica solo.
          // «tú aplicas» no: la cuenta regresiva de La escala rehace el borrador si nadie la cancela (revisión del 25 nov).
          garantia="Nexus propone; nada se publica solo."
          subtitulo={conAsistente ? "Preventa · cuéntale, pregúntale o pídele lo del cliente" : "Preventa · cuéntale o pregúntale lo del cliente"}
          ancho={ancho}
          onAncho={alternarAncho}
          pedidoDeFoco={pedidoDeFoco}
          // Sin el enlace «Tareas, siguiente paso o la guía» (Elías, 24 nov: «Quitarlo»): se pide en la misma caja, y el chat
          // vacío lo muestra con un ejemplo.
          vacio={pregunta ? vacioDeLaRespuesta(pregunta) : escala ? vacioDeLaEscala(escala) : conLaGuia ? VACIO_DE_LA_GUIA : conAsistente ? VACIO_CON_PEDIDOS : VACIO_DE_LA_PREVENTA}
          // Lleno, solo al empezar: a media conversación el aviso va junto al «Guardar» y la conversación sigue a la vista.
          // Con la guía o La escala como chip no se cuenta nada (se le piden cambios): las notas llenas no apagan la caja.
          aviso={
            llenaAlEmpezar && !conChipDePedido ? <Alert variant="warning">«Lo que sabes del cliente» ya tiene {MAX_LO_QUE_SABES} notas: quita una en la Preparación antes de contar otra.</Alert> : null
          }
          apagado={
            aplicandoLaEscala ? "Nexus está aplicando los cambios a La escala…" : llenaAlEmpezar && !conChipDePedido ? "«Lo que sabes del cliente» está lleno: quita una nota en la Preparación." : null
          }
          urlDelTurno={`/api/sales/exploraciones/${exp.id}/nexus`}
          // Una sola conversación (24 nov): con el permiso del chat de la cuenta, tareas, siguiente paso y la guía se piden
          // en este mismo hilo; al aplicar, el lienzo vuelve a leer la guía y la página lo demás.
          pedidosDeLaCuenta={conAsistente}
          // «Mejorar con IA» de la guía (24 nov): la misma conversación, con la guía como chip; la ✕ vuelve a conversar.
          {...(guia && conLaGuia
            ? { lugar: "guia" as const, chip: { texto: `Sobre ${guia.etiqueta}`, alQuitar: () => setGuia(null) }, sugerencias: guia.sugerencias }
            : {})}
          // «✨ Mejorar con IA» de La escala (25 nov): la parte como chip; solo dice a qué parte va un cambio. Su ✕ pide sobre
          // toda la página; la de la página vuelve a la conversación sin chip.
          {...(escala
            ? {
                chip: {
                  texto: escala.foco ? `Sobre «${escala.foco}» · ${escala.nombre}` : `Sobre la página «${escala.nombre}» de La escala`,
                  alQuitar: () => setEscala(escala.foco ? { ...escala, foco: null } : null),
                  quitarLabel: escala.foco ? `Pedir sobre toda la página «${escala.nombre}»` : "Quitar el chip: lo que pidas cambiar va al Resumen",
                },
              }
            : {})}
          escala={escala ? { lugar: escala.lugar, foco: escala.foco } : null}
          pintarLaEscala={(e: EscalaEnLaConversacion, cambiarLaPropuesta, ocupado) => (
            <PropuestaDeLaEscala
              exploracionId={exp.id}
              lugar={e.lugar}
              propuesta={e.propuesta}
              estados={e.estados}
              ponerEstados={(x) => {
                cambiarLaPropuesta((a) => ({ ...a, estados: conLosEstados(a.estados, x) }));
                anotarLaEscala(exp.id, conversacion.id, e.id, x);
              }}
              hecho={hechosDeLaEscala[e.id] ?? null}
              ponerHecho={(h) =>
                setHechosDeLaEscala((m) => {
                  const n = { ...m };
                  if (h) n[e.id] = h;
                  else delete n[e.id];
                  return n;
                })
              }
              alCambiarLaPagina={alCambiarLaEscala}
              alOcupado={setAplicandoLaEscala}
              aplicandoAfuera={aplicandoLaEscala}
              error={erroresDeLaEscala[e.id] ?? null}
              ponerError={(x) =>
                setErroresDeLaEscala((m) => {
                  const n = { ...m };
                  if (x) n[e.id] = x;
                  else delete n[e.id];
                  return n;
                })
              }
              apagada={ocupado}
            />
          )}
          ocupadoAfuera={aplicandoLaEscala}
          alResponder={() => {
            // Con el cajón cerrado, en vez de un aviso flotante, el punto rojo del botón «Nexus» (25 nov).
            if (!abiertoAhora.current) marcarNexusSinLeer(exp.id, true);
          }}
          // «Responder con Nexus» (24 nov): la pregunta como chip; lo próximo que escribe la persona la lleva adelante.
          {...(pregunta
            ? {
                chip: { texto: `${pregunta.equipo} · ${pregunta.dimension}: ${pregunta.pregunta}`, alQuitar: () => setPregunta(null) },
                prefijo: prefijoDeLaRespuesta(pregunta),
                alUsarElPrefijo: () => setPregunta(null),
              }
            : {})}
          alAplicar={() => {
            void recargar();
            router.refresh();
          }}
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
    </>
  );
}
