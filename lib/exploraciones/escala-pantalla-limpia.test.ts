/**
 * lib/exploraciones/escala-pantalla-limpia.test.ts — la página interna de La escala después de la prueba de Elías del 24 nov:
 *   1. sin «Contexto adicional» (decía «sin agente propio» y no hacía nada);
 *   2. arriba, UNA línea que dice si hay que actualizar algo (lib/exploraciones/linea-de-la-escala.ts, con su prueba), sin la
 *      fila «1 Ubicar… 2 Confirmar… 3 Armar…», el objetivo de la primera venta, lo explorado ni «Armado el…»;
 *   3. «de dónde sale» es un ícono (i) con las citas en un globo, no un recuadro que empuja el contenido;
 *   4. «✨ Mejorar con IA» va en el encabezado de cada sección (no en cada texto), y el servidor le pasa al modelo solo las
 *      piezas de esa sección;
 *   5. lo interno entra si se pide (lib/pedirle-a-nexus/veracidad.test.ts).
 * Y lo de su prueba del 25 nov (sesión escala-mas-limpia):
 *   6. el ícono (i) de de dónde sale va pegado al final de su texto, en el mismo renglón (antes caía debajo);
 *   7. «✨ Mejorar con IA» tiene un lugar fijo arriba a la derecha de cada sección y aparece al pasar el cursor por ella
 *      o al llegar con el teclado; sin cursor, siempre;
 *   8. la vista previa del historial de versiones mide lo que su contenido, sin el blanco del final.
 * La página pública no muestra nada de esto.
 */
import fs from "node:fs";
import path from "node:path";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DeDondeSale from "@/components/exploraciones/DeDondeSale";
import ResultadoDelTestVista from "@/components/external/test/ResultadoDelTestVista";
import ResumenDeLaEscalaVista from "@/components/external/test/ResumenDeLaEscalaVista";
import TextoEditableDeLaPagina, { partirLaUltimaPalabra, textoConCola } from "@/components/external/test/TextoEditableDeLaPagina";
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
    /* Desde el 24 nov, en la preventa de un cliente, con el proyecto de contexto («Ubicar con lo que ya sabemos»). Desde el
       25 nov el pedido vive en `useUbicarLaEscala`: lo comparten la línea y el aviso de arriba del Resumen. */
    const ubicar = fs.readFileSync(path.join(process.cwd(), "components", "exploraciones", "useUbicarLaEscala.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(ubicar).toContain('lanzar("posicionar", conLoQueYaSabemos ? { proyectoDeContexto: contexto } : {})');
    expect(paso).toContain("onClick={() => void ubicar()}");
    // Desde la noche del 24 nov va debajo de la página (escala-sin-resumen.test.ts), solo en la preventa.
    expect(paso).toContain('linea={lugar === "preventa" ? <LineaDeLaUbicacion /> : null}');
    // Solo «Ubicar» cambia la frase a «ubicando»; otro trabajo del agente solo hace esperar al botón.
    expect(ubicar).toContain('ubicando: corriendo && corrida?.modo === "posicionar"');
    expect(paso).toMatch(/lineaDeLaEscala\(\{[\s\S]{0,600}\n {4}ubicando,\n/);
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
    // Desde el 24 nov la fila del Resumen entera va con `res.at` (sin Resumen, el aviso «Falta armar el Resumen»).
    for (const t of ["{res.at && (", "<BotonDelHistorial", "Rehacer con IA", "{botonDePedirle}"]) expect(pagina).toContain(t);
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
        // Desde el 25 nov el ícono va como `cola` del texto (la 6 de este archivo): quien pinta el texto lo pone al final.
        edicion: { alElegir: () => undefined, texto: (o) => createElement(Fragment, null, o.valor, o.cola), deDonde: (citas, o) => createElement(DeDondeSale, { citas, noSostiene: o?.noSostiene }) },
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
    // La propuesta a La escala vive en su pieza desde el 25 nov (la usan la conversación de la preventa y la escala de la cuenta).
    const cajon = leer("components/exploraciones/PropuestaDeLaEscala.tsx");
    expect(cajon).toContain("{c.interno && <p");
    expect(cajon).toContain("{AVISO_DE_LO_INTERNO}");
  });

  it("⛔ la regla del modelo nombra los temas de la MISMA lista que revisa el código: no puede invitarlo a uno que el código no ve", () => {
    const servidor = leer("lib/exploraciones/escala-con-nexus-server.ts");
    const reglas = servidor.slice(servidor.indexOf("export const REGLAS_DE_PEDIRLE"), servidor.indexOf("`;", servidor.indexOf("export const REGLAS_DE_PEDIRLE")));
    expect(reglas).toContain("LO INTERNO de la venta (${NOMBRES_DE_LO_INTERNO})");
  });

  it("⛔ lo interno no entra con «Aplicar todo»: se aplica uno por uno, con su pregunta (como lo escrito a mano)", () => {
    const cajon = leer("components/exploraciones/PropuestaDeLaEscala.tsx");
    expect(cajon).toContain("const sinPreguntar = pendientes.filter((c) => !c.aMano && !c.interno);");
    expect(cajon).toContain("onAplicar={() => (c.aMano || c.interno ? setAConfirmar(c) : void aplicar([c]))}");
    // Con lo que lo respalda a la vista: el sentido lo compara quien aplica (veracidad.ts no lo juzga).
    expect(cajon).toContain("{c.respaldo && c.respaldo.length > 0 && (");
    expect(cajon).toContain("Lo que Nexus tiene de la cuenta (compáralo antes de aplicar):");
  });
});

