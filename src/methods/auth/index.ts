///https://elysiajs.com/blog/elysia-supabase

import { Elysia, t } from 'elysia'
import { supabase, supabaseAuthAdapter } from '../../supabase'
import { v4 as uuid } from "uuid";
import { SignedMessage } from './signedMessage';

export type Nonce = {
    address: string;
};

export type Login = {
    address: string;
    nonce: string;
    signed: string;
};

export const NonceSchema = t.Object({
    address: t.String(),
});

export const LoginSchema = t.Object({
    address: t.String(),
    nonce: t.String(),
    signed: t.String(),
});

export const authManager = new Elysia({ prefix: '/auth' })
    .post('/nonce', async ({ body }) => {
        try {
            const nonce = uuid();
            const attempt = {
                address: body.address,
                nonce,
                ttl: (Math.floor(Date.now() / 1000) + 300).toString(),
            };

            await supabaseAuthAdapter.saveAttempt(attempt);

            return new Response(JSON.stringify({ message: nonce }));
        } catch (error: any) {
            console.log(error)
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
    }, { body: NonceSchema })

    .post('/login', async ({ body }: any) => {
        const { message, signature } = body;
        const signinMessage = new SignedMessage(JSON.parse(message));
        const validationResult = await signinMessage.validate(signature);
        
        if (!validationResult) {
            return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
        }

        const storedNonce = await supabaseAuthAdapter.getNonce(signinMessage.publicKey);

        if (storedNonce !== signinMessage.nonce) {
            return new Response(JSON.stringify({ error: 'Invalid nonce' }), { status: 401 });
        }

        // Check if user exists in public.users, if not create them
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('address', signinMessage.publicKey)
            .single();

        let userId;
        if (!user) {
            const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
                email: `${signinMessage.publicKey}@example.com`, //  placeholder
                user_metadata: { address: signinMessage.publicKey },
            });

            if (authError) {
                return new Response(JSON.stringify({ error: authError.message }), { status: 401 });
            }
            userId = authUser.user.id;
            await supabase
                .from('users')
                .insert({ id: userId, address: signinMessage.publicKey });
        } else {
            userId = user.id;
        }

        // Generate JWT token
        const token = supabaseAuthAdapter.generateToken(userId);

        // Clear the nonce after successful login
        await supabase
            .from('users')
            .update({ 
                nonce: null, 
                last_auth: new Date().toISOString(), 
                last_auth_status: 'success' }
            )
            .eq('address', signinMessage.publicKey);

        return new Response(JSON.stringify({ token }), { status: 200 });
    }, { body: LoginSchema })

