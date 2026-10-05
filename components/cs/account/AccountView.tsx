"use client";

/**
 * components/cs/account/AccountView.tsx — la FICHA de una cuenta en Éxito del cliente (rediseño
 * 2026-10-04, sistema «Nexus · interfaz interna»; en pestañas desde el 2026-10-05, pedido de Elías:
 * «que se pueda entender más y no sea solo hacer scroll»).
 *
 * Cabecera de ficha a todo el ancho y, debajo, dos columnas: el contenido sobre gris y el panel de
 * contexto a la derecha (igual en todas las pestañas). El contenido, en seis pestañas:
 *   · Estado de la cuenta: el resumen del agente, las cuatro lecturas (cada una abre su pestaña),
 *     lo que pide atención y lo que viene en 90 días.
 *   · Adopción · Renovación · Proyectos · Resultados · Conversaciones.
 *
 * Las seis quedan MONTADAS y se ocultan con `hidden`: cambiar de pestaña no pierde lo que se estaba
 * haciendo (el resumen generándose, la propuesta de salud abierta). La pestaña abierta viaja en la
 * dirección (`?pestana=`) con `history.replaceState`: compartible, y sin volver a pedir la página
 * al servidor (con `router.replace` se re-cargaría la cuenta entera en cada clic).
 *
 * Todo sale de la MISMA cuenta armada que el índice (`data.cuenta`, lib/cs/cartera.ts).
 */
import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui";
import { CabeceraDeFicha, AccionDeCabecera, ChipHubspot } from "@/components/layout/CabeceraDeFicha";
import { diasEntre } from "@/lib/cs/formato";
import { UMBRALES, usoCayendo } from "@/lib/cs/lectura-partner";
import { PARTNER_STATE_META } from "@/lib/cs/partner-state";
import { NOMBRE_DE_LA_PESTANA, PESTANAS_DE_LA_CUENTA, pestanaDeLaUrl, type PestanaDeCuenta } from "@/lib/cs/pestanas-de-la-cuenta";
import type { CsAccountData } from "@/lib/cs/load-account";
import { Chip, ChipDeCabecera, Punto } from "../piezas";
import PanelDeLaCuenta from "./PanelDeLaCuenta";
import PestanaEstado from "./pestanas/PestanaEstado";
import PestanaAdopcion from "./pestanas/PestanaAdopcion";
import PestanaRenovacion from "./pestanas/PestanaRenovacion";
import PestanaProyectos from "./pestanas/PestanaProyectos";
import PestanaResultados from "./pestanas/PestanaResultados";
import PestanaConversaciones from "./pestanas/PestanaConversaciones";

const MESES_LARGOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesYAnio = (ymd: string) => `${MESES_LARGOS[Number(ymd.slice(5, 7)) - 1]} ${ymd.slice(0, 4)}`;

