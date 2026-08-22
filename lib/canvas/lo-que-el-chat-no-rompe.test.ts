/**
 * lib/canvas/lo-que-el-chat-no-rompe.test.ts — LOS TRES DAÑOS SILENCIOSOS DEL VOCABULARIO.
 *
 * Los tres se descubrieron auditando el chat contra los pedidos de Elías (2026-08-22), los tres
 * estaban VIVOS en producción, y los tres comparten la peor propiedad que puede tener un defecto
 * acá: **el chat decía «aplicado»**. No hay error, no hay log, y lo que se perdió no se nota hasta
 * que alguien abre el documento buscando otra cosa.
 *
 * Ninguno lo cazaba un test: el del ítem comparaba las CLAVES del objeto nuevo sin mirar de qué
 * TIPO nacía cada una, y vaciar y el chip no tenían test.
 */
import { describe, it, expect } from "vitest";
import {
  aplicarOperacionesDeDocumento,
  type SeccionActual,
} from "./operaciones-de-documento";
import { firmaDeSeccion } from "./capacidades-de-documento";
import { toSectionDef } from "@/components/landing/configs/templates";
import { KICKOFF_DEF_BY_KEY } from "@/components/landing/configs/kickoff.defs";
import { KICKOFF_SECTION_COMPONENTS } from "@/components/landing/configs/kickoff";

const TODO = { puedeOcultar: true, puedeCrear: true };

/** Una sección de plan de sesiones: cada ítem tiene ADENTRO otra lista. */
function seccionDeSesiones(): SeccionActual {
  return {
    id: "s1",
    key: "sesiones",
    label: "Plan de sesiones",
    data: { sesiones: [] },
    schema: {
      type: "object",
      properties: {
        sesiones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              titulo: { type: "string" },
              preguntas: {
                type: "array",
                items: { type: "object", properties: { q: { type: "string" } } },
              },
            },
          },
        },
      },
    },
    oculta: false,
    esCreada: false,
    movible: true,
  };
}

