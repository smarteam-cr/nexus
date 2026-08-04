import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resumirSala, textoDeSala } from "./participantes";
import { rotuloDeHubspot } from "@/lib/projects/lista-de-empresa";
import { PROJECT_PIPELINES } from "@/lib/projects/kind";

/**
 * lib/sessions/participantes.test.ts — LOS DOS DATOS QUE FALTABAN PARA PODER ELEGIR.
 *
 * Las dos pantallas de esta tanda piden lo mismo: elegir entre opciones que solo mostraban su
 * nombre. En el alta, un proyecto de HubSpot sin su tipo ni su etapa. En el buscador, una reunión
 * sin saber quién estuvo. Las dos fallas son silenciosas: se elige mal y se ve igual de bien.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const YO = "msalas@smarteamcr.com";
const OTRO = "bcenteno@smarteamcr.com";
const CAV = "cmunoz@lacav.cl";
const CAV2 = "hpadilla@lacav.cl";
const AGRO = "heylin@agrosmartcr.com";

describe("quién estuvo en la sala", () => {
  it("todos nuestros → solo nosotros, sin dominios de afuera", () => {
    const r = resumirSala([YO, OTRO]);
    expect(r).toEqual({ nuestros: 2, externos: 0, dominiosExternos: [] });
    expect(textoDeSala(r)).toBe("2 de Smarteam");
  });

  it("mezclada → el dominio del cliente es LA señal", () => {
    /* Es el caso que resuelve la duda: el título puede no nombrar a nadie, pero si hay alguien de
       lacav.cl adentro, la reunión es del proyecto de CAV. */
    const r = resumirSala([YO, CAV, CAV2]);
    expect(r.nuestros).toBe(1);
    expect(r.externos).toBe(2);
    expect(textoDeSala(r)).toBe("1 de Smarteam · 2 de lacav.cl");
  });

  it("el ORGANIZADOR cuenta aunque no esté en la lista", () => {
    /* En muchas reuniones el organizador no figura entre los participantes. Sin plegarlo, una
       sesión que organizó alguien de afuera se leería como si hubiéramos estado solos — que es
       exactamente la conclusión contraria a la verdadera. */
    const r = resumirSala([YO], CAV);
    expect(r.externos).toBe(1);
    expect(r.dominiosExternos).toEqual(["lacav.cl"]);
  });

  it("el organizador no se cuenta dos veces si además participó", () => {
    expect(resumirSala([YO, CAV], CAV).externos).toBe(1);
  });

  it("no distingue mayúsculas ni espacios", () => {
    expect(resumirSala(["  MSalas@SmartEamCR.com  "]).nuestros).toBe(1);
  });

  it("varios dominios de afuera se listan ordenados, y se cortan en dos", () => {
    /* El objetivo es reconocer al cliente de un vistazo, no auditar la lista entera. */
    const r = resumirSala([YO, CAV, AGRO, "x@tercera.com", "y@cuarta.com"]);
    expect(r.dominiosExternos).toEqual(["agrosmartcr.com", "cuarta.com", "lacav.cl", "tercera.com"]);
    expect(textoDeSala(r)).toBe("1 de Smarteam · 4 de agrosmartcr.com, cuarta.com +2");
  });

  it("un email raro sigue contando como alguien de afuera", () => {
    /* Redondear a cero haría que una reunión con un invitado de dominio ilegible se lea como
       interna — y las internas son las que este buscador trata distinto. */
    const r = resumirSala([YO, "sin-arroba"]);
    expect(r.externos).toBe(1);
    expect(textoDeSala(r)).toBe("1 de Smarteam · 1 de afuera");
  });

  it("sala vacía → null, no una línea en blanco", () => {
    expect(textoDeSala(resumirSala([]))).toBeNull();
    expect(textoDeSala(resumirSala(null))).toBeNull();
  });
});