export default function AccountView({
  data,
  puedeCurar,
}: {
  data: CsAccountData;
  /** ⚠ Resolver la propuesta de salud exige `clientes.viewAll`; abrir esta ficha, no. */
  puedeCurar: boolean;
}) {
  const { cuenta, hoy } = data;
  const p = cuenta.partner;
  const searchParams = useSearchParams();
  const [pestana, setPestana] = useState<PestanaDeCuenta>(() => pestanaDeLaUrl(searchParams.get("pestana")));

  const irA = useCallback((siguiente: PestanaDeCuenta) => {
    setPestana(siguiente);
    const url = new URL(window.location.href);
    if (siguiente === "estado") url.searchParams.delete("pestana");
    else url.searchParams.set("pestana", siguiente);
    window.history.replaceState(window.history.state, "", url);
    window.scrollTo({ top: 0 });
  }, []);

  // Lo que marca cada pestaña en su rótulo: dónde hay algo que mirar.
  const adopcionPideAtencion =
    !!p && ((p.uso !== null && p.uso < UMBRALES.usoBajo) || usoCayendo(p) || p.hubs.some((h) => h.activado === false));
  const proximaRenovacion = p
    ? (p.proximaRenovacion && p.proximaRenovacion >= hoy
        ? p.proximaRenovacion
        : (p.hubs.map((h) => h.renovacion).filter((f): f is string => !!f && f >= hoy).sort()[0] ?? null))
    : null;
  const diasARenovar = proximaRenovacion ? diasEntre(hoy, proximaRenovacion) : null;

  const rotulo = (k: PestanaDeCuenta) => {
    const nombre = NOMBRE_DE_LA_PESTANA[k];
    if (k === "adopcion") {
      return (
        <span className="inline-flex items-center gap-1.5" data-recorrido="cs.uso">
          {adopcionPideAtencion && <Punto color="ambar" className="h-[7px] w-[7px]" />}
          {nombre}
        </span>
      );
    }
    if (k === "renovacion" && diasARenovar !== null) {
      return (
        <span className="inline-flex items-center gap-1.5">
          {nombre}
          <span className="tabular-nums opacity-70">{diasARenovar === 0 ? "hoy" : `${diasARenovar} ${diasARenovar === 1 ? "día" : "días"}`}</span>
        </span>
      );
    }
    if (k === "proyectos") return <span data-recorrido="cs.proyectos">{nombre}</span>;
    return nombre;
  };
  const cuenta_ = (k: PestanaDeCuenta): number | undefined =>
    k === "proyectos" ? data.projects.length : k === "resultados" ? data.resultados.length : k === "conversaciones" ? (data.signals?.engagements90d ?? undefined) : undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <CabeceraDeFicha
        volver={{ href: "/customer-success", etiqueta: "Éxito del cliente" }}
        recorrido="exito-cuenta"
        titulo={cuenta.nombre}
        chips={
          <>
            <ChipHubspot conectado={!!p} title={p ? "Vinculada a HubSpot Partner" : PARTNER_STATE_META[data.partnerState === "ok" ? "no_match" : data.partnerState].message} />
            {p && <ChipDeCabecera>{!p.activa ? "Inactiva en HubSpot" : p.gestionada ? "Gestionado por Smarteam" : "Solo vendido"}</ChipDeCabecera>}
            {p?.pais && <ChipDeCabecera>{p.pais}</ChipDeCabecera>}
            {p?.clienteDesde && <ChipDeCabecera>Cliente desde {mesYAnio(p.clienteDesde)}</ChipDeCabecera>}
            {(p?.partnersQueGestionan ?? 1) >= 2 && <Chip tono="atencion">Otro partner la gestiona</Chip>}
          </>
        }
        acciones={
          <>
            {p?.enlacePortal && (
              <AccionDeCabecera href={p.enlacePortal} externa>
                Abrir en HubSpot ↗
              </AccionDeCabecera>
            )}
            <AccionDeCabecera href={`/clients/${cuenta.clientId}`}>Ficha del cliente →</AccionDeCabecera>
          </>
        }
      />

      <div className="flex flex-1 flex-col lg:flex-row">
        <main className="min-w-0 flex-1 bg-surface-muted px-6 pb-12 pt-4 xl:px-8">
          <div className="flex max-w-[1060px] flex-col gap-7">
            <div data-recorrido="cs.pestanas">
              <Tabs
                aria-label="Qué mirar de la cuenta"
                value={pestana}
                onChange={irA}
                items={PESTANAS_DE_LA_CUENTA.map((k) => ({ key: k, label: rotulo(k), count: cuenta_(k) }))}
              />
            </div>

            <div hidden={pestana !== "estado"}>
              <PestanaEstado data={data} irA={irA} />
            </div>
            <div hidden={pestana !== "adopcion"}>
              <PestanaAdopcion data={data} irA={irA} />
            </div>
            <div hidden={pestana !== "renovacion"}>
              <PestanaRenovacion data={data} irA={irA} />
            </div>
            <div hidden={pestana !== "proyectos"}>
              <PestanaProyectos data={data} puedeCurar={puedeCurar} />
            </div>
            <div hidden={pestana !== "resultados"}>
              <PestanaResultados data={data} />
            </div>
            <div hidden={pestana !== "conversaciones"}>
              <PestanaConversaciones data={data} />
            </div>
          </div>
        </main>
        <PanelDeLaCuenta data={data} />
      </div>
    </div>
  );
}
