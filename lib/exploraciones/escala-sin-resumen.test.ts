/**
 * lib/exploraciones/escala-sin-resumen.test.ts — La escala después de lo que pidió Elías mirando TEC · AE (24 nov, noche):
 *   1. sin Resumen, adentro se ve la PLANTILLA (la forma de la portada, sin texto inventado) y el cliente no ve la pestaña;
 *   2. arriba, «Falta armar el Resumen» con su botón y, mientras se arma, en qué va;
 *   3. la línea «Ubicada…» baja, debajo de la página; arriba quedan «Publicado…» y «Acceso»;
 *   4. sale el título «Dónde está hoy»; «Como lo ve el cliente» y «Comparar áreas» siguen arriba de la página;
 *   5. debajo, «Para completar el diagnóstico», con «Responder con Nexus» que abre el MISMO chat;
 *   6. armar el Resumen no se cuelga del POST (sigue en el servidor; cada llamada a la IA con streaming y tope).
 * Lo puro (la corrida, la llamada con tope, las respuestas) tiene sus propias pruebas.
 */
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PlantillaDelResumenVista from "@/components/external/test/PlantillaDelResumenVista";
import { areaSinResumen, tieneResumen } from "@/lib/external/escala-sin-resumen";

const RAIZ = process.cwd();
const leer = (f: string) => fs.readFileSync(path.join(RAIZ, f), "utf8").replace(/\r\n/g, "\n");
/** El código sin sus comentarios: la historia que cuentan no es lo que se pinta. */
const codigo = (f: string) =>
  leer(f)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("1 · sin Resumen: la plantilla adentro, ninguna pestaña de relleno afuera", () => {
  const html = renderToStaticMarkup(
    createElement(PlantillaDelResumenVista, {
      empresa: "TEC · AE",
      pestanas: [
        { id: "resumen", nombre: "Resumen", href: "#" },
        { id: "1", nombre: "Ventas", href: "#" },
      ],
      alElegir: () => {},
      equipos: [
        { id: "1", nombre: "Ventas", nivel: "Inicial" },
        { id: "3", nombre: "Servicio", nivel: null },
      ],
    }),
  );

  it("la plantilla tiene las partes de la portada, en su orden, y los equipos que ve el cliente con su nivel", () => {
    const partes = ["/ Diagnóstico", "/ El problema principal", "/ Puntos clave", "/ Tu operación", "/ Equipos y hallazgos", "/ Lo que falta validar"];
    const donde = partes.map((p) => html.indexOf(p));
    for (const [i, d] of donde.entries()) expect(d, partes[i]).toBeGreaterThan(-1);
    expect([...donde].sort((a, b) => a - b)).toEqual(donde);
    expect(html).toContain("Ventas");
    expect(html).toContain("Inicial");
    expect(html).toContain("Sin nivel todavía");
  });

  it("⛔ sin texto inventado: ni el titular de relleno ni una cifra; cada hueco dice qué va ahí", () => {
    expect(html).not.toContain("Así entendimos tu negocio");
    expect(html).not.toMatch(/re-grande|re-tesis|re-puntos/);
    expect(html.match(/class="re-hueco/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("⛔ la página del cliente nunca monta la plantilla, y sin Resumen publicado no tiene la pestaña «Resumen»", () => {
    const pagina = codigo("app/external/escala/[token]/page.tsx");
    expect(pagina).not.toContain("PlantillaDelResumenVista");
    expect(pagina).toContain("const conResumen = tieneResumen(d.resumen);");
    expect(pagina).toContain("resumen: conResumen ? { href: base } : null,");
    expect(pagina).toContain("areaSinResumen(d.resultados, pedida)");
  });

  it("sin Resumen, el enlace abre en el equipo pedido; si no, en el primero con algo medido", () => {
    const resultados = [
      { areaId: "1", preguntadas: 0 },
      { areaId: "3", preguntadas: 4 },
    ];
    expect(areaSinResumen(resultados, null)).toBe("3");
    expect(areaSinResumen(resultados, "1")).toBe("1");
    expect(areaSinResumen(resultados, "resumen")).toBe("3");
    expect(areaSinResumen([{ areaId: "1", preguntadas: 0 }], undefined)).toBe("1");
    expect(areaSinResumen([], null)).toBeNull();
    expect(tieneResumen({ at: null })).toBe(false);
    expect(tieneResumen({ at: "2026-11-24T20:00:00.000Z" })).toBe(true);
  });
});

describe("2 · arriba del Resumen: «Falta armar el Resumen» y en qué va", () => {
  const pagina = codigo("components/exploraciones/PaginaDeLaEscala.tsx");
  const resumen = pagina.slice(pagina.indexOf("if (enElResumen) {"), pagina.indexOf("const nivelesEnVivo"));

  it("el aviso va en la franja interna, ANTES del marco que imita la página; sin Resumen, la plantilla", () => {
    const aviso = resumen.indexOf("<AvisoDelResumen");
    const marco = resumen.indexOf("<ResumenDeLaEscalaVista");
    expect(aviso).toBeGreaterThan(-1);
    expect(aviso).toBeLessThan(marco);
    expect(resumen).toMatch(/\{res\.at \? \(\s*<ResumenDeLaEscalaVista[\s\S]*?\) : \(\s*<PlantillaDelResumenVista/);
    // Desde el 27 nov que falta lo dice el recuadro de arriba del diagnóstico, con su botón; el aviso, solo si falló.
    expect(codigo("components/exploraciones/PasoEscala.tsx")).toContain(">Falta generar el diagnóstico<");
    expect(pagina).toContain('title="La última vez que se pidió, no se pudo"');
    // Desde el 26 nov lo arma «Actualizar con Nexus», arriba del diagnóstico: el aviso no trae su botón.
    expect(pagina).not.toContain("Armar el Resumen con IA");
  });

  it("el aviso pinta lo que decide `queDiceElAviso` (lib, con su prueba): la fase, el reloj sin anunciarse, cómo seguir", () => {
    const aviso = pagina.slice(pagina.indexOf("function AvisoDelResumen("), pagina.indexOf("export default function PaginaDeLaEscala"));
    expect(pagina).toContain(
      "const aviso = queDiceElAviso({ resumenEn: res.at, corrida: corridaDelResumen, lanzando: lanzandoElResumen, sinSaber: sinSaberDelResumen, nuevas, cerrado: falloCerrado, ubicarPrimero });",
    );
    // Lo nuevo que no se leyó lo dice desde el 27 nov la franja de arriba del diagnóstico, con «Actualizar con Nexus»
    // (`porQueQuedoAtras`, validar-la-escala.test.ts); el aviso solo dice cuando Nexus está ubicando con eso.
    const nuevas = aviso.slice(aviso.indexOf('case "nuevas":'));
    expect(nuevas).toContain("aviso.ubicar && ubicando ?");
    expect(nuevas).toContain("Nexus está ubicando la escala con lo que contaron.");
    expect(pagina).toContain("ubicando={ubicacion.ubicando}");
    // Lo decide `lasNotasNuevas` (con su prueba): solo en la preventa, y desde lo que leyó el Resumen que hay.
    expect(pagina).toMatch(/lasNotasNuevas\(\{[\s\S]{0,300}resumenDesde: res\.at \? leidoHasta\(res\.at, laQueLoArmo\) : null,\s*enLaPreventa: lugar === "preventa",/);
    for (const tipo of ["corriendo", "sin-saber", "detenida", "falta", "fallo", "nuevas"]) expect(aviso, tipo).toContain(`case "${tipo}":`);
    // El reloj no se anuncia cada segundo (el Alert es una región viva): solo la fase.
    expect(aviso).toMatch(/<span className="tabular-nums" aria-hidden="true">\s*· lleva \{cuantoLleva\(aviso\.desde, ahora\)\}/);
    expect(aviso).toContain("Volver a mirar");
    expect(aviso).toContain('title="La última vez que se pidió, no se pudo"');
    expect(aviso).toContain("{aviso.fallo}");
  });

  it("⛔ un solo botón de la IA, arriba del diagnóstico: ni el aviso ni la fila del Resumen traen el suyo (26 nov)", () => {
    const aviso = pagina.slice(pagina.indexOf("function AvisoDelResumen("), pagina.indexOf("export default function PaginaDeLaEscala"));
    // El único botón del aviso es «Volver a mirar» (no es de la IA: vuelve a preguntar en qué va).
    expect(aviso.match(/<Button/g)).toHaveLength(1);
    expect(aviso).toContain('<Button size="sm" variant="secondary" onClick={onMirar}>Volver a mirar</Button>');
    for (const t of ["Rehacer con IA", "Volver a ubicar", "Armar el Resumen con IA", "avisoConBoton"]) expect(resumen, t).not.toContain(t);
    // El que queda: «Actualizar con Nexus» (PasoEscala), que decide `queHaceActualizar` (con su prueba).
    const paso = codigo("components/exploraciones/PasoEscala.tsx");
    expect(paso).toContain("const que = queHaceActualizar({");
    // Sin Resumen y listo para armarlo dice «Generar con Nexus» (27 nov).
    expect(paso).toContain('{esperando ? "Nexus está actualizando…" : !guardado?.at && que.accion === "resumen" ? "Generar con Nexus" : "Actualizar con Nexus"}');
  });

  it("el fallo cerrado no vuelve al cambiar de vista ni al recargar (se recuerda en este navegador, por exploración)", () => {
    expect(pagina).toContain("const [falloCerrado, setFalloCerrado] = useFalloCerrado(exp.id);");
    const hook = codigo("components/exploraciones/useResumenEnCurso.ts");
    expect(hook).toMatch(/try \{\s*return window\.localStorage\.getItem\(clave\);\s*\} catch \{\s*return null;/);
    expect(hook).toMatch(/try \{\s*window\.localStorage\.setItem\(clave, falloId\);\s*\} catch/);
  });

  it("⛔ armar sigue la corrida del servidor (useResumenEnCurso), no espera la respuesta del POST", () => {
    expect(pagina).toContain("useResumenEnCurso(exp.id)");
    expect(pagina).not.toMatch(/fetch\(`\/api\/sales\/exploraciones\/\$\{exp\.id\}\/escala\/resumen`, \{ method: "POST" \}\)/);
    const rehacer = codigo("components/exploraciones/rehacer-la-escala.ts");
    expect(rehacer).toContain("const seguimiento = seguimientoDelResumen(exp.id);");
    expect(rehacer).toContain("let r = await seguimiento.armar();");
    expect(rehacer).not.toContain("method: \"POST\"");
  });

  it("las respuestas nuevas se cuentan desde que empezó la corrida que ARMÓ el Resumen que hay (no la última, que pudo fallar)", () => {
    expect(pagina).toContain("terminadaDelResumen.id === exp.estado.contenido.resumenDeLaEscala?.agentRunId");
    expect(pagina).toContain("leidoHasta(res.at, laQueLoArmo)");
  });

  it("la cuenta regresiva de una nota que siguió una corrida ajena rehace una vez más (la nota no había entrado)", () => {
    const rehacer = codigo("components/exploraciones/rehacer-la-escala.ts");
    expect(rehacer).toContain("if (r.ok && r.ajena) r = await seguimiento.armar();");
    expect(rehacer).not.toContain("useSeRehaceLaEscala");
  });
});

describe("3 y 4 · la fila del título con la vista y «Acceso»; el estado; «Publicar» en su franja (27 nov)", () => {
  const paso = codigo("components/exploraciones/PasoEscala.tsx");
  const principal = paso.slice(paso.indexOf("export default function PasoEscala"));
  const escala = paso.slice(paso.indexOf("function DondeEstaHoy("), paso.indexOf("export default function PasoEscala"));

  it("la fila del título (vista, IA, historial y «Acceso» a la par), después el estado, «Publicar» y la página", () => {
    const fila = principal.indexOf("<FilaDeArriba");
    const arriba = principal.indexOf("<ArribaDelDiagnostico");
    expect(fila).toBeGreaterThan(-1);
    expect(fila).toBeLessThan(arriba);
    expect(arriba).toBeLessThan(principal.indexOf("<PublicarLaEscala />"));
    expect(principal.indexOf("<PublicarLaEscala />")).toBeLessThan(principal.indexOf("<DondeEstaHoy"));
    expect(principal).toContain("<DondeEstaHoy vista={vista} />");
    const laFila = paso.slice(paso.indexOf("function FilaDeArriba("), paso.indexOf("/**\n * La escala: la página"));
    const vista = laFila.indexOf("<ComoSeVe");
    const ranura = laFila.indexOf("ref={onRanura}");
    expect(vista).toBeGreaterThan(-1);
    expect(vista).toBeLessThan(ranura);
    expect(ranura).toBeLessThan(laFila.indexOf("<AccesoALaEscala />"));
  });

  it("⛔ la línea de la ubicación va en el estado de arriba (27 nov), solo en la preventa", () => {
    expect(escala).not.toContain("{linea}");
    expect(paso).toContain('return lugar === "preventa" ? <ArribaEnLaPreventa /> :');
    expect(paso).toContain("linea={u.linea}");
  });

  it("se fue el título «Dónde está hoy»; las dos vistas siguen", () => {
    expect(paso).not.toMatch(/>\s*Dónde está hoy\s*</);
    expect(paso).not.toContain('aria-label="Dónde está hoy"');
    expect(paso).toContain('nodos: "Comparar áreas"');
    expect(paso).toContain('pagina: "Como lo ve el cliente"');
  });
});

describe("5 · «Para completar el diagnóstico» y «Responder con Nexus»", () => {
  const paso = codigo("components/exploraciones/PasoEscala.tsx");
  const completar = paso.slice(paso.indexOf("function ParaCompletarElDiagnostico("), paso.indexOf("const AREA_DEL_ENGAGEMENT"));

  it("junta lo de antes: lo que frena a cada equipo, las hipótesis Y lo sin dato, cada una con su pregunta y «Llevar a la sesión N»", () => {
    expect(completar).toContain("fraseDelFreno({");
    expect(completar).toContain("fraseDeLaValidacion(cuenta)");
    expect(completar).toContain("...sinDato.map((d) => ({ d, esHipotesis: false }))");
    expect(completar).toContain("<PreguntaParaLlevar");
    expect(completar).toContain("<PreparacionParaEngagement />");
    expect(completar).toContain('irA("casos")');
  });

  it("⛔ «Responder con Nexus» abre la MISMA puerta, con la pregunta, su equipo y su parte; solo donde hay conversación", () => {
    expect(completar).toContain('const conNexus = lugar === "preventa" && puedeEditar;');
    expect(completar).toMatch(/abrirNexusEnLaPreventa\(\{ exploracionId: exp\.id, pregunta: \{ equipo: area\.nombre, dimension: d\.nombre, dimensionId: d\.id, pregunta \} \}\)/);
    const cajon = codigo("components/exploraciones/HablarConNexus.tsx");
    expect(cajon).toContain("setPregunta(p.pregunta ?? null);");
    expect(cajon).toContain("prefijo: prefijoDeLaRespuesta(pregunta),");
    expect(cajon).toContain("alUsarElPrefijo: () => setPregunta(null),");
    // El chat pone el prefijo en el mensaje que se manda, y si la vuelta falla devuelve lo escrito sin él.
    const panel = codigo("components/chat-de-nexus/PanelDeNexus.tsx");
    expect(panel).toContain('{ de: "persona", texto: conPrefijo ? `${conPrefijo}${t}` : t }');
    expect(panel).toContain("if (conPrefijo) alUsarElPrefijo?.();");
    expect(panel).toContain("setTexto((x) => devolverALaCaja(t, x))");
    // La caja deja lugar para el prefijo: el mensaje entero no pasa el tope del servidor, y la respuesta (una nota) no pasa
    // el de una nota.
    expect(panel).toContain("maxLength={prefijo ? TOPES.largoDeLaNota - prefijo.length : TOPES.largoDelMensaje}");
  });
});

describe("6 · armar el Resumen no se cuelga", () => {
  it("⛔ la ruta arranca la corrida, responde 202 y la deja corriendo después de responder; el GET la sigue", () => {
    const ruta = codigo("app/api/sales/exploraciones/[id]/escala/resumen/route.ts");
    expect(ruta).toContain("after(r.seguir);");
    expect(ruta).toContain("{ status: 202 }");
    expect(ruta).toMatch(/export async function GET[\s\S]*?guardDeLaExploracion\(id, "read"\)[\s\S]*?ultimaCorridaDelResumen\(id\)/);
    expect(ruta).toMatch(/export async function POST[\s\S]*?guardDeLaExploracion\(id, "write"\)/);
  });

  it("⛔ cada llamada a la IA del Resumen va con streaming y su tope, nunca sin tope", () => {
    const servidor = codigo("lib/exploraciones/resumen-de-la-escala-server.ts");
    expect(servidor).toContain("llamarConTope(() => getAnthropic().messages.stream(pedido, { maxRetries: 1 }), principal ? TOPES_DEL_RESUMEN.principal : TOPES_DEL_RESUMEN.arreglo");
    expect(servidor).not.toContain("messages.create(");
    expect(servidor).toContain("e instanceof LlamadaSinRespuesta ? ERROR_SIN_RESPUESTA : humanizeAgentError(e)");
    // El candado mira el latido, no cuándo empezó.
    expect(servidor).toMatch(/status: "RUNNING", updatedAt: \{ gte: new Date\(Date\.now\(\) - MINUTOS_SIN_LATIDO \* 60_000\) \}/);
  });

  it("⛔ cada llamada late al empezar, aunque la fase no cambie (los arreglos van todos con «Revisando…»)", () => {
    const servidor = codigo("lib/exploraciones/resumen-de-la-escala-server.ts");
    expect(servidor).toContain("if (texto === faseActual && Date.now() - escritaEn < LATIDO_MINIMO_MS) return;");
    const pedir = servidor.slice(servidor.indexOf("const pedir = (pedido"), servidor.indexOf("const corrida = await escribirElResumen(le, pedir);"));
    expect(pedir).toContain("fase(principal ? (faseActual ?? FASES_DEL_RESUMEN.escribiendo) : FASES_DEL_RESUMEN.revisando);");
    expect(pedir.indexOf("fase(principal")).toBeLessThan(pedir.indexOf("llamarConTope("));
  });

  it("⛔ el candado se vuelve a mirar con la fila de la exploración bloqueada, en la misma transacción que crea la corrida", () => {
    const servidor = codigo("lib/exploraciones/resumen-de-la-escala-server.ts");
    expect(servidor).toMatch(/prisma\.\$transaction\(async \(tx\) => \{\s*await bloquearFila\(tx, o\.exploracionId\);\s*const otra = await corridaEnCurso\(tx, o\.exploracionId\);\s*if \(otra\) return \{ otra \};[\s\S]*?tx\.agentRun\.create\(/);
  });

  it("un stream cortado deja su fila en el medidor, con lo que ya se gastó (antes, una llamada colgada no se veía en el gasto)", () => {
    const medidor = codigo("lib/anthropic.ts");
    expect(medidor).toContain('stream.on?.("abort"');
    expect(medidor).toContain("return stream.currentMessage?.usage;");
    expect(medidor.match(/usage: loGastado\(\),/g)).toHaveLength(2);
  });
});
