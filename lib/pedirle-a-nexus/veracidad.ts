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
 *     siempre y cuando lo tenga en su contexto»; hasta ese día no llegaba nunca, aunque se pidiera). El código garantiza
 *     lo que se puede garantizar, y lo que pide juicio lo decide la persona con la nota a la vista:
 *       1. MARCA. Todo cambio que toca lo interno llega marcado (`interno`): una oración nueva o cambiada con una palabra de
 *          `TEMAS_INTERNOS` (aunque la pieza ya la tuviera) o con una frase de una nota interna del equipo. La pantalla
 *          avisa «Esto es interno de la venta y lo verá el cliente al publicar» (`AVISO_DE_LO_INTERNO`), lo deja fuera de
 *          «Aplicar todo» y pregunta antes de aplicarlo.
 *       2. LO QUE NO SE PIDIÓ, NO LLEGA. Una palabra interna que la pieza no tenía llega solo si el pedido nombra su tema y
 *          no pide quitar ni dejar de mencionar nada (`PIDE_QUE_NO`: con eso, lo interno se pide aparte). Una frase de una
 *          nota, solo si el pedido la trae o va con un tema pedido.
 *       3. LO PEDIDO, CON LAS PALABRAS DEL PEDIDO Y SI NEXUS LO TIENE. Si el pedido nombra lo interno que el cambio toca:
 *          cada oración nueva o cambiada sale del pedido y de su propia versión de antes, con sus palabras (también las que
 *          dan vuelta lo dicho: «no», «sí», «ya», «más de», «hasta») y sus números («1,5» no es 15); el modelo no lee las
 *          notas, así que lo que agrega (una causa, una fecha, una cifra) es inventado. Y el tema está en lo que Nexus tiene
 *          de la cuenta (sus notas y su memoria, `interno`, o el resto de la página). El cambio trae lo que lo respalda
 *          (`respaldo`: lo que más se parece al cambio, de a dos por tema, recortado alrededor del tema; `respaldoDeMas`,
 *          cuántas más), y la pantalla lo muestra debajo.
 *     Lo que el código NO juzga es el sentido: si lo pedido dice lo mismo que la nota (o lo contrario, o otra cifra). Se
 *     intentó por palabras (la contradicción, la cobertura, cada número con su palabra) y cinco vueltas de revisión, el 24
 *     nov, encontraron siempre otro caso: «no está aprobado» con el «no» después del tema, una cifra en la oración de al
 *     lado. Por eso la nota va a la vista y decide quien aplica. Tampoco ve un tema fuera de la lista (lo frena solo la regla
 *     del modelo, como antes del 24 nov) ni todas las formas de decir «no lo pongas» (si se escapa una, el cambio igual llega
 *     marcado y con su pregunta).
 *     El modelo nunca lee las notas internas (lib/exploraciones/lo-que-confirmo-el-equipo.ts › `paraElAlcance` las corta),
 *     y su regla nombra los temas desde aquí (`NOMBRES_DE_LO_INTERNO`): no puede invitarlo a uno que el código no reconoce.
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

/**
 * Los números de un texto: «4.800» y «4800» son el mismo (el separador de miles se va); «2 de cada 10» da 2 y 10; un
 * decimal se queda («1,5» es «1.5», no 15: el 24 nov «1,5 millones» → «15 millones» pasaba como el mismo número).
 */
export function cifrasDe(texto: string): string[] {
  return (texto.match(/\d[\d.,]*/g) ?? [])
    .map((n) => n.replace(/[.,]+$/, ""))
    .map((n) => (/^\d{1,3}(?:[.,]\d{3})+$/.test(n) ? n.replace(/[.,]/g, "") : /^\d+[.,]\d{1,2}$/.test(n) ? n.replace(",", ".") : n.replace(/[.,]/g, "")))
    .filter(Boolean);
}

/** Las letras de una palabra, con tilde o sin ella: `\b` y `[a-z]` no ven las tildes. */
const L = "[a-záéíóúüñ]";
const tema = (nombre: string, patron: string) => ({ nombre, patron: new RegExp(`\\b(?:${patron})(?!${L})`, "gi") });

/**
 * Lo interno de la VENTA, por tema: lo que no va en algo que ve el cliente salvo que se pida. Acotado a como se habla de la
 * venta de Smarteam: «precios», «firma el contrato», «prefiere» o «inversión» solos son el vocabulario de la escala y de la
 * operación del cliente («tu cliente prefiere comprar por WhatsApp», «el cliente firma el contrato en papel») y no cuentan.
 * Lo que sí está en la lista («presupuesto», «la competencia», «objeciones») a veces es vocabulario de la escala: la oración
 * cambiada llega marcada, y pedirla nueva pide su respaldo (una nota o la página que ya lo dice).
 */
