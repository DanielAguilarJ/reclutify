# Graph Report - .  (2026-07-19)

## Corpus Check
- 378 files · ~336,608 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1378 nodes · 2837 edges · 115 communities (99 shown, 16 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.82)
- Token cost: 18,500 input · 4,200 output

## Community Hubs (Navigation)
- Company & Course Actions
- Social Feed & Posts
- Job Listings & Applications
- Third-Party Integrations
- Dev Tooling & Testing
- Reclutify Platform Docs
- User Profiles & Connections
- Training Program APIs
- TypeScript Type References
- AI Module Evaluation
- Stripe Billing Skill
- AI Training Chat
- Auth & Social Pages
- Interview Public Portal
- Stripe Subscriptions
- Interview Chat Engine
- Profile Management
- Landing Page UI
- Admin Navigation
- Training Admin Dashboard
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 112

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 144 edges
2. `useAppStore` - 141 edges
3. `createClient()` - 51 edges
4. `trainingApiErrorResponse()` - 37 edges
5. `useAdminStore` - 32 edges
6. `Supabase Postgres Best Practices: Section Definitions` - 31 edges
7. `createAdminClient()` - 27 edges
8. `requireProgramAdmin()` - 25 edges
9. `Logo()` - 21 edges
10. `useToast()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Reclutify OG Image — Social Preview Card` --conceptually_related_to--> `Reclutify AI Interview Platform`  [EXTRACTED]
  public/og-image.png → README.md
- `WorldBrain+ Logo` --conceptually_related_to--> `WorldBrain EdTech`  [EXTRACTED]
  public/worldbrain-logo.webp → README.md
- `tsvector Full-Text Search` --semantically_similar_to--> `GIN Index`  [INFERRED] [semantically similar]
  .agents/skills/supabase-postgres-best-practices/references/advanced-full-text-search.md → .agents/skills/supabase-postgres-best-practices/references/advanced-jsonb-indexing.md
- `tsvector / tsquery Full-Text Search` --semantically_similar_to--> `GIN Index`  [INFERRED] [semantically similar]
  .agents/skills/supabase-postgres-best-practices/references/advanced-full-text-search.md → .agents/skills/supabase-postgres-best-practices/references/advanced-jsonb-indexing.md
- `Enterprise Multi-Tenancy (Supabase RLS + Schema Isolation)` --conceptually_related_to--> `Supabase RLS Security Principles`  [INFERRED]
  CHANGELOG.md → .agents/skills/supabase/SKILL.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Stripe Payment Integration Stack: Checkout Sessions + Payment Element + Dynamic Payment Methods** — concept_checkout_sessions_api, concept_payment_element, concept_dynamic_payment_methods, _agents_skills_stripe_best_practices_references_payments [INFERRED 0.85]
- **Postgres Connection Management: Pooling + Limits + Idle Timeouts + Prepared Statements** — _agents_skills_supabase_postgres_best_practices_references_conn_pooling, _agents_skills_supabase_postgres_best_practices_references_conn_limits, _agents_skills_supabase_postgres_best_practices_references_conn_idle_timeout, _agents_skills_supabase_postgres_best_practices_references_conn_prepared_statements, concept_pgbouncer_connection_pooling [INFERRED 0.90]
- **Stripe Connect Account Model: Accounts v2 + Controller Properties + Charge Types** — concept_stripe_connect_accounts_v2, concept_connect_controller_properties, _agents_skills_stripe_best_practices_references_connect, rationale_accounts_v2_over_legacy [INFERRED 0.85]
- **Postgres Index Strategy: missing, composite, partial, covering, and typed indexes all serve query optimization** — _agents_skills_supabase_postgres_best_practices_references_query_missing_indexes_md, _agents_skills_supabase_postgres_best_practices_references_query_composite_indexes_md, _agents_skills_supabase_postgres_best_practices_references_query_partial_indexes_md, _agents_skills_supabase_postgres_best_practices_references_query_covering_indexes_md, _agents_skills_supabase_postgres_best_practices_references_query_index_types_md [INFERRED 0.95]
- **Connection Management: pooling, limits, idle timeout, and prepared statements together govern Postgres connection hygiene** — _agents_skills_supabase_postgres_best_practices_references_conn_pooling_md, _agents_skills_supabase_postgres_best_practices_references_conn_limits_md, _agents_skills_supabase_postgres_best_practices_references_conn_idle_timeout_md, _agents_skills_supabase_postgres_best_practices_references_conn_prepared_statements_md [INFERRED 0.95]
- **RLS Security: basics, performance optimization, and privilege management together enforce Postgres data security** — _agents_skills_supabase_postgres_best_practices_references_security_rls_basics_md, _agents_skills_supabase_postgres_best_practices_references_security_rls_performance_md, _agents_skills_supabase_postgres_best_practices_references_security_privileges_md [INFERRED 0.95]
- **Supabase Security Triad: RLS + Data API Exposure + Auth Metadata** — supabase_rls_security_principles, supabase_data_api_exposure, supabase_jwt_auth_metadata [EXTRACTED 0.95]
- **Reclutify AI Core: Platform + Zara Interviewer + Bias Auditing** — reclutify_platform, zara_ai_interviewer, reclutify_bias_fairness_audit [INFERRED 0.85]
- **Reclutify SaaS Infrastructure: Supabase + Cloudflare R2 + OpenRouter** — reclutify_tech_stack, cloudflare_r2_storage, openrouter_ai [INFERRED 0.85]

