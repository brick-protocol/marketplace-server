import { Product, AccountType, createRegisterBuyTransaction } from "brick-protocol";
import { ACCOUNTS_DATA_LAYOUT } from "../../utils/layout/accounts";
import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "../../config";

type RegisterBuyParams = {
    signer: string,
    marketplace: string, 
    product: string, 
    paymentMint: string, 
    seller: string, 
    marketplaceAuth: string, 
    params: {
        amount: number,
        rewardsActive: boolean,
    }
}

export async function registerBuy(params: RegisterBuyParams) {
    console.log('registerBuy starts');

    try {
        if (!config.RPC || !config.MESSAGES_KEY || !config.INDEXER_API) {
            return new Response('Error: Server configuration missing', { status: 500 });
        }

        if (!params.signer || !params.marketplace || !params.product || !params.paymentMint || !params.seller || !params.marketplaceAuth || !params.params) {
            return new Response('Error: Missing required information', { status: 500 });
        }

        const connection = new Connection(config.RPC);
        const accountInfo = await connection.getAccountInfo(new PublicKey(params.product));
        const productInfo = ACCOUNTS_DATA_LAYOUT[AccountType.Product].deserialize(accountInfo?.data)[0] as Product

        // guardar en firebase 'invoice' info

        const accounts = {
            signer: new PublicKey(params.signer),
            marketplace: new PublicKey(params.marketplace),
            product: new PublicKey(params.product),
            paymentMint: new PublicKey(params.paymentMint),
            seller: new PublicKey(params.seller),
            marketplaceAuth: new PublicKey(params.marketplaceAuth),
            merkleTree: new PublicKey(productInfo.merkleTree),
        };

        const parsedParams = {
            rewardsActive: params.params.rewardsActive,
            amount: Number(params.params.amount),
        };

        const transaction = await createRegisterBuyTransaction (connection, accounts, parsedParams);
        const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64')
        console.log('Serialized transaction ', serializedTransaction)

        return new Response(JSON.stringify({ transaction: serializedTransaction }), { status: 200, headers: { 'Content-Type': 'application/json' }});
    } catch (error) {
        console.error(error);
        return new Response('Internal Server Error', { status: 500 });
    }
}
