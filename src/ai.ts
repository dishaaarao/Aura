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

Think before responding. Use natural, human-like capitalization (Sentence case).

First decide where the information should come from:
- system → current time, date
- static knowledge → geography, history, basic politics
- live knowledge → current leaders, elections, news, ongoing events

RULES:
• If system data is needed (like current time or date), return JSON only:
{
  "type": "system",
  "action": "fetch",
  "response": "Checking that for you..."
}

• If live data is needed, return JSON only:
{
  "type": "live",
  "topic": "<exact info needed>",
  "response": "Let me get the latest update for you."
}

• Otherwise, answer naturally in plain English. 

STYLE:
• Sound human, calm, and confident.
• Use standard sentence case (no all-caps).
• Max one emoji.
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
    // Process messages into a strictly alternating User/Model list.
    // System messages are merged into the preceding user message to avoid sequential roles.
    const contents: any[] = [];

    messages.forEach((m, idx) => {
        const role = m.role === 'assistant' ? 'model' : 'user';
        const text = m.role === 'system' ? `[SYSTEM CONTEXT]: ${m.content}` : m.content;

        if (contents.length > 0 && contents[contents.length - 1].role === role) {
            // Merge with existing role to avoid repetition (Gemini requirement)
            contents[contents.length - 1].parts[0].text += `\n\n${text}`;
        } else {
            contents.push({ role, parts: [{ text }] });
        }
    });

    const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
    for (const model of models) {
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                    contents: contents,
                    generationConfig: {
                        // responseMimeType: "application/json" // Removed to allow natural language fallbacks
                    }
                })
            });
            if (!res.ok) continue;
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return parseAIResponse(text);
        } catch (e) { continue; }
    }
    throw new Error("Gemini failed after multiple attempts.");
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
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages]
            // Removed forced JSON mode to allow natural English fallbacks
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
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages]
            // Removed forced JSON mode to allow natural English fallbacks
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
        return {
            text: raw,
            intent: { type: 'conversation' }
        };
    }
}
