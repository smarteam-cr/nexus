/**
 * lib/ui/borrador-sincronizado.ts — ⭐ UN BORRADOR LOCAL QUE SE ENTERA DE LO QUE PASA AFUERA.
 *
 * ── EL FALLO QUE LO TRAE ─────────────────────────────────────────────────────────────────────
 * Elías, sobre el kickoff (2026-08-23): «agregá a Elías y quitá a Lidia» → el chat dijo «Aplicado»,
 * Lidia siguió en pantalla y Elías quedó sin seleccionar. Lo mismo con las franjas horarias. Las
 * dos veces se corrigió al refrescar.
 *
 * El camino de escritura funcionaba ENTERO —optimista, PUT, `refetch`, `setSections`, el memo del
 * workspace, la prop nueva—. Se cortaba en el último metro: tres editores del kickoff siembran su
 * borrador con `useState(() => …)` y **no vuelven a mirar la prop nunca más**. Eran los únicos 3 del
 * motor así; los otros 49 componentes no tuvieron el problema.
 *
 * ⛔ Y LA MITAD INVISIBLE ERA PEOR QUE LA VISIBLE. Esos editores comitean el borrador ENTERO
 * (`onChange?.(draft)`), no un parche. O sea que después de «agregá a Elías», la próxima tecla del
 * CSE en esa sección persistía el borrador viejo —sin Elías— y **revertía en la base lo que había
 * escrito el chat**. No era «no se actualizó»: era pérdida de trabajo, en silencio.
 *
 * ── POR QUÉ NO SE ARREGLÓ ANTES, Y POR QUÉ EL MIEDO ERA LEGÍTIMO ─────────────────────────────
 * El motivo está escrito en `HorariosSection.tsx`: *«Re-sincronizarlo con `view` en cada render
 * mataría el foco mientras el CSE escribe»*. Era cierto para «en cada render» y es falso para «solo
 * cuando el contenido cambió»: cada tecla hace `setDraft` **sin** llamar `onChange` —el commit es en
 * el `blur`—, así que mientras alguien tipea la prop NO cambia y esto no dispara.
 *
 * ⛔ **LA CLAVE ES EL CONTENIDO, NO LA IDENTIDAD DEL OBJETO.** El memo del workspace se recalcula en
 * cada escritura optimista y en cada `refetch`, así que la referencia cambia también cuando el
 * contenido es idéntico. Comparar por `!==` re-sembraría a cada rato — que es exactamente el
 * escenario que el comentario de arriba temía. Los tres objetos son chicos (miembros, franjas,
 * canales): serializar sale más barato que una re-siembra espuria.
 *
 * ⚠ Y la re-siembra va DURANTE EL RENDER, nunca en un `useEffect`: un efecto dispara
 * `set-state-in-effect` y pinta un frame con el valor viejo. Es el idioma que el repo ya usa en
 * `components/landing/sections.tsx` (`PopInput`) y `components/landing/sections-roles.tsx`
 * (`MdTextarea`), los dos con el mismo comentario.
 */

/**
 * La clave de un valor para decidir si cambió DE VERDAD.
 *
 * ⚠ `JSON.stringify` y no una identidad: ver arriba. Y tolera lo que no se puede serializar
 * (un ciclo) devolviendo una clave imposible de igualar, que degrada a «cambió» — el lado seguro:
 * re-sembrar de más se ve, no re-sembrar se pierde.
 */
export function claveDeContenido(valor: unknown): string {
  try {
    return JSON.stringify(valor) ?? "undefined";
  } catch {
    return `__no-serializable__${Date.now()}`;
  }
}

/**
 * ¿Hay que volver a sembrar el borrador?
 *
 * Pura a propósito: es la única decisión de todo el mecanismo, y así se prueba de verdad en el
 * proyecto `unit` en vez de con un escaneo de texto.
 */
export function debeResembrar(claveSembrada: string, claveDeLaProp: string): boolean {
  return claveSembrada !== claveDeLaProp;
}
