"use client";

/**
 * components/exploraciones/PedirleANexus.tsx — «✨ Mejorar con IA» de La escala, en el chat «Nexus» (23 nov, etapas 2 y 3 del
 * plan maestro de «Hablar con Nexus»; con la interfaz de todos los chats desde el 24 nov): lo monta HablarConNexus.tsx cuando
 * se pidió desde La escala. Un pedido, una propuesta. Cerrar el chat no pierde nada: el pedido de cada lugar queda recordado
 * mientras la página esté abierta (lib/pedirle-a-nexus/recordado.ts).
 *
 * El marco es el de todos los chats (components/asistente/CajonDeNexus.tsx). El lugar va como chip sobre la caja (lo pone el
 * botón: el Resumen o un área y la sección desde la que se pidió); quitar la sección pide sobre toda la página, y quitar la
 * página vuelve a la conversación (en la escala de la cuenta, donde no hay conversación, la página no se quita). Lo pedido
 * se ve en el hilo como el mensaje de la persona, y debajo la propuesta: cada cambio con el antes y el después, «Aplicar» y
 * «Descartar» por pieza, y «Aplicar todo». Lo que escribió el equipo no se reemplaza sin preguntar, y lo interno que pediste
 * llega con su aviso (`AVISO_DE_LO_INTERNO`): «Aplicar todo» deja los dos para que los decidas uno por uno, y «Aplicar»
 * pregunta. Lo que la revisión del código descartó se ve, con el porqué.
 *
 * Aplicar escribe por el camino de la edición a mano (lib/exploraciones/escala-con-nexus-server.ts) y nunca publica: el
 * aviso dice que hay cambios que el cliente no ve, con «Deshacer». Si otra persona cambió una parte entretanto, no se aplica
 * nada y se dice qué dice ahora.
 */
import { useRef, useState, useSyncExternalStore } from "react";
import { leerRecordado, loQueSeVeEnElHilo, recordar, SIN_PEDIDO, suscribirAlRecordado, type EstadoDelCambio, type PedidoRecordado } from "@/lib/pedirle-a-nexus/recordado";
import { devolverALaCaja } from "@/lib/asistente/caja";
import { Alert, Button, ConfirmDialog } from "@/components/ui";
import CajonDeNexus, { Burbuja, CajaDeNexus, ChatVacio, ChipDeNexus, Pensando, PropuestaEnElHilo } from "@/components/asistente/CajonDeNexus";
import { AVISO_DE_LO_INTERNO, MAX_PEDIDO, type CambioParaAplicar, type CambioPropuesto, type Choque, type DeshacerDeNexus, type PropuestaDeNexus } from "@/lib/pedirle-a-nexus/contrato";
import type { LugarEnLaEscala } from "@/lib/exploraciones/escala-con-nexus";

/**
 * La clave del pedido recordado de un lugar de La escala (lib/pedirle-a-nexus/recordado.ts). Cada sección tiene el suyo (24
 * nov): lo pedido desde «Puntos clave» no aparece al abrir desde «Tu operación».
 */
export const claveDelPedido = (exploracionId: string, lugar: LugarEnLaEscala, seccion: string | null = null): string =>
  `escala:${exploracionId}:${lugar.pagina === "resumen" ? "resumen" : `area:${lugar.areaId}`}${seccion ? `:${seccion}` : ""}`;

/** El pedido recordado de un lugar (la misma referencia hasta que cambia: lo pide `useSyncExternalStore`). */
function useRecordado(clave: string): PedidoRecordado {
  return useSyncExternalStore(
    suscribirAlRecordado,
    () => leerRecordado(clave),
    () => SIN_PEDIDO,
  );
}

/** Los ejemplos del chat vacío (solo ahí). */
const EJEMPLOS = ["Cambia el titular a algo sobre la cobranza", "Agrega un punto clave sobre el WhatsApp, que es crítico"] as const;

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

