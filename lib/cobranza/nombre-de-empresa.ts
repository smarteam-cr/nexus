/**
 * lib/cobranza/nombre-de-empresa.ts
 *
 * Qué pasa cuando alguien corrige el nombre de una empresa desde la ficha de su cuenta. PURO.
 *
 * ── POR QUÉ EXISTE (revisión con Alex, 2026-09-29) ──────────────────────────────
 * El nombre de una empresa solo se podía cambiar desde su ficha de cliente, que Finanzas no abre: quien lleva la
 * cobranza veía «Librería Internacional (Desarrollos Culturales Costa Rica)» o un nombre mal escrito y no tenía
 * dónde corregirlo. Ahora se corrige en «Datos de la cuenta».
 *
 * ⚠ Es el nombre de la EMPRESA en todo Nexus —cartera, proyectos, reuniones, propuestas—, no una etiqueta de
 * Cobranza: hay un solo nombre. La razón social y la cédula (las de la factura) son otros dos campos, y no cambian.
 *
 * ⛔ No deja dos empresas con el mismo nombre: en la cartera y en el buscador no se podrían distinguir. Si el nombre
 * que se quiere ya es de otra empresa, casi siempre son la misma cargada dos veces, y eso se arregla fusionándolas,
 * no llamándolas igual.
 */

/** Un nombre, comparable: sin tildes, sin mayúsculas y con los espacios de más quitados. */
export function nombreComparable(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type DecisionDeNombre =
  /** Es el que ya tiene: no se escribe nada ni se anota nada. */
  | { tipo: "IGUAL" }
  | { tipo: "CAMBIA"; anterior: string; nombre: string }
  | { tipo: "RECHAZO"; motivo: string };

/**
 * Qué hacer con el nombre que pidió la persona. `otras` = los nombres de todas las demás empresas de Nexus.
 *
 * Cambiar solo mayúsculas, tildes o espacios («publimark» → «Publimark») es un cambio: se escribe y se anota. Lo que
 * no se deja es quedar igual que OTRA empresa.
 */
export function decidirCambioDeNombre(actual: string, pedido: string, otras: readonly string[]): DecisionDeNombre {
  const nombre = pedido.replace(/\s+/g, " ").trim();
  if (nombre.length < 2) return { tipo: "RECHAZO", motivo: "Escribe el nombre de la empresa (al menos dos letras)." };
  if (nombre.length > 200) return { tipo: "RECHAZO", motivo: "El nombre es demasiado largo (máximo 200 letras)." };
  if (nombre === actual) return { tipo: "IGUAL" };
  const clave = nombreComparable(nombre);
  const repetida = otras.find((o) => nombreComparable(o) === clave);
  if (repetida) {
    return {
      tipo: "RECHAZO",
      motivo: `Ya hay otra empresa que se llama «${repetida}». Dos empresas con el mismo nombre no se distinguen en la cartera: si son la misma, hay que fusionarlas en vez de llamarlas igual.`,
    };
  }
  return { tipo: "CAMBIA", anterior: actual, nombre };
}
