/**
 * lib/sessions/lectura-salida.test.ts — LA SALIDA ESTÁNDAR DE LA LECTURA DE SEGUIMIENTO (memoria de la cuenta, etapa 2).
 *
 * Qué se congela:
 *   1. la herramienta pide la salida estándar y NADA del formato viejo (ni `stageProgress` ni `actionItems`);
 *   2. un prospecto (o un cliente sin proyecto) no pide pedidos fuera de alcance;
 *   3. la lectura tolera un input parcial y devuelve null si el modelo no llamó a la herramienta;
 *   4. ⭐ una cita que no está TAL CUAL en lo que se mandó descarta el compromiso o el pedido (también la que cae
 *      después del tope de la transcripción, y la corta);
 *   5. un título de seguimiento con voseo cae al respaldo.
 *
 * Correr: `npx vitest run lib/sessions/lectura-salida.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import {
  ADENDA_DE_LA_HERRAMIENTA,
  HERRAMIENTA_DE_LA_LECTURA,
  SIN_RESUMEN,
  TOPE_DE_LA_TRANSCRIPCION,
  adendaDeLaHerramienta,
  fuenteDeLasCitas,
  herramientaDeLaLectura,
  leerSalidaDeLaLectura,
  verificarCitas,
} from "./lectura-salida";

const EQUIPO = ["lidia@smarteamcr.com", "ale@smarteamcr.com"];

function respuesta(input: unknown) {
  return { content: [{ type: "tool_use" as const, id: "t1", name: HERRAMIENTA_DE_LA_LECTURA, input }] } as unknown as Parameters<typeof leerSalidaDeLaLectura>[0];
}

describe("la herramienta", () => {
  it("pide la salida estándar y nada del formato viejo", () => {
    const h = herramientaDeLaLectura({ pideFueraDeAlcance: true, pidePresentacion: false, emailsDelEquipo: EQUIPO });
    const props = (h.input_schema as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(props).sort()).toEqual(["compromisos", "detectedTopics", "fueraDeAlcance", "minuta"]);
    const texto = JSON.stringify(h);
    expect(texto).not.toContain("stageProgress");
    expect(texto).not.toContain("actionItems");
    // ownerEmail solo puede ser alguien del equipo (o null).
    const items = (props.compromisos as { items: { properties: Record<string, { enum?: unknown[] }> } }).items.properties;
    expect(items.ownerEmail.enum).toEqual([...EQUIPO, null]);
  });

  it("un prospecto (o un cliente sin proyecto) no pide fuera de alcance, y la adenda lo dice", () => {
    const h = herramientaDeLaLectura({ pideFueraDeAlcance: false, pidePresentacion: false, emailsDelEquipo: EQUIPO });
    expect(Object.keys((h.input_schema as { properties: object }).properties)).not.toContain("fueraDeAlcance");
    expect(adendaDeLaHerramienta({ pideFueraDeAlcance: false })).toContain("no se piden pedidos fuera de alcance");
    expect(adendaDeLaHerramienta({ pideFueraDeAlcance: true })).toContain('"fueraDeAlcance"');
  });

  it("la fecha del diagnóstico solo se pide cuando hay uno sin presentar", () => {
    const con = herramientaDeLaLectura({ pideFueraDeAlcance: false, pidePresentacion: true, emailsDelEquipo: EQUIPO });
    expect(Object.keys((con.input_schema as { properties: object }).properties)).toContain("presentacionDiagnostico");
  });

  it("la adenda reemplaza el formato del prompt guardado y prohíbe stageProgress", () => {
    expect(ADENDA_DE_LA_HERRAMIENTA).toContain("reemplaza el formato JSON");
    expect(ADENDA_DE_LA_HERRAMIENTA).toContain('"actionItems" va en "compromisos"');
    expect(ADENDA_DE_LA_HERRAMIENTA).toContain('No hay "stageProgress"');
  });
});

describe("leer lo que devolvió", () => {
  it("sin llamar a la herramienta, null", () => {
    expect(leerSalidaDeLaLectura({ content: [{ type: "text", text: "{}" }] } as never)).toBeNull();
  });

  it("tolera un input parcial: lo que falta queda vacío", () => {
    const s = leerSalidaDeLaLectura(respuesta({ compromisos: [{ quien: "CLIENTE", que: "Enviar la base", tipo: "INSUMO", frenaElPlan: true, cita: "les mando la base el miércoles" }] }))!;
    expect(s.minuta.summary).toBe(SIN_RESUMEN);
    expect(s.minuta.agreements).toEqual([]);
    expect(s.compromisos).toHaveLength(1);
    expect(s.compromisos[0]).toMatchObject({ quien: "CLIENTE", frenaElPlan: true, ownerEmail: null });
    expect(s.fueraDeAlcance).toEqual([]);
  });

  it("cada lado lleva lo suyo: un correo en lo del cliente o un título en lo de Smarteam se ignoran", () => {
    const s = leerSalidaDeLaLectura(
      respuesta({
        minuta: { summary: "Se revisó el pipeline." },
        compromisos: [
          { quien: "CLIENTE", que: "Enviar la base", ownerEmail: "lidia@smarteamcr.com", tituloDeSeguimiento: "Recordarle a Ana que envíe la base", tipo: "INSUMO", frenaElPlan: false, cita: "x" },
          { quien: "SMARTEAM", que: "Mandar el tablero", ownerEmail: "Lidia@smarteamcr.com", tituloDeSeguimiento: "No va", tipo: "ACCION", frenaElPlan: false, cita: "y" },
        ],
      }),
    )!;
    expect(s.compromisos[0]).toMatchObject({ ownerEmail: null, tituloDeSeguimiento: "Recordarle a Ana que envíe la base" });
    expect(s.compromisos[1]).toMatchObject({ ownerEmail: "lidia@smarteamcr.com", tituloDeSeguimiento: null });
  });

  it("un título de seguimiento con voseo cae al respaldo (null: lo arma el código)", () => {
    const s = leerSalidaDeLaLectura(
      respuesta({ compromisos: [{ quien: "CLIENTE", que: "Enviar la base", tituloDeSeguimiento: "Avisale a Ana que mandá la base", tipo: "INSUMO", frenaElPlan: false, cita: "c" }] }),
    )!;
    expect(s.compromisos[0].tituloDeSeguimiento).toBeNull();
  });
});

describe("⭐ las citas se verifican contra lo que se mandó", () => {
  const transcript = "Ana Mora: Yo les mando la base de datos de clientes el miércoles sin falta.\nLidia Flores: Perfecto, y nosotros armamos el tablero para el viernes.";
  const overview = "Se acordó que el cliente entrega la base y Smarteam el tablero.";
  const fuente = fuenteDeLasCitas(transcript, overview);

  function salida(citas: string[]) {
    return leerSalidaDeLaLectura(
      respuesta({
        minuta: { summary: "ok" },
        compromisos: citas.map((cita, i) => ({ quien: i % 2 ? "SMARTEAM" : "CLIENTE", que: `Compromiso ${i}`, tipo: "ACCION", frenaElPlan: false, cita })),
        fueraDeAlcance: [{ huella: "docusign", pedido: "Integrar DocuSign", cita: "esto no lo dijo nadie en la reunión" }],
      }),
    )!;
  }

  it("acepta la cita literal (también con otras mayúsculas, tildes o comillas) y la del resumen de Gemini", () => {
    const r = verificarCitas(salida(["les mando la base de datos de clientes el miércoles", "«Perfecto, y NOSOTROS armamos el tablero»", "el cliente entrega la base"]), fuente);
    expect(r.validos.compromisos).toHaveLength(3);
    expect(r.descartadosPorCita.compromisos).toBe(0);
  });

  it("descarta la inventada, la corta (menos de 12 caracteres) y el pedido sin respaldo", () => {
    // «el viernes» sí aparece, pero con 10 caracteres no prueba nada: está en cualquier reunión.
    const r = verificarCitas(salida(["les mando el CRM entero mañana", "el viernes", "les mando la base de datos de clientes"]), fuente);
    expect(r.validos.compromisos.map((c) => c.que)).toEqual(["Compromiso 2"]);
    expect(r.descartadosPorCita).toEqual({ compromisos: 2, pedidos: 1 });
    expect(r.validos.fueraDeAlcance).toEqual([]);
  });

  it("una cita cortada con puntos suspensivos en el medio no está tal cual: se descarta", () => {
    const r = verificarCitas(salida(["les mando la base … el miércoles"]), fuente);
    expect(r.validos.compromisos).toEqual([]);
  });

  it("la que cae después del tope de la transcripción no estaba en lo que se mandó", () => {
    const larga = `${"bla ".repeat(TOPE_DE_LA_TRANSCRIPCION / 4)}y al final prometemos el informe ejecutivo completo`;
    const r = verificarCitas(salida(["prometemos el informe ejecutivo completo"]), fuenteDeLasCitas(larga, null));
    expect(r.validos.compromisos).toEqual([]);
    expect(r.descartadosPorCita.compromisos).toBe(1);
  });
});
