import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description: "Términos y condiciones de uso de ParaOU.",
  alternates: { canonical: "/terminos" },
};

/**
 * Draft legal copy (PLAN.md Phase L1 #3) — needs an owner/lawyer review before
 * go-live; not a substitute for professional legal advice.
 */
export default function TerminosPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">Términos y condiciones</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Última actualización: 16 de julio de 2026. Este texto es un borrador — pendiente de
        revisión legal antes de su publicación definitiva.
      </p>

      <section className="mt-8 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">1. Sobre ParaOU</h2>
          <p className="mt-1 text-muted-foreground">
            ParaOU es un servicio informativo que agrega y organiza datos públicos de
            contrataciones publicados por la Dirección Nacional de Contrataciones Públicas
            (DNCP) de Paraguay bajo el estándar OCDS. ParaOU no es la DNCP, no participa en los
            procesos de contratación que muestra y no garantiza que un usuario resulte
            adjudicado en ninguna licitación.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">2. Cuentas y uso del servicio</h2>
          <p className="mt-1 text-muted-foreground">
            Para usar funciones como perfiles de empresa, búsquedas guardadas o alertas es
            necesario crear una cuenta con un correo electrónico válido. Sos responsable de
            mantener la confidencialidad del acceso a tu cuenta y de la veracidad de los datos
            que cargás en tu perfil de empresa.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">3. Planes y facturación</h2>
          <p className="mt-1 text-muted-foreground">
            Los planes pagos (Pro, Business, Agencia) se facturan mensual o anualmente a través
            de Stripe. Podés cancelar en cualquier momento desde &ldquo;Administrar
            suscripción&rdquo; en /cuenta; el acceso pago continúa hasta el fin del período ya
            pagado. Los precios están expresados en dólares estadounidenses (USD) y pueden
            actualizarse con aviso previo en esta página y en /precios.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">4. Exactitud de los datos y coincidencias con IA</h2>
          <p className="mt-1 text-muted-foreground">
            Los datos de licitaciones provienen de la DNCP y se muestran tal como se publican;
            ParaOU no garantiza su exactitud, completitud o actualización en tiempo real, y
            recomienda siempre verificar la información crítica (plazos, montos, requisitos) en
            el portal oficial de la DNCP antes de tomar decisiones de negocio. Las coincidencias,
            puntajes y resúmenes generados por inteligencia artificial son una ayuda orientativa,
            no asesoramiento legal ni garantía de adjudicación.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">5. Uso aceptable</h2>
          <p className="mt-1 text-muted-foreground">
            No está permitido intentar extraer masivamente el contenido del sitio (scraping) por
            fuera de la API pública documentada, interferir con el servicio, ni usar la
            plataforma con fines ilegales.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">6. Limitación de responsabilidad</h2>
          <p className="mt-1 text-muted-foreground">
            El servicio se ofrece &ldquo;tal cual&rdquo;. En la máxima medida permitida por la
            ley paraguaya, ParaOU no será responsable por pérdidas de negocio derivadas del uso o
            la imposibilidad de uso del servicio, incluyendo licitaciones perdidas por errores o
            demoras en los datos o alertas.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">7. Cambios a estos términos</h2>
          <p className="mt-1 text-muted-foreground">
            Podemos actualizar estos términos ocasionalmente; los cambios relevantes se
            comunicarán por correo electrónico o mediante un aviso en el sitio.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">8. Contacto</h2>
          <p className="mt-1 text-muted-foreground">
            Consultas sobre estos términos:{" "}
            <a href="mailto:hola@paraou.com" className="text-primary underline">
              hola@paraou.com
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
