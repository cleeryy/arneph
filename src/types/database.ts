/**
 * Type `Database` du schéma Supabase public.
 *
 * Client-safe : ce fichier ne dépend ni de `server-only` ni d'un client
 * Supabase, il peut donc être importé par les Server Actions, les Server
 * Components et les utilitaires navigateur (`createBrowserClient`).
 */
import type {
  SectionConfig,
  SectionType,
  SectionVisibility,
} from "@/types/webtoon";

export type Database = {
  public: {
    Tables: {
      webtoons: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          cover_path: string | null;
          visibility: "draft" | "published";
          settings: Record<string, unknown>;
          owner_id: string | null;
          /** Verrou optimiste : incrémenté par `save_webtoon`. */
          revision: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          cover_path?: string | null;
          visibility?: SectionVisibility;
          settings?: Record<string, unknown>;
          owner_id?: string | null;
          revision?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          cover_path?: string | null;
          visibility?: SectionVisibility;
          settings?: Record<string, unknown>;
          owner_id?: string | null;
          revision?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sections: {
        Row: {
          id: string;
          webtoon_id: string;
          position: number;
          type: SectionType;
          config: SectionConfig;
          audio_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          webtoon_id: string;
          position?: number;
          type: SectionType;
          config: SectionConfig;
          audio_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          webtoon_id?: string;
          position?: number;
          type?: SectionType;
          config?: SectionConfig;
          audio_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      images: {
        Row: {
          id: string;
          section_id: string;
          webtoon_id: string;
          storage_path: string;
          width: number;
          height: number;
          mime_type: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          section_id: string;
          webtoon_id: string;
          storage_path: string;
          width: number;
          height: number;
          mime_type: string;
          position?: number;
          created_at?: string;
        };
        Update: {
          section_id?: string;
          webtoon_id?: string;
          storage_path?: string;
          width?: number;
          height?: number;
          mime_type?: string;
          position?: number;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      save_webtoon: {
        Args: {
          p_webtoon_id: string;
          p_owner_id: string;
          p_expected_revision: number | null;
          p_sections: unknown;
        };
        Returns: { revision: number } | null;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