describe("el tipo y la etapa del proyecto que se va a adjuntar", () => {
  /** Ids REALES de la tabla congelada — si alguien los cambia, esto se entera. */
  const CS = PROJECT_PIPELINES.find((p) => p.key === "customer-success")!;
  const WEB = PROJECT_PIPELINES.find((p) => p.key === "web")!;

  it("con pipeline y etapa conocidos → «Tipo · Etapa»", () => {
    const r = rotuloDeHubspot({ hubspotPipelineId: CS.hubspotPipelineId, stage: CS.stages[0].id });
    expect(r.desconocido).toBe(false);
    expect(r.texto).toBe(`${CS.label} · ${CS.stages[0].label}`);
  });

  it("los tres pipelines resuelven, no solo Customer Success", () => {
    for (const p of PROJECT_PIPELINES) {
      const r = rotuloDeHubspot({ hubspotPipelineId: p.hubspotPipelineId, stage: p.stages[0]?.id });
      expect(r.desconocido, `${p.key} no resuelve`).toBe(false);
      expect(r.texto).toContain(p.label);
    }
  });

  it("etapa desconocida → se muestra el tipo solo, sin inventar nada", () => {
    const r = rotuloDeHubspot({ hubspotPipelineId: WEB.hubspotPipelineId, stage: "9999-no-existe" });
    expect(r.texto).toBe(WEB.label);
    expect(r.desconocido).toBe(false);
  });

  it("LA guarda: pipeline desconocido AVISA que no se puede traer", () => {
    /* No es cosmético: ese caso bloquea el alta (el motor no puede cerrarla si el tipo del espejo
       no coincide con el elegido). Si el renglón no lo anticipa, la persona llena el formulario
       entero y se entera recién al final. */
    const r = rotuloDeHubspot({ hubspotPipelineId: "0000", stage: "1234" });
    expect(r.desconocido).toBe(true);
    expect(r.texto).toContain("no se puede traer");
  });

  it("sin pipeline (null) también avisa, no muestra vacío", () => {
    expect(rotuloDeHubspot({ hubspotPipelineId: null, stage: null }).desconocido).toBe(true);
  });
});

describe("las dos pantallas usan lo que se les preparó", () => {
  it("el alta pinta el rótulo en la lista de adjuntables", () => {
    /* Sin esto el dato vuelve a viajar y morir en el cliente, que es como estuvo desde siempre:
       `stage` y `hubspotPipelineId` ya llegaban al navegador y no los leía nadie. */
    const src = leer("components/projects/NuevoProyectoStepper.tsx");
    expect(src, "el rótulo dejó de calcularse").toContain("rotuloDeHubspot(");
    const i = src.indexOf("Ya en HubSpot, todavía no en Nexus");
    expect(i, "se movió el encabezado de la sección").toBeGreaterThan(0);
    expect(src.slice(i, i + 1600), "el rótulo no se pinta en la lista").toContain("rot.texto");
  });

  it("el buscador de sesiones muestra la sala", () => {
    const src = leer("components/clients/SessionSelectionReview.tsx");
    expect(src, "el resumen de participantes desapareció").toContain("textoDeSala(resumirSala(");
    expect(src, "el motivo volvió a vivir solo en el tooltip").toContain("{c.reason}");
  });

  it("el diálogo dejó de ser chico, y la lista no tiene un tope fijo anidado", () => {
    /* El `max-h-80` era el freno real: el cuerpo del Modal ya scrollea dentro de un panel de
       85vh, así que un tope fijo de 320px mostraba cuatro filas y desperdiciaba la pantalla.
       Agrandar el modal sin tocarlo habría dado más ancho y la misma lista corta. */
    const src = leer("components/clients/SessionSelectionReview.tsx");
    const i = src.indexOf('title="Buscar sesiones"');
    expect(i).toBeGreaterThan(0);
    expect(src.slice(i, i + 400), "el diálogo volvió a size=md").not.toContain('size="md"');
    /* Se miran las CLASES, no el archivo: el comentario que explica por qué se sacó menciona
       `max-h-80` en prosa, y un escaneo crudo se caía con el código correcto — la clase de guarda
       que después alguien borra por molesta. */
    const clases = [...src.matchAll(/className="([^"]*)"/g)].map((m) => m[1]).join(" ");
    expect(clases, "volvió el tope fijo que anula el alto del diálogo").not.toMatch(/max-h-80/);
    expect(clases, "la lista se quedó sin tope: scrollearía la página entera").toMatch(/max-h-\[\d+vh\]/);
  });

  it("el DTO manda organizador y duración", () => {
    const src = leer("app/api/projects/[projectId]/session-candidates/route.ts");
    expect(src, "el organizador se vuelve a descartar antes de responder").toContain(
      "organizerEmail: s.organizerEmail",
    );
    expect(src).toContain("duration: s.duration");
  });

  it("los emails NO se pintan de a uno en la fila", () => {
    /* Son datos de contacto de gente real en una pantalla que se comparte en reuniones, y en una
       lista de veinte filas no informan nada que el dominio no diga mejor. */
    const src = leer("components/clients/SessionSelectionReview.tsx");
    expect(src, "se está volcando la lista cruda de participantes").not.toMatch(
      /c\.participants\.join\(/,
    );
  });
});
