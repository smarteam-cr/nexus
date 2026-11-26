/**
 * Los topes de lo que escribe la persona (Elías, 25 nov: Marco se topó con el de 1.200 en La escala). Un mensaje del chat
 * y un pedido a La escala van hasta 15.000 caracteres; la nota que se guarda, hasta el tope de una nota de la preventa; y lo
 * que viaja de la conversación al modelo tiene su propio tope, para que unos mensajes largos no dejen sin lugar a la página
 * y a las reuniones: el último va siempre entero y se recortan primero los más viejos.
 */
import { describe, expect, it } from "vitest";
import { MAX_PEDIDO } from "@/lib/pedirle-a-nexus/contrato";
import { OperacionSchema } from "@/lib/exploraciones/esquemas";
import { PedidoALaEscalaSchema } from "@/lib/exploraciones/escala-con-nexus-esquemas";
import { prefijoDeLaRespuesta } from "@/lib/exploraciones/forma-de-la-respuesta";
import {
  conTopeDeLaConversacion,
  laDijoLaPersona,
  loQueContoEnPedazos,
  loQueQuedaEnLaNota,
  mensajesValidos,
  notaDeLaConversacion,
  pedidoDelTurno,
  primerasSinPartir,
  TOPES,
  ultimasSinPartir,
  type ContextoParaNexus,
  type MensajeDeLaConversacion,
} from "./conversacion";
import { ventanaParaLaCuenta } from "./lista";
import { armarLasFuentes, pedidoDeLaRespuesta } from "./respuesta";

const persona = (texto: string): MensajeDeLaConversacion => ({ de: "persona", texto });
const nexus = (texto: string): MensajeDeLaConversacion => ({ de: "nexus", texto });
const largo = (letra: string, n: number) => letra.repeat(n);
const totalDe = (m: readonly { texto: string }[]) => m.reduce((s, x) => s + x.texto.length, 0);

