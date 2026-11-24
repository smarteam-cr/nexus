/**
 * lib/exploraciones/escala-pantalla-limpia.test.ts — la página interna de La escala después de la prueba de Elías del 24 nov:
 *   1. sin «Contexto adicional» (decía «sin agente propio» y no hacía nada);
 *   2. arriba, UNA línea que dice si hay que actualizar algo (lib/exploraciones/linea-de-la-escala.ts, con su prueba), sin la
 *      fila «1 Ubicar… 2 Confirmar… 3 Armar…», el objetivo de la primera venta, lo explorado ni «Armado el…»;
 *   3. «de dónde sale» es un ícono (i) con las citas en un globo, no un recuadro que empuja el contenido;
 *   4. «✨ Mejorar con IA» va en el encabezado de cada sección (no en cada texto), y el servidor le pasa al modelo solo las
 *      piezas de esa sección;
 *   5. lo interno entra si se pide (lib/pedirle-a-nexus/veracidad.test.ts).
 * La página pública no muestra nada de esto.
 */
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DeDondeSale from "@/components/exploraciones/DeDondeSale";
import ResultadoDelTestVista from "@/components/external/test/ResultadoDelTestVista";
import ResumenDeLaEscalaVista from "@/components/external/test/ResumenDeLaEscalaVista";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { SECCIONES_DEL_AREA, SECCIONES_DEL_RESUMEN } from "@/lib/external/secciones-de-la-escala";
import { detallesDelResultado } from "@/lib/tests-diagnostico/detalle-de-la-dimension";
import { contenidoVacio, type EstadoDeExploracion, type EstimadoGuardado } from "./contenido";
import { piezasDelArea, piezasDelResumen } from "./escala-con-nexus";
import { escalaParaElLienzo } from "./escala-del-lienzo";
import { resultadosDeLaEscala } from "./escala-para-el-cliente";
import { resumenParaLaPagina, type ResumenGuardado } from "./resumen-de-la-escala";

const RAIZ = process.cwd();
const leer = (f: string) => fs.readFileSync(path.join(RAIZ, f), "utf8").replace(/\r\n/g, "\n");
/** El código sin sus comentarios: la historia que cuentan («decía "sin agente propio"») no es lo que se pinta. */
const codigo = (f: string) =>
  leer(f)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const CITA = { reunion: "gmeet_r1", fecha: "2026-11-05T16:00:00.000Z", turno: 10, hablante: "Diego Rojas", texto: "las ventas se registran a mano en una hoja" };
const GUARDADO: ResumenGuardado = {
  v: 2,
  at: "2026-11-21T18:00:00.000Z",
  por: null,
  modelo: "claude-sonnet-4-6",
  agentRunId: null,
  hicimos: { sesiones: [{ fecha: "2026-11-05T16:00:00.000Z", equipo: "Ventas", minutos: 90, quienes: ["diego rojas"] }], personas: 1, texto: null },
  datosRojos: [],
  areas: {},
  entendimos: [],
  falta: [],
  negocio: { tesis: [{ id: "n1", texto: "Las ventas se anotan a mano. Nadie ve el mes.", citas: [CITA] }] },
  operativas: [],
  puntos: [{ id: "p1", titulo: "Las ventas van a mano", texto: "Cada venta se anota en una hoja.", areaId: null, citas: [CITA] }],
};
const PESTANAS = [{ id: "resumen", nombre: "Resumen", href: "#" }];
/** Un botón de prueba por sección, para ver dónde lo pide la vista. */
const mejorar = (s: string) => createElement("button", { type: "button", className: "rd-mejorar", "data-seccion": s }, "M");
const seccionesPintadas = (html: string) => new Set([...html.matchAll(/data-seccion="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&")));

describe("1 · La escala sin «Contexto adicional»", () => {
  it("el lienzo no lo pone en La escala, y el bloque ya no tiene el modo «sin agente»", () => {
    const lienzo = leer("components/exploraciones/LienzoDeExploracion.tsx");
    const modos = lienzo.slice(lienzo.indexOf("const MODO_DEL_CONTEXTO"), lienzo.indexOf("};", lienzo.indexOf("const MODO_DEL_CONTEXTO")));
    expect(modos).toContain('preparacion: "preparacion"');
    expect(modos).toContain('casos: "casos"');
    expect(modos).not.toMatch(/\bescala:/);
    const bloque = codigo("components/exploraciones/ContextoDeLaPreventa.tsx");
    expect(bloque).not.toContain("sinAgente");
    expect(bloque).not.toContain("sin agente propio");
    // El ancla del recorrido sigue: la usa el paso «Fuentes manuales» de Preparación.
    expect(bloque).toContain('data-recorrido="preventa.contexto"');
  });
});

