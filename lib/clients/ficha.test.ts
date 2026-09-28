import { describe, expect, it } from "vitest";
import {
  CAMPOS_DE_LA_FICHA,
  PREFIJO_PROPIEDAD,
  camposPropuestos,
  camposQueCambiaron,
  cuerpoDeLaNota,
  fusionarPropuesta,
  fichaParaPrompt,
  fichaVacia,
  leerFicha,
  propiedadesParaHubspot,
  textoAHtml,
  validarValores,
  valoresVacios,
  type FichaGuardada,
} from "./ficha";

function fichaConfirmada(valores: Partial<ReturnType<typeof valoresVacios>>): FichaGuardada {
  return { ...fichaVacia(), valores: { ...valoresVacios(), ...valores }, confirmadaAt: "2026-09-27T12:00:00.000Z", confirmadaPor: "Ana" };
}

describe("la ficha: definición", () => {
  it("las propiedades de HubSpot son únicas y todas llevan el prefijo de Nexus", () => {
    const props = CAMPOS_DE_LA_FICHA.flatMap((c) => (c.destino.tipo === "nota" ? [] : [c.destino.propiedad]));
    expect(new Set(props).size).toBe(props.length);
    for (const p of props) expect(p.startsWith(PREFIJO_PROPIEDAD), p).toBe(true);
    // Lo aprobado con Elías: 7 de texto con formato + 1 lista; lo demás, a la nota.
    expect(CAMPOS_DE_LA_FICHA.filter((c) => c.destino.tipo === "texto")).toHaveLength(7);
    expect(CAMPOS_DE_LA_FICHA.filter((c) => c.destino.tipo === "lista")).toHaveLength(1);
  });

  it("⛔ apertura, su porqué, motivación y oportunidades son internos", () => {
    const internos = CAMPOS_DE_LA_FICHA.filter((c) => !c.alCliente).map((c) => c.clave).sort();
    expect(internos).toEqual(["aperturaAsesoria", "motivacionCompra", "oportunidadesFuturas", "porQueApertura"]);
  });
});

describe("validarValores", () => {
  it("limpia espacios y normaliza saltos de línea", () => {
    const r = validarValores({ dolorPrincipal: "  pierde leads\r\n- uno  " });
    expect(r.ok && r.valores.dolorPrincipal).toBe("pierde leads\n- uno");
  });
  it("la apertura solo acepta una opción de la lista", () => {
    expect(validarValores({ aperturaAsesoria: "muchísima" }).ok).toBe(false);
    expect(validarValores({ aperturaAsesoria: "media" }).ok).toBe(true);
    expect(validarValores({ aperturaAsesoria: "" }).ok).toBe(true);
  });
  it("rechaza lo que no es texto", () => {
    expect(validarValores({ stakeholders: 3 }).ok).toBe(false);
    expect(validarValores(null).ok).toBe(false);
  });
});

describe("textoAHtml (lo que ve HubSpot)", () => {
  it("viñetas, numeradas, negrita y párrafos", () => {
    expect(textoAHtml("Intro\n\n- **Ana** — gerente\n- Luis\n\n1. uno\n2. dos")).toBe(
      "<p>Intro</p><ul><li><strong>Ana</strong> — gerente</li><li>Luis</li></ul><ol><li>uno</li><li>dos</li></ol>",
    );
  });
  it("escapa el HTML que escribe el CSE", () => {
    expect(textoAHtml("<script>x</script> & co")).toBe("<p>&lt;script&gt;x&lt;/script&gt; &amp; co</p>");
  });
  it("líneas seguidas quedan en el mismo párrafo con salto", () => {
    expect(textoAHtml("uno\ndos")).toBe("<p>uno<br>dos</p>");
  });
  it("cursiva y títulos", () => {
    expect(textoAHtml("## Título\n*ojo*")).toBe("<p><strong>Título</strong><br><em>ojo</em></p>");
  });
  it("vacío es vacío (limpia la propiedad)", () => {
    expect(textoAHtml("")).toBe("");
  });
});

describe("propiedadesParaHubspot", () => {
  it("solo escribe propiedades, nunca lo que va a la nota", () => {
    const v = { ...valoresVacios(), dolorPrincipal: "x", motivacionCompra: "precio", aperturaAsesoria: "alta" };
    const props = propiedadesParaHubspot(v, ["dolorPrincipal", "motivacionCompra", "aperturaAsesoria"]);
    expect(props).toEqual({ nexus_dolor_principal: "<p>x</p>", nexus_apertura_asesoria: "alta" });
  });
});

describe("camposQueCambiaron", () => {
  it("compara sin espacios de borde, en el orden de la ficha", () => {
    const a = valoresVacios();
    const b = { ...a, stakeholders: "Ana", aQueSeDedica: "x ", dolorPrincipal: "" };
    expect(camposQueCambiaron(a, b)).toEqual(["aQueSeDedica", "stakeholders"]);
  });
});

describe("la nota", () => {
  it("lleva quién, qué cambió, la apertura, su porqué, la motivación y las fuentes", () => {
    const html = cuerpoDeLaNota({
      autor: "Ana <CSE>",
      cambios: ["dolorPrincipal"],
      primeraVez: false,
      valores: { ...valoresVacios(), aperturaAsesoria: "baja", porQueApertura: "pidió solo configurar", motivacionCompra: "- precio" },
      fuentes: ["Sesión de exploración del 12-sep"],
    });
    expect(html).toContain("Ana &lt;CSE&gt;");
    expect(html).toContain("<li>Dolor principal</li>");
    expect(html).toContain("Apertura a la asesoría:</strong> Baja");
    expect(html).toContain("pidió solo configurar");
    expect(html).toContain("<li>precio</li>");
    expect(html).toContain("<li>Sesión de exploración del 12-sep</li>");
  });
});

