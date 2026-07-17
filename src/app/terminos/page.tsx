import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description: "Términos y condiciones de uso de ParaOU.",
  alternates: { canonical: "/terminos" },
};

/**
 * Agent-drafted per PLAN.md Phase 0 decision #4 — owner/lawyer review required
 * before this is relied on as a binding contract. Update LAST_UPDATED when
 * reviewed/changed.
 */
const LAST_UPDATED = "17 de julio de 2026";

export default function TerminosPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed [&_a]:underline [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
      <h1>Términos y condiciones</h1>
      <p className="text-sm text-muted-foreground">Última actualización: {LAST_UPDATED}</p>

      <h2>1. Qué es ParaOU</h2>
      <p>
        ParaOU es un servicio informativo que organiza, filtra y explica datos públicos de
        contrataciones del Estado paraguayo, publicados por la Dirección Nacional de
        Contrataciones Públicas (DNCP) bajo su API de datos abiertos. No somos parte de la DNCP ni
        de ningún organismo del Estado, ni intervenimos en procesos de licitación.
      </p>

      <h2>2. Naturaleza de la información</h2>
      <p>
        Toda la información sobre licitaciones se origina en la DNCP y se replica en nuestra base
        de datos para mejorar la velocidad y la búsqueda. No garantizamos que los datos estén
        siempre actualizados, completos o libres de errores de la fuente original.{" "}
        <strong>
          El pliego oficial publicado por la entidad convocante es siempre la fuente autoritativa
        </strong>
        ; cualquier decisión de participar en una licitación debe basarse en ese documento, no
        únicamente en lo mostrado en ParaOU.
      </p>

      <h2>3. Contenido generado con inteligencia artificial</h2>
      <p>
        Los resúmenes, puntajes de coincidencia, motivos de ajuste (&ldquo;fit reasons&rdquo;) y
        checklists de análisis de pliegos son generados con modelos de inteligencia artificial a
        partir del texto público de cada licitación. Son una ayuda de lectura, no asesoría legal
        ni una garantía de elegibilidad o de éxito en una oferta. Pueden contener errores o
        omisiones. Verificá siempre el pliego oficial antes de tomar decisiones comerciales o
        legales.
      </p>

      <h2>4. Cuentas y uso del servicio</h2>
      <p>
        Para guardar perfiles de empresa, búsquedas y recibir alertas es necesario crear una
        cuenta. Sos responsable de mantener la confidencialidad de tu acceso y de la exactitud de
        la información que cargás sobre tu empresa. No está permitido usar el servicio para
        actividades ilegales, extraer datos de forma masiva y automatizada sin autorización
        (scraping fuera de nuestra API pública, si la hubiera), ni intentar vulnerar la seguridad
        de la plataforma.
      </p>

      <h2>5. Planes pagos</h2>
      <p>
        Los planes pagos (Pro, Business, Agencia) desbloquean funciones de inteligencia adicional
        —mayor profundidad de análisis con IA, alertas más frecuentes, análisis de pliegos— pero
        nunca restringen el acceso a los datos públicos de licitaciones, que permanecen
        disponibles gratis para cualquier usuario. La facturación se procesa mediante Stripe; podés
        cancelar tu suscripción en cualquier momento desde &ldquo;Administrar suscripción&rdquo; en
        tu cuenta, y conservás el acceso hasta el fin del período ya pagado.
      </p>

      <h2>6. Límites de responsabilidad</h2>
      <p>
        ParaOU se ofrece &ldquo;tal cual&rdquo;, sin garantías de disponibilidad continua ni de
        ausencia de errores. En la medida permitida por la ley paraguaya, no somos responsables por
        pérdidas derivadas de decisiones comerciales tomadas en base a la información o al
        análisis de IA provisto por el servicio.
      </p>

      <h2>7. Cambios a estos términos</h2>
      <p>
        Podemos actualizar estos términos ocasionalmente. Los cambios relevantes se reflejarán en
        la fecha de &ldquo;Última actualización&rdquo; de esta página.
      </p>

      <h2>8. Contacto</h2>
      <p>
        Consultas sobre estos términos: <a href="mailto:hola@paraou.com">hola@paraou.com</a>.
      </p>
    </main>
  );
}
