import { describe, expect, it } from "vitest";
import {
  MOTIVOS_DE_FUGA,
  VENTANA_DE_COPIA,
  fugaEn,
  fugasDeLaPropuesta,
  huellasDeFrontera,
  marcarFugas,
  normalizarParaFrontera,
} from "./frontera-del-cronograma";

/**
 * lib/contexto/frontera-del-cronograma.test.ts — EL DETECTOR DE LA FRONTERA.
 *
 * Lo que el cliente lee (títulos, notas, nombres de fase) contra el material INTERNO del «Contexto
 * del cronograma». Dos modos de falla, opuestos, y los dos se ven igual desde afuera («el aviso no
 * sirve»):
 *  · que NO marque las fugas reales del A/B de CAV (2026-09-23) — el rótulo solo no alcanzó;
 *  · que marque títulos legítimos — un aviso que salta siempre se aprende a ignorar.
 *
 * El material de acá es de mentira, pero con las mismas rachas que midió la validación: el
 * centinela S4 de la nota, y una frase de reunión con «organización de carpetas en Google Drive
 * para activos visuales» (9 palabras que un título legítimo puede repetir enteras).
 */

const MATERIAL = [
  "**Resumen:**\nSe revisó la organización de carpetas en Google Drive para activos visuales de correos. " +
    "El cliente pidió dejar la integración de WhatsApp con HubSpot para la segunda etapa. " +
    "Smarteam entrega la conexión del SDK con soporte de tarjetas dinámicas y objetos personalizados para " +
    "mantener la trazabilidad.",
  "### Nota: Alcance\nLa migración de pedidos históricos anteriores a 2024 queda FUERA del alcance.",
];
const h = huellasDeFrontera(MATERIAL);
const sinMaterial = huellasDeFrontera([]);

describe("⭐ las fugas reales de la salida B se marcan", () => {
  const FUGAS: Array<[string, string]> = [
    [
      "Importación inicial de la base de contactos. La migración de pedidos históricos anteriores a 2024 queda fuera del alcance.",
      MOTIVOS_DE_FUGA.copia,
    ],
    ["Incluye las cuatro encuestas de Service Hub confirmadas en kick-off.", MOTIVOS_DE_FUGA.cita],
    ["Formalizar la entrega del proyecto antes de la fecha límite del 31 de diciembre.", MOTIVOS_DE_FUGA.fecha],
    ["Presentación del equipo, confirmación del alcance y del cronograma de 12 semanas.", MOTIVOS_DE_FUGA.plazo],
  ];
  for (const [nota, motivo] of FUGAS) {
    it(`${motivo}: «${nota.slice(0, 50)}…»`, () => {
      expect(fugaEn(nota, h, "nota")).toBe(motivo);
    });
  }

  it("según la reunión, montos y correos también", () => {
    expect(fugaEn("Ajustar los segmentos según la reunión del jueves.", h)).toBe(MOTIVOS_DE_FUGA.cita);
    expect(fugaEn("Enviar la propuesta por $1.500", h, "titulo")).toBe(MOTIVOS_DE_FUGA.monto);
    expect(fugaEn("Cotizar 2.000 dólares de licencias", h, "titulo")).toBe(MOTIVOS_DE_FUGA.monto);
    expect(fugaEn("Escribir a ana.perez@cliente.com", h, "titulo")).toBe(MOTIVOS_DE_FUGA.correo);
    expect(fugaEn("Revisión el 2026-10-05", h, "titulo")).toBe(MOTIVOS_DE_FUGA.fecha);
  });

  it("un TÍTULO largo como una oración, copiado del material, también se marca", () => {
    /* 11 palabras seguidas de la nota S4: eso ya no es el nombre de una tarea, es la nota pegada. */
    expect(fugaEn("Migración de pedidos históricos anteriores a 2024 queda fuera del alcance", h, "titulo")).toBe(
      MOTIVOS_DE_FUGA.copia,
    );
  });
});

