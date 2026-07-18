import 'server-only';
import { createAdminClient } from '@/utils/supabase/admin';
import { TrainingAuthError } from '@/lib/training/auth';

const REPLACE_MODULES_ERROR_MAP: Array<[string, string, number]> = [
  ['training_program_not_found', 'Training program not found', 404],
  ['only_draft_programs_can_replace_modules', 'Create a new program version before editing modules', 409],
  ['program_modules_are_in_use', 'Modules cannot be edited while employees are in training', 409],
  ['forbidden', 'Forbidden', 403],
  ['modules_must_be_array', 'Invalid modules payload', 400],
  ['module_title_required', 'Every module requires a title', 400],
  ['source_document_ids_must_be_array', 'Invalid module source documents', 400],
  ['unauthorized_source_document', 'A module references a document outside this program scope', 400],
];

export async function loadDraftModules(
  admin: ReturnType<typeof createAdminClient>,
  programId: string
) {
  const { data, error } = await admin
    .from('training_modules')
    .select(`
      *,
      training_module_documents (
        document_id
      )
    `)
    .eq('program_id', programId)
    .order('sort_order');

  if (error) {
    throw error;
  }

  return (data ?? []).map((module) => ({
    id: module.id,
    title: module.title,
    description: module.description,
    content: module.content,
    sortOrder: module.sort_order,
    durationEstimate: module.duration_estimate,
    evaluationEnabled: module.evaluation_enabled,
    evaluationQuestions: module.evaluation_questions,
    sourceDocumentIds: Array.isArray(module.training_module_documents)
      ? module.training_module_documents.map(
          (relation: { document_id: string }) => relation.document_id
        )
      : [],
  }));
}

export async function replaceDraftModules(
  admin: ReturnType<typeof createAdminClient>,
  actorUserId: string,
  programId: string,
  modules: unknown[]
) {
  const { data, error } = await admin.rpc(
    'replace_training_modules',
    {
      p_actor_user_id: actorUserId,
      p_program_id: programId,
      p_modules: modules,
    }
  );

  if (error) {
    for (const [needle, message, status] of REPLACE_MODULES_ERROR_MAP) {
      if (error.message?.includes(needle)) {
        throw new TrainingAuthError(message, status);
      }
    }

    throw error;
  }

  return data;
}