describe("fichaParaPrompt", () => {
  const ficha = fichaConfirmada({
    aQueSeDedica: "Fundación universitaria",
    stakeholders: "- Ana — directora — sponsor — escéptica",
    aperturaAsesoria: "baja",
    motivacionCompra: "Se lo pidió la rectoría",
    oportunidadesFuturas: "Service Hub",
  });

  it("⛔ para un documento del cliente no entra NADA interno", () => {
    const t = fichaParaPrompt(ficha, { paraDocumentoDelCliente: true });
    expect(t).toContain("Fundación universitaria");
    expect(t).not.toContain("Baja");
    expect(t).not.toContain("rectoría");
    expect(t).not.toContain("Service Hub");
    expect(t).toContain("NUNCA la postura");
  });

  it("para uso interno entra todo, marcado", () => {
    const t = fichaParaPrompt(ficha, { paraDocumentoDelCliente: false });
    expect(t).toContain("Apertura a la asesoría (INTERNO — nunca se cita al cliente)\nBaja");
    expect(t).toContain("rectoría");
  });

  it("sin confirmar, el agente no recibe nada (ni una propuesta)", () => {
    const sin: FichaGuardada = {
      ...fichaVacia(),
      propuesta: { valores: { dolorPrincipal: "x" }, fuentes: [], fuentesPorCampo: {}, at: "", origen: "" },
    };
    expect(fichaParaPrompt(sin, { paraDocumentoDelCliente: false })).toBe("");
  });
});

describe("fusionarPropuesta: la propuesta ACUMULA", () => {
  const confirmada = fichaConfirmada({ dolorPrincipal: "- pierde leads" });

  it("la primera fuente crea la propuesta con sus fuentes por campo", () => {
    const r = fusionarPropuesta(
      confirmada,
      [{ clave: "retosEstrategicos", valor: "- crecer 20 %", fuentes: ["Sesión «A» del 1 sept"] }],
      "Sesiones",
    );
    expect(r.cambiados).toEqual(["retosEstrategicos"]);
    expect(r.ficha.propuesta?.valores.retosEstrategicos).toBe("- crecer 20 %");
    expect(r.ficha.propuesta?.fuentesPorCampo.retosEstrategicos).toEqual(["Sesión «A» del 1 sept"]);
    expect(r.ficha.propuesta?.origen).toBe("Sesiones");
    // Lo confirmado no se toca: solo la propuesta.
    expect(r.ficha.valores).toEqual(confirmada.valores);
  });

  it("una segunda fuente suma sin borrar lo que propuso la primera", () => {
    const a = fusionarPropuesta(confirmada, [{ clave: "retosEstrategicos", valor: "- crecer", fuentes: ["S-A"] }], "Sesiones").ficha;
    const b = fusionarPropuesta(
      a,
      [
        { clave: "retosEstrategicos", valor: "- crecer\n- abrir Panamá", fuentes: ["S-B"] },
        { clave: "stakeholders", valor: "- Ana — CEO", fuentes: ["S-B"] },
      ],
      "Handoff",
    );
    expect(b.ficha.propuesta?.valores).toEqual({ retosEstrategicos: "- crecer\n- abrir Panamá", stakeholders: "- Ana — CEO" });
    expect(b.ficha.propuesta?.fuentesPorCampo.retosEstrategicos).toEqual(["S-A", "S-B"]);
    expect(b.ficha.propuesta?.fuentes).toEqual(["S-A", "S-B"]);
    expect(b.ficha.propuesta?.origen).toBe("Varias fuentes");
  });

  it("descarta lo que no aporta: igual a lo vigente, vacío, clave inventada o apertura fuera de lista", () => {
    const r = fusionarPropuesta(
      confirmada,
      [
        { clave: "dolorPrincipal", valor: "- pierde leads  ", fuentes: ["x"] },
        { clave: "stakeholders", valor: "   ", fuentes: ["x"] },
        { clave: "presupuesto", valor: "mucho", fuentes: ["x"] },
        { clave: "aperturaAsesoria", valor: "altísima", fuentes: ["x"] },
      ],
      "Sesiones",
    );
    expect(r.cambiados).toEqual([]);
    expect(r.ficha).toBe(confirmada);
  });

  it("camposPropuestos cuenta solo lo que cambiaría algo confirmado", () => {
    const r = fusionarPropuesta(confirmada, [{ clave: "aperturaAsesoria", valor: "alta", fuentes: ["x"] }], "Sesiones");
    expect(camposPropuestos(r.ficha)).toEqual(["aperturaAsesoria"]);
    expect(camposPropuestos(confirmada)).toEqual([]);
  });
});

describe("leerFicha", () => {
  it("tolera null, basura y claves desconocidas", () => {
    expect(leerFicha(null)).toEqual(fichaVacia());
    expect(leerFicha("x")).toEqual(fichaVacia());
    const f = leerFicha({ valores: { dolorPrincipal: "d", otra: "z", stakeholders: 4 }, confirmadaAt: "2026-01-01" });
    expect(f.valores.dolorPrincipal).toBe("d");
    expect((f.valores as Record<string, unknown>).otra).toBeUndefined();
    expect(f.valores.stakeholders).toBe("");
    expect(f.confirmadaAt).toBe("2026-01-01");
  });
});
