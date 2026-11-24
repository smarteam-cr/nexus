/**
 * lib/pedirle-a-nexus/veracidad.ts — LA REVISIÓN DEL CÓDIGO sobre lo que propone «✨ Pedirle a Nexus» (23 nov). PURO.
 *
 * El modelo propone; el código decide qué llega a la persona. Lo que no pasa queda en `descartados`, con el porqué: nada
 * se esconde. Las reglas (lo que no se negocia, plan maestro › etapa 3):
 *   · Solo piezas del documento: una clave que no existe, o una pieza que no se puede quitar, no llega. Con el pedido hecho
 *     desde una sección (24 nov), las piezas son las de esa sección.
 *   · LA VARA DE LAS CIFRAS: un número que no está en la página, en el pedido ni en lo que sabe Nexus de la empresa para el
 *     cliente no llega. Nexus no inventa cifras; si la persona da la cifra en su pedido, sí.
 *   · LO INTERNO, SOLO SI SE PIDE Y NEXUS LO TIENE (24 nov; Elías: «sí debería poner lo que el usuario de Nexus diga,
 *     siempre y cuando lo tenga en su contexto»; hasta ese día no llegaba nunca, aunque se pidiera). Tres cosas:
 *       1. MARCA. Todo cambio que toca lo interno llega marcado (`interno`): una oración nueva o cambiada con una palabra de
 *          `TEMAS_INTERNOS` (aunque la pieza ya la tuviera) o con una frase de una nota interna del equipo. La pantalla
 *          avisa «Esto es interno de la venta y lo verá el cliente al publicar» (`AVISO_DE_LO_INTERNO`), lo deja fuera de
 *          «Aplicar todo» y pregunta antes de aplicarlo. Así nada interno llega como un cambio normal.
 *       2. LO QUE NO SE PIDIÓ, NO LLEGA. Una palabra interna que la pieza no tenía llega solo si el pedido nombra su tema y
 *          no pide quitar ni dejar de mencionar nada (`PIDE_QUE_NO`: con eso, lo interno se pide aparte). Una frase de una
 *          nota, solo si el pedido la trae o va con un tema pedido.
 *       3. LO PEDIDO, COMO SE PIDIÓ Y SI NEXUS LO TIENE. Si el pedido nombra lo interno que el cambio toca, el cambio ENTERO
 *          se escribe con las palabras del pedido (el modelo no lee las notas: lo que agrega, como una causa o una fecha, es
 *          inventado), y Nexus tiene que tenerlo de la cuenta (sus notas y su memoria, `interno`, o lo que la página ya
 *          muestra): el tema está ahí; cada número, en una nota junto al tema («20 mil», no el 20 de «20 vendedores»); sin
 *          números, la mayoría de lo nuevo; y la nota más parecida no dice lo contrario («no hay presupuesto» frena «hay
 *          presupuesto»).
 *     El modelo nunca lee las notas internas (lib/exploraciones/lo-que-confirmo-el-equipo.ts › `paraElAlcance` las corta),
 *     y su regla nombra los temas desde aquí (`NOMBRES_DE_LO_INTERNO`): no puede invitarlo a uno que el código no reconoce.
 *     Lo que no ve: el respaldo y la contradicción se miran por palabras, no por sentido; un tema fuera de la lista llega
 *     como un cambio normal (lo frena solo la regla del modelo, como antes del 24 nov); y reescribir una oración que ya
 *     hablaba de un tema interno, sin pedirlo, llega marcado pero no verificado (la persona lo lee antes de aplicar).
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

/** Las letras de una palabra, con tilde o sin ella: `\b` y `[a-z]` no ven las tildes. */
const L = "[a-záéíóúüñ]";
const tema = (nombre: string, patron: string) => ({ nombre, patron: new RegExp(`\\b(?:${patron})(?!${L})`, "gi") });

