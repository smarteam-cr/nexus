"use client";

/**
 * components/exploraciones/PedirleANexus.tsx — «✨ Mejorar con IA» de La escala DE LA CUENTA, en el chat «Nexus» (23 nov,
 * etapas 2 y 3 del plan maestro de «Hablar con Nexus»; con la interfaz de todos los chats desde el 24 nov): lo monta
 * HablarConNexus.tsx cuando se pidió desde La escala de la ficha del cliente, donde no hay conversación. Un pedido, una
 * propuesta. Cerrar el chat no pierde nada: el pedido de cada lugar queda recordado mientras la página esté abierta
 * (lib/pedirle-a-nexus/recordado.ts).
 *
 * En la PREVENTA ya no se usa (25 nov, un solo contexto, Elías probando TEC · AE): ahí «✨ Mejorar con IA» abre LA
 * conversación con la sección como chip, y la propuesta va en el hilo (components/chat-de-nexus/PanelDeNexus.tsx). Acá se
 * queda el pedido de un solo paso porque la escala de la cuenta no tiene conversación.
 *
 * El marco es el de todos los chats (components/asistente/CajonDeNexus.tsx). El lugar va como chip sobre la caja (lo pone el
 * botón: el Resumen o un área y la sección desde la que se pidió); quitar la sección pide sobre toda la página (la página no
 * se quita: no hay conversación a la que volver). Lo pedido se ve en el hilo como el mensaje de la persona, y debajo la
 * propuesta (./PropuestaDeLaEscala.tsx, la misma de la conversación): cada cambio con el antes y el después, «Aplicar» y
 * «Descartar» por pieza, «Aplicar todo» y lo último aplicado con su «Deshacer».
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { leerRecordado, loQueSeVeEnElHilo, recordar, SIN_PEDIDO, suscribirAlRecordado, type PedidoRecordado } from "@/lib/pedirle-a-nexus/recordado";
import { devolverALaCaja } from "@/lib/asistente/caja";
import CajonDeNexus, { Burbuja, CajaDeNexus, ChatVacio, ChipDeNexus, Pensando } from "@/components/asistente/CajonDeNexus";
import { MAX_PEDIDO, type PropuestaDeNexus } from "@/lib/pedirle-a-nexus/contrato";
import type { LugarEnLaEscala } from "@/lib/exploraciones/escala-con-nexus";
import { marcarNexusSinLeer } from "@/lib/exploraciones/abrir-nexus";
import PropuestaDeLaEscala from "./PropuestaDeLaEscala";

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

export default function PedirleANexus({
  abierto,
  onClose,
  exploracionId,
  lugar,
  lugarNombre,
  foco,
  onQuitarFoco,
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
  /** Después de aplicar o deshacer (o de un choque): la página y el lienzo se ponen al día. */
  alCambiar: () => void;
  ancho: "normal" | "amplio";
  onAncho: () => void;
  /** Cada vez que sube, el cursor va a la caja aunque el chat ya estuviera abierto (el «Mejorar con IA» de otra sección). */
  pedidoDeFoco?: number;
}) {
  // El pedido de este lugar vive en el almacén del módulo (lib/pedirle-a-nexus/recordado.ts): cerrar el chat y volver a
  // abrirlo lo trae como estaba.
  const clave = claveDelPedido(exploracionId, lugar, foco);
  const { pedido, enviado, pidiendo, error, choques, propuesta, estados, aplicando, hecho } = useRecordado(clave);
  const cajaRef = useRef<HTMLTextAreaElement | null>(null);
  // Si el cajón está abierto AHORA: lo que Nexus propone con el cajón cerrado deja un punto rojo en «✨ Mejorar con IA» de
  // la página (25 nov: en vez del aviso «Listo: Pedirle a Nexus…», que se fue con las corridas del chat).
  const abiertoAhora = useRef(abierto);
  useEffect(() => {
    abiertoAhora.current = abierto;
  }, [abierto]);

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
    if (!abiertoAhora.current) marcarNexusSinLeer(exploracionId, true);
    if (!r?.ok || !data.propuesta) {
      // Lo pedido vuelve a la caja sin pisar lo que se escribió mientras Nexus pensaba.
      recordar(clave, (e) => ({ pidiendo: false, error: data.error ?? "Nexus no pudo proponer. Vuelve a intentarlo.", pedido: devolverALaCaja(texto, e.pedido), enviado: null }));
      return;
    }
    recordar(clave, { pidiendo: false, propuesta: data.propuesta, estados: {}, hecho: null });
  };

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
        <ChipDeNexus>Sobre la página «{lugarNombre}» de La escala</ChipDeNexus>
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

      {/* La propuesta y lo último aplicado (con su «Deshacer»): la misma pieza que la conversación de la preventa. */}
      <PropuestaDeLaEscala
        exploracionId={exploracionId}
        lugar={lugar}
        propuesta={conPropuesta ? propuesta : null}
        estados={estados}
        ponerEstados={(x) => recordar(clave, (e) => ({ estados: { ...e.estados, ...x } }))}
        hecho={hecho}
        ponerHecho={(h) => recordar(clave, { hecho: h })}
        alCambiarLaPagina={alCambiar}
        alDescartarTodo={descartarTodo}
        alOcupado={(v) => recordar(clave, { aplicando: v })}
        aplicandoAfuera={aplicando}
        // El error (de pedir o de aplicar) vive con el pedido de este lugar: se va con un pedido nuevo o «Empezar de nuevo».
        error={error ? { texto: error, choques } : null}
        ponerError={(e) => recordar(clave, { error: e?.texto ?? null, choques: e?.choques ?? [] })}
        apagada={pidiendo}
      />
    </CajonDeNexus>
  );
}
