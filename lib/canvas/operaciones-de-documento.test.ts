/**
 * lib/canvas/operaciones-de-documento.test.ts — EL VOCABULARIO TOCA LO QUE NOMBRA, Y NADA MÁS.
 *
 * Correr: `npx vitest run lib/canvas/operaciones-de-documento.test.ts --project unit`.
 *
 * ── QUÉ PROTEGE ───────────────────────────────────────────────────────────────────────────────
 * Este módulo existe para que editar un documento con IA deje de significar «reescribirlo entero».
 * Lo que hay que defender es exactamente eso: que una operación NO pueda romper lo que no nombró.
 * Los cuatro modos de falla, los cuatro silenciosos:
 *
 *   1. **Escribir sobre estado curado que vive fuera del schema** — las marcas «ya la pregunté»
 *      del plan de sesiones, los logos de la portada, el enlace del botón de cierre.
 *   2. **Escribir en la fila equivocada** porque alguien reordenó entre acordar y aplicar. Es el
 *      único modo de falla del diseño que produce datos CREÍBLES y equivocados.
 *   3. **Aprobar a ciegas**: una línea que dice «se reescribe la introducción» sin decir con qué.
 *   4. **Borrar una sección de la plantilla** o dejar el documento sin portada.
 */
import { describe, it, expect } from "vitest";
import {
  OPERACIONES_DE_DOCUMENTO_VALIDAS,
  anclaDeRuta,
  aplicarOperacionesDeDocumento,
  dependenciasDeOperacionesDeDocumento,
  describirOperacionesDeDocumento,
  esOperacionDeDocumento,
  vacioDeSchema,
  type OperacionDeDocumento,
  type SeccionActual,
} from "./operaciones-de-documento";

const str = { type: "string" } as const;

/** El schema del plan de sesiones de Exploración, recortado — el caso que decide el diseño. */
const SCHEMA_SESIONES = {
  type: "object",
  properties: {
    intro: str,
    sesiones: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo: str,
          objetivo: str,
          preguntas: {
            type: "array",
            items: { type: "object", properties: { q: str, repregunta: str } },
          },
        },
      },
    },
  },
} as const;

/** El `data` real: con las marcas `hecha` ANIDADAS y FUERA del schema, como en producción. */
const DATA_SESIONES = () => ({
  intro: "Tres sesiones",
  sesiones: [
    {
      titulo: "Descubrimiento",
      objetivo: "Entender el proceso",
      preguntas: [
        { q: "¿Quién aprueba?", repregunta: "", hecha: "si" },
        { q: "¿Con qué frecuencia?", repregunta: "", hecha: "no" },
      ],
    },
    { titulo: "Cierre", objetivo: "Acordar el plan", preguntas: [{ q: "¿Fechas?", hecha: "si" }] },
  ],
});

const CAPACIDADES = { puedeOcultar: true, puedeCrear: true };

function seccion(over: Partial<SeccionActual> = {}): SeccionActual {
  return {
    id: "sec-1",
    key: "sesiones",
    label: "Plan de sesiones",
    data: DATA_SESIONES(),
    schema: SCHEMA_SESIONES,
    oculta: false,
    esCreada: false,
    movible: true,
    ...over,
  };
}

const correr = (ops: OperacionDeDocumento[], secs: SeccionActual[] = [seccion()]) =>
  aplicarOperacionesDeDocumento(secs, ops, CAPACIDADES);

describe("⛔ el vocabulario y el ejecutor no pueden divergir", () => {
  it("toda operación de la lista la reconoce el validador", () => {
    for (const op of OPERACIONES_DE_DOCUMENTO_VALIDAS) {
      expect(esOperacionDeDocumento({ op }), `${op} no se reconoce`).toBe(true);
    }
    expect(esOperacionDeDocumento({ op: "seccion.pintar" })).toBe(false);
    expect(esOperacionDeDocumento({ op: "fase.duracion" })).toBe(false);
  });
});

