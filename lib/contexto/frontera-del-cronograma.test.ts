import { describe, expect, it } from "vitest";
import {
  MOTIVOS_DE_FUGA,
  VENTANA_DE_COPIA,
  avisoDeFronteraEnLaLinea,
  fugaEn,
  huellasDeFrontera,
  lineasConFrontera,
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

  it("un plazo en DÍAS también es un plazo (2026-09-24)", () => {
    /* «90 días» o «30 días» cruzaban la frontera igual que «12 semanas», y el detector solo conocía
       semanas y meses. La edición que la pone en rojo: sacar «días» de `PLAZO`. */
    for (const texto of [
      "Reactivar a los socios que no abren correos hace 90 días",
      "Seguimiento a los 30 días del go-live",
      "Entrega en 1 día hábil",
      "Plazo de 15 dias para la migración",
    ]) {
      expect(fugaEn(texto, h, "titulo"), texto).toBe(MOTIVOS_DE_FUGA.plazo);
      expect(fugaEn(texto, h, "nota"), texto).toBe(MOTIVOS_DE_FUGA.plazo);
    }
    // Un número que no cuenta días no es un plazo: «Día 1», «2 diagramas», «las 3 dimensiones».
    for (const texto of ["Sesión del día 1 del kick-off", "Revisar 2 diagramas de flujo", "Medir las 3 dimensiones del journey"]) {
      expect(fugaEn(texto, h, "titulo"), texto).toBeNull();
    }
  });

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
      /* 2026-09-24 (revisión del paso D3): cuando cruzan los dos, la marca del título lleva también
         el motivo de la nota. Guardar solo el del título hacía que, al corregirlo, el chip se fuera
         y la nota «Según la reunión de avance» llegara al Gantt del cliente sin aviso. */
      { campo: "titulo", motivo: MOTIVOS_DE_FUGA.fecha, motivoDeLaNota: MOTIVOS_DE_FUGA.cita },
    ]);
  });

  /* Se retiró «Pedir cambio con IA» (E4): su revisión de la propuesta completa (`fugasDeLaPropuesta`) se
     borró con él, y su caso con ella. Las líneas del chat siguen pasando por la frontera (abajo). */
});

describe("⭐ las líneas del acuerdo del CHAT pasan por la frontera (paso C, 2026-09-23)", () => {
  const OPS = [
    { op: "tarea.crear", phaseId: "f1", titulo: "Configurar journey de reactivación", semana: 0 },
    { op: "tarea.crear", phaseId: "f1", titulo: "Pago inicial de US$1.500 al proveedor", semana: 1 },
    { op: "tarea.renombrar", taskId: "t1", titulo: "Escribir a ana.perez@cliente.com por los accesos" },
    {
      op: "fase.crear",
      nombre: "La conexión del SDK con soporte de tarjetas dinámicas y objetos personalizados para mantener la trazabilidad",
      semanas: 1,
    },
    { op: "fase.renombrar", phaseId: "f2", nombre: "Pruebas y ajustes" },
    { op: "fase.duracion", phaseId: "f2", semanas: 3, nombre: "Pago de US$9.000" },
  ];
  const LINEAS = OPS.map((_, i) => `línea ${i + 1}`);

  it("⛔ una línea por operación, siempre: si no, el acuerdo pierde sus líneas y el botón", () => {
    /* `leerAcuerdo` descarta las líneas que no son una por operación. La edición que la pone en
       rojo: devolver solo las líneas marcadas, o fusionarlas. */
    const out = lineasConFrontera(LINEAS, OPS, h);
    expect(out).toHaveLength(OPS.length);
    out.forEach((l, i) => expect(l.startsWith(LINEAS[i]), `la línea ${i + 1} cambió de lugar`).toBe(true));
  });

  it("marca el monto, el correo y la frase copiada; no marca el título genérico ni lo que el cliente no lee", () => {
    /* La edición que la pone en rojo: sacar una operación del mapa de campos, o no llamar al
       detector. `fase.duracion` no escribe texto que lea el cliente: aunque traiga un `nombre`
       suelto, no se marca. */
    const out = lineasConFrontera(LINEAS, OPS, h);
    expect(out[0]).toBe("línea 1");
    expect(out[1]).toBe(`línea 2${avisoDeFronteraEnLaLinea(MOTIVOS_DE_FUGA.monto)}`);
    expect(out[2]).toBe(`línea 3${avisoDeFronteraEnLaLinea(MOTIVOS_DE_FUGA.correo)}`);
    expect(out[3]).toBe(`línea 4${avisoDeFronteraEnLaLinea(MOTIVOS_DE_FUGA.copia)}`);
    expect(out[4]).toBe("línea 5");
    expect(out[5]).toBe("línea 6");
    expect(out[1]).toContain("⚠ revisa: lo lee el cliente y trae un monto");
  });

  it("E4 P1: la NOTA de una fase también la lee el cliente: si copia una frase del material, «⚠ revisa…»", () => {
    /* `fase.nota` escribe el texto que el cliente lee debajo del nombre de la fase: se mide con la
       ventana de las NOTAS. La edición que la pone en rojo: sacar «fase.nota» del mapa de campos. */
    const ops = [
      {
        op: "fase.nota",
        phaseId: "f1",
        nota: "Importación inicial. La migración de pedidos históricos anteriores a 2024 queda fuera del alcance.",
      },
      { op: "fase.nota", phaseId: "f2", nota: "Configuramos el pipeline y lo probamos contigo." },
    ];
    const out = lineasConFrontera(["línea 1", "línea 2"], ops, h);
    expect(out[0]).toBe(`línea 1${avisoDeFronteraEnLaLinea(MOTIVOS_DE_FUGA.copia)}`);
    expect(out[1]).toBe("línea 2");
  });

  it("sin material, o con largos distintos, devuelve las líneas tal cual", () => {
    expect(lineasConFrontera(LINEAS, OPS, null)).toEqual(LINEAS);
    expect(lineasConFrontera(LINEAS, OPS, sinMaterial)).toEqual(LINEAS);
    expect(lineasConFrontera(LINEAS.slice(1), OPS, h)).toEqual(LINEAS.slice(1));
  });
});