describe("los topes de lo que escribe la persona", () => {
  it("un mensaje y un pedido a La escala van hasta 15.000 caracteres, y la frontera los acepta enteros", () => {
    expect(TOPES.largoDelMensaje).toBe(15_000);
    expect(MAX_PEDIDO).toBe(15_000);
    expect(mensajesValidos([persona(largo("a", 15_000))])![0].texto).toHaveLength(15_000);
    const pedido = PedidoALaEscalaSchema.safeParse({ lugar: { pagina: "resumen" }, pedido: largo("a", 15_000) });
    expect(pedido.success).toBe(true);
    expect(PedidoALaEscalaSchema.safeParse({ lugar: { pagina: "resumen" }, pedido: largo("a", 15_001) }).success).toBe(false);
  });

  it("⛔ la nota que se guarda tiene el tope de una nota de la preventa, y la validación de la preventa la acepta", () => {
    const nota = (texto: string) => OperacionSchema.safeParse({ op: "nota", paso: "sabido:abc123", texto });
    expect(nota(largo("a", TOPES.largoDeLaNota)).success).toBe(true);
    expect(nota(largo("a", TOPES.largoDeLaNota + 1)).success).toBe(false);
    expect(nota(notaDeLaConversacion([persona(largo("a", 9_000))])).success).toBe(true);
  });

  it("⛔ lo que pasa de la nota se corta por el PRINCIPIO, con «…»: lo último (la respuesta a La escala) entra entero", () => {
    const n = notaDeLaConversacion([persona(`${largo("a", 6_000)} FINAL`)]);
    expect(n.length).toBeLessThanOrEqual(TOPES.largoDeLaNota);
    expect(n.length).toBeGreaterThan(TOPES.largoDeLaNota - 5);
    expect(n.startsWith("…")).toBe(true);
    expect(n.endsWith(" FINAL")).toBe(true);
    // Contó 6.000 sin guardar y después respondió una pregunta de La escala: la respuesta queda entera en la nota.
    const respuesta = `${prefijoDeLaRespuesta({ equipo: "Ventas", dimension: "Datos", pregunta: "¿Cómo registran hoy los contactos?" })}En un Excel compartido`;
    expect(notaDeLaConversacion([persona(largo("b", 6_000)), nexus("¿De qué mes?"), persona(respuesta)]).endsWith(`\n${respuesta}`)).toBe(true);
    // La respuesta llena la caja: entra entera igual, y el «…» no se le pega.
    const llena = `${prefijoDeLaRespuesta({ equipo: "Ventas", dimension: "Datos", pregunta: "¿Cómo registran?" })}`;
    const respuestaLlena = `${llena}${largo("c", TOPES.largoDeLaNota - llena.length)}`;
    const conLlena = notaDeLaConversacion([persona(largo("b", 6_000)), persona(respuestaLlena)]);
    expect(conLlena).toBe(respuestaLlena);
    // Nexus repreguntó y la persona contestó con un texto largo: el renglón de la respuesta a La escala sigue en la nota.
    const repregunta = notaDeLaConversacion([persona(respuesta), nexus("¿Quién lo llena?"), persona(largo("d", 6_000))]);
    expect(repregunta.startsWith(`${respuesta}\n…`)).toBe(true);
    expect(repregunta.length).toBeLessThanOrEqual(TOPES.largoDeLaNota);
    // Lo que cabe va igual que siempre, sin marca.
    expect(notaDeLaConversacion([persona("Pierden 40 mil al mes")])).toBe("Pierden 40 mil al mes");
  });

  it("⛔ lo que se propone con lo contado se revisa contra lo que queda en la nota: lo de antes del corte no la respalda", () => {
    const m = [persona(`Pierden 40 mil dólares al mes en cartera. ${largo("a", 6_000)} Tienen 3 sedes en Guatemala`)];
    expect(laDijoLaPersona("Tienen 3 sedes en Guatemala", loQueQuedaEnLaNota(m))).toBe(true);
    expect(laDijoLaPersona("Pierden 40 mil dólares al mes en cartera", loQueQuedaEnLaNota(m))).toBe(false);
    expect(laDijoLaPersona("Pierden 40 mil dólares al mes en cartera", loQueContoEnPedazos(m))).toBe(false);
    // Si entra entera, como siempre: mensaje por mensaje.
    expect(loQueQuedaEnLaNota([persona("200 al mes"), nexus("¿De qué?"), persona("Cartera")])).toEqual(["200 al mes", "Cartera"]);
    // Pegó un acta larga y contestó «Unos 40» a Nexus: la respuesta corta sigue valiendo entera (segunda revisión).
    const acta = [persona(largo("a", 9_000)), nexus("¿Cuántos vendedores?"), persona("Unos 40")];
    expect(laDijoLaPersona("Unos 40", loQueQuedaEnLaNota(acta))).toBe(true);
    expect(laDijoLaPersona("Unos 40", loQueContoEnPedazos(acta))).toBe(true);
  });

  it("⛔ los cortes no parten un emoji (medio emoji no se guarda en la base)", () => {
    const conEmoji = `${largo("a", 9)}👍${largo("b", 9)}`; // el emoji ocupa las posiciones 9 y 10
    expect(primerasSinPartir(conEmoji, 10)).toBe(largo("a", 9));
    expect(ultimasSinPartir(conEmoji, 10)).toBe(largo("b", 9));
    // El corte de la nota (las últimas tope - 1 letras) cae justo dentro del emoji.
    const n = notaDeLaConversacion([persona(`${largo("a", 5_000)}👍${largo("b", TOPES.largoDeLaNota - 2)}`)]);
    expect(n).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/);
    expect(n.startsWith("…b")).toBe(true);
    // Los otros cortes: el de lo que viaja y el de un mensaje.
    const viaja = conTopeDeLaConversacion([persona(`${largo("a", 299)}👍${largo("a", 300)}`), persona(largo("z", 700))], 1_001);
    expect(viaja[0].texto).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    expect(mensajesValidos([persona(`${largo("a", TOPES.largoDelMensaje - 1)}👍`)])![0].texto).toBe(largo("a", TOPES.largoDelMensaje - 1));
  });
});

