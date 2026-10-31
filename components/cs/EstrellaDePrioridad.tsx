"use client";

/**
 * components/cs/EstrellaDePrioridad.tsx — la columna «Prioritaria» de los listados de Éxito del cliente (2026-10-30,
 * pedido de Elías: «debería ser muy sencillo de marcar»). Regla en lib/cs/prioridad-de-cuenta.ts.
 *
 * Una estrella por cuenta: un clic abre los motivos y elegir uno guarda, sin salir de la lista. «Otro motivo» y
 * «Agregar una línea» abren la ventana de siempre (`VentanaDePrioridad`). Las marcas y el permiso vienen de
 * `PrioridadesDeLaCartera`, que la página pone una sola vez alrededor de todos los listados: una fila solo necesita el id
 * y el nombre de su cuenta.
 *
 * ⚠ La estrella siempre pinta algo, aunque esté vacía y quien mira no pueda marcar: en una fila de grilla, una celda que
 * no renderiza corre todas las columnas siguientes.
 * ⚠ Va por encima del enlace de la fila (`relative z-[1]`): una fila con la estrella no puede ser un <a> entero, porque un
 * botón dentro de un enlace también lo abriría.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Menu, type MenuItemDef } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
import { MOTIVOS_DE_PRIORIDAD, NOMBRE_DEL_MOTIVO, marcasConLoGuardado, type MotivoDePrioridad, type PrioridadVisible } from "@/lib/cs/prioridad-de-cuenta";
import { Estrella, VentanaDePrioridad, guardarPrioridad } from "./MarcaDePrioridad";

type Marcas = Readonly<Record<string, PrioridadVisible>>;

const Prioridades = createContext<{
  marcas: Marcas;
  puedeMarcar: boolean;
  onCambio: (clientId: string, prioritaria: PrioridadVisible | null) => void;
} | null>(null);

export function PrioridadesDeLaCartera({
  iniciales,
  puedeMarcar,
  ordenaLaLista,
  children,
}: {
  iniciales: Marcas;
  puedeMarcar: boolean;
  /** La marca ordena esta lista: al guardar se pide de nuevo. Seguimiento no ordena por ella y recargar lee calendarios. */
  ordenaLaLista: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  // Lo guardado acá manda sobre lo que traiga el servidor: al marcar dos seguidas, la primera recarga llega con una foto
  // anterior a la segunda y haría parpadear la estrella.
  const [guardadas, setGuardadas] = useState<Readonly<Record<string, PrioridadVisible | null>>>({});

  const valor = useMemo(
    () => ({
      marcas: marcasConLoGuardado(iniciales, guardadas),
      puedeMarcar,
      onCambio: (clientId: string, prioritaria: PrioridadVisible | null) => {
        setGuardadas((g) => ({ ...g, [clientId]: prioritaria }));
        if (ordenaLaLista) router.refresh();
      },
    }),
    [iniciales, guardadas, puedeMarcar, ordenaLaLista, router],
  );
  return <Prioridades.Provider value={valor}>{children}</Prioridades.Provider>;
}

export function EstrellaDePrioridad({ clientId, cuenta, soloEstrella = false }: { clientId: string; cuenta: string; soloEstrella?: boolean }) {
  const contexto = useContext(Prioridades);
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  const [ventana, setVentana] = useState<MotivoDePrioridad | null>(null);

  const prioritaria = contexto?.marcas[clientId] ?? null;
  const descripcion = prioritaria ? `Prioritaria: ${prioritaria.enPalabras} · la marcó ${prioritaria.quien}` : "";

  if (!contexto || (!contexto.puedeMarcar && !prioritaria)) return <span aria-hidden />;

  const contenido = (
    <>
      <Estrella
        vacia={!prioritaria}
        className={cn("h-4 w-4", prioritaria ? "text-brand" : "text-fg-muted transition-colors group-hover:text-brand", ocupado && "opacity-50")}
      />
      {prioritaria && !soloEstrella && <span className="line-clamp-2 min-w-0 break-words text-left text-[11px] font-medium leading-[14px] text-brand">{prioritaria.enPalabras}</span>}
    </>
  );

  if (!contexto.puedeMarcar) {
    return (
      <span title={descripcion} className="relative z-[1] flex min-w-0 items-start gap-1">
        {contenido}
      </span>
    );
  }

  async function guardar(cuerpo: Parameters<typeof guardarPrioridad>[1], listo: string) {
    setOcupado(true);
    try {
      contexto?.onCambio(clientId, await guardarPrioridad(clientId, cuerpo));
      toast.success(listo);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(false);
    }
  }

  const items: MenuItemDef[] = MOTIVOS_DE_PRIORIDAD.map((motivo) => ({
    key: motivo,
    label: motivo === "otro" ? `${NOMBRE_DEL_MOTIVO.otro}…` : NOMBRE_DEL_MOTIVO[motivo],
    disabled: ocupado || (motivo !== "otro" && prioritaria?.motivo === motivo),
    // «Otro motivo» pide decir cuál; los demás se guardan con el clic, conservando la línea que ya tuviera.
    onSelect: () =>
      motivo === "otro"
        ? setVentana("otro")
        : void guardar({ accion: "marcar", motivo, nota: prioritaria?.nota ?? null }, `${cuenta}: prioritaria por ${NOMBRE_DEL_MOTIVO[motivo]}.`),
  }));
  if (prioritaria) {
    items.push(
      { key: "linea", label: "Agregar o cambiar la línea…", separatorBefore: true, onSelect: () => setVentana(prioritaria.motivo) },
      { key: "quitar", label: "Quitar la marca", danger: true, disabled: ocupado, onSelect: () => void guardar({ accion: "quitar" }, `${cuenta} ya no es prioritaria.`) },
    );
  }

  return (
    <span className="relative z-[1] block min-w-0">
      <Menu
        trigger={contenido}
        items={items}
        header={prioritaria ? `${prioritaria.enPalabras} · la marcó ${prioritaria.quien}` : "Marcar como prioritaria por…"}
        aria-label={prioritaria ? `${cuenta}: ${descripcion}. Cambiar` : `Marcar ${cuenta} como prioritaria`}
        triggerTitle={prioritaria ? descripcion : "Marcar como prioritaria: pide más seguimiento"}
        triggerClassName="group -m-1 flex max-w-full items-start gap-1 rounded p-1 transition-colors hover:bg-surface-hover"
      />
      {ventana && (
        <VentanaDePrioridad
          clientId={clientId}
          cuenta={cuenta}
          prioritaria={prioritaria}
          motivoInicial={ventana}
          onCerrar={() => setVentana(null)}
          onGuardada={(p) => contexto.onCambio(clientId, p)}
        />
      )}
    </span>
  );
}