describe("2 · arriba, una sola línea", () => {
  const paso = codigo("components/exploraciones/PasoEscala.tsx");
  const pagina = codigo("components/exploraciones/PaginaDeLaEscala.tsx");

  it("la línea de arriba sale del cálculo puro, con el botón de siempre («posicionar»)", () => {
    expect(paso).toContain("lineaDeLaEscala({");
    // Desde el 24 nov, en la preventa de un cliente, con el proyecto de contexto («Ubicar con lo que ya sabemos»).
    expect(paso).toContain('lanzar("posicionar", conLoQueYaSabemos ? { proyectoDeContexto: contexto } : {})');
    expect(paso).toContain('{lugar === "preventa" && <LineaDeArriba />}');
    // Solo «Ubicar» cambia la frase a «ubicando»; otro trabajo del agente solo hace esperar al botón.
    expect(paso).toContain('ubicando: corriendo && corrida?.modo === "posicionar"');
  });

  it("se fueron la fila de los tres pasos, el objetivo, lo explorado y «Armado el…»", () => {
    expect(paso).not.toContain("1 Ubicar con las reuniones · 2 Confirmar en el mapa");
    expect(paso).not.toContain("Objetivo de la primera venta");
    expect(paso).not.toMatch(/resumenDeLoExplorado\(/);
    expect(pagina).not.toContain("lo primero que ve el cliente al abrir el enlace");
    expect(pagina).not.toContain("Cada texto se cambia con un clic");
    expect(pagina).not.toMatch(/`Armado el \$\{/);
  });

  it("se quedan a la vista: publicar, «Acceso», las dos vistas, «Mejorar con IA», el historial y «Rehacer con IA»", () => {
    for (const t of ["<PublicarLaEscala />", "<AccesoALaEscala />", '["pagina", "nodos"]']) expect(paso).toContain(t);
    expect(paso).toContain('nodos: "Comparar áreas"');
    expect(paso).toContain('pagina: "Como lo ve el cliente"');
    for (const t of ["{res.at && botonDePedirle}", "<BotonDelHistorial", '"Rehacer con IA"', "{botonDePedirle}"]) expect(pagina).toContain(t);
    // Los avisos del Resumen (formato viejo, cifras que no salen) siguen.
    expect(pagina).toContain("Está armado con el formato del 9 nov");
    expect(pagina).toContain("Ninguna cifra sale al cliente");
  });
});

describe("3 · de dónde sale, en un ícono (i)", () => {
  it("el ícono dice cuántas citas tiene y no pinta las citas hasta abrirse", () => {
    const html = renderToStaticMarkup(createElement(DeDondeSale, { citas: [CITA] }));
    expect(html).toContain('class="rs-de-donde-i"');
    expect(html).toContain('aria-label="De dónde sale (una cita)"');
    expect(html).not.toContain(CITA.texto);
    expect(html).not.toContain("rs-citas");
    expect(renderToStaticMarkup(createElement(DeDondeSale, { citas: [] }))).toContain("lo escribió tu equipo");
    // Una cifra cambiada a mano que su cita ya no dice: el ícono va en ámbar.
    expect(renderToStaticMarkup(createElement(DeDondeSale, { citas: [CITA], noSostiene: true }))).toContain("rs-de-donde-aviso");
  });

  it("en el Resumen interno las citas no empujan nada: solo el ícono; afuera, nada", () => {
    const adentro = renderToStaticMarkup(
      createElement(ResumenDeLaEscalaVista, {
        resumen: resumenParaLaPagina(GUARDADO, [], {}, {}, { conCitas: true }),
        empresa: "Empresa de prueba",
        pestanas: PESTANAS,
        edicion: { alElegir: () => undefined, texto: (o) => o.valor, deDonde: (citas, o) => createElement(DeDondeSale, { citas, noSostiene: o?.noSostiene }) },
      }),
    );
    expect(adentro).toContain("rs-de-donde-i");
    expect(adentro).not.toContain(CITA.texto);
    expect(adentro).not.toContain("Solo lo ves tú");
    const afuera = renderToStaticMarkup(createElement(ResumenDeLaEscalaVista, { resumen: resumenParaLaPagina(GUARDADO, [], {}, {}, { conCitas: false }), empresa: "Empresa de prueba", pestanas: PESTANAS }));
    expect(afuera).not.toMatch(/rs-de-donde|Solo lo ves tú/);
  });
});

describe("4 · «✨ Mejorar con IA» por sección", () => {
  it("se fue el botón de cada texto", () => {
    const editor = leer("components/external/test/TextoEditableDeLaPagina.tsx");
    expect(editor).not.toMatch(/\bpedir\b\??:/);
    expect(editor).not.toContain("rd-editable-pedir");
    expect(leer("components/exploraciones/PaginaDeLaEscala.tsx")).not.toContain("pedirSobre");
    expect(leer("components/external/test/resultado.css")).not.toContain("rd-editable-pedir");
  });

  it("en el Resumen: un botón en el encabezado de cada sección que tiene piezas, con el nombre de su sección", () => {
    const pagina = resumenParaLaPagina(GUARDADO, [], {}, {}, { conCitas: true });
    const html = renderToStaticMarkup(
      createElement(ResumenDeLaEscalaVista, { resumen: pagina, empresa: "Empresa de prueba", pestanas: PESTANAS, edicion: { alElegir: () => undefined, texto: (o) => o.valor, mejorar } }),
    );
    const pintadas = seccionesPintadas(html);
    for (const s of new Set(piezasDelResumen(pagina, null).map((p) => p.seccion))) expect(pintadas.has(s), s).toBe(true);
    expect(pintadas.has(SECCIONES_DEL_RESUMEN.arriba)).toBe(true);
    expect(pintadas.has(SECCIONES_DEL_RESUMEN.puntos)).toBe(true);
    // La página pública no lo pide.
    expect(renderToStaticMarkup(createElement(ResumenDeLaEscalaVista, { resumen: pagina, empresa: "Empresa de prueba", pestanas: PESTANAS }))).not.toContain("data-seccion");
  });

  it("en el Resumen, también «Tu operación», «Lo que falta validar» y uno por equipo (en su fila)", () => {
    const vista = leer("components/external/test/ResumenDeLaEscalaVista.tsx");
    for (const s of ["arriba", "problema", "puntos", "operacion", "falta"]) expect(vista, s).toContain(`{mejorar(SECCION.${s})}`);
    expect(vista.match(/\{mejorar\(seccionDelEquipo\(x\.nombre\)\)\}/g)).toHaveLength(2);
  });

  it("en la página de un área: un botón en cada sección que tiene piezas, desde «Resultado general» hasta «Cómo está cada parte»", () => {
    const escala = parsearEscala(leerArchivoDeLaEscala("escala"));
    const lienzo = escalaParaElLienzo(escala, null, { cierre: "con equipo", despues: "continua" });
    const area = lienzo.areas[0];
    const [a, b] = area.dimensiones.filter((d) => d.aplica);
    const estado: Pick<EstadoDeExploracion, "areas" | "contenido"> = {
      areas: [area.id],
      contenido: { ...contenidoVacio(), chequeo: { [a.id]: { nivel: "I", fuente: "reunion" } as EstimadoGuardado, [b.id]: { nivel: "F", fuente: "vendedor" } as EstimadoGuardado } },
    };
    const [x] = resultadosDeLaEscala(escala, lienzo, estado);
    const detalles = detallesDelResultado(escala, x.resultado);
    const props = { r: x.resultado, empresa: "Una empresa", agenda: "", detalles, deLaEscala: { areas: [{ id: x.resultado.areaId, nombre: x.resultado.areaNombre, href: "#" }] } };
    const html = renderToStaticMarkup(createElement(ResultadoDelTestVista, { ...props, edicion: { alElegirArea: () => undefined, fijo: (o) => o.valor, mejorar } }));
    const pintadas = seccionesPintadas(html);
    const piezas = piezasDelArea(x.resultado, { textos: null, textosDelRadar: null, descripcion: null, detalle: (id) => detalles[id] ?? null, conLoQueCuesta: false, fecha: null });
    // El pie («Abajo») se pide desde toda la página: no lleva botón propio.
    for (const s of new Set(piezas.map((p) => p.seccion).filter((s) => s !== SECCIONES_DEL_AREA.abajo))) expect(pintadas.has(s), s).toBe(true);
    expect(pintadas.has(SECCIONES_DEL_AREA.resultado)).toBe(true);
    expect(pintadas.has(SECCIONES_DEL_AREA.partes)).toBe(true);
    expect(renderToStaticMarkup(createElement(ResultadoDelTestVista, props))).not.toContain("data-seccion");
  });

  it("el botón abre el chat «Nexus» con la sección como chip, y solo donde Nexus puede cambiar algo", () => {
    const pagina = leer("components/exploraciones/PaginaDeLaEscala.tsx");
    expect(pagina).toMatch(/seccionesDeAqui\.some\(\(s\) => esDeLaSeccion\(s, seccion\)\)/);
    expect(pagina).toMatch(/abrirNexusEnLaPreventa\(\{ exploracionId: exp\.id, escala: \{ lugar: lugarDeAqui, nombre: nombreDeAqui, foco: seccion \} \}\)/);
    expect(pagina.match(/\n\s+mejorar,\n/g)).toHaveLength(2);
  });

  it("⛔ el servidor le pasa al modelo SOLO las piezas de la sección, y la revisión mira esas mismas", () => {
    const servidor = leer("lib/exploraciones/escala-con-nexus-server.ts");
    const proponer = servidor.slice(servidor.indexOf("export async function proponerEnLaEscala"), servidor.indexOf("const igual ="));
    expect(proponer).toContain("const piezas = foco ? piezasDeLaSeccion(lectura.piezas, foco) : lectura.piezas;");
    expect(proponer).toContain("sections: piezas.map(");
    expect(proponer).not.toContain("sections: lectura.piezas.map(");
    expect(proponer).toContain("revisarLaPropuesta({ piezas, pagina: lectura.piezas,");
    expect(proponer).toContain("Lo pidió desde la sección");
    expect(proponer).not.toContain("Lo pidió desde la pieza");
  });
});

describe("5 · lo interno entra si se pide", () => {
  it("la regla del modelo ya no dice «nunca, aunque te lo pidan», y la pantalla avisa en el cambio", () => {
    const servidor = leer("lib/exploraciones/escala-con-nexus-server.ts");
    expect(servidor).not.toMatch(/LO INTERNO NUNCA/);
    expect(servidor).toContain("SOLO si el pedido lo pide con todas sus letras");
    const cajon = leer("components/exploraciones/PedirleANexus.tsx");
    expect(cajon).toContain("{c.interno && <p");
    expect(cajon).toContain("{AVISO_DE_LO_INTERNO}");
  });

  it("⛔ la regla del modelo nombra los temas de la MISMA lista que revisa el código: no puede invitarlo a uno que el código no ve", () => {
    const servidor = leer("lib/exploraciones/escala-con-nexus-server.ts");
    const reglas = servidor.slice(servidor.indexOf("export const REGLAS_DE_PEDIRLE"), servidor.indexOf("`;", servidor.indexOf("export const REGLAS_DE_PEDIRLE")));
    expect(reglas).toContain("LO INTERNO de la venta (${NOMBRES_DE_LO_INTERNO})");
  });

  it("⛔ lo interno no entra con «Aplicar todo»: se aplica uno por uno, con su pregunta (como lo escrito a mano)", () => {
    const cajon = leer("components/exploraciones/PedirleANexus.tsx");
    expect(cajon).toContain("const sinPreguntar = pendientes.filter((c) => !c.aMano && !c.interno);");
    expect(cajon).toContain("onAplicar={() => (c.aMano || c.interno ? setAConfirmar(c) : void aplicar([c]))}");
    // Con lo que lo respalda a la vista: el sentido lo compara quien aplica (veracidad.ts no lo juzga).
    expect(cajon).toContain("{c.respaldo && c.respaldo.length > 0 && (");
    expect(cajon).toContain("Lo que Nexus tiene de la cuenta (compáralo antes de aplicar):");
  });
});
