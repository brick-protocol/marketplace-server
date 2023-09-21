import { BrickLayout, InstructionType, Marketplace, Product, Reward } from "../../../../../Developer/sdk/dist";
import { validateSignatureBody } from "../../requestSchema";
import { config } from "../../config";
import db from "../../utils/db";
import Elysia from "elysia";
import bs58 from "bs58";

export const validateTransactionRequest = (app: Elysia) =>
    app.post('/validateTransaction', async ({body, headers: { authorization }}) => {
        try {
            if (authorization !== `Authorization: Bearer ${config.WEBHOOK_AUTH}`) {
                console.log('Unauthorized request');
                return new Response('Unauthorized request', { status: 401 });
            }
        
            const asyncTasks = body.map(async (rawTxn) => {
                try {
                    const { transaction, blockTime } = rawTxn;
                    const length = transaction.message.instructions.length;
                    const instructionData = length === 2
                        ? transaction.message.instructions[1].data
                        : transaction.message.instructions[0].data;
                    const bufferData = Buffer.from(bs58.decode(instructionData));
                    const type = BrickLayout.getInstructionType(bufferData);
                    if (!type) return;
                    
                    const accounts: string[] = BrickLayout.accountLayoutMap[type];
                    const accountKeys = transaction.message.accountKeys;
                    const [context] = BrickLayout.dataLayoutMap[type].deserialize(instructionData);
                    const { ...result } = context;
                    
                    const commonEvent = {
                        type,
                        blockTime,
                        signer: accountKeys[accounts.indexOf('signer')],
                    };
                    switch (type) {
                        case InstructionType.RegisterBuy && InstructionType.RegisterBuyCnft && InstructionType.RegisterBuyFungible:
                            const purchase = {
                                ...commonEvent,
                                seller: accountKeys[accounts.indexOf('seller')],
                                product: accountKeys[accounts.indexOf('product')],
                                paymentMint: accountKeys[accounts.indexOf('paymentMint')],
                                buyerTransferVault: accountKeys[accounts.indexOf('buyerTransferVault')],
                                sellerTransferVault: accountKeys[accounts.indexOf('sellerTransferVault')],
                                units: result.params.amount,
                            };
                            const userDoc = await db.users.doc(purchase.signer).get();                
                            if (!userDoc.exists) await db.users.doc(purchase.signer).set({ address: purchase.signer });
                    
                            const buyTransactionPromises = [
                                db.events("registerBuy").add(purchase),
                                db.userPurchases(purchase.signer).add(purchase),
                                db.products.doc(purchase.product).collection("sales").add(purchase),
                            ];
                            const buyTransactionResults = await Promise.all(buyTransactionPromises);
                        
                            return buyTransactionResults[0].id;

                        case InstructionType.AcceptAccess:
                            return (await db.events("acceptAccess").add({
                                ...commonEvent,
                                receiver: accountKeys[accounts.indexOf('receiver')],
                                marketplace: accountKeys[accounts.indexOf('marketplace')],
                                request: accountKeys[accounts.indexOf('request')],
                                accessVault: accountKeys[accounts.indexOf('accessVault')],
                            })).id;

                        case InstructionType.AirdropAccess:
                            return (await db.events("airdropAccess").add({
                                ...commonEvent,
                                receiver: accountKeys[accounts.indexOf('receiver')],
                                marketplace: accountKeys[accounts.indexOf('marketplace')],
                                accessMint: accountKeys[accounts.indexOf('accessMint')],
                                accessVault: accountKeys[accounts.indexOf('accessVault')],
                            })).id;

                        case InstructionType.EditProduct:
                            const productData: Product = {
                                address: accountKeys[accounts.indexOf('product')],
                                authority: accountKeys[accounts.indexOf('signer')],
                                marketplace: accountKeys[accounts.indexOf('marketplace')],
                                productMint: accountKeys[accounts.indexOf('productMint')],
                                merkleTree: accountKeys[accounts.indexOf('merkleTree')],
                                sellerConfig: {
                                    paymentMint: accountKeys[accounts.indexOf('paymentMint')],
                                    productPrice: result.params.productPrice
                                },
                            };
                            await db.products.doc(accountKeys[accounts.indexOf('product')]).set(productData);
                            return productData.address;
                            
                        case InstructionType.EditMarketplace:
                            const mktDoc = await db.marketplace.doc(accountKeys[accounts.indexOf('marketplace')]).get();
                            const mktData = mktDoc.data();
                            const marketplaceObject: Marketplace = {
                                address: accountKeys[accounts.indexOf('marketplace')],
                                authority: accountKeys[accounts.indexOf('signer')],
                                tokenConfig: {
                                    transferable: result.params.transferable
                                },
                                permissionConfig: {
                                    accessMint: accountKeys[accounts.indexOf('accessMint')],
                                    permissionless: result.params.permissionless,
                                },
                                feesConfig: {
                                    discountMint: accountKeys[accounts.indexOf('discountMint')],
                                    fee: result.params.fee,
                                    feeReduction: result.params.feeReduction,
                                    feePayer: result.params.feePayer,
                                },
                                rewardsConfig: {
                                    rewardMint: accountKeys[accounts.indexOf('rewardMint')],
                                    bountyVaults: mktData?.rewardsConfig.bountyVaults || [accountKeys[accounts.indexOf('bountyVault')]],
                                    sellerReward: result.params.sellerReward,
                                    buyerReward: result.params.buyerReward,
                                    rewardsEnabled: result.params.rewardsEnabled
                                },
                            }
                            await db.marketplace.doc(accountKeys[accounts.indexOf('marketplace')]).set(marketplaceObject);
                            return marketplaceObject.address;
                            
                        case InstructionType.InitBounty:
                            const initBounty = {
                                ...commonEvent,
                                marketplace: accountKeys[accounts.indexOf('marketplace')],
                                rewardMint: accountKeys[accounts.indexOf('rewardMint')],
                                bountyVault: accountKeys[accounts.indexOf('bountyVault')],
                            };
                            const marketplaceDoc = await db.marketplace.doc(accountKeys[accounts.indexOf('marketplace')]).get();
                            const marketplaceData = marketplaceDoc.data();

                            if (marketplaceData) {
                                marketplaceData.rewardsConfig.bountyVaults.push(initBounty.bountyVault);
                                await Promise.all([
                                    db.events("initBounty").add(initBounty),
                                    db.marketplace.doc(accountKeys[accounts.indexOf('marketplace')]).set(marketplaceData),
                                ]);
                                                                          
                            }
                            return initBounty.bountyVault;

                        case InstructionType.InitMarketplace:
                            const marketplaceAccount: Marketplace = {
                                address: accountKeys[accounts.indexOf('marketplace')],
                                authority: accountKeys[accounts.indexOf('signer')],
                                tokenConfig: {
                                    transferable: result.params.transferable
                                },
                                permissionConfig: {
                                    accessMint: accountKeys[accounts.indexOf('accessMint')],
                                    permissionless: result.params.permissionless,
                                },
                                feesConfig: {
                                    discountMint: accountKeys[accounts.indexOf('discountMint')],
                                    fee: result.params.fee,
                                    feeReduction: result.params.feeReduction,
                                    feePayer: result.params.feePayer,
                                },
                                rewardsConfig: {
                                    rewardMint: accountKeys[accounts.indexOf('rewardMint')],
                                    bountyVaults: [accountKeys[accounts.indexOf('bountyVault')]],
                                    sellerReward: result.params.sellerReward,
                                    buyerReward: result.params.buyerReward,
                                    rewardsEnabled: result.params.rewardsEnabled
                                },
                            }

                            return await db.marketplace.doc(accountKeys[accounts.indexOf('marketplace')]).set(marketplaceAccount);

                        case InstructionType.InitProduct:
                            const productObject: Product = {
                                address: accountKeys[accounts.indexOf('product')],
                                authority: accountKeys[accounts.indexOf('signer')],
                                marketplace: accountKeys[accounts.indexOf('marketplace')],
                                productMint: accountKeys[accounts.indexOf('productMint')],
                                merkleTree: 'none',
                                sellerConfig: {
                                    paymentMint: accountKeys[accounts.indexOf('paymentMint')],
                                    productPrice: result.params.productPrice
                                },
                            };
                            await db.products.doc(accountKeys[accounts.indexOf('product')]).set(productObject);
                            return productObject.address;
                            
                        case InstructionType.InitProductTree:
                            const productTreeData: Product = {
                                address: accountKeys[accounts.indexOf('product')],
                                authority: accountKeys[accounts.indexOf('signer')],
                                marketplace: accountKeys[accounts.indexOf('marketplace')],
                                productMint: accountKeys[accounts.indexOf('productMint')],
                                merkleTree: accountKeys[accounts.indexOf('merkleTree')],
                                sellerConfig: {
                                    paymentMint: accountKeys[accounts.indexOf('paymentMint')],
                                    productPrice: result.params.productPrice
                                },
                            };
                            await db.products.doc(accountKeys[accounts.indexOf('product')]).set(productTreeData);
                            return productTreeData.address;

                        case InstructionType.InitReward:
                            const rewardData: Reward = {
                                address: accountKeys[accounts.indexOf('reward')],
                                authority: accountKeys[accounts.indexOf('signer')],
                                rewardVaults: [accountKeys[accounts.indexOf('rewardVault')]],
                            };
                            await db.userRewards(rewardData.authority).add(rewardData);
                            return rewardData.address;
                            
                        case InstructionType.InitRewardVault:
                            const rewardDoc = await db.userRewards(accountKeys[accounts.indexOf('marketplace')]).doc(accountKeys[accounts.indexOf('reward')]).get();
                            const rwData = rewardDoc.data();

                            if (rwData) {
                                rwData.rewardVaults.push(accountKeys[accounts.indexOf('rewardVault')]);
                                db.userRewards(accountKeys[accounts.indexOf('marketplace')]).doc(accountKeys[accounts.indexOf('reward')]).set(rwData)
                            }
                            return accountKeys[accounts.indexOf('reward')];
                            
                        case InstructionType.UpdateTree:
                            const updProdDoc = await db.products.doc(accountKeys[accounts.indexOf('product')]).get()
                            const updProd = updProdDoc.data();

                            if (updProd) {
                                const updateProdData: Product = {
                                    address: accountKeys[accounts.indexOf('product')],
                                    authority: updProd.authority,
                                    marketplace: accountKeys[accounts.indexOf('marketplace')],
                                    productMint: accountKeys[accounts.indexOf('productMint')],
                                    merkleTree: accountKeys[accounts.indexOf('merkleTree')],
                                    sellerConfig: {
                                        paymentMint: accountKeys[accounts.indexOf('paymentMint')],
                                        productPrice: result.params.productPrice
                                    },
                                };
                                await db.products.doc(accountKeys[accounts.indexOf('product')]).set(updateProdData);
                            }

                            return accountKeys[accounts.indexOf('product')];
                            
                        case InstructionType.RequestAccess:
                            await db.marketplaceRequests(accountKeys[accounts.indexOf('marketplace')]).doc(accountKeys[accounts.indexOf('reward')]).set({
                                address: accountKeys[accounts.indexOf('request')],
                                authority: accountKeys[accounts.indexOf('signer')]
                            })
                            return accountKeys[accounts.indexOf('request')];
                            
                        case InstructionType.WithdrawReward:
                            return (await db.events("withdrawReward").add({
                                ...commonEvent,
                                marketplace: accountKeys[accounts.indexOf('marketplace')],
                                reward: accountKeys[accounts.indexOf('reward')],
                                rewardMint: accountKeys[accounts.indexOf('rewardMint')],
                                receiverVault: accountKeys[accounts.indexOf('receiverVault')],
                                rewardVault: accountKeys[accounts.indexOf('rewardVault')],
                            })).id;
                    }
                } catch (error) {
                    console.log(error);
                }
            });
        
            const results = await Promise.all(asyncTasks);
            const transactionIds = results.map((result) => result).join(", ");
            return new Response(`IDs: ${transactionIds} added.`, { status: 200 });
        } catch (error) {
            console.log(error);
            return new Response('Error adding transactions', { status: 500 })
        }
    }, { body: validateSignatureBody });