describe("⛔ lo que viaja de la conversación al modelo tiene su tope", () => {
  it("si cabe, va todo igual", () => {
    const m = [persona("Pierden 40 mil"), nexus("¿Al mes?"), persona("Sí, al mes")];
    expect(conTopeDeLaConversacion(m)).toEqual(m);
  });

  it("si no cabe: el último entero, se recortan primero los más viejos y el del borde termina en «…»", () => {
    const m = [persona(largo("v", 15_000)), nexus(largo("w", 15_000)), persona(largo("x", 15_000)), nexus(largo("y", 15_000)), persona(largo("z", 15_000))];
    const t = conTopeDeLaConversacion(m, 50_000);
    expect(t.at(-1)).toEqual(m.at(-1));
    expect(totalDe(t)).toBeLessThanOrEqual(50_000);
    // Los dos de antes del último van enteros; el del borde, cortado; el más viejo, no va.
    expect(t.map((x) => x.texto[0])).toEqual(["w", "x", "y", "z"]);
    expect(t[0].texto.endsWith("…")).toBe(true);
    expect(t[0].texto.length).toBe(5_000);
  });

  it("el último va entero aunque solo él pase el tope", () => {
    const m = [persona("Hola"), nexus("Dime"), persona(largo("a", 20_000))];
    expect(conTopeDeLaConversacion(m, 10_000)).toEqual([m[2]]);
  });

  it("al contar: 28 mensajes de 15.000 no pasan del tope, y lo último que escribió la persona va entero", () => {
    const m: MensajeDeLaConversacion[] = [];
    for (let i = 0; i < TOPES.mensajes - 1; i++) m.push(i % 2 ? nexus(largo("n", 15_000)) : persona(largo("p", 15_000)));
    m.push(persona(`ÚLTIMO ${largo("u", 14_000)}`));
    const ctx: ContextoParaNexus = { donde: "la preventa", empresa: "X", contexto: "", destinos: [] };
    const texto = String(pedidoDelTurno(ctx, m, "contar").messages[0].content);
    const conversacion = texto.slice(texto.indexOf("=== LA CONVERSACIÓN ==="));
    expect(conversacion.length).toBeLessThan(TOPES.largoDeLaConversacion + 3_000);
    expect(conversacion).toContain(`ÚLTIMO ${largo("u", 14_000)}`);
  });

  it("al responder una pregunta: lo de antes cabe con la pregunta entera", () => {
    const antes = Array.from({ length: 6 }, (_, i) => (i % 2 ? nexus(largo("n", 15_000)) : persona(largo("p", 15_000))));
    const pregunta = `¿${largo("q", 14_000)}?`;
    const { fuentes, afuera } = armarLasFuentes([], []);
    const p = pedidoDeLaRespuesta({ empresa: "X", fuentes, afuera, conversacion: [...antes, persona(pregunta)], pregunta });
    const textos = (p.messages[0].content as { text: string }[]).map((b) => b.text).join("\n");
    expect(textos).toContain(pregunta);
    expect(textos.length).toBeLessThan(TOPES.largoDeLaConversacion + 5_000);
  });

  it("a la mano de la cuenta: la ventana respeta las letras y sigue empezando por la persona", () => {
    const m = Array.from({ length: 8 }, (_, i) => (i % 2 ? nexus(largo("n", 15_000)) : persona(largo("p", 15_000))));
    const v = ventanaParaLaCuenta(m, [], (t) => t, undefined, 40_000);
    expect(totalDe(v)).toBeLessThanOrEqual(40_000);
    expect(v[0].rol).toBe("user");
    expect(v.at(-1)!.texto).toBe(largo("n", 15_000));
  });
});
