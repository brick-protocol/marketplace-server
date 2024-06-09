import { Json } from "./supabase";

export type Product = {
    active: boolean | null;
    currency: string;
    description: string | null;
    id: string;
    image: string | null;
    market: string;
    metadata: Json;
    name: string | null;
    price: string;
    seller: string;
    solana_index: string;
}