describe("⭐ los textos legítimos NO se marcan", () => {
  it("títulos de CAV que describen el trabajo con las palabras de la reunión", () => {
    for (const titulo of [
      "Sesión de kick-off: presentación del equipo",
      "Configurar pipeline de ventas",
      // Comparte 7 palabras seguidas con el material: con una ventana de 7 o menos, saltaría.
      "Organizar carpetas en Google Drive para activos visuales",
      /* Comparte las 9, y es el MISMO trabajo que el de arriba, sin nada interno (revisión del paso
         D1, 2026-09-23): la ventana de 8 lo marcaba como fuga por una palabra de diferencia. En un
         título, lo que lo hace fuga es un monto, una fecha, un plazo, un correo o la cita de la
         fuente —las reglas de arriba—, no que use las palabras de la reunión. */
      "Organización de carpetas en Google Drive para activos visuales",
      "Integración de WhatsApp con HubSpot",
      "Configurar journey de reactivación",
    ]) {
      expect(fugaEn(titulo, h, "titulo"), titulo).toBeNull();
    }
  });

  it("una nota que comparte 8 palabras con el material no es una copia", () => {
    /* La racha legítima más larga que midió el A/B en una nota fue de 8 palabras. */
    const nota = "Validar tarjetas dinámicas y objetos personalizados para mantener la sesión en la app.";
    expect(fugaEn(nota, h, "nota")).toBeNull();
    expect(VENTANA_DE_COPIA.nota.palabras).toBeGreaterThan(8);
  });

  it("sin material, el detector no corre: nada se marca", () => {
    for (const texto of [
      "La migración de pedidos históricos anteriores a 2024 queda fuera del alcance.",
      "Incluye las encuestas confirmadas en kick-off.",
      "Entrega antes del 31 de diciembre.",
      "Cronograma de 12 semanas.",
    ]) {
      expect(fugaEn(texto, sinMaterial, "nota"), texto).toBeNull();
    }
    expect(sinMaterial.activa).toBe(false);
  });
});

describe("normalización", () => {
  it("sin tildes, sin signos, en minúsculas", () => {
    expect(normalizarParaFrontera("¡Sesión de Kick-Off, ya!")).toBe("sesion de kick off ya");
  });
});

describe("marcar tareas y revisar propuestas", () => {
  it("marca el título primero y después la nota", () => {
    const marcadas = marcarFugas(
      [
        { title: "Migrar contactos", notes: "La migración de pedidos históricos anteriores a 2024 queda fuera del alcance." },
        { title: "Encuestas confirmadas en kick-off", notes: null },
        { title: "Configurar pipeline de ventas", notes: "Etapas y propiedades del pipeline." },
        // Las dos cruzan: manda el título, que es lo primero que lee el cliente.
        { title: "Cierre antes del 31 de diciembre", notes: "Según la reunión de avance." },
      ],
      h,
    );
    expect(marcadas.map((t) => t.fuga)).toEqual([
      { campo: "nota", motivo: MOTIVOS_DE_FUGA.copia },
      { campo: "titulo", motivo: MOTIVOS_DE_FUGA.cita },
      null,
      { campo: "titulo", motivo: MOTIVOS_DE_FUGA.fecha },
    ]);
  });

  it("en una propuesta, avisa solo lo NUEVO o CAMBIADO — lo que ya estaba no se vuelve a marcar", () => {
    const actuales = [
      {
        name: "Go-live",
        notes: null,
        tasks: [{ title: "Activar journeys", notes: "Antes de la fecha límite del 31 de diciembre." }],
      },
    ];
    const propuesta = {
      phases: [
        {
          name: "Go-live",
          notes: null,
          tasks: [
            { title: "Activar journeys", notes: "Antes de la fecha límite del 31 de diciembre." },
            { title: "Cerrar el proyecto", notes: "Entrega formal el 15 de enero." },
          ],
        },
        { name: "Revisión del 5 de octubre", notes: null, tasks: [] },
      ],
    };
    const avisos = fugasDeLaPropuesta(propuesta, actuales, h);
    expect(avisos).toEqual([
      "“Cerrar el proyecto”: la nota trae una fecha — el cliente lee títulos, notas y nombres de fase; " +
        "corrígela o descarta ese cambio antes de aplicar.",
      "“Revisión del 5 de octubre”: el nombre de la fase trae una fecha — el cliente lee títulos, notas y " +
        "nombres de fase; corrígelo o descarta ese cambio antes de aplicar.",
    ]);
    expect(fugasDeLaPropuesta(propuesta, actuales, sinMaterial)).toEqual([]);
  });
});
