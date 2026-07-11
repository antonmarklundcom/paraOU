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
  nav: { tenders: "Licitaciones", buyers: "Compradores", suppliers: "Proveedores" },
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
  match: { badge: "de coincidencia", why: "ver por qué" },
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