export const TEMAS_INTERNOS: readonly { nombre: string; patron: RegExp }[] = [
  tema("el presupuesto", `presupuest${L}*`),
  tema(
    "nuestro precio, nuestra propuesta o un descuento que les damos",
    `nuestr[oa]s? (?:precio|propuesta|cotizaci[oó]n|oferta|descuento)${L}*|el precio de (?:smarteam|la licencia|las licencias|hubspot|la implementaci[oó]n)|(?:les?|te) (?:ofrecimos|ofrecemos|ofreceremos|damos|dimos|daremos|haremos) (?:un |el |una )?descuento${L}*`,
  ),
  tema(
    "quién decide, aprueba o firma la compra; quién aprueba o firma la propuesta",
    `qui[eé]n(?:es)? (?:decide|deciden|firma|firman|aprueba|aprueban|manda)|decisor${L}*|(?:aprueb|aprob)${L}* la compra|(?:aprueb|aprob|firm)${L}* (?:la|nuestra) propuesta|la (?:compra|propuesta) la (?:aprueb|aprob|firm|decid)${L}*`,
  ),
  tema("las objeciones", `objeci[oó]n${L}*|objet[aó]${L}*`),
  tema("las posturas o lo que una persona no quiere", `postura[s]?|desconf${L}*|no (?:quiere|quieren|est[aá]n? convencid${L}*|le gusta|les gusta|conf[ií]a[n]?)`),
  tema("la competencia", `competidor${L}*|la competencia`),
];

/** Los temas, en palabras, para la regla del modelo (escala-con-nexus-server.ts › `REGLAS_DE_PEDIRLE`). */
export const NOMBRES_DE_LO_INTERNO = TEMAS_INTERNOS.map((t) => t.nombre).join("; ");

/** Las palabras de un tema en un texto, sin tildes ni mayúsculas (`matchAll` no arrastra el `lastIndex` del patrón global). */
const terminos = (t: { patron: RegExp }, texto: string) => [...texto.matchAll(t.patron)].map((m) => sinTildes(m[0]));

/**
 * El pedido pide quitar o no mencionar algo, en la voz de quien pide (las formas del pedido, nunca las de lo que se cuenta):
 * «no lo menciones», «nunca la pongas», «que no se mencione», «sin decir…», «evita lo del…», «quítale…», «hay que quitar…»,
 * «deja … fuera», «…, sin el presupuesto». Con eso no nombra nada interno, aunque diga el tema: saber de qué habla el «no»
 * es adivinar, y adivinar mal lleva lo interno al cliente; lo interno se pide aparte. «Nunca ponen presupuesto», «no lo
 * incluye todo», «ni metas claras» o «para eliminar las hojas» son lo que se cuenta, y no cuentan.
 */
const DECIR = "(?:incluyas|incluya|pongas|ponga|digas|diga|menciones|mencione|hables|hable|agregues|agregue|escribas|escriba|nombres|nombre|aparezca|salga|quede)";
const PIDE_QUE_NO = new RegExp(
  [
    `\\b(?:no|nunca|jamas|ni) (?:(?:lo|la|los|las|le|les|se) )?${DECIR}\\b`,
    "\\bsin (?:mencionar|nombrar|hablar de|incluir|poner|decir|meter|agregar|escribir)\\b",
    "\\bno (?:quiero|queremos) que\\b",
    "\\bno hace falta\\b",
    "\\bdej(?:a|alo|ala|en) (?:[a-z]+ ){0,4}(?:afuera|fuera)\\b",
    "\\b(?:quit|sac)(?:a|ale|ales|alo|ala|alos|alas|en)\\b",
    "\\b(?:omit|borr)(?:e|a|elo|ela|alo|ala|en|an)\\b",
    "\\b(?:hay que|quiero|queremos) (?:quitar|sacar|omitir|eliminar|borrar)\\b",
    `\\bevit(?:a|alo|en) (?:mencionar|nombrar|poner|decir|hablar|incluir|el|la|los|las|lo del|lo de)\\b`,
    "\\bexcepto\\b",
    "\\bnada (?:de|del|sobre)\\b",
  ].join("|"),
);
/**
 * «…, sin el presupuesto» o «… . Sin el presupuesto»: un «sin» que abre un pedido aparte (después de una coma, un punto o
 * un salto de línea) y va con un tema interno. «Sin el IVA», «trabajan sin el presupuesto aprobado», «y sin presupuesto»
 * o «(sin presupuesto aprobado)» son lo que se cuenta: si así se pedía que no estuviera, el cambio igual llega marcado.
 */
