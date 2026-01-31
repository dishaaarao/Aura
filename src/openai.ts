export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export async function getAIResponse(messages: ChatMessage[], apiKey: string): Promise<string> {
    if (!apiKey) {
        throw new Error('API Key is missing. Please configure it in settings.');
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: 'You are a helpful and concise voice assistant. Keep your responses short and natural for speech.' },
                    ...messages
                ],
                max_tokens: 150
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Failed to fetch response from OpenAI');
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error('Error fetching AI response:', error);
        throw error;
    }
}
