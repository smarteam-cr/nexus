import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fotoDePrueba, HOY } from "./__fixtures__/foto";
import { leerFoto } from "./foto";
import { insightsDeLaFotoAnterior, leerFotoAnterior, ROTULO_DE_LA_VERSION_ANTERIOR } from "./foto-anterior";
import { filasDelListado } from "./listado";

/**
 * lib/auditoria-portal/foto-anterior.test.ts — UNA AUDITORÍA DE ANTES DEL REDISEÑO SE SIGUE VIENDO.
 *
 * Correr: `npx vitest run --project unit lib/auditoria-portal/foto-anterior.test.ts`.
 *
 * Hay tres en producción (2026-04-22, sin cliente, con `data.insights`). `leerFoto` las devuelve
 * `null` (no se migran ni se reescriben) y la ficha mostraba solo «es de la versión anterior»: se
 * dejaban de ver los embudos, los propietarios y los insights que ya se pagaron. Esto cuida que la
 * vista de solo lectura los saque de la foto vieja. La edición que la pone en rojo: dejar de leer
 * `data.insights.insights`, o que la página vuelva a mostrar solo el aviso.
 */

/** Una foto con la forma de `LifecycleSnapshot` hasta 67d0638a. Datos inventados: ningún portal real. */
const FOTO_VIEJA = {
  capturedAt: "2026-04-22T15:30:00.000Z",
  lifecycleStats: {
    contacts: [
      { value: "subscriber", label: "Suscriptor", count: 120 },
      { value: "lead", label: "Lead", count: 300 },
      { value: "customer", label: "Cliente", count: 80 },
      { value: "evangelist", label: "Evangelista", count: 0 },
    ],
    companies: [{ value: "customer", label: "Cliente", count: 40 }],
    totalContacts: 600,
    totalCompanies: 40,
    totalDeals: 25,
    totalTickets: 0,
    lifecycleWorkflows: ["Asigna lead al llenar el formulario"],
  },
  ownerStats: {
    owners: [
      { ownerId: "1", ownerName: "Ana", contactCount: 100 },
      { ownerId: "2", ownerName: "Beto", contactCount: 350 },
    ],
    unassigned: 150,
    totalAssigned: 450,
    monthlyAssignments: [
      { month: "2026-03", label: "Mar 26", count: 20 },
      { month: "2026-04", label: "Abr 26", count: 5 },
    ],
    monthlyCreated: [
      { month: "2026-03", label: "Mar 26", count: 40 },
      { month: "2026-04", label: "Abr 26", count: 10 },
    ],
  },
  insights: {
    generatedAt: "2026-04-22T15:35:00.000Z",
    insights: [
      { widgetKey: "stats", title: "Portal pequeño y ordenado", comment: "Pocos negocios para tantos contactos.", severity: "positive", recommendations: [] },
      {
        widgetKey: "owner_assignment",
        title: "Un cuarto de los contactos sin dueño",
        comment: "150 contactos no tienen propietario.",
        severity: "critical",
        recommendations: ["Asignar por rotación", "  ", "Revisar la importación"],
      },
      { widgetKey: "contacts_funnel", title: "Muchos leads", comment: "La mitad está en lead.", severity: "warning", recommendations: ["Calificar"] },
    ],
  },
};

