/**
 * lib/cobranza/sociedades.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/sociedades.test.ts --project unit`.
 *
 * Los nombres son los del libro de Alex y los de las cuentas de Nexus, medidos el 2026-09-12. Cada caso
 * es un par que tiene que encontrarse (o no confundirse) sin que nadie teclee nada.
 */
import { describe, it, expect } from "vitest";
import {
  candidatasPorNombre,
  choqueDeSociedad,
  claveFactura,
  claveSociedad,
  identidadDelNombre,
  resolverSociedad,
  type SociedadAntes,
  type SociedadConocida,
  type SociedadQueFactura,
} from "./sociedades";

describe("claveSociedad: la factura y la cuenta dan la misma clave", () => {
  it.each([
    ["Visual Branding, S.A. de C.V", "Visual Branding"],
    ["Real Shipping and Trade, SA DE CV", "Real Shipping & Trade"],
    ["CORPORACION ALMOTEC SOCIEDAD ANONIMA", "Corporación Almotec S.A"],
    ["SOLIS ELECTRICA SOCIEDAD DE RESPONSABILIDAD LIMITADA", "Solís Eléctrica S.R.L."],
    ["DESARROLLOS CULTURALES COSTARRICENSES D C C SOCIEDAD ANONIMA", "Desarrollos Culturales Costarricenses DCC, S.A.,"],
    ["INSIDER DIGITAL SOCIEDAD ANONIMA DE CAPITAL VARIABLE / IDI220418NB4", "Insider Digital"],
    ["Atom Chat INC", "Atom Chat"],
  ])("«%s» ≡ «%s»", (libro, nexus) => {
    expect(claveSociedad(libro)).toBe(claveSociedad(nexus));
    expect(claveSociedad(libro)).not.toBe("");
  });

  it("no deja adentro la forma jurídica ni la cédula pegada", () => {
    expect(claveSociedad("Atlas Mining & Construction, S.A. I 7208610-6")).toBe("atlas mining construction");
    expect(claveSociedad("Metzger Industrial Supplies, s. a. de c. v I NIT: 0614-030512-103-5 I NRC: 216725-2")).toBe(
      "metzger industrial supplies",
    );
  });

  it("una sociedad sin más nombre que su número se queda con el número", () => {
    expect(claveSociedad("3-101-721431 SOCIEDAD ANONIMA")).toBe("3101721431");
  });

  it("vacío da vacío", () => {
    expect(claveSociedad("")).toBe("");
    expect(claveSociedad(null)).toBe("");
  });
});

describe("identidadDelNombre: lo que el libro pega al nombre", () => {
  it("la cédula detrás de « I »", () => {
    const i = identidadDelNombre("Multiquimica Dominicana, S.A I 1-01-10772-3");
    expect(i.cedula).toBe("101107723");
    expect(i.clave).toBe("multiquimica dominicana");
  });

  it("el paréntesis sin números es el alias; con números, la cédula", () => {
    expect(identidadDelNombre("CONSTRULOGIX S.A (Construtecho)")).toMatchObject({ alias: "Construtecho", cedula: null });
    expect(identidadDelNombre("APPTIVIDAD MEXICO SAPI DE CV (AME190327894)")).toMatchObject({
      alias: null,
      cedula: "190327894",
      clave: "apptividad mexico",
    });
  });

  it("⚠ « I » antes de un nombre no es una cédula: «O4Bi I Rempro» es el cliente de O4Bi", () => {
    expect(identidadDelNombre("O4Bi I Rempro")).toMatchObject({ clave: "o4bi rempro", cedula: null });
  });

  it("el RFC de una persona física cuenta como cédula", () => {
    expect(identidadDelNombre("LUIS ALBERTO CORTES ALVARADO I COAL780221HR9")).toMatchObject({
      clave: "luis alberto cortes alvarado",
      cedula: "7802219",
    });
  });
});

