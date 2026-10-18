/**
 * lib/landing/html-textos.test.ts — cambiar los textos de un HTML sin tocar su diseño.
 *
 * Correr: `npx vitest run lib/landing/html-textos.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { aplicarTextos, extraerTextos, huellaDelHtml, pareceProsa } from "./html-textos";

const HTML = `<!doctype html>
<html><head><style>.card{color:#051849}/* REMPRO */</style></head>
<body>
  <!-- Para REMPRO -->
  <h1 class="titulo">Plataforma integrada para REMPRO</h1>
  <img src="logo.png" alt="Logo de REMPRO">
  <p>Ventas &amp; servicio en un solo lugar</p>
  <div id="tabs"></div>
  <script>
    const CONFIG = {
      proyectos: [{ title: "Optimización de HubSpot", summary: 'El equipo de REMPRO ordena su proceso' }],
      selector: ".tabs button",
      api: "IntersectionObserver",
      plantilla: \`<li>\${x}</li>\`,
    };
    // un comentario con "comillas que no son una cadena"
    document.querySelectorAll(".tabs button");
  </script>
</body></html>`;

describe("extraerTextos", () => {
  const segs = extraerTextos(HTML);
  const textos = segs.map((s) => s.texto);

  it("lee el texto entre etiquetas, decodificado y sin los espacios de alrededor", () => {
    expect(textos).toContain("Plataforma integrada para REMPRO");
    expect(textos).toContain("Ventas & servicio en un solo lugar");
  });

  it("lee los atributos que se ven (alt) y no los demás (class, src)", () => {
    expect(segs.find((s) => s.texto === "Logo de REMPRO")?.donde).toBe("atributo");
    expect(textos).not.toContain("titulo");
    expect(textos).not.toContain("logo.png");
  });

  it("⭐ lee las cadenas del script que son prosa", () => {
    expect(segs.find((s) => s.texto === "Optimización de HubSpot")?.donde).toBe("script");
    expect(textos).toContain("El equipo de REMPRO ordena su proceso");
  });

  it("⛔ no lee código: selectores, nombres de la API, plantillas con ${}, CSS ni comentarios", () => {
    expect(textos).not.toContain(".tabs button");
    expect(textos).not.toContain("IntersectionObserver");
    expect(textos.some((t) => t.includes("<li>"))).toBe(false);
    expect(textos.some((t) => t.includes("color"))).toBe(false);
    expect(textos.some((t) => t.includes("Para REMPRO"))).toBe(false);
    expect(textos.some((t) => t.includes("comillas que no son"))).toBe(false);
  });

  it("los ids van en orden de aparición", () => {
    expect(segs.map((s) => s.id)).toEqual(segs.map((_, i) => i));
    for (let i = 1; i < segs.length; i++) expect(segs[i].inicio).toBeGreaterThan(segs[i - 1].inicio);
  });
});

describe("aplicarTextos", () => {
  const segs = extraerTextos(HTML);
  const idDe = (t: string) => segs.find((s) => s.texto === t)!.id;

  it("sin cambios, el HTML queda byte por byte igual", () => {
    expect(aplicarTextos(HTML, segs, new Map())).toBe(HTML);
    expect(aplicarTextos(HTML, segs, new Map(segs.map((s) => [s.id, s.texto])))).toBe(HTML);
  });

  it("⭐ cambia solo los textos: etiquetas, estilos y código quedan iguales", () => {
    const nuevo = aplicarTextos(
      HTML,
      segs,
      new Map([
        [idDe("Plataforma integrada para REMPRO"), "Plataforma integrada para Acme"],
        [idDe("El equipo de REMPRO ordena su proceso"), "El equipo de Acme ordena su proceso"],
      ]),
    );
    expect(nuevo).toContain('<h1 class="titulo">Plataforma integrada para Acme</h1>');
    expect(nuevo).toContain("summary: 'El equipo de Acme ordena su proceso'");
    expect(nuevo).toContain(".card{color:#051849}");
    expect(nuevo).toContain('document.querySelectorAll(".tabs button");');
  });

  it("⛔ escapa lo que podría romper: HTML en un texto, la comilla en una cadena, </script>", () => {
    const nuevo = aplicarTextos(
      HTML,
      segs,
      new Map([
        [idDe("Ventas & servicio en un solo lugar"), "Ventas <b>& servicio"],
        [idDe("El equipo de REMPRO ordena su proceso"), "It's </script> done"],
        [idDe("Logo de REMPRO"), 'Logo "Acme"'],
      ]),
    );
    expect(nuevo).toContain("<p>Ventas &lt;b&gt;&amp; servicio</p>");
    expect(nuevo).toContain("summary: 'It\\'s <\\/script> done'");
    expect(nuevo).toContain('alt="Logo &quot;Acme&quot;"');
    // Y lo que se escribió se vuelve a leer igual.
    const textos = extraerTextos(nuevo).map((s) => s.texto);
    expect(textos).toContain("Ventas <b>& servicio");
    expect(textos).toContain('Logo "Acme"');
  });

  it("la huella cambia si el HTML cambia", () => {
    expect(huellaDelHtml(HTML)).toBe(huellaDelHtml(HTML));
    expect(huellaDelHtml(HTML)).not.toBe(huellaDelHtml(HTML + " "));
  });
});

describe("pareceProsa", () => {
  it("dos palabras o un rótulo con mayúscula", () => {
    expect(pareceProsa("Agente de clientes")).toBe(true);
    expect(pareceProsa("Comercial")).toBe(true);
    expect(pareceProsa("click")).toBe(false);
    expect(pareceProsa("DOMContentLoaded")).toBe(false);
    expect(pareceProsa("https://smarteam.com/x")).toBe(false);
    expect(pareceProsa("#panel")).toBe(false);
  });
});
