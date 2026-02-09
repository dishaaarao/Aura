import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
const { Pool } = pg;

dotenv.config();

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// PostgreSQL Connection (Made optional for Vercel startup)
let pool: any = null;
if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
}

// AI Configuration
const SYSTEM_PROMPT = `You are AURA, a retro pixel-style voice assistant. 
Your personality: Friendly, robotic but warm. Always respond in ALL-CAPS.
Keep responses concise and natural for speech.
CRITICAL: You MUST return a JSON object with a "text" field.`;

// AI Helper Functions
async function getGeminiResponse(messages: any[], apiKey: string) {
    const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

    const models = ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-pro'];
    for (const model of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                    contents: contents
                })
            });

            const data: any = await res.json();
            if (res.ok) {
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) return text;
            } else {
                console.error(`Gemini (${model}) error:`, data.error?.message);
            }
        } catch (e) { continue; }
    }
    throw new Error("ALL GEMINI MODELS FAILED OR API KEY INVALID.");
}

async function getGroqResponse(messages: any[], apiKey: string) {
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
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Groq Error");
    return data.choices[0].message.content;
}

async function getOpenAIResponse(messages: any[], apiKey: string) {
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
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "OpenAI Error");
    return data.choices[0].message.content;
}

// Routes
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        dbConnected: !!pool,
        envSet: {
            gemini: !!process.env.GEMINI_API_KEY,
            groq: !!process.env.GROQ_API_KEY,
            openai: !!process.env.OPENAI_API_KEY
        }
    });
});

app.post('/api/chat', async (req: Request, res: Response) => {
    const { messages, provider } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Messages are required.' });
    }

    const lastUserMessage = messages[messages.length - 1].content;

    try {
        // 1. Save to DB (Optional)
        if (pool) {
            try {
                await pool.query('INSERT INTO messages (role, content) VALUES ($1, $2)', ['user', lastUserMessage]);
            } catch (dbErr) {
                console.warn('⚠️ DB save failed:', dbErr);
            }
        }

        // 2. Get AI Response
        let aiText = '';
        const apiKey = provider === 'gemini' ? process.env.GEMINI_API_KEY
            : provider === 'groq' ? process.env.GROQ_API_KEY
                : process.env.OPENAI_API_KEY;

        if (!apiKey) throw new Error(`SERVER ERROR: API Key for ${provider} is not configured in Vercel settings.`);

        if (provider === 'gemini') {
            aiText = await getGeminiResponse(messages, apiKey);
        } else if (provider === 'groq') {
            aiText = await getGroqResponse(messages, apiKey);
        } else {
            aiText = await getOpenAIResponse(messages, apiKey);
        }

        // 3. Simple Parse
        let finalText = aiText;
        try {
            const jsonMatch = aiText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const cleanJson = jsonMatch[0].replace(/```json|```/g, '').trim();
                const parsed = JSON.parse(cleanJson);
                finalText = (parsed.text || parsed.response || parsed.message || aiText.replace(jsonMatch[0], '').trim());
            } else {
                finalText = aiText.replace(/```json|```|\{|\}/g, '').trim();
            }
        } catch (e) {
            finalText = aiText.split('{')[0]?.trim() || aiText;
        }

        finalText = finalText.toUpperCase();

        // 4. Save AI Response (Optional)
        if (pool) {
            try {
                await pool.query('INSERT INTO messages (role, content) VALUES ($1, $2)', ['assistant', finalText]);
            } catch (dbErr) {
                console.warn('⚠️ DB save failed:', dbErr);
            }
        }

        res.json({ text: finalText });
    } catch (error: any) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/history', async (req: Request, res: Response) => {
    if (!pool) return res.json([]);
    try {
        const result = await pool.query('SELECT * FROM messages ORDER BY timestamp ASC LIMIT 50');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

export default app;
