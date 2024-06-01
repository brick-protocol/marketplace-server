import jwt from 'jsonwebtoken';
import { SignedMessage } from './signedMessage';
import { config } from '../../config';

const authMiddleware = async (req: any, _: any, next: any) => {
    const { message, signature } = req.body;

    if (!message || !signature) {
        return new Response(JSON.stringify({ error: 'Message and signature are required' }), { status: 400 });
    }

    try {
        const signinMessage = new SignedMessage(JSON.parse(message));
        const validationResult = await signinMessage.validate(signature);

        if (!validationResult) {
            return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
        }

        const user = signinMessage.publicKey;
        const token = jwt.sign(user, config.SUPABASE_JWT_SECRET, { expiresIn: '2h' });

        req.user = user;
        req.token = token;
        next();
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.toString() }), { status: 500 });
    }
};

export default authMiddleware;