describe("candidatasPorNombre: propone, del escalón más fuerte, y nunca elige entre dos", () => {
  const cuentas: SociedadConocida[] = [
    { id: "alliance", nombres: ["Alliance RH", "LUIS ALBERTO CORTES ALVARADO"], cedula: "COAL780221HR9" },
    { id: "visual", nombres: ["Visual Branding"] },
    { id: "visual-group", nombres: ["Visual Branding Group"] },
    { id: "construtecho", nombres: ["Construtecho"] },
    { id: "oceanica", nombres: ["Clínica Oceanica"] },
    { id: "cav", nombres: ["Club de Amantes del Vino"] },
    { id: "libreria-1", nombres: ["Librería Internacional"], cedula: "3101167504" },
    { id: "libreria-2", nombres: ["Librería Internacional (Desarrollos Culturales Costa Rica)"], cedula: "3-101-167504" },
    { id: "noelito", nombres: ["Ferreteria Noelito"] },
  ];

  it("la cédula manda sobre el nombre", () => {
    expect(candidatasPorNombre("LUIS ALBERTO CORTES ALVARADO I COAL780221HR9", cuentas)).toEqual([{ id: "alliance", via: "CEDULA" }]);
  });

  it("el nombre exacto le gana al parcial", () => {
    expect(candidatasPorNombre("Visual Branding, S.A. de C.V", cuentas)).toEqual([{ id: "visual", via: "NOMBRE" }]);
  });

  it("el alias entre paréntesis encuentra la cuenta", () => {
    expect(candidatasPorNombre("CONSTRULOGIX S.A (Construtecho)", cuentas)).toEqual([{ id: "construtecho", via: "ALIAS" }]);
  });

  it("parcial: «Oceanica» está en «Clínica Oceanica»", () => {
    expect(candidatasPorNombre("Oceanica ", cuentas)).toEqual([{ id: "oceanica", via: "PARCIAL" }]);
  });

  it("siglas: «CAV» es «Club de Amantes del Vino»", () => {
    expect(candidatasPorNombre("CAV", cuentas)).toEqual([{ id: "cav", via: "SIGLAS" }]);
  });

  it("⚠ dos cuentas con el mismo nombre salen las dos: no se elige", () => {
    expect(candidatasPorNombre("Librería Internacional", cuentas).map((c) => c.id)).toEqual(["libreria-1", "libreria-2"]);
  });

  it("la persona que factura no siempre se llama como la empresa: sin candidatas, vacío", () => {
    expect(candidatasPorNombre("Javier Noel López Pravia", cuentas)).toEqual([]);
  });
});

/* ── Etapa 12 · Una empresa, varias sociedades que facturan ───────────────────────── */

describe("etapa 12 · claveFactura: única por plataforma y nombre en factura, sin cédula", () => {
  it("la misma sociedad escrita de dos formas da la misma clave", () => {
    expect(claveFactura("Quirinale Group, S.A.")).toBe(claveFactura("QUIRINALE GROUP SA"));
    expect(claveFactura("Ingeniería Verde, S.A. I 1234567-8")).toBe(claveFactura("Ingenieria Verde"));
  });

  it("⚠ lo que va entre paréntesis SÍ distingue: son dos nombres en factura", () => {
    expect(claveFactura("Librería Internacional (Desarrollos Culturales Costa Rica)")).not.toBe(
      claveFactura("Librería Internacional"),
    );
  });
});

