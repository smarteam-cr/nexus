/**
 * lib/planificacion/ciclo-y-automatizaciones.test.ts — los dos cambios del 12 nov 2026 (Elías, la planificación de
 * marketing de Cemaco): el ciclo de vida son siempre las 7 etapas de HubSpot, y el detalle técnico de las automatizaciones
 * es del equipo (nunca llega al cliente).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type FC } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ETAPAS_DE_HUBSPOT,
  CAMPOS_TECNICOS_DE_AUTOMATIZACION,
  etapaDeHubspot,
  normalizarCicloDeVida,
  cicloDeVidaGenerado,
  condicionesPropiasDelCiclo,
  sinLoTecnicoDeLaPlanificacion,
} from "./secciones";
import { AutomatizacionesSection, CicloDeVidaSection, DetalleDeAutomatizacion } from "@/components/landing/sections-planificacion";
import { PLANIFICACION_DEF_BY_KEY } from "@/components/landing/configs/planificacion.defs";
import { seccionesParaLaFoto } from "@/lib/projects/publicar-documento";
import { sinLosAvisosDelEquipo } from "@/lib/external/planificacion-view";
import type { LandingContext } from "@/components/landing/types";

const LAS_7 = ["Suscriptor", "Lead", "MQL (Lead calificado por marketing)", "SQL (Lead calificado por ventas)", "Oportunidad", "Cliente", "Promotor"];

describe("el ciclo de vida: siempre las 7 etapas de HubSpot", () => {
  it("las 7, con su nombre y en su orden", () => {
    expect(ETAPAS_DE_HUBSPOT.map((e) => e.etapa)).toEqual(LAS_7);
  });

  it("reconoce cada etapa por sus nombres de siempre, en español o en inglés", () => {
    expect(etapaDeHubspot("Suscriptor")).toBe("suscriptor");
    expect(etapaDeHubspot("Subscriber")).toBe("suscriptor");
    expect(etapaDeHubspot("Lead")).toBe("lead");
    expect(etapaDeHubspot("Cliente potencial")).toBe("lead");
    expect(etapaDeHubspot("Lead calificado")).toBe("mql");
    expect(etapaDeHubspot("MQL (Lead calificado por marketing)")).toBe("mql");
    expect(etapaDeHubspot("Marketing Qualified Lead")).toBe("mql");
    expect(etapaDeHubspot("SQL")).toBe("sql");
    expect(etapaDeHubspot("Lead calificado por ventas")).toBe("sql");
    expect(etapaDeHubspot("Oportunidad")).toBe("oportunidad");
    expect(etapaDeHubspot("Cliente activo")).toBe("cliente");
    expect(etapaDeHubspot("Customer")).toBe("cliente");
    expect(etapaDeHubspot("Promotor")).toBe("promotor");
    expect(etapaDeHubspot("Evangelist")).toBe("promotor");
    expect(etapaDeHubspot("Contacto base")).toBeNull();
    expect(etapaDeHubspot("Depurado")).toBeNull();
    expect(etapaDeHubspot("Otro")).toBeNull();
    expect(etapaDeHubspot("")).toBeNull();
  });

  it("lo que inventó el agente (el caso de Cemaco) no es una etapa: pasa a la condición de la de al lado, y nada se pierde", () => {
    const d = normalizarCicloDeVida({
      intro: "Así queda",
      etapas: [
        { etapa: "Contacto base", entraCuando: "Viene de la base de tiendas", laMueve: "Importación", origen: "acordado" },
        { etapa: "Lead", entraCuando: "Llena un formulario", laMueve: "Formulario", origen: "acordado" },
        { etapa: "Depurado", entraCuando: "Se validó su correo", laMueve: "Marketing", origen: "propuesta" },
        { etapa: "Cliente activo", entraCuando: "Compró en los últimos 12 meses", laMueve: "Automatización", origen: "acordado", cambio: "nueva" },
      ],
    });
    expect(d.etapas.map((e) => e.etapa)).toEqual(LAS_7);
    expect(d.intro).toBe("Así queda");
    const por = Object.fromEntries(d.etapas.map((e) => [e.etapa, e]));
    // «Contacto base» era la primera: va a la de después (Lead). «Depurado» estaba después de Lead: también queda en Lead.
    expect(por.Lead.entraCuando).toBe(
      "Llena un formulario · También «Contacto base»: Viene de la base de tiendas · También «Depurado»: Se validó su correo",
    );
    // Lo más débil manda: Lead se acordó, pero «Depurado» era una propuesta.
    expect(por.Lead.origen).toBe("propuesta");
    // Quién la mueve tampoco se pierde.
    expect(por.Lead.laMueve).toBe("Formulario · Importación · Marketing");
    expect(d.etapas.filter((e) => e.entraCuando.includes("Contacto base"))).toHaveLength(1);
    // El nombre propio del cliente queda dicho en la condición.
    expect(por.Cliente.entraCuando).toBe("«Cliente activo»: Compró en los últimos 12 meses");
    expect(por.Cliente.laMueve).toBe("Automatización");
    // Las que el agente no escribió llevan la definición de HubSpot, como propuesta.
    expect(por.Promotor.entraCuando).toBe(ETAPAS_DE_HUBSPOT[6].entraCuando);
    expect(por.Promotor.origen).toBe("propuesta");
    // El «cambio» ya no aplica.
    expect(d.etapas.every((e) => e.cambio === undefined)).toBe(true);
  });

  it("la regla de los equipos: SQL lo mueve Ventas al aceptar el MQL si nadie dijo otra cosa", () => {
    const sql = normalizarCicloDeVida({ etapas: [] }).etapas.find((e) => e.etapa.startsWith("SQL"))!;
    expect(sql.entraCuando).toMatch(/Ventas acepta el MQL/);
    expect(sql.laMueve).toMatch(/Ventas/);
  });

  it("dos filas para la misma etapa: la primera manda y la otra se suma a su condición", () => {
    const d = normalizarCicloDeVida({
      etapas: [
        { etapa: "Cliente", entraCuando: "Gana un negocio" },
        { etapa: "Cliente recurrente", entraCuando: "Compra dos veces" },
      ],
    });
    expect(d.etapas.find((e) => e.etapa === "Cliente")!.entraCuando).toBe("Gana un negocio · «Cliente recurrente»: Compra dos veces");
  });

  it("lo de Cemaco: lo que va antes de «Cliente activo» no se vuelve cliente, y los estados del cliente se suman a Cliente", () => {
    const d = normalizarCicloDeVida({
      etapas: [
        { etapa: "Contacto en base", entraCuando: "Llega del ERP con cédula válida" },
        { etapa: "Contacto depurado", entraCuando: "Tiene los campos mínimos y no está duplicado" },
        { etapa: "Cliente activo", entraCuando: "Tiene al menos una factura del ERP" },
        { etapa: "Cliente segmentado", entraCuando: "Cumple un segmento" },
        { etapa: "Cliente de alto valor", entraCuando: "Supera los umbrales" },
      ],
    });
    const por = Object.fromEntries(d.etapas.map((e) => [e.etapa, e.entraCuando]));
    expect(por.Lead).toContain("«Contacto en base»: Llega del ERP con cédula válida");
    expect(por.Lead).toContain("«Contacto depurado»");
    expect(por.Cliente).toBe(
      "«Cliente activo»: Tiene al menos una factura del ERP · «Cliente segmentado»: Cumple un segmento · «Cliente de alto valor»: Supera los umbrales",
    );
    expect(d.etapas.map((e) => e.etapa)).toEqual(LAS_7);
  });

  it("lo que va antes de Suscriptor queda en Suscriptor", () => {
    const d = normalizarCicloDeVida({ etapas: [{ etapa: "Visitante", entraCuando: "Entra al sitio" }, { etapa: "Suscriptor", entraCuando: "Se suscribe" }] });
    expect(d.etapas[0].entraCuando).toBe("Se suscribe · También «Visitante»: Entra al sitio");
  });

  it("normalizar dos veces da lo mismo (el script aplica una propuesta ya normalizada)", () => {
    const una = normalizarCicloDeVida({
      etapas: [{ etapa: "Contacto base", entraCuando: "x" }, { etapa: "Cliente activo", entraCuando: "y" }],
      estadosLead: [{ estado: "Depurado" }],
    });
    expect(normalizarCicloDeVida(una, {})).toEqual(una);
  });

  it("sin ninguna etapa reconocible, lo del cliente va a Lead", () => {
    const d = normalizarCicloDeVida({ etapas: [{ etapa: "Base fría", entraCuando: "Nunca respondió" }] });
    expect(d.etapas.find((e) => e.etapa === "Lead")!.entraCuando).toContain("También «Base fría»: Nunca respondió");
  });

  it("los estados del lead que escribió una persona se quedan, y se suman los nuevos sin repetir", () => {
    const d = normalizarCicloDeVida(
      { etapas: [], estadosLead: [{ estado: "en contacto", significa: "otro" }, { estado: "Depurado", significa: "Correo validado" }] },
      { estadosLead: [{ estado: "Nuevo", significa: "Recién llegó" }, { estado: "En contacto", significa: "Hablamos" }] },
    );
    expect(d.estadosLead!.map((e) => e.estado)).toEqual(["Nuevo", "En contacto", "Depurado"]);
    expect(d.estadosLead![1].significa).toBe("Hablamos");
  });

  it("al generar: si el agente no devolvió etapas y el documento ya tenía, se queda lo que había y se suman los estados nuevos", () => {
    const previo = { intro: "A mano", etapas: [{ etapa: "Lead", entraCuando: "Escrito a mano" }], estadosLead: [{ estado: "Nuevo" }, { estado: "En contacto" }] };
    expect(cicloDeVidaGenerado({ intro: "", etapas: [], estadosLead: [{ estado: "Depurado" }, { estado: "nuevo" }] }, previo)).toEqual({
      ...previo,
      estadosLead: [{ estado: "Nuevo" }, { estado: "En contacto" }, { estado: "Depurado" }],
    });
    // Sin nada antes, las 7.
    expect((cicloDeVidaGenerado({ intro: "", etapas: [] }, undefined) as { etapas: unknown[] }).etapas).toHaveLength(7);
    // Con algo del agente, las 7.
    expect((cicloDeVidaGenerado({ etapas: [{ etapa: "Depurado" }] }, previo) as { etapas: unknown[] }).etapas).toHaveLength(7);
  });

  it("una SALIDA del embudo no es condición de entrada: va al estado del lead", () => {
    expect(etapaDeHubspot("Lead descalificado")).toBeNull();
    expect(etapaDeHubspot("Lead no calificado")).toBeNull();
    expect(etapaDeHubspot("Cliente perdido")).toBeNull();
    expect(etapaDeHubspot("Ex cliente")).toBeNull();
    const d = normalizarCicloDeVida({
      etapas: [
        { etapa: "Lead", entraCuando: "Llena un formulario" },
        { etapa: "Lead descalificado", entraCuando: "No cumple el perfil", origen: "acordado" },
        { etapa: "Cliente perdido", entraCuando: "No compra hace dos años" },
      ],
    });
    expect(d.etapas.map((e) => e.etapa)).toEqual(LAS_7);
    expect(d.etapas.some((e) => /No cumple el perfil|dos años/.test(e.entraCuando))).toBe(false);
    expect(d.estadosLead).toEqual([
      { estado: "Lead descalificado", significa: "No cumple el perfil", origen: "acordado" },
      { estado: "Cliente perdido", significa: "No compra hace dos años", origen: "" },
    ]);
  });

  it("el origen: un supuesto sumado deja la fila en supuesto; lo acordado sumado a la definición de HubSpot queda propuesta", () => {
    const d = normalizarCicloDeVida({
      etapas: [
        { etapa: "Lead", entraCuando: "Formulario", origen: "acordado" },
        { etapa: "Depurado", entraCuando: "Correo validado", origen: "supuesto" },
        { etapa: "Cliente activo", entraCuando: "Factura", origen: "acordado" },
      ],
    });
    expect(d.etapas.find((e) => e.etapa === "Lead")!.origen).toBe("supuesto");
    expect(d.etapas.find((e) => e.etapa === "Cliente")!.origen).toBe("acordado");
    const soloSumado = normalizarCicloDeVida({ etapas: [{ etapa: "Base", entraCuando: "x", origen: "acordado" }] });
    expect(soloSumado.etapas.find((e) => e.etapa === "Lead")!.origen).toBe("propuesta");
  });

  it("la lista de construcción cuenta las condiciones propias del cliente, no las definiciones de HubSpot", () => {
    expect(condicionesPropiasDelCiclo(normalizarCicloDeVida({ etapas: [] }).etapas)).toBe(0);
    expect(condicionesPropiasDelCiclo(normalizarCicloDeVida({ etapas: [{ etapa: "Cliente activo", entraCuando: "Factura" }] }).etapas)).toBe(1);
  });

  it("el esquema del agente no pide `cambio`, pide los estados del lead, y la guía nombra las 7", () => {
    const def = PLANIFICACION_DEF_BY_KEY.ciclo_vida_crm;
    const props = (def.schema as { properties: Record<string, { items?: { properties?: Record<string, unknown> } }> }).properties;
    expect(Object.keys(props.etapas.items!.properties!)).not.toContain("cambio");
    expect(props.estadosLead).toBeTruthy();
    for (const e of LAS_7) expect(def.brief).toContain(e);
    expect(def.brief).toMatch(/NUNCA crees, renombres ni quites/);
  });

  it("lo que una persona escribió a mano se lee como está (la regla se aplica al generar, no al leer)", () => {
    const out = renderToStaticMarkup(
      createElement(CicloDeVidaSection as unknown as FC<Record<string, unknown>>, {
        data: { etapas: [{ etapa: "Contacto base", entraCuando: "x", cambio: "nueva" }] },
        ctx: { clientName: "Cemaco" },
      }),
    );
    expect(out).toContain("Contacto base");
    // Hay una fila que cambia: la columna se ve.
    expect(out).toContain("Cambio");
  });

  it("con las 7 de HubSpot, la columna «Cambio» no aparece", () => {
    const out = renderToStaticMarkup(
      createElement(CicloDeVidaSection as unknown as FC<Record<string, unknown>>, { data: normalizarCicloDeVida({ etapas: [] }), ctx: { clientName: "Cemaco" } }),
    );
    expect(out).toContain("Promotor");
    expect(out).not.toContain("<th>Cambio</th>");
  });
});

/* ── Automatizaciones ─────────────────────────────────────────────────────── */

