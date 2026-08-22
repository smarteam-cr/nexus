"use client";

/**
 * components/asistente/ChatDelDocumento.tsx — EL CAJÓN DEL CHAT, DEL LADO DE ADENTRO.
 *
 * ── ⛔ POR QUÉ ESTE COMPONENTE EXISTE, Y ES UN BUG QUE ESTUVO VIVO ───────────────────────────
 * Este envoltorio no es decoración: es lo único que hace que el chat de documentos PUEDA aplicar.
 *
 * `ProjectCanvasPanel` monta `<AplicadorDeDocumentoProvider>` y, en el MISMO componente, llamaba a
 * `useAplicadorDeDocumento()`. Un contexto solo fluye hacia ABAJO: el componente que provee lee el
 * valor de AFUERA de su propio proveedor, o sea `null`. Siempre.
 *
 * Consecuencia, en producción y sin ningún error en consola: **el botón «Aplicar» del chat de
 * documentos nunca funcionó**. Cada clic devolvía «El editor de este documento no está montado.
 * Abrí el documento y volvé a intentar» — sobre un documento que estaba abierto delante de la
 * persona. Visto en pantalla el 2026-08-22, en el kickoff.
 *
 * ⚠ Y la guarda que existía no lo cazaba: verificaba que `onAplicar` LLAMARA a
 * `obtenerAplicador()`, que es exactamente lo que hacía. Medir «llama» donde hace falta «obtiene
 * algo» es la misma trampa que este repo ya documentó tres veces.
 *
 * La regla que queda escrita, y que su guarda hace cumplir: **el que provee no consume**.
 */
import ChatDelAsistente, { type AcuerdoDelChat, type ResultadoDeAplicar } from "./ChatDelAsistente";
import {
  useAplicadorDeDocumento,
  useHayAplicadorDeDocumento,
} from "./aplicador-de-documento";

export default function ChatDelDocumento({
  projectId,
  pieza,
  piezaLabel,
  abierto,
  onClose,
}: {
  projectId: string;
  pieza: string;
  piezaLabel: string;
  abierto: boolean;
  onClose: () => void;
}) {
  const obtenerAplicador = useAplicadorDeDocumento();
  const hayAplicador = useHayAplicadorDeDocumento();

  async function aplicar(acuerdo: AcuerdoDelChat): Promise<ResultadoDeAplicar> {
    const aplicador = obtenerAplicador();
    if (!aplicador) {
      return { fallo: "El editor de este documento todavía no terminó de cargar.", avisos: [] };
    }
    const operaciones = acuerdo.operaciones ?? [];
    if (operaciones.length === 0) {
      /* Un acuerdo anterior al 2026-08-22 traía una instrucción en prosa, y este carril espera
         operaciones. Se dice, en vez de fallar sin explicación sobre un hilo que la persona
         volvió a abrir. */
      return {
        fallo: acuerdo.instruccion
          ? "Esta conversación es anterior al carril nuevo: pedí el cambio otra vez y se aplica solo."
          : "El acuerdo no trae cambios para ejecutar.",
        avisos: [],
      };
    }
    try {
      const { avisos, rechazadas } = await aplicador(operaciones);
      /* ⛔ Lo rechazado es un FALLO PARCIAL, no un aviso: si tres de cinco no entraron, el hilo no
         puede decir «se aplicó» a secas. El modelo LEE el hilo, así que sin esto volvería a
         proponer lo que ya entró — sobre un vocabulario que no es idempotente. */
      return {
        fallo: rechazadas.length
          ? `No se pudieron aplicar ${rechazadas.length} de ${operaciones.length}: ${rechazadas.join(" · ")}`
          : null,
        avisos,
      };
    } catch (e) {
      return {
        fallo: e instanceof Error ? e.message : "el editor rechazó los cambios",
        avisos: [],
      };
    }
  }

  return (
    <ChatDelAsistente
      projectId={projectId}
      pieza={pieza}
      piezaLabel={piezaLabel}
      abierto={abierto}
      onClose={onClose}
      /* ⚠ El editor tarda un instante en montarse al abrir un documento. Decirlo apaga el botón
         con su motivo, en vez de dejar que el clic falle y escriba un desenlace. */
      motivoParaNoAplicar={hayAplicador ? null : "Abriendo el documento…"}
      onAplicar={aplicar}
    />
  );
}
