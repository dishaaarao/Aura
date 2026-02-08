
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
Keep responses concise and natural for speech.`;

// FALLBACK KEYS (Restoring from your provided keys)
const DEFAULT_GEMINI_KEY = "AIzaSyA2xc4k7C8TpcZym_sZABBszLFAMHKe_Fg";

export async function getAIResponse(
    messages: ChatMessage[],
    apiKey: string,
    provider: AIProvider = 'gemini'
): Promise<AIResponse> {

    // Use provided key or fallback to the hardcoded one if using Gemini
    const effectiveKey = apiKey || (provider === 'gemini' ? DEFAULT_GEMINI_KEY : '');

    if (!effectiveKey && provider !== 'gemini') {
        // If we don't have a key for Groq/OpenAI, we can't do anything
        throw new Error(`MISSING API KEY FOR ${provider.toUpperCase()}`);
    }

    let textResponse = "";

    try {
        if (provider === 'gemini') {
            textResponse = await fetchGemini(messages, effectiveKey);
        } else if (provider === 'groq') {
            textResponse = await fetchGroq(messages, effectiveKey);
        } else {
            textResponse = await fetchOpenAI(messages, effectiveKey);
        }
    } catch (error: any) {
        console.error("AI Fetch Error:", error);
        throw new Error(error.message || "AI CONNECTION FAILED");
    }

    return {
        text: textResponse,
        intent: { type: 'conversation' }
    };
}

// --- PROVIDER IMPLEMENTATIONS ---

async function fetchGemini(messages: ChatMessage[], apiKey: string): Promise<string> {
    const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    })).filter(m => m.role !== 'system'); // Gemini handles system via systemInstruction

    // Combine consecutive user/model messages if needed (Logic omitted for simplicity, Gemin usually handles strict turns)

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: contents
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "Gemini Error");
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "NO RESPONSE";
    } catch (e: any) {
        throw new Error("GEMINI ERROR: " + e.message);
    }
}

async function fetchGroq(messages: ChatMessage[], apiKey: string): Promise<string> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
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
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
            model: "gpt-3.5-turbo"
        })
    });

    if (!response.ok) throw new Error("OpenAI API Error");
    const data = await response.json();
    return data.choices[0]?.message?.content || "";
}
