/**
 * lib/asistente/un-solo-chat.test.ts — UN SOLO CHAT «NEXUS» (Elías, 24 nov: «todo debe abrir el mismo chat con la misma
 * interfaz»). Hasta ese día había cuatro caras: el cajón de los documentos, una ventana modal en la preventa, otra ventana
 * modal en los artefactos y el perfil de puesto, y un panel dentro de la tarjeta de un caso de uso. Ahora todas montan el
 * mismo marco (components/asistente/CajonDeNexus.tsx). Las piezas viven en archivos distintos y se separan en silencio
 * («copio la ventana de al lado»): por eso se mira el texto.
 *
 * Correr: `npx vitest run lib/asistente/un-solo-chat.test.ts --project unit`.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RAIZ, listarTsx } from "@/lib/ui/scan-source";

const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
/** Sin comentarios: mencionar una pieza vieja para explicar por qué se fue no es usarla. */
const codigo = (rel: string) =>
  leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\s*\}/g, "");

const MARCO = "components/asistente/CajonDeNexus.tsx";

describe("⭐ todos los chats montan el mismo marco", () => {
  it("el chat de los documentos, el de la preventa, el de La escala y el de un pedido usan CajonDeNexus", () => {
    /* La edición que la pone en rojo: volver a armar un chat con su propio <aside>, un Drawer o un Modal. */
    for (const f of [
      "components/asistente/ChatDelAsistente.tsx",
      "components/chat-de-nexus/PanelDeNexus.tsx",
      "components/exploraciones/PedirleANexus.tsx",
      "components/asistente/ChatDeUnPedido.tsx",
    ]) {
      const src = codigo(f);
      expect(src, `${f} dejó de montar el marco común`).toMatch(/<CajonDeNexus\b/);
      expect(src, `${f} volvió a armar su propio cajón`).not.toMatch(/<aside\b|createPortal\(|<Drawer\b|<Modal\b/);
    }
  });

  it("los «Mejorar con IA» de un solo pedido (artefactos, perfil de puesto, casos de uso) abren ese chat", () => {
    for (const f of ["components/ai/DocumentAssist.tsx", "components/roles/RoleWorkspace.tsx", "components/exploraciones/PasoCasosDeUso.tsx"]) {
      const src = codigo(f);
      expect(src, `${f} dejó de abrir el chat «Nexus»`).toMatch(/<ChatDeUnPedido\b/);
      expect(src, `${f} volvió a la ventana modal de antes`).not.toContain("AssistDialog");
    }
  });

  it("⛔ la propuesta de un pedido que llega con el chat cerrado se nota en el botón, y pedir otra no borra la de antes", () => {
    /* Revisión del 24 nov: la ventana vieja no se cerraba mientras Nexus pensaba; el chat sí. Sin aviso, la propuesta
       quedaba escondida; y borrarla al pedir otra hacía pagar dos veces si el segundo pedido fallaba. Desde el 25 nov
       (Elías: «en vez de un aviso, un punto rojo») se nota solo por el punto del botón, sin aviso flotante. */
    for (const f of ["components/ai/DocumentAssist.tsx", "components/roles/RoleWorkspace.tsx", "components/exploraciones/PasoCasosDeUso.tsx"]) {
      const src = codigo(f);
      expect(src, `${f}: el botón no avisa que hay una propuesta`).toContain("<PuntoDePropuesta />");
      expect(src, `${f}: volvió el aviso flotante`).not.toContain("avisarSiEstaCerrado");
      const i = src.search(/const (submit|submitAssist|pedir) = async/);
      expect(i, `${f}: no encuentro la función que pide`).toBeGreaterThan(-1);
      const resto = src.slice(i);
      const pedir = resto.slice(0, resto.search(/catch \{|catch \(e\)/));
      expect(pedir.length, `${f}: la guarda no está mirando la función que pide`).toBeGreaterThan(200);
      expect(pedir, `${f}: pedir otra borra la propuesta de antes`).not.toMatch(/set(Result|Assist|Propuesta)\(null\)/);
    }
  });

  it("⛔ con el chat cerrado, un punto rojo en el botón y ningún aviso flotante (25 nov, Elías)", () => {
    const pedido = codigo("components/asistente/ChatDeUnPedido.tsx");
    expect(pedido).not.toMatch(/toast\./);
    expect(pedido).toContain('className="h-2 w-2 shrink-0 rounded-full bg-danger-ink"');
    // El botón «Nexus» de la preventa lleva el mismo punto, y la conversación lo marca cuando responde con el cajón cerrado.
    expect(codigo("components/exploraciones/BotonDeNexus.tsx")).toContain("<PuntoDeNexus exploracionId={exploracionId} />");
    expect(codigo("components/exploraciones/HablarConNexus.tsx")).toContain("if (!abiertoAhora.current) marcarNexusSinLeer(exp.id, true);");
    expect(codigo("components/exploraciones/HablarConNexus.tsx")).toContain("if (abierto) marcarNexusSinLeer(exp.id, false);");
    expect(codigo("components/chat-de-nexus/PanelDeNexus.tsx")).toContain("alResponder?.();");
  });

  it("⛔ en la preventa, «✨ Mejorar con IA» de La escala abre LA conversación con la parte como chip (25 nov, un solo contexto)", () => {
    const cajon = codigo("components/exploraciones/HablarConNexus.tsx");
    // El pedido de un paso queda solo para La escala de la cuenta, donde no hay conversación.
    expect(cajon).toContain("{escala && !activo && (");
    // La conversación no se esconde al abrir desde La escala: es la misma.
    expect(cajon).not.toContain("abierto={abierto && !escala}");
    expect(cajon).toContain("escala={escala ? { lugar: escala.lugar, foco: escala.foco } : null}");
    expect(cajon).toContain("<PropuestaDeLaEscala");
  });

  it("⛔ en los cuatro chats, un envío que falla no pisa lo escrito mientras Nexus pensaba", () => {
    for (const f of [
      "components/asistente/ChatDelAsistente.tsx",
      "components/chat-de-nexus/PanelDeNexus.tsx",
      "components/exploraciones/PedirleANexus.tsx",
      "components/asistente/ChatDeUnPedido.tsx",
    ]) {
      expect(codigo(f), `${f} devuelve lo mandado pisando lo escrito`).toContain("devolverALaCaja(");
    }
  });

  it("en La escala, «nada se publica» queda siempre a la vista, entero (no en el subtítulo, que se corta)", () => {
    expect(codigo("components/exploraciones/PedirleANexus.tsx")).toContain('garantia="Nexus propone, tú aplicas; nada se publica."');
    expect(codigo(MARCO)).toContain('{garantia ? <p className="mt-0.5 text-[11px] text-fg-secondary">{garantia}</p> : null}');
  });

  it("⛔ la preventa ya no abre una ventana modal", () => {
    const cajon = codigo("components/exploraciones/HablarConNexus.tsx");
    expect(cajon).not.toMatch(/<Drawer\b/);
    expect(cajon).toMatch(/<PanelDeNexus\b/);
    expect(cajon).toMatch(/<PedirleANexus\b/);
  });

  it("⛔ nadie vuelve a la ventana vieja de «Mejorar con IA»", () => {
    /* AssistDialog se borró el 24 nov. Un import nuevo la tendría que volver a crear: la guarda lo dice antes. */
    expect(fs.existsSync(path.join(RAIZ, "components/ai/AssistDialog.tsx"))).toBe(false);
    const conElDialogo = ["app", "components"].flatMap((d) => listarTsx(d)).filter((rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8").includes("components/ai/AssistDialog"));
    expect(conElDialogo).toEqual([]);
  });
});

describe("el marco trae las buenas prácticas de un chat", () => {
  const marco = codigo(MARCO);

  it("un solo título, «Nexus»", () => {
    expect(marco).toContain('export const TITULO_DEL_CHAT = "Nexus";');
    expect(marco).toContain("{TITULO_DEL_CHAT}</h2>");
  });

  it("«Nueva conversación» va en la cabecera, junto a cerrar, siempre (apagada cuando no hay nada)", () => {
    /* La edición que la pone en rojo: volver a ponerla al pie del hilo, o mostrarla solo con mensajes. */
    const cabecera = marco.slice(marco.indexOf("<header"), marco.indexOf("</header>"));
    expect(cabecera).toContain("Nueva conversación");
    expect(cabecera).toContain('aria-label="Cerrar el chat"');
    expect(cabecera).toContain("disabled={nuevaConversacion.apagada}");
    expect(cabecera, "«Nueva conversación» volvió a aparecer solo a veces").not.toContain("nuevaConversacion &&");
    // Y todos los chats la pasan: es obligatoria en el marco.
    expect(marco).toContain("nuevaConversacion: { alHacer: () => void; apagada: boolean; titulo?: string };");
  });

  it("la caja va fija abajo: Enter envía, Shift+Enter baja de renglón, y un acento a medio componer no envía", () => {
    const iHilo = marco.indexOf("flex-1 space-y-3 overflow-y-auto");
    const iPie = marco.indexOf("{pie}");
    expect(iHilo).toBeGreaterThan(-1);
    expect(iPie, "la caja dejó de ir debajo del hilo").toBeGreaterThan(iHilo);
    expect(marco).toContain('if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || esTactil()) return;');
  });

  it("Escape cierra, pero no por debajo de un modal", () => {
    expect(marco).toContain('if (e.key !== "Escape") return;');
    expect(marco).toContain('document.querySelector(\'[aria-modal="true"]\')');
  });

  it("el hilo baja solo a lo último y «pensando…» se ve", () => {
    expect(marco).toContain('finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })');
    expect(marco).toContain('texto = "Nexus está pensando…"');
  });
});

describe("un solo nombre en los botones", () => {
  it("⛔ el botón del chat se llama «Nexus», no «Asistente»", () => {
    for (const f of [
      "components/clients/ProjectCanvasPanel.tsx",
      "components/canvas/CronogramaCanvas.tsx",
      "components/tareas/AsistenteDeTareas.tsx",
      "components/business-cases/BusinessCaseWorkspace.tsx",
    ]) {
      expect(codigo(f), `${f} volvió a decir «Asistente»`).not.toMatch(/>\s*Asistente\s*</);
    }
  });

  it("⛔ pedirle un cambio a Nexus es «Mejorar con IA» (no «Mejorar con el asistente» ni «Cambiar con el chat»)", () => {
    expect(codigo("components/exploraciones/AntesDeLaSesion.tsx")).not.toMatch(/>\s*Mejorar con el asistente\s*</);
    expect(codigo("components/clients/NovedadesDelDocumento.tsx")).not.toMatch(/>\s*Cambiar con el chat\s*</);
  });
});
