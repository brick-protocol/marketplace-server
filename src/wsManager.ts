import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PaymentLayout, paymentAccounts } from "./solana";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { supabase } from "./supabase";
import { WebSocket } from 'ws'

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

                const { amount } = PaymentLayout.decode(Buffer.from(payInstruction.data));
                const accountsKeys = transaction.message.getAccountKeys().staticAccountKeys.map(x => x.toString());
                const accounts = {
                    signer: accountsKeys[paymentAccounts.indexOf('signer')],
                    paymentMint: accountsKeys[paymentAccounts.indexOf('paymentMint')],
                    buyerVault: accountsKeys[paymentAccounts.indexOf('buyerVault')],
                    sellerVault: accountsKeys[paymentAccounts.indexOf('sellerVault')],
                    index: accountsKeys[paymentAccounts.indexOf('index')],
                };

                const { data: signerData } = await supabase
                    .from('users')
                    .select()
                    .eq('id', accounts.signer)
                    .single();

                if (!signerData) {
                    await supabase
                        .from('users')
                        .insert({ id: accounts.signer })
                        .select('id');
                }

                // save inconsistencies and notify that someone is trying to sploit the system
                // the entrypoint to the system is the solana program which is permisionless
                const { data: product, error } = await supabase
                    .from('products')
                    .select('*')
                    .eq('solana_index', accounts.index)
                    .single();
          
                if (error) {
                    console.error('Error fetching product:', error.message);
                    throw new Error('Product does not exist');
                }
                if (!product) throw new Error('Product does not exist');

                if (product.currency !== accounts.paymentMint) throw new Error('Invalid payment mint!!');

                const receiverVault = getAssociatedTokenAddressSync(new PublicKey(product.currency), new PublicKey(product.seller));
                if (receiverVault.toString() !== accounts.sellerVault) throw new Error('Invalid vault!!');

                const parsedPayment = {
                    signature: params.result.signature,
                    product: product.id,
                    signer: accounts.signer,
                    seller: product.seller,
                    currency: accounts.paymentMint,
                    total_paid: amount.toString(16),
                    quantity: (BigInt(amount) / BigInt(product.price)).toString(16),
                    product_price: product.price,
                    timestamp: new Date().toISOString(),
                };
                const { data, error: insertError } = await supabase
                    .from('payments')
                    .insert(parsedPayment);
    
                if (insertError) {
                    console.error('Error inserting product:', insertError.message);
                    return new Response(JSON.stringify({ error: insertError.message }), { status: 500 });
                }
                
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