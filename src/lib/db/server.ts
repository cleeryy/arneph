import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          cover_path?: string | null;
          visibility?: SectionVisibility;
          settings?: Record<string, unknown>;
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
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type SupabaseServerClient = SupabaseClient<Database>;

let supabaseClient: SupabaseServerClient | null = null;

function initSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "[db/server] Variables d'environnement manquantes : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEY) doivent être définies.",
    );
  }

  /**
   * Client Supabase SERVICE ROLE — SÉCURITÉ.
   * `import "server-only"` fait échouer la compilation si ce module est importé
   * depuis un Client Component. Le guardrail `grep -rn "SERVICE_ROLE" src/` doit
   * ne matcher QUE ce fichier (et .env.local, hors src/).
   */
  supabaseClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseClient;
}

/**
 * Client Supabase SERVICE ROLE — SÉCURITÉ.
 * `import "server-only"` fait échouer la compilation si ce module est importé
 * depuis un Client Component. Le guardrail `grep -rn "SERVICE_ROLE" src/` doit
 * ne matcher QUE ce fichier (et .env.local, hors src/).
 */
export function getSupabaseServerClient(): SupabaseServerClient {
  return initSupabaseClient();
}

export const supabase = new Proxy({} as SupabaseServerClient, {
  get(_target, prop: PropertyKey) {
    const client = initSupabaseClient();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
}) as SupabaseServerClient;