const AUTO = {
  nombre: "Asignar el lead",
  donde: "Contacto · Marketing Hub",
  cuando: "Llena el formulario del sitio",
  hace: "Lo asigna al asesor de su tienda",
  resuelve: "Que ningún lead quede sin dueño",
  origen: "acordado",
  condicion: "COND-SECRETA",
  siCumple: "RAMA-SI",
  noCumple: "RAMA-NO",
  vista: "VISTA-SECRETA",
  considerar: "OJO-SECRETO",
  falta: "FALTA-SECRETA",
  fuente: "REUNION-SECRETA",
};
const TECNICOS = ["COND-SECRETA", "RAMA-SI", "RAMA-NO", "VISTA-SECRETA", "OJO-SECRETO", "FALTA-SECRETA", "REUNION-SECRETA"];

function pintar(ctx: Partial<LandingContext>, editable = false): string {
  return renderToStaticMarkup(
    createElement(AutomatizacionesSection as unknown as FC<Record<string, unknown>>, { data: { items: [AUTO] }, ctx: { clientName: "Cemaco", ...ctx }, editable, onChange: () => {} }),
  );
}

describe("automatizaciones: una fila por automatización, lo técnico solo para el equipo", () => {
  it("las columnas que lee el cliente", () => {
    const out = pintar({});
    for (const c of ["Automatización", "Cuándo pasa", "Qué hace", "Para qué sirve", "Estado"]) expect(out).toContain(`<th>${c}</th>`);
    for (const v of [AUTO.nombre, AUTO.donde, AUTO.cuando, AUTO.hace, AUTO.resuelve, "Acordado"]) expect(out).toContain(v);
  });

  it("el cliente (sin la marca del equipo) no ve ni el botón ni nada técnico", () => {
    const out = pintar({});
    expect(out).not.toContain("Ver detalle");
    for (const t of TECNICOS) expect(out).not.toContain(t);
  });

  it("el PDF tampoco, aunque lo pida el editor del equipo", () => {
    const out = pintar({ pdfMode: true, planificacion: { delEquipo: true } });
    expect(out).not.toContain("Ver detalle");
    for (const t of TECNICOS) expect(out).not.toContain(t);
  });

  it("el equipo ve «Ver detalle», plegado, y avisa si falta definir algo", () => {
    const out = pintar({ planificacion: { delEquipo: true } });
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain("Ver detalle · falta definir algo");
    expect(out).toContain("stl-plan-ver-detalle--falta");
    // Plegado: lo técnico no está pintado hasta abrirlo.
    expect(out).not.toContain("RAMA-SI");
  });

  it("en edición, el equipo puede abrir el detalle aunque esté vacío (para escribirlo)", () => {
    const out = renderToStaticMarkup(
      createElement(AutomatizacionesSection as unknown as FC<Record<string, unknown>>, {
        data: { items: [{ nombre: "Sin detalle" }] },
        ctx: { clientName: "Cemaco", planificacion: { delEquipo: true } },
        editable: true,
        onChange: () => {},
      }),
    );
    expect(out).toContain(">Ver detalle<");
  });

  it("el detalle abierto trae todo lo técnico, con sus rótulos", () => {
    const out = renderToStaticMarkup(createElement(DetalleDeAutomatizacion, { a: AUTO, onCambio: () => {} }));
    for (const t of TECNICOS) expect(out).toContain(t);
    for (const r of ["Si…", "Se cumple", "No se cumple", "Vista", "Ten en cuenta", "Falta", "Reunión que la respalda", "Solo lo ve el equipo"]) {
      expect(out).toContain(r);
    }
  });

  it("lo viejo (los procesos de marketing de Ejecución) se sigue leyendo", () => {
    const out = renderToStaticMarkup(
      createElement(AutomatizacionesSection as unknown as FC<Record<string, unknown>>, { data: { items: [{ title: "Scoring", detail: "Suma puntos" }] }, ctx: { clientName: "x" } }),
    );
    expect(out).toContain("Scoring");
    expect(out).toContain("Suma puntos");
  });
});

