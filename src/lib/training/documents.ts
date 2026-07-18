import 'server-only';

import { createHash } from 'node:crypto';

export const MAX_TRAINING_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

export const ALLOWED_TRAINING_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]);

export function sanitizeTrainingFileName(name: string): string {
  const normalized = name
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\-+|\-+$/g, '')
    .replace(/^\.+/, '')
    .slice(0, 150);

  return normalized || 'document';
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256')
    .update(buffer)
    .digest('hex');
}

export function splitTrainingText(
  text: string,
  chunkSize = 2000,
  overlap = 200,
): string[] {
  if (!text.trim()) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    if (end < text.length) {
      const whitespace = text.lastIndexOf(' ', end);

      if (whitespace > start + Math.floor(chunkSize * 0.7)) {
        end = whitespace;
      }
    }

    const chunk = text.slice(start, end).trim();

    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= text.length) {
      break;
    }

    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

export interface CitationSource {
  id: string;
  document_id: string;
  content: string;
  training_documents?: {
    file_name: string;
  };
  chunk_index: number;
}

export function validateChatCitations(
  citationIds: string[],
  availableChunks: CitationSource[]
) {
  const chunkMap = new Map(availableChunks.map(c => [c.id, c]));
  return citationIds
    .filter(id => chunkMap.has(id))
    .map(id => {
      const chunk = chunkMap.get(id)!;
      return {
        documentId: chunk.document_id,
        fileName: chunk.training_documents?.file_name || 'Document',
        chunkIndex: chunk.chunk_index,
        snippet: chunk.content.slice(0, 240),
      };
    });
}
