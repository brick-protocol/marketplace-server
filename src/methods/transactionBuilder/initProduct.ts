import { transactionBuilder, InitProductInstructionAccounts, InitProductInstructionArgs } from "../../../../../Developer/sdk/dist";
import { Connection, PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram } from "@solana/web3.js";
import { config } from "../../config";
import { parse } from "uuid";
import { PRODUCT_MANAGER_ID_PK } from "../../constants";

type InitProductParams = {
    signer: string,
    marketplace: string,
    paymentMint: string,
    id: string,
    productPrice: number,
}

export async function initProduct(params: InitProductParams) {
    console.log('initProduct starts');

    try {
        if (!config.RPC) {
            return new Response('Error: Missing required information', { status: 500 });
        }

        const connection = new Connection(config.RPC);
        const [product] = PublicKey.findProgramAddressSync(
            [
              Buffer.from("product", "utf-8"), 
              parse(params.id)
            ],
            PRODUCT_MANAGER_ID_PK
        );        
        const accounts: InitProductInstructionAccounts = {
            signer: new PublicKey(params.signer),
            product,
            paymentMint: new PublicKey(params.paymentMint),
            rent: SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
        };
        const args: InitProductInstructionArgs = {
            id: [...parse(params.id)],
            price: params.productPrice
        };

        const transaction = await transactionBuilder.InitProduct(
            connection, 
            accounts, 
            args
        );
        const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
        console.log('Serialized transaction ', serializedTransaction);

        return new Response(JSON.stringify({ transaction: serializedTransaction }), { status: 200, headers: { 'Content-Type': 'application/json' }});
    } catch (error) {
        console.log(error);
        return new Response('Internal Server Error', { status: 500 });
    }
}
