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
 *     siempre y cuando lo tenga en su contexto»; hasta ese día no llegaba nunca, aunque se pidiera). Una palabra de
 *     `TEMAS_INTERNOS` que la pieza no decía, o una frase sacada de una nota interna del equipo, llega solo si:
 *       1. el pedido nombra el tema y no pide quitar ni dejar de mencionar nada (`PIDE_QUE_NO`: con eso, lo interno se pide
 *          aparte);
 *       2. todo lo nuevo de la oración que lo dice sale de las palabras del pedido (el modelo no lee las notas: lo que agrega
 *          por su cuenta, como una causa o una fecha, es inventado);
 *       3. Nexus lo tiene de esa cuenta (sus notas y su memoria, `interno`): el tema está ahí, la mayoría de lo nuevo
 *          también, cada número con la palabra que lo acompaña («20 mil», no el 20 de «20 vendedores») y sin que la nota
 *          diga lo contrario («no hay presupuesto» frena «hay presupuesto»).
 *     Entonces el cambio llega marcado (`interno`): la pantalla avisa «Esto es interno de la venta y lo verá el cliente al
 *     publicar» (`AVISO_DE_LO_INTERNO`), lo deja fuera de «Aplicar todo» y pregunta antes de aplicarlo. El modelo nunca lee
 *     las notas internas (lib/exploraciones/lo-que-confirmo-el-equipo.ts › `paraElAlcance` las corta), y su regla nombra los
 *     temas desde aquí (`NOMBRES_DE_LO_INTERNO`): no puede invitarlo a uno que el código no reconoce.
 *     Lo que no ve: el respaldo y la contradicción se miran por palabras, no por sentido; y un tema fuera de la lista llega
 *     como un cambio normal (lo frena solo la regla del modelo, como antes del 24 nov).
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

/** Después de una letra (con tilde o sin ella) no termina la palabra: `\b` no ve las tildes. */
const FIN = "(?![a-záéíóúüñ])";
const tema = (nombre: string, patron: string) => ({ nombre, patron: new RegExp(`\\b(?:${patron})${FIN}`, "gi") });

/**
 * Lo interno de la VENTA, por tema: lo que no va en algo que ve el cliente salvo que se pida. Acotado a como se habla de la
 * venta de Smarteam: «precios», «firma» o «prefiere» solos son el vocabulario de la escala («tu cliente prefiere comprar por
 * WhatsApp», «el cliente firma la cotización»), y no cuentan. Se compara palabra por palabra: que la pieza ya dijera
 * «presupuesto» no habilita «presupuesto congelado» con otra palabra del tema.
 */
export const TEMAS_INTERNOS: readonly { nombre: string; patron: RegExp }[] = [
  tema("el presupuesto", "presupuest[a-z]*"),
  tema(
    "nuestro precio, nuestra propuesta o un descuento que les damos",
    "nuestr[oa]s? (?:precio|propuesta|cotizaci[oó]n|oferta|descuento)[a-z]*|el precio de (?:smarteam|la licencia|las licencias|hubspot|la implementaci[oó]n)|(?:les?|te) (?:ofrecimos|ofrecemos|ofreceremos|damos|dimos|daremos|haremos) (?:un |el |una )?descuento[a-z]*",
  ),
  tema(
    "quién decide, aprueba o firma la compra",
    "qui[eé]n(?:es)? (?:decide|deciden|firma|firman|aprueba|aprueban|manda)|decisor[a-z]*|(?:decide|deciden|aprueba|aprueban|firma|firman|firmar[aá]n?) (?:la compra|el contrato|la propuesta)",
  ),
  tema("las objeciones", "objeci[oó]n[a-z]*|objeta[a-z]*"),
  tema("las posturas o lo que una persona no quiere", "postura[s]?|desconf[a-záéíóúñ]*|no (?:quiere|quieren|est[aá]n? convencid[a-z]*|le gusta|les gusta|conf[ií]a[n]?)"),
  tema("la competencia", "competidor[a-z]*|la competencia"),
];

/** Los temas, en palabras, para la regla del modelo (escala-con-nexus-server.ts › `REGLAS_DE_PEDIRLE`). */
export const NOMBRES_DE_LO_INTERNO = TEMAS_INTERNOS.map((t) => t.nombre).join("; ");

/** Las palabras de un tema en un texto, sin tildes ni mayúsculas. */
const terminos = (t: { patron: RegExp }, texto: string) => [...texto.matchAll(t.patron)].map((m) => sinTildes(m[0]));

