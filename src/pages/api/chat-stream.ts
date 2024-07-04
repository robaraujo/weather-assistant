import type { NextApiRequest, NextApiResponse } from 'next';
import { OpenAIService } from '@/lib/openai-service';
import functionCallingFns from '@/lib/openai-functions';
import { openAiApiKey, openAiApiAssistantId } from '@/lib/config';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const { currentMessage, threadId: thread } = req.body;
        const openai = new OpenAIService(openAiApiKey, openAiApiAssistantId, functionCallingFns);
        const resStream = await openai.chatStream(currentMessage, thread);

        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('Cache-Control', 'no-cache, no-transform');

        res.write(JSON.stringify({ pooling: true }));
        resStream.on('event', (data) => res.write(JSON.stringify(data)));
        resStream.on('end', () => res.end());
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to process the request' });
    }
}
