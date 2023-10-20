import { InstructionType, getInstructionType, instructionParsers } from "../../../../../Developer/sdk/dist";
import { transactionsBody } from "../../requestSchema";
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
                    const instructionData = transaction.message.instructions[0].data;
                    const bufferData = Buffer.from(bs58.decode(instructionData));
                    const type = getInstructionType(bufferData);
                    if (!type) return;
                    
                    const accountKeys = transaction.message.accountKeys;
                    const commonEvent = {
                        type,
                        blockTime,
                    };
                    switch (type) {
                        case InstructionType.DirectPay:
                            const paymentInfo = instructionParsers.DirectPay(Buffer.from(instructionData), accountKeys);
                            const userDoc = await db.users.doc(paymentInfo.signer).get();           
                            if (!userDoc.exists) await db.users.doc(paymentInfo.signer).set({ address: paymentInfo.signer });
                    
                            const buyTransactionPromises = [
                                db.userPurchases(paymentInfo.signer).add({...commonEvent, ...paymentInfo}),
                                db.productSales(paymentInfo.product).add({...commonEvent, ...paymentInfo}),
                            ];
                            const buyTransactionResults = await Promise.all(buyTransactionPromises);
                        
                            return buyTransactionResults[0].id;
                            
                        case InstructionType.InitProduct:
                            const productInfo = instructionParsers.InitProduct(Buffer.from(instructionData), accountKeys);
                            await db.userProducts(productInfo.signer).add({...commonEvent, ...productInfo});
   
                        default:
                            console.log('This instructions is not indexed');
                            return new Response('Error adding transactions', { status: 500 }) 
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
    }, { body: transactionsBody });
