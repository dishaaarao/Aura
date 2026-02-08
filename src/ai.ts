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
    const backendUrl = 'https://aura-production-b6d5.up.railway.app'; // DIRECT CONNECTION
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
            let errText = 'Backend Error';
            try {
                const errData = await response.json();
                errText = errData.error || errText;
            } catch (e) {
                // If not JSON, probably an HTML error page (404/500)
                errText = await response.text();
            }
            throw new Error(errText);
        }

        let data;
        try {
            data = await response.json();
        } catch (e) {
            // If valid 200 OK but not JSON (rare), just read as text
            data = await response.text();
        }
        console.log("DEBUG: AI Response Data:", data);

        // BULLETPROOF: Handle any shape the backend throws at us
        let aiText = "I COULD NOT HEAR YOU PROPERLY.";

        if (typeof data === 'string') {
            aiText = data;
        } else if (data && typeof data === 'object') {
            aiText = data.text || data.response || data.message || JSON.stringify(data);
        }

        // Clean up accidental JSON strings in the output
        if (aiText.trim().startsWith('{') && aiText.trim().endsWith('}')) {
            try {
                const inner = JSON.parse(aiText);
                if (inner.text) aiText = inner.text;
            } catch (e) {
                // ignore
            }
        }

        return {
            text: aiText,
            intent: { type: 'conversation' } // Always default to simple conversation
        };
    } catch (error: any) {
        console.error('Frontend AI Error (Backend call):', error);
        throw error;
    }
}
