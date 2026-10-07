"use client";

/**
 * components/no-encontrada/PaginaNoEncontrada.tsx — la página 404 de las pantallas internas (2026-10-06).
 *
 * Diseño aprobado en Claude Design («Nexus · página 404», opción C: la señal que se corta). Se pinta
 * dentro del shell, con el menú: la monta app/(shell)/not-found.tsx, tanto para una ficha que llamó a
 * `notFound()` como para una dirección que no existe (app/(shell)/[...ruta]/page.tsx).
 *
 * Es de cliente por una sola razón: la dirección. El not-found del server no la recibe, y es lo que
 * decide qué decir (lib/no-encontrada/sugerencias.ts). El menú que puede abrir la persona sí llega del
 * server, ya filtrado: lo que se sugiere nunca es algo que no puede abrir.
 *
 * La animación es CSS puro (`.nx-404` en app/globals.css): se apaga sola si la computadora pide
 * reducir el movimiento.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { BotonBlanco, BotonEnlace, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import {
  direccionLegible,
  fichaDeLaDireccion,
  sugerenciasParaLaDireccion,
  type DestinoDelMenu,
} from "@/lib/no-encontrada/sugerencias";

export interface DestinoConIcono extends DestinoDelMenu {
  icono: ReactNode;
}

const PARA_TI = { etiqueta: "Para ti", href: "/para-ti" };

/** El 404 grande. Las dos copias de encima solo se ven durante el corte: el resto del tiempo están recortadas a cero. */
function NumeroQueSeCorta() {
  return (
    <div aria-hidden="true" className="nx-404 flex justify-center">
      <span className="nx-404-enciende relative inline-block text-[112px] font-bold leading-none tracking-[-0.04em] text-fg tabular-nums md:text-[168px]">
        <span className="nx-404-base block">404</span>
        <span className="nx-404-corte-a absolute inset-0 bg-background text-fg">404</span>
        <span className="nx-404-corte-b absolute inset-0 bg-background text-fg-muted">404</span>
      </span>
    </div>
  );
}

const ICONO_FEEDBACK = "M4 5h16v11H10l-6 4z M8 9h8 M8 12h5";
const ICONO_COMPARTIR =
  "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z";

function Trazo({ d, className }: { d: string; className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export default function PaginaNoEncontrada({ destinos }: { destinos: DestinoConIcono[] }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const feedback = useFeedback();

  const direccion = direccionLegible(pathname);
  const ficha = fichaDeLaDireccion(pathname);
  const sugerencias = ficha ? [] : sugerenciasParaLaDireccion(pathname, destinos);
  // El botón azul lleva al listado de la ficha solo si la persona puede abrirlo; si no, a «Para ti».
  const destino = ficha && destinos.some((d) => d.href === ficha.listado.href) ? ficha.listado : PARA_TI;

  const volver = () => {
    if (window.history.length > 1) router.back();
    else router.push(PARA_TI.href);
  };

  return (
    <div className="px-5 pb-16 pt-10 md:px-8 md:pt-24">
      <div className="mx-auto flex max-w-[480px] flex-col text-center">
        <NumeroQueSeCorta />

        <h1 className="mt-4 text-xl font-semibold text-fg md:mt-5">
          <span className="sr-only">Error 404. </span>
          {ficha?.titulo ?? "No encontramos esta página"}
        </h1>
        <p className="mt-1.5 text-sm text-fg-secondary">
          {ficha?.detalle ?? "La dirección no lleva a ninguna página de Nexus. Puede estar mal escrita o venir de un enlace viejo."}
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-xs text-fg-muted">
          <span>Buscaste</span>
          <span className="rounded-md border border-line bg-surface-muted px-2 py-0.5 text-fg-secondary [overflow-wrap:anywhere]">
            {direccion}
          </span>
        </div>

        {ficha?.compartible && (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-line bg-surface-muted px-3.5 py-3 text-left">
            <Trazo d={ICONO_COMPARTIR} className="mt-0.5 h-4 w-4 flex-shrink-0 text-fg-muted" />
            <p className="text-[13px] leading-[19px] text-fg-secondary">
              Si alguien te mandó el enlace, pídele que te comparta el documento desde Roles.
            </p>
          </div>
        )}

        {sugerencias.length > 0 && (
          <section className="mt-6 space-y-2">
            <h2 className={ROTULO_DEL_SISTEMA}>Parecidas a lo que escribiste</h2>
            <div className="space-y-1.5">
              {sugerencias.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
                >
                  <span className="flex-shrink-0 text-fg-muted">{s.icono}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="text-[13px] font-medium leading-[19px] text-fg">{s.etiqueta}</span>
                    <span className="truncate text-xs text-fg-muted">{s.padre ? `${s.padre} · ${s.href}` : s.href}</span>
                  </span>
                  <Trazo d="M9 5l7 7-7 7" className="h-3.5 w-3.5 flex-shrink-0 text-fg-muted" />
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link
            href={destino.href}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Ir a «{destino.etiqueta}»
          </Link>
          <BotonBlanco onClick={volver}>Volver a la página anterior</BotonBlanco>
        </div>

        {/* El reporte de Feedback ya lleva la dirección: no hace falta escribirla. */}
        {feedback && (
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-line pt-4 text-xs text-fg-muted">
            <span>¿Llegaste desde un enlace de Nexus?</span>
            <BotonEnlace onClick={() => feedback.abrir()} className="inline-flex items-center gap-1.5 py-0">
              <Trazo d={ICONO_FEEDBACK} className="h-3.5 w-3.5" />
              Avisar del enlace roto
            </BotonEnlace>
          </div>
        )}
      </div>
    </div>
  );
}
