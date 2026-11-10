/**
 * components/external/test/ArribaDeLaEscala.tsx — lo de arriba de la escala que ve el cliente: el logo y las pestañas
 * «Resumen», Ventas, Servicio, Marketing (9 nov: el Resumen va primero y la página abre en él). Lo usan la página de cada
 * área (ResultadoDelTestVista) y la portada (ResumenDeLaEscalaVista): las mismas pestañas en las dos.
 * Afuera son enlaces (cada pestaña es una dirección, `?area=`); adentro (`alElegir`), botones que cambian de pestaña sin
 * salir de la pantalla. Un área que el cliente no ve va punteada y lo dice (solo adentro: `oculta`).
 */
const LOGO_DE_COLOR = "/logo-smarteam.png";

/** La pestaña del Resumen: no es un área (las áreas son números). */
export const PESTANA_DEL_RESUMEN = "resumen";

export interface PestanaDeLaEscala {
  id: string;
  nombre: string;
  href: string;
  /** Solo en la pantalla interna: el área que el cliente no ve. */
  oculta?: boolean;
}

export function ArribaDeLaEscala({ pestanas, actual, alElegir }: { pestanas: readonly PestanaDeLaEscala[]; actual: string; alElegir?: (id: string) => void }) {
  return (
    <header className="rd-arriba">
      <span className="rd-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_DE_COLOR} alt="Smarteam" height={34} />
      </span>
      {pestanas.length > 1 && (
        <nav className="rd-acciones" aria-label="Resumen y equipos">
          {pestanas.map((a) => {
            const clase = `rd-btn ${a.id === actual ? "rd-btn-primary" : "rd-btn-ghost"}${a.oculta ? " rd-btn-oculta" : ""}`;
            return alElegir ? (
              <button
                key={a.id}
                type="button"
                className={clase}
                aria-pressed={a.id === actual}
                title={a.oculta ? "El cliente no ve esta área: súmala en «Acceso» › «Qué equipos ve»." : undefined}
                onClick={() => alElegir(a.id)}
              >
                {a.nombre}
                {a.oculta && <span className="rd-btn-nota">no la ve el cliente</span>}
              </button>
            ) : (
              <a key={a.id} className={clase} href={a.href} aria-current={a.id === actual ? "page" : undefined}>
                {a.nombre}
              </a>
            );
          })}
        </nav>
      )}
    </header>
  );
}
