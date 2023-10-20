import { transactionBuilder, DirectPayInstructionAccounts } from "../../../../../Developer/sdk/dist";
import { Connection, PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { config } from "../../config";
import { PRODUCT_MANAGER_ID_PK } from "../../constants";
import { parse } from "uuid";
import BN from 'bn.js'

type RegisterBuyParams = {
    signer: string
    seller: string
    paymentMint: string
    productId: string
    amount: number
}

export async function registerBuy(params: RegisterBuyParams) {
    console.log('registerBuy starts');

    try {
        if (!config.RPC) {
            return new Response('Error: Server configuration missing', { status: 500 });
        }

        if (!params.signer || !params.seller || !params.paymentMint || !params.productId || !params.paymentMint || !params.amount) {
            return new Response('Error: Missing required information', { status: 500 });
        }

        const connection = new Connection(config.RPC);

        const [product] = PublicKey.findProgramAddressSync(
            [Buffer.from('product'), parse(params.productId)],
            PRODUCT_MANAGER_ID_PK
        );

        const accounts: DirectPayInstructionAccounts = {
            signer: new PublicKey(params.signer),
            seller: new PublicKey(params.seller),
            product,
            from: getAssociatedTokenAddressSync(new PublicKey(params.paymentMint), new PublicKey(params.signer)),
            to: getAssociatedTokenAddressSync(new PublicKey(params.paymentMint), new PublicKey(params.seller)),
            paymentMint: new PublicKey(params.paymentMint),
            rent: SYSVAR_RENT_PUBKEY,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        };

        const parsedParams = new BN(params.amount);
        const transaction = await transactionBuilder.DirectPay(connection, accounts, parsedParams);
        const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
        console.log('Serialized transaction ', serializedTransaction);

        return new Response(JSON.stringify({ transaction: serializedTransaction }), { status: 200, headers: { 'Content-Type': 'application/json' }});
    } catch (error) {
        console.error(error);
        return new Response('Internal Server Error', { status: 500 });
    }
}