describe("⭐ una operación toca lo que nombra, y nada más", () => {
  it("cambiar un campo deja el resto BYTE POR BYTE igual", () => {
    const antes = seccion();
    const original = structuredClone(antes.data);
    const { plan, rechazadas } = correr(
      [{ op: "seccion.campo", key: "sesiones", campo: "intro", valor: "Cuatro sesiones" }],
      [antes],
    );
    expect(rechazadas).toEqual([]);
    const escritura = plan.find((p) => p.tipo === "data");
    const data = escritura!.data as ReturnType<typeof DATA_SESIONES>;
    expect(data.intro).toBe("Cuatro sesiones");
    expect(data.sesiones).toEqual((original as ReturnType<typeof DATA_SESIONES>).sesiones);
  });

  it("⭐ y las marcas «ya la pregunté» SOBREVIVEN, aunque estén anidadas y fuera del schema", () => {
    /* ⛔ ESTE ES EL TEST QUE JUSTIFICA EL DISEÑO. Exploración quedó fuera del assist de documentos
       porque el camino viejo reconstruye la data desde el schema y el merge que repone lo curado
       solo alcanza el PRIMER nivel: una propuesta que tocara `sesiones` borraba TODAS las marcas,
       sin aviso.
       Una operación no reconstruye nada — lee, clona, escribe la hoja que nombró. Por eso el
       vocabulario destraba Exploración en vez de esquivarla.
       La edición que la pone en rojo: hacer que el ejecutor arme la data con `vacioDeSchema` y le
       copie encima lo pedido. */
    const { plan } = correr([
      { op: "seccion.campo", key: "sesiones", campo: "sesiones.0.objetivo", valor: "Mapear el flujo", ancla: "Descubrimiento" },
    ]);
    const data = plan.find((p) => p.tipo === "data")!.data as ReturnType<typeof DATA_SESIONES>;
    expect(data.sesiones[0].objetivo).toBe("Mapear el flujo");
    expect(data.sesiones[0].preguntas[0]).toHaveProperty("hecha", "si");
    expect(data.sesiones[0].preguntas[1]).toHaveProperty("hecha", "no");
    expect(data.sesiones[1].preguntas[0]).toHaveProperty("hecha", "si");
  });

  it("⛔ y NO se puede escribir directamente sobre lo que el schema no declara", () => {
    /* La otra mitad: `hecha` está fuera del schema A PROPÓSITO, para que el agente no pueda marcar
       una pregunta como hecha ni por error. La ruta se resuelve contra el SCHEMA, así que ese
       campo es inalcanzable por construcción — no por un pedido en el prompt.
       La edición que la pone en rojo: que el resolver camine la data cuando el schema no tiene el
       campo. Es la tolerancia de una línea que alguien va a escribir la primera vez que una ruta
       legítima sea rechazada. */
    const { rechazadas, plan } = correr([
      { op: "seccion.campo", key: "sesiones", campo: "sesiones.0.preguntas.0.hecha", valor: "no" },
    ]);
    expect(plan.filter((p) => p.tipo === "data")).toEqual([]);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].motivo).toContain("hecha");
  });

  it("⛔ una lista no se puede escribir como si fuera un texto", () => {
    const { rechazadas } = correr([
      { op: "seccion.campo", key: "sesiones", campo: "sesiones", valor: "tres" },
    ]);
    expect(rechazadas[0].motivo).toContain("lista");
  });

  it("⚠ y una posición que no existe se dice, no se inventa", () => {
    const { rechazadas } = correr([
      { op: "seccion.campo", key: "sesiones", campo: "sesiones.9.titulo", valor: "X", ancla: "" },
    ]);
    expect(rechazadas[0].motivo).toMatch(/2 ítems/);
  });
});

