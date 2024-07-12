import { PublicKey, VersionedTransaction, TransactionInstruction } from "@solana/web3.js";
import { createSPLTokenInstruction, createSystemInstruction, getJupInstructions, getTransaction, validateTransfer } from "../solana";
import { supabase } from "../supabase";
import { Elysia, t } from "elysia";
import { config } from "../config";
import BigNumber from 'bignumber.js';
import { APP_REFERENCE } from "../constants";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

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
  productId: string,
  transaction: string,
}

export const SendTransactionSchema = t.Object({
  productId: t.String(),
  transaction: t.String(),
});

export const solanaManager = new Elysia({ prefix: '/solana' })
  .post('/createTransaction', async ({ body }: { body: PayTransactionParams }) => {
    try {
      const signer = new PublicKey(body.signer);
      const senderInfo = await config.RPC.getAccountInfo(signer);
      if (!senderInfo) {
        const message = 'Sender not found';
        console.error(message);
        return new Response(JSON.stringify({ error: message }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const { data: product, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', body.product)
        .single();

      if (error || !product) {
        const message = 'Error fetching product';
        console.error(message, error.message);
        return new Response(JSON.stringify({ error: message }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const quantity = new BigNumber(body.quantity);
      const price = new BigNumber(product.price, 16);
      const amount = quantity.multipliedBy(price);      

      const instuctions: TransactionInstruction[] = [];
      if (body.currency !== product.currency) {
        const jupIxns = await getJupInstructions(body.currency, product.currency, amount.toNumber(), body.signer);
        instuctions.push(...jupIxns);
      }

      const splToken = new PublicKey(product.currency);
      const recipient = new PublicKey(product.seller);
      const payInstruction = product.currency !== 'So11111111111111111111111111111111111111112'
        ? await createSPLTokenInstruction(recipient, amount, splToken, signer)
        : await createSystemInstruction(recipient, amount, signer, senderInfo);

      const [productReference] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("reference", "utf-8"),
          Buffer.from(product.id, "hex"),
        ],
        TOKEN_PROGRAM_ID
      );
      payInstruction.keys.push(
        { pubkey: productReference, isWritable: false, isSigner: false },
        { pubkey: APP_REFERENCE, isWritable: false, isSigner: false }
      );
      instuctions.push(payInstruction);

      const serializedTransaction = getTransaction(instuctions, signer);

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

      console.log(`${new Date().toISOString()} Transaction successful: https://explorer.solana.com/tx/${signature}`);

      await validateTransfer(signature, body.productId);

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