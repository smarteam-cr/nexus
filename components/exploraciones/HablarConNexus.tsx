"use client";

/**
 * HablarConNexus — «Hablar con Nexus» en la preventa (Elías, 21 nov): el botón de la barra de la izquierda y su cajón.
 *
 * La conversación es la genérica (components/chat-de-nexus/PanelDeNexus.tsx): la persona cuenta algo o pregunta algo de
 * la cuenta. Cuando Nexus entiende lo que contó, acá pasa lo de la preventa, en este orden:
 *   1. la nota se guarda SIEMPRE en «Lo que sabes del cliente», con las palabras de la persona, su nombre y la hora
 *      (la operación `nota` de siempre: el servidor pone quién y cuándo);
 *   2. el servidor deja sus hechos (destino: esta preventa) y pregunta al agente de impacto si cambia la página de La
 *      escala: si cambia, la cuenta regresiva de 10 s (components/impacto/AvisoDeImpacto.tsx), y el aviso dice si
 *      contradice lo que aceptó el cliente;
 *   3. cada cambio a una tarjeta de la arquitectura de la venta, con «Aplicar» y «No». Nada se aplica sin el clic.
 * Lo propuesto, lo aplicado y el aviso viven acá y no en el cajón: cerrarlo y volver a abrirlo no los pierde. Cerrarlo
 * con la cuenta regresiva a la vista la CANCELA, y al volver no arranca otra.
 * Convive con «Agregar algo que sabes» (components/exploraciones/LoQueSabes.tsx): es otra puerta a las mismas notas.
 */
import { useRef, useState, type ReactNode } from "react";
import { Alert, Button, Drawer } from "@/components/ui";
import { BotonBlanco, BotonTexto } from "@/components/ui/sistema";
import PanelDeNexus, { conversacionNueva, type ConversacionEnPantalla, type TurnoListo } from "@/components/chat-de-nexus/PanelDeNexus";
import AvisoDeImpacto from "@/components/impacto/AvisoDeImpacto";
import { diaConAnio } from "@/lib/exploraciones/fechas";
import { claveNuevaDeLoQueSabes, MAX_LO_QUE_SABES, loQueSabeElEquipo } from "@/lib/exploraciones/lo-que-sabes";
import { comoSeVeElCambio, esCasillaParaNexus } from "@/lib/exploraciones/nexus-en-la-preventa";
import type { CambioPropuesto } from "@/lib/chat-de-nexus/conversacion";
import { useLienzo } from "./contexto";
import { CORRIENDO_LA_ESCALA, useRehacerLaEscala } from "./rehacer-la-escala";

/** Lo que responde …/nexus/guardado (los tipos del servidor, sin importarlo). */
interface Guardado {
  hechos: { estado: "escritos"; escritos: number } | { estado: "ya-estaban"; escritos: number } | { estado: "apagados" | "sin-hechos" | "sin-conversacion" };
  impacto: { cambia: boolean; aviso: string; omitido?: string };
  /** La revisión no volvió (la red, el servidor o el agente): no se sabe si cambia La escala. */
  fallo?: true;
}

type EstadoDelCambio = "propuesto" | "aplicando" | "aplicado" | "descartado";
/** El aviso de La escala: a la vista, cerrado por la persona, o cancelado al cerrar el cajón. */
type EstadoDelAviso = "abierto" | "cerrado" | "cancelado-al-cerrar";

