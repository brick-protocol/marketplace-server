import { createClient } from '@supabase/supabase-js'
import { config } from './config'
import { SupabaseAdapter } from './methods/auth/supabaseAdapter'

// ON DEPLOY: https://docs.vultr.com/how-to-install-supabase-on-ubuntu-20-04
//https://www.youtube.com/watch?v=dU7GwCOgvNY

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      login_attempts: {
        Row: {
          address: string
          nonce: string | null
          ttl: string | null
        }
        Insert: {
          address: string
          nonce?: string | null
          ttl?: string | null
        }
        Update: {
          address?: string
          nonce?: string | null
          ttl?: string | null
        }
        Relationships: []
      }
      markets: {
        Row: {
          id: string
          location: string | null
          name: string | null
          user: string
        }
        Insert: {
          id: string
          location?: string | null
          name?: string | null
          user: string
        }
        Update: {
          id?: string
          location?: string | null
          name?: string | null
          user?: string
        }
        Relationships: [
          {
            foreignKeyName: "markets_user_fkey"
            columns: ["user"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          currency: string
          in_amount: string | null
          in_currency: string | null
          product: string
          product_price: string
          quantity: string
          seller: string
          signature: string
          signer: string
          timestamp: string
          total_paid: string
        }
        Insert: {
          currency: string
          in_amount?: string | null
          in_currency?: string | null
          product: string
          product_price: string
          quantity: string
          seller: string
          signature: string
          signer: string
          timestamp: string
          total_paid: string
        }
        Update: {
          currency?: string
          in_amount?: string | null
          in_currency?: string | null
          product?: string
          product_price?: string
          quantity?: string
          seller?: string
          signature?: string
          signer?: string
          timestamp?: string
          total_paid?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_product_fkey"
            columns: ["product"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_seller_fkey"
            columns: ["seller"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_signer_fkey"
            columns: ["signer"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean | null
          currency: string
          description: string | null
          id: string
          image: string | null
          market: string
          metadata: Json | null
          name: string | null
          price: string
          seller: string
          solana_index: string
        }
        Insert: {
          active?: boolean | null
          currency: string
          description?: string | null
          id: string
          image?: string | null
          market: string
          metadata?: Json | null
          name?: string | null
          price: string
          seller: string
          solana_index: string
        }
        Update: {
          active?: boolean | null
          currency?: string
          description?: string | null
          id?: string
          image?: string | null
          market?: string
          metadata?: Json | null
          name?: string | null
          price?: string
          seller?: string
          solana_index?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_market_fkey"
            columns: ["market"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_seller_fkey"
            columns: ["seller"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          address: string | null
          avatar_url: string | null
          billing_address: Json | null
          full_name: string | null
          id: string
          last_auth: string | null
          last_auth_status: string | null
          nonce: string | null
          payment_method: Json | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          billing_address?: Json | null
          full_name?: string | null
          id: string
          last_auth?: string | null
          last_auth_status?: string | null
          nonce?: string | null
          payment_method?: Json | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          billing_address?: Json | null
          full_name?: string | null
          id?: string
          last_auth?: string | null
          last_auth_status?: string | null
          nonce?: string | null
          payment_method?: Json | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never
    
export const supabase = createClient<Database>(config.SUPABASE_PROJECT_ID, config.SUPABASE_SERVICE_ROLE)
export const supabaseAuthAdapter = SupabaseAdapter(supabase)