// ── Lo del 25 nov (Elías con TEC · AE): la página interna más limpia ─────────────────────────────────────────────────

/** Un Resumen con citas en cada parte: el resumen de arriba, el problema, los puntos clave, el recorrido, una fila con su
 *  reto, sus causas y su cifra, el tamaño y lo que falta validar. */
const CON_TODO = {
  ...GUARDADO,
  formaDeLaPortada: 2,
  negocio: {
    tesis: [{ id: "n1", texto: "Las ventas se anotan a mano. Nadie ve el mes.", citas: [CITA] }],
    portada: [{ id: "n2", texto: "Las ventas se registran a mano en una hoja y nadie ve el mes.", citas: [CITA] }],
    etiquetas: [{ id: "n3", texto: "Venta a empresas", citas: [CITA] }],
    abarca: [{ id: "n4", texto: "Abarca Ventas.", citas: [CITA] }],
    fuera: [{ id: "n5", texto: "La división de software.", citas: [CITA] }],
    quienes: [{ id: "n6", texto: "Ventas: Laura y 8 asesores", citas: [CITA] }],
    tamano: [{ id: "n7", texto: "500 clientes activos", citas: [CITA] }],
  },
  puntos: [
    { id: "p1", titulo: "Las ventas van a mano", texto: "Cada venta se anota en una hoja.", areaId: null, citas: [CITA] },
    { id: "p2", titulo: "Sin explicación", texto: "", areaId: null, citas: [CITA] },
  ],
  recorrido: [
    { id: "s1", nombre: "Captación", quien: "Ventas", texto: "Llaman desde el celular.", friccion: "No queda registro.", citas: [CITA] },
    { id: "s2", nombre: "Acompañamiento", quien: "Ventas", texto: "", friccion: null, citas: [CITA] },
    { id: "s3", nombre: "Opera", quien: null, texto: "Reservas en un lugar.", friccion: null, citas: [CITA] },
    { id: "s4", nombre: "Soporte", quien: "Ventas", texto: "Atiende casos.", friccion: null, continuo: true, citas: [CITA] },
  ],
  operativas: [
    {
      id: "o1",
      nombre: "Ventas",
      areaId: "1",
      organizacion: [
        { id: "g1", texto: "Jefatura + 5 asesores", citas: [CITA] },
        { id: "g2", texto: "Hacen visitas a cada cliente.", citas: [CITA] },
      ],
      bien: [{ id: "b1", texto: "Conocen a cada cliente.", citas: [CITA] }],
      frena: [{ id: "f1", texto: "Las ventas se registran a mano", citas: [CITA] }],
      retos: [{ id: "r1", texto: "Registrar cada venta sin la hoja", dimensionId: null, citas: [CITA] }],
      cifras: [{ id: "c1", cifra: "4800", texto: "clientes en la cartera", estado: "declarado", nota: null, dimensionId: null, citas: [CITA] }],
      falta: null,
    },
  ],
  pendientes: [{ id: "p1", tipo: "sin-dato", texto: "¿Cuántas ventas se anotan al mes?", areaId: "1", citas: [CITA] }],
} as unknown as ResumenGuardado;
const VENTAS_DEL_RESUMEN = { areaId: "1", areaNombre: "Ventas", nivel: "I", nivelNombre: "Inicial", preguntadas: 1, total: 1, dimensiones: [], capas: [], niveles: [] } as unknown as Parameters<typeof resumenParaLaPagina>[1][number];
const PESTANAS_CON_VENTAS = [...PESTANAS, { id: "1", nombre: "Ventas", href: "#" }];
const paginaConTodo = (conCitas: boolean) => resumenParaLaPagina(CON_TODO, [VENTAS_DEL_RESUMEN], {}, { escalaVersion: "9.0.0" }, { conCitas });

