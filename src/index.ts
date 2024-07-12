import { productManager } from './methods/productManager';
import { marketManager } from './methods/marketManager';
import { solanaManager } from './methods/solanaManager';
import { userManager } from "./methods/userManager";
import { PAYMENT_PROGRAM } from "./constants";
import { authManager } from './methods/auth';
import WebSocketManager from "./wsManager";
import { swagger } from '@elysiajs/swagger'
import { cors } from '@elysiajs/cors';
import { config } from "./config";
import { Elysia } from 'elysia';

// process all payments because is the program listener that receives all transactions on the system
const wsConfig = {
    url: 'wss://atlas-mainnet.helius-rpc.com',
    apiKey: config.RPC_KEY,
    account: PAYMENT_PROGRAM
};
new WebSocketManager(wsConfig);

new Elysia()
    .use(
        cors({
            origin: 'http://127.0.0.1:3000', // config.APP_URL
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Origin', 'X-Requested-With', 'Accept', 'Authorization'],
            credentials: true,
            preflight: true
        })
    )
    .use(swagger()) // API documentation
    .use(authManager) // handles sign in/sign out, validates signed messages from solana wallets to create/modify products/markets 
    .use(solanaManager) // builds payment transaction and sends them with retry logic
    .use(userManager) // maybe should be done on authManager?
    .use(marketManager) // product depends on market, the id is used to get the product index (when processing the tx we need to identify the product)
    .use(productManager) // CRUD Products -> to create products you need to sign in, data is public available
    .listen({ hostname: config.HOST, port: config.PORT }, ({ hostname, port }) => {
        console.log(`Running at http://${hostname}:${port}`)
    });