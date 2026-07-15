/**
 * Tipos escritos à mão espelhando supabase/migrations.
 * Regenere com `npm run db:types` (supabase gen types typescript --linked)
 * assim que o CLI estiver conectado ao projeto, e substitua este arquivo.
 * Mantido em sincronia manualmente por enquanto.
 */

export type SubjectType = 'game' | 'romhack' | 'translation' | 'tool' | 'document';

export type Profile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
};

export type Game = {
  id: string;
  slug: string;
  igdb_id: number | null;
  title: string;
  alt_title: string | null;
  developer: string | null;
  publishers: string[] | null;
  release_date: string | null;
  genres: string[] | null;
  platforms: string[] | null;
  franchise: string | null;
  description: string | null;
  cover_url: string | null;
  thumbnail: string | null;
  screenshots: string[] | null;
  video_url: string | null;
  game_modes: string[] | null;
  features: string[] | null;
  themes: string[] | null;
  age_rating: string | null;
  age_rating_details: string | null;
  regional_titles: Record<string, unknown> | null;
  resources: Record<string, unknown> | null;
  completion_times: Record<string, unknown> | null;
  external_ids: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  technical_info: Record<string, unknown> | null;
  data_source: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Romhack = {
  id: string;
  game_id: string;
  title: string;
  description: string | null;
  categories: string[] | null;
  version: string | null;
  file_url: string | null;
  file_size: number | null;
  patch_type: string | null;
  difficulty: string | null;
  hack_type: string | null;
  rom_size: string | null;
  required_rom: Record<string, unknown> | null;
  features: string[] | null;
  changelog: string | null;
  credits: string | null;
  tags: string[] | null;
  compatibility: Record<string, unknown> | null;
  thumbnail: string | null;
  screenshots: string[] | null;
  video_url: string | null;
  downloads: number;
  rating: number;
  release_date: string | null;
  is_public: boolean;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Translation = {
  id: string;
  game_id: string;
  title: string;
  description: string | null;
  categories: string[] | null;
  version: string | null;
  file_url: string | null;
  file_size: number | null;
  patch_type: string | null;
  difficulty: string | null;
  hack_type: string | null;
  rom_size: string | null;
  required_rom: Record<string, unknown> | null;
  features: string[] | null;
  changelog: string | null;
  credits: string | null;
  tags: string[] | null;
  compatibility: Record<string, unknown> | null;
  thumbnail: string | null;
  screenshots: string[] | null;
  video_url: string | null;
  downloads: number;
  rating: number;
  release_date: string | null;
  language: string | null;
  source_language: string | null;
  completion_percentage: number | null;
  translation_type: string | null;
  quality_rating: Record<string, unknown> | null;
  is_public: boolean;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Document = {
  id: string;
  game_id: string | null;
  title: string;
  description: string | null;
  category: string | null;
  page_count: number | null;
  file_format: string | null;
  language: string | null;
  file_url: string | null;
  thumbnail: string | null;
  screenshots: string[] | null;
  tags: string[] | null;
  downloads: number;
  rating: number;
  is_public: boolean;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Tool = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  supported_platforms: string[] | null;
  supported_file_types: string[] | null;
  requirements: Record<string, unknown> | null;
  license: string | null;
  source_code_url: string | null;
  documentation_url: string | null;
  version: string | null;
  file_url: string | null;
  file_size: number | null;
  thumbnail: string | null;
  screenshots: string[] | null;
  tags: string[] | null;
  downloads: number;
  rating: number;
  is_public: boolean;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Article = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  category: string | null;
  tags: string[] | null;
  cover_url: string | null;
  featured_items: Record<string, unknown> | null;
  views: number;
  author: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Review = {
  id: string;
  user_id: string;
  subject_type: SubjectType;
  subject_id: string;
  rating: number;
  comment: string | null;
  helpful: number;
  created_at: string;
};

export type Favorite = {
  user_id: string;
  subject_type: SubjectType;
  subject_id: string;
  created_at: string;
};

export type DownloadEvent = {
  id: string;
  subject_type: SubjectType;
  subject_id: string;
  created_at: string;
};

export type ApiKey = {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  permissions: string[] | null;
  is_active: boolean;
  usage_count: number;
  last_used: string | null;
  created_at: string;
};

export type SyncState = {
  id: string;
  source: string;
  entity: string;
  cursor: string | null;
  status: string;
  last_sync_at: string | null;
  items_processed: number;
  error_message: string | null;
  updated_at: string;
};

export type IdMap = {
  id: string;
  romvault_id: string | null;
  source: string;
  entity: string;
  external_id: string;
  confidence: number | null;
  match_type: string | null;
  created_at: string;
};

// ── Helpers para construir a forma que o supabase-js espera ────────────────
type Insert<T, Optional extends keyof T> = Omit<T, Optional> &
  Partial<Pick<T, Optional>>;

interface TableDef<R, I, U> {
  Row: R;
  Insert: I;
  Update: U;
  Relationships: [];
}

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<
        Profile,
        Insert<
          Profile,
          'username' | 'avatar_url' | 'bio' | 'is_admin' | 'created_at' | 'updated_at'
        >,
        Partial<Profile>
      >;
      games: TableDef<
        Game,
        Insert<
          Game,
          | 'id'
          | 'igdb_id'
          | 'alt_title'
          | 'developer'
          | 'publishers'
          | 'release_date'
          | 'genres'
          | 'platforms'
          | 'franchise'
          | 'description'
          | 'cover_url'
          | 'thumbnail'
          | 'screenshots'
          | 'video_url'
          | 'game_modes'
          | 'features'
          | 'themes'
          | 'age_rating'
          | 'age_rating_details'
          | 'regional_titles'
          | 'resources'
          | 'completion_times'
          | 'external_ids'
          | 'metadata'
          | 'technical_info'
          | 'data_source'
          | 'created_by'
          | 'created_at'
          | 'updated_at'
        >,
        Partial<Game>
      >;
      romhacks: TableDef<
        Romhack,
        Insert<
          Romhack,
          | 'id'
          | 'description'
          | 'categories'
          | 'version'
          | 'file_url'
          | 'file_size'
          | 'patch_type'
          | 'difficulty'
          | 'hack_type'
          | 'rom_size'
          | 'required_rom'
          | 'features'
          | 'changelog'
          | 'credits'
          | 'tags'
          | 'compatibility'
          | 'thumbnail'
          | 'screenshots'
          | 'video_url'
          | 'downloads'
          | 'rating'
          | 'release_date'
          | 'is_public'
          | 'submitted_by'
          | 'created_at'
          | 'updated_at'
        >,
        Partial<Romhack>
      >;
      translations: TableDef<
        Translation,
        Insert<
          Translation,
          | 'id'
          | 'description'
          | 'categories'
          | 'version'
          | 'file_url'
          | 'file_size'
          | 'patch_type'
          | 'difficulty'
          | 'hack_type'
          | 'rom_size'
          | 'required_rom'
          | 'features'
          | 'changelog'
          | 'credits'
          | 'tags'
          | 'compatibility'
          | 'thumbnail'
          | 'screenshots'
          | 'video_url'
          | 'downloads'
          | 'rating'
          | 'release_date'
          | 'language'
          | 'source_language'
          | 'completion_percentage'
          | 'translation_type'
          | 'quality_rating'
          | 'is_public'
          | 'submitted_by'
          | 'created_at'
          | 'updated_at'
        >,
        Partial<Translation>
      >;
      documents: TableDef<
        Document,
        Insert<
          Document,
          | 'id'
          | 'game_id'
          | 'description'
          | 'category'
          | 'page_count'
          | 'file_format'
          | 'language'
          | 'file_url'
          | 'thumbnail'
          | 'screenshots'
          | 'tags'
          | 'downloads'
          | 'rating'
          | 'is_public'
          | 'submitted_by'
          | 'created_at'
          | 'updated_at'
        >,
        Partial<Document>
      >;
      tools: TableDef<
        Tool,
        Insert<
          Tool,
          | 'id'
          | 'description'
          | 'category'
          | 'supported_platforms'
          | 'supported_file_types'
          | 'requirements'
          | 'license'
          | 'source_code_url'
          | 'documentation_url'
          | 'version'
          | 'file_url'
          | 'file_size'
          | 'thumbnail'
          | 'screenshots'
          | 'tags'
          | 'downloads'
          | 'rating'
          | 'is_public'
          | 'submitted_by'
          | 'created_at'
          | 'updated_at'
        >,
        Partial<Tool>
      >;
      articles: TableDef<
        Article,
        Insert<
          Article,
          | 'id'
          | 'excerpt'
          | 'content'
          | 'category'
          | 'tags'
          | 'cover_url'
          | 'featured_items'
          | 'views'
          | 'author'
          | 'published_at'
          | 'created_at'
          | 'updated_at'
        >,
        Partial<Article>
      >;
      reviews: TableDef<
        Review,
        Insert<Review, 'id' | 'comment' | 'helpful' | 'created_at'>,
        Partial<Review>
      >;
      favorites: TableDef<
        Favorite,
        Insert<Favorite, 'created_at'>,
        Partial<Favorite>
      >;
      download_events: TableDef<
        DownloadEvent,
        Insert<DownloadEvent, 'id' | 'created_at'>,
        Partial<DownloadEvent>
      >;
      api_keys: TableDef<
        ApiKey,
        Insert<
          ApiKey,
          'id' | 'permissions' | 'is_active' | 'usage_count' | 'last_used' | 'created_at'
        >,
        Partial<ApiKey>
      >;
      sync_state: TableDef<
        SyncState,
        Insert<
          SyncState,
          | 'id'
          | 'cursor'
          | 'status'
          | 'last_sync_at'
          | 'items_processed'
          | 'error_message'
          | 'updated_at'
        >,
        Partial<SyncState>
      >;
      id_map: TableDef<
        IdMap,
        Insert<IdMap, 'id' | 'romvault_id' | 'confidence' | 'match_type' | 'created_at'>,
        Partial<IdMap>
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
