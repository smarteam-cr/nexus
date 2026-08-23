/**
 * lib/landing/prosa-y-subtitulos.test.ts — EL VOCABULARIO QUE FALTABA, Y LA COPIA QUE SOBRABA.
 *
 * ── DE DÓNDE SALE ────────────────────────────────────────────────────────────────────────────
 * Elías listó lo que el motor tiene, para argumentar que la superficie no es inabarcable:
 * *«texto y títulos, cards, cards con íconos, métricas, comparaciones, above the folds, footers,
 * tags, subtítulos, tablas…»*. Contra el código, dos de esa lista no eran ciertas:
 *
 *  · **tags** SÍ funcionaba y nadie lo sabía — la firma que el modelo lee ya declara
 *    `listas: tags(texto)` en las portadas, así que el chat siempre pudo agregarlos y quitarlos.
 *    No hacía falta código: hacía falta comprobarlo, y eso es lo que hace el primer test.
 *  · **subtítulos** NO existía en las secciones de prosa. Entra acá.
 *
 * ── LA DECISIÓN QUE VALE LA PENA LEER DOS VECES ──────────────────────────────────────────────
 * `subhead` entra en el esquema del CHAT y **no** en el del AGENTE. El schema ES el prompt: sumarlo
 * al del agente pondría a cinco agentes a escribir un subtítulo en veinte secciones que hoy no lo
 * tienen, cambiando documentos ya entregados sin que nadie lo pidiera. En el del chat, la capacidad
 * existe el día uno y no se dispara sola — y sobrevive, porque `preserveNonSchemaKeys` acarrea las
 * claves de primer nivel que el esquema del agente no declara.
 */
import { describe, it, expect } from "vitest";
import { KICKOFF_DEF_BY_KEY, KICKOFF_SECTION_DEFS } from "@/components/landing/configs/kickoff.defs";
import { DIAGNOSTICO_SECTION_DEFS } from "@/components/landing/configs/diagnostico.defs";
import { PLANIFICACION_SECTION_DEFS } from "@/components/landing/configs/planificacion.defs";
import { IMPLEMENTACION_SECTION_DEFS } from "@/components/landing/configs/implementacion.defs";
import { ENTREGA_SECTION_DEFS } from "@/components/landing/configs/entrega.defs";
import { PROSA_SCHEMA } from "@/components/landing/configs/shared-sections.defs";
import { firmaDeSeccion, schemaParaElChat } from "@/lib/canvas/capacidades-de-documento";
import { normalizeProse, proseIsEmpty } from "@/components/canvas/kickoff-sections/types";
import { RAIZ } from "@/lib/ui/scan-source";
import fs from "node:fs";
import path from "node:path";

const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

const PROSA = [
  ...KICKOFF_SECTION_DEFS.map((d) => ({ doc: "kickoff", d })),
  ...DIAGNOSTICO_SECTION_DEFS.map((d) => ({ doc: "diagnostico", d })),
  ...PLANIFICACION_SECTION_DEFS.map((d) => ({ doc: "planificacion", d })),
  ...IMPLEMENTACION_SECTION_DEFS.map((d) => ({ doc: "implementacion", d })),
  ...ENTREGA_SECTION_DEFS.map((d) => ({ doc: "entrega", d })),
].filter(({ d }) => (d.sectionType ?? d.key) === "kickoff_prose");

const props = (s: unknown) => Object.keys((s as { properties?: Record<string, unknown> })?.properties ?? {});

describe("los tags ya funcionaban — esto lo comprueba, no lo agrega", () => {
  it("⭐ la firma que el modelo lee declara `tags` en la portada del kickoff", () => {
    /* Es la prueba de que la capacidad existe: el modelo nombra las listas por lo que la firma le
       dice, así que si `tags(texto)` está ahí, «agregá un tag» ya era un pedido ejecutable. La
       tanda no agrega código para esto a propósito — declararlo otra vez en el prompt sería la
       segunda copia de algo que el contexto ya dice, y este repo ya sabe cómo terminan las dos
       copias del mismo texto. */
    const firma = firmaDeSeccion(schemaParaElChat(KICKOFF_DEF_BY_KEY.bienvenida));
    expect(firma).toContain("tags(texto)");
  });
});

