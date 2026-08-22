/**
 * lib/canvas/firma-de-seccion.test.ts — EL MODELO TIENE QUE VER LA FORMA DEL DOCUMENTO.
 *
 * Hasta el 2026-08-22 el contexto le mandaba al chat el CONTENIDO de cada sección aplanado —
 * `Object.values`, o sea tirando las claves— y ningún nombre de lista ni de campo. El modelo tenía
 * que adivinar cómo se llamaba cada cosa para poder nombrarla en una operación, y el ejecutor,
 * que sí tiene el esquema, la rechazaba. La persona se enteraba después de aprobar.
 *
 * Estos tests corren contra los esquemas REALES de las secciones, no contra uno inventado: es la
 * única forma de que la firma diga la verdad sobre lo que el ejecutor va a aceptar.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { firmaDeSeccion, AVISO_DE_CAPACIDAD_PARA_EL_CHAT } from "./capacidades-de-documento";
import { KICKOFF_DEF_BY_KEY } from "@/components/landing/configs/kickoff.defs";
import { ENTREGA_DEF_BY_KEY } from "@/components/landing/configs/entrega.defs";
import { DOC } from "./assist-de-documento";

const RAIZ = process.cwd();

describe("la firma de una sección", () => {
  it("⭐ nombra las dos listas del cuadro de comparación — el caso que falló en producción", () => {
    /* El modelo emitió `lista: "sistema"` porque el título en pantalla dice «CON EL SISTEMA». La
       key real es `conSistema`, y no había forma de saberlo desde el contexto.
       La edición que lo pone en rojo: dejar de emitir los nombres de las listas. */
    const firma = firmaDeSeccion(KICKOFF_DEF_BY_KEY.hoy_vs_sistema?.schema);
    expect(firma).toBe("[campos: subhead · listas: hoy(texto), conSistema(texto)]");
  });

  it("⭐ dice que la lista de «El plan, cumplido» se llama metrics, no items", () => {
    /* El modelo emitió `lista: "items"` — se lo sugería la propia herramienta. */
    const firma = firmaDeSeccion(ENTREGA_DEF_BY_KEY.cumplimiento?.schema);
    expect(firma).toContain("metrics[value, label]");
    expect(firma, "«items» no existe en esa sección").not.toContain("items");
  });

  it("distingue una lista de TEXTOS de una lista de OBJETOS — decide `valor` vs `valores`", () => {
    expect(firmaDeSeccion({ type: "object", properties: { tags: { type: "array", items: { type: "string" } } } }))
      .toBe("[listas: tags(texto)]");
    expect(
      firmaDeSeccion({
        type: "object",
        properties: {
          intro: { type: "string" },
          items: {
            type: "array",
            items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" } } },
          },
        },
      }),
    ).toBe("[campos: intro · listas: items[title, detail]]");
  });

  it("una sección que se dibuja desde el proyecto lo dice, en vez de mentir con una firma vacía", () => {
    expect(firmaDeSeccion({})).toBe("[sin campos editables]");
    expect(firmaDeSeccion(undefined)).toBe("[sin campos editables]");
  });

  it("⛔ NINGUNA sección de NINGÚN documento produce una firma con «undefined» o «[object»", () => {
    /* El censo: si un esquema real tiene una forma que el caminador no entiende, el modelo
       recibiría basura como nombre de campo — y la citaría. */
    for (const [slug, doc] of Object.entries(DOC)) {
      for (const [key, def] of Object.entries(doc.defs)) {
        const firma = firmaDeSeccion(def?.schema);
        expect(firma, `${slug}/${key}`).not.toContain("undefined");
        expect(firma, `${slug}/${key}`).not.toContain("[object");
        expect(firma.startsWith("["), `${slug}/${key}`).toBe(true);
      }
    }
  });
});

describe("el aviso de capacidad", () => {
  it("⛔ ningún aviso puede leerse como una prohibición: la decisión de Elías fue avisar, no bloquear", () => {
    /* 2026-08-21, textual: las secciones curadas «las puede editar como cualquier otra». Lo que
       cambia es que ahora el chat dice la consecuencia ANTES.
       La edición que lo pone en rojo: redactar el aviso como una negativa. */
    expect(AVISO_DE_CAPACIDAD_PARA_EL_CHAT.curada).toContain("se puede tocar como cualquier otra");
    expect(AVISO_DE_CAPACIDAD_PARA_EL_CHAT.curada).toContain("la próxima corrida la pisa");
    expect(AVISO_DE_CAPACIDAD_PARA_EL_CHAT.editable, "una sección normal no lleva aviso").toBe("");
  });
});

describe("una sola fuente de la forma", () => {
  it("⭐ el contexto DERIVA la firma del mismo esquema que después ejecuta", () => {
    /* Si el modelo leyera una forma y el ejecutor validara contra otra, volveríamos al fallo del
       2026-08-22 con un disfraz nuevo. Por eso `defs` se resuelve UNA vez y alimenta las dos
       cosas. La edición que lo pone en rojo: escribir la firma a mano, o resolver las defs dos
       veces en la misma función. */
    const src = fs.readFileSync(path.join(RAIZ, "lib/asistente/contexto.ts"), "utf8");
    const doc = src.slice(src.indexOf("export async function contextoDeDocumento"), src.indexOf("export async function contextoDeRol"));
    expect(doc.length, "la guarda no está mirando nada").toBeGreaterThan(1_000);
    expect(doc, "el contexto dejó de emitir la forma de cada sección").toContain("firmaDeSeccion(");
    expect(
      doc.split("const defs =").length - 1,
      "las defs se resuelven dos veces: el modelo y el ejecutor pueden divergir",
    ).toBe(1);
    /* Y el bloque CARD, no el primero: con un TEXT legacy adelante, las anclas del servidor
       saldrían del objeto equivocado. */
    expect(doc, "el servidor volvió a tomar blocks[0] a ciegas").toContain('blockType === "CARD"');
  });
});
