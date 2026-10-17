/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;

  /** 机密：wrangler secret put JWT_SECRET */
  JWT_SECRET: string;

  ENVIRONMENT: string;
  JWT_ISSUER: string;
  ACCESS_TOKEN_TTL: string;
  DEFAULT_TZ: string;
  CORS_ORIGINS: string;
  PBKDF2_ITERATIONS?: string;
}

export type CardType = 'word' | 'chunk' | 'grammar';
export type Rating = 0 | 1 | 2 | 3;
export type UserCardState = 'new' | 'learning' | 'review' | 'suspended';

export interface JwtPayload {
  sub: string;      // user id
  email: string;
  jti: string;      // session id（对应 KV 中的键）
  iss: string;
  iat: number;
  exp: number;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  timezone: string;
  dailyNewLimit: number;
  dailyReviewLimit: number;
  jti: string;
}

export interface CardRow {
  id: string;
  type: CardType;
  content: string;
  phonetic: string | null;
  definition: string;
  grammar_pattern: string | null;
  explanation: string | null;
  examples_json: string | null;
  frequency_rank: number | null;
  tags: string | null;
}

export interface UserCardRow {
  id: string;
  user_id: string;
  card_id: string;
  state: UserCardState;
  stage: number;
  easiness_factor: number;
  interval_days: number;
  next_review_at: string;
  last_reviewed_at: string | null;
  reps: number;
  lapses: number;
}

export interface DueCardRow extends CardRow {
  card_id: string;
  user_card_id: string;
  user_id: string;
  state: UserCardState;
  stage: number;
  easiness_factor: number;
  interval_days: number;
  next_review_at: string;
  reps: number;
  lapses: number;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  timezone: string;
  daily_new_limit: number;
  daily_review_limit: number;
  created_at: string;
  last_active_at: string | null;
}