const sinElTema = (pedido: string) =>
  TEMAS_INTERNOS.some((t) => new RegExp(`(?:^|[,;:.\\n]\\s*)sin (?:(?:el|la|los|las|lo|nada de) )?(?:${t.patron.source})`, "i").test(pedido));

/** El texto en fichas: sin tildes ni signos, y cada número entero («20.000» es «20000»). */
function fichas(texto: string): string[] {
  return sinTildes(texto)
    // El número como lo lee `cifrasDe` («1,5» → «1d5»: el punto se iría con los signos y volvería a ser 15).
    .replace(/\d[\d.,]*/g, (n) => ` ${(cifrasDe(n)[0] ?? "").replace(".", "d")} `)
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
const VACIAS = new Set("que los las les nos del con por para una uno unos unas sus muy ese esa eso este esta esto estos estas como pero sobre entre desde cuando donde ellos ellas nuestro nuestra".split(" "));
/** Las cortas que dan vuelta lo que se dice («sí tiene», «ya está», «más de», «hasta 20 mil»): cuentan como palabras. */
const DAN_VUELTA = new Set(["no", "ni", "si", "ya", "mas", "menos", "hasta", "sin", "nunca", "casi", "solo"]);
/** Las palabras que dicen algo: de tres letras o más y las que dan vuelta lo dicho; sin los números. */
const palabras = (texto: string) => fichas(texto).filter((p) => (p.length >= 3 || DAN_VUELTA.has(p)) && !/^\d+(?:d\d+)?$/.test(p) && !VACIAS.has(p));

/** Las oraciones de un texto (un punto entre dígitos, «20.000», no corta). */
const oracionesDe = (texto: string) => texto.split(/(?<=[.;!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
const igualQue = (a: string) => fichas(a).join(" ");
/** Cuántas oraciones de respaldo trae un cambio (de a cuántas por tema), y hasta qué largo cada una. */
const MAX_RESPALDO = 4;
const POR_TEMA = 2;
const LARGO_DEL_RESPALDO = 240;
/** Una oración larga se recorta alrededor del primer tema que nombra, no desde el principio. */
function recortar(oracion: string, temas: readonly { patron: RegExp }[]): string {
  if (oracion.length <= LARGO_DEL_RESPALDO) return oracion;
  const en = Math.min(...temas.map((t) => [...oracion.matchAll(t.patron)][0]?.index ?? Infinity), Infinity);
  const desde = Number.isFinite(en) ? Math.max(0, Math.min(en - 80, oracion.length - LARGO_DEL_RESPALDO)) : 0;
  return `${desde > 0 ? "…" : ""}${oracion.slice(desde, desde + LARGO_DEL_RESPALDO)}${desde + LARGO_DEL_RESPALDO < oracion.length ? "…" : ""}`;
}

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
  const loQueSePuede = frases([pagina, ...o.delCliente].join("\n"));
  const deLoInterno = new Set([...frases(deLaCuenta)].filter((f) => !loQueSePuede.has(f)));
  const delPedido = frases(o.pedido);
  const palabrasDelPedido = new Set(palabras(o.pedido));
  const numerosDelPedido = new Set(cifrasDe(o.pedido));
  const pideQueNo = PIDE_QUE_NO.test(sinTildes(o.pedido)) || sinElTema(o.pedido);
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
    let respaldo: string[] = [];
    let respaldoDeMas = 0;
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
      // Una frase de una nota cuenta como pedida si el pedido la trae y no pide quitar ni dejar de mencionar algo.
      const laPide = (c: { copiadas: string[] }) => !pideQueNo && c.copiadas.some((f) => delPedido.has(f));
      if (internas.some((c) => c.copiadas.length && !c.temas.some(loPide) && !laPide(c))) {
        descartar("Copia algo de lo interno (una nota del equipo que el cliente no ve) que tu pedido no nombra.");
        continue;
      }
      interno = internas.length > 0;
      // 3. Lo interno que se pidió: con las palabras del pedido, si Nexus lo tiene, y con lo que lo respalda a la vista.
      const pedidos = [...new Set(internas.flatMap((c) => c.temas.filter(loPide)))];
      const pidioUnaNota = internas.some(laPide);
      if (pedidos.length || pidioUnaNota) {
        // Lo que Nexus tiene: las notas y su memoria, y el resto de la página (la pieza que cambia no se respalda a sí misma).
        const deOtraParte = (o.pagina ?? o.piezas).filter((p) => p.clave !== x.clave && !p.noLaVeElCliente).map((p) => p.valor ?? "").join("\n");
        const sinTenerlo = pedidos.find((t) => terminos(t, `${deLaCuenta}\n${deOtraParte}`).length === 0);
        if (sinTenerlo) {
          descartar(`Habla de algo interno («${sinTenerlo.nombre}») que Nexus no tiene en lo que sabe de la cuenta: si es cierto, cuéntaselo primero.`);
          continue;
        }
        /* Todo lo nuevo del cambio sale del pedido: cada oración nueva o cambiada, con sus palabras y sus números, se compara
           con lo pedido y con SU versión de antes (la oración de la pieza que más se le parece, si comparte al menos la mitad).
           Lo que dice otra oración de la pieza no vale: «20 mil contactos» no respalda «presupuesto de 20 mil», ni «no usa el
           CRM» un «no hay presupuesto». */
        const oracionesDeAntes = oracionesDe(antes ?? "");
        let deMas: string | undefined;
        for (const oracion of oracionesDe(despues).filter((x) => !deAntes.has(igualQue(x)))) {
          const suyas = new Set(palabras(oracion));
          const previa = oracionesDeAntes
            .map((a) => ({ a, ps: palabras(a), comun: palabras(a).filter((p) => suyas.has(p)).length }))
            .filter((x) => x.ps.length && x.comun / x.ps.length >= 0.5)
            .sort((a, b) => b.comun - a.comun)[0]?.a;
          const valen = new Set([...palabrasDelPedido, ...(previa ? palabras(previa) : [])]);
          const numerosQueValen = new Set([...numerosDelPedido, ...(previa ? cifrasDe(previa) : [])]);
          deMas = [...suyas].find((p) => !valen.has(p)) ?? cifrasDe(oracion).find((n) => !numerosQueValen.has(n));
          if (deMas) break;
        }
        if (deMas) {
          descartar(`Dice de algo interno más de lo que pediste («${deMas}»): escríbelo en tu pedido tal como es.`);
          continue;
        }
        /* Lo que lo respalda, para que quien aplica lo compare: primero lo que más se parece al cambio, de a dos por tema
           pedido (y lo que comparte frase con el pedido, si se pidió una nota), recortado alrededor del tema. Lo que no entra
           se cuenta (`respaldoDeMas`). */
        const delCambio = new Set(palabras(despues));
        const candidatas = [...oracionesDe(deLaCuenta), ...oracionesDe(deOtraParte)]
          .filter((oracion, i, xs) => xs.findIndex((y) => igualQue(y) === igualQue(oracion)) === i)
          .map((oracion) => ({
            oracion,
            temas: pedidos.filter((t) => terminos(t, oracion).length > 0),
            deLaNota: pidioUnaNota && [...frases(oracion)].some((f) => delPedido.has(f)),
            parecido: palabras(oracion).filter((p) => delCambio.has(p)).length,
          }))
          .filter((c) => c.temas.length || c.deLaNota)
          .sort((a, b) => b.parecido - a.parecido);
        const elegidas = new Set<string>();
        for (const grupo of [...pedidos.map((t) => candidatas.filter((c) => c.temas.includes(t))), candidatas.filter((c) => c.deLaNota)])
          for (const c of grupo.slice(0, POR_TEMA)) if (elegidas.size < MAX_RESPALDO) elegidas.add(c.oracion);
        respaldo = candidatas.filter((c) => elegidas.has(c.oracion)).map((c) => recortar(c.oracion, pedidos));
        respaldoDeMas = candidatas.length - respaldo.length;
      }
      const propias = new Set(cifrasDe(antes ?? ""));
      const inventadas = cifrasDe(despues).filter((c) => !permitidas.has(c) && !propias.has(c));
      if (inventadas.length) {
        descartar(`Trae ${inventadas.length === 1 ? "una cifra" : "cifras"} que nadie dijo (${inventadas.join(", ")}). Si es cierta, escríbela en tu pedido.`);
        continue;
      }
    }
    cambios.push({
      clave: x.clave,
      nombre: pieza.nombre,
      seccion: pieza.seccion,
      antes,
      despues,
      aMano: pieza.aMano,
      agregar: pieza.agregar,
      ...(interno ? { interno: true as const } : {}),
      ...(respaldo.length ? { respaldo } : {}),
      ...(respaldoDeMas > 0 ? { respaldoDeMas } : {}),
    });
  }
  return { cambios, descartados };
}
