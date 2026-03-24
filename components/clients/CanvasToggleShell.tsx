"use client";

import { useState, createContext, useContext } from "react";

type CanvasView = null | "empresa" | "proyecto";

const CanvasContext = createContext<{
  active: CanvasView;
  toggle: (view: CanvasView) => void;
}>({ active: null, toggle: () => {} });

export function useCanvasToggle() {
  return useContext(CanvasContext);
}

/**
 * Provider que envuelve todo el layout del cliente.
 * Solo provee el context — no hace renderizado condicional.
 * Los hijos (server components) se renderizan normalmente.
 */
export default function CanvasToggleShell({
  clientId: _clientId,
  children,
}: {
  clientId: string;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState<CanvasView>(null);

  const toggle = (view: CanvasView) => {
    setActive((prev) => (prev === view ? null : view));
  };

  return (
    <CanvasContext.Provider value={{ active, toggle }}>
      {children}
    </CanvasContext.Provider>
  );
}
