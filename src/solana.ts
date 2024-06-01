import { AccountMeta, Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { publicKey, struct, u32, u64, u8, array } from '@coral-xyz/borsh'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PAYMENT_PROGRAM_PK } from './constants';
import { config } from './config';
import BN from 'bn.js';

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
}

export const paymentAccounts = [
  'signer',
  'buyerVault',
  'sellerVault',
  'computeBudgetProgram',
  'paymentProgram',
  'paymentMint',
  'tokenProgram',
  'index',
]

export type PayInstructionAccounts = {
  signer: PublicKey
  mint: PublicKey
  buyerVault: PublicKey
  sellerVault: PublicKey
  tokenProgram?: PublicKey
  index: PublicKey
  anchorRemainingAccounts?: AccountMeta[]
}

export interface PaymentData {
  discriminator: number[];
  amount: BN;
  decimals: number;
}

export const PaymentLayout = struct<PaymentData>([
  array(u8(), 8, 'discriminator'),
  u64('amount'),
  u8('decimals'),
])

export function createPayInstruction(
  accounts: PayInstructionAccounts,
  args: Omit<PaymentData, 'discriminator'>,
) {
  const discriminator = [119, 18, 216, 65, 192, 117, 122, 220];
  const data = Buffer.alloc(PaymentLayout.span);
  PaymentLayout.encode({
    discriminator,
    amount: args.amount,
    decimals: args.decimals,
  }, data);

  const keys: AccountMeta[] = [
    {
      pubkey: accounts.signer,
      isWritable: true,
      isSigner: true,
    },
    {
      pubkey: accounts.mint,
      isWritable: false,
      isSigner: false,
    },
    {
      pubkey: accounts.buyerVault,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: accounts.sellerVault,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: accounts.tokenProgram ?? TOKEN_PROGRAM_ID,
      isWritable: false,
      isSigner: false,
    },
    {
      pubkey: accounts.index,
      isWritable: false,
      isSigner: false,
    },
  ]

  if (accounts.anchorRemainingAccounts != null) {
    for (const acc of accounts.anchorRemainingAccounts) {
      keys.push(acc)
    }
  }

  return new TransactionInstruction({
    programId: PAYMENT_PROGRAM_PK,
    keys,
    data,
  })
}

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
])

export async function getMintData(mint: string): Promise<Mint> {
  const response = await config.RPC.getAccountInfo(new PublicKey(mint))
  if (!response) throw new Error('Failed to get program accounts')

  return MintLayout.decode(response.data)
}