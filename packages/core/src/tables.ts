// Aliases de conveniencia derivados do schema gerado (database.types.ts).
// Ficam SEPARADOS do arquivo gerado de proposito: `npm run db:types` sobrescreve
// so o database.types.ts, entao estes aliases nunca sao perdidos numa regeracao.
import type { Database } from './database.types';

type Tables = Database['public']['Tables'];

// Linhas (o que vem do banco)
export type Game = Tables['games']['Row'];
export type Romhack = Tables['romhacks']['Row'];
export type Translation = Tables['translations']['Row'];
export type Document = Tables['documents']['Row'];
export type Tool = Tables['tools']['Row'];
export type Article = Tables['articles']['Row'];
export type Profile = Tables['profiles']['Row'];
export type Review = Tables['reviews']['Row'];
export type Favorite = Tables['favorites']['Row'];
export type ApiKey = Tables['api_keys']['Row'];

// Inserts (o que se manda pro banco ao criar)
export type GameInsert = Tables['games']['Insert'];
export type RomhackInsert = Tables['romhacks']['Insert'];
export type TranslationInsert = Tables['translations']['Insert'];
export type DocumentInsert = Tables['documents']['Insert'];
export type ToolInsert = Tables['tools']['Insert'];
export type ArticleInsert = Tables['articles']['Insert'];
export type ReviewInsert = Tables['reviews']['Insert'];
