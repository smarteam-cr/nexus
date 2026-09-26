/**
 * lib/asistente/chat-de-seccion.test.ts — EL BOTÓN DE CADA SECCIÓN ABRE EL CHAT, EN LOS OCHO.
 *
 * Correr: `npx vitest run lib/asistente/chat-de-seccion.test.ts --project unit`.
 *
 * ── QUÉ PROTEGE ───────────────────────────────────────────────────────────────────────────────
 * Pedido de Elías: *«que en cada sección el botón de modificar con IA lo que haga sea abrir el
 * chat con la sección referenciada»*. Tres cosas tienen que seguir siendo ciertas:
 *
 *   1. **El botón vive en el motor, no en un workspace.** Ahí lo heredan los ocho documentos. El
 *      anterior estaba montado en DOS de ocho, y por eso seis secciones no tenían ningún control.
 *   2. ⛔ **No se pinta para el cliente.** La vista externa y el PDF montan el MISMO motor: si el
 *      botón apareciera sin proveedor, le estaríamos ofreciendo un chat interno al prospecto.
 *   3. **La referencia sobrevive al turno siguiente.** El hilo se re-manda entero al modelo, así
 *      que un alcance que solo viva en React deja de existir en el turno 2.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";

const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const MOTOR = "components/landing/LandingView.tsx";
const PROVEEDOR = "components/asistente/chat-de-seccion.tsx";
const PANEL = "components/clients/ProjectCanvasPanel.tsx";
const CHAT = "components/asistente/ChatDelAsistente.tsx";
const HERRAMIENTAS = "components/business-cases/SectionTools.tsx";
const ALCANCE = "lib/asistente/alcance.ts";
const GANTT = "components/canvas/TimelineGantt.tsx";
const CRONOGRAMA = "components/canvas/CronogramaCanvas.tsx";

describe("⭐ el botón vive en el motor, así que está en los ocho documentos", () => {
  it("el chrome de cada sección lo pinta", () => {
    /* La edición que la pone en rojo: mover el botón a un workspace. Volvería a estar en uno o
       dos de ocho, que es de donde venimos. */
    const src = leer(MOTOR);
    expect(src, "el motor dejó de ofrecer conversar sobre una sección").toContain(
      "ChatDeSeccionBtn",
    );
    expect(src, "el botón dejó de pedir el chat").toContain("abrirCon(");
  });

  it("⚠ y se pinta también en una sección OCULTA", () => {
    /* El resto del chrome se esconde cuando la sección está colapsada, y para «Limpiar» está bien.
       Para el chat no: «esta sección está apagada, ¿la reescribo y la muestro?» es una conversación
       legítima, y es justo la que no se podría tener.
       La edición que la pone en rojo: meter el botón adentro del `!collapsed`. */
    const src = leer(MOTOR);
    const i = src.indexOf("<ChatDeSeccionBtn");
    const j = src.indexOf("{!collapsed && renderOverlay", i);
    expect(i, "desapareció el botón del chrome").toBeGreaterThan(-1);
    expect(
      j,
      "el botón de conversar quedó DESPUÉS del gate de colapsado: una sección oculta se queda sin él",
    ).toBeGreaterThan(i);
  });
});

describe("⛔ y NO se le pinta al cliente", () => {
  it("sin proveedor, el botón no existe", () => {
    /* ⛔ EL MODO DE FALLA QUE ESTO IMPIDE: la vista externa y la impresión montan el MISMO
       `LandingView`. Si el botón se pintara siempre, el prospecto que abre la propuesta vería un
       botón para conversar con un asistente interno.
       La edición que la pone en rojo: sacar el `if (!disponible) return null`. */
    const motor = leer(MOTOR);
    const i = motor.indexOf("function ChatDeSeccionBtn");
    expect(i, "desapareció el componente del botón").toBeGreaterThan(-1);
    const cuerpo = motor.slice(i, motor.indexOf("\n}", i));
    expect(cuerpo.length, "la guarda no está mirando nada").toBeGreaterThan(100);
    expect(
      cuerpo.includes("if (!disponible) return null"),
      "el botón se pinta sin proveedor: aparecería en la vista del cliente y en el PDF",
    ).toBe(true);

    /* Y el respaldo del hook: fuera del proveedor devuelve `disponible: false`, no revienta. */
    expect(leer(PROVEEDOR)).toContain("disponible: false");
  });

  it("el proveedor lo monta el PANEL, que es interno", () => {
    expect(leer(PANEL), "el panel dejó de montar el proveedor: el botón desaparece de los ocho").toContain(
      "<ChatDeSeccionProvider",
    );
  });
});

