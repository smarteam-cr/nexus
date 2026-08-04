import { esDeNuestroEquipo } from "./dominio-propio";

/**
 * lib/sessions/participantes.ts — QUIÉN ESTUVO EN LA SALA, en una línea.
 *
 * ── LA DECISIÓN QUE TIENE QUE HABILITAR ─────────────────────────────────────
 * El buscador de sesiones pide elegir qué reuniones alimentan un proyecto, y hasta ahora mostraba
 * solo el título. «SPRINT PLANNING · DEPT. SOFTWARE» o «Feedback sitio web» no alcanzan: el dato
 * que resuelve la duda es **de qué lado era la gente**. Una reunión con alguien de `lacav.cl`
 * adentro es del proyecto de CAV aunque el título no lo diga; una donde estuvimos solos nosotros
 * es del equipo, por más que el título nombre un cliente.
 *
 * Por eso el resumen NO es "5 participantes": es cuántos éramos nosotros y **qué empresas de
 * afuera** había. La lista de dominios externos es la señal; el conteo es contexto.
 *
 * ⚠ Los emails NO se muestran enteros. En una lista de veinte filas son ruido, y además son datos
 * de contacto de gente real puestos en una pantalla que se comparte en reuniones. Se muestran los
 * dominios (la empresa) y el conteo.
 */

export interface ResumenDeSala {
  /** Cuántos de `@smarteamcr.com` (incluye al organizador si vino). */
  nuestros: number;
  /** Cuántos de afuera. */
  externos: number;
  /** Los dominios de afuera, sin repetir y en orden alfabético — la señal de a quién pertenece. */
  dominiosExternos: string[];
}

/** Dominio de un email, en minúsculas. `null` si no parece un email. */
function dominioDe(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

/**
 * Reparte a los de la sala entre nosotros y los de afuera.
 *
 * El organizador se pliega con los participantes porque en muchas reuniones no aparece en la
 * lista —lo mismo que hace el criterio de "puertas adentro"—; si se contara aparte, una reunión
 * organizada por alguien de afuera se vería como si hubiéramos estado solos.
 */
export function resumirSala(
  participants: readonly string[] | null | undefined,
  organizerEmail?: string | null,
): ResumenDeSala {
  const vistos = new Set<string>();
  for (const p of participants ?? []) {
    const e = p?.trim().toLowerCase();
    if (e) vistos.add(e);
  }
  const org = organizerEmail?.trim().toLowerCase();
  if (org) vistos.add(org);

  let nuestros = 0;
  const dominios = new Set<string>();
  for (const email of vistos) {
    if (esDeNuestroEquipo(email)) {
      nuestros++;
      continue;
    }
    const d = dominioDe(email);
    /* Un email sin dominio legible igual CUENTA como externo: es alguien que no es del equipo, y
       redondearlo a cero haría que una reunión con un invitado raro se lea como interna. */
    if (d) dominios.add(d);
  }
  return {
    nuestros,
    externos: vistos.size - nuestros,
    dominiosExternos: [...dominios].sort(),
  };
}

/**
 * El resumen en texto, listo para pintar. Devuelve `null` cuando no hay nadie: una fila vacía
 * dice menos que ninguna fila.
 *
 * Ejemplos: «3 de Smarteam» · «2 de Smarteam · 1 de lacav.cl» ·
 *           «2 de Smarteam · 3 de lacav.cl, agrosmartcr.com».
 */
export function textoDeSala(r: ResumenDeSala): string | null {
  const partes: string[] = [];
  if (r.nuestros > 0) partes.push(`${r.nuestros} de Smarteam`);
  if (r.externos > 0) {
    /* Los dominios primero y el conteo pegado: "3 de lacav.cl" se lee de un saque. Con más de dos
       empresas se corta, porque el objetivo es reconocer al cliente, no auditar la lista. */
    const muestra = r.dominiosExternos.slice(0, 2).join(", ");
    const resto = r.dominiosExternos.length - 2;
    partes.push(
      muestra
        ? `${r.externos} de ${muestra}${resto > 0 ? ` +${resto}` : ""}`
        : `${r.externos} de afuera`,
    );
  }
  return partes.length ? partes.join(" · ") : null;
}
