"use client";

/**
 * ElegirEmpresa — de qué empresa es una reunión sin empresa (T3, 2026-10-25). Una celda editable (`CeldaSelect`) con
 * la propuesta de Nexus marcada «lo propone Nexus», y la lista de las empresas que quien decide puede abrir. Elegir la
 * propuesta la confirma (si es de HubSpot, la crea como prospecto); elegir otra la asigna. Escribe en
 * POST /api/sessions/[id]/empresa y refresca la página.
 *
 * La lista de empresas viaja UNA vez por página (`ProveedorDeEmpresas`): el tablero tiene decenas de filas.
 *
 * ⚠ Crear un prospecto pide confirmarlo aparte (2026-10-25): medido en producción, de las 53 propuestas de las 67
 * reuniones sin empresa, 18 eran «crear Faco» (FACO es de Honda Costa Rica) y 13 «crear HubSpot» (un aliado). La
 * propuesta sale del resolver y es honesta sobre el dominio, pero una ficha nueva no se deshace con un clic: el diálogo
 * dice qué se crea y recuerda elegir la empresa que ya está si la reunión es de ella.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CeldaSelect,
  ConfirmDialog,
  type OpcionDeCelda,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson } from "@/lib/api/fetch-json";
import {
  VALOR_DE_LA_PROPUESTA,
  opcionDeLaPropuesta,
} from "@/lib/sessions/propuesta-de-empresa";

export interface EmpresaParaElegir {
  id: string;
  nombre: string;
}

const EmpresasContext = createContext<readonly EmpresaParaElegir[]>([]);

export function ProveedorDeEmpresas({
  empresas,
  children,
}: {
  empresas: readonly EmpresaParaElegir[];
  children: ReactNode;
}) {
  return (
    <EmpresasContext.Provider value={empresas}>
      {children}
    </EmpresasContext.Provider>
  );
}

export interface PropuestaParaElegir {
  tipo: "CLIENTE" | "HUBSPOT";
  nombre: string;
  /** CLIENTE: la empresa propuesta (para marcarla en la lista). */
  clientId?: string | null;
  /** HUBSPOT: la empresa de HubSpot. Viaja al confirmar, para que el servidor no confirme otra que la que se vio. */
  hubspotCompanyId?: string | null;
}

export function ElegirEmpresa({
  sessionId,
  titulo,
  propuesta,
  puedeDecidir,
}: {
  sessionId: string;
  titulo: string;
  propuesta: PropuestaParaElegir | null;
  puedeDecidir: boolean;
}) {
  const empresas = useContext(EmpresasContext);
  const router = useRouter();
  const toast = useToast();
  // Crear un prospecto se confirma aparte: la celda espera a que la persona diga que sí (o que no).
  const [porCrear, setPorCrear] = useState<{
    seguir: () => Promise<void>;
    listo: () => void;
  } | null>(null);

  // La propuesta HUBSPOT no es una empresa de Nexus todavía: va arriba con su valor propio. La CLIENTE es una de la lista.
  const opciones: OpcionDeCelda[] = [
    ...(propuesta?.tipo === "HUBSPOT"
      ? [
          {
            value: VALOR_DE_LA_PROPUESTA,
            label: opcionDeLaPropuesta(propuesta),
          },
        ]
      : []),
    ...empresas.map((e) => ({ value: e.id, label: e.nombre })),
  ];
  const sugerencia =
    propuesta?.tipo === "HUBSPOT"
      ? VALOR_DE_LA_PROPUESTA
      : propuesta?.clientId && empresas.some((e) => e.id === propuesta.clientId)
        ? propuesta.clientId
        : undefined;

  async function escribir(value: string) {
    const confirma =
      value === VALOR_DE_LA_PROPUESTA ||
      (propuesta?.tipo === "CLIENTE" && value === propuesta.clientId);
    const r = await fetchJson<{ mensaje: string }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/empresa`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          confirma && propuesta
            ? {
                accion: "confirmar",
                esperada: {
                  tipo: propuesta.tipo,
                  clave:
                    propuesta.tipo === "CLIENTE"
                      ? propuesta.clientId
                      : propuesta.hubspotCompanyId,
                },
              }
            : { accion: "elegir", clientId: value },
        ),
      },
    );
    toast.success(r.mensaje);
    router.refresh();
  }

  function elegir(value: string): Promise<void> {
    if (value !== VALOR_DE_LA_PROPUESTA) return escribir(value);
    return new Promise<void>((listo, fallo) => {
      setPorCrear({
        seguir: () => escribir(value).then(listo, (e) => fallo(e)),
        listo,
      });
    });
  }

  return (
    <>
      <CeldaSelect
        opciones={opciones}
        seleccion={[]}
        vacio={
          puedeDecidir ? "Elegir la empresa" : "La decide quien la organizó"
        }
        puedeEditar={puedeDecidir}
        onElegir={elegir}
        etiqueta={`Empresa de «${titulo}»`}
        placeholderBusqueda="Buscar la empresa…"
        sugerencia={sugerencia}
      />
      <ConfirmDialog
        open={!!porCrear}
        title={`¿Crear «${propuesta?.nombre ?? ""}» como prospecto?`}
        description={
          <>
            Nexus va a crear una empresa nueva, «{propuesta?.nombre}», desde su
            ficha de HubSpot, y la reunión quedará en ella. Si la reunión es de
            una empresa que ya está en Nexus (la casa matriz, el cliente al que
            acompaña un aliado), elígela de la lista en vez de crear otra.
          </>
        }
        confirmLabel="Crear el prospecto"
        cancelLabel="Elegir otra"
        onCancel={() => {
          porCrear?.listo();
          setPorCrear(null);
        }}
        onConfirm={async () => {
          const p = porCrear;
          setPorCrear(null);
          await p?.seguir();
        }}
      />
    </>
  );
}
