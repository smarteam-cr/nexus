/**
 * lib/documentacion/texto.ts — el TEXTO de una página. PURO (sin Prisma ni BlockNote).
 *
 * Tres usos, los tres del lado del servidor:
 *   · `textoDeBloques` → la columna `texto` (el contenido en plano, un renglón por bloque).
 *   · `textoDeBusqueda` + `fragmentoDe` → el buscador: dónde coincide y qué pedazo mostrar.
 *   · `sanearBloques` → que el editor no reviente con un bloque que no conoce.
 *
 * El texto se calcula SIEMPRE en el servidor a partir del contenido guardado: nunca se confía en
 * un texto que mande el navegador, que podría no corresponder a los bloques.
 */
import { normalizarTexto } from "@/lib/ui/text-search";
import { TIPOS_DE_BLOQUE, type BloqueGuardado } from "./tipos";

/** El texto de un contenido en línea: una cadena, o piezas de texto y enlaces. */
function textoEnLinea(contenido: unknown): string {
  if (typeof contenido === "string") return contenido;
  if (!Array.isArray(contenido)) return "";
  return contenido
    .map((pieza) => {
      if (typeof pieza === "string") return pieza;
      if (!pieza || typeof pieza !== "object") return "";
      const p = pieza as { text?: unknown; content?: unknown; props?: { titulo?: unknown } };
      if (typeof p.text === "string") return p.text;
      /* Una mención a otra página no tiene texto propio: su título vive en las props. Sin esto,
         buscar el nombre de una página no encontraría a las que la nombran. */
      if (typeof p.props?.titulo === "string") return p.props.titulo;
      // Un enlace guarda su texto adentro, como piezas.
      return p.content !== undefined ? textoEnLinea(p.content) : "";
    })
    .join("");
}

/** Una tabla, un renglón por fila y las celdas separadas por «·». */
function renglonesDeTabla(contenido: unknown): string[] {
  if (!contenido || typeof contenido !== "object") return [];
  const filas = (contenido as { rows?: unknown }).rows;
  if (!Array.isArray(filas)) return [];
  return filas
    .map((fila) => {
      const celdas = (fila as { cells?: unknown } | null)?.cells;
      if (!Array.isArray(celdas)) return "";
      return celdas
        .map((celda) => {
          const esCelda =
            !!celda && typeof celda === "object" && !Array.isArray(celda) &&
            (celda as { type?: unknown }).type === "tableCell";
          return textoEnLinea(esCelda ? (celda as { content?: unknown }).content : celda).trim();
        })
        .filter(Boolean)
        .join(" · ");
    })
    .filter(Boolean);
}

/** El texto plano de los bloques: un renglón por bloque (las tablas, uno por fila). */
export function textoDeBloques(bloques: readonly BloqueGuardado[]): string {
  const renglones: string[] = [];
  const recorrer = (lista: readonly BloqueGuardado[]) => {
    for (const b of lista) {
      if (b.type === "table") {
        renglones.push(...renglonesDeTabla(b.content));
      } else {
        const t = textoEnLinea(b.content).trim();
        if (t) renglones.push(t);
      }
      if (Array.isArray(b.children) && b.children.length > 0) recorrer(b.children);
    }
  };
  recorrer(bloques);
  return renglones.join("\n");
}

/**
 * La columna `busqueda`: título + texto + lo que se deriva de los bloques vivos, normalizado
 * (sin tildes ni mayúsculas). Así «funcion» encuentra «Función», y «kickoff» encuentra la página
 * que lo lista en un bloque vivo aunque la palabra no esté escrita a mano.
 */
export function textoDeBusqueda(titulo: string, texto: string, derivado = ""): string {
  return normalizarTexto([titulo, texto, derivado].filter(Boolean).join("\n"));
}

/**
 * Normaliza carácter por carácter CONSERVANDO las posiciones: el índice i del resultado
 * corresponde al índice i del original. `normalizarTexto` no sirve para esto —recorta los bordes
 * y descompone los caracteres—, así que una coincidencia encontrada ahí no apunta al mismo lugar
 * del texto que se muestra.
 */
