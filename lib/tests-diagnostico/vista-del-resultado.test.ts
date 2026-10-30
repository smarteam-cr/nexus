/**
 * lib/tests-diagnostico/vista-del-resultado.test.ts — LA PÁGINA DE RESULTADO como se dibuja (components/external/test/
 * ResultadoDelTestVista.tsx), en la pantalla y en el PDF: que no se pierda ningún texto ni dato, que «Ver puntajes»
 * arranque apagado y quede dentro del radar (el CSS lo resuelve con `:has`), y que el PDF salga en sus tres hojas, sin
 * interruptor, sin puntajes en el radar y con el tamaño de hoja que imprime el motor.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ResultadoDelTestVista from "@/components/external/test/ResultadoDelTestVista";
import type { DetalleDeLaDimension } from "./detalle-de-la-dimension";
import { HOJA_DEL_PDF } from "./pagina-del-resultado";
import { resumenSinIa } from "./redaccion";
import type { ResultadoDelTest } from "./resultado";

const NIVELES = [
  { letra: "D" as const, nombre: "Deficiente" },
  { letra: "I" as const, nombre: "Inicial" },
  { letra: "F" as const, nombre: "Funcional" },
  { letra: "E" as const, nombre: "Eficiente" },
  { letra: "O" as const, nombre: "Óptimo" },
];
const dim = (id: string, nombre: string, capa: "base" | "produccion", nivel: "D" | "I" | "F" | null, puntaje: number | null, extra = {}) => ({
  id,
  nombre,
  capa,
  preguntada: nivel !== null,
  nivel,
  nivelNombre: NIVELES.find((n) => n.letra === nivel)?.nombre ?? null,
  puntaje,
  noLoSe: false,
  ...extra,
});

/** El ejemplo del diseño, con un «No lo sé» y la producción sin preguntar en la versión corta. */
function resultado(corto = false): ResultadoDelTest {
  return {
    v: 1,
    escalaVersion: "9.0",
    edicion: null,
    areaId: "1",
    areaNombre: "Ventas",
    version: corto ? "marketing" : "web",
    nivel: "D",
    nivelNombre: "Deficiente",
    puntaje: 12,
    capas: [
      { clave: "base", nombre: "Base operativa", nivel: "I", nivelNombre: "Inicial", puntaje: 32 },
      { clave: "produccion", nombre: "Producción", nivel: corto ? null : "D", nivelNombre: corto ? null : "Deficiente", puntaje: corto ? null : 12 },
    ],
    dimensiones: [
      dim("1.1", "Procesos y Rutinas", "base", "I", 30),
      dim("1.2", "Tecnología y Automatización", "base", "F", 50),
      dim("1.3", "Datos", "base", "D", 10, { noLoSe: true }),
      dim("1.4", "Equipo y Gobierno", "base", "I", 30),
      dim("1.5", "Líneas de máquinas y cotización", "produccion", corto ? null : "I", corto ? null : 30),
      dim("1.6", "Priorización de interesados", "produccion", corto ? null : "D", corto ? null : 10),
      dim("1.7", "Seguimiento de demostraciones y cotizaciones", "produccion", corto ? null : "F", corto ? null : 50),
      dim("1.8", "Ventas ganadas y perdidas", "produccion", corto ? null : "D", corto ? null : 10),
    ],
    niveles: NIVELES,
    recomendacion: {
      tipo: "trabajar",
      dimensionId: corto ? "1.3" : "1.6",
      dimensionNombre: corto ? "Datos" : "Priorización de interesados",
      objetivo: "F",
      objetivoNombre: "Funcional",
      razon: "Es lo que más frena a Ventas hoy: en producción, es la parte del área que está más abajo.",
      costoDeQuedarse: "Tus asesores le hacen una demostración a todo el que la pide.",
    },
    riesgos: ["Tus reportes pueden estar inflados: hay contactos repetidos.", "Tu equipo puede estar trabajando con una idea vieja.", "Puedes estar escribiéndole a personas que no te dieron permiso."],
    casos: [
      { id: "c1", titulo: "Sistematiza tu proceso comercial con HubSpot", promesa: "Tu equipo comercial vende con un mismo proceso.", razon: "Sube «Datos» a Funcional." },
      { id: "c2", titulo: "Reactiva tu inversión en HubSpot", promesa: "El HubSpot que ya pagas vuelve a ser la herramienta.", razon: "Sube «Procesos y Rutinas» a Funcional." },
    ],
    sintesis: "",
    preguntadas: corto ? 4 : 8,
    total: 8,
  };
}

