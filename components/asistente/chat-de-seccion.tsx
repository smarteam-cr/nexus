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
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface SeccionReferida {
  key: string;
  label: string;
  /**
   * ⭐ El texto del ÍTEM que se señaló, cuando el pedido salió del 💬 de una tarjeta y no del
   * botón de la sección entera.
   *
   * Es la misma cuerda que el campo `cita` de las operaciones (`lib/canvas/citas-de-documento.ts`):
   * el modelo recibe el texto que la persona señaló y lo devuelve como identificador. Por eso
   * señalar en pantalla y escribir «cambiá donde dice X» terminan en el MISMO mecanismo — no en
   * dos caminos que pueden divergir.
   */
  cita?: string;
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

/**
 * ⭐ Canal aparte para DECLARAR la disponibilidad, y existe por un bug que ya se pagó dos veces.
 *
 * `disponible` se calcula con estado que solo el workspace tiene (¿hay contenido?, ¿está en modo
 * edición?). Mientras era una PROP del proveedor, el proveedor tenía que montarse adentro del
 * workspace — y ahí el cajón del chat, que es hermano del workspace, quedaba FUERA y leía el
 * contexto por defecto: el chip nunca se fijaba y el modelo nunca sabía de qué sección se hablaba.
 * Visto en producción el 2026-08-22, en la Propuesta comercial.
 *
 * La forma correcta es la misma que ya usa el aplicador: **el que provee está arriba de todos, y
 * el que tiene el estado se REGISTRA desde adentro**. Por eso el dato viaja hacia arriba por este
 * contexto en vez de entrar por props hacia abajo.
 */
const CtxDeclarar = createContext<((v: boolean) => void) | null>(null);

export function ChatDeSeccionProvider({
  onAbrir,
  children,
}: {
  /** Lo que hace el panel al pedir el chat: abrir el cajón. */
  onAbrir: () => void;
  children: ReactNode;
}) {
  const [seccion, setSeccion] = useState<SeccionReferida | null>(null);
  const [disponible, setDisponible] = useState(false);

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
  return (
    <Ctx.Provider value={valor}>
      <CtxDeclarar.Provider value={setDisponible}>{children}</CtxDeclarar.Provider>
    </Ctx.Provider>
  );
}

/**
 * Declara si ESTE documento tiene chat. Se monta adentro del workspace, que es el único que sabe
 * la respuesta; sin él, el botón «Cambiar» no se pinta en ninguna sección.
 *
 * ⚠ Se apaga al desmontarse: cambiar de canvas o salir del modo edición tiene que apagar el botón,
 * y confiar en que el próximo montaje lo pise dejaría el botón vivo sobre un documento que ya no
 * está en pantalla.
 */
export function ChatDeSeccionDisponible({ cuando }: { cuando: boolean }) {
  const declarar = useContext(CtxDeclarar);
  useEffect(() => {
    if (!declarar) return;
    declarar(cuando);
    return () => declarar(false);
  }, [declarar, cuando]);
  return null;
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
 * ⭐ LA SECCIÓN QUE SE ESTÁ PINTANDO, para que un botón hondo sepa a qué pertenece.
 *
 * El 💬 de un ítem vive dentro de `SortableItems`, que está a tres o cuatro niveles del motor y
 * solo conoce el array que le pasaron. Para poder señalar necesita dos cosas que solo `LandingView`
 * tiene: de qué sección es, y qué listas puede tocar el chat.
 *
 * ⭐ **La lista se resuelve por IDENTIDAD DE REFERENCIA** contra ese `data`, no por un nombre que
 * cada renderer escriba a mano. Un nombre escrito a mano es un nombre que puede quedar viejo: el
 * día que alguien renombre la clave en el schema, el botón seguiría señalando la lista anterior y
 * el chat escribiría en otro lado. La referencia no puede quedar vieja.
 *
 * ⛔ Sin proveedor —vista del cliente, PDF— no hay señalado, igual que el botón de la sección.
 */
export interface SeccionEnPantalla {
  key: string;
  label: string;
  /** El MISMO objeto `data` que recibe el componente: la identidad de sus arrays es la llave. */
  data: Record<string, unknown>;
  /** El esquema que el CHAT alcanza. Lo que no está declarado ahí no se puede señalar. */
  schema: unknown;
}

const CtxEnPantalla = createContext<SeccionEnPantalla | null>(null);

export function SeccionEnPantallaProvider({
  valor,
  children,
}: {
  valor: SeccionEnPantalla;
  children: ReactNode;
}) {
  return <CtxEnPantalla.Provider value={valor}>{children}</CtxEnPantalla.Provider>;
}

export function useSeccionEnPantalla(): SeccionEnPantalla | null {
  return useContext(CtxEnPantalla);
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
  /* ⚠ La línea de la cita va DENTRO del bloque, antes de la línea en blanco que lo cierra: si
     quedara después, `mensajeSinAlcance` cortaría en el primer «\n\n» y el marcador se pintaría
     crudo arriba del mensaje de la persona — el bug que ya se vio en pantalla el 2026-08-22. */
  const cita = seccion.cita?.trim()
    ? `Señaló el punto que dice: «${seccion.cita.trim()}». Úsalo como \`cita\` para identificarlo.\n`
    : "";
  return (
    `${MARCA_DE_ALCANCE} «${seccion.label}» (${seccion.key})]\n` +
    cita +
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
