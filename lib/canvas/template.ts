// ─── Client Canvas (nivel empresa, compartido entre proyectos) ───────────────

export interface ClientCanvas {
  perfil: {
    industria: string;
    modelo_negocio: string;
    tamano: string;
  };
  stakeholders: Array<{
    nombre: string;
    rol: string;
    notas: string;
  }>;
  madurez: {
    marketing: string;
    ventas: string;
    servicio: string;
  };
  herramientas: string[];
  contexto_comercial: {
    canal_adquisicion: string;
    relacion_previa: string;
    motivacion_compra: string;
  };
}

export const EMPTY_CLIENT_CANVAS: ClientCanvas = {
  perfil: { industria: "", modelo_negocio: "", tamano: "" },
  stakeholders: [],
  madurez: { marketing: "", ventas: "", servicio: "" },
  herramientas: [],
  contexto_comercial: { canal_adquisicion: "", relacion_previa: "", motivacion_compra: "" },
};

// ─── Project Canvas (nivel caso de uso, específico por proyecto) ─────────────

export interface ProjectCanvas {
  procesos: Array<{
    nombre: string;
    flujo_actual: string;
    dolores: string[];
    owner: string;
  }>;
  dolores_oportunidades: {
    dolor_principal: string;
    riesgos: string[];
    quick_wins: string[];
  };
  diagnostico: {
    hipotesis: string[];
    expectativas: string[];
    hallazgos_clave: string[];
  };
  plan: {
    objetivos_piloto: string[];
    kpis: string[];
    roadmap: string[];
  };
  ejecucion: {
    implementaciones: string[];
    metricas_adopcion: string[];
    resultados: string[];
  };
}

export const EMPTY_PROJECT_CANVAS: ProjectCanvas = {
  procesos: [],
  dolores_oportunidades: { dolor_principal: "", riesgos: [], quick_wins: [] },
  diagnostico: { hipotesis: [], expectativas: [], hallazgos_clave: [] },
  plan: { objetivos_piloto: [], kpis: [], roadmap: [] },
  ejecucion: { implementaciones: [], metricas_adopcion: [], resultados: [] },
};

// ─── Labels en español para la UI ────────────────────────────────────────────

export const CLIENT_CANVAS_LABELS: Record<keyof ClientCanvas, string> = {
  perfil: "Perfil de la empresa",
  stakeholders: "Stakeholders y roles",
  madurez: "Madurez tecnológica",
  herramientas: "Herramientas actuales",
  contexto_comercial: "Contexto comercial",
};

export const PROJECT_CANVAS_LABELS: Record<keyof ProjectCanvas, string> = {
  procesos: "Procesos mapeados",
  dolores_oportunidades: "Dolores y oportunidades",
  diagnostico: "Diagnóstico",
  plan: "Plan del piloto",
  ejecucion: "Ejecución y resultados",
};
