import { verifyToken } from "../../middleware/auth";
import { initProduct } from "./initProduct";
import { registerBuy } from "./registerBuy";
import { Elysia, t } from "elysia";
import { v4 as uuid } from 'uuid'

const initProductSchema = t.Object({
    signer: t.String(),
    marketplace: t.String(),
    paymentMint: t.String(),
    productPrice: t.String(),
});

const registerBuySchema = t.Object({
    signer: t.String(),
    marketplace: t.String(),
    product: t.String(),
    paymentMint: t.String(),
    seller: t.String(),
    marketplaceAuth: t.String(),
    amount: t.String(),
    rewardsActive: t.String(),
});

export const transactionBuilder = (app: Elysia) => 
    app.group("/transactionBuilder", (app) =>
        app.use(verifyToken)
            .get('/initProduct', async ({ query }) => {
                const {
                    signer,
                    marketplace,
                    paymentMint,
                    productPrice,
                } = query;
                
                const initProductParams = {
                    signer,
                    marketplace,
                    paymentMint,
                    params: {
                        id: uuid(),
                        productPrice: parseFloat(productPrice),
                    },
                };                

                return await initProduct(initProductParams);
            }, { query: initProductSchema })

            .get('/registerBuy', async ({ query }) => {
                const {
                    signer,
                    marketplace,
                    product,
                    paymentMint,
                    seller,
                    marketplaceAuth,
                    amount,
                    rewardsActive,
                } = query;
            
                const registerBuyParams = {
                    signer,
                    marketplace,
                    product,
                    paymentMint,
                    seller,
                    marketplaceAuth,
                    params: {
                        amount: parseInt(amount, 10),
                        rewardsActive: rewardsActive === 'true',
                    },
                };
            
                return await registerBuy(registerBuyParams);
            }, { query: registerBuySchema })            
        );