const VACIOS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
/** Para cada elemento del HTML cuya clase cumple `es`: las clases de sus antepasados, del padre hacia arriba. */
function antepasados(html: string, es: (clases: string[]) => boolean): string[][][] {
  const pila: string[][] = [];
  const hallados: string[][][] = [];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    const [, cierra, tag, attrs, auto] = m;
    if (cierra) {
      pila.pop();
      continue;
    }
    const clases = (attrs.match(/\bclass="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);
    if (es(clases)) hallados.push([...pila].reverse());
    if (!VACIOS.has(tag.toLowerCase()) && !auto) pila.push(clases);
  }
  return hallados;
}

type EdicionDelResumen = NonNullable<Parameters<typeof ResumenDeLaEscalaVista>[0]["edicion"]>;
/** El texto editable de la pantalla interna, como lo arma PaginaDeLaEscala (con su `cola`). */
const textoComoAdentro: EdicionDelResumen["texto"] = (o) =>
  createElement(TextoEditableDeLaPagina, { valor: o.valor, vacio: o.vacio, max: o.tope, etiqueta: o.etiqueta, quitar: o.quitar ?? null, cola: o.cola, onGuardar: async () => true });

describe("6 · (25 nov) de dónde sale, pegado al final del texto", () => {
  it("el editor pone la cola al final del texto, dentro del cuadro y fuera del botón de editar (no hay un botón dentro de otro)", () => {
    const cola = createElement("button", { type: "button", className: "x-cola" }, "i");
    const html = renderToStaticMarkup(createElement(TextoEditableDeLaPagina, { valor: "Hola mundo", vacio: "+", max: 20, etiqueta: "X", cola, onGuardar: async () => true }));
    // La última palabra va con la cola en un renglón que no se corta: el ícono nunca baja solo.
    expect(html).toMatch(
      /<div class="rd-editable-texto"><span role="button" tabindex="0" aria-label="Editar: X" class="rd-editable-boton"><span[^>]*>Hola <\/span><\/span><span class="rd-editable-fin"><span aria-hidden="true">mundo<\/span><span class="rd-editable-cola"><button type="button" class="x-cola">/,
    );
    const [donde] = antepasados(html, (c) => c.includes("x-cola"));
    expect(donde[0]).toContain("rd-editable-cola");
    expect(donde[1]).toContain("rd-editable-fin");
    expect(donde.flat()).toContain("rd-editable-texto");
    expect(donde.flat()).not.toContain("rd-editable-boton");
    const css = leer("components/external/test/resultado.css");
    expect(css).toContain(".dr .rd-editable-fin { white-space: nowrap; }");
    // Tocar el (i) o su globo (un portal: sus eventos suben por el árbol de React) no abre el editor.
    expect(codigo("components/external/test/TextoEditableDeLaPagina.tsx")).toContain('<span className="rd-editable-cola" onClick={(e) => e.stopPropagation()}>');
    // «Editar», aunque invisible, no le roba el cursor al (i) de un texto que termina en su esquina.
    expect(css).toMatch(/^\.dr \.rd-editable-lapiz \{[^}]*pointer-events: none;/m);
    // Sin cola, el cuadro es el de siempre.
    expect(renderToStaticMarkup(createElement(TextoEditableDeLaPagina, { valor: "Hola", vacio: "+", max: 10, etiqueta: "X", onGuardar: async () => true }))).not.toContain("rd-editable-cola");
  });

  it("⛔ en el Resumen interno, cada ícono (i) va al final de un texto, en su renglón: nunca suelto debajo de un bloque", () => {
    const html = renderToStaticMarkup(
      createElement(ResumenDeLaEscalaVista, {
        resumen: paginaConTodo(true),
        empresa: "Empresa de prueba",
        pestanas: PESTANAS_CON_VENTAS,
        edicion: { alElegir: () => undefined, texto: textoComoAdentro, deDonde: (citas, o) => createElement(DeDondeSale, { citas, noSostiene: o?.noSostiene }), fijo: (o) => o.valor },
      }),
    );
    const iconos = antepasados(html, (c) => c.includes("rs-de-donde"));
    // El resumen de arriba, la tesis, la etiqueta, lo que abarca y queda fuera, quién es quién, el tamaño, los dos puntos,
    // los cuatro pasos, la fila (reto, causa, quiénes, qué hacen, lo que funciona, la cifra) y lo que falta.
    expect(iconos.length).toBeGreaterThanOrEqual(20);
    for (const a of iconos) {
      expect(a[0], a.map((c) => c.join(".")).join(" < ")).toContain("rd-editable-cola");
      expect(a[1]).toContain("rd-editable-fin");
      expect(a.flat()).toContain("rd-editable-texto");
    }
    // Cada uno, unido a la última palabra de su texto (todas estas piezas tienen texto).
    expect(html.match(/class="rd-editable-fin"><span aria-hidden="true">[^<]+<\/span><span class="rd-editable-cola">/g)).toHaveLength(iconos.length);
  });

  it("sin permiso para editar, el ícono va igual al final del texto (no debajo)", () => {
    const pagina = codigo("components/exploraciones/PaginaDeLaEscala.tsx");
    expect(pagina).toContain("cola={o.cola}");
    expect(pagina).toMatch(/\) : o\.cola \? \(\s*textoConCola\(o\.valor, o\.cola\)\s*\)/);
    expect(renderToStaticMarkup(createElement("p", null, textoConCola("Lo dijo Ana", createElement("i", null, "i"))))).toBe('<p>Lo dijo <span class="rd-editable-fin">Ana<i>i</i></span></p>');
    // La vista ya no pinta el ícono después del bloque del texto: va como su `cola`.
    const vista = codigo("components/external/test/ResumenDeLaEscalaVista.tsx");
    expect(vista).not.toMatch(/\}\)\}\s*\{deDonde\(/);
  });

  it("afuera, ni íconos ni colas", () => {
    const afuera = renderToStaticMarkup(createElement(ResumenDeLaEscalaVista, { resumen: paginaConTodo(false), empresa: "Empresa de prueba", pestanas: PESTANAS_CON_VENTAS }));
    expect(afuera).not.toMatch(/rs-de-donde|rd-editable|rd-mejorar|rd-vista-previa/);
  });

  it("la última palabra se parte bien (saltos de renglón, espacios al final, una sola palabra, vacío)", () => {
    expect(partirLaUltimaPalabra("Hola mundo")).toEqual({ antes: "Hola ", ultima: "mundo" });
    expect(partirLaUltimaPalabra("uno\ndos tres ")).toEqual({ antes: "uno\ndos ", ultima: "tres" });
    expect(partirLaUltimaPalabra("«Exacto.»")).toEqual({ antes: "", ultima: "«Exacto.»" });
    expect(partirLaUltimaPalabra("  ")).toEqual({ antes: "  ", ultima: "" });
    expect(partirLaUltimaPalabra("")).toEqual({ antes: "", ultima: "" });
  });
});

