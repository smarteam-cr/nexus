"use client";
/**
 * components/asistente/ChatDeUnPedido.tsx — «✨ Mejorar con IA» de un documento o de una lista, en el chat «Nexus» (24 nov).
 *
 * Elías: «todo debe abrir el mismo chat con la misma interfaz». Algunos «Mejorar con IA» no son una conversación sino UN
 * pedido y UNA propuesta: los artefactos y los documentos sin chat (components/ai/DocumentAssist.tsx), el perfil de un puesto
 * (components/roles/RoleWorkspace.tsx) y las actividades de un caso de uso (components/exploraciones/PasoCasosDeUso.tsx).
 * Hasta el 24 nov abrían una ventana modal o un panel dentro de la tarjeta; ahora abren el mismo cajón que todos
 * (./CajonDeNexus.tsx): el pedido se escribe en la caja de abajo, se ve en el hilo como el mensaje de la persona, y la
 * propuesta llega debajo, con «Aplicar» y «Descartar» (`children`, en `PropuestaEnElHilo`). Quien monta corre el pedido y
 * aplica; este componente solo es la cara.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, useToast } from "@/components/ui";
import { devolverALaCaja } from "@/lib/asistente/caja";
import CajonDeNexus, { Burbuja, CajaDeNexus, ChatVacio, ChipDeNexus, Pensando } from "./CajonDeNexus";

/** El aviso cuando la propuesta llega con el chat cerrado (Nexus tarda de 20 a 60 s y el chat se puede cerrar mientras). */
export const AVISO_DE_PROPUESTA_LISTA = "La propuesta de Nexus está lista: ábrela en «Mejorar con IA».";

/**
 * Lo que llama quien monta cuando llega la propuesta: si el chat está cerrado AHORA (no en el render en que se mandó el
 * pedido) y el botón sigue en pantalla, avisa con `AVISO_DE_PROPUESTA_LISTA` (el botón, además, lleva `PuntoDePropuesta`).
 * Si la persona ya se fue de esa pantalla, no avisa: no habría dónde abrirla (segunda revisión del 24 nov).
 */
export function useAvisoDePropuestaLista(abierto: boolean): () => void {
  const toast = useToast();
  const abiertoRef = useRef(abierto);
  const montado = useRef(false);
  useEffect(() => {
    abiertoRef.current = abierto;
  }, [abierto]);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  return useCallback(() => {
    if (montado.current && !abiertoRef.current) toast.success(AVISO_DE_PROPUESTA_LISTA);
  }, [toast]);
}

/** El punto en el botón «Mejorar con IA» mientras hay una propuesta sin revisar y el chat está cerrado. */
export function PuntoDePropuesta() {
  return (
    <>
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand" />
      <span className="sr-only">(hay una propuesta de Nexus para revisar)</span>
    </>
  );
}

export interface ChatDeUnPedidoProps {
  abierto: boolean;
  onClose: () => void;
  /** De qué se habla, debajo de «Nexus»: «Mejorar el kickoff con IA». */
  subtitulo: string;
  /** Lo que se le garantiza, entero en su propia línea. Por defecto: «Nada cambia hasta que lo apliques.» */
  garantia?: string;
  /** Lo que se mejora, como chip sobre la caja («Sobre las actividades de «Cobranza por WhatsApp»»). */
  chip?: ReactNode;
  /** El chat vacío: qué se le puede pedir y los ejemplos (un clic los pone en la caja, sin mandarlos). */
  vacio: { intro: string; ejemplos?: readonly string[]; cierre?: string };
  /** Lo último que se pidió (se ve como el mensaje de la persona). */
  enviado: string | null;
  pidiendo: boolean;
  /** Lo que se ve mientras Nexus trabaja («Nexus está preparando la propuesta…»). */
  textoPensando?: string;
  error: string | null;
  /** Manda el pedido. Devuelve si salió: si no, lo escrito vuelve a la caja. */
  onPedir: (texto: string) => Promise<boolean>;
  /** Largo mínimo del pedido (menos, el botón queda apagado). */
  minimo?: number;
  maxLength?: number;
  placeholder?: string;
  /** Aplicando: no se manda otro pedido ni se empieza de nuevo. */
  ocupado?: boolean;
  /** «Nueva conversación»: lo pedido y la propuesta se van. */
  onNueva: () => void;
  /** La propuesta (y lo que pasó al aplicarla), dentro del hilo. */
  children?: ReactNode;
}

