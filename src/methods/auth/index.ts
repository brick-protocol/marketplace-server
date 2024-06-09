import { Elysia, t } from 'elysia';
import { supabase, supabaseAuthAdapter } from '../../supabase';
import { v4 as uuid } from 'uuid';
import { SignedMessage } from './signedMessage';

export type Nonce = {
    address: string;
};

export type Login = {
    message: string;
    signature: string;
};

export const NonceSchema = t.Object({
    address: t.String(),
});

export const LoginSchema = t.Object({
    message: t.String(),
    signature: t.String(),
});

export const authManager = new Elysia({ prefix: '/auth' })
    .post('/nonce', async ({ body }) => {
        const { address } = body;

        try {
            const nonce = uuid();
            const attempt = {
                address,
                nonce,
                ttl: (Math.floor(Date.now() / 1000) + 300).toString(), // 5 minutes TTL
            };

            await supabaseAuthAdapter.saveAttempt(attempt);

            return new Response(JSON.stringify({ nonce }), {
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error) {
            console.error('Error generating nonce:', error);
            return new Response(JSON.stringify({ error: 'Failed to generate nonce' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }, { body: NonceSchema })

    .post('/login', async ({ body }) => {
        const { message, signature } = body;

        try {
            const signinMessage = new SignedMessage(JSON.parse(message));

            const validationResult = await signinMessage.validate(signature);
            if (!validationResult) {
                return new Response(JSON.stringify({ error: 'Invalid signature' }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            const storedNonce = await supabaseAuthAdapter.getNonce(signinMessage.publicKey);
            if (storedNonce !== signinMessage.nonce) {
                return new Response(JSON.stringify({ error: 'Invalid nonce' }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            const address = signinMessage.publicKey;
            // Check if user exists, otherwise create a new one
            const { data: user, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('address', address)
                .single();

            if (userError && userError.code !== 'PGRST116') {
                throw userError;
            } else if (!user) {
                const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
                    email: `${address}@example.com`, // Placeholder email
                    user_metadata: { address: address },
                });

                if (authError) throw authError;
                
                await supabase
                    .from('users')
                    .update({ address })
                    .eq('id', authUser.user.id);                
            }

            const token = supabaseAuthAdapter.generateToken();

            // Clear the nonce after successful login
            await supabase
                .from('users')
                .update({ 
                    nonce: null, 
                    last_auth: new Date().toISOString(), 
                    last_auth_status: 'success' 
                })
                .eq('address', address);

            return new Response(JSON.stringify({ token }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error: any) {
            console.error('Error during login:', error);
            return new Response(JSON.stringify({ error: error.message || 'Login failed' }), {
                status: error.status || 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }, { body: LoginSchema });
