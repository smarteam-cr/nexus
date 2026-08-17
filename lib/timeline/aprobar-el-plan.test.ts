import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/timeline/aprobar-el-plan.test.ts — CONGELAR LA FOTO ES EL ACTO, NO UN EFECTO SECUNDARIO.
 *
 * ── POR QUÉ EXISTE APROBAR ───────────────────────────────────────────────────
 * La foto del plan es contra qué se mide el alcance. Hasta ahora solo se tomaba al PUBLICAR, que
 * es un acto de cara al cliente — y por eso **14 de 132 proyectos activos** la tienen: en 9 de
 * cada 10 el alcance excedido es inmedible, no porque nadie lo mire sino porque no hay contra qué
 * compararlo. Aprobar separa «este es el plan» de «mostráselo al cliente».
 *
 * ── LA ASIMETRÍA QUE ESTE ARCHIVO PROTEGE ────────────────────────────────────
 * Las dos rutas llaman al MISMO congelador y tratan su fallo al REVÉS, a propósito:
 *
 *  · Publicar es FAIL-OPEN: el baseline es auditoría interna, y bloquear una publicación al
 *    cliente por un fallo de auditoría sería peor que reintentarla después.
 *  · Aprobar falla RUIDOSO: ahí congelar ES el acto. Decir «listo» sin foto dejaría al equipo
 *    creyendo que hay una promesa registrada mientras el alcance se mide contra nada.
 *
 * Unificarlas se lee como coherencia y rompe una de las dos: si aprobar se vuelve fail-open, el
 * fallo es mudo; si publicar se vuelve estricto, un hipo de auditoría corta una entrega.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (rel: string) =>
  leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

const APPROVE = "app/api/projects/[projectId]/timeline/approve/route.ts";
const PUBLISH = "app/api/projects/[projectId]/publish-timeline/route.ts";
const BASELINE = "lib/timeline/baseline.ts";
const CANVAS = "components/canvas/CronogramaCanvas.tsx";

describe("⭐ un solo congelador para los dos actos", () => {
  it("el congelador ya no se llama «al publicar»", () => {
    /* El nombre viejo (`freezeBaselineOnPublish`) era la única atadura a publicar — el cuerpo
       nunca tocó `timelinePublishedAt`. Dejarlo así invitaría a clonarlo para aprobar, y ahí las
       dos fotos empezarían a congelarse distinto. */
    expect(leer(BASELINE)).toContain("export async function freezeBaseline(");
    expect(sinComentarios(BASELINE)).not.toContain("freezeBaselineOnPublish");
  });

  it("las dos rutas lo llaman", () => {
    expect(leer(PUBLISH)).toContain("freezeBaseline(");
    expect(leer(APPROVE)).toContain("freezeBaseline(");
  });
});

describe("⛔ la asimetría de los fallos", () => {
  it("aprobar responde ERROR si no pudo congelar", () => {
    const src = leer(APPROVE);
    expect(src, "aprobar se tragó el fallo del congelado").toMatch(
      /catch[\s\S]{0,600}status:\s*502/,
    );
    expect(src, "el mensaje no dice que NO quedó aprobado").toContain("NO quedó aprobado");
  });

  it("publicar sigue publicando igual (fail-open a propósito)", () => {
    /* Si alguien «arregla» esto para que sea estricto, un fallo de auditoría pasa a cortar una
       entrega al cliente — que es exactamente lo que el comentario de esa ruta explica que no. */
    expect(leer(PUBLISH), "publicar dejó de ser fail-open").toContain("se publica igual");
  });
});

describe("aprobar tiene sus propias puertas", () => {
  it("exige fecha de arranque, con su motivo", () => {
    /* El gate del ancla vive en la ruta de publicar, NO en el congelador: sin duplicarlo acá,
       aprobar congelaría semanas relativas y después «se atrasó» no se podría decir. */
    const src = leer(APPROVE);
    expect(src).toContain("anchorStartDate");
    expect(src).toContain("status: 400");
  });

  it("⚠ no aprueba un cronograma VACÍO", () => {
    /* Congelaría una promesa de nada, y a partir de ahí CUALQUIER fase que se agregue contaría
       como alcance excedido — el número diría lo contrario de la verdad. */
    const src = leer(APPROVE);
    expect(src).toContain("_count: { select: { phases: true } }");
    expect(src).toContain("no hay plan que aprobar");
  });

  it("usa el gate de editar el cronograma, sin celda nueva", () => {
    /* El CSE ya confirma el detalle y ya publica al cliente: aprobar el plan es el mismo dueño.
       Una celda propia habría inventado una jerarquía que el trabajo real no tiene. */
    expect(leer(APPROVE)).toContain("guardTimelineEdit(projectId)");
  });
});

describe("«ya estaba aprobado» no es un error", () => {
  it("el dedup por promesa devuelve created:false y la ruta lo pasa tal cual", () => {
    /* Aprobar dos veces el mismo plan no versiona — y está bien. Tratarlo como fallo enseñaría a
       ignorar el aviso; celebrarlo como versión nueva mentiría sobre el historial.
       ⚠ Este assert estaba anclado en el literal «created:false», que solo existe en un COMENTARIO
       de la ruta: pasaba aunque el código descartara el campo. Ahora mira el CÓDIGO. */
    const codigo = sinComentarios(APPROVE);
    expect(codigo, "la ruta dejó de reenviar lo que devolvió el congelador").toMatch(
      /\.\.\.r,?/,
    );
    expect(codigo, "la ruta empezó a normalizar `created` en vez de pasarlo").not.toMatch(
      /created:\s*true/,
    );
  });
});

describe("el botón existe y no ofrece lo que va a fallar", () => {
  it("el canvas llama al endpoint de aprobar", () => {
    expect(leer(CANVAS)).toContain("/timeline/approve");
  });

  it("⚠ el CTA se pide ancla para mostrarse", () => {
    /* Sin fecha de arranque el endpoint responde 400. Un botón que solo sirve para dar error
       enseña a ignorar los botones — y el próximo, el que sí importaba, también se ignora. */
    const src = leer(CANVAS);
    const i = src.indexOf("approvePlan()");
    const antes = src.slice(Math.max(0, i - 700), i);
    expect(antes, "el CTA de aprobar dejó de exigir ancla para mostrarse").toContain("&& anchor &&");
  });

  it("«ya estaba aprobado» se dice distinto de «se aprobó»", () => {
    /* `created:false` no es error ni versión nueva. Celebrar una versión que no se creó dejaría
       a alguien creyendo que hay una foto tomada hoy. */
    expect(leer(CANVAS)).toContain("ya estaba aprobado");
  });

  it("un fallo del congelado se muestra, no se celebra", () => {
    /* ⚠ Antes esto buscaba `toast.error` en cualquier lado del handler — y ahí está igual, en el
       catch de red, así que pasaba aunque la rama de respuesta celebrara un 502. Lo que hay que
       afirmar es que la rama `!res.ok` CORTA: muestra el error y hace `return` antes de llegar al
       toast de éxito. */
    const src = sinComentarios(CANVAS);
    const i = src.indexOf("const approvePlan");
    const cuerpo = src.slice(i, i + 1600);
    expect(cuerpo, "aprobar no corta ante una respuesta de error").toMatch(
      /if \(!res\.ok\)[\s\S]{0,260}toast\.error\([\s\S]{0,120}return;/,
    );
  });
});
