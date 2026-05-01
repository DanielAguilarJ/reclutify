/**
 * Types for the Connections / Network system.
 */

export type ConnectionStatus = 'pending' | 'accepted' | 'declined';

export interface Connection {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: ConnectionStatus;
  created_at: string;
  updated_at: string;
}

export interface ConnectionWithProfile extends Connection {
  profile: {
    user_id: string;
    username: string;
    full_name: string;
    headline: string | null;
    avatar_url: string | null;
    is_open_to_work: boolean;
  };
}

export interface PeopleRecommendation {
  user_id: string;
  username: string;
  full_name: string;
  headline: string | null;
  avatar_url: string | null;
  is_open_to_work: boolean;
  mutual_connections: number;
}