describe("etapa 12 · choqueDeSociedad", () => {
  const existentes: SociedadQueFactura[] = [
    { id: "libreria", plataforma: "MERCURY", nombre: "Librería Internacional", odooPartnerId: null, cuentaId: "cta-libreria" },
    {
      id: "odoo-48",
      plataforma: "ODOO",
      nombre: "DESARROLLOS CULTURALES COSTARRICENSES D C C SOCIEDAD ANONIMA",
      odooPartnerId: 48,
      cuentaId: "cta-libreria",
    },
    { id: "quirinale", plataforma: "MERCURY", nombre: "Quirinale Group", odooPartnerId: null, cuentaId: "cta-inb" },
  ];

  it("⭐ Librería Internacional ×2 no choca: la misma cédula, otro nombre en factura", () => {
    expect(
      choqueDeSociedad({ plataforma: "MERCURY", nombre: "Librería Internacional (Desarrollos Culturales Costa Rica)" }, existentes),
    ).toBeNull();
  });

  it("el mismo nombre en la misma plataforma choca, escrito como sea", () => {
    expect(choqueDeSociedad({ plataforma: "MERCURY", nombre: "QUIRINALE GROUP, S.A." }, existentes)?.id).toBe("quirinale");
  });

  it("en otra plataforma no choca, y una ficha de Odoo tampoco: se distingue por su ficha", () => {
    expect(choqueDeSociedad({ plataforma: "OTRA", nombre: "Quirinale Group" }, existentes)).toBeNull();
    expect(
      choqueDeSociedad({ plataforma: "ODOO", nombre: "DESARROLLOS CULTURALES COSTARRICENSES D C C SOCIEDAD ANONIMA" }, existentes),
    ).toBeNull();
  });
});

