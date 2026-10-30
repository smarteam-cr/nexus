/**
 * lib/tests-diagnostico/iman-del-radar.ts — EL IMÁN del radar de la página del resultado (29 oct). PURO y CLIENT-SAFE.
 *
 * Copiado de la aplicación vieja (`anim.js › imanHacia`, Elías: «falta que se mueva un poquito cuando se acerca el
 * mouse»): cada punto se corre hacia el cursor, más cuanto más cerca, con un PISO de fuerza para que responda en toda la
 * página y no solo encima del radar. Lo mueve components/external/test/AnimacionesDelResultado.tsx. Las pruebas:
 * iman-del-radar.test.ts.
 */

/** Cuánto se corre como mucho (px de pantalla), a qué distancia deja de crecer, el piso y el suavizado por cuadro. */
export const IMAN = { amplitudPx: 7, radioPx: 480, piso: 0.45, suavizado: 0.12 } as const;

/** Lo que se corre un punto (px, py) hacia el cursor (mx, my), con la amplitud y el radio en las mismas unidades. */
export function imanHacia(px: number, py: number, mx: number, my: number, amplitud: number, radio: number): { x: number; y: number } {
  const dx = mx - px;
  const dy = my - py;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { x: 0, y: 0 };
  const cerca = Math.max(0, 1 - dist / radio);
  const fuerza = IMAN.piso + (1 - IMAN.piso) * cerca * cerca;
  return { x: (dx / dist) * amplitud * fuerza, y: (dy / dist) * amplitud * fuerza };
}