## Communities (115 total, 16 thin omitted)

### Community 0 - "Company & Course Actions"
Cohesion: 0.06
Nodes (53): getAllCompanies(), getCompanyBySlug(), updateCompanyProfile(), ActionResult, deleteCourse(), getCoachCourses(), getCoachLeads(), getCourseById() (+45 more)

### Community 1 - "Social Feed & Posts"
Cohesion: 0.07
Nodes (48): addComment(), createPost(), deleteComment(), deletePost(), getFeedPosts(), getPostComments(), toggleReaction(), updateComment() (+40 more)

### Community 2 - "Job Listings & Applications"
Cohesion: 0.08
Nodes (36): applyToJob(), getDistinctLocations(), getJobById(), getPublishedJobs(), toggleRolePublished(), JobSearchResults(), JobSearchResultsProps, CareerFairPage() (+28 more)

### Community 3 - "Third-Party Integrations"
Cohesion: 0.05
Nodes (43): @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, @clerk/nextjs, framer-motion, lucide-react, mammoth, next, dependencies (+35 more)

### Community 4 - "Dev Tooling & Testing"
Cohesion: 0.05
Nodes (42): eslint, eslint-config-next, jsdom, msw, devDependencies, eslint, eslint-config-next, jsdom (+34 more)

### Community 5 - "Reclutify Platform Docs"
Cohesion: 0.07
Nodes (37): Supabase Skill Feedback Issue Template, Supabase Skill, Reclutify CHANGELOG, Cloudflare R2 Video Storage, Next.js 15 App Router, OpenRouter AI, PostHog Privacy-First Analytics, Reclutify OG Image — Social Preview Card (+29 more)

### Community 6 - "User Profiles & Connections"
Cohesion: 0.10
Nodes (28): getConnectionStatus(), calculateProfileScore(), getProfileByUsername(), getUserRecentPosts(), incrementProfileViews(), generateMetadata(), ProfilePage(), ProfilePageProps (+20 more)

### Community 7 - "Training Program APIs"
Cohesion: 0.14
Nodes (25): POST(), DELETE(), POST(), DELETE(), PATCH(), PATCH(), POST(), POST() (+17 more)

### Community 8 - "TypeScript Type References"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 9 - "AI Module Evaluation"
Cohesion: 0.11
Nodes (23): questionsSchema, ProgramDocRow, baseQuestionSchema, createTrainingProgramSchema, evaluateTrainingModuleSchema, generatedModuleSectionSchema, generatedTrainingModuleBase, generatedTrainingModuleSchema (+15 more)

### Community 10 - "Stripe Billing Skill"
Cohesion: 0.10
Nodes (27): Billing / Subscriptions Reference, Connect / Platforms Reference, Payments Reference, Security Best Practices Reference, Tax / Stripe Tax Reference, Treasury / Financial Accounts Reference, stripe-best-practices Skill, stripe-projects Skill (+19 more)

### Community 11 - "AI Training Chat"
Cohesion: 0.12
Nodes (21): BoundedChunk, buildBoundedModuleStructure(), POST(), sanitizePersistedMessages(), POST(), documentAiAnalysisSchema, persistedTrainingMessageSchema, persistedTrainingMessagesSchema (+13 more)

