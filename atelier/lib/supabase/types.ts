// Hand-written to match supabase/migrations/0001_atelier_init.sql and 0002_atelier_phase2.sql. Replace with the output of
// `supabase gen types typescript --schema atelier` once the schema is deployed (Task 23).
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Row>;
  Relationships: [];
};

export type FolderRow = {
  id: string;
  owner_id: string;
  name: string;
  parent_id: string | null;
  sort: number;
  created_at: string;
  updated_at: string;
};

export type AssetRow = {
  id: string;
  owner_id: string;
  kind: "image" | "video" | "gif" | "file";
  mime: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  variants: Json;
  palette: Json;
  phash: string | null;
  source_url: string | null;
  credit: string | null;
  licence: string | null;
  captured_at: string | null;
  created_at: string;
  /** 0002 */
  title: string | null;
  /** 0 = no palette / perceptual hash yet, 1 = Phase 2 analysis done. */
  analysis_version: number;
  hidden: boolean;
};

export type InboxItemRow = {
  id: string;
  owner_id: string;
  kind: "image" | "video" | "url" | "text";
  asset_id: string | null;
  url: string | null;
  text_body: string | null;
  title: string | null;
  source_url: string | null;
  credit: string | null;
  created_at: string;
  placed_at: string | null;
};

export type BoardRow = {
  id: string;
  owner_id: string;
  folder_id: string | null;
  title: string;
  starred: boolean;
  thumbnail_asset_id: string | null;
  /** Up to four asset ids. */
  preview: Json;
  last_opened_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BoardUpdateRow = {
  board_id: string;
  seq: number;
  /** bytea travels as a hex string ("\\x...") through PostgREST. */
  update: string;
  device_id: string;
  created_at: string;
};

export type BoardSnapshotRow = {
  id: string;
  board_id: string;
  state: string;
  upto_seq: number;
  kind: "compaction" | "round";
  label: string | null;
  created_at: string;
};

export type AssetUsageRow = { asset_id: string; board_id: string };

export type ErrorLogRow = {
  id: number;
  owner_id: string | null;
  area: string;
  message: string;
  context: Json;
  created_at: string;
};

/** 0003 (Phase 3): published rounds and share links. Visitor-data tables are written only through the service role. */
export type RoundRow = {
  id: string;
  board_id: string;
  number: number;
  label: string | null;
  snapshot_id: string;
  previews: Json;
  diff: Json;
  published_at: string;
};

export type ShareLinkRow = {
  id: string;
  board_id: string;
  owner_id: string;
  name: string | null;
  token_hash: string;
  mode: "round" | "live";
  round_id: string | null;
  scope: "board" | "frames";
  frame_ids: string[];
  permission: "view" | "react" | "comment";
  password_hash: string | null;
  expires_at: string | null;
  welcome_note: string | null;
  allow_download: boolean;
  watermark: boolean;
  show_credits: boolean;
  blind_votes: boolean;
  votes_revealed: boolean;
  cookie_epoch: number;
  created_at: string;
  revoked_at: string | null;
};

export type VisitorRow = {
  id: string;
  share_link_id: string;
  display_name: string | null;
  ip_hash: string | null;
  created_at: string;
  last_seen_at: string;
  last_round_id: string | null;
};

export type ShareAuthAttemptRow = {
  share_link_id: string;
  ip_hash: string;
  fails: number;
  locked_until: string | null;
  updated_at: string;
};

type Empty = { [_ in never]: never };

export type Database = {
  atelier: {
    Tables: {
      folders: Table<FolderRow, "name">;
      assets: Table<AssetRow, "kind" | "mime">;
      boards: Table<BoardRow, never>;
      board_updates: Table<BoardUpdateRow, "board_id" | "update" | "device_id">;
      board_snapshots: Table<BoardSnapshotRow, "board_id" | "state" | "upto_seq" | "kind">;
      asset_usages: Table<AssetUsageRow, "asset_id" | "board_id">;
      error_log: Table<ErrorLogRow, "area" | "message">;
      inbox_items: Table<InboxItemRow, "kind">;
      rounds: Table<RoundRow, "board_id" | "number" | "snapshot_id">;
      share_links: Table<ShareLinkRow, "board_id" | "owner_id" | "token_hash" | "mode" | "scope" | "permission">;
      visitors: Table<VisitorRow, "share_link_id">;
      share_auth_attempts: Table<ShareAuthAttemptRow, "share_link_id" | "ip_hash">;
    };
    Views: Empty;
    Functions: Empty;
    Enums: Empty;
    CompositeTypes: Empty;
  };
};
