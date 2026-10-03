/**
 * lib/kickoff/nombre-con-un-apellido.ts — cómo se nombra a una persona del equipo en el kickoff
 * (2026-10-02, pedido de Liliana Moreno con Cemaco).
 *
 * En el equipo del kickoff el nombre completo («Liliana Moreno Salgado») alarga la tarjeta y no le
 * dice nada más al cliente. Se muestra el nombre y el PRIMER apellido. Se guarda el nombre completo
 * y se acorta AL MOSTRAR: así también se arreglan los kickoffs ya publicados, sin re-subir nada.
 *
 * La regla, sobre «unidades» (una partícula como «de la» viaja con la palabra que sigue, porque es
 * parte del apellido: «de la Cruz»):
 *   · 1-2 unidades → tal cual.
 *   · 3 unidades   → las dos primeras, SALVO que las dos primeras sean un nombre compuesto conocido
 *                    («Juan Carlos Armijos» queda entero: quitarle la última palabra le borra el
 *                    único apellido — y está en 8 kickoffs).
 *   · 4+ unidades  → el nombre (una unidad, o dos si es compuesto conocido) + la PENÚLTIMA unidad,
 *                    que en «nombre(s) + dos apellidos» es el primer apellido.
 *
 * Es una heurística y puede errar con un nombre compuesto que no está en la lista: por eso cada
 * persona tiene un nombre visible editable a mano en el kickoff (`nombreVisible`), que manda. PURO.
 */

/** Partículas que van pegadas a la palabra siguiente (son parte de un apellido). */
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "da", "das", "do", "dos", "di", "van", "von", "le"]);

/** Nombres compuestos frecuentes, sin tildes y en minúscula. La lista solo puede crecer. */
const COMPUESTOS = new Set([
  "juan carlos",
  "juan pablo",
  "juan jose",
  "juan manuel",
  "juan david",
  "juan diego",
  "juan sebastian",
  "juan felipe",
  "juan antonio",
  "jose luis",
  "jose maria",
  "jose manuel",
  "jose pablo",
  "jose miguel",
  "jose antonio",
  "jose daniel",
  "luis fernando",
  "luis diego",
  "luis carlos",
  "carlos alberto",
  "carlos andres",
  "miguel angel",
  "maria jose",
  "maria fernanda",
  "maria paula",
  "maria alejandra",
  "maria elena",
  "maria isabel",
  "maria laura",
  "maria gabriela",
  "maria jesus",
  "maria teresa",
  "maria eugenia",
  "maria cristina",
  "ana maria",
  "ana lucia",
  "ana isabel",
  "ana laura",
  "ana cristina",
]);

const normal = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Parte el nombre en unidades: cada partícula se pega a la palabra que la sigue. */
export function unidadesDelNombre(nombre: string): string[] {
  const palabras = nombre.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const unidades: string[] = [];
  let pendiente: string[] = [];
  for (const p of palabras) {
    pendiente.push(p);
    if (!PARTICULAS.has(normal(p))) {
      unidades.push(pendiente.join(" "));
      pendiente = [];
    }
  }
  // Partículas sueltas al final (raro): se pegan a la última unidad para no perderlas.
  if (pendiente.length > 0) {
    if (unidades.length > 0) unidades[unidades.length - 1] += ` ${pendiente.join(" ")}`;
    else unidades.push(pendiente.join(" "));
  }
  return unidades;
}

export function esNombreCompuesto(primera: string, segunda: string): boolean {
  return COMPUESTOS.has(`${normal(primera)} ${normal(segunda)}`);
}

export function nombreConUnApellido(nombre: string): string {
  const u = unidadesDelNombre(nombre);
  if (u.length <= 2) return u.join(" ");
  const compuesto = esNombreCompuesto(u[0], u[1]);
  if (u.length === 3) return compuesto ? u.join(" ") : `${u[0]} ${u[1]}`;
  const dado = compuesto ? `${u[0]} ${u[1]}` : u[0];
  return `${dado} ${u[u.length - 2]}`;
}

/** Lo que se pinta: el nombre visible escrito a mano manda; si no hay, la regla. */
export function nombreParaElKickoff(m: { name: string; nombreVisible?: string | null }): string {
  const aMano = (m.nombreVisible ?? "").trim();
  return aMano || nombreConUnApellido(m.name);
}
