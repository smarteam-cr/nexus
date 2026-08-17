import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/projects/brief-superficie.test.ts — EL RESUMEN NO PUEDE MENTIR SOBRE SU PROPIA EDAD.
 *
 * ── LAS DOS FORMAS EN QUE ESTA PANTALLA SE VUELVE INÚTIL ─────────────────────
 *
 * 1. **El veredicto de frescura se calcula en el navegador.** Es lo natural cuando alguien
 *    necesita el dato en otra pantalla: mandar las cuatro fechas y decidir del lado del cliente.
 *    Con dos consumidores, cada uno saca su propia conclusión y terminan diciendo cosas distintas
 *    sobre el MISMO resumen — sin que ninguno esté roto. Por eso viaja el veredicto, no los
 *    insumos.
 *
 * 2. **Se esconde cuántas afirmaciones se descartaron.** Es el único indicador de calidad que
 *    este circuito produce: un descarte alto significa que el modelo citó fuentes inexistentes,
 *    o sea que el prompt está flojo. Sin él, un resumen corto se lee como «este proyecto está
 *    tranquilo», que es la conclusión opuesta a la verdadera.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
/** MENCIONAR NO ES USAR: la sección EXPLICA en un comentario que el veredicto lo resuelve el
 *  servidor, y ese texto haría fallar un escaneo ingenuo — dejándolo verde solo si alguien borra
 *  la explicación, que es premiar lo contrario de lo que se quiere. */
const sinComentarios = (rel: string) =>
  leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
const SECCION = "components/projects/ProjectBriefSection.tsx";
const GPS_API = "app/api/projects/[projectId]/gps/route.ts";
const WIDGET = "components/clients/ProjectGPS.tsx";

describe("⭐ la frescura se resuelve en el SERVIDOR", () => {
  it("el GPS llama a `evaluarFrescura` y manda el veredicto", () => {
    const src = leer(GPS_API);
    expect(src).toContain("evaluarFrescura(");
    expect(src, "el veredicto no viaja en el DTO").toContain("vencido: frescura.vencido");
    expect(src, "el motivo no viaja: el aviso quedaría genérico").toContain(
      "motivoDeVencimiento: frescura.motivo",
    );
  });

  it("⚠ la sección NO la recalcula: solo la pinta", () => {
    /* Si el componente importara el evaluador, existirían dos verdades sobre el mismo resumen y
       la del cliente se desincronizaría el día que el servidor sume una señal. */
    expect(sinComentarios(SECCION), "la pantalla recalcula la frescura por su cuenta").not.toContain(
      "evaluarFrescura",
    );
  });

  it("el aviso muestra el MOTIVO, no un «quedó viejo» genérico", () => {
    /* «Hubo una reunión nueva» y «hubo una reunión nueva y cambió la etapa» piden reacciones
       distintas; un cartel genérico las aplana en la misma y se termina ignorando. */
    expect(leer(SECCION)).toContain("brief.motivoDeVencimiento");
  });
});

describe("⭐ las afirmaciones descartadas se dicen", () => {
  it("el endpoint las devuelve", () => {
    expect(leer("app/api/projects/[projectId]/brief/route.ts")).toContain("discarded: r.discarded");
  });

  it("y la pantalla las anuncia cuando pesan", () => {
    /* Decirlo SIEMPRE sería ruido —un descarte de 1 sobre 10 no es noticia—; no decirlo nunca
       escondería que el resumen salió corto porque el modelo citó mal. */
    const src = leer(SECCION);
    expect(src).toContain("r.discarded");
    expect(src, "el aviso no explica qué hacer con un descarte alto").toContain(
      "el prompt del agente necesita ajuste",
    );
  });
});

describe("dónde vive y cómo degrada", () => {
  it("va montado en el widget del proyecto", () => {
    expect(leer(WIDGET)).toContain("<ProjectBriefSection");
  });

  it("⚠ distingue «no hay resumen» de «respuesta vieja sin el campo»", () => {
    /* `null` = nunca se generó, y eso SÍ se pinta (con su CTA). `undefined` = una respuesta
       cacheada de antes de este cambio, y ahí no hay nada honesto que decir. Tratarlos igual
       haría aparecer un «generá el resumen» sobre proyectos que quizá ya lo tienen. */
    expect(leer(WIDGET)).toContain("data.brief !== undefined");
  });

  it("un fallo se ve como fallo", () => {
    expect(leer(SECCION)).toContain("toast.error");
  });

  it("usa tokens del tema, no colores crudos", () => {
    const src = leer(SECCION);
    expect(src).toContain("border-warn-line bg-warn-surface text-warn-ink");
    expect(src).not.toMatch(/\b(bg|text|border)-(gray|slate|zinc|amber)-\d/);
  });
});
