// SUPPRIMER ce fichier quand @supabase/supabase-js sera installé (T10) :
// les vrais types du package remplaceront cette déclaration ambiante.
// Elle n'existe que pour que tsc passe pendant la période sans le package.
// (tsconfig `include: ["**/*.ts"]` ne matche pas les .d.ts — fichier en .ts
// global script, sans import/export, pour rester en contexte ambiant.)
declare module "@supabase/supabase-js" {
  export function createClient(url?: string, key?: string): {
    from: (...args: unknown[]) => any
    rpc: (...args: unknown[]) => any
    auth: Record<string, any>
    storage: Record<string, any>
  }
}