/**
 * Lo interno de la VENTA, por tema: lo que no va en algo que ve el cliente salvo que se pida. Acotado a como se habla de la
 * venta de Smarteam: «precios», «firma el contrato», «prefiere» o «inversión» solos son el vocabulario de la escala y de la
 * operación del cliente («tu cliente prefiere comprar por WhatsApp», «el cliente firma el contrato en papel») y no cuentan.
 * Lo que sí está en la lista («presupuesto», «la competencia», «objeciones») a veces es vocabulario de la escala: ahí la
 * oración cambiada llega marcada, y pedirla nueva pide su respaldo (una nota o la página que ya lo dice).
 */
export const TEMAS_INTERNOS: readonly { nombre: string; patron: RegExp }[] = [
  tema("el presupuesto", `presupuest${L}*`),
  tema(
    "nuestro precio, nuestra propuesta o un descuento que les damos",
    `nuestr[oa]s? (?:precio|propuesta|cotizaci[oó]n|oferta|descuento)${L}*|el precio de (?:smarteam|la licencia|las licencias|hubspot|la implementaci[oó]n)|(?:les?|te) (?:ofrecimos|ofrecemos|ofreceremos|damos|dimos|daremos|haremos) (?:un |el |una )?descuento${L}*`,
  ),
  tema("quién decide, aprueba o firma la compra", `qui[eé]n(?:es)? (?:decide|deciden|firma|firman|aprueba|aprueban|manda)|decisor${L}*`),
  tema("las objeciones", `objeci[oó]n${L}*|objet[aó]${L}*`),
  tema("las posturas o lo que una persona no quiere", `postura[s]?|desconf${L}*|no (?:quiere|quieren|est[aá]n? convencid${L}*|le gusta|les gusta|conf[ií]a[n]?)`),
  tema("la competencia", `competidor${L}*|la competencia`),
];

/** Los temas, en palabras, para la regla del modelo (escala-con-nexus-server.ts › `REGLAS_DE_PEDIRLE`). */
export const NOMBRES_DE_LO_INTERNO = TEMAS_INTERNOS.map((t) => t.nombre).join("; ");

/** Las palabras de un tema en un texto, sin tildes ni mayúsculas (`matchAll` no arrastra el `lastIndex` del patrón global). */
const terminos = (t: { patron: RegExp }, texto: string) => [...texto.matchAll(t.patron)].map((m) => sinTildes(m[0]));

/**
 * El pedido pide quitar o no mencionar algo: «sin mencionar el presupuesto», «sin el presupuesto», «nunca menciones…», «no
 * quiero que aparezca», «que no se mencione», «ni hables de…», «deja fuera…», «quita…». Con eso no nombra nada interno
 * (aunque diga el tema): saber de qué habla el «no» es adivinar, y adivinar mal lleva lo interno al cliente. Lo interno se
 * pide en un pedido aparte, con todas sus letras. Solo en la voz de quien pide: «nunca tienen presupuesto», «el director no
 * quiere» o «para evitar retrasos» son lo que se cuenta.
 */
const PIDE_QUE_NO = new RegExp(
  [
    "\\bnunca (?:menciones|pongas|digas|hables|incluyas|nombres|escribas|agregues)\\b",
    "\\bsin (?:mencion|nombr|habl|inclu|pon|dec|met|agreg|escrib)[a-z]*",
    "\\bsin (?:el|la|los|las|lo|nada)\\b",
    "\\bno (?:inclu|pong|pon|dig|menci|habl|met|agreg|escrib|nombr|quiero|queremos|hace falta|deb|aparezc|salga|quede)[a-z]*",
    "\\bque no se (?:mencion|nombr|pong|dig|inclu|habl|vea)[a-z]*",
    "\\bni (?:hables|menciones|pongas|digas|nombres|incluyas)\\b",
    "\\bdej[a-z]* (?:afuera|fuera)\\b",
    "\\b(?:quita|quitalo|quitala|quitalos|saca|sacalo|sacala|omite|omitelo|evita|evitalo|elimina|eliminalo|borra|borralo)\\b",
    "\\b(?:excepto|salvo)\\b",
    "\\bnada (?:de|sobre)\\b",
  ].join("|"),
);

