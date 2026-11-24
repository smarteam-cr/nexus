/**
 * lib/pedirle-a-nexus/veracidad.ts — LA REVISIÓN DEL CÓDIGO sobre lo que propone «✨ Pedirle a Nexus» (23 nov). PURO.
 *
 * El modelo propone; el código decide qué llega a la persona. Lo que no pasa queda en `descartados`, con el porqué: nada
 * se esconde. Las reglas (lo que no se negocia, plan maestro › etapa 3):
 *   · Solo piezas del documento: una clave que no existe, o una pieza que no se puede quitar, no llega.
 *   · LA VARA DE LAS CIFRAS: un número que no está en la página, en el pedido ni en lo que sabe Nexus de la empresa para el
 *     cliente no llega. Nexus no inventa cifras; si la persona da la cifra en su pedido, sí.
 *   · LO INTERNO NUNCA: el presupuesto, quién decide, las objeciones o las posturas que no estaban en esa pieza no llegan,
 *     aunque la persona lo pida; tampoco una frase sacada de lo interno (una nota del equipo que no pasa el corte para el
 *     cliente). El corte de lo que se le da al modelo ya lo hace la memoria (lib/exploraciones/lo-que-confirmo-el-equipo.ts
 *     › `paraElAlcance`); esto es la segunda barrera, sobre lo que escribió.
 *   · TUTEO: un texto con voseo no llega (el detector lo da el documento: el del Resumen, `voseoDelResumen`).
 *   · Lo escrito a mano no se pisa sin preguntar: el cambio llega marcado (`aMano`) y la pantalla pregunta.
 *   · Las citas verificadas se cuidan solas: el cambio se aplica por el editor de siempre, que suelta la cita de una pieza
 *     cuando su texto trae un número que la cita no dice (lib/exploraciones/resumen-de-la-escala.ts › `editarElResumen`).
 */
import type { CambioDescartado, CambioPropuesto, PiezaDelDocumento } from "./contrato";

/** Lo que devolvió el modelo para una pieza: su clave y el texto nuevo ("" o null: quitarla). */
export interface PropuestoCrudo {
  clave: string;
  despues: string | null;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Los números de un texto, sin separadores: «4.800» y «4800» son el mismo; «2 de cada 10» da 2 y 10. */
export function cifrasDe(texto: string): string[] {
  return (texto.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]+$/, "").replace(/[.,]/g, "")).filter(Boolean);
}

/**
 * Lo interno por su nombre: lo que nunca va en algo que ve el cliente (la compra, quién decide, lo que piensa una persona).
 * Solo cuenta si la pieza no lo decía ya (un texto del cliente puede hablar de «decidir qué priorizar»: eso no es nuevo).
 */
const LO_INTERNO =
  /\b(presupuest\w*|objeci[oó]n\w*|objeta\w*|postura\w*|competidor\w*|la competencia|desconf\w*|no (?:quiere|quieren|est[aá]n? convencid\w*|le gusta|les gusta|conf[ií]a\w*)|qui[eé]n (?:decide|firma|aprueba|manda)|decisor\w*|nuestra propuesta|el precio de smarteam)\b/gi;

/** Las frases de cinco palabras de un texto (sin tildes ni signos): para reconocer una frase copiada de lo interno. */
function frases(texto: string, n = 5): Set<string> {
  const p = sinTildes(texto).replace(/[^a-z0-9ñ ]+/g, " ").split(/\s+/).filter(Boolean);
  const r = new Set<string>();
  for (let i = 0; i + n <= p.length; i++) r.add(p.slice(i, i + n).join(" "));
  return r;
}

export function revisarLaPropuesta(o: {
  piezas: readonly PiezaDelDocumento[];
  propuesto: readonly PropuestoCrudo[];
  pedido: string;
  /** Lo que sabe Nexus de la empresa que SÍ puede ir al cliente (lo que se le dio al modelo). */
  delCliente: readonly string[];
  /** Lo interno de la empresa (las notas enteras del equipo, lo que no pasa el corte): nada de esto llega. */
  interno: readonly string[];
  /** Las formas de voseo de un texto (el detector del documento): la página le habla de tú al cliente. */
  voseo?: (texto: string) => readonly string[];
}): { cambios: CambioPropuesto[]; descartados: CambioDescartado[] } {
  const porClave = new Map(o.piezas.map((p) => [p.clave, p]));
  // Lo que ve el cliente: una cifra que el sistema le esconde (su cita no la sostiene) no vale para otra pieza.
  const pagina = o.piezas.filter((p) => !p.noLaVeElCliente).map((p) => p.valor ?? "").join("\n");
  const permitidas = new Set([...cifrasDe(o.pedido), ...cifrasDe(pagina), ...o.delCliente.flatMap(cifrasDe)]);
  // Lo interno no se habilita porque venga en el pedido: «aunque se pida».
  const loQueSePuede = frases([pagina, ...o.delCliente].join("\n"));
  const deLoInterno = new Set([...frases(o.interno.join("\n"))].filter((f) => !loQueSePuede.has(f)));

  const cambios: CambioPropuesto[] = [];
  const descartados: CambioDescartado[] = [];
  const vistas = new Set<string>();
  for (const x of o.propuesto) {
    const pieza = porClave.get(x.clave);
    const despues = x.despues?.replace(/[ \t]+/g, " ").trim() || null;
    const descartar = (motivo: string) => descartados.push({ clave: pieza ? x.clave : null, nombre: pieza?.nombre ?? null, texto: despues ?? "(quitarla)", motivo });
    if (!pieza) {
      descartar("Esa parte no es de esta página.");
      continue;
    }
    if (vistas.has(x.clave)) continue;
    vistas.add(x.clave);
    const antes = pieza.valor;
    if ((despues ?? "") === (antes ?? "").trim()) continue;
    if (pieza.agregar && !despues) continue;
    if (!despues && !pieza.quitable) {
      descartar("Esta parte no se puede dejar vacía.");
      continue;
    }
    if (despues && despues.length > pieza.tope) {
      descartar(`Pasa del largo de esta parte (${pieza.tope} caracteres).`);
      continue;
    }
    if (despues) {
      const voseo = o.voseo?.(despues) ?? [];
      if (voseo.length) {
        descartar(`Usa voseo («${voseo[0]}»): la página le habla de tú al cliente.`);
        continue;
      }
      const propias = new Set(cifrasDe(antes ?? ""));
      const inventadas = cifrasDe(despues).filter((c) => !permitidas.has(c) && !propias.has(c));
      if (inventadas.length) {
        descartar(`Trae ${inventadas.length === 1 ? "una cifra" : "cifras"} que nadie dijo (${inventadas.join(", ")}). Si es cierta, escríbela en tu pedido.`);
        continue;
      }
      // Lo interno que la pieza no decía ya, término por término (que la pieza hable de un comité no habilita el presupuesto).
      const yaEstaba = new Set((antes ?? "").match(LO_INTERNO)?.map(sinTildes) ?? []);
      const interno = (despues.match(LO_INTERNO) ?? []).find((t) => !yaEstaba.has(sinTildes(t)));
      if (interno) {
        descartar(`Habla de algo interno («${interno}»): el cliente no lo ve, aunque se pida.`);
        continue;
      }
      if ([...frases(despues)].some((f) => deLoInterno.has(f))) {
        descartar("Copia algo de lo interno (una nota del equipo que el cliente no ve).");
        continue;
      }
    }
    cambios.push({ clave: x.clave, nombre: pieza.nombre, seccion: pieza.seccion, antes, despues, aMano: pieza.aMano, agregar: pieza.agregar });
  }
  return { cambios, descartados };
}
