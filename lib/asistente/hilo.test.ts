/**
 * lib/asistente/hilo.test.ts — EL CHAT CONVERSA; NO ESCRIBE EL DOCUMENTO.
 *
 * Correr: `npx vitest run lib/asistente/hilo.test.ts --project unit`.
 *
 * ── LA GUARDA QUE IMPORTA, Y POR QUÉ ─────────────────────────────────────────────────────────
 * El asistente es una superficie nueva que habla con el CSE sobre el cronograma y los
 * documentos. La tentación estructural —la que el plan nombra y este archivo impide— es darle
 * un catálogo de herramientas que escriban: «ya que el modelo entendió el cambio, que lo
 * aplique». Eso multiplica el modo de falla de `artifact-gate` (un grupo no declarado corre SIN
 * celda de permiso, en silencio) y saltea la vista previa con aceptación por ítem, que es lo
 * ÚNICO que impide que un pedido de una línea reescriba tres títulos de contrabando.
 *
 * La decisión es: **el chat emite una instrucción; aplicar pasa por el editor de siempre**, con
 * su guard y su preview. El permiso vive en el botón, no en la conversación.
 *
 * ⚠ Este trinquete cubre `lib/asistente/**` ENTERO, no solo el archivo de hoy: cada pieza nueva
 * del chat (el turno, el panel, la propuesta) nace adentro y hereda la guarda sin que nadie se
 * acuerde de sumarla.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ, listarTsx } from "@/lib/ui/scan-source";
import { decidirHilo, huellaDeContexto } from "./hilo";

/** Comentarios fuera: NOMBRAR una tabla para explicar por qué no se escribe no es escribirla. */
function soloCodigo(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Las tablas del DOCUMENTO: lo que el chat propone cambiar y nunca puede tocar por su cuenta. */
const TABLAS_DEL_DOCUMENTO = [
  "timelineTask",
  "timelinePhase",
  "projectTimeline",
  "canvasBlock",
  "canvasSection",
  "projectCanvas",
];
const VERBOS_DE_ESCRITURA = ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"];

function archivosDelAsistente(): string[] {
  return listarTsx(path.join("lib", "asistente")).filter((f) => !f.endsWith(".test.ts"));
}

describe("el chat no escribe el documento", () => {
  it("⛔ ningún archivo de lib/asistente escribe en las tablas del documento", () => {
    /* La edición que la pone en rojo: agregar `prisma.timelineTask.update({...})` a hilo.ts —
       que es exactamente el gesto de «que el chat aplique el cambio él mismo». */
    const infracciones: string[] = [];
    for (const archivo of archivosDelAsistente()) {
      const src = soloCodigo(fs.readFileSync(path.join(RAIZ, archivo), "utf8"));
      for (const tabla of TABLAS_DEL_DOCUMENTO) {
        for (const verbo of VERBOS_DE_ESCRITURA) {
          if (src.includes(`${tabla}.${verbo}(`)) {
            infracciones.push(`${archivo.split(path.sep).join("/")} → ${tabla}.${verbo}()`);
          }
        }
      }
    }
    expect(
      infracciones,
      "El asistente escribió directo en el documento. El chat EMITE UNA INSTRUCCIÓN: aplicarla " +
        "pasa por /timeline/assist o /canvas-assist, con su guard de permiso y su vista previa " +
        "con aceptación por ítem. Sin eso, un pedido de una línea puede reescribir de contrabando " +
        "lo que nadie revisó.",
    ).toEqual([]);
  });

  it("⛔ tampoco escribe llamando al PUT del cronograma por la espalda", () => {
    /* El otro camino al mismo lugar: en vez de Prisma, un fetch al endpoint que persiste.
       La edición que la pone en rojo: un `fetch(\`/api/projects/${id}/timeline\`, {method:"PUT"})`. */
    const infracciones: string[] = [];
    for (const archivo of archivosDelAsistente()) {
      const src = soloCodigo(fs.readFileSync(path.join(RAIZ, archivo), "utf8"));
      if (/method:\s*"(PUT|POST|PATCH|DELETE)"/.test(src) && /\/api\/projects\//.test(src)) {
        infracciones.push(archivo.split(path.sep).join("/"));
      }
    }
    expect(
      infracciones,
      "El asistente llama a un endpoint de escritura del proyecto. Ese es el mismo salto de la " +
        "guarda anterior con otra puerta: la instrucción la aplica el editor, desde su botón.",
    ).toEqual([]);
  });

  it("y el módulo del hilo lee anclado al proyecto, nunca por id suelto", () => {
    /* Anti-IDOR: el id de un hilo no puede ser la llave para leer la conversación de otro
       proyecto. La edición que la pone en rojo: cambiar `leerHilo` a `findUnique({ where: { id } })`. */
    const src = soloCodigo(fs.readFileSync(path.join(RAIZ, "lib/asistente/hilo.ts"), "utf8"));
    expect(
      src.includes("hiloDeChat.findUnique"),
      "leerHilo pasó a findUnique por id: el id de un hilo abriría la conversación de cualquier proyecto",
    ).toBe(false);
    expect(src, "leerHilo dejó de anclar la lectura al proyecto").toContain("id: hiloId, projectId");
  });
});

describe("el modelo es fijo por hilo", () => {
  /* ⛔ No es una preferencia: el modelo es parte de la clave de la caché de prompt de Anthropic.
     Cambiarlo a mitad de una conversación invalida el prefijo cacheado entero y se paga de nuevo,
     sin error y sin log — el gasto aparece semanas después en /settings/gasto-ia sin explicación. */
  it("mismo modelo → se sigue el hilo", () => {
    expect(decidirHilo({ modelo: "claude-sonnet-5" }, "claude-sonnet-5")).toEqual({
      accion: "reusar",
      motivo: "mismo-modelo",
    });
  });

  it("⛔ otro modelo → hilo NUEVO, no se sigue el viejo", () => {
    /* La edición que la pone en rojo: que `decidirHilo` devuelva "reusar" sin comparar el modelo. */
    expect(decidirHilo({ modelo: "claude-haiku-4-5" }, "claude-sonnet-5")).toEqual({
      accion: "nuevo",
      motivo: "cambio-de-modelo",
    });
  });

  it("sin hilo previo → uno nuevo", () => {
    expect(decidirHilo(null, "claude-sonnet-5")).toEqual({ accion: "nuevo", motivo: "sin-hilo" });
  });
});

describe("del contexto se guarda la huella, no el texto", () => {
  it("el mismo contexto da la misma huella y otro da otra", () => {
    const a = huellaDeContexto("cronograma: 6 fases · handoff v3");
    expect(huellaDeContexto("cronograma: 6 fases · handoff v3")).toBe(a);
    expect(huellaDeContexto("cronograma: 7 fases · handoff v3")).not.toBe(a);
  });

  it("⚠ la huella no lleva el contexto adentro", () => {
    /* Si alguien «mejorara» la huella guardando el texto, la columna pasaría a ser el
       almacenamiento que la decisión 2 descartó: cientos de KB por día que nadie lee, y que
       mienten apenas el CSE confirma un bloque del handoff. */
    const texto = "el cliente pidió mover Setup una semana";
    expect(huellaDeContexto(texto)).not.toContain("Setup");
    expect(huellaDeContexto(texto).length).toBeLessThanOrEqual(32);
  });
});

describe("las decisiones del schema no se relajan solas", () => {
  const schema = fs.readFileSync(path.join(RAIZ, "prisma/schema.prisma"), "utf8");
  const modelo = (nombre: string) => {
    const i = schema.indexOf(`model ${nombre} {`);
    expect(i, `el modelo ${nombre} desapareció del schema`).toBeGreaterThan(-1);
    return schema.slice(i, schema.indexOf("\n}", i));
  };

  it("⚠ usuarioEmail es NOT NULL: el chat no tiene variante de sistema", () => {
    /* La edición que la pone en rojo: `usuarioEmail String?`. Nullable inventaría un estado que
       no existe y obligaría a todos los lectores a manejar un caso imposible. */
    expect(modelo("HiloDeChat")).toMatch(/usuarioEmail\s+String\s/);
  });

  it("⛔ el hilo lleva su modelo, y es parte de su identidad", () => {
    expect(modelo("HiloDeChat")).toMatch(/modelo\s+String\s/);
  });

  it("⚠ el mensaje guarda la HUELLA del contexto, no el contexto", () => {
    const m = modelo("MensajeDeChat");
    expect(m).toMatch(/shaDeContexto\s+String\?/);
    expect(
      /contexto\s+String/.test(m),
      "apareció una columna que guarda el texto del contexto: es la decisión que se descartó",
    ).toBe(false);
  });
});
