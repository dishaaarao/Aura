export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export type AIProvider = 'gemini' | 'groq' | 'openai';

export interface AIResponse {
    text: string;
    intent?: {
        type: 'math' | 'repeat' | 'joke' | 'time' | 'conversation' | 'action';
        value?: string;
    };
}

const SYSTEM_PROMPT = `You are AURA, a retro pixel-style voice assistant. 
Your personality: Friendly, robotic but warm. Always respond in ALL-CAPS.
CRITICAL: You MUST return a JSON object with a "text" field.
Example: {"text": "HELLO HUMAN"}
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
            model: 'llama-3.3-70b-versatile', // Updated to the latest Groq model
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
            text: (parsed.text || parsed.message || parsed.response || raw).toUpperCase(),
            intent: parsed.intent || { type: 'conversation' }
        };
    } catch (e) {
        return { text: raw.toUpperCase(), intent: { type: 'conversation' } };
    }
}
