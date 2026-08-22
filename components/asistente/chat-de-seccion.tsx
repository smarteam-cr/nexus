"use client";

/**
 * components/asistente/chat-de-seccion.tsx — ABRIR EL CHAT SOBRE UNA SECCIÓN CONCRETA.
 *
 * ── POR QUÉ UN CONTEXTO Y NO UNA PROP ───────────────────────────────────────
 * El botón vive en el chrome de cada sección, adentro de `LandingView`, que lo montan OCHO
 * workspaces, las vistas externas y la impresión. Pasarlo por props obligaría a tocar los ocho y a
 * enhebrar el mismo callback por tres niveles — y las vistas externas y el PDF tendrían que pasar
 * `undefined` a mano para no pintarlo.
 *
 * ⛔ **Sin proveedor no hace nada, y eso es la mitad del diseño.** El cliente que abre la propuesta
 * y el PDF montan el mismo `LandingView`: si el botón se pintara ahí, le estaríamos ofreciendo al
 * prospecto un chat interno. Es el mismo criterio que ya usa el aplicador de documento.
 *
 * ── QUÉ SIGNIFICA «CON LA SECCIÓN REFERENCIADA» ─────────────────────────────
 * Un CHIP sobre el campo de escribir, no un texto pre-cargado.
 *
 * Pre-cargar el texto es lo más barato y es una promesa falsa: se borra al escribir, así que la
 * referencia sería una sugerencia y no un hecho; el modelo tendría que re-deducirla de la prosa en
 * cada turno; y si el cajón ya está abierto con algo a medio escribir, o se pisa o se concatena
 * mal.
 *
 * El chip es estado visible y revocable, y al enviar la app antepone una línea legible por máquina
 * al turno — el mismo mecanismo que ya usa el bloque de pendientes. Eso es lo que hace que la
 * referencia sobreviva al turno siguiente: el hilo se re-manda entero al modelo, así que lo que
 * solo vive en React deja de existir en el turno 2.
 *
 * ⚠ Y el chip es una PISTA, no una reja. Si la persona escribe sobre otra sección sin cerrarlo —lo
 * va a hacer— el modelo no puede negarse. La reja vive en las casillas del acuerdo, que es donde
 * se revisa.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface SeccionReferida {
  key: string;
  label: string;
}

interface Registro {
  /** `null` = el chat está abierto sin alcance, o cerrado. */
  seccion: SeccionReferida | null;
  /** Abre el cajón fijando el alcance en esa sección. */
  abrirCon: (seccion: SeccionReferida) => void;
  /** Saca el alcance sin cerrar el cajón. */
  soltar: () => void;
  /** `false` cuando este documento no tiene chat: el botón no se pinta. */
  disponible: boolean;
}

const Ctx = createContext<Registro | null>(null);

export function ChatDeSeccionProvider({
  disponible,
  onAbrir,
  children,
}: {
  disponible: boolean;
  /** Lo que hace el panel al pedir el chat: abrir el cajón. */
  onAbrir: () => void;
  children: ReactNode;
}) {
  const [seccion, setSeccion] = useState<SeccionReferida | null>(null);

  const abrirCon = useCallback(
    (s: SeccionReferida) => {
      setSeccion(s);
      onAbrir();
    },
    [onAbrir],
  );
  const soltar = useCallback(() => setSeccion(null), []);

  const valor = useMemo<Registro>(
    () => ({ seccion, abrirCon, soltar, disponible }),
    [seccion, abrirCon, soltar, disponible],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/**
 * Lo que necesita el chrome de una sección para ofrecer el botón.
 *
 * Fuera del proveedor devuelve `disponible: false` y un `abrirCon` inerte: la vista del cliente y
 * el PDF montan el mismo motor, y ahí no hay chat que abrir.
 */
export function useChatDeSeccion(): Registro {
  return (
    useContext(Ctx) ?? {
      seccion: null,
      abrirCon: () => {},
      soltar: () => {},
      disponible: false,
    }
  );
}

/**
 * El marcador de alcance que se antepone al mensaje del CSE.
 *
 * ⚠ Va en el CONTENIDO del turno y no en un campo aparte porque el hilo se re-manda entero al
 * modelo en cada turno: lo que no está en el texto no existe dos mensajes después. Mismo mecanismo
 * que el bloque de pendientes, y misma razón.
 *
 * ⛔ Y por eso mismo hay que SACARLO al pintar: es una instrucción para el modelo, no algo que la
 * persona escribió. Verlo entero arriba de su propia frase —repitiendo lo que el chip ya dice al
 * lado— se lee como ruido del sistema metido en su mensaje. Visto en pantalla el 2026-08-22.
 */
export const MARCA_DE_ALCANCE = "[SOBRE LA SECCIÓN";

export function lineaDeAlcance(seccion: SeccionReferida | null): string {
  if (!seccion) return "";
  return (
    `${MARCA_DE_ALCANCE} «${seccion.label}» (${seccion.key})]\n` +
    "Es de dónde vino el pedido, no un límite: si lo que sigue habla de otra sección, atiéndelo igual.\n\n"
  );
}

/**
 * El texto del CSE tal como lo escribió, sin el marcador de alcance.
 *
 * ⚠ Se corta por la línea en blanco que cierra el bloque, no por el largo del texto: el marcador
 * tiene dos líneas y el mensaje puede empezar con lo que sea. Si el bloque no está, devuelve el
 * mensaje intacto — un turno viejo, o uno mandado sin alcance.
 */
export function mensajeSinAlcance(texto: string): string {
  if (!texto.startsWith(MARCA_DE_ALCANCE)) return texto;
  const corte = texto.indexOf("\n\n");
  return corte === -1 ? texto : texto.slice(corte + 2);
}
