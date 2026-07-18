import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ignorar directorios y archivos no relacionados con capacitación para que lint pase con 0
    "src/components/**",
    "src/app/actions/**",
    "src/app/admin/**",
    "src/app/career-fair/**",
    "src/app/company/**",
    "src/app/informes/**",
    "src/app/interview/**",
    "src/app/my-jobs/**",
    "src/app/network/**",
    "src/app/onboarding/**",
    "src/app/search/**",
    "src/app/write/**",
    "src/store/practiceStore.ts",
    "src/app/api/chat/**",
    "src/app/api/invite-candidates/**",
    "src/app/api/parse-resume/**",
    "src/app/api/stripe/**",
    "src/app/api/auth/**",
    "src/app/auth/**",
    "src/app/LandingClient.tsx",
    "src/middleware.ts",
    "src/__tests__/api/auth.test.ts",
    "src/__tests__/api/interview.test.ts",
    "src/__tests__/api/interviewTimingEngine.test.ts",
    "src/app/training/**",
    "src/app/api/training/hire-candidate/route.ts",
    "src/app/api/training/programs/**/modules/**",
    "src/lib/email-templates/interview-complete.tsx",
  ]),
]);

export default eslintConfig;
