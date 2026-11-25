"use client";

/**
 * components/exploraciones/PropuestaDeLaEscala.tsx — LO QUE NEXUS PROPONE A LA PÁGINA DE LA ESCALA, en el hilo del chat
 * «Nexus»: cada cambio con el antes y el después, «Aplicar» y «Descartar» por pieza, «Aplicar todo», lo que la revisión del
 * código descartó con su porqué, y lo último aplicado con su «Deshacer». La usan los dos lugares que muestran una propuesta
 * a La escala (25 nov, un solo contexto):
 *   · la conversación de la preventa (components/chat-de-nexus/PanelDeNexus.tsx, por HablarConNexus.tsx): una por vuelta,
 *     en el hilo, debajo de lo que pidió la persona;
 *   · el pedido de La escala de la cuenta (./PedirleANexus.tsx), donde no hay conversación.
 * Hasta el 25 nov vivía dentro de PedirleANexus.
 *
 * Lo que escribió el equipo no se reemplaza sin preguntar, y lo interno que se pidió llega con su aviso
 * (`AVISO_DE_LO_INTERNO`): «Aplicar todo» deja los dos para decidirlos uno por uno, y «Aplicar» pregunta.
 *
 * Aplicar escribe por el camino de la edición a mano (lib/exploraciones/escala-con-nexus-server.ts, por la ruta
 * …/escala/nexus) y nunca publica. Si otra persona cambió una parte entretanto, no se aplica nada y se dice qué dice ahora.
 * Qué se aplicó o se descartó, y lo último aplicado, lo guarda quien la monta (`estados`, `hecho`): cerrar el chat no lo
 * pierde.
 */
import { useState } from "react";
import { Alert, Button, ConfirmDialog } from "@/components/ui";
import { PropuestaEnElHilo } from "@/components/asistente/CajonDeNexus";
import { AVISO_DE_LO_INTERNO, type CambioParaAplicar, type CambioPropuesto, type Choque, type DeshacerDeNexus, type PropuestaDeNexus } from "@/lib/pedirle-a-nexus/contrato";
import type { EstadoDelCambio } from "@/lib/pedirle-a-nexus/recordado";
import type { LugarEnLaEscala } from "@/lib/exploraciones/escala-con-nexus";

/** Lo que salió mal al aplicar: el porqué y, si otra persona cambió algo, qué dice ahora cada parte. */
export interface ErrorAlAplicar {
  texto: string;
  choques: Choque[];
}

/** Lo último aplicado: su aviso, cómo deshacerlo y qué piezas tocó. */
export interface HechoEnLaEscala {
  aviso: string;
  deshacer: DeshacerDeNexus | null;
  claves: string[];
}