export default function PedirleANexus({
  abierto,
  onClose,
  exploracionId,
  lugar,
  lugarNombre,
  foco,
  onQuitarFoco,
  onQuitarLugar,
  alCambiar,
  ancho,
  onAncho,
  pedidoDeFoco = 0,
}: {
  abierto: boolean;
  /** Cerrar el chat (la ✕ de la cabecera o Escape). */
  onClose: () => void;
  exploracionId: string;
  lugar: LugarEnLaEscala;
  /** «Resumen» o el nombre del área. */
  lugarNombre: string;
  /** La sección desde la que se pidió (lib/external/secciones-de-la-escala.ts); null: la página entera. */
  foco: string | null;
  onQuitarFoco: () => void;
  /** Quitar el chip de la página: vuelve a la conversación. Sin esto (la escala de la cuenta), el chip no se quita. */
  onQuitarLugar?: () => void;
  /** Después de aplicar o deshacer (o de un choque): la página y el lienzo se ponen al día. */
  alCambiar: () => void;
  ancho: "normal" | "amplio";
  onAncho: () => void;
  /** Cada vez que sube, el cursor va a la caja aunque el chat ya estuviera abierto (el «Mejorar con IA» de otra sección). */
  pedidoDeFoco?: number;
}) {
  // El pedido de este lugar vive en el almacén del módulo (abajo): cerrar el chat y volver a abrirlo lo trae como estaba.
  const clave = claveDelPedido(exploracionId, lugar, foco);
  const { pedido, enviado, pidiendo, error, propuesta, estados, aplicando, choques, hecho } = useRecordado(clave);
  /** El cambio de una pieza escrita por el equipo, esperando que la persona confirme. */
  const [aConfirmar, setAConfirmar] = useState<CambioPropuesto | null>(null);
  /** «Aplicar todo» en curso: su botón dice «Aplicando…» solo entonces (no al aplicar una pieza ni al deshacer). */
  const [todoEnCurso, setTodoEnCurso] = useState(false);
  const cajaRef = useRef<HTMLTextAreaElement | null>(null);

  const pedir = async () => {
    const texto = pedido.trim();
    if (!texto || pidiendo || aplicando) return;
    // Lo pedido pasa al hilo y la caja queda vacía; si Nexus no puede, vuelve a la caja.
    // «Deshacer» de lo último aplicado se queda hasta que llegue la propuesta nueva: si el pedido falla, sigue ahí.
    recordar(clave, { pidiendo: true, enviado: texto, pedido: "", error: null, choques: [] });
    const r = await fetch(`/api/sales/exploraciones/${exploracionId}/escala/nexus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lugar, pedido: texto, foco }),
    }).catch(() => null);
    const data = ((await r?.json().catch(() => ({}))) ?? {}) as { propuesta?: PropuestaDeNexus; error?: string };
    // Aunque el chat se haya cerrado mientras Nexus pensaba: la respuesta queda para cuando se vuelva a abrir.
    if (!r?.ok || !data.propuesta) {
      // Lo pedido vuelve a la caja sin pisar lo que se escribió mientras Nexus pensaba.
      recordar(clave, (e) => ({ pidiendo: false, error: data.error ?? "Nexus no pudo proponer. Vuelve a intentarlo.", pedido: devolverALaCaja(texto, e.pedido), enviado: null }));
      return;
    }
    recordar(clave, { pidiendo: false, propuesta: data.propuesta, estados: {}, hecho: null });
  };

  /** Aplica (o deshace: vuelve a la versión de antes) por la ruta de la página. Devuelve si salió. */
  const enviar = async (pedidoAlServidor: { cambios: CambioParaAplicar[] } | { deshacer: DeshacerDeNexus }): Promise<boolean> => {
    const deshacer = "deshacer" in pedidoAlServidor;
    // «Deshacer» vuelve a como estaba antes del ÚLTIMO «Aplicar»: solo esas piezas quedan otra vez por decidir.
    const deshechas = deshacer ? (leerRecordado(clave).hecho?.claves ?? []) : [];
    recordar(clave, { aplicando: true, error: null, choques: [] });
    const r = await fetch(`/api/sales/exploraciones/${exploracionId}/escala/nexus`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deshacer ? { lugar, ...pedidoAlServidor } : { lugar, ...pedidoAlServidor, pedido: leerRecordado(clave).propuesta?.pedido ?? null }),
    }).catch(() => null);
    const data = ((await r?.json().catch(() => ({}))) ?? {}) as { aviso?: string; deshacer?: DeshacerDeNexus | null; error?: string; choques?: Choque[] };
    if (!r?.ok) {
      recordar(clave, { aplicando: false, error: data.error ?? "No se pudo aplicar.", choques: data.choques ?? [] });
      // Lo que cambió otra persona se ve en la página.
      alCambiar();
      return false;
    }
    recordar(clave, (e) => ({
      aplicando: false,
      hecho: deshacer || !("cambios" in pedidoAlServidor) ? null : { aviso: data.aviso ?? "Listo.", deshacer: data.deshacer ?? null, claves: pedidoAlServidor.cambios.map((c) => c.clave) },
      estados: deshacer ? Object.fromEntries(Object.entries(e.estados).filter(([k]) => !deshechas.includes(k))) : e.estados,
    }));
    alCambiar();
    return true;
  };

  const aplicar = async (lista: CambioPropuesto[]) => {
    if (!lista.length) return;
    const ok = await enviar({ cambios: lista.map((c) => ({ clave: c.clave, antes: c.antes, despues: c.despues })) });
    if (ok) recordar(clave, (e) => ({ estados: { ...e.estados, ...Object.fromEntries(lista.map((c) => [c.clave, "aplicado" as const])) } }));
  };

  const pendientes = (propuesta?.cambios ?? []).filter((c) => (estados[c.clave] ?? "pendiente") === "pendiente");
  // Lo escrito por el equipo y lo interno se deciden uno por uno, con su pregunta (24 nov: lo interno, como lo escrito a mano).
  const sinPreguntar = pendientes.filter((c) => !c.aMano && !c.interno);
  const descartar = (c: CambioPropuesto) => recordar(clave, (e) => ({ estados: { ...e.estados, [c.clave]: "descartado" } }));
  const setPedido = (texto: string) => recordar(clave, { pedido: texto });
  const descartarTodo = () => recordar(clave, { propuesta: null, estados: {} });
  /** «Nueva conversación»: lo pedido y la propuesta se van; lo último aplicado se queda con su «Deshacer». */
  const empezarDeNuevo = () => recordar(clave, { pedido: "", enviado: null, propuesta: null, estados: {}, error: null, choques: [] });
  // Lo último que se mandó: mientras Nexus piensa, el pedido nuevo (la propuesta de antes se esconde hasta que llegue la
  // nueva; si el pedido falla, vuelve con el suyo). La regla, con su prueba: lib/pedirle-a-nexus/recordado.ts.
  const { pedido: loPedido, conPropuesta } = loQueSeVeEnElHilo({ enviado, pidiendo, propuesta });
  const vacio = !loPedido && !pidiendo && !error && !hecho;

  const pie = (
    <>
      {foco ? (
        <ChipDeNexus onQuitar={onQuitarFoco} quitarLabel="Pedir sobre toda la página">
          Sobre «{foco}» · {lugarNombre}
        </ChipDeNexus>
      ) : (
        <ChipDeNexus onQuitar={onQuitarLugar} quitarLabel="Volver a conversar">
          Sobre la página «{lugarNombre}» de La escala
        </ChipDeNexus>
      )}
      <CajaDeNexus
        cajaRef={cajaRef}
        texto={pedido}
        setTexto={setPedido}
        onEnviar={() => void pedir()}
        enviarApagado={pidiendo || aplicando || !pedido.trim()}
        placeholder="Escribe qué quieres cambiar…"
        ariaLabel="Qué quieres que Nexus cambie"
        maxLength={MAX_PEDIDO}
        conDictado
        onErrorDeDictado={(m) => recordar(clave, { error: m, choques: [] })}
      />
    </>
  );

  return (
    <CajonDeNexus
      abierto={abierto}
      onClose={onClose}
      cajaRef={cajaRef}
      ariaLabel={`Nexus · La escala › ${lugarNombre}`}
      subtitulo={`La escala › ${lugarNombre}`}
      garantia="Nexus propone, tú aplicas; nada se publica."
      nuevaConversacion={{
        alHacer: empezarDeNuevo,
        apagada: (!loPedido && !error) || pidiendo || aplicando,
        titulo: "Empezar de nuevo: lo pedido y la propuesta se van (lo aplicado se queda, con su «Deshacer»)",
      }}
      ancho={ancho}
      onAncho={onAncho}
      pedidoDeFoco={pedidoDeFoco}
      alFinal={`${loPedido ?? ""}·${pidiendo}·${!!propuesta}·${!!hecho}·${error ?? ""}`}
      pie={pie}
    >
      {vacio && (
        <ChatVacio
          intro="Pídele un cambio a la página de La escala. Por ejemplo:"
          ejemplos={EJEMPLOS}
          cierre={<p>Te muestra cada parte con el antes y el después. Nexus propone; tú aplicas. Nada se publica.</p>}
        />
      )}

      {loPedido && <Burbuja de="persona">{loPedido}</Burbuja>}

      {/* Para el lector de pantalla: montada siempre, así anuncia cuando Nexus empieza a pensar. */}
      <p role="status" aria-live="polite" className="sr-only">
        {pidiendo ? "Nexus está leyendo la página" : aplicando ? "Aplicando los cambios" : ""}
      </p>
      {pidiendo && <Pensando texto="Nexus está leyendo la página…" />}

      {conPropuesta && propuesta && (
        <PropuestaEnElHilo
          titulo={
            propuesta.cambios.length
              ? `${propuesta.cambios.length} ${propuesta.cambios.length === 1 ? "cambio" : "cambios"} que propone Nexus`
              : "Nexus no propone cambios"
          }
          subtitulo={
            !propuesta.cambios.length || !pendientes.length
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
                  apagado: !sinPreguntar.length || aplicando,
                  ocupado: aplicando && todoEnCurso,
                }
              : null
          }
          descartar={{ rotulo: pendientes.length ? "Descartar la propuesta" : "Cerrar la propuesta", alHacer: descartarTodo, apagado: aplicando }}
          apagada={!!propuesta.cambios.length && !pendientes.length}
        >
          {propuesta.cambios.length > 0 && (
            <ul className="flex flex-col gap-2">
              {propuesta.cambios.map((c) => (
                <Cambio
                  key={c.clave}
                  c={c}
                  estado={estados[c.clave] ?? "pendiente"}
                  aplicando={aplicando}
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
            <Button size="sm" variant="secondary" className="ml-1" loading={aplicando} onClick={() => hecho.deshacer && void enviar({ deshacer: hecho.deshacer })}>
              Deshacer
            </Button>
          )}
        </Alert>
      )}

      {error && (
        <Alert variant={choques.length ? "warning" : "danger"} title={choques.length ? "Otra persona cambió esto" : "No se pudo"}>
          {error}
          {choques.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {choques.map((x) => (
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
    </CajonDeNexus>
  );
}