/** El texto en fichas: sin tildes ni signos, cada número entero («20.000» es «20000») y «%» como «pct». */
function fichas(texto: string): string[] {
  return sinTildes(texto)
    .replace(/\d[\d.,]*/g, (n) => ` ${cifrasDe(n)[0] ?? ""} `)
    .replace(/%/g, " pct ")
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Las frases de cinco palabras de un texto: para reconocer una frase copiada de lo interno. */
function frases(texto: string, n = 5): Set<string> {
  const p = fichas(texto);
  const r = new Set<string>();
  for (let i = 0; i + n <= p.length; i++) r.add(p.slice(i, i + n).join(" "));
  return r;
}

/** Las palabras que solo arman la frase (artículos, preposiciones, pronombres): no dicen nada que se pueda inventar. */
const VACIAS = new Set("que los las les nos del con por para una uno unos unas sus mas muy ese esa eso este esta esto estos estas como pero sobre entre hasta desde cuando donde ellos ellas nuestro nuestra".split(" "));
/** Las palabras que dicen algo: de tres letras o más, más «no» y «ni» (cambian lo que se dice); sin los números. */
const palabras = (texto: string) => fichas(texto).filter((p) => (p.length >= 3 || p === "no" || p === "ni") && !/^\d+$/.test(p) && !VACIAS.has(p));

/** Lo que acompaña a un número y le cambia el tamaño: «20 mil» no es «20». Lo demás («20 vendedores») no cuenta. */
const MAGNITUD = new Set(["mil", "millon", "millones", "pct", "k", "m", "mm"]);
/** Cada número de un texto con su magnitud, si la tiene. */
const numeros = (texto: string) => {
  const f = fichas(texto);
  return f.flatMap((p, i) => (/^\d+$/.test(p) ? [MAGNITUD.has(f[i + 1] ?? "") ? `${p} ${f[i + 1]}` : p] : []));
};

/** Las oraciones de un texto (un punto entre dígitos, «20.000», no corta). */
const oracionesDe = (texto: string) => texto.split(/(?<=[.;!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
const igualQue = (a: string) => fichas(a).join(" ");
/** Una cláusula dice que no: la contradicción se mira cláusula por cláusula («hay presupuesto, pero no quiere pasarse»). */
const NIEGA = /\b(?:no|ni|nunca|sin|tampoco)\b/;
const clausulas = (texto: string) => sinTildes(texto).split(/[.;:!?,]|\by\b|\bpero\b|\bporque\b|\baunque\b/).map((c) => c.trim()).filter(Boolean);
/** Sin números, cuánto de lo nuevo tiene que estar en lo que Nexus sabe de la cuenta. */
const EN_LAS_NOTAS = 0.6;

export function revisarLaPropuesta(o: {
  /** Las piezas que se podían cambiar (la página o, con el pedido hecho desde una sección, las de esa sección). */
  piezas: readonly PiezaDelDocumento[];
  /** La página entera, para la vara de las cifras y de lo interno: lo que el cliente ya ve. Sin ella, las piezas. */
  pagina?: readonly PiezaDelDocumento[];
  propuesto: readonly PropuestoCrudo[];
  pedido: string;
  /** Lo que sabe Nexus de la empresa que SÍ puede ir al cliente (lo que se le dio al modelo). */
  delCliente: readonly string[];
  /** Lo que Nexus tiene de la cuenta entero (las notas del equipo y su memoria, también lo que no pasa el corte). */
  interno: readonly string[];
  /** Las formas de voseo de un texto (el detector del documento): la página le habla de tú al cliente. */
  voseo?: (texto: string) => readonly string[];
}): { cambios: CambioPropuesto[]; descartados: CambioDescartado[] } {
  const porClave = new Map(o.piezas.map((p) => [p.clave, p]));
  const deLaPagina = new Map((o.pagina ?? o.piezas).map((p) => [p.clave, p]));
  // Lo que ve el cliente: una cifra que el sistema le esconde (su cita no la sostiene) no vale para otra pieza.
  const pagina = (o.pagina ?? o.piezas).filter((p) => !p.noLaVeElCliente).map((p) => p.valor ?? "").join("\n");
  const permitidas = new Set([...cifrasDe(o.pedido), ...cifrasDe(pagina), ...o.delCliente.flatMap(cifrasDe)]);
  const deLaCuenta = o.interno.join("\n");
  // El contexto de la cuenta para lo interno pedido: las notas y su memoria, y lo que la página ya le muestra al cliente.
  const contexto = `${deLaCuenta}\n${pagina}`;
  const palabrasDelContexto = new Set(palabras(contexto));
  const oracionesDeLaCuenta = oracionesDe(deLaCuenta);
  // La contradicción se mira solo contra las notas: la página puede decir «sin» por otra cosa («agotar presupuesto sin medir»).
  const clausulasDeLaCuenta = clausulas(deLaCuenta);
  const loQueSePuede = frases([pagina, ...o.delCliente].join("\n"));
  const deLoInterno = new Set([...frases(deLaCuenta)].filter((f) => !loQueSePuede.has(f)));
  const delPedido = frases(o.pedido);
  const palabrasDelPedido = new Set(palabras(o.pedido));
  const pideQueNo = PIDE_QUE_NO.test(sinTildes(o.pedido));
  const loPide = (t: (typeof TEMAS_INTERNOS)[number]) => !pideQueNo && terminos(t, o.pedido).length > 0;

  const cambios: CambioPropuesto[] = [];
  const descartados: CambioDescartado[] = [];
  const vistas = new Set<string>();
  for (const x of o.propuesto) {
    const pieza = porClave.get(x.clave);
    const despues = x.despues?.replace(/[ \t]+/g, " ").trim() || null;
    const descartar = (motivo: string) => descartados.push({ clave: pieza ? x.clave : null, nombre: pieza?.nombre ?? null, texto: despues ?? "(quitarla)", motivo });
    if (!pieza) {
      const deOtra = deLaPagina.get(x.clave);
      if (deOtra) descartados.push({ clave: x.clave, nombre: deOtra.nombre, texto: despues ?? "(quitarla)", motivo: "Es de otra sección: pídelo desde esa sección o desde toda la página." });
      else descartar("Esa parte no es de esta página.");
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
    let interno = false;
    if (despues) {
      const voseo = o.voseo?.(despues) ?? [];
      if (voseo.length) {
        descartar(`Usa voseo («${voseo[0]}»): la página le habla de tú al cliente.`);
        continue;
      }
      // 2. Una palabra interna que la pieza no tenía: solo si el pedido nombra su tema.
      const nuevos = TEMAS_INTERNOS.flatMap((t) => {
        const ya = new Set(terminos(t, antes ?? ""));
        const termino = terminos(t, despues).find((w) => !ya.has(w));
        return termino ? [{ t, termino }] : [];
      });
      const sinPedir = nuevos.find(({ t }) => !loPide(t));
      if (sinPedir) {
        descartar(
          pideQueNo
            ? `Habla de algo interno («${sinPedir.termino}») y tu pedido pide quitar o no mencionar algo: lo interno se pide aparte, con todas sus letras.`
            : `Habla de algo interno («${sinPedir.termino}») que tu pedido no nombra: el cliente no lo ve.`,
        );
        continue;
      }
      // 1. Las oraciones nuevas o cambiadas que tocan lo interno: un tema (nuevo o de antes) o una frase de una nota.
      const deAntes = new Set(oracionesDe(antes ?? "").map(igualQue));
      const internas = oracionesDe(despues)
        .filter((oracion) => !deAntes.has(igualQue(oracion)))
        .map((oracion) => ({ oracion, temas: TEMAS_INTERNOS.filter((t) => terminos(t, oracion).length > 0), copiadas: [...frases(oracion)].filter((f) => deLoInterno.has(f)) }))
        .filter((c) => c.temas.length || c.copiadas.length);
      if (internas.some((c) => c.copiadas.length && !c.temas.some(loPide) && !c.copiadas.some((f) => delPedido.has(f)))) {
        descartar("Copia algo de lo interno (una nota del equipo que el cliente no ve) que tu pedido no nombra.");
        continue;
      }
      interno = internas.length > 0;
      // 3. Lo interno que se pidió: el cambio entero con las palabras del pedido, y Nexus lo tiene de la cuenta.
      const pedidos = [...new Set(internas.flatMap((c) => c.temas.filter(loPide)))];
      const pidioUnaNota = internas.some((c) => c.copiadas.some((f) => delPedido.has(f)));
      if (pedidos.length || pidioUnaNota) {
        const sinTenerlo = pedidos.find((t) => terminos(t, contexto).length === 0);
        if (sinTenerlo) {
          descartar(`Habla de algo interno («${sinTenerlo.nombre}») que Nexus no tiene en lo que sabe de la cuenta: si es cierto, cuéntaselo primero.`);
          continue;
        }
        const yaDecia = new Set(palabras(antes ?? ""));
        const nuevas = palabras(despues).filter((p) => !yaDecia.has(p));
        const deMas = nuevas.find((p) => !palabrasDelPedido.has(p));
        if (deMas) {
          descartar(`Dice de algo interno más de lo que pediste («${deMas}»): escríbelo en tu pedido tal como es.`);
          continue;
        }
        // Cada número nuevo, en una nota junto al tema pedido (o, si lo pedido es una frase de una nota, en alguna nota).
        const yaNumeros = new Set(numeros(antes ?? ""));
        const nuevosNumeros = numeros(despues).filter((n) => !yaNumeros.has(n));
        const respaldado = (n: string) =>
          oracionesDeLaCuenta.some((nota) => numeros(nota).includes(n) && (pedidos.length === 0 || pedidos.some((t) => terminos(t, nota).length > 0)));
        const sinNumero = nuevosNumeros.find((n) => !respaldado(n));
        const enLasNotas = nuevas.length ? nuevas.filter((p) => palabrasDelContexto.has(p)).length / nuevas.length : 1;
        if (sinNumero || (!nuevosNumeros.length && enLasNotas < EN_LAS_NOTAS)) {
          descartar(`Lo que dice de algo interno${sinNumero ? ` («${sinNumero}»)` : ""} no está en lo que Nexus sabe de la cuenta: si es cierto, cuéntaselo primero.`);
          continue;
        }
        // Y la nota más parecida no dice lo contrario.
        const contradice = pedidos.some((t) =>
          internas.some((c) =>
            clausulas(c.oracion)
              .filter((cl) => terminos(t, cl).length)
              .some((cl) => {
                const suyas = new Set(palabras(cl));
                const delTema = clausulasDeLaCuenta.filter((n) => terminos(t, n).length);
                const parecida = delTema.map((n) => ({ n, comun: palabras(n).filter((p) => suyas.has(p)).length })).sort((a, b) => b.comun - a.comun)[0];
                return !!parecida && NIEGA.test(parecida.n) !== NIEGA.test(cl);
              }),
          ),
        );
        if (contradice) {
          descartar("Lo que dice de algo interno contradice lo que Nexus sabe de la cuenta: revisa la nota antes de pedirlo.");
          continue;
        }
      }
      const propias = new Set(cifrasDe(antes ?? ""));
      const inventadas = cifrasDe(despues).filter((c) => !permitidas.has(c) && !propias.has(c));
      if (inventadas.length) {
        descartar(`Trae ${inventadas.length === 1 ? "una cifra" : "cifras"} que nadie dijo (${inventadas.join(", ")}). Si es cierta, escríbela en tu pedido.`);
        continue;
      }
    }
    cambios.push({ clave: x.clave, nombre: pieza.nombre, seccion: pieza.seccion, antes, despues, aMano: pieza.aMano, agregar: pieza.agregar, ...(interno ? { interno: true as const } : {}) });
  }
  return { cambios, descartados };
}