const AGENDA = "https://meetings.hubspot.com/smarteam/diagnostico";
const INDUSTRIA = "Maquinaria y equipo pesado";
/** Lo que se dice de cada dimensión (lib/tests-diagnostico/detalle-de-la-dimension.ts), de ejemplo. */
const DETALLES: Record<string, DetalleDeLaDimension> = {
  "1.1": { impacto: "Si se va un vendedor, se lleva lo que sabe de cada negocio.", siguiente: { nombre: "Funcional", prioridad: "Escribe el proceso en el CRM y fija la revisión semanal." } },
  "1.6": { impacto: "Tus asesores le hacen una demostración a todo el que la pide.", siguiente: { nombre: "Inicial", prioridad: "Define quién merece una demostración." } },
};
/** De qué dimensión es cada riesgo (el subtítulo de su tarjeta). */
const DIMENSION_DEL_RIESGO = { "Tus reportes pueden estar inflados: hay contactos repetidos.": "Datos" };
const dibujar = (modo: "pantalla" | "pdf", corto = false, agenda: string = AGENDA, r: ResultadoDelTest = resultado(corto)) =>
  renderToStaticMarkup(
    createElement(ResultadoDelTestVista, {
      r,
      industria: INDUSTRIA,
      detalles: DETALLES,
      dimensionDelRiesgo: DIMENSION_DEL_RIESGO,
      empresa: "Máquinas del Valle",
      dominio: "maquinasdelvalle.cr",
      fecha: "2026-10-28T15:00:00.000Z",
      agenda,
      pdf: modo === "pantalla" ? "/api/external/test/x/pdf" : null,
      modo,
    }),
  );
/** El texto que se lee, sin etiquetas (las comillas y los signos salen escapados en el HTML). */
const texto = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

/** Lo que la página mostraba antes del rediseño y tiene que seguir ahí (con el resultado completo). */
function loQueSeLee(r: ResultadoDelTest): string[] {
  const rec = r.recomendacion!;
  if (rec.tipo !== "trabajar") throw new Error("el ejemplo trabaja una dimensión");
  return [
    "Diagnóstico de rendimiento · Ventas",
    "28 de octubre de 2026",
    "Resultado general",
    "Deficiente",
    resumenSinIa(r),
    "Estimado",
    "con lo que respondiste",
    "Base operativa",
    "Producción",
    "Por dónde empezar",
    "Llevar priorización de interesados a Funcional",
    rec.razon,
    "Lo que cuesta quedarse así",
    rec.costoDeQuedarse,
    "Lo que hoy pone en riesgo a tu área",
    ...r.riesgos,
    "Lo que lo mueve",
    ...r.casos.flatMap((c) => [c.titulo, c.promesa, c.razon]),
    "Cómo está cada parte",
    "cómo está montado el departamento por dentro",
    "qué entrega el departamento hacia afuera",
    ...r.dimensiones.map((d) => d.nombre),
    "LO QUE MÁS FRENA",
    "No lo sabías",
    "Máquinas del Valle",
    "maquinasdelvalle.cr",
    "Diagnóstico hecho con la Escala de Rendimiento de Smarteam.",
  ];
}