describe("una sola forma de prosa, y con subtítulo para el chat", () => {
  it("la guarda está mirando las veinte, no una", () => {
    expect(PROSA.length, "se movió el sectionType de las secciones de prosa").toBe(20);
  });

  it("⭐ las VEINTE comparten la MISMA constante — cero copias inline", () => {
    /* Estaban escritas a mano cinco veces (más una sexta suelta en `objetivos`). El trinquete «un
       renderer, un contrato de datos» probó que eran idénticas; consolidarlas hace que no puedan
       volver a divergir, que es de donde salió el fallo de los titulares del diagnóstico.
       ⚠ Se compara por IDENTIDAD DE REFERENCIA, no por forma: dos objetos con las mismas claves
       vuelven a ser dos copias, y esta guarda existe justamente para que haya una sola. */
    const ajenas = PROSA.filter(({ d }) => d.schema !== PROSA_SCHEMA).map(
      ({ doc, d }) => `${doc}/${d.key}`,
    );
    expect(ajenas, "esa sección volvió a declarar su propia copia del esquema de prosa").toEqual([]);
  });

  it("⭐ las veinte le abren `subhead` al CHAT", () => {
    const sin = PROSA.filter(({ d }) => !props(schemaParaElChat(d)).includes("subhead")).map(
      ({ doc, d }) => `${doc}/${d.key}`,
    );
    expect(sin, "el chat no puede escribir el subtítulo de esa sección").toEqual([]);
  });

  it("⛔ y NINGUNA se lo abre al AGENTE — el schema es el prompt", () => {
    /* La edición que la pone en rojo: mover `subhead` de `PROSA_SCHEMA_DEL_CHAT` a `PROSA_SCHEMA`.
       Con eso, cinco agentes empezarían a escribir un subtítulo en veinte secciones que hoy no lo
       tienen, en documentos que ya se entregaron. Es la misma lección que dejó `resumenHoy`: sumar
       un campo al esquema NO es sumar un campo, es cambiar lo que cinco agentes escriben. */
    const abiertas = PROSA.filter(({ d }) => props(d.schema).includes("subhead")).map(
      ({ doc, d }) => `${doc}/${d.key}`,
    );
    expect(abiertas, "el agente empezaría a inventar subtítulos en documentos ya entregados").toEqual([]);
  });
});

describe("el motor lo PINTA — si no, el chat diría «aplicado» sobre algo invisible", () => {
  it("⭐ el renderer de prosa dibuja el subtítulo y lo puede editar", () => {
    /* Es el defecto que `TarjetasData.intro` ya tiene documentado: un campo en el esquema que
       ningún renderer lee produce un «aplicado» sobre algo que nadie va a ver nunca. */
    /* ⚠ ANCLADO AL TRAMO DE PROSA, no al archivo. La primera versión miraba el archivo entero y
       ese archivo tiene CUATRO `subhead` más (la portada del kickoff, la de la entrega, el hero):
       romper el de prosa a propósito dejaba la guarda en VERDE porque encontraba cualquiera de los
       otros. Guarda decorativa cazada rompiéndola, como corresponde. */
    const src = leer("components/canvas/kickoff-sections/KickoffSections.tsx");
    const tramo = src.slice(
      src.indexOf("export const KickoffProseSection"),
      src.indexOf("// ── Hero (bienvenida)"),
    );
    expect(tramo.length, "se movió el componente de prosa: la guarda no mira nada").toBeGreaterThan(600);
    expect(tramo).toContain('value={d.subhead ?? ""}');
    expect(tramo).toContain("onCommit={(v) => set({ subhead: v })}");
  });

  it("el normalizador lo conserva, y una sección con solo subtítulo NO está vacía", () => {
    /* Si `proseIsEmpty` lo ignorara, la vista del cliente omitiría una sección donde alguien
       escribió lo único que había para escribir. */
    const d = normalizeProse({ subhead: "Lo que cambia para el negocio", items: [] });
    expect(d.subhead).toBe("Lo que cambia para el negocio");
    expect(proseIsEmpty(d)).toBe(false);
    expect(proseIsEmpty(normalizeProse({ items: [] }))).toBe(true);
  });
});
