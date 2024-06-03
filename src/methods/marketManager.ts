import { t } from "elysia";
import { Elysia } from "elysia";
import { v4 as uuid } from "uuid";
import { supabase } from "../supabase";
import { middleware } from "./auth/middleware";

export interface Market {
    id: string;
    name: string;
    location?: string;
}

export type CreateMarketParams = {
    user: string
    name: string;
    location?: string;
}

export type UpdateMarketParams = {
    id: string;
    name?: string;
    location?: string;
}

export type DeleteMarketParams = {
    id: string;
}


export const CreateMarketSchema = t.Object({
    name: t.String(),
    user: t.String(),
    location: t.Optional(t.String())
});

export const UpdateMarketSchema = t.Object({
    id: t.String(),
    name: t.Optional(t.String()),
    location: t.Optional(t.String())
});

export const DeleteMarketSchema = t.Object({
    id: t.String()
});

export const marketManager = new Elysia({ prefix: '/market' })
    .get('/all', async () => {
        const { data, error } = await supabase
            .from('markets')
            .select();

        if (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        return new Response(JSON.stringify(data));
    }, { beforeHandle: middleware })

    .get('/:id', async ({ params }) => {
        const { data, error } = await supabase
            .from('markets')
            .select()
            .eq('id', params.id)
            .single();

        if (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        return new Response(JSON.stringify(data));
    }, { beforeHandle: middleware })

    .post('/create', async ({ body }: { body: CreateMarketParams }) => {
        const market = {
            ...body,
            id: uuid(),
        };

        const { data, error } = await supabase
            .from('markets')
            .insert(market)
            .select('id');

        if (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
        
        return new Response(JSON.stringify({ message: 'success', data }));
    }, { beforeHandle: middleware, body: CreateMarketSchema })

    .put('/update', async ({ body }: { body: UpdateMarketParams }) => {
        const { data, error } = await supabase
            .from('markets')
            .update({
                name: body.name,
                location: body.location
            })
            .eq('id', body.id);

        if (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        return new Response(JSON.stringify({ message: 'success', data }));
    }, { beforeHandle: middleware, body: UpdateMarketSchema })

    .delete('/delete', async ({ body }: { body: DeleteMarketParams }) => {
        const { data, error } = await supabase
            .from('markets')
            .delete()
            .eq('id', body.id);

        if (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        return new Response(JSON.stringify({ message: 'success', data }));
    }, { beforeHandle: middleware, body: DeleteMarketSchema })