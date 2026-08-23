/**
 * lib/canvas/citas-de-documento.test.ts — QUE «CAMBIÁ DONDE DICE X» NO ESCRIBA EN OTRO LADO.
 *
 * El módulo que se prueba acá reemplaza el identificador que el chat venía usando —COORDENADAS que
 * el modelo tenía que calcular sobre un render que se lee de corrido— por el que el modelo sí sabe
 * producir: el TEXTO que está leyendo. El riesgo se mueve de lugar con el cambio: antes era
 * apuntar al índice equivocado; ahora es **elegir el más parecido cuando hay dos**. Por eso la
 * mitad de este archivo prueba que NO elige.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { hojasCitables, resolverCita, normalizarCita } from "./citas-de-documento";
import {
  prepararOperacionesDeDocumento,
  describirOperacionesDeDocumento,
  type SeccionActual,
} from "./operaciones-de-documento";

const leer = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const SCHEMA = {
  type: "object",
  properties: {
    intro: { type: "string" },
    items: {
      type: "array",
      items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" } } },
    },
    tags: { type: "array", items: { type: "string" } },
  },
};

const DATA = {
  intro: "Lo que vamos a construir",
  items: [
    { title: "Migración desde Excel", detail: "Traemos las hojas que ya usan" },
    { title: "Capacitación al equipo", detail: "Dos sesiones por hub" },
  ],
  tags: ["CRM", "Datos"],
};

const seccion = (over: Partial<SeccionActual> = {}): SeccionActual => ({
  id: "s1",
  key: "objetivos",
  label: "Objetivos",
  data: structuredClone(DATA),
  schema: SCHEMA,
  schemaDelAgente: SCHEMA,
  oculta: false,
  esCreada: false,
  movible: true,
  ...over,
});

/**
 * Una sección donde cada ítem tiene ADENTRO otra lista — la forma del plan de sesiones y de las
 * tablas. Va aparte porque es la única que ejercita el corte de listas anidadas.
 */