describe("la foto de la versión anterior, en solo lectura", () => {
  it("es justo la que `leerFoto` no lee (la premisa)", () => {
    expect(leerFoto(FOTO_VIEJA)).toBeNull();
  });

  it("⭐ saca los insights de `data.insights.insights`, de lo más grave a lo que está bien", () => {
    const { insights, generadosEn } = insightsDeLaFotoAnterior(FOTO_VIEJA);
    expect(generadosEn).toBe("2026-04-22T15:35:00.000Z");
    expect(insights.map((i) => i.titulo)).toEqual(["Un cuarto de los contactos sin dueño", "Muchos leads", "Portal pequeño y ordenado"]);
    expect(insights[0]).toEqual({
      seccion: "Propietarios",
      titulo: "Un cuarto de los contactos sin dueño",
      comentario: "150 contactos no tienen propietario.",
      severidad: "critical",
      recomendaciones: ["Asignar por rotación", "Revisar la importación"],
    });
    // La vista completa trae los mismos.
    expect(leerFotoAnterior(FOTO_VIEJA)?.insights).toEqual(insights);
  });

  it("los totales, los embudos (con «Sin etapa»), los workflows y los propietarios, como se guardaron", () => {
    const f = leerFotoAnterior(FOTO_VIEJA)!;
    expect(f.capturadaEn).toBe("2026-04-22T15:30:00.000Z");
    expect(f.totales).toEqual({ contactos: 600, empresas: 40, negocios: 25, tickets: 0 });
    expect(f.contactosPorEtapa).toEqual([
      { etiqueta: "Suscriptor", valor: 120 },
      { etiqueta: "Lead", valor: 300 },
      { etiqueta: "Cliente", valor: 80 },
      { etiqueta: "Sin etapa", valor: 100 },
    ]);
    expect(f.empresasPorEtapa).toEqual([{ etiqueta: "Cliente", valor: 40 }]);
    expect(f.workflows).toEqual(["Asigna lead al llenar el formulario"]);
    expect(f.propietarios).toEqual({
      porPropietario: [
        { nombre: "Beto", contactos: 350 },
        { nombre: "Ana", contactos: 100 },
      ],
      sinPropietario: 150,
      asignados: 450,
      meses: [
        { etiqueta: "Mar 26", creados: 40, asignados: 20 },
        { etiqueta: "Abr 26", creados: 10, asignados: 5 },
      ],
    });
  });

  it("acepta la lista de insights suelta y no inventa nada de lo que falta o viene torcido", () => {
    const torcida = {
      lifecycleStats: { totalContacts: "mil", contacts: "nada" },
      insights: [{ title: "Solo título", severity: "rarísima" }, { comment: "" }, 7],
    };
    const f = leerFotoAnterior(torcida)!;
    expect(f.totales).toBeNull();
    expect(f.contactosPorEtapa).toEqual([]);
    expect(f.propietarios).toBeNull();
    expect(f.insights).toEqual([{ seccion: null, titulo: "Solo título", comentario: "", severidad: "info", recomendaciones: [] }]);
    expect(f.insightsGeneradosEn).toBeNull();
  });

  it("una foto de la versión de hoy, o algo que no es una foto, no se lee como anterior", () => {
    expect(leerFotoAnterior(fotoDePrueba())).toBeNull();
    expect(leerFotoAnterior(null)).toBeNull();
    expect(leerFotoAnterior([FOTO_VIEJA])).toBeNull();
  });

  it("el listado la sigue listando, marcada «vieja» y sin números inventados", () => {
    const [fila] = filasDelListado(
      [{ id: "v1", name: "Abril", createdAt: new Date("2026-04-22"), accountId: null, clientId: null, clienteNombre: null, esDelSistema: true, data: FOTO_VIEJA }],
      HOY,
    );
    expect(fila).toMatchObject({ id: "v1", estado: "vieja", contactos: null });
  });

  it("⭐ la ficha la pinta en solo lectura con su rótulo, en vez de solo avisar", () => {
    const raiz = process.cwd();
    const pagina = fs.readFileSync(path.join(raiz, "app", "(shell)", "audits", "[id]", "page.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const i = pagina.indexOf("if (!foto) {");
    expect(i, "la ficha ya no tiene la rama de la foto vieja").toBeGreaterThan(-1);
    const rama = pagina.slice(i, pagina.indexOf("const acciones =", i));
    expect(rama).toContain("leerFotoAnterior(audit.data)");
    expect(rama).toContain("<FotoAnteriorDeAuditoria foto={anterior} />");
    const vista = fs.readFileSync(path.join(raiz, "components", "auditoria", "FotoAnterior.tsx"), "utf8");
    expect(vista).toContain("title={ROTULO_DE_LA_VERSION_ANTERIOR}");
    expect(ROTULO_DE_LA_VERSION_ANTERIOR).toBe("Auditoría de la versión anterior (solo lectura)");
  });
});