describe("lo que el chat no puede romper en silencio", () => {
  it("⛔⭐ un ítem nuevo nace con la FORMA de su esquema — una lista adentro no nace como texto", () => {
    /* ── EL DAÑO ────────────────────────────────────────────────────────────
       El armado del ítem rellenaba los campos que el modelo no mandó con la string vacía. Cuando
       uno de esos campos era otra LISTA —una sesión de Exploración tiene `preguntas` adentro—, la
       lista nacía como `""`. El render la recorre con `.map`, así que el documento ENTERO dejaba
       de pintarse con «"".map is not a function»… con la data YA GUARDADA: recargar no salvaba,
       Reintentar tampoco, y el PDF caía igual.

       El test viejo comparaba `Object.keys().sort()` — las claves estaban todas, así que pasaba
       en verde con el tipo equivocado. Por eso este afirma el TIPO, no la presencia.

       La edición que lo pone en rojo: volver a `armado[k] = dados[k] ?? ""`. */
    const { plan, rechazadas } = aplicarOperacionesDeDocumento(
      [seccionDeSesiones()],
      [{ op: "seccion.item.agregar", key: "sesiones", lista: "sesiones", valores: { titulo: "Descubrimiento" } }],
      TODO,
    );
    expect(rechazadas, "el agregado se rechazó").toHaveLength(0);
    const escritura = plan.find((e) => e.tipo === "data");
    const nueva = (escritura as { data: { sesiones: Array<Record<string, unknown>> } }).data.sesiones[0];

    expect(nueva.titulo).toBe("Descubrimiento");
    expect(
      Array.isArray(nueva.preguntas),
      "la lista de adentro nació como texto: el documento entero deja de pintarse al abrirlo",
    ).toBe(true);
  });

  it("⛔⭐ vaciar una sección NO se lleva la foto de portada ni los logos", () => {
    /* ── EL DAÑO ────────────────────────────────────────────────────────────
       Vaciar reemplazaba la data de raíz por el molde del esquema. Pero la foto de portada, los
       logos de marca y la escala del logo viven FUERA del esquema A PROPÓSITO: son de la persona,
       y son exactamente lo que `preserveNonSchemaKeys` conserva cada vez que el agente regenera.
       O sea: el chat era la puerta de atrás por la que se perdía lo único que el motor protege.

       Y el aviso no ayudaba: habla de «vaciar la sección», que nadie lee como «y la foto».

       La edición que lo pone en rojo: volver a `s.data = molde`. */
    const portada: SeccionActual = {
      id: "p1",
      key: "bienvenida",
      label: "Portada",
      data: {
        titulo: "Kickoff Wherex",
        tags: ["Sales Hub"],
        coverImageUrl: "https://cdn/foto.jpg",
        brands: ["@client", "@smarteam"],
        logoScale: 120,
      },
      schema: {
        type: "object",
        properties: { titulo: { type: "string" }, tags: { type: "array", items: { type: "string" } } },
      },
      oculta: false,
      esCreada: false,
      movible: false,
    };

    const { plan, rechazadas } = aplicarOperacionesDeDocumento(
      [portada],
      [{ op: "seccion.vaciar", key: "bienvenida" }],
      TODO,
    );
    expect(rechazadas).toHaveLength(0);
    const data = (plan.find((e) => e.tipo === "data") as { data: Record<string, unknown> }).data;

    expect(data.titulo, "el texto sí se vacía: para eso es la operación").toBe("");
    expect(data.tags).toEqual([]);
    expect(data.coverImageUrl, "vaciar se llevó la foto de portada").toBe("https://cdn/foto.jpg");
    expect(data.brands, "vaciar se llevó los logos de marca").toEqual(["@client", "@smarteam"]);
    expect(data.logoScale).toBe(120);
  });

  it("⛔⭐ el nombre estable de la sección SOBREVIVE la traducción de la def", () => {
    /* ── EL DAÑO, y es la lección más incómoda de la auditoría ───────────────
       `chatLabel: "Portada"` estaba declarado en la def, con su guarda verde… y el traductor que
       arma la def de runtime NO LO COPIABA. En pantalla el campo era `undefined` siempre, así que
       el chip seguía diciendo el titular del documento («¡Arranquemos juntos!») mientras el
       contexto del modelo la llamaba «Portada»: DOS nombres para la misma sección en el mismo
       pedido — justo lo que ese campo vino a arreglar.

       La guarda vieja probaba la def CRUDA y por eso no vio nada. Ésta prueba la TRADUCIDA, que
       es la que llega a la pantalla.

       La edición que lo pone en rojo: sacar `chatLabel: d.chatLabel` del traductor. */
    const def = toSectionDef(KICKOFF_DEF_BY_KEY.bienvenida, KICKOFF_SECTION_COMPONENTS);
    expect(def, "la portada del kickoff dejó de tener renderer").not.toBeNull();
    expect(
      def!.chatLabel,
      "el nombre estable se pierde al traducir la def: el chip vuelve a decir otro nombre que el contexto",
    ).toBe("Portada");
  });

  it("⭐ el rótulo de arriba se puede cambiar — y no donde sería mudo", () => {
    /* «Que la línea de arriba, que dice LO QUE BUSCAMOS, diga: lo que se resolverá» — el pedido
       real de Elías. No había operación que lo alcanzara, así que el modelo apuntaba al texto
       introductorio y la persona aprobaba un cambio que no era el suyo.

       ⛔ Y no vale en cualquier sección: las que traen su propio encabezado lo ignoran, así que
       escribir la columna ahí diría «aplicado» sin cambiar nada en pantalla.

       La edición que lo pone en rojo: sacar el chequeo de `rotulable`. */
    const base: SeccionActual = {
      id: "o1",
      key: "objetivos",
      label: "Objetivos del proyecto",
      data: { intro: "Esto es lo que acordamos." },
      schema: { type: "object", properties: { intro: { type: "string" } } },
      oculta: false,
      esCreada: false,
      movible: true,
      rotulable: true,
      rotulo: "Lo que buscamos",
    };

    const ok = aplicarOperacionesDeDocumento(
      [structuredClone(base)],
      [{ op: "seccion.rotular", key: "objetivos", rotulo: "Lo que se resolverá" }],
      TODO,
    );
    expect(ok.rechazadas).toHaveLength(0);
    expect(ok.plan).toContainEqual({ tipo: "rotulo", sectionId: "o1", rotulo: "Lo que se resolverá" });

    /* La portada trae su propio encabezado: acá la columna no se lee. */
    const mudo = aplicarOperacionesDeDocumento(
      [{ ...structuredClone(base), key: "bienvenida", rotulable: false }],
      [{ op: "seccion.rotular", key: "bienvenida", rotulo: "Otra cosa" }],
      TODO,
    );
    expect(mudo.plan, "escribió un rótulo que la sección no pinta").toHaveLength(0);
    expect(mudo.rechazadas[0]?.motivo).toContain("su propio encabezado");
  });
});