describe("lo técnico no sale hacia el cliente", () => {
  it("se saca de la data de las automatizaciones; lo demás queda igual", () => {
    const limpia = sinLoTecnicoDeLaPlanificacion("automatizaciones", { intro: "i", items: [AUTO] }) as { intro: string; items: Array<Record<string, unknown>> };
    expect(limpia.intro).toBe("i");
    expect(Object.keys(limpia.items[0]).sort()).toEqual(["cuando", "donde", "hace", "nombre", "origen", "resuelve"]);
    for (const k of CAMPOS_TECNICOS_DE_AUTOMATIZACION) expect(limpia.items[0]).not.toHaveProperty(k);
    // Otra sección, intacta (aunque tenga un campo con el mismo nombre).
    const otra = { items: [{ nombre: "x", falta: "algo" }] };
    expect(sinLoTecnicoDeLaPlanificacion("conversaciones", otra)).toBe(otra);
  });

  it("cada camino hacia el cliente pasa por la limpieza, y cada generador por las 7 etapas (si alguien la quita, esto se pone rojo)", () => {
    const leer = (f: string) => readFileSync(join(process.cwd(), f), "utf-8");
    for (const f of ["lib/external/artefacto-view.ts", "lib/external/planificacion-view.ts", "lib/projects/publicar-documento.ts"]) {
      expect(leer(f), f).toMatch(/sinLoTecnicoDeLaPlanificacion\(/);
    }
    expect(leer("lib/external/artefacto-view.ts")).toMatch(/sinLoTecnicoDeLaPlanificacion\(\s*tipo === "planning"/);
    for (const f of ["lib/canvas/planificacion-generate.ts", "lib/artefactos/generar-server.ts"]) {
      expect(leer(f), f).toMatch(/cicloDeVidaGenerado\(s\.data, prevDataByKey\.ciclo_vida_crm\)/);
    }
  });

  it("la foto que se publica y el enlace que se sirve no lo llevan", () => {
    const foto = seccionesParaLaFoto([{ key: "automatizaciones", blocks: [{ data: { items: [AUTO] } }] }]);
    expect(JSON.stringify(foto)).not.toMatch(/SECRET|RAMA-/);
    const servida = sinLosAvisosDelEquipo([
      { key: "automatizaciones", titleOverride: null, eyebrowOverride: null, blocks: [{ blockType: "CARD", content: null, data: { items: [AUTO] } }] },
    ] as never);
    expect(JSON.stringify(servida)).not.toMatch(/SECRET|RAMA-/);
    expect(JSON.stringify(servida)).toContain(AUTO.hace);
  });
});
