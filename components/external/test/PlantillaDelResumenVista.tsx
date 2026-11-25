/**
 * components/external/test/PlantillaDelResumenVista.tsx — LA FORMA del Resumen de La escala mientras no hay Resumen
 * (24 nov, Elías con TEC · AE: el artefacto mostraba solo «Así entendimos tu negocio.» y nada debajo).
 *
 * SOLO ADENTRO (la pantalla interna, PaginaDeLaEscala.tsx): el CSE ve las partes de la portada en su orden, con lo que va
 * en cada una y sin texto inventado. Lo único con datos es la lista de equipos que ve el cliente, con su nivel (ya está
 * en la escala). La página del cliente NUNCA la monta: sin Resumen, su enlace no tiene la pestaña «Resumen» y abre en la
 * página de un equipo (app/external/escala/[token]/page.tsx, con `tieneResumen` y `areaSinResumen` de
 * lib/external/escala-sin-resumen.ts).
 *
 * Tema de documento, como ResumenDeLaEscalaVista (hex de resumen-editorial.css, no flipea).
 */
import type { ReactNode } from "react";
import AnimacionesDelResultado from "./AnimacionesDelResultado";
import { ArribaDeLaEscala, PESTANA_DEL_RESUMEN, type PestanaDeLaEscala } from "./ArribaDeLaEscala";
import "./diagnostico.css";
import "./resultado.css";
import "./resumen-editorial.css";

const LOGO_DE_COLOR = "/logo-smarteam.png";

/** Un hueco de la plantilla: dónde irá algo y qué. */
function Hueco({ children, grande = false }: { children: ReactNode; grande?: boolean }) {
  return <div className={`re-hueco${grande ? " re-hueco-grande" : ""}`}>{children}</div>;
}

/** Una parte numerada de la portada, vacía: su ceja y lo que va. */
function Parte({ numero, nombre, children }: { numero: string; nombre: string; children: ReactNode }) {
  return (
    <section className="re-parte">
      <p className="re-ceja">
        {numero} <span>/ {nombre}</span>
      </p>
      {children}
    </section>
  );
}

export interface EquipoDeLaPlantilla {
  id: string;
  nombre: string;
  /** «Inicial», «Funcional»…; null: todavía sin nivel. */
  nivel: string | null;
}

export default function PlantillaDelResumenVista({
  empresa,
  pestanas,
  alElegir,
  equipos,
}: {
  empresa: string;
  /** Las pestañas de arriba, con la del Resumen primero: las de los equipos siguen andando. */
  pestanas: readonly PestanaDeLaEscala[];
  alElegir: (id: string) => void;
  /** Los equipos que ve el cliente, en su orden. */
  equipos: readonly EquipoDeLaPlantilla[];
}) {
  return (
    <div className="dr rd-v3 rd-s2 rd-ed re rd-editable re-plantilla">
      <AnimacionesDelResultado className="rd rs" quieta>
        <ArribaDeLaEscala pestanas={pestanas} actual={PESTANA_DEL_RESUMEN} alElegir={alElegir} editorial />
        <section className="re-hero">
          <div className="re-hero-texto">
            <p className="re-ceja">
              {empresa} <span>/ Diagnóstico</span>
            </p>
            <Hueco grande>El nombre del diagnóstico: «Diagnóstico de … en HubSpot».</Hueco>
            <Hueco>Uno o dos párrafos con lo que invierte la empresa, dónde se le rompe y sus cifras.</Hueco>
          </div>
          <div className="re-hicimos re-hicimos-vacio">
            {["Sesiones", "Tiempo de conversación", "Personas de su equipo", "Áreas"].map((r) => (
              <div key={r}>
                <b aria-hidden="true">—</b>
                <span>{r}</span>
              </div>
            ))}
          </div>
        </section>
        <Parte numero="01" nombre="El problema principal">
          <Hueco>La tesis en dos frases, el dolor de cada equipo en una línea y el tamaño del negocio, si la empresa lo dijo.</Hueco>
        </Parte>
        <Parte numero="02" nombre="Puntos clave">
          <Hueco>Los cinco puntos más críticos de la empresa, en orden de peso.</Hueco>
        </Parte>
        <Parte numero="03" nombre="Tu operación">
          <Hueco>Los pasos de un cliente por sus equipos, quién hace cada uno y dónde se traba.</Hueco>
        </Parte>
        <Parte numero="04" nombre="Equipos y hallazgos">
          <Hueco>Quién es quién y, por equipo: qué hacen, lo que ya funciona, dos retos y su cifra.</Hueco>
          {equipos.length > 0 && (
            <ul className="re-plantilla-equipos">
              {equipos.map((e) => (
                <li key={e.id}>
                  <b>{e.nombre}</b>
                  <span>{e.nivel ?? "Sin nivel todavía"}</span>
                </li>
              ))}
            </ul>
          )}
        </Parte>
        <Parte numero="05" nombre="Lo que falta validar">
          <Hueco>Lo que hay que confirmar con la empresa antes de avanzar.</Hueco>
        </Parte>
        <footer className="re-pie">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_DE_COLOR} alt="Smarteam" height={22} />
          <span>Medido con la Escala de Rendimiento de Smarteam.</span>
        </footer>
      </AnimacionesDelResultado>
    </div>
  );
}
