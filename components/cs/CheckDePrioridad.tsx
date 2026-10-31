"use client";

/**
 * components/cs/CheckDePrioridad.tsx — la columna «Prioritaria» de los listados de Éxito del cliente (2026-10-30,
 * pedido de Elías: «debería ser muy sencillo de marcar»). Regla en lib/cs/prioridad-de-cuenta.ts.
 *
 * Un check por cuenta: un clic abre los motivos (los fijos y los que creó el equipo) y elegir uno guarda, sin salir de la
 * lista. «Otro motivo» y «Agregar una línea» abren la ventana de siempre (`VentanaDePrioridad`). Las marcas, los motivos y
 * el permiso vienen de
 * `PrioridadesDeLaCartera`, que la página pone una sola vez alrededor de todos los listados: una fila solo necesita el id
 * y el nombre de su cuenta.
 *
 * ⚠ El check siempre pinta algo, aunque esté vacío y quien mira no pueda marcar: en una fila de grilla, una celda que
 * no renderiza corre todas las columnas siguientes.
 * ⚠ Va por encima del enlace de la fila (`relative z-[1]`): una fila con el check no puede ser un <a> entero, porque un
 * botón dentro de un enlace también lo abriría.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Menu, type MenuItemDef } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
import {
  MOTIVOS_DE_PRIORIDAD,
  NOMBRE_DEL_MOTIVO,
  marcasConLoGuardado,
  motivosConLosUsados,
  type MotivoDelEquipo,
  type PrioridadVisible,
} from "@/lib/cs/prioridad-de-cuenta";
import { CheckDeMarca, VentanaDePrioridad, guardarPrioridad } from "./MarcaDePrioridad";

type Marcas = Readonly<Record<string, PrioridadVisible>>;

const Prioridades = createContext<{
  marcas: Marcas;
  motivos: readonly MotivoDelEquipo[];
  puedeMarcar: boolean;
  onCambio: (clientId: string, prioritaria: PrioridadVisible | null) => void;
} | null>(null);

export function PrioridadesDeLaCartera({
  iniciales,
  motivos,
  puedeMarcar,
  ordenaLaLista,
  children,
}: {
  iniciales: Marcas;
  motivos: readonly MotivoDelEquipo[];
  puedeMarcar: boolean;
  /** La marca ordena esta lista: al guardar se pide de nuevo. Seguimiento no ordena por ella y recargar lee calendarios. */
  ordenaLaLista: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  // Lo guardado acá manda sobre lo que traiga el servidor: al marcar dos seguidas, la primera recarga llega con una foto
  // anterior a la segunda y haría parpadear el check.
  const [guardadas, setGuardadas] = useState<Readonly<Record<string, PrioridadVisible | null>>>({});
  // Aparte de las marcas: cambiarle el motivo a la cuenta no saca del menú el que se acaba de crear.
  const [usados, setUsados] = useState<readonly MotivoDelEquipo[]>([]);

  const valor = useMemo(
    () => ({
      marcas: marcasConLoGuardado(iniciales, guardadas),
      motivos: motivosConLosUsados(motivos, usados),
      puedeMarcar,
      onCambio: (clientId: string, prioritaria: PrioridadVisible | null) => {
        setGuardadas((g) => ({ ...g, [clientId]: prioritaria }));
        const motivo = prioritaria?.motivoDelEquipo;
        if (motivo) setUsados((u) => [...u, motivo]);
        if (ordenaLaLista) router.refresh();
      },
    }),
    [iniciales, motivos, guardadas, usados, puedeMarcar, ordenaLaLista, router],
  );
  return <Prioridades.Provider value={valor}>{children}</Prioridades.Provider>;
}

export function CheckDePrioridad({ clientId, cuenta, soloCheck = false }: { clientId: string; cuenta: string; soloCheck?: boolean }) {
  const contexto = useContext(Prioridades);
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  const [ventana, setVentana] = useState<"otro" | "linea" | null>(null);

  const prioritaria = contexto?.marcas[clientId] ?? null;
  const descripcion = prioritaria ? `Prioritaria: ${prioritaria.enPalabras} · la marcó ${prioritaria.quien}` : "";

  if (!contexto || (!contexto.puedeMarcar && !prioritaria)) return <span aria-hidden />;

  const contenido = (
    <>
      <CheckDeMarca
        vacio={!prioritaria}
        className={cn("h-4 w-4", prioritaria ? "text-brand" : "text-fg-muted transition-colors group-hover:text-brand", ocupado && "opacity-50")}
      />
      {prioritaria && !soloCheck && <span className="line-clamp-2 min-w-0 break-words text-left text-[11px] font-medium leading-[14px] text-brand">{prioritaria.enPalabras}</span>}
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

  // «Otro motivo» pide decir cuál; los demás se guardan con el clic, conservando la línea que ya tuviera.
  const nota = prioritaria?.nota ?? null;
  const items: MenuItemDef[] = [
    ...MOTIVOS_DE_PRIORIDAD.filter((motivo) => motivo !== "otro").map((motivo) => ({
      key: motivo,
      label: NOMBRE_DEL_MOTIVO[motivo],
      disabled: ocupado || prioritaria?.motivo === motivo,
      onSelect: () => void guardar({ accion: "marcar", motivo, nota }, `${cuenta}: prioritaria por ${NOMBRE_DEL_MOTIVO[motivo]}.`),
    })),
    ...contexto.motivos.map((m) => ({
      key: m.id,
      label: m.nombre,
      disabled: ocupado || prioritaria?.motivoDelEquipo?.id === m.id,
      onSelect: () => void guardar({ accion: "marcar", motivo: "otro", motivoDelEquipoId: m.id, nota }, `${cuenta}: prioritaria por ${m.nombre}.`),
    })),
    { key: "otro", label: `${NOMBRE_DEL_MOTIVO.otro}…`, disabled: ocupado, onSelect: () => setVentana("otro") },
  ];
  if (prioritaria) {
    items.push(
      { key: "linea", label: "Agregar o cambiar la línea…", separatorBefore: true, onSelect: () => setVentana("linea") },
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
          motivos={contexto.motivos}
          enOtroMotivo={ventana === "otro"}
          onCerrar={() => setVentana(null)}
          onGuardada={(p) => contexto.onCambio(clientId, p)}
        />
      )}
    </span>
  );
}