/**
 * El pedido pide quitar o no mencionar algo: «sin mencionar el presupuesto», «nunca menciones el precio», «no quiero que
 * aparezca», «deja fuera…», «quita…». Con eso no nombra nada interno (aunque diga el tema): saber de qué habla el «no» es
 * adivinar, y adivinar mal lleva lo interno al cliente. Lo interno se pide en un pedido aparte, con todas sus letras.
 */
const PIDE_QUE_NO = new RegExp(
  [
    "\\bnunca\\b",
    "\\bsin (?:mencion|nombr|habl|inclu|pon|dec|met|agreg|escrib)[a-z]*",
    // En la voz de quien pide («no quiero que…»): «el director no quiere…» es lo que se cuenta, no lo que se pide.
    "\\bno (?:inclu|pong|pon|dig|menci|habl|met|agreg|escrib|nombr|quiero|queremos|hace falta|deb|aparezc|salga|quede)[a-z]*",
    "\\bdej[a-z]* (?:afuera|fuera)\\b",
    "\\b(?:quit|sac|omit|evit|elimin|borr)[a-z]*",
    "\\b(?:excepto|salvo)\\b",
    "\\bnada (?:de|sobre)\\b",
  ].join("|"),
);

/** Las frases de cinco palabras de un texto (sin tildes ni signos): para reconocer una frase copiada de lo interno. */
function frases(texto: string, n = 5): Set<string> {
  const p = fichas(texto);
  const r = new Set<string>();
  for (let i = 0; i + n <= p.length; i++) r.add(p.slice(i, i + n).join(" "));
  return r;
}

