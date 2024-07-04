import type { NextApiRequest, NextApiResponse } from 'next';
import { OpenAIService } from '@/lib/openai-service';
import functionCallingFns from '@/lib/openai-functions';
import { openAiApiKey, openAiApiAssistantId } from '@/lib/config';


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const { currentMessage, threadId: thread } = req.body;
        const openai = new OpenAIService(openAiApiKey, openAiApiAssistantId, functionCallingFns);
        const { messages, threadId } = await openai.chat(currentMessage, thread);
        
        const message = (messages as any)?.[0].content?.[0]?.text?.value;
        res.status(200).json({ message, threadId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to process the request' });
    }
}