describe("⭐ la sección referenciada sobrevive al turno siguiente", () => {
  it("el alcance viaja en el TEXTO, y la sección ADEMÁS como campo — las dos cosas", () => {
    /* ⚠ El hilo se re-manda entero al modelo en cada turno. Un alcance que viaje SOLO en un campo
       suelto —o que solo viva en el estado de React— existe en el turno 1 y desaparece en el 2: el
       modelo contestaría sobre otra sección sin que nadie entienda por qué. Por eso la línea en el
       texto no se negocia.

       ⚠ ACTUALIZADA EL 2026-08-22, con el motivo. Ahora el body TAMBIÉN lleva `seccion`, y no es
       una regresión: son dos cosas distintas. La línea es la MEMORIA del alcance; el campo es el
       GATILLO para que el servidor adjunte a ese turno el contenido COMPLETO de la sección. Hacía
       falta porque el contexto recorta cada sección a 1.000 caracteres y el chat contestaba «me
       llega recortado, no puedo confirmar cuál es el último ítem», sin ninguna forma de pedirlo.

       La edición que la pone en rojo sigue siendo la misma: reemplazar la línea del texto por el
       campo. */
    const src = leer(CHAT);
    const i = src.indexOf("JSON.stringify({");
    expect(i, "cambió la forma de enviar un turno").toBeGreaterThan(-1);
    const envio = src.slice(i, src.indexOf("});", i) + 3);
    expect(envio.length, "la guarda no está mirando nada").toBeGreaterThan(60);
    expect(
      envio.includes("lineaDeAlcance("),
      "el alcance dejó de ir en el texto: se pierde a partir del segundo mensaje",
    ).toBe(true);
    expect(
      envio.includes("seccion: { key:"),
      "sin el campo, el modelo no puede pedir el contenido completo de la sección del chip",
    ).toBe(true);
  });

  it("⚠ y la línea dice que es una PISTA, no un límite", () => {
    /* Si el chip se leyera como reja, el modelo se negaría a un pedido razonable sobre otra
       sección — y la persona va a escribir sobre otra sección sin cerrar el chip.
       ⚠ ACTUALIZADA en E4 P1 (2026-09-25), con esta razón: la línea se mudó a `lib/asistente/alcance.ts`
       (puro, para probarla; el proveedor la re-exporta) y suma la de una fase. Las dos lo dicen. */
    const src = leer(ALCANCE);
    expect(src).toContain("Es de dónde vino el pedido, no un límite: si lo que sigue habla de otra sección");
    expect(src).toContain("es de dónde vino el pedido, no un límite; si habla de otra fase");
    expect(leer(PROVEEDOR), "el proveedor dejó de re-exportar la línea").toContain('} from "@/lib/asistente/alcance";');
  });

  it("el chip se puede sacar sin cerrar el chat", () => {
    expect(leer(CHAT), "el alcance quedó pegado: no hay forma de hablar del documento entero").toContain(
      "soltarSeccion",
    );
  });
});

describe("⛔ el cuadrito que escribía al instante ya no está", () => {
  it("no queda una segunda forma de pedirle un cambio a una sección", () => {
    /* Elías eligió que el chat lo REEMPLACE, no que convivan. Dos caminos con dos comportamientos
       —uno con vista previa y otro sin— es lo que hacía que «pedir un cambio» significara cosas
       distintas según dónde tocaras.
       La edición que la pone en rojo: devolver la píldora ✨IA a `SectionTools`. */
    const src = leer(HERRAMIENTAS);
    expect(
      src.includes("regenerateBlock("),
      "volvió el cuadrito que reescribe la sección al instante, sin vista previa",
    ).toBe(false);
    /* Lo determinístico se queda: vaciar y borrar no necesitan una conversación. */
    expect(src, "se fue «Limpiar», que no es IA").toContain("🗑 Limpiar");
  });
});

describe("⭐ E4 P1 · el «IA» de una fase abre el chat del cronograma con esa fase señalada", () => {
  const sinComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^\s*\/\/.*$/gm, "");

  it("el Gantt lo pide al proveedor del chip, no a un diálogo", () => {
    /* La edición que la pone en rojo: volver a `onAssistPhase` (el diálogo de «Pedir cambio con IA»), o
       pintar el «IA» sin preguntar si hay chat (se ofrecería sin nadie que lo abra). */
    const gantt = sinComentarios(leer(GANTT));
    expect(gantt).toContain("useChatDeSeccion()");
    expect(gantt).toContain("chat.disponible &&");
    expect(gantt).toContain("abrirCon(");
    expect(gantt).toContain('tipo: "fase"');
    expect(gantt, "volvió el «IA» que abre el diálogo").not.toContain("onAssistPhase");
  });

  it("⛔ el cronograma monta SU proveedor, envolviendo el Gantt y el chat, con un `onAbrir` estable", () => {
    /* Sin el proveedor propio, el «IA» no abre nada: el del panel abre el cajón de los documentos, que
       en el cronograma no se monta (y dejaba colar el chip de otro documento). Una flecha inline como
       `onAbrir` rehace `abrirCon` en cada render. La edición que la pone en rojo: sacar el proveedor
       anidado, o pasar una flecha inline. */
    const canvas = sinComentarios(leer(CRONOGRAMA));
    const abre = canvas.indexOf("<ChatDeSeccionProvider onAbrir={abrirElChatDesdeUnaFase}>");
    const gantt = canvas.indexOf("<TimelineGantt", abre);
    const chat = canvas.indexOf("<ChatDelAsistente", gantt);
    const cierra = canvas.indexOf("</ChatDeSeccionProvider>", chat);
    expect(abre, "el cronograma no monta su proveedor del chip").toBeGreaterThan(-1);
    expect(gantt).toBeGreaterThan(abre);
    expect(chat).toBeGreaterThan(gantt);
    expect(cierra).toBeGreaterThan(chat);
    expect(canvas).toContain("<ChatDeSeccionDisponible cuando={canEdit && phases.length > 0} />");
    expect(canvas).toMatch(/const abrirElChatDesdeUnaFase = useCallback\(\(\) => \{\s*setAperturaAutomatica\(false\);\s*setChatAbierto\(true\);\s*\}, \[\]\);/);
    expect(canvas, "el Canvas volvió a abrir el diálogo desde una fase").not.toContain("onAssistPhase");
  });

  it("el chip dice que es una fase", () => {
    const chat = leer(CHAT);
    expect(chat).toContain("Sobre la fase «${seccionReferida.label}»");
    expect(chat).toContain("Dejar de hablar solo de esta fase");
  });
});
