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
You will receive [SYSTEM CONTEXT] messages containing the current time and date. Use that information to answer time-related questions accurately.
Keep responses concise and natural for speech.
CRITICAL: You MUST return a JSON object with a "text" field.
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
    const contents: any[] = [];
    messages.forEach((m) => {
        const role = m.role === 'assistant' ? 'model' : 'user';
        if (contents.length > 0 && contents[contents.length - 1].role === role) {
            contents[contents.length - 1].parts[0].text += `\n${m.content}`;
        } else {
            contents.push({ role, parts: [{ text: m.content }] });
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
                    contents: contents
                })
            });
            if (!res.ok) continue;
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return parseAIResponse(text);
        } catch (e) { continue; }
    }
    throw new Error("Gemini Connection Error.");
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
        // Find if there is a JSON block or object in the response
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const potentialJson = jsonMatch[0];
            const cleanJson = potentialJson.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleanJson);
            return {
                text: (parsed.text || parsed.response || parsed.message || raw.replace(potentialJson, '').trim()).toUpperCase(),
                intent: parsed.intent || { type: 'conversation' }
            };
        }

        // If no JSON object found, clean natural language of any accidental code tags
        const cleanText = raw.replace(/```json|```|\{|\}/g, '').trim();
        return { text: cleanText.toUpperCase(), intent: { type: 'conversation' } };
    } catch (e) {
        // Fallback: strip everything that looks like JSON and return uppercase text
        const fallbackText = raw.split('{')[0].trim();
        return { text: (fallbackText || raw).toUpperCase(), intent: { type: 'conversation' } };
    }
}
