/**
 * i18n dictionary (CLAUDE.md rule 5: es default, en secondary). Kept as a simple
 * typed object — Server Components read `dict(locale)` directly. `en` is a stub to
 * be completed when the English UI ships.
 */

export type Locale = "es" | "en";
export const DEFAULT_LOCALE: Locale = "es";

const es = {
  brand: "ParaOU",
  tagline: "Inteligencia de contrataciones públicas de Paraguay",
  nav: {
    tenders: "Licitaciones",
    buyers: "Compradores",
    suppliers: "Proveedores",
    panel: "Mi panel",
    perfil: "Mi perfil",
  },
  overview: {
    title: "Licitaciones",
    resultsOne: "licitación",
    resultsMany: "licitaciones",
    search: "Buscar por palabra clave…",
    filters: "Filtros",
    clear: "Limpiar",
    apply: "Aplicar",
    empty: "No se encontraron licitaciones. Probá ampliar los filtros.",
    staleBanner: "Los datos podrían estar desactualizados (última sincronización hace más de 2 h).",
    fixturesBanner: "Modo de datos de prueba — todavía no conectado a la API en vivo de la DNCP.",
    more: "Ver más",
    source: "Fuente: DNCP",
  },
  sort: {
    label: "Ordenar",
    relevance: "Relevancia",
    newest: "Más recientes",
    deadline: "Cierre próximo",
    amount: "Monto mayor",
  },
  filter: {
    status: "Estado",
    category: "Categoría",
    department: "Departamento",
    method: "Modalidad",
    buyer: "Comprador",
    amount: "Monto",
    published: "Publicación",
    deadline: "Cierre",
    closingSoon: "Cierra en ≤ 7 días",
  },
  status: {
    PLANNED: "Planificada",
    OPEN: "Abierta",
    CLOSED: "Cerrada",
    AWARDED: "Adjudicada",
    CONTRACTED: "Contratada",
    CANCELLED: "Cancelada",
    UNSUCCESSFUL: "Desierta",
  },
  detail: {
    summary: "Resumen en simple",
    keyFacts: "Datos clave",
    method: "Modalidad",
    category: "Categoría",
    published: "Publicación",
    inquiryDeadline: "Consultas hasta",
    bidDeadline: "Cierre de ofertas",
    amount: "Monto referencial",
    timeline: "Proceso",
    documents: "Documentos",
    documentsHint: "Los pliegos se abren en el portal oficial de la DNCP.",
    buyerHistory: "Historial del comprador",
    follow: "Seguir",
    following: "Siguiendo",
    bid: "Voy a ofertar",
    dismiss: "No es para mí",
    addCalendar: "Agendar cierre",
    verifyOfficial: "Verificá siempre en el pliego oficial.",
    noAwards: "Sin adjudicaciones registradas.",
    noHistory: "Sin historial en esta categoría.",
  },
  landing: {
    heroLead: "Solo las licitaciones que tu empresa puede ganar —",
    heroEmph: "filtradas, ordenadas y explicadas.",
    browse: "Explorar licitaciones",
    openToday: "licitaciones abiertas",
    inPlay: "en juego",
    topCategories: "Categorías con más movimiento",
  },
  match: {
    badge: "de coincidencia",
    why: "ver por qué",
    reasons: "Por qué encaja",
    cautions: "Atención",
    save: "Guardar",
    saved: "Guardado",
    bid: "Voy a ofertar",
    bidding: "Ofertando",
    dismiss: "No es para mí",
  },
  perfil: {
    title: "Perfil de tu empresa",
    subtitle: "Contanos qué hace tu empresa y te mostramos solo lo que podés ganar.",
    step: "Paso",
    of: "de",
    step1Title: "¿Qué hace tu empresa?",
    step1Hint:
      "Escribí con tus palabras: qué venden o qué servicios prestan, experiencia, tamaño. Cuanto más detalle, mejores coincidencias.",
    namePlaceholder: "Nombre de la empresa",
    descPlaceholder:
      "Ej.: Somos una constructora de Itapúa con 15 años de experiencia en obras viales, empedrados y desagües pluviales…",
    step2Title: "¿En qué rubros?",
    step2Hint: "Elegí las categorías donde suele licitar tu rubro.",
    suggest: "Sugerir con IA",
    suggesting: "Analizando…",
    step3Title: "Alcance",
    step3Hint: "Dónde operás, rango de contrato y qué NO hacés.",
    departments: "Departamentos (vacío = todo el país)",
    amountRange: "Rango de monto (Gs.)",
    amountMin: "Mínimo",
    amountMax: "Máximo",
    excludeWords: "Palabras a excluir (separadas por coma)",
    keywords: "Palabras clave (separadas por coma)",
    certifications: "Certificaciones (separadas por coma)",
    back: "Atrás",
    next: "Siguiente",
    finish: "Ver mis coincidencias",
    finishing: "Buscando coincidencias…",
    sampleTitle: "Tus primeras coincidencias",
    sampleEmpty:
      "Todavía no encontramos coincidencias abiertas para tu perfil. El sistema sigue buscando con cada sincronización — volvé a mirar tu panel más tarde.",
    aiUnavailable: "La IA no está disponible ahora; tus coincidencias van a aparecer en el panel.",
    toPanel: "Ir a mi panel",
    edit: "Editar perfil",
    saveChanges: "Guardar cambios",
    validation: "Completá el nombre y una descripción de al menos 10 caracteres.",
  },
  panel: {
    title: "Mi panel",
    noProfile: "Todavía no creaste el perfil de tu empresa.",
    createProfile: "Crear mi perfil",
    nuevos: "Nuevos",
    cierranPronto: "Cierran pronto",
    guardados: "Guardados",
    empty: "Nada por acá todavía.",
    emptyFeed:
      "Sin coincidencias por ahora. El sistema evalúa licitaciones nuevas en cada sincronización.",
    refresh: "Actualizar",
    score: "puntos",
  },
  aiSummary: {
    disclaimer: "Resumen generado con IA. Verificá siempre en el pliego oficial.",
    helpful: "¿Te sirvió?",
    yes: "Sí",
    no: "No",
    thanks: "¡Gracias por tu opinión!",
  },
} as const;

// English stub — mirror of the es shape; fill in when the en UI ships.
const en: typeof es = es;

const dictionaries: Record<Locale, typeof es> = { es, en };

export function dict(locale: Locale = DEFAULT_LOCALE) {
  return dictionaries[locale];
}

/** Tailwind tone for a status dot/badge (docs/05: green open, amber closing, gray closed). */
export function statusTone(
  status: string,
  daysUntilDeadline: number | null,
): "open" | "closing" | "closed" {
  if (status === "OPEN") {
    if (daysUntilDeadline !== null && daysUntilDeadline >= 0 && daysUntilDeadline <= 7)
      return "closing";
    return "open";
  }
  if (status === "PLANNED") return "open";
  return "closed";
}