describe("7 · (25 nov) «Mejorar con IA»: un lugar fijo en su sección, y aparece al pasar el cursor", () => {
  /** Donde puede ir el botón (su padre) y las secciones que lo muestran al pasar el cursor: las mismas que nombra el CSS. */
  const ANCLAS = ["re-ceja", "ed-ceja", "re-equipo-nombre", "re-cierre"];
  const SECCIONES = ["re-hero", "re-parte", "re-equipo", "re-cierre", "ed-hero", "ed-parte"];
  const css = leer("components/external/test/resultado.css");

  const paginaDelArea = () => {
    const escala = parsearEscala(leerArchivoDeLaEscala("escala"));
    const lienzo = escalaParaElLienzo(escala, null, { cierre: "con equipo", despues: "continua" });
    const area = lienzo.areas[0];
    const [a, b] = area.dimensiones.filter((d) => d.aplica);
    const estado: Pick<EstadoDeExploracion, "areas" | "contenido"> = {
      areas: [area.id],
      contenido: { ...contenidoVacio(), chequeo: { [a.id]: { nivel: "I", fuente: "reunion" } as EstimadoGuardado, [b.id]: { nivel: "F", fuente: "vendedor" } as EstimadoGuardado } },
    };
    const [x] = resultadosDeLaEscala(escala, lienzo, estado);
    const r = x.resultado;
    // Con «Lo que más le cuesta» (su ceja es un texto editable y lleva el botón al lado).
    const tarjeta = { ...paginaConTodo(true).tarjetas[0], areaId: r.areaId };
    return renderToStaticMarkup(
      createElement(ResultadoDelTestVista, {
        r,
        empresa: "Una empresa",
        agenda: "",
        detalles: detallesDelResultado(escala, r),
        deLaEscala: { areas: [{ id: r.areaId, nombre: r.areaNombre, href: "#" }], tarjeta },
        edicion: { alElegirArea: () => undefined, fijo: (o) => o.valor, mejorar },
      }),
    );
  };

  it("⛔ cada botón cae en un lugar con ancla, dentro de una sección que lo muestra (el Resumen y la página de un área)", () => {
    const resumen = renderToStaticMarkup(
      createElement(ResumenDeLaEscalaVista, { resumen: paginaConTodo(true), empresa: "Empresa de prueba", pestanas: PESTANAS_CON_VENTAS, edicion: { alElegir: () => undefined, texto: (o) => o.valor, mejorar } }),
    );
    for (const [nombre, html] of [
      ["Resumen", resumen],
      ["página de un área", paginaDelArea()],
    ] as const) {
      const botones = antepasados(html, (c) => c.includes("rd-mejorar"));
      expect(botones.length, nombre).toBeGreaterThanOrEqual(4);
      for (const a of botones) {
        const camino = `${nombre}: ${a.map((c) => c.join(".")).join(" < ")}`;
        expect(ANCLAS.some((x) => a[0].includes(x)), camino).toBe(true);
        expect(a.some((c) => SECCIONES.some((x) => c.includes(x))), camino).toBe(true);
      }
    }
    // En la página de un área, también el de «Resultado general», el del radar y el de «Lo que más le cuesta» (cuya ceja es
    // un texto editable).
    const delArea = antepasados(paginaDelArea(), (c) => c.includes("rd-mejorar")).map((a) => a.flat());
    for (const x of ["ed-hero", "ed-radar-seccion", "ed-cuesta"]) expect(delArea.some((a) => a.includes(x)), x).toBe(true);
    // El de cada equipo, dentro de su fila: aparece al pasar por la fila, no por toda la sección.
    const deLaFila = antepasados(resumen, (c) => c.includes("rd-mejorar")).filter((a) => a[0].includes("re-equipo-nombre"));
    expect(deLaFila.length).toBeGreaterThan(0);
    for (const a of deLaFila) expect(a.some((c) => c.includes("re-equipo"))).toBe(true);
  });

  it("el CSS lo pone arriba a la derecha de cada ancla, guardándole el lugar, fuera del renglón del texto", () => {
    const base = css.match(/^\.dr \.rd-mejorar \{[^}]*\}/m)?.[0] ?? "";
    expect(base).toMatch(/position: absolute/);
    expect(base).not.toMatch(/margin-left: 10px/);
    for (const x of ANCLAS) {
      expect(css, x).toMatch(new RegExp(`\\.dr \\.${x}:has\\(> \\.rd-mejorar\\)`));
      expect(css, x).toMatch(new RegExp(`\\.dr \\.${x} > \\.rd-mejorar[^{]*\\{[^}]*right:`));
    }
    // La ceja le guarda el lugar: ni el texto ni el «Editar» de un título editable quedan debajo del botón.
    expect(css).toMatch(/\.dr \.re-ceja:has\(> \.rd-mejorar\), \.dr \.ed-ceja:has\(> \.rd-mejorar\) \{[^}]*padding-right: \d+px/);
  });

  it("⛔ con cursor aparece al pasarlo por su sección o con el teclado; sin cursor (táctil) se ve siempre", () => {
    const inicio = css.indexOf("@media (hover: hover) {");
    expect(inicio).toBeGreaterThan(-1);
    const bloque = css.slice(inicio, css.indexOf("\n}", inicio));
    expect(bloque).toMatch(/\.dr \.rd-mejorar \{ opacity: 0; \}/);
    const mostrar = bloque.match(/\.dr :is\(([^)]*)\):is\(:hover, :has\(:focus-visible\)\) \.rd-mejorar \{ opacity: 1; \}/);
    expect(mostrar).not.toBeNull();
    for (const x of SECCIONES) expect(mostrar![1].split(/,\s*/), x).toContain(`.${x}`);
    // La fila de un equipo, solo por su fila.
    expect(bloque).toMatch(/\.dr \.re-equipo:not\(:hover\):not\(:has\(:focus-visible\)\) \.rd-mejorar \{ opacity: 0; \}/);
    // Fuera de ese bloque nada lo esconde: en una pantalla táctil se ve siempre.
    const fuera = css.slice(0, inicio) + css.slice(inicio + bloque.length);
    expect(fuera).not.toMatch(/rd-mejorar[^{]*\{[^}]*opacity: 0/);
  });
});

