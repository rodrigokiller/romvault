export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used: string | null
          name: string
          permissions: string[] | null
          usage_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used?: string | null
          name: string
          permissions?: string[] | null
          usage_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used?: string | null
          name?: string
          permissions?: string[] | null
          usage_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          author: string | null
          category: string | null
          content: string | null
          cover_url: string | null
          created_at: string
          excerpt: string | null
          featured_items: Json | null
          id: string
          published_at: string | null
          slug: string
          tags: string[] | null
          title: string
          updated_at: string
          views: number
        }
        Insert: {
          author?: string | null
          category?: string | null
          content?: string | null
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          featured_items?: Json | null
          id?: string
          published_at?: string | null
          slug: string
          tags?: string[] | null
          title: string
          updated_at?: string
          views?: number
        }
        Update: {
          author?: string | null
          category?: string | null
          content?: string | null
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          featured_items?: Json | null
          id?: string
          published_at?: string | null
          slug?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "articles_author_fkey"
            columns: ["author"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          downloads: number
          file_format: string | null
          file_url: string | null
          game_id: string | null
          id: string
          is_public: boolean
          language: string | null
          page_count: number | null
          rating: number
          screenshots: string[] | null
          submitted_by: string | null
          tags: string[] | null
          thumbnail: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          downloads?: number
          file_format?: string | null
          file_url?: string | null
          game_id?: string | null
          id?: string
          is_public?: boolean
          language?: string | null
          page_count?: number | null
          rating?: number
          screenshots?: string[] | null
          submitted_by?: string | null
          tags?: string[] | null
          thumbnail?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          downloads?: number
          file_format?: string | null
          file_url?: string | null
          game_id?: string | null
          id?: string
          is_public?: boolean
          language?: string | null
          page_count?: number | null
          rating?: number
          screenshots?: string[] | null
          submitted_by?: string | null
          tags?: string[] | null
          thumbnail?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      download_events: {
        Row: {
          created_at: string
          id: string
          subject_id: string
          subject_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          subject_id: string
          subject_type: string
        }
        Update: {
          created_at?: string
          id?: string
          subject_id?: string
          subject_type?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          subject_id: string
          subject_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          subject_id: string
          subject_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          subject_id?: string
          subject_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          age_rating: string | null
          age_rating_details: string | null
          alt_title: string | null
          completion_times: Json | null
          cover_url: string | null
          created_at: string
          created_by: string | null
          data_source: string | null
          description: string | null
          developer: string | null
          external_ids: Json | null
          features: string[] | null
          franchise: string | null
          game_modes: string[] | null
          genres: string[] | null
          id: string
          igdb_id: number | null
          metadata: Json | null
          platforms: string[] | null
          publishers: string[] | null
          regional_titles: Json | null
          release_date: string | null
          resources: Json | null
          screenshots: string[] | null
          slug: string
          technical_info: Json | null
          themes: string[] | null
          thumbnail: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          age_rating?: string | null
          age_rating_details?: string | null
          alt_title?: string | null
          completion_times?: Json | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          description?: string | null
          developer?: string | null
          external_ids?: Json | null
          features?: string[] | null
          franchise?: string | null
          game_modes?: string[] | null
          genres?: string[] | null
          id?: string
          igdb_id?: number | null
          metadata?: Json | null
          platforms?: string[] | null
          publishers?: string[] | null
          regional_titles?: Json | null
          release_date?: string | null
          resources?: Json | null
          screenshots?: string[] | null
          slug: string
          technical_info?: Json | null
          themes?: string[] | null
          thumbnail?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          age_rating?: string | null
          age_rating_details?: string | null
          alt_title?: string | null
          completion_times?: Json | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          description?: string | null
          developer?: string | null
          external_ids?: Json | null
          features?: string[] | null
          franchise?: string | null
          game_modes?: string[] | null
          genres?: string[] | null
          id?: string
          igdb_id?: number | null
          metadata?: Json | null
          platforms?: string[] | null
          publishers?: string[] | null
          regional_titles?: Json | null
          release_date?: string | null
          resources?: Json | null
          screenshots?: string[] | null
          slug?: string
          technical_info?: Json | null
          themes?: string[] | null
          thumbnail?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      id_map: {
        Row: {
          confidence: number | null
          created_at: string
          entity: string
          external_id: string
          id: string
          match_type: string | null
          romvault_id: string | null
          source: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          entity: string
          external_id: string
          id?: string
          match_type?: string | null
          romvault_id?: string | null
          source: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          entity?: string
          external_id?: string
          id?: string
          match_type?: string | null
          romvault_id?: string | null
          source?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          id: string
          is_admin: boolean
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id: string
          is_admin?: boolean
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          is_admin?: boolean
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          helpful: number
          id: string
          rating: number
          subject_id: string
          subject_type: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          helpful?: number
          id?: string
          rating: number
          subject_id: string
          subject_type: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          helpful?: number
          id?: string
          rating?: number
          subject_id?: string
          subject_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      romhacks: {
        Row: {
          categories: string[] | null
          changelog: string | null
          compatibility: Json | null
          created_at: string
          credits: string | null
          description: string | null
          difficulty: string | null
          downloads: number
          features: string[] | null
          file_size: number | null
          file_url: string | null
          game_id: string
          hack_type: string | null
          id: string
          is_public: boolean
          patch_type: string | null
          rating: number
          release_date: string | null
          required_rom: Json | null
          rom_size: string | null
          screenshots: string[] | null
          submitted_by: string | null
          tags: string[] | null
          thumbnail: string | null
          title: string
          updated_at: string
          version: string | null
          video_url: string | null
        }
        Insert: {
          categories?: string[] | null
          changelog?: string | null
          compatibility?: Json | null
          created_at?: string
          credits?: string | null
          description?: string | null
          difficulty?: string | null
          downloads?: number
          features?: string[] | null
          file_size?: number | null
          file_url?: string | null
          game_id: string
          hack_type?: string | null
          id?: string
          is_public?: boolean
          patch_type?: string | null
          rating?: number
          release_date?: string | null
          required_rom?: Json | null
          rom_size?: string | null
          screenshots?: string[] | null
          submitted_by?: string | null
          tags?: string[] | null
          thumbnail?: string | null
          title: string
          updated_at?: string
          version?: string | null
          video_url?: string | null
        }
        Update: {
          categories?: string[] | null
          changelog?: string | null
          compatibility?: Json | null
          created_at?: string
          credits?: string | null
          description?: string | null
          difficulty?: string | null
          downloads?: number
          features?: string[] | null
          file_size?: number | null
          file_url?: string | null
          game_id?: string
          hack_type?: string | null
          id?: string
          is_public?: boolean
          patch_type?: string | null
          rating?: number
          release_date?: string | null
          required_rom?: Json | null
          rom_size?: string | null
          screenshots?: string[] | null
          submitted_by?: string | null
          tags?: string[] | null
          thumbnail?: string | null
          title?: string
          updated_at?: string
          version?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "romhacks_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "romhacks_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_state: {
        Row: {
          cursor: string | null
          entity: string
          error_message: string | null
          id: string
          items_processed: number
          last_sync_at: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          cursor?: string | null
          entity: string
          error_message?: string | null
          id?: string
          items_processed?: number
          last_sync_at?: string | null
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          cursor?: string | null
          entity?: string
          error_message?: string | null
          id?: string
          items_processed?: number
          last_sync_at?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tools: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          documentation_url: string | null
          downloads: number
          file_size: number | null
          file_url: string | null
          id: string
          is_public: boolean
          license: string | null
          rating: number
          requirements: Json | null
          screenshots: string[] | null
          source_code_url: string | null
          submitted_by: string | null
          supported_file_types: string[] | null
          supported_platforms: string[] | null
          tags: string[] | null
          thumbnail: string | null
          title: string
          updated_at: string
          version: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          documentation_url?: string | null
          downloads?: number
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_public?: boolean
          license?: string | null
          rating?: number
          requirements?: Json | null
          screenshots?: string[] | null
          source_code_url?: string | null
          submitted_by?: string | null
          supported_file_types?: string[] | null
          supported_platforms?: string[] | null
          tags?: string[] | null
          thumbnail?: string | null
          title: string
          updated_at?: string
          version?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          documentation_url?: string | null
          downloads?: number
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_public?: boolean
          license?: string | null
          rating?: number
          requirements?: Json | null
          screenshots?: string[] | null
          source_code_url?: string | null
          submitted_by?: string | null
          supported_file_types?: string[] | null
          supported_platforms?: string[] | null
          tags?: string[] | null
          thumbnail?: string | null
          title?: string
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tools_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      translations: {
        Row: {
          categories: string[] | null
          changelog: string | null
          compatibility: Json | null
          completion_percentage: number | null
          created_at: string
          credits: string | null
          description: string | null
          difficulty: string | null
          downloads: number
          features: string[] | null
          file_size: number | null
          file_url: string | null
          game_id: string
          hack_type: string | null
          id: string
          is_public: boolean
          language: string | null
          patch_type: string | null
          quality_rating: Json | null
          rating: number
          release_date: string | null
          required_rom: Json | null
          rom_size: string | null
          screenshots: string[] | null
          source_language: string | null
          submitted_by: string | null
          tags: string[] | null
          thumbnail: string | null
          title: string
          translation_type: string | null
          updated_at: string
          version: string | null
          video_url: string | null
        }
        Insert: {
          categories?: string[] | null
          changelog?: string | null
          compatibility?: Json | null
          completion_percentage?: number | null
          created_at?: string
          credits?: string | null
          description?: string | null
          difficulty?: string | null
          downloads?: number
          features?: string[] | null
          file_size?: number | null
          file_url?: string | null
          game_id: string
          hack_type?: string | null
          id?: string
          is_public?: boolean
          language?: string | null
          patch_type?: string | null
          quality_rating?: Json | null
          rating?: number
          release_date?: string | null
          required_rom?: Json | null
          rom_size?: string | null
          screenshots?: string[] | null
          source_language?: string | null
          submitted_by?: string | null
          tags?: string[] | null
          thumbnail?: string | null
          title: string
          translation_type?: string | null
          updated_at?: string
          version?: string | null
          video_url?: string | null
        }
        Update: {
          categories?: string[] | null
          changelog?: string | null
          compatibility?: Json | null
          completion_percentage?: number | null
          created_at?: string
          credits?: string | null
          description?: string | null
          difficulty?: string | null
          downloads?: number
          features?: string[] | null
          file_size?: number | null
          file_url?: string | null
          game_id?: string
          hack_type?: string | null
          id?: string
          is_public?: boolean
          language?: string | null
          patch_type?: string | null
          quality_rating?: Json | null
          rating?: number
          release_date?: string | null
          required_rom?: Json | null
          rom_size?: string | null
          screenshots?: string[] | null
          source_language?: string | null
          submitted_by?: string | null
          tags?: string[] | null
          thumbnail?: string | null
          title?: string
          translation_type?: string | null
          updated_at?: string
          version?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "translations_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "translations_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
