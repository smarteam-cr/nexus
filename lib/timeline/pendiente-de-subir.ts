import { esAbierta } from "./particularidad-state";

/**
 * lib/timeline/pendiente-de-subir.ts — ¿LO QUE EL CLIENTE LEE SIGUE SIENDO LO ÚLTIMO?
 *
 * ── EL DEFECTO QUE ARREGLA ───────────────────────────────────────────────────
 * Lo que el cliente abre NO es la base: es un SNAPSHOT congelado al «Subir al cliente». La
 * pantalla interna avisa «Listo para subir» comparando el corrimiento que se comunicaría contra
 * el que ya se comunicó — pero lo comparaba por SUMA DE SEMANAS.
 *
 * Esa suma es ciega a casi todo lo que le cambia la lectura al cliente:
 *  · dar por RESUELTA una desviación no mueve ni una semana (el plan ya se corrió, y por eso las
 *    semanas siguen contando) — o sea que el cambio más nuevo del sistema era justo invisible;
 *  · corregirle el título o la atribución a un hecho tampoco;
 *  · y dos cambios que se compensan (uno sube 2, otro baja 2) se anulaban entre sí.
 *
 * En los tres casos el CSE veía «todo comunicado» con el cliente leyendo otra cosa, sin error y
 * sin cartel: la falla más cara de esta pantalla, porque su único trabajo es avisar.
 *
 * ── LA HUELLA ────────────────────────────────────────────────────────────────
 * Se compara CONTENIDO, no un número: la lista de lo comunicable, ordenada, con los campos que el
 * cliente efectivamente lee. Cualquier diferencia enciende el aviso.
 *
 * ⚠ `estado` ausente cuenta como ABIERTA — igual que en todo el resto del sistema. Es lo que
 * evita el falso positivo del día del deploy: los snapshots congelados ANTES de que existiera el
 * estado no traen el campo, y sin esta normalización TODO proyecto publicado habría amanecido
 * diciendo «falta subir» sin que nadie hubiera tocado nada. Un aviso que grita siempre se ignora,
 * y ahí deja de proteger el caso que importa.
 */

/** Lo mínimo que el cliente lee de una desviación. */
export interface ComunicableLike {
  kind: string;
  title: string;
  weeksImpact?: number | null;
  party?: string | null;
  estado?: string | null;
}

/** Un renglón estable por fila: mismo contenido → misma huella, en cualquier orden. */
function renglon(p: ComunicableLike): string {
  return [
    p.kind,
    p.title.trim(),
    p.weeksImpact ?? 0,
    p.party ?? "",
    // Normalizado, no crudo: ver el ⚠ del docblock.
    esAbierta(p) ? "ABIERTA" : "CERRADA",
  ].join("|");
}

/**
 * Huella de lo que el cliente leería. Ordenada, para que reordenar la lista no cuente como cambio
 * (el cliente la ve ordenada por fecha del lado del render, no por el orden de esta lista).
 */
export function huellaDeLoComunicable(parts: readonly ComunicableLike[]): string {
  return parts.map(renglon).sort().join("\n");
}

/**
 * `true` si lo que se comunicaría hoy difiere de lo que el cliente tiene delante.
 *
 * @param visibles   las marcadas visibles al cliente, EN VIVO.
 * @param publicadas las del snapshot congelado — lo que el cliente lee ahora mismo.
 */
export function hayPendienteDeSubir(
  visibles: readonly ComunicableLike[],
  publicadas: readonly ComunicableLike[],
): boolean {
  return huellaDeLoComunicable(visibles) !== huellaDeLoComunicable(publicadas);
}
