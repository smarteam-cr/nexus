/**
 * UN SOLO CONTEXTO en el chat «Nexus» de la preventa (25 nov, Elías probando TEC · AE): un cambio a la página de La escala es
 * una vuelta más de LA conversación. Desde «✨ Mejorar con IA» de una sección se pregunta de la cuenta y se conversa (el chip
 * solo dice a qué parte va un cambio); desde «Nexus» de arriba se pide un cambio a la página; la propuesta queda en el hilo,
 * con lo que se hizo con cada cambio, y vuelve al recargar. Y las corridas del chat no salen como avisos «Listo: …». Sin
 * base: lo puro, y lo que el código tiene que decir.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AGENTES_DEL_CHAT, esDelChat, ETIQUETAS_DEL_CHAT, PREFIJO_DEL_IMPACTO, sinLasDelChat } from "@/lib/agents/corridas-del-chat";
import { marcarNexusSinLeer, nexusSinLeer, suscribirANexusSinLeer } from "@/lib/exploraciones/abrir-nexus";
import { SLUG_DEL_CHAT_DE_NEXUS } from "@/lib/nexus-chat/constantes";
import type { PropuestaDeNexus } from "@/lib/pedirle-a-nexus/contrato";
import { revisarLaPropuesta } from "@/lib/pedirle-a-nexus/veracidad";
import { comoSeLee, empiezaConUnCambio, leerElTurno, LISTO_SIN_CAMBIOS, mensajesValidos, pideUnCambioALaPagina, type MensajeDeLaConversacion } from "./conversacion";
import { estadosDeLaEscala, estadosParaGuardar, leerLaEscalaGuardada, loHabladoAntes, loQueDijoLaPersonaAntes, textoDeLaEscala } from "./escala-en-la-conversacion";
import { reconstruirLaConversacion, type SalidaDeLaVuelta } from "./guardada";
import { cuerpoDeLaVuelta } from "./lista";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const persona = (texto: string): MensajeDeLaConversacion => ({ de: "persona", texto });
const lee = (texto: string, escala: "chip" | "pagina" | null, antes: MensajeDeLaConversacion[] = []) => comoSeLee([...antes, persona(texto)], { escala });

describe("con el chip de La escala: se pregunta, se conversa y se piden cambios (Elías, 25 nov)", () => {
  it("⛔ una pregunta de la cuenta se responde: ya no es «Nexus no propone cambios»", () => {
    expect(lee("¿Qué información tienes sobre el problema principal del TEC AE?", "chip")).toBe("pregunta");
    expect(lee("Dime qué se dijo de Fundatec en las reuniones", "chip")).toBe("pregunta");
  });

  it("lo que no es pregunta es un cambio a esa parte, también dicho con amabilidad o como pregunta", () => {
    for (const t of [
      "acóplalo más a otro reto",
      "Quiero que el texto debajo del título se enfoque más en los dolores de la integración con Fundatec",
      "agrega un ítem más",
      "reuniones que trabajamos juntos, pon 12",
      "¿Me lo acortas?",
      "¿Puedes cambiar la cifra a 900 personas?",
      "Por favor, enfócalo en Admisiones",
      "El cliente dijo que son 900 personas, no 620",
    ])
      expect(lee(t, "chip"), t).toBe("cambio");
  });

  it("un «gracias» y un pedido de la cuenta siguen siendo lo de siempre", () => {
    expect(lee("gracias", "chip")).toBe("cortesia");
    expect(lee("Crea una tarea para llamar al gerente el viernes.", "chip")).toBe("pedido");
  });

  it("«Mejor…» como adverbio no es una orden, y «resumen» (el sustantivo) no es «resume»", () => {
    expect(empiezaConUnCambio("Mejor dicho, ¿qué dijeron de la cobranza?")).toBe(false);
    expect(empiezaConUnCambio("Resumen de la reunión: ¿qué se acordó?")).toBe(false);
    expect(empiezaConUnCambio("Mejóralo")).toBe(true);
    expect(empiezaConUnCambio("Resúmelo en una frase")).toBe(true);
  });
});

describe("sin chip, desde «Nexus» de arriba, con La escala armada", () => {
  it("⛔ pedir un cambio a la página del diagnóstico lo propone", () => {
    expect(lee("Cambia el titular a algo sobre Fundatec", "pagina")).toBe("cambio");
    expect(lee("Agrega un punto clave sobre el WhatsApp, que es crítico", "pagina")).toBe("cambio");
    expect(lee("¿Me puedes cambiar el problema principal para que hable de Fundatec?", "pagina")).toBe("cambio");
    expect(lee("Quita la cifra grande", "pagina")).toBe("cambio");
  });

  it("lo demás se lee como antes: preguntar, contar, pedir lo de la cuenta", () => {
    expect(lee("¿Qué dijeron de la cobranza?", "pagina")).toBe("pregunta");
    expect(lee("Crea una tarea para revisar el resumen", "pagina")).toBe("pedido");
    expect(lee("Cambia que el gerente ya no está en el resumen", "pagina")).not.toBe("cambio");
    expect(lee("Pierden 40 mil al mes en cartera", "pagina")).not.toBe("cambio");
    // Una orden sin parte de la página no es seguro un cambio: lo decide el modelo.
    expect(pideUnCambioALaPagina("Cambia el proveedor de pagos")).toBe(false);
  });

  it("sin página que cambiar (sin Resumen armado), nunca es un cambio", () => {
    expect(lee("Cambia el titular a algo sobre Fundatec", null)).not.toBe("cambio");
  });

  it("⛔ una orden sobre una parte de la página que se nombra gana sobre un pedido de la cuenta (revisión del 25 nov)", () => {
    expect(lee("Agrega un punto clave sobre las tareas manuales de admisiones", "chip")).toBe("cambio");
    expect(lee("Agrega un punto clave sobre las tareas manuales de admisiones", "pagina")).toBe("cambio");
    expect(lee("Cambia el diagnóstico de rendimiento para que hable de Fundatec", "chip")).toBe("cambio");
    // «El siguiente paso» nombra primero el de la cuenta: va a la cuenta (para un paso del recorrido, se dice su nombre).
    expect(lee("Cambia el siguiente paso del recorrido", "chip")).toBe("pedido");
    expect(lee("Cambia el nombre del paso de matrícula del recorrido", "chip")).toBe("cambio");
    // Sin parte de la página, sigue siendo de la cuenta.
    expect(lee("Crea una tarea para llamar al gerente el viernes.", "pagina")).toBe("pedido");
  });

  it("⛔ un pedido de la cuenta que nombra la página sigue siendo de la cuenta: gana lo que se nombra primero (segunda revisión del 25 nov)", () => {
    for (const modo of ["chip", "pagina"] as const) {
      for (const t of [
        "Agrega una tarea para revisar el resumen con el cliente",
        "Pon una tarea para actualizar la página",
        "Cambia el siguiente paso: presentar la escala al gerente",
        "Agrega a la guía una pregunta sobre el recorrido",
        "Quita la tarea de revisar el recorrido",
      ])
        expect(lee(t, modo), `${modo}: ${t}`).toBe("pedido");
      expect(lee("Agrega una nota: el resumen les gustó", modo), modo).not.toBe("cambio");
    }
    // «Resume la escala» pide una respuesta, no un cambio.
    expect(lee("Resume la escala", "pagina")).toBe("pregunta");
    // Con el chip, lo que nombra la cuenta lo decide el modelo.
    expect(lee("Ponlo en la guía", "chip")).toBe("duda");
  });

  it("⛔ después de una propuesta a la página, «Simplifícalo» sigue con ella (no es una pregunta que lee las reuniones)", () => {
    const propuesta: MensajeDeLaConversacion = { de: "nexus", es: "escala", texto: "[Propuse…]", vuelta: "v1" };
    const antes = [{ ...persona("Cambia el titular a algo sobre Fundatec"), es: "cambio" as const }, propuesta];
    expect(lee("Simplifícalo", "pagina", antes)).toBe("cambio");
    expect(lee("Redáctalo más corto", "pagina", antes)).toBe("cambio");
    expect(lee("Resúmelo en una línea", "pagina", antes)).toBe("cambio");
    expect(lee("Que suene menos técnico", "pagina", antes)).toBe("duda");
    expect(lee("gracias", "pagina", antes)).toBe("cortesia");
    // Lo que sigue y nombra la cuenta no es un cambio a la página.
    expect(lee("Agrégalo como tarea", "pagina", antes)).toBe("duda");
    expect(lee("Ponlo en la guía", "pagina", antes)).toBe("duda");
    // Sin la propuesta antes, «Resúmelo» sigue siendo un pedido de respuesta.
    expect(lee("Resúmelo en una línea", "pagina")).toBe("pregunta");
  });

  it("lo dudoso lo decide el modelo: puede devolver «cambio» solo si lo último lo puede ser", () => {
    const r = (t: string) => ({ content: [{ type: "text" as const, text: t, citations: null }] });
    const o = { destinos: new Set<string>(), valorValido: () => null, loQueDijo: [], puedePreguntar: true };
    expect(leerElTurno(r('{"tipo":"cambio"}'), { ...o, laPregunta: "Que hable más de Fundatec" })).toEqual({ tipo: "cambio", pedido: "Que hable más de Fundatec" });
    expect(leerElTurno(r('{"tipo":"cambio"}'), { ...o, laPregunta: null })).toEqual(LISTO_SIN_CAMBIOS);
  });
});

const PROPUESTA: PropuestaDeNexus = {
  pedido: "Enfócalo en Fundatec",
  cambios: [
    { clave: "r/negocio:tesis:n1", nombre: "El problema principal (la tesis)", seccion: "El problema principal", antes: "Meta no jala datos al CRM.", despues: "Fundatec no sincroniza con el CRM.", aMano: false, agregar: false },
    { clave: "r/punto:nuevo", nombre: "Un punto clave nuevo, entero", seccion: "Puntos clave", antes: null, despues: "Título: Seguimiento sin etapas\nQué pasa: Se pierden aspirantes.", aMano: false, agregar: true },
  ],
  descartados: [],
  nota: "Cambié el problema principal hacia Fundatec.",
  corrida: "run-p",
};
const ESCALA = { id: "v2", lugar: { pagina: "resumen" as const }, nombre: "Resumen", foco: "El problema principal", propuesta: PROPUESTA, estados: {} };

describe("la propuesta a La escala en la conversación", () => {
  it("su mensaje nombra lo propuesto (lo lee el modelo en la vuelta siguiente)", () => {
    const t = textoDeLaEscala(ESCALA);
    expect(t).toContain("Cambié el problema principal hacia Fundatec.");
    expect(t).toContain("«El problema principal» (Resumen)");
    expect(t).toContain("Fundatec no sincroniza con el CRM.");
    expect(textoDeLaEscala({ ...ESCALA, propuesta: { ...PROPUESTA, cambios: [], nota: null } })).toContain("No propuse cambios");
  });

  it("⛔ a quien escribe la página le llega solo el ida y vuelta de los cambios: ni lo que respondió Nexus de la cuenta ni lo contado para la nota", () => {
    const m: MensajeDeLaConversacion[] = [
      { ...persona("Son 900 personas, no 620"), es: "cambio" },
      { de: "nexus", es: "escala", texto: "[Propuse un cambio en «El problema principal» (Resumen) de La escala: …]", vuelta: "v1" },
      { ...persona("¿Qué dijo el gerente de TI?"), es: "consulta" },
      { de: "nexus", es: "respuesta", texto: "El gerente de TI frena el proyecto; usan Banner. En la reunión dijeron 1.000 al mes." },
      persona("El presupuesto es de 20.000"),
      { ...persona("gracias"), es: "cortesia" },
      persona("ponla"),
    ];
    expect(loHabladoAntes(m)).toBe("PERSONA: Son 900 personas, no 620\nNEXUS: [Propuse un cambio en «El problema principal» (Resumen) de La escala: …]");
    expect(loQueDijoLaPersonaAntes(m)).toBe("Son 900 personas, no 620");
    // La revisión de las cifras: el 900 que dijo la persona antes pasa; el 1.000 que respondió Nexus no.
    const pieza = { clave: "r/negocio:tamano:n9", nombre: "El tamaño del negocio", seccion: "El problema principal", valor: "620 personas en la campaña activa", tope: 300, agregar: false, quitable: true, aMano: false, conCita: true };
    const revisar = (despues: string) =>
      revisarLaPropuesta({ piezas: [pieza], propuesto: [{ clave: pieza.clave, despues }], pedido: "ponla", dichoAntes: loQueDijoLaPersonaAntes(m), delCliente: [], interno: [] });
    expect(revisar("900 personas en la campaña activa").cambios).toHaveLength(1);
    expect(revisar("1.000 personas en la campaña activa").cambios).toHaveLength(0);
  });

  it("vuelve al recargar en su mensaje, por su vuelta, con lo aplicado y lo descartado; lo pedido no va a la nota", () => {
    const pedido = persona("Enfócalo en Fundatec");
    const vuelta: SalidaDeLaVuelta = {
      tipo: "escala",
      escala: { ...ESCALA, estados: undefined as never },
      mensajes: [pedido],
      estados: { "r/negocio:tesis:n1": "aplicado", "r/punto:nuevo": "pendiente" },
    } as unknown as SalidaDeLaVuelta;
    (vuelta as unknown as { textoDeLaEscala: string }).textoDeLaEscala = textoDeLaEscala(ESCALA);
    const c = reconstruirLaConversacion("c1", [vuelta], 1)!;
    expect(c.mensajes[0]).toEqual({ ...pedido, es: "cambio" });
    expect(c.mensajes[1]).toMatchObject({ de: "nexus", es: "escala", vuelta: "v2", escala: { id: "v2", foco: "El problema principal", estados: { "r/negocio:tesis:n1": "aplicado" } } });
    // Una vuelta siguiente: la propuesta de antes vuelve en SU mensaje, por su vuelta.
    const despues = reconstruirLaConversacion(
      "c1",
      [vuelta, { tipo: "pregunta", preguntas: ["¿Al mes?"], mensajes: [{ ...pedido, es: "cambio" }, { de: "nexus", es: "escala", texto: "x", vuelta: "v2" }, persona("Pierden 40 mil")] }],
      2,
    )!;
    expect(despues.mensajes[1].escala?.propuesta).toEqual(PROPUESTA);
  });

  it("los estados: solo claves de esa propuesta; «pendiente» se guarda (después de «Deshacer») y al leer no cuenta", () => {
    expect(estadosParaGuardar(PROPUESTA, { "r/negocio:tesis:n1": "pendiente", "r/otra": "aplicado", "r/punto:nuevo": "raro" })).toEqual({ "r/negocio:tesis:n1": "pendiente" });
    expect(estadosDeLaEscala(PROPUESTA, { "r/negocio:tesis:n1": "pendiente", "r/punto:nuevo": "descartado" })).toEqual({ "r/punto:nuevo": "descartado" });
    expect(leerLaEscalaGuardada({ tipo: "escala", escala: { id: "v", lugar: { pagina: "nada" }, propuesta: PROPUESTA } })).toBeNull();
  });

  it("el envío lleva el chip (solo en un envío normal) y el mensaje de Nexus conserva su vuelta", () => {
    const m = [persona("Acóplalo a otro reto")];
    const escala = { lugar: { pagina: "resumen" as const }, foco: "El problema principal" };
    expect(cuerpoDeLaVuelta({ conversacion: "c1", mensajes: m, modo: "normal", pedidosDeLaCuenta: false, escala })).toMatchObject({ escala });
    expect(cuerpoDeLaVuelta({ conversacion: "c1", mensajes: m, modo: "contar", pedidosDeLaCuenta: false, escala })).not.toHaveProperty("escala");
    expect(mensajesValidos([{ de: "nexus", es: "escala", texto: "Propuse…", vuelta: "v2" }, persona("ponla")])?.[0]).toMatchObject({ vuelta: "v2" });
  });
});

describe("con el cajón cerrado, un punto rojo hasta que se abre (25 nov)", () => {
  it("se marca por exploración, avisa a quien mira y se va al abrir", () => {
    const avisos: number[] = [];
    const ev = new EventTarget();
    const ventana = globalThis as unknown as { window?: unknown };
    const antes = ventana.window;
    ventana.window = { addEventListener: ev.addEventListener.bind(ev), removeEventListener: ev.removeEventListener.bind(ev), dispatchEvent: ev.dispatchEvent.bind(ev) };
    try {
      const soltar = suscribirANexusSinLeer(() => avisos.push(1));
      marcarNexusSinLeer("exp-a", true);
      expect(nexusSinLeer("exp-a")).toBe(true);
      expect(nexusSinLeer("exp-b")).toBe(false);
      // Marcar dos veces no avisa dos veces (el botón no se vuelve a pintar de gusto).
      marcarNexusSinLeer("exp-a", true);
      marcarNexusSinLeer("exp-a", false);
      expect(nexusSinLeer("exp-a")).toBe(false);
      expect(avisos).toHaveLength(2);
      soltar();
    } finally {
      ventana.window = antes;
    }
  });

  it("⛔ lo marcan las respuestas que llegan con el cajón cerrado, y lo pinta cada botón que abre ese cajón", () => {
    const cajon = leer("components/exploraciones/HablarConNexus.tsx");
    expect(cajon).toContain("if (!abiertoAhora.current) marcarNexusSinLeer(exp.id, true);");
    expect(leer("components/exploraciones/PedirleANexus.tsx")).toContain("if (!abiertoAhora.current) marcarNexusSinLeer(exploracionId, true);");
    expect(leer("components/exploraciones/BotonDeNexus.tsx")).toContain("<PuntoDeNexus exploracionId={exploracionId} />");
    expect(leer("components/exploraciones/PaginaDeLaEscala.tsx")).toContain("<PuntoDeNexus exploracionId={exp.id} />");
  });
});

describe("las corridas del chat no salen como avisos «Listo: …» (Elías, 25 nov)", () => {
  it("se reconocen la vuelta, la respuesta, el chat de la cuenta, La escala y la revisión de una nota; un agente de verdad, no", () => {
    expect(esDelChat({ agentSlug: "exploracion-de-venta", stepLabel: "Hablar con Nexus" })).toBe(true);
    expect(esDelChat({ agentSlug: "exploracion-de-venta", stepLabel: "Nexus responde sobre la cuenta" })).toBe(true);
    expect(esDelChat({ agentSlug: "nexus-chat", stepLabel: "Chat de Nexus" })).toBe(true);
    expect(esDelChat({ agentSlug: "pedirle-a-nexus", stepLabel: "Pedirle a Nexus · La escala › Resumen" })).toBe(true);
    expect(esDelChat({ agentSlug: "exploracion-de-venta", stepLabel: `${PREFIJO_DEL_IMPACTO}La escala?` })).toBe(true);
    expect(esDelChat({ agentSlug: "exploracion-de-venta", stepLabel: "Armar el Resumen de La escala" })).toBe(false);
    expect(esDelChat({ agentSlug: null, stepLabel: null })).toBe(false);
  });

  it("⛔ las dos copias de la regla dicen lo mismo: el filtro de la base y la de las pruebas, fila por fila", () => {
    /* Un intérprete mínimo del `where` de Prisma, con la regla de SQL para los nulos (NOT IN y LIKE con null no pasan). Si
       alguien cambia una copia sin la otra, esto se pone rojo. Contra Postgres de verdad: nexus-en-la-preventa.int.test.ts. */
    type Fila = { agentSlug: string | null; stepLabel: string | null };
    type Donde = Record<string, unknown>;
    const campo = (f: Fila, k: string, c: unknown): boolean => {
      const v = f[k as keyof Fila];
      if (c === null) return v === null;
      const x = c as { notIn?: string[]; startsWith?: string; in?: string[] };
      if (v === null) return false;
      if (x.notIn) return !x.notIn.includes(v);
      if (x.in) return x.in.includes(v);
      if (x.startsWith !== undefined) return v.startsWith(x.startsWith);
      return v === c;
    };
    const pasa = (f: Fila, w: Donde): boolean =>
      Object.entries(w).every(([k, c]) =>
        k === "AND" ? (c as Donde[]).every((x) => pasa(f, x)) : k === "OR" ? (c as Donde[]).some((x) => pasa(f, x)) : k === "NOT" ? !pasa(f, c as Donde) : campo(f, k, c),
      );
    const filas: Fila[] = [
      ...["exploracion-de-venta", "nexus-chat", "pedirle-a-nexus", "handoff", null].flatMap((agentSlug) =>
        ["Hablar con Nexus", "Nexus responde sobre la cuenta", "¿La nota cambia La escala?", "Armar el Resumen de La escala", "Chat de Nexus", null].map((stepLabel) => ({ agentSlug, stepLabel })),
      ),
    ];
    for (const f of filas) expect(pasa(f, sinLasDelChat()), JSON.stringify(f)).toBe(!esDelChat(f));
  });

  it("⛔ los nombres salen de donde se crean las corridas, y el feed los deja afuera", () => {
    expect(AGENTES_DEL_CHAT).toContain(SLUG_DEL_CHAT_DE_NEXUS);
    expect(leer("lib/exploraciones/escala-con-nexus-server.ts")).toContain(`export const AGENTE_DE_PEDIRLE = "${AGENTES_DEL_CHAT[1]}";`);
    const chat = leer("lib/chat-de-nexus/conversacion-server.ts");
    expect(chat).toContain("stepLabel: ETIQUETAS_DEL_CHAT.respuesta,");
    expect(chat).toContain("stepLabel: ETIQUETAS_DEL_CHAT.vuelta,");
    expect(leer("lib/impacto/impacto-server.ts")).toContain("stepLabel: `${PREFIJO_DEL_IMPACTO}${entregable.nombre}?`,");
    expect(leer("app/api/agent-runs/route.ts")).toContain("AND: [sinLasDelChat()],");
    // Una columna vacía no deja la fila afuera (en SQL, NOT IN con null la sacaría).
    expect(JSON.stringify(sinLasDelChat())).toContain('{"agentSlug":null}');
    expect(JSON.stringify(sinLasDelChat())).toContain('{"stepLabel":null}');
    expect(Object.values(ETIQUETAS_DEL_CHAT)).toEqual(["Hablar con Nexus", "Nexus responde sobre la cuenta"]);
  });
});