### Community 12 - "Auth & Social Pages"
Cohesion: 0.13
Nodes (15): ResetPasswordPage(), GroupsPage(), HashtagPage(), CourseCard, InformesPage(), LoginContent(), Application, MyJobsPage() (+7 more)

### Community 13 - "Interview Public Portal"
Cohesion: 0.20
Nodes (17): OrgData, PageStatus, PublicInterviewPage(), CandidateInterview(), TicketInterviewPage(), TicketStatus, DetailsForm(), getMediaErrorMessage() (+9 more)

### Community 14 - "Stripe Subscriptions"
Cohesion: 0.13
Nodes (19): OrgSubscription, POST(), POST(), getPeriodEnd(), getSupabase(), POST(), updateOrgSubscription(), buildPlan() (+11 more)

### Community 15 - "Interview Chat Engine"
Cohesion: 0.13
Nodes (21): POST(), NOTE: sentiment will be null in the frontend response. Admin-side display, adjustCycleForQuestionType(), computeInterviewPlan(), computeRealTimePacing(), DEFAULT_TIMING, getBaseQuestionCycle(), getClosingOverhead() (+13 more)

### Community 16 - "Profile Management"
Cohesion: 0.17
Nodes (16): createProfile(), getMyProfile(), getProfileByUserId(), updateProfile(), uploadProfileImage(), FeedLayout(), metadata, FeedPage() (+8 more)

### Community 17 - "Landing Page UI"
Cohesion: 0.22
Nodes (21): BigTestimonial(), ComparisonHeading(), ComparisonTable(), FinalCTA(), Footer(), Header(), HeroSection(), HowItWorksHeading() (+13 more)

### Community 18 - "Admin Navigation"
Cohesion: 0.13
Nodes (12): MobileAdminNavProps, metadata, PrivacyPage(), renderContent(), sections, metadata, renderContent(), sections (+4 more)

### Community 19 - "Training Admin Dashboard"
Cohesion: 0.17
Nodes (12): ConfigureProgramPage(), TrainingDashboardPage(), EmployeeProgressPage(), TrainingAdminState, useTrainingAdminStore, TrainingDocument, TrainingDocumentStatus, TrainingDocumentTopic (+4 more)

### Community 20 - "Community 20"
Cohesion: 0.27
Nodes (12): POST(), GET(), escapeHtml(), POST(), POST(), programIdSchema, requireAuthenticatedUser(), requireOrgAdmin() (+4 more)

### Community 21 - "Community 21"
Cohesion: 0.17
Nodes (13): addWorkspace(), AddWorkspaceResult, generateSlug(), getActiveOrganizationId(), getUserOrganizations(), OrgActionResult, randomSuffix(), UserOrganization (+5 more)

### Community 22 - "Community 22"
Cohesion: 0.15
Nodes (13): switchOrganization(), AdminSidebarNav(), AdminSidebarNavProps, CoachSidebarNav(), CoachSidebarNavProps, LiveSessionsIndicator(), CoursesPage(), CreateCoursePage() (+5 more)

### Community 23 - "Community 23"
Cohesion: 0.19
Nodes (17): ModuleDraft, ObjectionPair, PlanDraft, InfoSessionState, initialState, ClosingMode, CoachNotificationType, ConversionResult (+9 more)

### Community 24 - "Community 24"
Cohesion: 0.13
Nodes (19): Batch INSERT for Bulk Data Loading, Eliminating N+1 Queries with Batch Loading, EXPLAIN ANALYZE for Diagnosing Slow Queries, pg_stat_statements for Query Analysis, VACUUM and ANALYZE for Table Statistics Maintenance, Composite Indexes for Multi-Column Queries, Covering Indexes with INCLUDE to Avoid Table Lookups, Adding Indexes on WHERE and JOIN Columns (+11 more)

### Community 25 - "Community 25"
Cohesion: 0.14
Nodes (18): Supabase Postgres Best Practices Changelog, Postgres Best Practices Section Definitions, Index JSONB Columns for Efficient Querying, Configure Idle Connection Timeouts, Set Appropriate Connection Limits, Use Connection Pooling for All Applications, Use Prepared Statements Correctly with Pooling, Batch INSERT Statements for Bulk Data (+10 more)

