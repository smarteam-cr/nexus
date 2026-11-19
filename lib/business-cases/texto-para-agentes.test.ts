import { describe, expect, it } from "vitest";
import { textoDeHtml, textoDeLaPropuestaParaElHandoff } from "./texto-para-agentes";

/* La forma real de la foto publicada (RC Inmobiliaria - Acuerdo Macro, 17 oct 2026), recortada. */
const FOTO = {
  name: "RC Inmobiliaria - Acuerdo Macro",
  sections: [
    {
      key: "hero",
      label: "Encabezado",
      theme: "dark",
      blocks: [{ data: { tags: ["Sales Hub", "Integración Encuentra24 · DocuSign · WhatsApp"], headline: "Conecta la operación comercial", coverImageUrl: "https://x.supabase.co/a.jpg" }, content: null, blockType: "CARD" }],
    },
    {
      key: "custom:html:1",
      label: "Diagrama de flujo",
      blocks: [
        {
          data: {
            html: "<!DOCTYPE html><html><head><style>.card{color:red}</style></head><body><div><strong>2 Ejecutar DocuSign</strong><p>La implementación de DocuSign contempla aproximadamente 40 horas de trabajo Smarteam.</p></div><script>x()</script></body></html>",
          },
          blockType: "CARD",
        },
      ],
    },
    {
      key: "inversion",
      label: "Inversión",
      blocks: [{ data: { lineas: [{ concepto: "Acuerdo Macro: RC Inmobiliaria", recurrencia: "mensual", precioUnitario: "2800" }], moneda: "USD" }, blockType: "CARD" }],
    },
  ],
};

describe("textoDeLaPropuestaParaElHandoff", () => {
  it("lee cada sección con su título, sin HTML, estilos, scripts ni enlaces de imágenes", () => {
    const t = textoDeLaPropuestaParaElHandoff({ nombre: "RC Inmobiliaria - Acuerdo Macro", trato: "RC Inmobiliaria - Acuerdo Macro", publishedSnapshot: FOTO });
    expect(t.startsWith("## Propuesta «RC Inmobiliaria - Acuerdo Macro» (trato «RC Inmobiliaria - Acuerdo Macro»)")).toBe(true);
    expect(t).toContain("### Diagrama de flujo");
    expect(t).toContain("La implementación de DocuSign contempla aproximadamente 40 horas de trabajo Smarteam.");
    expect(t).toContain("Acuerdo Macro: RC Inmobiliaria");
    expect(t).not.toContain("color:red");
    expect(t).not.toContain("x()");
    expect(t).not.toContain("supabase.co");
    expect(t).not.toContain("<");
  });

  it("una foto sin secciones no da texto; una larga se corta y lo dice", () => {
    expect(textoDeLaPropuestaParaElHandoff({ nombre: "X", trato: null, publishedSnapshot: null })).toBe("");
    const t = textoDeLaPropuestaParaElHandoff({ nombre: "X", trato: null, publishedSnapshot: FOTO, max: 40 });
    expect(t).toContain("[… la propuesta sigue; se cortó acá]");
  });

  it("textoDeHtml junta los espacios y respeta los saltos de bloque", () => {
    expect(textoDeHtml("<div>uno</div><div>dos &amp; tres</div>")).toBe("uno\ndos & tres");
  });
});
