import type { NextApiRequest, NextApiResponse } from 'next';
import { OpenAIService } from '@/lib/openai-service';
import functionCallingFns from '@/lib/openai-functions';
import { openAiApiKey, openAiApiAssistantId } from '@/lib/config';


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const { threadId: thread } = req.body;
        const openai = new OpenAIService(openAiApiKey, openAiApiAssistantId, functionCallingFns);
        const { messages, threadId } = await openai.getHistory(thread);
        
        res.status(200).json({ messages, threadId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to process the request' });
    }
}
