import { PublicKey, VersionedTransaction, TransactionInstruction } from "@solana/web3.js";
import { getJupInstructions, preparePayIx, prepareTransaction } from "../solana";
import { supabase } from "../supabase";
import { Elysia, t } from "elysia";
import { config } from "../config";
import BN from "bn.js";

export type PayTransactionParams = {
  signer: string;
  product: string;
  quantity: number;
  currency: string;
}
  
export const PayTransactionSchema = t.Object({
  signer: t.String(),
  product: t.String(),
  quantity: t.Number(),
  currency: t.String(),
});

export type SendTransactionParams = {
  transaction: string,
}

export const SendTransactionSchema = t.Object({
  transaction: t.String(),
});

export const solanaManager = new Elysia({ prefix: '/solana' })
  .post('/payTransaction', async ({ body }: { body: PayTransactionParams }) => {
    try {
      const { data: product, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', body.product)
        .single();

      if (error || !product) {
        console.error('Error fetching product:', error.message);
        throw new Error('Product does not exist');
      }

      const quantity = new BN(body.quantity);
      const price = new BN(product.price, 'hex');
      const amount = quantity.mul(price);      

      const jupInstructions: TransactionInstruction[] = [];
      if (body.currency !== product.currency) {
        const jupIxns = await getJupInstructions(body.currency, product.currency, amount.toNumber(), body.signer);
        jupInstructions.push(...jupIxns);
      }

      const signer = new PublicKey(body.signer);
      const payIx = await preparePayIx(product, signer, amount);
      const serializedTransaction = prepareTransaction([...jupInstructions, payIx], signer);

      return new Response(JSON.stringify({ message: serializedTransaction }))
    } catch (e: any) {
      console.log(e.message) 
      return new Response(JSON.stringify({ message: 'error', error: e.message }))
    }
  }, { body: PayTransactionSchema })

  .post('/sendTransaction', async ({ body }: { body: SendTransactionParams }) => {
    const { transaction } = body;
    const transactionBuffer = Buffer.from(transaction, 'base64');
    const deserializedTransaction = VersionedTransaction.deserialize(transactionBuffer);

    try {
      const signature = await config.RPC.sendRawTransaction(deserializedTransaction.serialize(), {
        skipPreflight: true,
        maxRetries: 0,
      });

      let confirmedTx = null;

      console.log(`${new Date().toISOString()} Subscribing to transaction confirmation`);

      const confirmTransactionPromise = config.RPC.confirmTransaction(
        {
          signature,
          blockhash: deserializedTransaction.message.recentBlockhash,
          lastValidBlockHeight: (await config.RPC.getLatestBlockhash()).lastValidBlockHeight,
        },
        'confirmed'
      );

      console.log(`${new Date().toISOString()} Sending Transaction ${signature}`);
      
      while (!confirmedTx) {
        confirmedTx = await Promise.race([
          confirmTransactionPromise,
          new Promise((resolve) =>
            setTimeout(() => {
              resolve(null);
            }, 2000)
          ),
        ]);

        if (!confirmedTx) {
          await config.RPC.sendRawTransaction(deserializedTransaction.serialize(), {
            skipPreflight: true,
            maxRetries: 0,
          });
        }
      }

      if (!confirmedTx) {
        throw new Error("Transaction confirmation failed");
      }

      console.log(`${new Date().toISOString()} Transaction successful`);
      console.log(`${new Date().toISOString()} Explorer URL: https://explorer.solana.com/tx/${signature}`);

      return new Response(JSON.stringify({ message: 'success', signature }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });

    } catch (error: any) {
      console.error('Error sending transaction:', error);
      return new Response(JSON.stringify({ message: 'error', error: error.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  }, { body: SendTransactionSchema });