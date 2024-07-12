import { supabase } from "../../supabase";

export const middleware = async ({ cookie }: any) => {
    const token = cookie.token.value;
    if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            console.log(error)
            return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return user;
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
