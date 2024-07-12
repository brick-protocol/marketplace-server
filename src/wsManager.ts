import { AccountLayout, getAssociatedTokenAddressSync, transferCheckedInstructionData } from "@solana/spl-token";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { supabase } from "./supabase";
import { WebSocket } from 'ws'
import BigNumber from "bignumber.js";
import { config } from "./config";
import { TEN, APP_REFERENCE } from "./constants";

// NOTE: NOT USED ANYMORE - SAVED FOR FUTURE DEVELOPMENT
// Replaced by sendTransaction http endpoint where is saved the payment and parsed the transaction
interface WebSocketManagerConfig {
    url: string;
    apiKey: string;
    account: string;
}

class WebSocketManager {
    private ws: WebSocket;

    constructor(config: WebSocketManagerConfig) {
        this.ws = new WebSocket(`${config.url}?api-key=${config.apiKey}`);
        this.start(config.account);
    }

    private start(account: string) {
        this.ws.addEventListener("open", () => {
            this.sendRequest(account);
            this.addListeners();
        });
    }

    private addListeners() {
        this.ws.addEventListener("message", ({ data }: any) => {
            // this is async, handle better?
            this.onMessage(data);
        });

        this.ws.addEventListener("error", (error: any) => {
            this.onError(error);
        });

        this.ws.addEventListener("close", ({ code, reason }: any) => {
            console.log(code, reason);
            this.onClose();
        });
    }

    private async onMessage(data: any) {
        const message = data.toString();
        try {
            const { id, params } = JSON.parse(message);
            if (id) console.log('Websocket communication open');

            if (params) {
                const base64Transaction = params.result.transaction.transaction[0];
                const transactionBuffer = Buffer.from(base64Transaction, 'base64');
                const transaction = VersionedTransaction.deserialize(transactionBuffer);
                const instructions = transaction.message.compiledInstructions;
                const payInstruction = instructions[instructions.length - 1];
                const { amount } = transferCheckedInstructionData.decode(payInstruction.data);
                const [source, mint, destination, owner, txProductReference, txAppReference] = payInstruction.accountKeyIndexes.map(index => 
                    transaction.message.staticAccountKeys[index].toBase58(),
                );

                const { data: product, error } = await supabase
                    .from('products')
                    .select('*')
                    .eq('solana_index', txProductReference)
                    .single();
          
                if (error) {
                    console.error('Error fetching product:', error.message);
                    throw new Error('Product does not exist');
                }
                if (!product) throw new Error('Product does not exist');

                const sellerATA = await config.RPC.getAccountInfo(new PublicKey(destination), 'confirmed');
                if (!sellerATA) throw new Error('error fetching ata info');
              
                const decodedSellerATA = AccountLayout.decode(sellerATA.data);
                const seller = decodedSellerATA.owner.toBase58();
                const signer = owner;
                const price = BigNumber(product.price).times(TEN.pow(product.currency)).integerValue(BigNumber.ROUND_FLOOR);
              
                if (!BigNumber(amount.toString(16), 16).mod(price).isEqualTo(0)) throw new Error('amount is not a multiple of price');
                if (APP_REFERENCE.toBase58() !== txAppReference) throw new Error('wrong app reference');
                if (seller !== product.seller) throw new Error('wrong seller');
              
                const parsedPayment = {
                    signature: params.result.signature,
                    product: product.id,
                    signer,
                    seller,
                    currency: mint,
                    total_paid: amount.toString(16),
                    quantity: (BigInt(amount) / BigInt(product.price)).toString(16),
                    product_price: product.price,
                    timestamp: new Date().toISOString(),
                };
                const { error: insertError } = await supabase
                    .from('payments')
                    .insert(parsedPayment);

                console.log(insertError);
                console.log('Payment registered:', parsedPayment);

                return new Response(JSON.stringify(data));
            }

        } catch (e) {
            console.error('Failed to parse JSON:', e);
        }
    }

    private onError(err: Error) {
        console.error('WebSocket error:', err);
    }

    private onClose() {
        console.log('WebSocket is closed');
        this.reconnect();
    }

    private sendRequest(account: string) {
        const request = {
            jsonrpc: "2.0",
            id: 420,
            method: "transactionSubscribe",
            params: [
                {
                    accountInclude: [account]
                },
                {
                    commitment: "confirmed",
                    encoding: "base64",
                    transactionDetails: "full",
                    showRewards: true,
                    maxSupportedTransactionVersion: 0
                }
            ]
        };
        this.ws.send(JSON.stringify(request));
    }

    private reconnect() {
        setTimeout(() => {
            this.ws = new WebSocket(this.ws.url);
            this.start(this.ws.url.split('accountInclude=')[1]);
        }, 5000);
    }
}

export default WebSocketManager;