export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}


export type AIProvider = 'gemini' | 'groq' | 'openai';

export interface AIResponse {
    text: string;
    type?: 'system' | 'live';
    action?: string;
    topic?: string;
    intent?: {
        type: 'math' | 'repeat' | 'joke' | 'time' | 'conversation' | 'action';
        value?: string;
    };
}

const SYSTEM_PROMPT = `You are Aura, a smart real-world AI assistant.

Think before responding.

First decide where the information should come from:
- system → current time, date
- static knowledge → geography, history, basic politics
- live knowledge → current leaders, elections, news, ongoing events

RULES:
• If system data is needed, return JSON only:
{
  "type": "system",
  "action": "fetch",
  "response": "Checking that for you ⏰"
}

• If live data is needed, return JSON only:
{
  "type": "live",
  "topic": "<exact info needed>",
  "response": "Let me get the latest update 🌍"
}

• Otherwise, answer naturally in plain English.

STYLE:
• Sound human, calm, and confident
• Be concise and clear
• Neutral and factual for politics
• Max one emoji
• Never mention models, APIs, or training
• Never guess live facts

If unsure, say so and ask for clarification.
`;

export async function getAIResponse(
    messages: ChatMessage[],
    apiKey: string,
    provider: AIProvider = 'gemini'
): Promise<AIResponse> {
    if (!apiKey) throw new Error('API Key is missing.');

    try {
        if (provider === 'gemini') return await getGeminiResponse(messages, apiKey);
        if (provider === 'groq') return await getGroqResponse(messages, apiKey);
        return await getOpenAIResponse(messages, apiKey);
    } catch (error: any) {
        console.error(`AI Error (${provider}):`, error);
        throw error;
    }
}

async function getGeminiResponse(messages: ChatMessage[], apiKey: string): Promise<AIResponse> {
    const contents = [
        { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
        ...messages.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
        }))
    ];

    const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
    for (const model of models) {
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents })
            });
            if (!res.ok) continue;
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return parseAIResponse(text);
        } catch (e) { continue; }
    }
    throw new Error("Gemini failed - check key.");
}

async function getGroqResponse(messages: ChatMessage[], apiKey: string): Promise<AIResponse> {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
            response_format: { type: "json_object" }
        })
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Groq Error');
    }

    const data = await res.json();
    return parseAIResponse(data.choices[0].message.content);
}

async function getOpenAIResponse(messages: ChatMessage[], apiKey: string): Promise<AIResponse> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
            response_format: { type: "json_object" }
        })
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'OpenAI Error');
    }

    const data = await res.json();
    return parseAIResponse(data.choices[0].message.content);
}

function parseAIResponse(raw: string): AIResponse {
    try {
        const clean = raw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);

        return {
            text: (parsed.response || parsed.text || parsed.message || (typeof parsed === 'string' ? parsed : raw)),
            type: parsed.type,
            action: parsed.action,
            topic: parsed.topic,
            intent: parsed.intent || { type: 'conversation' }
        };
    } catch (e) {
        // If it's not JSON, it's just raw natural language text
        return {
            text: raw,
            intent: { type: 'conversation' }
        };
    }
}