describe("8 · (25 nov) la vista previa del historial, del alto de su contenido", () => {
  it("la vista previa del Resumen va quieta (no esconde secciones para animarlas) y sin el alto mínimo de la pantalla", () => {
    const props = { resumen: paginaConTodo(true), empresa: "Empresa de prueba", pestanas: PESTANAS_CON_VENTAS };
    const previa = renderToStaticMarkup(createElement(ResumenDeLaEscalaVista, { ...props, vistaPrevia: true }));
    expect(previa).toContain("rd-vista-previa");
    // Quieta: AnimacionesDelResultado no es el <main> (y no esconde lo que queda debajo de la ventana).
    expect(previa).not.toContain("<main");
    const pagina = renderToStaticMarkup(createElement(ResumenDeLaEscalaVista, props));
    expect(pagina).toContain("<main");
    expect(pagina).not.toContain("rd-vista-previa");
    expect(leer("components/external/test/resultado.css")).toContain(".dr.rd-vista-previa { min-height: 0; }");
  });

  it("⛔ todo historial que pinta una página de La escala la pide como vista previa", () => {
    // Los que usan el popup común, buscados solos: uno nuevo que pinte la página entra sin tocar esta prueba.
    const archivos = (dir: string): string[] =>
      fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivos(`${dir}/${e.name}`) : /\.tsx$/.test(e.name) ? [`${dir}/${e.name}`] : []));
    const conElPopup = archivos("components").filter((f) => /<HistorialDeVersiones\b/.test(codigo(f)));
    expect(conElPopup).toContain("components/exploraciones/HistorialDelResumen.tsx");
    const quePintan = conElPopup.filter((f) => /<(ResumenDeLaEscalaVista|ResultadoDelTestVista)\b/.test(codigo(f)));
    expect(quePintan).toContain("components/exploraciones/HistorialDelResumen.tsx");
    for (const f of quePintan) {
      const pinta = codigo(f).match(/<(ResumenDeLaEscalaVista|ResultadoDelTestVista)\b[\s\S]*?\/>/g) ?? [];
      expect(pinta.length, f).toBeGreaterThan(0);
      for (const p of pinta) expect(p, f).toMatch(/\bvistaPrevia\b/);
    }
  });
});
