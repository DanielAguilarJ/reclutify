import 'server-only';
import { createAdminClient } from '@/utils/supabase/admin';

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
    throw error;
  }

  return data;
}
