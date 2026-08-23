"use client";

/**
 * components/landing/senalar.tsx — EL 💬 DE CADA ÍTEM.
 *
 * ── QUÉ RESUELVE ────────────────────────────────────────────────────────────
 * Elías eligió los DOS caminos para decir qué cambiar: citar el texto en el chat, y señalarlo en
 * pantalla. Éste es el segundo, y termina en el MISMO mecanismo que el primero: señalar no escribe
 * nada — abre el chat con el texto del ítem puesto como `cita`. Un solo identificador, dos puertas.
 *
 * ── ⛔ SEÑALAR ABRE EL CHAT, NUNCA ESCRIBE ──────────────────────────────────
 * Ya existió una píldora ✨IA por sección que reescribía al instante, y se retiró el 2026-08-21 a
 * pedido de Elías: la lista numerada con casillas es la superficie donde se revisa, y saltearla es
 * exactamente lo que hace que un cambio aprobado no sea un cambio leído.
 *
 * ── POR QUÉ NO SE TOCA NINGÚN RENDERER ──────────────────────────────────────
 * El botón se monta desde `SortableItems`, que es el paso obligado de las 37 listas del motor. Si
 * cada sección tuviera que declarar el nombre de su lista, serían 37 nombres escritos a mano que
 * pueden quedar viejos. Acá la lista se deduce por IDENTIDAD DE REFERENCIA contra el `data` de la
 * sección: el array que llegó ES el array del documento, o no es ninguno.
 *
 * ── DÓNDE DEGRADA, Y ESTÁ BIEN QUE DEGRADE ──────────────────────────────────
 * Una lista DERIVADA (la que el renderer arma al vuelo: filtrados, `?? []`, normalizaciones) no
 * coincide por referencia, y una que el esquema del chat no declara no se puede tocar por chat.
 * En los dos casos **no hay botón**. Un botón que abre el chat sobre algo que el vocabulario no
 * alcanza es una promesa que se rompe en el segundo clic.
 */
import { useRef } from "react";
import { citaDelItem, listaDeLaSeccion, LARGO_DE_CITA } from "@/lib/canvas/senalar";
import { useChatDeSeccion, useSeccionEnPantalla } from "@/components/asistente/chat-de-seccion";

/**
 * El texto del campo que la persona tenía enfocado al apretar, si estaba dentro de este ítem.
 *
 * ⚠ Se lee en `pointerdown` y no en `click`: al apretar el botón, el campo pierde el foco ANTES
 * del click, así que en el click ya no hay nada que leer.
 */
function textoDelCampoEnfocado(raiz: HTMLElement | null): string | null {
  if (typeof document === "undefined" || !raiz) return null;
  const act = document.activeElement as HTMLElement | null;
  if (!act || act === document.body || !raiz.contains(act)) return null;
  const t =
    act instanceof HTMLInputElement || act instanceof HTMLTextAreaElement
      ? act.value
      : act.isContentEditable
        ? (act.textContent ?? "")
        : "";
  const limpio = t.trim().replace(/\s+/g, " ");
  return limpio ? limpio.slice(0, LARGO_DE_CITA) : null;
}

/**
 * El 💬 de un ítem. Se pinta solo cuando hay chat, la lista se resolvió y el ítem tiene texto.
 *
 * ⚠ `conHandle` corre el botón para que no se monte encima del ⠿ de arrastrar, que aparece a
 * partir del segundo ítem. Con un ítem solo, el ⠿ no existe y el 💬 ocupa su esquina — a
 * diferencia del handle, señalar tiene sentido con un solo ítem.
 */
export function BotonDeSenalar({
  items,
  index,
  conHandle,
}: {
  items: unknown[];
  index: number;
  conHandle: boolean;
}) {
  const sec = useSeccionEnPantalla();
  const { disponible, abrirCon } = useChatDeSeccion();
  const boton = useRef<HTMLButtonElement | null>(null);
  const enfocado = useRef<string | null>(null);

  const lista = listaDeLaSeccion(sec, items);
  const delItem = citaDelItem(items[index]);
  if (!disponible || !sec || !lista || !delItem) return null;

  return (
    <button
      ref={boton}
      type="button"
      className="stl-senalar"
      style={{ left: conHandle ? 40 : 6 }}
      title="Pedirle un cambio al asistente sobre esto"
      aria-label={`Conversar sobre «${delItem}»`}
      onPointerDown={() => {
        enfocado.current = textoDelCampoEnfocado(boton.current?.parentElement ?? null);
      }}
      onClick={() => {
        /* El campo enfocado gana: si la persona estaba escribiendo en el detalle de la tarjeta,
           el pedido es sobre ESE campo y no sobre el título que la nombra. */
        abrirCon({ key: sec.key, label: sec.label, cita: enfocado.current || delItem });
        enfocado.current = null;
      }}
    >
      💬
    </button>
  );
}