/** El texto en fichas: sin tildes ni signos, y cada número entero («20.000» es «20000»). */
function fichas(texto: string): string[] {
  return sinTildes(texto)
    .replace(/\d[\d.,]*/g, (n) => ` ${cifrasDe(n)[0] ?? ""} `)
    .replace(/%/g, " pct ")
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Las palabras que solo arman la frase (artículos, preposiciones, pronombres): no dicen nada que se pueda inventar. */
const VACIAS = new Set("que los las les nos del con por para una uno unos unas sus mas muy ese esa eso este esta esto estos estas como pero sobre entre hasta desde cuando donde ellos ellas nuestro nuestra".split(" "));
/** Las palabras que dicen algo: de tres letras o más, más «no» y «ni» (cambian lo que se dice); sin los números. */
const palabras = (texto: string) => fichas(texto).filter((p) => (p.length >= 3 || p === "no" || p === "ni") && !/^\d+$/.test(p) && !VACIAS.has(p));
/** Cada número con la palabra que lo sigue: «20 mil» no es «20 vendedores». Al final de la frase, el número solo. */
const conSuPalabra = (texto: string) => {
  const f = fichas(texto);
  return f.flatMap((p, i) => (/^\d+$/.test(p) ? [f[i + 1] ? `${p} ${f[i + 1]}` : p] : []));
};
/** Si lo que sabe Nexus respalda un número con su palabra (o, solo, si aparece). */
const respalda = (deLaCuenta: ReadonlySet<string>, numeros: ReadonlySet<string>, n: string) => (n.includes(" ") ? deLaCuenta.has(n) : numeros.has(n));
/** Una cláusula dice que no: la contradicción se mira cláusula por cláusula («hay presupuesto, pero no quiere pasarse»). */
const NIEGA = /\b(?:no|ni|nunca|sin|tampoco|todavia no|aun no)\b/;
const clausulas = (texto: string) => sinTildes(texto).split(/[.;:!?,]|\by\b|\bpero\b|\bporque\b|\baunque\b/);
/** De lo nuevo que dice lo interno, cuánto tiene que estar en lo que Nexus sabe de la cuenta. */
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
  const palabrasDeLaCuenta = new Set(palabras(deLaCuenta));
  const cifrasDeLaCuenta = new Set(conSuPalabra(deLaCuenta));
  const numerosDeLaCuenta = new Set(cifrasDe(deLaCuenta));
  const clausulasDeLaCuenta = clausulas(deLaCuenta);
  const loQueSePuede = frases([pagina, ...o.delCliente].join("\n"));
  const deLoInterno = new Set([...frases(deLaCuenta)].filter((f) => !loQueSePuede.has(f)));
  const delPedido = frases(o.pedido);
  const palabrasDelPedido = new Set(palabras(o.pedido));
  const pideQueNo = PIDE_QUE_NO.test(sinTildes(o.pedido));

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
      // Lo interno que la pieza no decía ya, palabra por palabra.
      const nuevos = TEMAS_INTERNOS.flatMap((t) => {
        const ya = new Set(terminos(t, antes ?? ""));
        const termino = terminos(t, despues).find((w) => !ya.has(w));
        return termino ? [{ t, termino }] : [];
      });
      // (`terminos` usa `matchAll`, que no arrastra el `lastIndex` de un patrón global como `test`.)
      const sinPedir = nuevos.find(({ t }) => pideQueNo || terminos(t, o.pedido).length === 0);
      if (sinPedir) {
        descartar(
          pideQueNo
            ? `Habla de algo interno («${sinPedir.termino}») y tu pedido pide quitar o no mencionar algo: lo interno se pide aparte, con todas sus letras.`
            : `Habla de algo interno («${sinPedir.termino}») que tu pedido no nombra: el cliente no lo ve.`,
        );
        continue;
      }
      const sinTenerlo = nuevos.find(({ t }) => terminos(t, deLaCuenta).length === 0);
      if (sinTenerlo) {
        descartar(`Habla de algo interno («${sinTenerlo.termino}») que Nexus no tiene en lo que sabe de la cuenta: si es cierto, cuéntaselo primero.`);
        continue;
      }
      /* Lo interno, oración por oración: la que trae una palabra interna nueva o una frase de una nota. Una frase de una
         nota pasa si el pedido la trae o si va en la misma oración que un tema que el pedido nombró. */
      const oraciones = despues.split(/(?<=[.;!?])\s+/).map((oracion) => ({
        oracion,
        temas: nuevos.filter(({ t }) => terminos(t, oracion).length > 0),
        copiadas: [...frases(oracion)].filter((f) => deLoInterno.has(f)),
      }));
      if (oraciones.some((c) => c.copiadas.length && !c.temas.length && (pideQueNo || !c.copiadas.some((f) => delPedido.has(f))))) {
        descartar("Copia algo de lo interno (una nota del equipo que el cliente no ve) que tu pedido no nombra.");
        continue;
      }
      const internas = oraciones.filter((c) => c.temas.length || c.copiadas.length);
      interno = internas.length > 0;
      const yaDecia = new Set(palabras(antes ?? ""));
      const yaNumeros = new Set(cifrasDe(antes ?? ""));
      const motivoDe = (c: (typeof internas)[number]): string | null => {
        const nuevas = palabras(c.oracion).filter((p) => !yaDecia.has(p));
        // 2. Lo nuevo sale del pedido, entero: el modelo no lee las notas, así que lo que agrega lo inventó.
        const deMas = nuevas.find((p) => !palabrasDelPedido.has(p));
        if (deMas) return `Dice de algo interno más de lo que pediste («${deMas}», en «${c.oracion}»): escríbelo en tu pedido tal como es.`;
        // 3. Y Nexus lo tiene de la cuenta: lo nuevo, cada número con su palabra, y sin que la nota diga lo contrario.
        const enLasNotas = nuevas.length ? nuevas.filter((p) => palabrasDeLaCuenta.has(p)).length / nuevas.length : 1;
        const numeros = conSuPalabra(c.oracion).filter((n) => !yaNumeros.has(n.split(" ")[0]));
        if (enLasNotas < EN_LAS_NOTAS || numeros.some((n) => !respalda(cifrasDeLaCuenta, numerosDeLaCuenta, n)))
          return `Lo que dice de algo interno («${c.oracion}») no está en lo que Nexus sabe de la cuenta: si es cierto, cuéntaselo primero.`;
        for (const { t } of c.temas) {
          const suyas = clausulas(c.oracion).filter((cl) => terminos(t, cl).length);
          const deLaNota = clausulasDeLaCuenta.filter((cl) => terminos(t, cl).length);
          const niega = suyas.some((cl) => NIEGA.test(cl));
          if (deLaNota.length && deLaNota.every((cl) => NIEGA.test(cl) !== niega))
            return `Lo que dice de algo interno («${c.oracion}») contradice lo que Nexus sabe de la cuenta: revisa la nota antes de pedirlo.`;
        }
        return null;
      };
      const motivo = internas.map(motivoDe).find(Boolean);
      if (motivo) {
        descartar(motivo);
        continue;
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