export function normalizarConPosiciones(s: string): string {
  let salida = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const n = c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    salida += n.length === 1 ? n : c;
  }
  return salida;
}

/** Un pedazo del texto alrededor de la primera coincidencia, con «…» donde se corta. */
export function fragmentoDe(texto: string, consulta: string, radio = 60): string | null {
  const q = normalizarTexto(consulta);
  if (!q) return null;
  const i = normalizarConPosiciones(texto).indexOf(q);
  if (i < 0) return null;
  const desde = Math.max(0, i - radio);
  const hasta = Math.min(texto.length, i + q.length + radio);
  const cuerpo = texto.slice(desde, hasta).replace(/\s+/g, " ").trim();
  return `${desde > 0 ? "…" : ""}${cuerpo}${hasta < texto.length ? "…" : ""}`;
}

/**
 * Deja el contenido listo para el editor. BlockNote falla al cargar un tipo de bloque que no
 * conoce (uno que se sacó del esquema, o un JSON escrito a mano), y el síntoma es una página que
 * no abre. El bloque desconocido NO se descarta: se convierte en un párrafo con su texto —o con
 * una nota de qué había— para que nada desaparezca en silencio.
 */
export function sanearBloques(
  valor: unknown,
  conocidos: ReadonlySet<string> = TIPOS_DE_BLOQUE,
): BloqueGuardado[] {
  return ordenarTarjetas(sanearLista(valor, conocidos), false);
}

/**
 * Las tarjetas solo tienen sentido adentro de una rejilla, y una rejilla solo con tarjetas.
 * Dos formas de romperlo con el editor en la mano, y las dos se vieron:
 *   · una REJILLA VACÍA — queda al borrar su última tarjeta, porque un bloque sin texto propio
 *     no se va solo. Se ve como un hueco, y en edición mostraba un rótulo suelto. Se quita.
 *   · una TARJETA SUELTA — agregada fuera de una rejilla. Se pinta como un recuadro a todo lo
 *     ancho. Las sueltas seguidas se juntan en una rejilla.
 * Adentro de una rejilla no se reagrupa nada: ahí las tarjetas ya están donde tienen que estar.
 */
function ordenarTarjetas(bloques: BloqueGuardado[], dentroDeRejilla: boolean): BloqueGuardado[] {
  const salida: BloqueGuardado[] = [];
  let sueltas: BloqueGuardado[] = [];
  const cerrarSueltas = () => {
    if (sueltas.length === 0) return;
    salida.push({
      type: "tarjetas",
      props: { columnas: sueltas.length > 1 ? "2" : "1" },
      children: sueltas,
    });
    sueltas = [];
  };

  for (const b of bloques) {
    const hijos = ordenarTarjetas(b.children ?? [], b.type === "tarjetas");
    const bloque = { ...b, children: hijos };

    if (bloque.type === "tarjetas" && hijos.length === 0) continue;
    if (bloque.type === "tarjeta" && !dentroDeRejilla) {
      sueltas.push(bloque);
      continue;
    }
    cerrarSueltas();
    salida.push(bloque);
  }
  cerrarSueltas();
  return salida;
}

function sanearLista(valor: unknown, conocidos: ReadonlySet<string>): BloqueGuardado[] {
  if (!Array.isArray(valor)) return [];
  const salida: BloqueGuardado[] = [];
  for (const crudo of valor) {
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) continue;
    const b = crudo as BloqueGuardado;
    if (typeof b.type !== "string" || !b.type) continue;
    const hijos = sanearLista(b.children, conocidos);
    if (conocidos.has(b.type)) {
      salida.push({ ...b, children: hijos });
      continue;
    }
    const texto =
      b.type === "table" ? renglonesDeTabla(b.content).join("\n") : textoEnLinea(b.content).trim();
    salida.push({
      ...(b.id ? { id: b.id } : {}),
      type: "paragraph",
      content: texto || `(Acá había un bloque «${b.type}» que el editor ya no muestra.)`,
      children: hijos,
    });
  }
  return salida;
}
