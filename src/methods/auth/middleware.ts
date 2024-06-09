import { supabase } from "../../supabase";

export const middleware = async ({ headers, set }: any) => {
    const bearer = headers.authorization;
    if (!bearer) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const token = bearer.split(' ')[1];
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        set.user = user;
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
