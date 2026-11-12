/**
 * components/external/test/ArribaDeLaEscala.tsx — lo de arriba de la escala que ve el cliente: el logo y las pestañas
 * «Resumen», Ventas, Servicio, Marketing (9 nov: el Resumen va primero y la página abre en él). Lo usan la página de cada
 * área (ResultadoDelTestVista) y la portada (ResumenDeLaEscalaVista): las mismas pestañas en las dos.
 * Afuera son enlaces (cada pestaña es una dirección, `?area=`); adentro (`alElegir`), botones que cambian de pestaña sin
 * salir de la pantalla. Un área que el cliente no ve va punteada y lo dice (solo adentro: `oculta`). Un equipo sin sesiones
 * se ve deshabilitado, sin texto, y afuera no se abre (`porExplorar`, 11 nov). Desde el 12 nov se ve más apagado y va
 * siempre al final, después de las que se abren; si no debe salir, se desmarca en «Acceso» › «Qué equipos ve».
 *
 * `EmpresaDeLaEscala`: el nombre de la empresa con su logo (el de la ficha del cliente) o, sin logo, el círculo con la
 * inicial. La usan la página de cada área y el Resumen.
 */
import type { ReactNode } from "react";

const LOGO_DE_COLOR = "/logo-smarteam.png";

/** La pestaña del Resumen: no es un área (las áreas son números). */
export const PESTANA_DEL_RESUMEN = "resumen";

export interface PestanaDeLaEscala {
  id: string;
  nombre: string;
  href: string;
  /** Solo en la pantalla interna: el área que el cliente no ve. */
  oculta?: boolean;
  /**
   * Un equipo sin sesiones (Elías, 11 nov): la pestaña está y afuera no se abre. Solo se ve deshabilitada, sin texto
   * (Elías, 11 nov: sin «Por explorar» en la pestaña). Adentro se abre igual (el equipo trabaja su escala).
   */
  porExplorar?: boolean;
}

/** Las que se abren primero, en su orden; las de un equipo sin sesiones, al final (Elías, 12 nov). */
export function enSuOrden<T extends { porExplorar?: boolean }>(pestanas: readonly T[]): T[] {
  return [...pestanas.filter((p) => !p.porExplorar), ...pestanas.filter((p) => p.porExplorar)];
}

export function ArribaDeLaEscala({ pestanas, actual, alElegir }: { pestanas: readonly PestanaDeLaEscala[]; actual: string; alElegir?: (id: string) => void }) {
  pestanas = enSuOrden(pestanas);
  return (
    <header className="rd-arriba">
      <span className="rd-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_DE_COLOR} alt="Smarteam" height={34} />
      </span>
      {pestanas.length > 1 && (
        <nav className="rd-acciones" aria-label="Resumen y equipos">
          {pestanas.map((a) => {
            const clase = `rd-btn ${a.id === actual ? "rd-btn-primary" : "rd-btn-ghost"}${a.oculta ? " rd-btn-oculta" : ""}${a.porExplorar ? " rd-btn-por-explorar" : ""}`;
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
            ) : a.porExplorar && a.id !== actual ? (
              <span key={a.id} className={clase} aria-disabled="true">
                {a.nombre}
              </span>
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

/**
 * La empresa arriba de la página: su logo (sin deformarlo: entra entero en el alto del chip) o el círculo con la inicial.
 * `logo` es la dirección que ya sirve la ficha del cliente (`logoQueSeSirve`); un logo que no carga deja el nombre igual.
 */
export function EmpresaDeLaEscala({ nombre, dominio, logo = null, className = "rd-empresa rd-entra" }: { nombre: string; dominio?: string | null; logo?: string | null; className?: string }): ReactNode {
  if (!nombre) return null;
  return (
    <span className={`${className}${logo ? " rd-empresa-con-logo" : ""}`}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="rd-empresa-img" src={logo} alt="" />
      ) : (
        <span className="rd-empresa-logo" aria-hidden="true">
          {nombre.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span className="rd-empresa-txt">
        <b>{nombre}</b>
        {dominio && dominio !== nombre && <small>{dominio}</small>}
      </span>
    </span>
  );
}
