import { Connection } from "@solana/web3.js";

export const config = {
    HOST: Bun.env.HOST || '',
    PORT: Bun.env.PORT || '',
    RPC_KEY: Bun.env.RPC_KEY || '',
    RPC: new Connection(`https://mainnet.helius-rpc.com/?api-key=${Bun.env.RPC_KEY || ''}`),
    SUPABASE_PROJECT_ID: Bun.env.SUPABASE_PROJECT_ID || '',
    SUPABASE_SERVICE_ROLE: Bun.env.SUPABASE_SERVICE_ROLE || '',
    SUPABASE_ANON_KEY: Bun.env.SUPABASE_ANON_KEY || '',
    SUPABASE_JWT_SECRET: Bun.env.SUPABASE_JWT_SECRET || '',
};

const requiredEnvVariables = [
    'HOST',
    'PORT',
    'RPC_KEY',
    'SUPABASE_PROJECT_ID',
    'SUPABASE_SERVICE_ROLE',
    'SUPABASE_ANON_KEY',
    'SUPABASE_JWT_SECRET',
];

requiredEnvVariables.forEach(variable => {
    if (config[variable as keyof typeof config] === '') {
        throw new Error(`Missing required environment variable: ${variable}`);
    }
});
