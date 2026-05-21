/**
 * Types for the Direct Messaging system.
 */

export interface Conversation {
  id: string;
  participant_ids: string[];
  last_message_at: string;
  created_at: string;
  // Client-enriched
  other_participant?: {
    user_id: string;
    username: string;
    full_name: string;
    avatar_url: string | null;
    headline: string | null;
  };
  last_message?: Message;
  unread_count?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
  // Client-enriched
  is_own?: boolean;
}
