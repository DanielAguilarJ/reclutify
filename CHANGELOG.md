# CHANGELOG

## [Unreleased] - Reclutify AI Growth Phase

### Added
- **Dashboard Analytics**: Real-time KPI metrics in `/admin` displaying candidate volumes, approval rates, and performance statistics utilizing `recharts`.
- **Scorecard PDF Export**: Added `@react-pdf/renderer` to construct downloadable candidate assessment reports in `/admin/report/[id]`.
- **Enterprise Multi-Tenancy**: Built initial Supabase SQL scripts (`supabase/migrations/00001_initial.sql`) for robust organizational RLS policies and schema isolation.
- **Workspace Selection & Onboarding**: Added a visual workspace switcher to the Admin Sidebar Navigation and built an extensive `/onboarding` module for new business setups.
- **CV Intelligence & Parsing**: Built resilient PDF/DOCX parsing engine API (`/api/parse-resume`) resolving Resumes into structured data via OpenRouter models to contextually aid candidate pre-filling. Included an interactive CV-Dropzone directly on the Interview setup.
- **Recruiter Email Notifications**: Integrated `resend` API endpoints at `/api/notifications` that seamlessly intercept end-stage evaluations via `react-email` generated layout templates.
- **AI Bias & Fairness Auditing**: Developed a dedicated Fairness Analytics Dashboard (`/admin/analytics/bias`) exposing role-specific toughness and mapping real-time AI prejudice flags safely.
- **Career Fair (B2B2C Market)**: Established `/career-fair` interface doubling as an engaging kiosk QR-hub engineered for bulk University simulation enrollments.
- **Marketing Upgrades**: Expanded Landing Page copy (`/page.tsx`) to surface the novel v2 technical achievements (PDF, Bias tracking, Universities), incorporating deep comparative insight against ATS alternatives like HireVue.