describe("⚠ el ancla — escribir en la fila equivocada es el peor error posible", () => {
  it("sale del valor ACTUAL, no de lo que diga el modelo", () => {
    const s = seccion();
    expect(anclaDeRuta(s.schema, s.data, "sesiones.1.titulo")).toBe("Cierre");
    expect(anclaDeRuta(s.schema, s.data, "sesiones.0.preguntas.1.q")).toBe("¿Con qué frecuencia?");
    // Sin lista de por medio no hace falta: nombrar un campo de primer nivel no depende del orden.
    expect(anclaDeRuta(s.schema, s.data, "intro")).toBeNull();
  });

  it("⛔ si el ítem se movió entre acordar y aplicar, la operación se CAE con su motivo", () => {
    /* El escenario real: el chat acuerda «quitá la sesión de Cierre» (posición 1), el libro lo
       arrastra, y mientras tanto alguien reordena a mano en el editor. Sin ancla se borraría la
       sesión equivocada — plausible, silencioso, y revisado como correcto.
       La edición que la pone en rojo: volver el chequeo condicional (`if (o.ancla && ...)`), que
       es lo que parece natural y apaga la protección para toda operación sin ancla. */
    const { rechazadas, plan } = correr([
      { op: "seccion.item.borrar", key: "sesiones", lista: "sesiones", posicion: 1, ancla: "Descubrimiento" },
    ]);
    expect(plan.filter((p) => p.tipo === "data")).toEqual([]);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].motivo).toContain("reordenó");
  });

  it("⛔ y si el ancla NO SE PUEDE calcular, tampoco se toca", () => {
    /* ⚠ ESTE CASO ES EL QUE HACE QUE EL CHEQUEO NO PUEDA SER CONDICIONAL, y se descubrió rompiendo
       la guarda: con `if (ancla && ancla !== actual)` el test de arriba seguía en verde, porque
       ahí el ancla SÍ se puede calcular. La protección se apagaba solo en el caso que nadie prueba
       — un ítem sin ningún texto con contenido, que es justo donde no hay forma de saber si es el
       que se acordó.
       La edición que la pone en rojo: volver el chequeo condicional. */
    const sinTexto = seccion({
      data: { intro: "", sesiones: [{ titulo: "", objetivo: "", preguntas: [] }] },
    });
    const { rechazadas, plan } = correr(
      [{ op: "seccion.item.borrar", key: "sesiones", lista: "sesiones", posicion: 0, ancla: "Lo que sea" }],
      [sinTexto],
    );
    expect(plan.filter((p) => p.tipo === "data")).toEqual([]);
    expect(rechazadas).toHaveLength(1);
  });

  it("y con el ancla correcta, se aplica", () => {
    const { rechazadas, plan } = correr([
      { op: "seccion.item.borrar", key: "sesiones", lista: "sesiones", posicion: 1, ancla: "Cierre" },
    ]);
    expect(rechazadas).toEqual([]);
    const data = plan.find((p) => p.tipo === "data")!.data as ReturnType<typeof DATA_SESIONES>;
    expect(data.sesiones).toHaveLength(1);
    expect(data.sesiones[0].titulo).toBe("Descubrimiento");
  });

  it("⚠ UNA operación que se cae no arrastra a las demás", () => {
    const { rechazadas, plan } = correr([
      { op: "seccion.campo", key: "sesiones", campo: "intro", valor: "Dos sesiones" },
      { op: "seccion.item.borrar", key: "sesiones", lista: "sesiones", posicion: 0, ancla: "Otro" },
    ]);
    expect(rechazadas).toHaveLength(1);
    const data = plan.find((p) => p.tipo === "data")!.data as ReturnType<typeof DATA_SESIONES>;
    expect(data.intro).toBe("Dos sesiones");
    expect(data.sesiones).toHaveLength(2);
  });
});

describe("⭐ lo que se LEE es lo que se EJECUTA", () => {
  it("la línea de un cambio de contenido CONTIENE el texto que se va a escribir", () => {
    /* ⛔ La edición que la pone en rojo: cambiar la plantilla a «se reescribe la introducción».
       Es el cambio de «la cajita quedó muy larga» que alguien va a hacer la primera semana, y
       convierte la aprobación en un cheque en blanco: la persona marca una casilla sin saber qué
       texto está aprobando. */
    const [linea] = describirOperacionesDeDocumento(
      [seccion()],
      [{ op: "seccion.campo", key: "sesiones", campo: "intro", valor: "Cuatro sesiones de trabajo" }],
    );
    expect(linea).toContain("Cuatro sesiones de trabajo");
    expect(linea).toContain("Plan de sesiones");
  });

  it("hay una línea por operación, siempre", () => {
    const ops: OperacionDeDocumento[] = [
      { op: "seccion.campo", key: "sesiones", campo: "intro", valor: "x" },
      { op: "seccion.ocultar", key: "sesiones" },
      { op: "seccion.crear", tipo: "tabla", titulo: "Comparativa" },
    ];
    expect(describirOperacionesDeDocumento([seccion()], ops)).toHaveLength(ops.length);
  });

  it("⚠ y lo que DESTRUYE se lee distinto", () => {
    const lineas = describirOperacionesDeDocumento(
      [seccion()],
      [{ op: "seccion.vaciar", key: "sesiones" }, { op: "seccion.borrar", key: "sesiones" }],
    );
    for (const l of lineas) expect(l.startsWith("⚠")).toBe(true);
  });
});

describe("⛔ la estructura del documento no se puede romper", () => {
  it("una sección de la PLANTILLA no se borra — se oculta", () => {
    const { rechazadas, plan } = correr([{ op: "seccion.borrar", key: "sesiones" }]);
    expect(plan.filter((p) => p.tipo === "borrar")).toEqual([]);
    expect(rechazadas[0].motivo).toContain("ocultar");
  });

  it("y una CREADA sí", () => {
    const s = seccion({ key: "custom:tabla:abc", esCreada: true, label: "Comparativa" });
    const { rechazadas, plan } = correr([{ op: "seccion.borrar", key: "custom:tabla:abc" }], [s]);
    expect(rechazadas).toEqual([]);
    expect(plan).toContainEqual({ tipo: "borrar", sectionId: "sec-1" });
  });

  it("⛔ una sección estructural no se oculta ni se mueve", () => {
    const portada = seccion({ key: "portada", label: "Portada", movible: false });
    const { rechazadas } = correr(
      [{ op: "seccion.ocultar", key: "portada" }, { op: "seccion.mover", key: "portada", posicion: 3 }],
      [portada],
    );
    expect(rechazadas).toHaveLength(2);
  });

  it("⛔ y en un documento SIN puerta de ocultar, la operación se rechaza en vez de fingir", () => {
    /* ⚠ Ocultar tiene tres mecanismos en el motor, y uno vive en otra columna. Un ejecutor que
       asumiera una sola puerta escribiría, en ese documento, en la que nadie lee: el hilo diría
       «aplicado» y el cliente seguiría viendo la sección.
       La edición que la pone en rojo: ignorar `capacidades.puedeOcultar`. */
    const r = aplicarOperacionesDeDocumento(
      [seccion()],
      [{ op: "seccion.ocultar", key: "sesiones" }],
      { puedeOcultar: false, puedeCrear: true },
    );
    expect(r.plan).toEqual([]);
    expect(r.rechazadas[0].motivo).toContain("no se pueden ocultar");
  });
});