describe("la página de resultado, como se dibuja", () => {
  it("en la pantalla: ningún texto de antes se pierde", () => {
    const t = texto(dibujar("pantalla"));
    for (const x of [...loQueSeLee(resultado()), "Hacer otro test", "Descargar PDF", "Diagnosticar otra área", "Diagnosticar otra empresa", "El siguiente paso", "Revisemos juntos tu resultado, sin costo"]) {
      expect(t, `falta «${x}»`).toContain(x);
    }
    // El saludo con el nombre se fue (29 oct): arriba va el resumen.
    expect(t).not.toContain("así está hoy tu área");
    // Las barras: cada puntaje sobre 100.
    for (const p of ["30", "50", "10"]) expect(t).toContain(`${p} /100`);
  });

  it("«Ver puntajes» arranca apagado y vive dentro del radar, con los dos juegos de vértices", () => {
    const html = dibujar("pantalla");
    const interruptor = html.match(/<input[^>]*class="rde-check"[^>]*>/)?.[0];
    expect(interruptor).toBeDefined();
    expect(interruptor).toContain('role="switch"');
    expect(interruptor).not.toContain("checked");
    // El `:has` de radar-de-una-empresa.css busca el checkbox y los puntajes dentro del mismo `.rde`.
    const radar = html.slice(html.indexOf('<div class="rde">'));
    expect(radar.indexOf("rde-check")).toBeGreaterThan(-1);
    expect(radar.indexOf('class="rde-con"')).toBeGreaterThan(radar.indexOf("rde-check"));
    expect(radar).toContain('class="rde-sin"');
    // Escritorio y teléfono, y el CSS decide.
    expect(html).toContain('class="rde-grande"');
    expect(html).toContain('class="rde-compacto"');
    // El puntaje del área solo con «Ver puntajes».
    expect(html).toMatch(/class="rde-con"[\s\S]*12\/100/);
  });

  it("la versión corta dice cuántas partes mira, las no preguntadas van en el radar y se explica qué es «?»", () => {
    const t = texto(dibujar("pantalla", true));
    expect(t).toContain("con lo que respondiste (4 de 8 partes)");
    expect(t).toContain("Este test mira 4 de las 8 partes del área; las otras las vemos juntos en la sesión.");
    expect(t).toContain("No se preguntó");
    expect(t).toContain("No se midió");
    expect(t).toContain("Eje punteado y sin vértice: no se preguntó en este test");
    expect(t).toContain("Contestaste «No lo sé»: cuenta como Deficiente");
  });

  it("⛔ la agenda va siempre incrustada, sin el script de HubSpot (DECISIONS «Test público»)", () => {
    const html = dibujar("pantalla");
    expect(html).toContain("rd-agenda-cal");
    expect(texto(html)).toContain("¿No ves el calendario? Ábrelo aquí");
    expect(html).not.toContain("MeetingsEmbedCode");
    expect(html).not.toContain("meetings-iframe-container");
    expect(html).not.toContain("Te escribimos al correo");
  });

  it("el PDF: tres hojas, sin interruptor ni puntajes en el radar, sin calendario y con el enlace para agendar", () => {
    const html = dibujar("pdf");
    expect(html.match(/class="rd-hoja[ "]/g)).toHaveLength(3);
    expect(html).not.toContain("rde-check");
    expect(html).not.toContain('class="rde-con"');
    expect(html).not.toContain("rd-agenda-cal");
    expect(html).not.toContain("Descargar PDF");
    const t = texto(html);
    for (const x of loQueSeLee(resultado())) expect(t, `falta «${x}» en el PDF`).toContain(x);
    expect(t).toContain(`¿Lo revisamos juntos? Agenda una sesión de 30 minutos, sin costo: ${AGENDA}`);
    // Cada hoja con su número.
    for (const n of [1, 2, 3]) expect(html).toContain(`<span class="rd-hoja-numero">${n}</span>`);
  });

  it("⛔ la hoja del CSS mide lo mismo que la que imprime el motor (si no, cada hoja se parte en dos páginas)", () => {
    const css = readFileSync(join(process.cwd(), "components/external/test/resultado.css"), "utf8");
    const hoja = css.match(/\.dr \.rd-hoja \{ width: (\d+)px; height: (\d+)px;/);
    expect(hoja).not.toBeNull();
    expect({ ancho: Number(hoja![1]), alto: Number(hoja![2]) }).toEqual(HOJA_DEL_PDF);
  });
});

