import { publicKey, struct, u32, u64, u8 } from '@coral-xyz/borsh'
import { APP_REFERENCE, TEN } from './constants';
import { config } from './config';
import BigNumber from 'bignumber.js';
import { supabase } from "./supabase";
import { 
  AccountInfo, 
  ComputeBudgetProgram, 
  LAMPORTS_PER_SOL, 
  PublicKey, 
  SystemProgram, 
  TransactionInstruction, 
  TransactionMessage, 
  VersionedTransaction 
} from '@solana/web3.js';
import { 
  AccountLayout,
  TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction, 
  getAccount, 
  getAssociatedTokenAddress, 
  transferCheckedInstructionData
} from '@solana/spl-token';
import bs58 from 'bs58';

export type Mint = {
  mintAuthorityOption: number
  mintAuthority: PublicKey
  supply: BigInt
  decimals: number
  isInitialized: boolean
  freezeAuthorityOption: number
  freezeAuthority: PublicKey
}

export const MintLayout = struct([
  u32('mintAuthorityOption'),
  publicKey('mintAuthority'),
  u64('supply'),
  u8('decimals'),
  u8('isInitialized'),
  u32('freezeAuthorityOption'),
  publicKey('freezeAuthority'),
]);

export async function getMintData(mint: PublicKey): Promise<Mint> {
  const response = await config.RPC.getAccountInfo(mint);
  if (!response) throw new Error('Failed to get program accounts');

  return MintLayout.decode(response.data);
}