function Cambio({ c, estado, aplicando, onAplicar, onDescartar }: { c: CambioPropuesto; estado: EstadoDelCambio; aplicando: boolean; onAplicar: () => void; onDescartar: () => void }) {
  return (
    <li className={`rounded-xl border border-line bg-surface px-3 py-2.5 ${estado !== "pendiente" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <p className="text-xs font-semibold text-fg">
          {c.nombre}
          {c.agregar && <span className="ml-1.5 font-normal text-brand">· nueva</span>}
          {c.despues === null && <span className="ml-1.5 font-normal text-fg-muted">· se quita</span>}
        </p>
        <span className="text-[11px] text-fg-muted">{c.seccion}</span>
      </div>
      {c.aMano && estado === "pendiente" && <p className="mt-1 text-[11px] text-fg-secondary">La escribió tu equipo: te pregunto antes de reemplazarla.</p>}
      {c.interno && <p className="mt-1 text-[11px] font-semibold text-warn-ink">{AVISO_DE_LO_INTERNO}</p>}
      {c.antes !== null && <p className="mt-1.5 whitespace-pre-line text-xs text-fg-muted line-through">{c.antes}</p>}
      {c.despues !== null && <p className="mt-1 whitespace-pre-line text-sm text-fg">{c.despues}</p>}
      {/* La cifra grande con su cita (25 nov): de dónde sale, o que ninguna cita la sostiene. */}
      {c.desde && (
        <p className="mt-1 text-[11px] text-fg-secondary">
          Sale de «{c.desde.nombre}», con su cita: {c.desde.cita}
        </p>
      )}
      {c.sinCita && <p className="mt-1 text-[11px] text-warn-ink">Ninguna cita de las reuniones la sostiene: el cliente no la verá hasta corregirla con lo que dijo la empresa.</p>}
      {/* Lo que lo respalda (24 nov), debajo del cambio: Nexus no juzga si dice lo mismo que lo pedido; quien aplica lo compara. */}
      {c.respaldo && c.respaldo.length > 0 && (
        <div className="mt-1.5 rounded-lg border border-dashed border-line bg-surface-muted px-2.5 py-1.5 text-[11px] text-fg-secondary">
          <p className="font-semibold text-fg-muted">Lo que Nexus tiene de la cuenta (compáralo antes de aplicar):</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
            {c.respaldo.map((r) => (
              <li key={r}>«{r}»</li>
            ))}
          </ul>
          {!!c.respaldoDeMas && (
            <p className="mt-0.5 text-fg-muted">
              Y {c.respaldoDeMas === 1 ? "otra oración que lo nombra" : `${c.respaldoDeMas} oraciones más que lo nombran`}, en las notas de la cuenta o en la página.
            </p>
          )}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        {estado === "pendiente" ? (
          <>
            <Button size="sm" variant="primary" disabled={aplicando} onClick={onAplicar}>
              Aplicar
            </Button>
            <Button size="sm" variant="ghost" disabled={aplicando} onClick={onDescartar}>
              Descartar
            </Button>
          </>
        ) : (
          <span className="text-[11px] font-semibold text-fg-muted">{estado === "aplicado" ? "Aplicado" : "Descartado"}</span>
        )}
      </div>
    </li>
  );
}

export default function PropuestaDeLaEscala({
  exploracionId,
  lugar,
  propuesta,
  estados,
  ponerEstados,
  hecho,
  ponerHecho,
  alCambiarLaPagina,
  alDescartarTodo,
  alOcupado,
  aplicandoAfuera = false,
  error: errorDeAfuera,
  ponerError,
  apagada = false,
}: {
  exploracionId: string;
  lugar: LugarEnLaEscala;
  /** La propuesta a la vista; null: solo lo último aplicado (con su «Deshacer»), si lo hay. */
  propuesta: PropuestaDeNexus | null;
  estados: Record<string, EstadoDelCambio>;
  /** Cambia el estado de algunos cambios (quien la monta lo guarda). */
  ponerEstados: (cambios: Record<string, EstadoDelCambio>) => void;
  hecho: HechoEnLaEscala | null;
  ponerHecho: (h: HechoEnLaEscala | null) => void;
  /** Después de aplicar o deshacer (o de un choque): la página y el lienzo se ponen al día. */
  alCambiarLaPagina: () => void;
  /** «Descartar la propuesta» / «Cerrar la propuesta». Sin esto, descartar marca cada cambio pendiente como descartado. */
  alDescartarTodo?: () => void;
  /** Mientras se aplica o se deshace: quien la monta espera (la caja, «Nueva conversación»). */
  alOcupado?: (ocupado: boolean) => void;
  /**
   * Se está aplicando, según quien la monta (revisión del 25 nov): el cajón se pudo cerrar y volver a abrir a media
   * aplicación, y esta pieza nacer de nuevo sin saberlo. Mientras tanto los botones esperan.
   */
  aplicandoAfuera?: boolean;
  /**
   * El error de aplicar lo guarda quien la monta (revisión del 25 nov): así sobrevive a cerrar el cajón y se va con un pedido
   * nuevo. Sin `ponerError`, lo guarda esta pieza.
   */
  error?: ErrorAlAplicar | null;
  ponerError?: (e: ErrorAlAplicar | null) => void;
  /** Algo más está en curso (Nexus pensando): los botones esperan. */
  apagada?: boolean;
}) {
  const [aplicando, setAplicando] = useState(false);
  /** «Aplicar todo» en curso: su botón dice «Aplicando…» solo entonces (no al aplicar una pieza ni al deshacer). */
  const [todoEnCurso, setTodoEnCurso] = useState(false);
  const [errorLocal, setErrorLocal] = useState<ErrorAlAplicar | null>(null);
  const error = ponerError ? (errorDeAfuera ?? null) : errorLocal;
  const setError = ponerError ?? setErrorLocal;
  /** El cambio de una pieza escrita por el equipo (o interno), esperando que la persona confirme. */
  const [aConfirmar, setAConfirmar] = useState<CambioPropuesto | null>(null);
  const ocupar = (v: boolean) => {
    setAplicando(v);
    alOcupado?.(v);
  };

  /** Aplica (o deshace: vuelve a la versión de antes) por la ruta de la página. Devuelve si salió. */
  const enviar = async (pedidoAlServidor: { cambios: CambioParaAplicar[] } | { deshacer: DeshacerDeNexus }): Promise<boolean> => {
    const deshacer = "deshacer" in pedidoAlServidor;
    ocupar(true);
    setError(null);
    try {
      const r = await fetch(`/api/sales/exploraciones/${exploracionId}/escala/nexus`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deshacer ? { lugar, ...pedidoAlServidor } : { lugar, ...pedidoAlServidor, pedido: propuesta?.pedido ?? null }),
      }).catch(() => null);
      const data = ((await r?.json().catch(() => ({}))) ?? {}) as { aviso?: string; deshacer?: DeshacerDeNexus | null; error?: string; choques?: Choque[] };
      if (!r?.ok) {
        setError({ texto: data.error ?? "No se pudo aplicar.", choques: data.choques ?? [] });
        // Lo que cambió otra persona se ve en la página.
        alCambiarLaPagina();
        return false;
      }
      if (deshacer) {
        // «Deshacer» vuelve a como estaba antes del ÚLTIMO «Aplicar»: solo esas piezas quedan otra vez por decidir.
        ponerEstados(Object.fromEntries((hecho?.claves ?? []).map((k) => [k, "pendiente" as const])));
        ponerHecho(null);
      } else if ("cambios" in pedidoAlServidor) {
        ponerEstados(Object.fromEntries(pedidoAlServidor.cambios.map((c) => [c.clave, "aplicado" as const])));
        ponerHecho({ aviso: data.aviso ?? "Listo.", deshacer: data.deshacer ?? null, claves: pedidoAlServidor.cambios.map((c) => c.clave) });
      }
      alCambiarLaPagina();
      return true;
    } finally {
      ocupar(false);
    }
  };

  const aplicar = async (lista: CambioPropuesto[]) => {
    if (!lista.length) return;
    await enviar({ cambios: lista.map((c) => ({ clave: c.clave, antes: c.antes, despues: c.despues })) });
  };

  const cambios = propuesta?.cambios ?? [];
  const pendientes = cambios.filter((c) => (estados[c.clave] ?? "pendiente") === "pendiente");
  // Lo escrito por el equipo y lo interno se deciden uno por uno, con su pregunta (24 nov: lo interno, como lo escrito a mano).
  const sinPreguntar = pendientes.filter((c) => !c.aMano && !c.interno);
  const descartar = (c: CambioPropuesto) => ponerEstados({ [c.clave]: "descartado" });
  const descartarTodo = alDescartarTodo ?? (() => ponerEstados(Object.fromEntries(pendientes.map((c) => [c.clave, "descartado" as const]))));
  const quieto = aplicando || aplicandoAfuera || apagada;

  return (
    <>
      {propuesta && (
        <PropuestaEnElHilo
          titulo={cambios.length ? `${cambios.length} ${cambios.length === 1 ? "cambio" : "cambios"} que propone Nexus` : "Nexus no propone cambios"}
          subtitulo={
            !cambios.length || !pendientes.length
              ? null
              : !sinPreguntar.length
                ? "Cada cambio se decide uno por uno: lo escribió tu equipo o es interno de la venta."
                : sinPreguntar.length < pendientes.length
                  ? "«Aplicar todo» deja para el final lo que escribió tu equipo y lo interno de la venta: eso lo decides uno por uno."
                  : "Revisa cada cambio: aplica uno por uno o todos juntos."
          }
          nota={propuesta.nota ?? undefined}
          // «Aplicar todo» se queda a la vista mientras haya algo pendiente: apagado si todo se decide uno por uno.
          aplicar={
            pendientes.length
              ? {
                  rotulo: sinPreguntar.length && sinPreguntar.length < pendientes.length ? `Aplicar todo (${sinPreguntar.length})` : "Aplicar todo",
                  alHacer: () => {
                    setTodoEnCurso(true);
                    void aplicar(sinPreguntar).finally(() => setTodoEnCurso(false));
                  },
                  apagado: !sinPreguntar.length || quieto,
                  ocupado: aplicando && todoEnCurso,
                }
              : null
          }
          // Sin cambios, en la conversación no hay nada que cerrar (la propuesta queda como lo que contestó Nexus).
          descartar={pendientes.length ? { rotulo: "Descartar la propuesta", alHacer: descartarTodo, apagado: quieto } : alDescartarTodo ? { rotulo: "Cerrar la propuesta", alHacer: alDescartarTodo, apagado: quieto } : null}
          apagada={!!cambios.length && !pendientes.length}
        >
          {cambios.length > 0 && (
            <ul className="flex flex-col gap-2">
              {cambios.map((c) => (
                <Cambio
                  key={c.clave}
                  c={c}
                  estado={estados[c.clave] ?? "pendiente"}
                  aplicando={quieto}
                  onAplicar={() => (c.aMano || c.interno ? setAConfirmar(c) : void aplicar([c]))}
                  onDescartar={() => descartar(c)}
                />
              ))}
            </ul>
          )}
          {propuesta.descartados.length > 0 && (
            <details className="mt-2 text-xs text-fg-muted">
              <summary className="cursor-pointer font-semibold text-fg-secondary">Lo que Nexus escribió y no pasó la revisión ({propuesta.descartados.length})</summary>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {propuesta.descartados.map((x, i) => (
                  <li key={`${x.clave ?? "x"}-${i}`}>
                    {x.nombre ? `${x.nombre}: ` : ""}«{x.texto}» — {x.motivo}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </PropuestaEnElHilo>
      )}

      {/* Lo último aplicado, con su «Deshacer»: debajo de la propuesta, que es de donde salió. */}
      {hecho && (
        <Alert variant="success" title="Aplicado">
          {hecho.aviso}{" "}
          {hecho.deshacer && (
            <Button size="sm" variant="secondary" className="ml-1" loading={aplicando || aplicandoAfuera} disabled={apagada} onClick={() => hecho.deshacer && void enviar({ deshacer: hecho.deshacer })}>
              Deshacer
            </Button>
          )}
        </Alert>
      )}

      {error && (
        <Alert variant={error.choques.length ? "warning" : "danger"} title={error.choques.length ? "Otra persona cambió esto" : "No se pudo"}>
          {error.texto}
          {error.choques.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {error.choques.map((x) => (
                <li key={x.clave}>
                  {x.nombre ?? "Una parte"}: {x.ahora === null ? "ya no está." : `ahora dice «${x.ahora}».`}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      <ConfirmDialog
        open={!!aConfirmar}
        onCancel={() => setAConfirmar(null)}
        onConfirm={() => {
          const c = aConfirmar;
          setAConfirmar(null);
          if (c) void aplicar([c]);
        }}
        title={aConfirmar?.interno ? "¿Llevar algo interno de la venta a la página?" : "¿Reemplazar lo que escribió tu equipo?"}
        description={
          aConfirmar
            ? [
                aConfirmar.interno ? `${AVISO_DE_LO_INTERNO} Aplicar no publica: queda en «${aConfirmar.nombre}» hasta que alguien publique.` : null,
                aConfirmar.respaldo?.length ? "Compara con lo que Nexus tiene de la cuenta, debajo del cambio: Nexus no revisa si dice lo mismo." : null,
                aConfirmar.aMano ? `«${aConfirmar.nombre}» la escribió una persona. Si aplicas, queda lo que propone Nexus (y lo de antes, en el historial).` : null,
              ]
                .filter(Boolean)
                .join(" ")
            : ""
        }
        confirmLabel={aConfirmar?.interno ? "Sí, llevarlo a la página" : "Sí, reemplazarla"}
      />
    </>
  );
}
