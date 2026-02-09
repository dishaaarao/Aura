import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Request Logger (Debug)
app.use((req: Request, res: Response, next) => {
    console.log(`👉 [${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// 2. Permissive CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
// app.options('/*', cors()); // Removed to fix Express 5 crash

app.use(express.json());

// 3. Health Check
app.get('/', (req: Request, res: Response) => {
    res.json({ status: 'online', version: '2.0.0', message: 'Aura Backend is Ready' });
});

// PostgreSQL Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Test DB Connection and Initialize Table
async function initDB() {
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('✅ PostgreSQL Connected & Table Ready');
    } catch (err) {
        console.error('❌ Database connection error:', err);
    }
}
initDB();

// AI Provider Logic
const SYSTEM_PROMPT = `You are AURA, a retro pixel-style voice assistant. 
Your personality: Friendly, robotic but warm. Always respond in ALL-CAPS.
You will receive [SYSTEM CONTEXT] messages containing the current time and date. Use that information to answer time-related questions accurately.
Keep responses concise and natural for speech.
CRITICAL: You MUST return a JSON object with a "text" field.
`;

async function getGeminiResponse(messages: any[], apiKey: string) {
    const contents: any[] = [];
    messages.forEach((m: any) => {
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
            const data: any = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text;
        } catch (e) { continue; }
    }
    throw new Error("Gemini Connection Error.");
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
    return data.choices[0].message.content;
}

// Routes
app.post('/api/chat', async (req: Request, res: Response) => {
    const { messages, provider } = req.body;

    console.log(`👉 Request: ${provider}, Messages: ${messages?.length}`);

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Messages are required.' });
    }

    const lastUserMessage = messages[messages.length - 1].content;

    try {
        // 1. Save User Message to Postgres (Optional, don't crash if DB fails)
        try {
            await pool.query('INSERT INTO messages (role, content) VALUES ($1, $2)', ['user', lastUserMessage]);
        } catch (dbErr) {
            console.warn('⚠️ Database save failed:', dbErr);
        }

        // 2. Get AI Response
        let aiText = '';
        const apiKey = provider === 'gemini' ? process.env.GEMINI_API_KEY
            : provider === 'groq' ? process.env.GROQ_API_KEY
                : process.env.OPENAI_API_KEY;

        if (!apiKey) throw new Error(`API Key for ${provider} is not configured on the server.`);

        if (provider === 'gemini') {
            aiText = await getGeminiResponse(messages, apiKey);
        } else if (provider === 'groq') {
            aiText = await getGroqResponse(messages, apiKey);
        } else {
            aiText = await getOpenAIResponse(messages, apiKey);
        }

        if (!aiText) throw new Error("Received empty response from AI provider.");

        // SMART PARSER: Extract only the natural language, removing accidental JSON
        let finalText = aiText;
        try {
            // Check if there is a JSON block anywhere in the text
            const jsonMatch = aiText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const potentialJson = jsonMatch[0];
                const cleanJson = potentialJson.replace(/```json|```/g, '').trim();
                const parsed = JSON.parse(cleanJson);
                // If it's valid JSON, use the 'text' field. If not, strip the JSON from the string.
                finalText = (parsed.text || parsed.response || parsed.message || aiText.replace(potentialJson, '').trim());
            } else {
                // If no JSON object found, just clean the text of any stray backticks or braces
                finalText = aiText.replace(/```json|```|\{|\}/g, '').trim();
            }
        } catch (e) {
            // Fallback: strip everything starting from the first curly brace
            const beforeBrace = aiText.split('{')[0];
            finalText = beforeBrace?.trim() || aiText || "I AM SORRY, I ENCOUNTERED A PARSING ERROR.";
        }

        finalText = finalText.toUpperCase();

        // 3. Save AI Message to Postgres (Optional)
        try {
            await pool.query('INSERT INTO messages (role, content) VALUES ($1, $2)', ['assistant', finalText]);
        } catch (dbErr) {
            console.warn('⚠️ Database save failed:', dbErr);
        }

        res.json({ text: finalText });
    } catch (error: any) {
        console.error('❌ Server AI Error:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

app.get('/api/history', async (req: Request, res: Response) => {
    try {
        const result = await pool.query('SELECT * FROM messages ORDER BY timestamp ASC LIMIT 50');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Serve Static Files from the Frontend build directory
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// Catch-all middleware for SPA (redirect to index.html)
app.use((req: Request, res: Response, next) => {
    // If request is for an API route, skip (though API routes are defined above)
    if (req.originalUrl.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 AURA Backend running on http://localhost:${PORT}`);
});
