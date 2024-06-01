import { Elysia } from "elysia";
import { parse, stringify, v4 as uuid } from "uuid";
import { t } from "elysia";
import { supabase } from "../supabase";
import { PublicKey } from "@solana/web3.js";
import { PAYMENT_PROGRAM_PK } from "../constants";

export type CreateProductParams = {
    price: string;
    currency: string;
    market: string;
    seller: string;
}

export type UpdateProductParams = {
    id: string;
    price: string;
    currency: string;
}

export type DeleteProductParams = {
    id: string;
}

export const CreateProductSchema = t.Object({
    price: t.String(),
    currency: t.String(),
    market: t.String(),
    seller: t.String()
});

export const UpdateProductSchema = t.Object({
    id: t.String(),
    price: t.String(),
    currency: t.String()
});

export const DeleteProductSchema = t.Object({
    id: t.String()
});

export const productManager = new Elysia({ prefix: '/product' })
    .get('/all', async () => {
        const { data, error } = await supabase
            .from('products')
            .select();

        if (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        return new Response(JSON.stringify(data));
    })
    .get('/:id', async ({ params }) => {
        const { data, error } = await supabase
            .from('products')
            .select()
            .eq('id', params.id)
            .single();

        if (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        return new Response(JSON.stringify(data));
    })
    .put('/create', async ({ body }: { body: CreateProductParams }) => {
        const productId = parse(uuid());
        const marketplaceId = parse(body.market);
        const [index] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("index", "utf-8"),
            marketplaceId,
            productId
          ],
          PAYMENT_PROGRAM_PK
        );

        const product = {
            ...body,
            id: stringify(productId),
            active: true,
            solana_index: index.toString()
        };

        const { data, error } = await supabase
            .from('products')
            .insert(product)
            .select('id');

        if (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
        
        return new Response(JSON.stringify({ message: 'success', data }));
    }, { body: CreateProductSchema })
    .put('/update', async ({ body }: { body: UpdateProductParams }) => {
        const { data, error } = await supabase
            .from('products')
            .update({
                price: body.price,
                currency: body.currency,
            })
            .eq('id', body.id);

        if (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        return new Response(JSON.stringify({ message: 'success', data }));
    }, { body: UpdateProductSchema })
    .delete('/delete', async ({ body }: { body: DeleteProductParams }) => {
        const { data, error } = await supabase
            .from('products')
            .delete()
            .eq('id', body.id);

        if (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        return new Response(JSON.stringify({ message: 'success', data }));
    }, { body: DeleteProductSchema });