export default function ChatDeUnPedido({
  abierto,
  onClose,
  subtitulo,
  garantia = "Nada cambia hasta que lo apliques.",
  chip,
  vacio,
  enviado,
  pidiendo,
  textoPensando = "Nexus está preparando la propuesta…",
  error,
  onPedir,
  minimo = 3,
  maxLength,
  placeholder = "Escribe qué quieres cambiar…",
  ocupado = false,
  onNueva,
  children,
}: ChatDeUnPedidoProps) {
  const [texto, setTexto] = useState("");
  const [ancho, setAncho] = useState<"normal" | "amplio">("normal");
  /** El dictado no pudo (permiso del micrófono, sin red): se dice en el hilo, como en los demás chats. */
  const [errorDeDictado, setErrorDeDictado] = useState<string | null>(null);
  const cajaRef = useRef<HTMLTextAreaElement | null>(null);
  const corto = texto.trim().length < minimo;

  const enviar = async () => {
    const t = texto.trim();
    if (t.length < minimo || pidiendo || ocupado) return;
    setTexto("");
    setErrorDeDictado(null);
    const ok = await onPedir(t);
    // Si no salió, lo pedido vuelve a la caja, sin pisar lo que se escribió mientras Nexus pensaba.
    if (!ok) setTexto((x) => devolverALaCaja(t, x));
  };

  const vacioDelTodo = !enviado && !pidiendo && !error && !children;

  return (
    <CajonDeNexus
      abierto={abierto}
      onClose={onClose}
      cajaRef={cajaRef}
      ariaLabel={`Nexus · ${subtitulo}`}
      subtitulo={subtitulo}
      garantia={garantia}
      nuevaConversacion={{
        alHacer: () => {
          setTexto("");
          onNueva();
        },
        apagada: vacioDelTodo || pidiendo || ocupado,
        titulo: "Empezar de nuevo: lo pedido y la propuesta se van",
      }}
      ancho={ancho}
      onAncho={() => setAncho((a) => (a === "amplio" ? "normal" : "amplio"))}
      alFinal={`${enviado ?? ""}·${pidiendo}·${!!children}·${error ?? ""}`}
      pie={
        <>
          {chip ? <ChipDeNexus>{chip}</ChipDeNexus> : null}
          <CajaDeNexus
            cajaRef={cajaRef}
            texto={texto}
            setTexto={setTexto}
            onEnviar={() => void enviar()}
            enviarApagado={pidiendo || ocupado || corto}
            placeholder={placeholder}
            maxLength={maxLength}
            conDictado
            onErrorDeDictado={setErrorDeDictado}
          />
        </>
      }
    >
      {vacioDelTodo && (
        <ChatVacio
          intro={vacio.intro}
          ejemplos={vacio.ejemplos}
          alElegir={(e) => {
            setTexto(e);
            cajaRef.current?.focus();
          }}
          cierre={vacio.cierre ? <p>{vacio.cierre}</p> : undefined}
        />
      )}
      {enviado && <Burbuja de="persona">{enviado}</Burbuja>}
      {/* Para el lector de pantalla: montada siempre, así anuncia cuando Nexus empieza a trabajar. */}
      <p role="status" aria-live="polite" className="sr-only">
        {pidiendo ? textoPensando : ocupado ? "Aplicando los cambios" : ""}
      </p>
      {pidiendo && <Pensando texto={textoPensando} />}
      {error && <Alert variant="danger">{error}</Alert>}
      {errorDeDictado && <Alert variant="warning">{errorDeDictado}</Alert>}
      {children}
    </CajonDeNexus>
  );
}
