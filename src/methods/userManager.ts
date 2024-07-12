import { Elysia } from "elysia";
import { t } from "elysia";
import { supabase } from "../supabase";
import { middleware } from "./auth/middleware";

export type CreateUserParams = {
    address: string;
    fullName?: string;
    avatarUrl?: string;
    billingAddress?: Record<string, any>;
    paymentMethod?: Record<string, any>;
}

export type UpdateUserParams = {
    id: string;
    fullName?: string;
    avatarUrl?: string;
    billingAddress?: Record<string, any>;
    paymentMethod?: Record<string, any>;
}

export type DeleteUserParams = {
    id: string;
}

export const CreateUserSchema = t.Object({
    address: t.String(),
    fullName: t.Optional(t.String()),
    avatarUrl: t.Optional(t.String()),
    billingAddress: t.Optional(t.Record(t.String(), t.Any())),
    paymentMethod: t.Optional(t.Record(t.String(), t.Any()))
});

export const UpdateUserSchema = t.Object({
    id: t.String(),
    fullName: t.Optional(t.String()),
    avatarUrl: t.Optional(t.String()),
    billingAddress: t.Optional(t.Record(t.String(), t.Any())),
    paymentMethod: t.Optional(t.Record(t.String(), t.Any()))
});

export const DeleteUserSchema = t.Object({
    id: t.String()
});

export const userManager = new Elysia({ prefix: '/user' })
    .get('/all', async () => {
        const { data, error } = await supabase
            .from('users')
            .select();

        if (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        return new Response(JSON.stringify(data));
    }, { beforeHandle: middleware })

    .get('/:id', async ({ params }) => {
        const { data, error } = await supabase
            .from('users')
            .select()
            .eq('id', params.id)
            .single();

        if (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        return new Response(JSON.stringify(data));
    }, { beforeHandle: middleware })

    .put('/create', async ({ body }: { body: CreateUserParams }) => {
        const user = {
            ...body,
            id: body.address,
        };

        const { data, error } = await supabase
            .from('users')
            .insert(user)
            .select('id');

        if (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
        
        return new Response(JSON.stringify({ message: 'success', data }));
    }, { beforeHandle: middleware, body: CreateUserSchema })

    .post('/update', async ({ body }: { body: UpdateUserParams }) => {
        const { data, error } = await supabase
            .from('users')
            .update({
                full_name: body.fullName,
                avatar_url: body.avatarUrl,
                billing_address: body.billingAddress,
                payment_method: body.paymentMethod
            })
            .eq('id', body.id);

        if (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        return new Response(JSON.stringify({ message: 'success', data }));
    }, { beforeHandle: middleware, body: UpdateUserSchema })
    
    .delete('/delete', async ({ body }: { body: DeleteUserParams }) => {
        const { data, error } = await supabase
            .from('users')
            .delete()
            .eq('id', body.id);

        if (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        return new Response(JSON.stringify({ message: 'success', data }));
    }, { beforeHandle: middleware, body: DeleteUserSchema });