### Community 26 - "Community 26"
Cohesion: 0.24
Nodes (14): acceptConnectionRequest(), declineConnectionRequest(), getMyConnections(), getPendingRequests(), removeConnection(), sendConnectionRequest(), metadata, NetworkPage() (+6 more)

### Community 27 - "Community 27"
Cohesion: 0.24
Nodes (12): BiasAnalyticsPage(), AdminDashboardPage(), COLORS, PIE_COLORS, PipelinePage(), SyncStatusBanner(), candidateFromPayload(), useCandidates() (+4 more)

### Community 28 - "Community 28"
Cohesion: 0.16
Nodes (12): GET(), POST(), POST(), sanitizePublicQuestions(), completeTrainingModuleRpcResultSchema, completeTrainingModuleSchema, updateTrainingTimeSchema, getTrainingEmployeeFromSession() (+4 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (13): AttachedDocRow, GET(), mapDocRow(), attachTrainingDocumentSchema, detachTrainingDocumentQuerySchema, FluentMock, mockAssociationsResult, mockFrom (+5 more)

### Community 30 - "Community 30"
Cohesion: 0.16
Nodes (5): InfoAiOrbProps, InfoSessionRoom(), SpeechRecognitionEvent, SpeechToText, TextToSpeech

### Community 31 - "Community 31"
Cohesion: 0.15
Nodes (15): CvData, CvEducation, CvExperience, EmployeeTrainingModule, InterviewHighlight, SentimentData, TrainingAnswer, TrainingCitation (+7 more)

### Community 32 - "Community 32"
Cohesion: 0.13
Nodes (10): TelemetryDashboard(), TelemetryLog, timeAgo(), PricingPage(), t, PollComposer(), Props, AppState (+2 more)

### Community 33 - "Community 33"
Cohesion: 0.24
Nodes (11): candidateSchema, createCoachOrganization(), createOrganization(), employerSchema, generateSlug(), OnboardingResult, randomSuffix(), setupCandidateProfile() (+3 more)

### Community 34 - "Community 34"
Cohesion: 0.16
Nodes (12): CoachSettingsPage(), CoachSettings, CoachSettingsState, defaultSettings, IntegrationGoogleSheets, IntegrationHubspot, IntegrationNotion, Integrations (+4 more)

### Community 35 - "Community 35"
Cohesion: 0.15
Nodes (9): PracticePage(), JobResult, PersonResult, SearchClient(), AppNavbar(), AppNavbarProps, NAV_ITEMS, NavUser (+1 more)

### Community 36 - "Community 36"
Cohesion: 0.20
Nodes (9): mapEmployeeTrainingModule(), CompleteModuleResult, EvaluationFeedback, moduleFromSupabase(), TrainingState, TrainingEmployee, TrainingMessage, TrainingPhase (+1 more)

### Community 37 - "Community 37"
Cohesion: 0.21
Nodes (10): PollDisplay(), PollOption, FollowButton(), CVDocument(), formatDate(), ProfileCVExport(), ProfileCVExportProps, styles (+2 more)

### Community 38 - "Community 38"
Cohesion: 0.19
Nodes (7): AdminState, pushToSyncQueue(), NOTE: no need to re-fetch from Supabase here — the local `candidates`/`roles`, readSyncQueue(), SyncQueueItem, writeSyncQueue(), Role

### Community 39 - "Community 39"
Cohesion: 0.17
Nodes (10): CoachSettingsRow, getCoachSettings(), GetSettingsResult, getTeamMembers(), GetTeamResult, SendInvitationResult, sendTeamInvitationEmail(), TeamMember (+2 more)

### Community 40 - "Community 40"
Cohesion: 0.35
Nodes (9): getConversations(), getMessages(), getOrCreateConversation(), sendMessage(), formatTime(), MessagesClient(), MessagesClientProps, Conversation (+1 more)

### Community 41 - "Community 41"
Cohesion: 0.20
Nodes (6): ReportPage(), styles, ScoreGauge(), ScoreGaugeProps, TopicScoreBar(), TopicScoreBarProps

### Community 42 - "Community 42"
Cohesion: 0.17
Nodes (10): FluentMock, mockDeleteDoc, mockFrom, mockInsertAssoc, mockInsertDoc, mockProgram, mockSelectAssoc, mockSelectMaxAssoc (+2 more)

### Community 43 - "Community 43"
Cohesion: 0.29
Nodes (7): InfoSessionPage(), ClientDetailsForm(), ClientDetailsFormProps, COURSE_FOR_OPTIONS, ClosingPresential(), ClosingRemote(), useInfoSessionStore

### Community 44 - "Community 44"
Cohesion: 0.20
Nodes (9): BootstrapStatus, CitationType, EvaluationFeedbackState, SectionType, EvaluationDetail, mockPush, mockReplace, mockStoreDefault (+1 more)

### Community 45 - "Community 45"
Cohesion: 0.29
Nodes (9): CreateRolePage(), extractNameFromEmail(), getCoherenceStatus(), isDurationChangeSignificant(), RoleEditor(), TopicCard(), TopicDraft, WeightSlider() (+1 more)

### Community 46 - "Community 46"
Cohesion: 0.20
Nodes (8): FluentMock, mockAssociationsResult, mockFetch, mockFrom, mockOrgResult, MockProgram, mockRpc, MockUser

### Community 47 - "Community 47"
Cohesion: 0.20
Nodes (7): SpeechRecognition, SpeechRecognitionAlternative, SpeechRecognitionErrorEvent, SpeechRecognitionEvent, SpeechRecognitionResult, SpeechRecognitionResultList, Window

### Community 48 - "Community 48"
Cohesion: 0.44
Nodes (5): TicketsPage(), useTickets(), TicketState, useTicketStore, InterviewTicket

### Community 49 - "Community 49"
Cohesion: 0.22
Nodes (7): POST(), FluentMock, MockEmployee, mockFetch, mockFrom, mockProgressData, mockRpc

### Community 50 - "Community 50"
Cohesion: 0.28
Nodes (6): TrainingModulePage(), TrainingCenterPage(), TokenPhase, TrainingTokenPage(), useTrainingStore, mockFetch

### Community 51 - "Community 51"
Cohesion: 0.28
Nodes (6): CandidateTopNav(), CandidateTopNavProps, GlobalSearchBar(), SearchResult, Notification, NotificationBell()

### Community 52 - "Community 52"
Cohesion: 0.25
Nodes (8): createFluentMock(), defaultMockFrom(), FluentMock, MockEmployee, mockFetch, mockFrom, mockOrgResult, mockRpc

### Community 53 - "Community 53"
Cohesion: 0.25
Nodes (8): Advisory Locks for Application-Level Locking, Deadlock Prevention with Consistent Lock Ordering, Short Transactions to Reduce Lock Contention, SKIP LOCKED for Non-Blocking Queue Processing, Advisory Locks (pg_advisory_lock), Deadlock Prevention via Consistent Lock Ordering, SKIP LOCKED Queue Pattern, Short transactions reduce lock hold time and improve throughput 3-5x

### Community 54 - "Community 54"
Cohesion: 0.32
Nodes (5): PLAN_META, SettingsPage(), useWebhookStore, WebhookLog, WebhookState

### Community 55 - "Community 55"
Cohesion: 0.39
Nodes (7): POST(), testGoogleSheets(), testHubspot(), TestIntegrationRequest, testNotion(), TestResult, testWebhook()

### Community 56 - "Community 56"
Cohesion: 0.43
Nodes (7): RoleData, initialState, InterviewState, Candidate, InterviewMode, InterviewPhase, Topic

### Community 58 - "Community 58"
Cohesion: 0.32
Nodes (3): CoachState, CoachNotification, InfoSession

### Community 59 - "Community 59"
Cohesion: 0.38
Nodes (7): Use tsvector for Full-Text Search, tsvector Full-Text Search, JSONB Indexing with GIN for Efficient Querying, Postgres Index Type Selection (B-tree, GIN, GiST, BRIN, Hash), GIN Index, tsvector Full-Text Search, tsvector / tsquery Full-Text Search

### Community 60 - "Community 60"
Cohesion: 0.33
Nodes (5): POST(), startTrainingModuleRpcResultSchema, startTrainingModuleSchema, MockEmployee, mockRpc

### Community 61 - "Community 61"
Cohesion: 0.38
Nodes (4): CompareModalProps, HireModal(), HireModalProps, CandidateResult

### Community 62 - "Community 62"
Cohesion: 0.48
Nodes (5): config, isProtectedRoute(), middleware(), PROTECTED_PREFIXES, createClient()

### Community 63 - "Community 63"
Cohesion: 0.38
Nodes (6): initialState, PracticeState, PracticeTopic, usePracticeStore, Evaluation, TranscriptEntry

### Community 64 - "Community 64"
Cohesion: 0.33
Nodes (6): Idle Connection Timeout Configuration, Connection Limits and max_connections Setting, Connection Pooling with PgBouncer, Prepared Statements with Connection Pooling, Connection Pooling (PgBouncer Transaction Mode), Each Postgres connection consumes 1-3 MB RAM; without pooling 500 concurrent users exhaust memory

### Community 65 - "Community 65"
Cohesion: 0.33
Nodes (6): Principle of Least Privilege for Postgres Roles, Row Level Security (RLS) for Multi-Tenant Data, RLS Policy Performance Optimization, Row Level Security (RLS) Policy, SECURITY DEFINER Function for RLS Helper, Wrapping auth.uid() in SELECT prevents per-row function calls, enabling 100x speedup on large tables

### Community 66 - "Community 66"
Cohesion: 0.47
Nodes (5): getOrgIdForCourse(), loadAIConfig(), POST(), InfoChatRequest, InfoChatResponse

### Community 67 - "Community 67"
Cohesion: 0.40
Nodes (5): Cursor-Based Pagination Instead of OFFSET, Partial Indexes for Filtered Queries, Cursor-Based (Keyset) Pagination, Partial Index Pattern, OFFSET pagination scans all skipped rows making deep pages O(n); cursor pagination is O(1) via index seek

### Community 68 - "Community 68"
Cohesion: 0.60
Nodes (3): POST(), InterviewCompleteEmail(), InterviewCompleteEmailProps

### Community 69 - "Community 69"
Cohesion: 0.83
Nodes (3): getServiceClient(), PATCH(), POST()

### Community 70 - "Community 70"
Cohesion: 0.83
Nodes (3): getDepthGuidance(), getRecommendedTopicCount(), POST()

### Community 71 - "Community 71"
Cohesion: 0.83
Nodes (3): buildNotificationEmail(), POST(), triggerCRMIntegrations()

### Community 72 - "Community 72"
Cohesion: 0.67
Nodes (3): Writing Guidelines for Postgres References, Postgres Best Practices Rule Template, Show problematic pattern first to train agents on anti-patterns

## Knowledge Gaps
- **342 isolated node(s):** `eslintConfig`, `securityHeaders`, `nextConfig`, `name`, `version` (+337 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createClient()` connect `Company & Course Actions` to `Social Feed & Posts`, `Job Listings & Applications`, `Community 33`, `User Profiles & Connections`, `Community 39`, `Community 40`, `Stripe Subscriptions`, `Profile Management`, `Community 20`, `Community 21`, `Community 22`, `Community 26`?**
  _High betweenness centrality (0.186) - this node is a cross-community bridge._
- **Why does `useAppStore` connect `Landing Page UI` to `Social Feed & Posts`, `User Profiles & Connections`, `Auth & Social Pages`, `Interview Public Portal`, `Profile Management`, `Admin Navigation`, `Training Admin Dashboard`, `Community 21`, `Community 22`, `Community 23`, `Community 27`, `Community 32`, `Community 34`, `Community 35`, `Community 37`, `Community 41`, `Community 44`, `Community 45`, `Community 48`, `Community 50`, `Community 51`, `Community 54`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **Why does `createAdminClient()` connect `Community 20` to `Training Program APIs`, `AI Module Evaluation`, `AI Training Chat`, `Community 60`, `Community 49`, `Community 28`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `securityHeaders`, `nextConfig` to the rest of the system?**
  _342 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Company & Course Actions` be split into smaller, more focused modules?**
  _Cohesion score 0.056692242114237 - nodes in this community are weakly interconnected._
- **Should `Social Feed & Posts` be split into smaller, more focused modules?**
  _Cohesion score 0.07067603160667252 - nodes in this community are weakly interconnected._
- **Should `Job Listings & Applications` be split into smaller, more focused modules?**
  _Cohesion score 0.07510204081632653 - nodes in this community are weakly interconnected._