/**
 * ⭐ LA TABLA — el hueco que fallaba ACEPTANDO, que es el peor de todos.
 *
 * Elías pidió poder crear tablas por chat, y se construyeron. Pero llenarlas era imposible por un
 * camino silencioso: la firma que ve el modelo colapsaba `celdas: string[]` a «celdas(texto)»,
 * indistinguible de un campo de texto. El modelo mandaba el texto de la fila entera, la validación
 * lo ACEPTABA, y la fila se pintaba VACÍA — con el chat diciendo «aplicado».
 */
describe("la tabla se puede llenar, y lo que no se puede se dice", () => {
  const SCHEMA_TABLA = {
    type: "object",
    properties: {
      columnas: { type: "array", items: { type: "object", properties: { titulo: { type: "string" } } } },
      filas: {
        type: "array",
        items: { type: "object", properties: { celdas: { type: "array", items: { type: "string" } } } },
      },
    },
  };

  it("⛔⭐ un texto NO entra en un campo que es lista — se rechaza en vez de pintar la fila vacía", () => {
    /* La edición que lo pone en rojo: sacar el chequeo de tipo del armado del ítem. */
    const tabla: SeccionActual = {
      id: "t1", key: "tabla", label: "Comparativa",
      data: { columnas: [{ titulo: "Nosotros" }], filas: [] },
      schema: SCHEMA_TABLA, oculta: false, esCreada: true, movible: true,
    };
    const { plan, rechazadas } = aplicarOperacionesDeDocumento(
      [tabla],
      [{ op: "seccion.item.agregar", key: "tabla", lista: "filas", valores: { celdas: "A · B · C" } }],
      TODO,
    );
    expect(plan, "guardó un texto donde el render espera una lista: la fila sale vacía").toHaveLength(0);
    expect(rechazadas[0]?.motivo).toContain("casilla por casilla");
  });

  it("⭐ y el camino que SÍ funciona sigue abierto: crear la fila y llenar cada casilla", () => {
    const tabla: SeccionActual = {
      id: "t1", key: "tabla", label: "Comparativa",
      data: { columnas: [{ titulo: "Nosotros" }], filas: [] },
      schema: SCHEMA_TABLA, oculta: false, esCreada: true, movible: true,
    };
    const creada = aplicarOperacionesDeDocumento(
      [tabla],
      [{ op: "seccion.item.agregar", key: "tabla", lista: "filas", valores: {} }],
      TODO,
    );
    expect(creada.rechazadas).toHaveLength(0);
    const data = (creada.plan.find((e) => e.tipo === "data") as { data: { filas: Array<{ celdas: unknown }> } }).data;
    expect(
      Array.isArray(data.filas[0].celdas),
      "la fila nueva no nació con su lista de casillas",
    ).toBe(true);
  });

  it("⭐ la firma le muestra al modelo que ahí hay una LISTA, no un texto", () => {
    /* Es la mitad que evita el error de entrada. Sin ella el rechazo de arriba llega igual, pero
       después de que la persona ya leyó una línea que prometía la fila completa.
       La edición que lo pone en rojo: volver a colapsar la lista anidada a «(texto)». */
    const firma = firmaDeSeccion(SCHEMA_TABLA);
    expect(firma, "las casillas se anuncian como si fueran un campo de texto").not.toContain("celdas(texto)");
    expect(firma).toContain("celdas");
    expect(firma, "la firma no dice que las casillas son varias").toMatch(/celdas\[/);
  });
});
