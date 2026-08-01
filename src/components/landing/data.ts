/**
 * Datos estáticos de la landing.
 *
 * Estaban a nivel de módulo dentro de `LandingClient.tsx`. Sacarlos permite que los
 * sub-componentes se dividan en archivos sin que cada uno arrastre el array
 * completo, y deja el contenido editable sin abrir un archivo de componentes.
 */

export const TRUSTED_LOGOS = [
  { name: 'WorldBrain', src: '/worldbrain-logo.webp' },
  { name: 'Microsoft', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/6423178f81ce716edd7f851a_Micrisoft.svg' },
  { name: 'Canva', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/66301630500a1dd9056ad3be_Canva.svg' },
  { name: 'Deloitte', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/6423176ff5659248257a1053_Deloitte.svg' },
  { name: 'Dropbox', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/66301659ea49592bc352ceaf_Dropbox.svg' },
  { name: 'TikTok', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/6630168a0d47e34ca6b6381c_tiktok.svg' },
  { name: 'Paysafe', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/663016a6f2c1503f941c19a7_Paysafe.svg' },
  { name: 'Ubisoft', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/663016bcd41fa1628a33e4bc_Ubisoft.svg' },
  { name: 'IBM', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/663016cdbc3f2d38f6e11f46_IBM.svg' },
  { name: 'Forrester', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/663016eef2c1503f941c5338_Forrester.svg' },
  { name: 'Samsung', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/6589fcd9f3fc8359012852be_Samsung.svg' },
  { name: 'Red Bull', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/66301727ea9ebc03c4d821e9_Red%20Bull.svg' },
  { name: 'Atlassian', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/6709aeacf1dab4a7064543a0_Atlassian.svg' },
];