describe("⚠ agregar un ítem no puede colar campos que el schema no declara", () => {
  it("una propiedad desconocida se RECHAZA, no se descarta en silencio", () => {
    /* Descartarla en silencio haría que la persona apruebe una línea que prometía algo que no
       pasó. Es la misma asimetría de siempre: mejor decir que no, que hacer menos de lo dicho. */
    const { rechazadas } = correr([
      { op: "seccion.item.agregar", key: "sesiones", lista: "sesiones", valores: { titulo: "Nueva", inventado: "x" } },
    ]);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].motivo).toContain("inventado");
  });

  it("y el ítem nace con TODOS los campos del schema, aunque vengan vacíos", () => {
    /* Un ítem al que le falta una clave rompe el render del componente, que lee sus campos sin
       preguntar. */
    const { plan } = correr([
      { op: "seccion.item.agregar", key: "sesiones", lista: "sesiones", valores: { titulo: "Nueva" } },
    ]);
    const data = plan.find((p) => p.tipo === "data")!.data as ReturnType<typeof DATA_SESIONES>;
    const nueva = data.sesiones[2] as unknown as Record<string, unknown>;
    expect(Object.keys(nueva).sort()).toEqual(["objetivo", "preguntas", "titulo"]);
    expect(nueva.titulo).toBe("Nueva");
  });
});

describe("⚠ varias operaciones sobre la misma sección son UN solo guardado", () => {
  it("tres cambios producen una escritura", () => {
    const { plan } = correr([
      { op: "seccion.campo", key: "sesiones", campo: "intro", valor: "a" },
      { op: "seccion.campo", key: "sesiones", campo: "sesiones.0.titulo", valor: "b", ancla: "Descubrimiento" },
      { op: "seccion.campo", key: "sesiones", campo: "sesiones.1.titulo", valor: "c", ancla: "Cierre" },
    ]);
    expect(plan.filter((p) => p.tipo === "data")).toHaveLength(1);
  });

  it("y cada una ve el resultado de la anterior", () => {
    const { plan } = correr([
      { op: "seccion.item.borrar", key: "sesiones", lista: "sesiones", posicion: 0, ancla: "Descubrimiento" },
      { op: "seccion.campo", key: "sesiones", campo: "sesiones.0.titulo", valor: "Cierre final", ancla: "Cierre" },
    ]);
    const data = plan.find((p) => p.tipo === "data")!.data as ReturnType<typeof DATA_SESIONES>;
    expect(data.sesiones).toHaveLength(1);
    expect(data.sesiones[0].titulo).toBe("Cierre final");
  });
});

describe("⛔ desmarcar una sección que se crea arrastra lo que la llena", () => {
  it("las operaciones que nombran su `ref` dependen de ella", () => {
    /* Sin esto, desmarcar la creación deja vivas las operaciones que la llenan, esas nombran una
       sección que no existe, el ejecutor las rechaza — y un rechazo puede tumbar el lote entero.
       La persona desmarcó UNA cosa y no se aplicó ninguna. */
    const ops: OperacionDeDocumento[] = [
      { op: "seccion.crear", tipo: "tabla", titulo: "Comparativa", ref: "tabla1" },
      { op: "seccion.campo", key: "tabla1", campo: "intro", valor: "Qué incluye cada opción" },
      { op: "seccion.campo", key: "otra", campo: "intro", valor: "sin relación" },
    ];
    expect(dependenciasDeOperacionesDeDocumento(ops)).toEqual([[1], [], []]);
  });
});

describe("vaciar deja la forma que el renderer espera", () => {
  it("no un objeto vacío, sino el molde del schema", () => {
    expect(vacioDeSchema(SCHEMA_SESIONES)).toEqual({ intro: "", sesiones: [] });
  });
});
