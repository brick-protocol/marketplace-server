import { createInitProductTransaction } from "brick-protocol";
import { Connection, PublicKey } from "@solana/web3.js";
import { createJsonResponse } from "../../utils";
import { config } from "../../config";

type InitProductParams = {
    signer: string,
    marketplace: string,
    paymentMint: string,
    params: {
        id: string,
        productPrice: number,
    }
}

export async function initProduct(params: InitProductParams) {
    console.log('initProduct starts');

    try {
        if (!config.RPC) {
            return createJsonResponse({ message: 'Error: Server rpc not configured' }, 500);
        }

        const connection = new Connection(config.RPC);
        const accounts = {
            signer: new PublicKey(params.signer),
            marketplace: new PublicKey(params.marketplace),
            paymentMint: new PublicKey(params.paymentMint)
        };

        const transaction = await createInitProductTransaction(connection, accounts, params.params);
        const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
        console.log('Serialized transaction ', serializedTransaction);

        return createJsonResponse({ message: serializedTransaction });
    } catch (error) {
        console.log(error);
        return createJsonResponse({ message: 'Internal Server Error' }, 500);
    }
}
