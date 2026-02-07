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

// THE NEW POWERFUL BACKEND CONNECTION
export async function getAIResponse(
    messages: ChatMessage[],
    _apiKey: string, // Kept for signature compatibility but ignored (backend handles keys)
    provider: AIProvider = 'gemini'
): Promise<AIResponse> {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
    try {
        const response = await fetch(`${backendUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages,
                provider
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Backend Error');
        }

        const data = await response.json();
        return {
            text: data.text,
            intent: data.intent || { type: 'conversation' } // Use backend intent
        };
    } catch (error: any) {
        console.error('Frontend AI Error (Backend call):', error);
        throw error;
    }
}