const SCHEMA_ANIDADO = {
  type: "object",
  properties: {
    sesiones: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          temas: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const DATA_ANIDADA = {
  sesiones: [{ titulo: "Sesión 1", temas: ["Propiedades", "Pipelines"] }],
};

const TODO = { puedeOcultar: true, puedeCrear: true };

describe("la cita encuentra la coordenada que el modelo no sabe calcular", () => {
  it("enumera cada hoja con su ruta, y solo las de primer nivel llevan coordenada de ítem", () => {
    const hojas = hojasCitables(SCHEMA, DATA);
    const porRuta = new Map(hojas.map((h) => [h.ruta, h]));

    expect(porRuta.get("intro")).toMatchObject({ lista: null, posicion: null });
    expect(porRuta.get("items.1.title")).toMatchObject({ lista: "items", posicion: 1 });
    expect(porRuta.get("tags.0")).toMatchObject({ lista: "tags", posicion: 0, texto: "CRM" });
    /* Una hoja vacía no se puede citar: no hay texto que el modelo pueda haber leído. */
    expect(hojas.every((h) => h.texto.trim())).toBe(true);
  });

  it("«cambiá donde dice X» resuelve la ruta sola, sin que nadie cuente índices", () => {
    const { aceptadas, rechazadas } = prepararOperacionesDeDocumento(
      [seccion()],
      [{ op: "seccion.campo", key: "objetivos", cita: "Dos sesiones por hub", valor: "Tres sesiones por hub" }],
      TODO,
    );
    expect(rechazadas).toEqual([]);
    expect(aceptadas[0]).toMatchObject({ campo: "items.1.detail" });
  });

  it("borrar por cita resuelve la lista Y la posición", () => {
    const { aceptadas, rechazadas } = prepararOperacionesDeDocumento(
      [seccion()],
      [{ op: "seccion.item.borrar", key: "objetivos", cita: "Capacitación al equipo" }],
      TODO,
    );
    expect(rechazadas).toEqual([]);
    expect(aceptadas[0]).toMatchObject({ lista: "items", posicion: 1, ancla: "Capacitación al equipo" });
  });

  it("⭐ la cita se resuelve ANTES que el ancla, y una posición que la contradice se rechaza", () => {
    /* Si el orden se invirtiera, el ancla saldría del índice que el modelo adivinó — o sea que
       confirmaría su propia equivocación en vez de protegerla. */
    const { aceptadas } = prepararOperacionesDeDocumento(
      [seccion()],
      [{ op: "seccion.item.borrar", key: "objetivos", posicion: 0, lista: "items", cita: "Capacitación al equipo" }],
      TODO,
    );
    expect(aceptadas).toEqual([]);
  });
});

describe("⛔ la cita NUNCA elige por su cuenta", () => {
  it("dos lugares que dicen lo mismo son un RECHAZO con las opciones, no el primero", () => {
    const repetida = seccion({
      data: {
        intro: "Pendiente",
        items: [{ title: "Pendiente", detail: "a" }, { title: "Pendiente", detail: "b" }],
        tags: [],
      },
    });
    const { aceptadas, rechazadas } = prepararOperacionesDeDocumento(
      [repetida],
      [{ op: "seccion.campo", key: "objetivos", cita: "Pendiente", valor: "Listo" }],
      TODO,
    );
    expect(aceptadas).toEqual([]);
    expect(rechazadas[0].motivo).toContain("3 lugares");
    /* Listar las opciones es lo que hace que el reintento sirva: sin ellas el modelo vuelve a
       mandar la misma cita. */
    expect(rechazadas[0].motivo).toContain("«Pendiente»");
  });

  it("una cita exacta le gana a las hojas que apenas la contienen", () => {
    const s = seccion({
      data: { intro: "CRM", items: [{ title: "Migrar el CRM viejo", detail: "x" }], tags: [] },
    });
    const r = resolverCita(hojasCitables(SCHEMA, s.data), "CRM");
    expect(r.ok && r.hoja.ruta).toBe("intro");
  });

  it("un texto que no está en la sección se rechaza diciendo eso, no apuntando a lo parecido", () => {
    const { rechazadas } = prepararOperacionesDeDocumento(
      [seccion()],
      [{ op: "seccion.campo", key: "objetivos", cita: "Migración desde Google", valor: "x" }],
      TODO,
    );
    expect(rechazadas[0].motivo).toContain("no aparece en esa sección");
  });

  it("⚠ no se quitan tildes: «más» y «mas» son palabras distintas", () => {
    expect(normalizarCita("Más soporte")).not.toBe(normalizarCita("Mas soporte"));
    /* Lo que sí se normaliza: mayúsculas, espacios de más y las comillas con las que se cita. */
    expect(normalizarCita("«  Más   soporte »")).toBe(normalizarCita("más soporte"));
  });
});

describe("la coordenada manda, la cita verifica", () => {
  it("si el modelo manda las dos y no coinciden, se rechaza en vez de elegir una", () => {
    const { aceptadas, rechazadas } = prepararOperacionesDeDocumento(
      [seccion()],
      [{ op: "seccion.campo", key: "objetivos", campo: "intro", cita: "Dos sesiones por hub", valor: "x" }],
      TODO,
    );
    expect(aceptadas).toEqual([]);
    expect(rechazadas[0].motivo).toContain("items.1.detail");
  });

  it("cuando coinciden, la operación entra igual", () => {
    const { aceptadas, rechazadas } = prepararOperacionesDeDocumento(
      [seccion()],
      [{ op: "seccion.campo", key: "objetivos", campo: "items.1.detail", cita: "Dos sesiones por hub", valor: "x" }],
      TODO,
    );
    expect(rechazadas).toEqual([]);
    expect(aceptadas[0]).toMatchObject({ campo: "items.1.detail" });
  });

  it("citar un texto que no es ítem de una lista dice DÓNDE sí se toca", () => {
    const { rechazadas } = prepararOperacionesDeDocumento(
      [seccion()],
      [{ op: "seccion.item.borrar", key: "objetivos", cita: "Lo que vamos a construir" }],
      TODO,
    );
    expect(rechazadas[0].motivo).toContain("seccion.campo");
  });

  it("⛔ una lista ANIDADA no produce coordenada de ítem — el ejecutor indexa `data[lista]` plano", () => {
    /* Sin este corte, citar «Pipelines» produciría `lista: "sesiones.0.temas"`, que el ejecutor
       busca como clave plana del data: no la encuentra, y la operación muere con «no es una lista
       de esa sección» sobre un texto que SÍ está ahí. La ruta, en cambio, sí resuelve. */
    const hojas = hojasCitables(SCHEMA_ANIDADO, DATA_ANIDADA);
    const anidada = hojas.find((h) => h.texto === "Pipelines");
    expect(anidada).toMatchObject({ ruta: "sesiones.0.temas.1", lista: null, posicion: null });
    expect(hojas.find((h) => h.texto === "Sesión 1")).toMatchObject({ lista: "sesiones", posicion: 0 });

    const s = seccion({ key: "plan", schema: SCHEMA_ANIDADO, data: structuredClone(DATA_ANIDADA) });
    const { rechazadas } = prepararOperacionesDeDocumento(
      [s],
      [{ op: "seccion.item.borrar", key: "plan", cita: "Pipelines" }],
      TODO,
    );
    expect(rechazadas[0].motivo).toContain("seccion.campo");
  });
});

describe("⭐ citar y nombrar la ruta producen la MISMA línea", () => {
  it("la cita se resuelve ANTES de describir, así que la cajita se lee igual de los dos modos", () => {
    const secs = [seccion()];
    const porCita = prepararOperacionesDeDocumento(
      secs,
      [{ op: "seccion.campo", key: "objetivos", cita: "Dos sesiones por hub", valor: "Tres sesiones por hub" }],
      TODO,
    );
    const porRuta = prepararOperacionesDeDocumento(
      secs,
      [{ op: "seccion.campo", key: "objetivos", campo: "items.1.detail", valor: "Tres sesiones por hub" }],
      TODO,
    );
    const a = describirOperacionesDeDocumento(secs, porCita.aceptadas);
    const b = describirOperacionesDeDocumento(secs, porRuta.aceptadas);
    expect(a).toEqual(b);
    /* Y lo que se lee nombra la tarjeta, no la ruta: es la condición de que se pueda aprobar. */
    expect(a[0]).toContain("Capacitación al equipo");
  });
});

describe("el modelo no puede usar lo que no le declaramos", () => {
  it("la herramienta declara `cita` y el prompt la enseña", () => {
    const fuente = leer("lib/asistente/turno.ts");
    const tool = fuente.slice(fuente.indexOf("operaciones: {"), fuente.lastIndexOf("required: [\"op\"]"));
    expect(tool.length).toBeGreaterThan(500);
    expect(tool).toContain("cita: {");
    expect(fuente).toContain("PARA DECIR CUÁL, CITA EL TEXTO");
  });

  it("⛔ una sola normalización: nadie compara textos de documento por su cuenta", () => {
    /* Si el navegador, el ejecutor y el dry-run normalizaran cada uno, el día que difieran el
       acuerdo apuntaría a una hoja y la aplicación a otra — en silencio. */
    const ops = leer("lib/canvas/operaciones-de-documento.ts");
    expect(ops).toContain('from "@/lib/canvas/citas-de-documento"');
    expect(ops).not.toContain("toLowerCase().includes(");
  });
});
