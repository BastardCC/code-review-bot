import { createOpenAI } from '@ai-sdk/openai';
import { streamText, UIMessage, convertToModelMessages } from 'ai';

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY || '',
});

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  return streamText({
    model: openrouter.chat(process.env.OPENROUTER_MODEL ?? 'openrouter/free'),
    messages: await convertToModelMessages(messages),
  }).toUIMessageStreamResponse();
}
