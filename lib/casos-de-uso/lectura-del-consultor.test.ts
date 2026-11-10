/**
 * «La lectura del consultor» (2026-11-09, Marco y Elías): la pregunta antes de generar, los ejemplos de un clic, lo dicho
 * por departamento y lo que se le pasó con su cita. lib/casos-de-uso/lectura-del-consultor.ts y
 * lib/exploraciones/lectura-del-consultor-pedido.ts.
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  areaPorPalabras,
  avisoDeLaLectura,
  citaEnLaFuente,
  limpiarCita,
  quienesHablan,
  renglonesDeLaLectura,
  yaLoDijo,
  ejemploDeUnPlan,
  ejemplosParaLaLectura,
  huellaDeLaLectura,
  sumarEjemplo,
  validarLecturaDelAgente,
} from "./lectura-del-consultor";
import { leerLaLectura, pedidoDeLaLectura, type ContextoDeLaLectura } from "@/lib/exploraciones/lectura-del-consultor-pedido";
import { bloqueDeLaLectura, claveDeInstrucciones, textoDeLaLectura } from "@/lib/exploraciones/notas-de-sesion";
import { leerPropuesta } from "@/lib/exploraciones/esquemas";

const TRANSCRIPCION = [
  "Fernando: Eh, mire, lo que más nos duele es que, este, los clientes nos escriben por WhatsApp y eso no queda registrado en ningún lado.",
  "Smarteam: Entiendo, ¿y cuántos son al mes?",
  "Fernando: Unos cuatrocientos, quinientos. Y aparte las encuestas de satisfacción las mandamos a mano por Google Forms, solo cuando hay una queja.",
].join("\n");
const CTX: ContextoDeLaLectura = {
  empresa: "Centauro",
  texto: "- Ventas: estandarizar el proceso comercial con la cotización\n- Soporte: centro de ayuda con WhatsApp conectado",
  areas: [
    { id: "1", nombre: "Ventas" },
    { id: "3", nombre: "Servicio" },
  ],
  fuentes: [{ id: "S1", etiqueta: "Reunión del 6 nov 2026: Diagnóstico de servicio", texto: TRANSCRIPCION }],
};
const respuesta = (input: unknown) => ({ content: [{ type: "tool_use", id: "t", name: "ordenar_la_lectura", input }] }) as unknown as Anthropic.Messages.Message;

describe("antes de generar: la pregunta, los ejemplos y el dictado", () => {
  it("un plan del cliente queda como ejemplo corto: sin «Quieren», hasta el «para» o la coma", () => {
    expect(ejemploDeUnPlan("Quieren migrar hacia un modelo account-driven para tener una visión 360 del cliente")).toBe("Migrar hacia un modelo account-driven");
    expect(ejemploDeUnPlan("Integrar WhatsApp al soporte y conservar trazabilidad de las solicitudes")).toBe("Integrar WhatsApp al soporte");
    expect(ejemploDeUnPlan("Automatizar la prospección multicanal con secuencias que combinen llamadas")).toBe("Automatizar la prospección multicanal con secuencias");
    expect(ejemploDeUnPlan("Más ventas")).toBeNull();
  });

  it("los ejemplos: primero los planes, después lo de la escala, sin repetir ni lo ya escrito, y con tope", () => {
    const e = ejemplosParaLaLectura({
      planes: ["Integrar WhatsApp al soporte y conservar trazabilidad", "Integrar WhatsApp al soporte, con plantillas"],
      porLaEscala: ["Estandarizar el proceso comercial en HubSpot", "Estructurar el centro de ayuda en HubSpot"],
      yaEscrito: "- Estructurar el centro de ayuda en HubSpot",
    });
    expect(e).toEqual(["Integrar WhatsApp al soporte", "Estandarizar el proceso comercial en HubSpot"]);
    expect(ejemplosParaLaLectura({ planes: [], porLaEscala: Array.from({ length: 10 }, (_, i) => `Caso de prueba número ${i}`) })).toHaveLength(6);
  });

  it("un clic suma el ejemplo como renglón, una sola vez", () => {
    expect(sumarEjemplo("", "Integrar WhatsApp al soporte")).toBe("- Integrar WhatsApp al soporte");
    expect(sumarEjemplo("- Ventas: cotización\n", "Integrar WhatsApp")).toBe("- Ventas: cotización\n- Integrar WhatsApp");
    expect(sumarEjemplo("- integrar whatsapp", "Integrar WhatsApp")).toBe("- integrar whatsapp");
  });

  it("Marco: si no puede decir los casos en general, quizás no entendió al cliente", () => {
    expect(avisoDeLaLectura("")).toContain("quizás falta entender al cliente");
    expect(avisoDeLaLectura("WhatsApp")).toContain("en general");
    expect(avisoDeLaLectura("Ventas: estandarizar el proceso comercial y la cotización")).toBeNull();
  });

  it("vive en la misma nota que las instrucciones de antes: lo guardado se lee igual y llega a los agentes", () => {
    const notas = { [claveDeInstrucciones("casos")]: "  Enfócate en Servicio  " };
    expect(textoDeLaLectura(notas)).toBe("Enfócate en Servicio");
    expect(bloqueDeLaLectura(notas)).toContain("=== LA LECTURA DEL CONSULTOR");
    expect(bloqueDeLaLectura(notas)).toContain("Enfócate en Servicio\n");
    expect(bloqueDeLaLectura({})).toBe("");
  });
});

describe("la cita: que esté de verdad en la transcripción", () => {
  it("tolera las muletillas, las repetidas y la puntuación que el modelo cambia al copiar", () => {
    const cita = citaEnLaFuente("Los clientes nos escriben por WhatsApp y eso no queda registrado en ningún lado", TRANSCRIPCION);
    expect(cita).toBe("los clientes nos escriben por WhatsApp y eso no queda registrado en ningún lado");
    // Se salta el «este» del medio y devuelve el tramo tal cual está en la transcripción.
    expect(citaEnLaFuente("mire lo que más nos duele es que los clientes nos escriben por WhatsApp", TRANSCRIPCION)).toBe(
      "mire, lo que más nos duele es que, este, los clientes nos escriben por WhatsApp",
    );
  });

  it("una frase que no está, o demasiado corta, no vale", () => {
    expect(citaEnLaFuente("Los clientes nos llaman por teléfono y eso queda en el CRM", TRANSCRIPCION)).toBeNull();
    expect(citaEnLaFuente("por WhatsApp", TRANSCRIPCION)).toBeNull();
  });
});

describe("al generar: lo dicho por departamento y lo que se le pasó", () => {
  it("el pedido lee lo que escribió el consultor y las reuniones, y pide la cita del cliente", () => {
    const p = pedidoDeLaLectura(CTX);
    const cuerpo = p.messages[0].content as string;
    expect(cuerpo).toContain("=== LO QUE ESCRIBIÓ EL CONSULTOR (por renglón) ===\nR1: Ventas: estandarizar");
    expect(cuerpo).toContain("--- S1 · Reunión del 6 nov 2026");
    expect(p.system).toContain("NO nombró");
    expect(p.system).toContain("Nunca una frase de alguien de Smarteam");
  });

  it("ordena por las áreas en juego, avisa lo que se le pasó con la cita de la transcripción y descarta lo que no se puede probar", () => {
    const l = leerLaLectura(
      respuesta({
        porRenglon: [
          { renglon: "R2", areaId: "3", casos: ["Centro de ayuda con WhatsApp conectado"] },
          { renglon: "R1", areaId: "1", casos: ["Estandarizar el proceso comercial con la cotización", "Estandarizar el proceso comercial con la cotización"] },
          { renglon: "R9", areaId: "1", casos: ["Un renglón que no existe"] },
        ],
        seLePaso: [
          { que: "Centralizar WhatsApp de soporte", areaId: "3", fuente: "S1", cita: "los clientes nos escriben por WhatsApp y eso no queda registrado en ningún lado" },
          { que: "Medir la satisfacción con encuestas automáticas", areaId: "3", fuente: "S1", cita: "las encuestas de satisfacción las mandamos a mano por Google Forms, solo cuando hay una queja" },
          { que: "Un tablero de la gerencia", areaId: "1", fuente: "S1", cita: "queremos ver todos los números en un solo tablero" },
          { que: "Algo sin reunión", areaId: "1", fuente: "S9", cita: "las encuestas de satisfacción las mandamos a mano" },
          { que: "Centro de ayuda con WhatsApp conectado", areaId: "3", fuente: "S1", cita: "los clientes nos escriben por WhatsApp y eso no queda registrado" },
        ],
      }),
      CTX,
      "run-1",
      new Date("2026-11-09T12:00:00Z"),
    );
    expect(l).not.toBeNull();
    expect(l!.porArea).toEqual([
      { areaId: "1", casos: ["Estandarizar el proceso comercial con la cotización"] },
      { areaId: "3", casos: ["Centro de ayuda con WhatsApp conectado"] },
    ]);
    expect(l!.seLePaso).toEqual([
      {
        que: "Medir la satisfacción con encuestas automáticas",
        areaId: "3",
        cita: "las encuestas de satisfacción las mandamos a mano por Google Forms, solo cuando hay una queja",
        reunion: "Reunión del 6 nov 2026: Diagnóstico de servicio",
      },
    ]);
    expect(l!.huella).toBe(huellaDeLaLectura(CTX.texto));
  });

  it("ningún renglón se pierde: el que el agente no ubicó va tal cual, al área que dicen sus palabras (Centauro, 9 nov)", () => {
    const texto = "- Ventas: estandarizar el proceso comercial de las tres marcas\n- Ventas: secuencias de prospección con llamada y WhatsApp\n- Soporte: centro de ayuda con reparto por tipo de solicitud";
    const l = validarLecturaDelAgente(
      { porRenglon: [{ renglon: "R1", areaId: "1", casos: ["Estandarizar el proceso comercial de las tres marcas"] }], seLePaso: [] },
      { ...CTX, texto },
      "r",
    )!;
    expect(l.porArea).toEqual([
      { areaId: "1", casos: ["Estandarizar el proceso comercial de las tres marcas", "secuencias de prospección con llamada y WhatsApp"] },
      { areaId: "3", casos: ["centro de ayuda con reparto por tipo de solicitud"] },
    ]);
  });

  it("los renglones: cada línea sin su viñeta y cada frase de un dictado; el pedido los numera", () => {
    expect(renglonesDeLaLectura("- Uno dos tres\n• Cuatro cinco. Seis siete ocho.\n\nnueve")).toEqual([
      { id: "R1", texto: "Uno dos tres" },
      { id: "R2", texto: "Cuatro cinco." },
      { id: "R3", texto: "Seis siete ocho." },
      { id: "R4", texto: "nueve" },
    ]);
    expect(pedidoDeLaLectura(CTX).messages[0].content as string).toContain("R2: Soporte: centro de ayuda con WhatsApp conectado");
    expect(areaPorPalabras("Soporte: centro de ayuda", CTX.areas)).toBe("3");
    expect(areaPorPalabras("Algo sin pistas", CTX.areas)).toBeNull();
  });

  it("lo que ya dijo con otras palabras no se le pasó", () => {
    const renglones = renglonesDeLaLectura(CTX.texto);
    expect(yaLoDijo("Centralizar WhatsApp de soporte en un solo lugar", renglones)).toBe(true);
    expect(yaLoDijo("Medir la satisfacción con encuestas automáticas", renglones)).toBe(false);
  });

  it("la cita se muestra sin horas, sin nombres y sin los turnos de una palabra de otro", () => {
    const hablan = quienesHablan("Marco Salas: Hola.\n00:11:40 Emiley Calvo Jiménez: Bueno.\nFernando: Ok.");
    expect([...hablan].sort()).toEqual(["Emiley Calvo Jiménez", "Fernando", "Marco Salas"]);
    expect(limpiarCita("controlar la cantidad de tiquetes por cliente. Yeah. Marco Salas: Okay. Emiley Calvo Jiménez: para ver si tenemos que aumentar la mensualidad", hablan)).toBe(
      "controlar la cantidad de tiquetes por cliente. Yeah. … para ver si tenemos que aumentar la mensualidad",
    );
    expect(limpiarCita("lo manda automáticamente un correo, ¿verdad? 00:11:44 Emiley Calvo Jiménez: Y no tienen que estar revisando", hablan)).toBe(
      "lo manda automáticamente un correo, ¿verdad? … Y no tienen que estar revisando",
    );
    // Revisión del 9 nov: una palabra con dos puntos dentro de la frase no es quien habla.
    expect(limpiarCita("Necesitamos: tener todos los tickets en un solo lugar", hablan)).toBe("Necesitamos: tener todos los tickets en un solo lugar");
  });

  it("un encabezado solo no es un renglón ni deja la lectura vacía; las palabras sueltas sí cuentan (revisión del 9 nov)", () => {
    expect(renglonesDeLaLectura("En ventas:\n- Cotizaciones\n- WhatsApp\n- 3")).toEqual([
      { id: "R1", texto: "Cotizaciones" },
      { id: "R2", texto: "WhatsApp" },
    ]);
    const l = validarLecturaDelAgente({ porRenglon: [], seLePaso: [] }, { ...CTX, texto: "En ventas:\n- Ventas: cotizaciones" }, "r")!;
    expect(l.porArea).toEqual([{ areaId: "1", casos: ["cotizaciones"] }]);
    // Lo guardado se vuelve a leer: ningún caso vacío tumba la lectura entera.
    expect(leerPropuesta({ lecturaDelConsultor: l }).lecturaDelConsultor).toEqual(l);
  });

  it("sin texto del consultor no hay lectura; cambiar una coma no la vuelve vieja", () => {
    expect(validarLecturaDelAgente({ porRenglon: [] }, { ...CTX, texto: " " }, "r")).toBeNull();
    expect(huellaDeLaLectura("Ventas: cotización.")).toBe(huellaDeLaLectura("ventas cotización"));
    expect(huellaDeLaLectura("Ventas: cotización")).not.toBe(huellaDeLaLectura("Servicio: cotización"));
  });

  it("se guarda en la propuesta y se lee de vuelta; una rota no rompe la lectura", () => {
    const l = validarLecturaDelAgente({ porRenglon: [{ renglon: "R1", areaId: "1", casos: ["Cotizar"] }], seLePaso: [] }, CTX, "r", new Date("2026-11-09T12:00:00Z"))!;
    expect(leerPropuesta({ lecturaDelConsultor: l }).lecturaDelConsultor).toEqual(l);
    expect(leerPropuesta({ lecturaDelConsultor: { roto: true } }).lecturaDelConsultor).toBeUndefined();
  });
});