interface Listo {
  clave: string;
  conversacion: string;
  cambios: CambioPropuesto[];
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

function Cambio({ cambio, estado, onAplicar, onNo }: { cambio: CambioPropuesto; estado: EstadoDelCambio; onAplicar: () => void; onNo: () => void }) {
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
        ) : (
          puedeEditar && (
            <>
              <BotonBlanco disabled={estado === "aplicando"} onClick={onAplicar}>
                {estado === "aplicando" ? "Aplicando…" : "Aplicar"}
              </BotonBlanco>
              <BotonTexto disabled={estado === "aplicando"} onClick={onNo}>
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
      Quedan {g.escritos === 1 ? "un hecho" : `${g.escritos} hechos`} de la cuenta anotados con tu nombre, como los de una reunión. Todavía ninguna pantalla los
      muestra.
    </p>
  );
}

function LoQueQuedo({
  listo,
  guardado,
  errorAlGuardar,
  estados,
  ponerEstado,
  aviso,
  ponerAviso,
}: {
  listo: Listo;
  guardado: Guardado | null;
  errorAlGuardar: string | null;
  estados: Record<string, EstadoDelCambio>;
  ponerEstado: (id: string, e: EstadoDelCambio) => void;
  aviso: EstadoDelAviso;
  ponerAviso: (a: EstadoDelAviso) => void;
}) {
  const { cambiar } = useLienzo();
  const regenerar = useRehacerLaEscala();
  const [error, setError] = useState<string | null>(null);
  const cambios = listo.cambios.filter((c) => esCasillaParaNexus(c.destino));

  const aplicar = async (c: CambioPropuesto) => {
    if (!esCasillaParaNexus(c.destino)) return;
    ponerEstado(c.id, "aplicando");
    setError(null);
    const ok = await cambiar([{ op: "sumarACasilla", clave: c.destino, valor: c.valor }]);
    ponerEstado(c.id, ok ? "aplicado" : "propuesto");
    if (!ok) setError("No se pudo aplicar. Revisa la tarjeta y vuelve a intentarlo.");
  };

  let escala: ReactNode = null;
  if (!errorAlGuardar) {
    if (!guardado) escala = <p className="text-2xs text-fg-muted">Nexus revisa si esto cambia la página de La escala…</p>;
    else if (guardado.fallo)
      escala = <Alert variant="warning">No pude revisar si esto cambia la página de La escala (ni si contradice lo que aceptó el cliente). Revísala tú en «La escala».</Alert>;
    else if (!guardado.impacto.cambia)
      escala = (
        <p className="text-xs text-fg-muted">
          {guardado.impacto.omitido === "sin-entregable" ? "La escala todavía no tiene su Resumen armado: no hay página que rehacer." : "No cambia la página de La escala."}
        </p>
      );
    else if (aviso === "abierto")
      escala = <AvisoDeImpacto key={listo.clave} aviso={guardado.impacto.aviso} regenerar={regenerar} corriendo={CORRIENDO_LA_ESCALA} onCerrar={() => ponerAviso("cerrado")} />;
    else if (aviso === "cancelado-al-cerrar")
      escala = (
        <p className="text-xs text-fg-muted">
          Cerraste el panel con el aviso de La escala a la vista: si la cuenta no había llegado a 0, se canceló y no arrancó otra; si ya la estaba
          rehaciendo, eso siguió en el servidor. Mira cómo quedó en «La escala».
        </p>
      );
  }

  return (
    <section aria-label="Adónde va lo que contaste" className="flex flex-col gap-3 rounded-xl border border-line bg-surface-muted p-4">
      <h3 className="text-sm font-semibold text-fg">Adónde va lo que contaste</h3>
      {errorAlGuardar ? <Alert variant="danger">{errorAlGuardar}</Alert> : <QuedoGuardada clave={listo.clave} />}
      {guardado && <TextoDeLosHechos g={guardado.hechos} />}
      {escala}

      {cambios.length > 0 ? (
        <>
          <p className="text-xs text-fg-secondary">{cambios.length === 1 ? "Un cambio para la arquitectura de la venta:" : `${cambios.length} cambios para la arquitectura de la venta:`}</p>
          <ul className="flex flex-col gap-2">
            {cambios.map((c) => (
              <Cambio key={c.id} cambio={c} estado={estados[c.id] ?? "propuesto"} onAplicar={() => void aplicar(c)} onNo={() => ponerEstado(c.id, "descartado")} />
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
  const [estados, setEstados] = useState<Record<string, EstadoDelCambio>>({});
  const [aviso, setAviso] = useState<EstadoDelAviso>("abierto");
  // La conversación vive acá y no en el cajón: cerrarlo no la borra.
  const [conversacion, setConversacion] = useState<ConversacionEnPantalla>(conversacionNueva);
  // La nota de la conversación que se ve: una revisión que vuelve tarde (ya se empezó otra) no la pisa.
  const viva = useRef<string | null>(null);
  // Primero en la preventa: ni en la escala de la cuenta ni en la exploración de un proyecto.
  if (lugar !== "preventa" || !puedeEditar) return null;
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
    } catch {
      // La nota ya quedó: sin la revisión, La escala se puede rehacer a mano.
      if (viva.current === clave) setGuardado(sinRevision);
    }
  };

  const alQuedarListo = async ({ conversacion, nota, turno }: { conversacion: string; nota: string; turno: TurnoListo }) => {
    const clave = claveNuevaDeLoQueSabes();
    viva.current = clave;
    setListo({ clave, conversacion, cambios: turno.cambios });
    setGuardado(null);
    setErrorAlGuardar(null);
    setEstados({});
    setAviso("abierto");
    const ok = await cambiar([{ op: "nota", paso: clave, texto: nota }]);
    if (!ok) {
      setErrorAlGuardar(`No se pudo guardar la nota. Cópiala antes de cerrar: «${nota}»`);
      return;
    }
    // Los hechos y la revisión de La escala van de fondo: el panel ya muestra adónde va cada cosa.
    void revisar(conversacion, clave);
  };

  const olvidar = () => {
    viva.current = null;
    setConversacion(conversacionNueva());
    setListo(null);
    setGuardado(null);
    setErrorAlGuardar(null);
    setEstados({});
    setAviso("abierto");
  };

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
        description="Cuéntale lo que sabes del cliente, o pregúntale lo que se habló, escrito o dictado. Si le cuentas algo, te pregunta lo que falte y te dice adónde va cada cosa."
        size="lg"
      >
        {llena && !listo ? (
          <Alert variant="warning">«Lo que sabes del cliente» ya tiene {MAX_LO_QUE_SABES} notas: quita una en la Preparación antes de contar otra.</Alert>
        ) : (
          <PanelDeNexus
            urlDelTurno={`/api/sales/exploraciones/${exp.id}/nexus`}
            placeholder="Ej.: «Marco habló con el gerente por WhatsApp: pierden unos US$ 40.000 al mes en cartera vencida.» O pregunta: «¿Qué dijeron de la cobranza?»"
            alQuedarListo={alQuedarListo}
            terminado={listo !== null}
            conversacion={conversacion}
            alCambiar={setConversacion}
            alReiniciar={olvidar}
          >
            {listo && (
              <LoQueQuedo
                key={listo.clave}
                listo={listo}
                guardado={guardado}
                errorAlGuardar={errorAlGuardar}
                estados={estados}
                ponerEstado={(id, e) => setEstados((x) => ({ ...x, [id]: e }))}
                aviso={aviso}
                ponerAviso={setAviso}
              />
            )}
          </PanelDeNexus>
        )}
      </Drawer>
    </>
  );
}
