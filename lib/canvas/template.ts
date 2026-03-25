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

// ─── Project Canvas (Canvas de servicio — nivel caso de uso) ─────────────────

export interface ProjectCanvas {
  procesos: Array<{
    nombre: string;
    flujo_actual: string;
    dolores: string[];
    owner: string;
  }>;
  stakeholders_proyecto: Array<{
    nombre: string;
    rol: string;
    influencia: string; // alta | media | baja
    notas: string;
  }>;
  hallazgos_dolores: {
    dolor_principal: string;
    riesgos: string[];
    quick_wins: string[];
    hallazgos_entrevistas: string[];
  };
  hipotesis_recomendaciones: {
    hipotesis_validadas: string[];
    hipotesis_pendientes: string[];
    recomendaciones: string[];
  };
  alcance_plan: {
    objetivos_piloto: string[];
    kpis: string[];
    roadmap: string[];
    acuerdos: string[];
  };
  ejecucion: {
    implementaciones: string[];
    metricas_adopcion: string[];
    resultados_vs_plan: string[];
  };
}

export const EMPTY_PROJECT_CANVAS: ProjectCanvas = {
  procesos: [],
  stakeholders_proyecto: [],
  hallazgos_dolores: { dolor_principal: "", riesgos: [], quick_wins: [], hallazgos_entrevistas: [] },
  hipotesis_recomendaciones: { hipotesis_validadas: [], hipotesis_pendientes: [], recomendaciones: [] },
  alcance_plan: { objetivos_piloto: [], kpis: [], roadmap: [], acuerdos: [] },
  ejecucion: { implementaciones: [], metricas_adopcion: [], resultados_vs_plan: [] },
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
  procesos: "Procesos",
  stakeholders_proyecto: "Stakeholders del proyecto",
  hallazgos_dolores: "Hallazgos y dolores",
  hipotesis_recomendaciones: "Hipótesis y recomendaciones",
  alcance_plan: "Alcance y plan",
  ejecucion: "Ejecución",
};