export async function getJupInstructions(inputMint: string, outputMint: string, amount: number, signer: string) {
  const quoteResponse = await (
    await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}\
      &outputMint=${outputMint}\
      &amount=${amount}\
      &swapMode=ExactOut\
      &slippageBps=50`
    )
  ).json();

  return await (
    await fetch('https://quote-api.jup.ag/v6/swap-instructions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey: signer,
      })
    })
  ).json() as TransactionInstruction[];
}

export async function getInstructions(
  initialInstructions: TransactionInstruction[], 
  payerKey: PublicKey
): Promise<TransactionInstruction[]> {
  const instructions = [...initialInstructions];
  const simulatedComputeBudgetInstruction = ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 });
  const simulatedComputePriceInstruction = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 });
  instructions.unshift(simulatedComputeBudgetInstruction, simulatedComputePriceInstruction);

  const message = new TransactionMessage({
    payerKey,
    recentBlockhash: PublicKey.default.toString(),
    instructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(message);
  const rpcResponse = await config.RPC.simulateTransaction(transaction, {
    replaceRecentBlockhash: true,
    sigVerify: false,
  });

  const units = rpcResponse.value.unitsConsumed || 1400000;
  const microLamports = await getPriorityFee("HIGH", transaction) || 5000;
  const computePriceInstruction = ComputeBudgetProgram.setComputeUnitPrice({ microLamports });
  const computeBudgetInstruction = ComputeBudgetProgram.setComputeUnitLimit({ units });
  initialInstructions.unshift(computeBudgetInstruction, computePriceInstruction);
  
  return initialInstructions;
}

export async function createSystemInstruction(
  recipient: PublicKey,
  amount: BigNumber,
  sender: PublicKey,
  senderInfo: AccountInfo<Buffer>,
): Promise<TransactionInstruction> {
  if (!senderInfo.owner.equals(SystemProgram.programId)) throw new Error('sender owner invalid');
  if (senderInfo.executable) throw new Error('sender executable');

  // Check that the amount provided doesn't have greater precision than SOL
  if ((amount.decimalPlaces() ?? 0) > 9) throw new Error('amount decimals invalid');

  // Convert input decimal amount to integer lamports
  amount = amount.times(LAMPORTS_PER_SOL).integerValue(BigNumber.ROUND_FLOOR);

  // Check that the sender has enough lamports
  const lamports = amount.toNumber();
  if (lamports > senderInfo.lamports) throw new Error('insufficient funds');

  // Create an instruction to transfer native SOL
  return SystemProgram.transfer({
    fromPubkey: sender,
    toPubkey: recipient,
    lamports,
  });
}

export async function createSPLTokenInstruction(
  recipient: PublicKey,
  amount: BigNumber,
  splToken: PublicKey,
  sender: PublicKey,
): Promise<TransactionInstruction> {
  const { decimals } = await getMintData(splToken);
  // Convert input decimal amount to integer tokens according to the mint decimals
  amount = amount.times(TEN.pow(decimals)).integerValue(BigNumber.ROUND_FLOOR);

  // Get the sender's ATA and check that the account exists and can send tokens
  const senderATA = await getAssociatedTokenAddress(splToken, sender);
  const senderAccount = await getAccount(config.RPC, senderATA);
  if (!senderAccount.isInitialized) throw new Error('sender not initialized');
  if (senderAccount.isFrozen) throw new Error('sender frozen');

  // Get the recipient's ATA and check that the account exists and can receive tokens
  const recipientATA = await getAssociatedTokenAddress(splToken, recipient);
  const recipientAccount = await getAccount(config.RPC, recipientATA);
  if (!recipientAccount.isInitialized) throw new Error('recipient not initialized');
  if (recipientAccount.isFrozen) throw new Error('recipient frozen');

  // Check that the sender has enough tokens
  const tokens = BigInt(String(amount));
  if (tokens > senderAccount.amount) throw new Error('insufficient funds');

  // Create an instruction to transfer SPL tokens, asserting the mint and decimals match
  return createTransferCheckedInstruction(senderATA, splToken, recipientATA, sender, tokens, decimals);
}

export async function getTransaction(initialInstructions: TransactionInstruction[], payerKey: PublicKey) {
  const instructions = await getInstructions(initialInstructions, payerKey);
  const recentBlockhash = (await config.RPC.getLatestBlockhash('finalized')).blockhash;
  const messageV0 = new TransactionMessage({
    payerKey,
    recentBlockhash,
    instructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(messageV0);
  
  return Buffer.from(transaction.serialize()).toString('base64');
}

async function getPriorityFee(priorityLevel: string, transaction: VersionedTransaction) {
  const response = await fetch(config.RPC.rpcEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method: "getPriorityFeeEstimate",
      params: [
        {
          transaction: bs58.encode(transaction.serialize()),
          options: { priorityLevel },
        },
      ],
    }),
  });
  const data = await response.json() as any;
  return Number(data.result.priorityFeeEstimate);
}

export async function validateTransfer(signature: string, productId: string) {
  const response = await fetchTransaction(signature);
  const { message } = response.transaction;
  const versionedTransaction = new VersionedTransaction(message);
  const instructions = versionedTransaction.message.compiledInstructions;
  const transferInstruction = instructions.pop();
  if (!transferInstruction) throw new Error('missing transfer instruction');

  const { amount } = transferCheckedInstructionData.decode(transferInstruction.data);
  const [source, mint, destination, owner, txProductReference, txAppReference] = transferInstruction.accountKeyIndexes.map(index => 
      versionedTransaction.message.staticAccountKeys[index],
  );

  const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();
  if (error || !product) throw new Error('dataset free or error fetching it');

  const [productReference] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("reference", "utf-8"),
        Buffer.from(productId, "hex"),
      ],
      TOKEN_PROGRAM_ID
  );

  const sellerATA = await config.RPC.getAccountInfo(destination, 'confirmed');
  if (!sellerATA) throw new Error('error fetching ata info');

  const decodedSellerATA = AccountLayout.decode(sellerATA.data);
  const seller = decodedSellerATA.owner.toBase58();
  const signer = owner.toBase58();
  const price = BigNumber(product.price).times(TEN.pow(product.currency)).integerValue(BigNumber.ROUND_FLOOR);

  if (!BigNumber(amount.toString(16), 16).mod(price).isEqualTo(0)) throw new Error('amount is not a multiple of price');
  if (productReference.toBase58() !== txProductReference.toBase58()) throw new Error('wrong dataset reference');
  if (APP_REFERENCE.toBase58() !== txAppReference.toBase58()) throw new Error('wrong app reference');
  if (seller !== product.seller) throw new Error('wrong seller');

  const parsedPayment = {
      signature,
      product: productId,
      signer,
      seller,
      currency: mint.toBase58(),
      total_paid: amount.toString(16),
      quantity: (BigInt(amount) / BigInt(product.price)).toString(16),
      product_price: product.price,
      timestamp: new Date().toISOString(),
  };
  const { error: insertError } = await supabase
      .from('payments')
      .insert(parsedPayment);

  console.log(insertError);
}

async function fetchTransaction(signature: string) {
  const retryDelay = 400;
  const response = await config.RPC.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (response) {
      return response;
  } else {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return fetchTransaction(signature);
  }
}

/*
this should be other server/process, maybe a ws reading all blocks and storing on memory a estimate priority fee?
export async function getPriorityFee(connection: Connection): Promise<number | null> {
  const blockHeight = (await connection.getBlockHeight());
  const blockData = await connection.getBlock(blockHeight, { maxSupportedTransactionVersion: 0 });

  if (!blockData || !blockData.transactions) {
    return null;
  }

  const transactionsInfo = blockData.transactions
    .filter(tx => tx.meta && tx.meta.fee > 5000 && tx.meta.computeUnitsConsumed !== undefined && tx.meta.computeUnitsConsumed > 0)
    .map(tx => ({
      fee: tx.meta!.fee,
      computeUnitsConsumed: tx.meta!.computeUnitsConsumed!
    }));

  const priorityFees = transactionsInfo.map(txInfo => (txInfo.fee - 5000) / txInfo.computeUnitsConsumed);
  priorityFees.sort((a, b) => a - b);

  let medianPriorityFee = 0;
  if (priorityFees.length > 0) {
    const n = priorityFees.length;
    if (n % 2 === 0) {
      medianPriorityFee = (priorityFees[Math.floor(n / 2) - 1] + priorityFees[Math.floor(n / 2)]) / 2;
    } else {
      medianPriorityFee = priorityFees[Math.floor(n / 2)];
    }
  }

  return Math.round(medianPriorityFee * 10 ** 6);
}*/
