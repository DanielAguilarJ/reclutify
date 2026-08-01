/**
 * Barril de compatibilidad de la landing.
 *
 * QUÉ ERA ESTE ARCHIVO
 * --------------------
 * 1068 líneas con las VEINTE secciones de la portada en un solo módulo: el
 * encabezado, el héroe, las métricas, el producto, el cómo funciona, las tarjetas
 * partidas, tres bloques de testimonios, las vacantes abiertas, la tabla
 * comparativa, la llamada final y el pie. Cambiar una coma del pie obligaba a
 * abrir —y a que la revisión leyera— el archivo entero.
 *
 * Cada sección vive ahora en `src/components/landing/`. El código de los
 * componentes es EL MISMO, carácter por carácter: esto fue un movimiento de
 * archivos, no una reescritura, precisamente para que la portada no cambie de
 * aspecto ni de comportamiento.
 *
 * POR QUÉ SE CONSERVA EL BARRIL
 * -----------------------------
 * `src/app/page.tsx` importa las once secciones desde aquí. Reexportarlas mantiene
 * ese import funcionando y deja el cambio contenido: si mañana `page.tsx` importa
 * de `@/components/landing/*` directamente, este archivo se borra sin tocar nada
 * más.
 *
 * Los datos estáticos (`TRUSTED_LOGOS`) están en `src/components/landing/data.ts`.
 */

export { Header } from '@/components/landing/Header';
export { HeroSection, TrustedLogosAnimated, TrustedByLabel } from '@/components/landing/HeroSection';
export { StatsGrid } from '@/components/landing/StatsSection';
export { ProductSection } from '@/components/landing/ProductSection';
export { HowItWorksHeading, HowItWorksSteps } from '@/components/landing/HowItWorksSection';
export { SplitHeading, SplitCards } from '@/components/landing/SplitSection';
export {
  TestimonialHeading,
  BigTestimonial,
  TestimonialAttribution,
  SupportingTestimonials,
} from '@/components/landing/TestimonialsSection';
export { OpenRolesSection } from '@/components/landing/OpenRolesSection';
export { ComparisonHeading, ComparisonTable } from '@/components/landing/ComparisonSection';
export { FinalCTA } from '@/components/landing/FinalCTA';
export { Footer } from '@/components/landing/Footer';
