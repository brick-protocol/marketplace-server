import { PublicKey, ComputeBudgetProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { createPayInstruction, getMintData, getPriorityFee } from "../solana";
import { Elysia, t } from "elysia";
import { config } from "../config";
import { parse } from "uuid";
import { PAYMENT_PROGRAM_PK } from "../constants";
import { supabase } from "../supabase";
import BN from "bn.js";

export type PayTransactionParams = {
  signer: string,
  product: string, 
  quantity: number,
}
  
export const RegisterBuySchema = t.Object({
  signer: t.String(),
  product: t.String(),
  quantity: t.Number(),
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

      if (error) {
        console.error('Error fetching product:', error.message);
        throw new Error('Product does not exist');
      }

      const signer = new PublicKey(body.signer);
      const productId = parse(product.id);
      const marketplaceId = parse(product.market);
      const [index] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("index", "utf-8"),
          marketplaceId,
          productId
        ],
        PAYMENT_PROGRAM_PK
      );
      const mint = new PublicKey(product.currency);
      const accounts = {
        signer,
        mint,
        buyerVault: getAssociatedTokenAddressSync(mint, signer),
        sellerVault: getAssociatedTokenAddressSync(mint, new PublicKey(product.seller)),
        index
      };
      const { decimals } = await getMintData(product.currency);
      const quantity = new BN(body.quantity);
      const price = new BN(product.price);
      const args = {
        amount: quantity.mul(price),
        decimals
      };
      const paymentIx = createPayInstruction(accounts, args);
      const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1400000,
      });
      const microLamports = await getPriorityFee(config.RPC) || 5000;
      const computePriceIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports });

      const blockhash = (await config.RPC.getLatestBlockhash('finalized')).blockhash;
      const messageV0 = new TransactionMessage({
        payerKey: accounts.signer,
        recentBlockhash: blockhash,
        instructions: [computeBudgetIx, computePriceIx, paymentIx],
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);
      const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
      
      return new Response(JSON.stringify({ message: serializedTransaction }))
    } catch (e: any) {
      console.log(e.message) 
      return new Response(JSON.stringify({ message: 'error', error: e.message }))
    }
  }, { body: RegisterBuySchema })

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
      let txSendAttempts = 1;

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