describe("etapa 12 · ⛔ resolverSociedad nunca elige sola", () => {
  const INB = "cta-inb";
  const yo = "alex@smarteamcr.com";
  const sociedades: SociedadQueFactura[] = [
    { id: "quirinale", plataforma: "MERCURY", nombre: "Quirinale Group", odooPartnerId: null, cuentaId: INB },
    { id: "verde", plataforma: "MERCURY", nombre: "Ingeniería Verde", odooPartnerId: null, cuentaId: INB },
    { id: "teamnet", plataforma: "MERCURY", nombre: "Teamnet Web", odooPartnerId: null, cuentaId: "cta-teamnet" },
  ];
  const sinFacturar: SociedadAntes = { cuentaId: INB, fechaEmisionISO: null, plataformaFactura: null, sociedadFacturadaId: null };
  const facturadoAQuirinale: SociedadAntes = {
    cuentaId: INB,
    fechaEmisionISO: "2026-09-10",
    plataformaFactura: "MERCURY",
    sociedadFacturadaId: "quirinale",
  };

  it("⭐ Grupo INB: dos sociedades por Mercury y ninguna elegida → 400 que las nombra", () => {
    const d = resolverSociedad(sinFacturar, { fechaEmisionISO: "2026-09-10", plataformaFactura: "MERCURY" }, sociedades, yo);
    expect(d).toMatchObject({ tipo: "rechazo", status: 400 });
    expect(d.tipo === "rechazo" && d.mensaje).toContain("«Quirinale Group», «Ingeniería Verde»");
  });

  it("con la sociedad elegida escribe las dos cosas y la bitácora dice quién", () => {
    const d = resolverSociedad(
      sinFacturar,
      { fechaEmisionISO: "2026-09-10", plataformaFactura: "MERCURY", sociedadFacturadaId: "verde" },
      sociedades,
      yo,
    );
    expect(d).toEqual({
      tipo: "escribir",
      plataformaFactura: "MERCURY",
      sociedadFacturadaId: "verde",
      bitacora: "alex@smarteamcr.com anotó que se facturó «Ingeniería Verde» por Mercury.",
    });
  });

  it("⛔ con una sola sociedad en la plataforma tampoco la pone: queda sin anotar", () => {
    const una = sociedades.filter((s) => s.id !== "verde");
    const d = resolverSociedad(sinFacturar, { fechaEmisionISO: "2026-09-10", plataformaFactura: "MERCURY" }, una, yo);
    expect(d).toMatchObject({ tipo: "escribir", plataformaFactura: "MERCURY", sociedadFacturadaId: null });
  });

  it("sin pedido no inventa nada: marcar facturado sin decir dónde no toca la plataforma", () => {
    expect(resolverSociedad(sinFacturar, { fechaEmisionISO: "2026-09-10" }, sociedades, yo)).toEqual({ tipo: "sin-cambios" });
  });

  it("⛔ una sociedad de otra cuenta da 409; una de otra plataforma, 400", () => {
    const pedido = { fechaEmisionISO: "2026-09-10", plataformaFactura: "MERCURY" as const, sociedadFacturadaId: "teamnet" };
    expect(resolverSociedad(sinFacturar, pedido, sociedades, yo)).toMatchObject({ tipo: "rechazo", status: 409 });
    expect(
      resolverSociedad(sinFacturar, { ...pedido, plataformaFactura: "OTRA", sociedadFacturadaId: "quirinale" }, sociedades, yo),
    ).toMatchObject({ tipo: "rechazo", status: 400 });
  });

  it("revertir la factura limpia las dos y deja cuáles eran en la bitácora; pedirlas sin factura es un 400", () => {
    expect(resolverSociedad(facturadoAQuirinale, { fechaEmisionISO: null }, sociedades, yo)).toEqual({
      tipo: "escribir",
      plataformaFactura: null,
      sociedadFacturadaId: null,
      bitacora: "Se quitó a quién se había facturado («Quirinale Group» por Mercury): el cobro dejó de estar facturado.",
    });
    expect(
      resolverSociedad(facturadoAQuirinale, { fechaEmisionISO: null, sociedadFacturadaId: "verde" }, sociedades, yo),
    ).toMatchObject({ tipo: "rechazo", status: 400 });
  });

  it("re-guardar lo mismo no escribe; cambiar la sociedad deja el antes y el después", () => {
    const mismo = { plataformaFactura: "MERCURY" as const, sociedadFacturadaId: "quirinale" };
    expect(resolverSociedad(facturadoAQuirinale, mismo, sociedades, yo)).toEqual({ tipo: "sin-cambios" });
    const d = resolverSociedad(facturadoAQuirinale, { ...mismo, sociedadFacturadaId: "verde" }, sociedades, yo);
    expect(d.tipo === "escribir" && d.bitacora).toBe(
      "alex@smarteamcr.com cambió a quién se facturó: «Quirinale Group» por Mercury → «Ingeniería Verde» por Mercury.",
    );
  });

  it("cambiar la plataforma dejando anotada una sociedad de otra es un 400", () => {
    expect(resolverSociedad(facturadoAQuirinale, { plataformaFactura: "OTRA" }, sociedades, yo)).toMatchObject({
      tipo: "rechazo",
      status: 400,
    });
  });

  it("⛔ el número de un documento de Odoo de otro cliente frena la sociedad elegida", () => {
    /* PUBLIMARK está dos veces en Odoo (#75 y #44, el mismo nombre). La factura dice de cuál es. */
    const publimark: SociedadQueFactura[] = [
      { id: "pub-75", plataforma: "ODOO", nombre: "PUBLIMARK SOCIEDAD ANONIMA", odooPartnerId: 75, cuentaId: "cta-pub" },
      { id: "pub-44", plataforma: "ODOO", nombre: "PUBLIMARK SOCIEDAD ANONIMA", odooPartnerId: 44, cuentaId: "cta-pub" },
    ];
    const antes: SociedadAntes = { cuentaId: "cta-pub", fechaEmisionISO: null, plataformaFactura: null, sociedadFacturadaId: null };
    const documento = { numero: "FAC/2026/0209", odooPartnerId: 75, odooPartnerNombre: "PUBLIMARK SOCIEDAD ANONIMA" };
    const pedido = { fechaEmisionISO: "2026-02-12", plataformaFactura: "ODOO" as const };
    expect(resolverSociedad(antes, { ...pedido, sociedadFacturadaId: "pub-44" }, publimark, yo, documento)).toMatchObject({
      tipo: "rechazo",
      status: 409,
    });
    expect(resolverSociedad(antes, { ...pedido, sociedadFacturadaId: "pub-75" }, publimark, yo, documento)).toMatchObject({
      tipo: "escribir",
      sociedadFacturadaId: "pub-75",
    });
  });
});