describe("los ajustes del 29 oct", () => {
  it("el resumen de la IA, si lo hay, va arriba en lugar del de los datos (también en el PDF)", () => {
    const r = { ...resultado(), redaccion: { v: 2 as const, modelo: "m", at: "", resumen: "Tu equipo vende cada uno a su manera.", dimensiones: {} } };
    for (const modo of ["pantalla", "pdf"] as const) {
      const t = texto(dibujar(modo, false, AGENDA, r));
      expect(t).toContain("Tu equipo vende cada uno a su manera. Es una estimación con solo 8 preguntas");
      expect(t).not.toContain(resumenSinIa(r));
    }
  });

  it("la tarjeta de cada dimensión del radar: corta — el nombre, el puntaje con su nivel, el impacto y que es un estimado", () => {
    const html = dibujar("pantalla");
    const tarjetas = html.match(/<div class="rd-tip"[^>]*data-tarjeta="[^"]+"[^>]*hidden/g) ?? [];
    expect(tarjetas).toHaveLength(8);
    const t11 = texto(html.slice(html.indexOf('data-tarjeta="1.1"'), html.indexOf('data-tarjeta="1.2"')));
    for (const x of ["Procesos y Rutinas", "30 /100", "Inicial", DETALLES["1.1"].impacto!, "Es un estimado: faltan preguntas para ubicarlo con precisión."]) {
      expect(t11, `falta «${x}» en la tarjeta`).toContain(x);
    }
    // Sin la escala (nadie que llena el test la tiene en la cabeza) y sin qué priorizar (eso va en «Ver detalles»).
    expect(t11).not.toContain("En la escala");
    expect(t11).not.toContain(DETALLES["1.1"].siguiente!.prioridad);
  });

  it("«Ver detalles» dice qué priorizar y que falta corroborar, sin repetir la tarjeta", () => {
    const html = dibujar("pantalla");
    const det = html.slice(html.indexOf('<details class="rd-detalles">'));
    const t = texto(det.slice(0, det.indexOf("</details>")));
    expect(t).toContain("Qué priorizar para llegar a Funcional");
    expect(t).toContain(DETALLES["1.1"].siguiente!.prioridad);
    expect(t).toContain("Falta información por corroborar");
    expect(t).not.toContain(DETALLES["1.1"].impacto!);
  });

  it("al final: «otra área» con la misma industria y «otra empresa» desde cero, y el logo", () => {
    const html = dibujar("pantalla");
    expect(html).toContain(`href="/external/test?industria=${encodeURIComponent(INDUSTRIA).replace(/%20/g, "+")}#otra-area"`);
    expect(html).toContain('href="/external/test#otra-empresa"');
    expect(html).toMatch(/class="rd-pie"[\s\S]*logo-smarteam\.png/);
  });

  it("«El siguiente paso» con tres viñetas de lo que se lleva", () => {
    const html = dibujar("pantalla");
    expect(html.match(/<li><span class="rd-agenda-check">/g)).toHaveLength(3);
    expect(texto(html)).toContain("aunque no trabajemos juntos");
  });

  it("el PDF lleva qué priorizar debajo de cada barra, y no las tarjetas ni «Ver detalles»", () => {
    const html = dibujar("pdf");
    expect(texto(html)).toContain(`Qué priorizar para llegar a Funcional: ${DETALLES["1.1"].siguiente!.prioridad}`);
    expect(html).not.toContain("rd-tip");
    expect(html).not.toContain("rd-detalles");
  });

  it("⛔ el resumen no repite el nivel ni nombra la industria; la industria va en un chip junto al título (también en el PDF)", () => {
    for (const modo of ["pantalla", "pdf"] as const) {
      const html = dibujar(modo);
      expect(html).toContain(`<span class="rd-sector">${INDUSTRIA}</span>`);
      const resumen = texto(html.match(/<p class="rd-resumen[^"]*">([\s\S]*?)<\/p>/)![1]);
      expect(resumen).not.toMatch(/Deficiente|Inicial|Funcional|Eficiente|Óptimo/);
      expect(resumen.toLowerCase()).not.toContain(INDUSTRIA.toLowerCase());
    }
    // «Otra» no va en el chip.
    expect(renderToStaticMarkup(createElement(ResultadoDelTestVista, { r: resultado(), industria: "Otra", empresa: null, agenda: AGENDA }))).not.toContain("rd-sector");
  });

  it("las cajas de las capas, en el orden del radar: producción a la izquierda, base a la derecha (también en el PDF)", () => {
    for (const modo of ["pantalla", "pdf"] as const) {
      const capas = dibujar(modo).match(/<p class="rd-capa-k">([^<]+)<\/p>/g) ?? [];
      expect(capas.map((x) => x.replace(/<[^>]+>/g, ""))).toEqual(["Producción", "Base operativa"]);
    }
  });

  it("cada riesgo lleva de subtítulo la dimensión de la que sale (también en el PDF)", () => {
    for (const modo of ["pantalla", "pdf"] as const) {
      expect(dibujar(modo)).toContain('<span class="rd-riesgo-titulo">Datos</span><span>Tus reportes pueden estar inflados: hay contactos repetidos.</span>');
    }
  });

  it("⛔ la flecha de lo que más frena se mueve con su vértice: su grupo lleva el punto del vértice (solo en la página)", () => {
    const html = dibujar("pantalla");
    const grande = html.slice(html.indexOf('class="rde-grande"'), html.indexOf('class="rde-compacto"'));
    const marca = grande.match(/<g class="rde-iman" data-iman-x="([\d.]+)" data-iman-y="([\d.]+)">/);
    expect(marca).not.toBeNull();
    // El mismo punto que el vértice de lo que más frena (1.6), que es el más grande (rFrena).
    const vertice = grande.match(/<circle class="rde-vertice" data-d="1\.6" cx="([\d.]+)" cy="([\d.]+)"/);
    expect(vertice).not.toBeNull();
    expect([marca![1], marca![2]]).toEqual([vertice![1], vertice![2]]);
    // El PDF no tiene imán.
    expect(dibujar("pdf")).not.toContain("data-iman-x");
  });

  it("⛔ el radar limpio (30 oct): sin «La base», la figura en azul y Funcional como el único anillo con color (también en el PDF)", () => {
    for (const modo of ["pantalla", "pdf"] as const) {
      const html = dibujar(modo);
      expect(texto(html)).not.toContain("La base");
      expect(html).toMatch(/class="rde-figura"[^>]*fill="#0b58d3"[^>]*stroke="#0b58d3"/);
      const trazos = [...html.matchAll(/<polygon points="[^"]*" fill="none" stroke="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
      expect(trazos.length).toBeGreaterThanOrEqual(5);
      expect(new Set(trazos.filter((x) => !["#dde3ec", "#eef1f6"].includes(x)))).toEqual(new Set(["#22c55e"]));
    }
  });
});
