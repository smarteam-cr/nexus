/**
 * components/external/test/ArribaDeLaEscala.tsx — lo de arriba de la escala que ve el cliente: el logo y las pestañas
 * «Resumen», Ventas, Servicio, Marketing (9 nov: el Resumen va primero y la página abre en él). Lo usan la página de cada
 * área (ResultadoDelTestVista) y la portada (ResumenDeLaEscalaVista): las mismas pestañas en las dos.
 * Desde el 15 nov son texto (la línea editorial): el logo a la izquierda y la activa en azul, subrayada. Afuera son
 * enlaces (cada pestaña es una dirección, `?area=`); adentro (`alElegir`), botones que cambian de pestaña sin salir de la
 * pantalla. Un área que el cliente no ve va punteada y lo dice (solo adentro: `oculta`). Un equipo sin sesiones se ve
 * apagado, sin texto, y afuera no se abre (`porExplorar`, 11 nov); va siempre al final, después de las que se abren (12
 * nov). Si no debe salir, se desmarca en «Acceso» › «Qué equipos ve». `siguienteArea`: la que abre el botón «Ver
 * diagnóstico de …» del final de la página de un área.
 *
 * `EmpresaDeLaEscala`: el nombre de la empresa con su logo (el de la ficha del cliente) o, sin logo, el círculo con la
 * inicial. Desde el 15 nov solo la usa el resultado del test público (sin logo): la escala lleva el nombre en la ceja.
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

/**
 * La siguiente área que se abre después de `actual`, en el orden de las pestañas, dando la vuelta: el botón «Ver
 * diagnóstico de …» del final de la página de un área (15 nov). Nunca el Resumen ni un equipo sin sesiones.
 */
export function siguienteArea<T extends PestanaDeLaEscala>(pestanas: readonly T[], actual: string): T | null {
  const areas = enSuOrden(pestanas).filter((p) => p.id !== PESTANA_DEL_RESUMEN);
  const i = areas.findIndex((p) => p.id === actual);
  const vuelta = [...areas.slice(i + 1), ...areas.slice(0, Math.max(0, i))];
  return vuelta.find((p) => p.id !== actual && !p.porExplorar) ?? null;
}

export function ArribaDeLaEscala({
  pestanas,
  actual,
  alElegir,
}: {
  pestanas: readonly PestanaDeLaEscala[];
  actual: string;
  alElegir?: (id: string) => void;
  /** Ya no cambia nada (desde el 15 nov las pestañas son siempre las editoriales): se acepta para no romper a quien lo pasa. */
  editorial?: boolean;
}) {
  const enOrden = enSuOrden(pestanas);
  return (
    <header className="ed-arriba ed-envoltura">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="ed-logo" src={LOGO_DE_COLOR} alt="Smarteam" width={118} height={26} />
      {enOrden.length > 1 && (
        <nav className="ed-pestanas" aria-label="Resumen y equipos">
          {enOrden.map((a) => {
            const activa = a.id === actual;
            const clase = `ed-pestana${activa ? " activa" : ""}${a.oculta ? " oculta" : ""}${a.porExplorar ? " apagada" : ""}`;
            if (alElegir)
              return (
                <button
                  key={a.id}
                  type="button"
                  className={clase}
                  aria-current={activa ? "page" : undefined}
                  title={a.oculta ? "El cliente no ve esta área: súmala en «Acceso» › «Qué equipos ve»." : undefined}
                  onClick={() => alElegir(a.id)}
                >
                  {a.nombre}
                  {a.oculta && <span className="ed-pestana-nota">no la ve el cliente</span>}
                </button>
              );
            // Afuera, un equipo sin sesiones no se abre: es texto, no un enlace.
            if (a.porExplorar && !activa)
              return (
                <span key={a.id} className={clase} aria-disabled="true">
                  {a.nombre}
                </span>
              );
            return (
              <a key={a.id} className={clase} href={a.href} aria-current={activa ? "page" : undefined}>
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
