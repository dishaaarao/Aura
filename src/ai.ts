
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
Keep responses concise and natural for speech.`;

// FALLBACK KEYS (Only used if backend is broken)
const DEFAULT_GEMINI_KEY = "AIzaSyA2xc4k7C8TpcZym_sZABBszLFAMHKe_Fg";

export async function getAIResponse(
    messages: ChatMessage[],
    apiKey: string,
    provider: AIProvider = 'gemini'
): Promise<AIResponse> {

    // 1. Try Backend FIRST
    // We use a relative path /api/chat which works on Vercel and local dev (via vite proxy or same port)
    // We only use VITE_BACKEND_URL if it's explicitly set to something other than localhost
    let backendUrl = import.meta.env.VITE_BACKEND_URL || '';
    if (backendUrl.includes('localhost')) backendUrl = '';

    try {
        const res = await fetch(`${backendUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, provider })
        });

        const data = await res.json();
        if (res.ok) {
            return {
                text: data.text,
                intent: { type: 'conversation' }
            };
        }

        // If server returns a specific error message, we want to see it
        if (data.error) {
            throw new Error(data.error);
        }
    } catch (e: any) {
        console.warn("Backend unavailable, using client-side fallback:", e.message);
        // If it's a server configuration error, don't even try fallback as it will likely fail too
        if (e.message.includes("SERVER ERROR")) throw e;
    }

    // 2. Client-Side Fallback (Logic for when backend fails)
    const effectiveKey = apiKey || (provider === 'gemini' ? DEFAULT_GEMINI_KEY : '');

    if (!effectiveKey) {
        throw new Error(`MISSING API KEY FOR ${provider.toUpperCase()}`);
    }

    try {
        let textResponse = "";
        if (provider === 'gemini') {
            textResponse = await fetchGemini(messages, effectiveKey);
        } else if (provider === 'groq') {
            textResponse = await fetchGroq(messages, effectiveKey);
        } else {
            textResponse = await fetchOpenAI(messages, effectiveKey);
        }
        return { text: textResponse, intent: { type: 'conversation' } };
    } catch (error: any) {
        throw new Error(`CLIENT FALLBACK ERROR: ${error.message}`);
    }
}

async function fetchGemini(messages: ChatMessage[], apiKey: string): Promise<string> {
    const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

    // Try multiple model strings as Google sometimes changes them
    const models = ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-pro'];

    for (const model of models) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                    contents: contents
                })
            });

            const data = await response.json();
            if (response.ok) {
                return data.candidates?.[0]?.content?.parts?.[0]?.text || "NO RESPONSE";
            }
        } catch (e) { continue; }
    }

    throw new Error("GEMINI API REJECTED REQUEST. CHECK KEY PERMISSIONS.");
}

async function fetchGroq(messages: ChatMessage[], apiKey: string): Promise<string> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
            model: "llama-3.3-70b-versatile"
        })
    });
    if (!response.ok) throw new Error("Groq API Error");
    const data = await response.json();
    return data.choices[0]?.message?.content || "";
}

async function fetchOpenAI(messages: ChatMessage[], apiKey: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
            model: "gpt-3.5-turbo"
        })
    });
    if (!response.ok) throw new Error("OpenAI API Error");
    const data = await response.json();
    return data.choices[0]?.message?.content || "";
}
