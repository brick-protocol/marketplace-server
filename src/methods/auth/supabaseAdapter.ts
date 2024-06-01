import { SupabaseClient } from "@supabase/supabase-js";
import { config } from "../../config";
import jwt from 'jsonwebtoken';

export type SignInAttempt = {
    nonce: string;
    ttl: string;
    address: string;
};

export interface Adapter {
    getNonce(address: string): Promise<any>;
    getTLL(address: string): Promise<number>;
    saveAttempt(attempt: SignInAttempt): Promise<void>;
    generateToken(address: string): string;
}

export const SupabaseAdapter = (supabase: SupabaseClient): Adapter => {
    return {
        getNonce: async (address: string) => {
            const { data, error } = await supabase
                .from('login_attempts')
                .select('nonce')
                .eq('address', address)
                .single();
    
            if (error) console.error(error);
            
    
            return data?.nonce;
        },
    
        getTLL: async (address: string) => {
            const { data, error } = await supabase
                .from('login_attempts')
                .select('ttl')
                .eq('address', address)
                .single();
    
            if (error) console.error(error);
    
            return data?.ttl;
        },

        saveAttempt: async (attempt) => {
            const { error } = await supabase
              .from('login_attempts')
              .upsert(attempt)
              .eq('address', attempt.address)
              .single();
      
            if (error) console.error(error);
        },
      
        generateToken: (pubkey: string) => {
            const payload = {
                sub: pubkey,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 60 * 60, // Token expiration set to 1 hour
            };
      
            return jwt.sign(payload, config.SUPABASE_JWT_SECRET);
        },
    }
} 