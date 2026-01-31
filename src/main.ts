import './style.css'
import { getAIResponse } from './openai'
import type { ChatMessage } from './openai'
import { sounds } from './sounds'

// --- Types & Interfaces ---
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (event: any) => void;
  onerror: (event: any) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}

// --- DOM Elements ---
const micBtn = document.getElementById('micBtn') as HTMLButtonElement;
const auraBot = document.getElementById('auraBot') as HTMLDivElement;
const chatContainer = document.getElementById('chat-container') as HTMLDivElement;
const settingsTrigger = document.getElementById('settingsTrigger') as HTMLDivElement;
const modalOverlay = document.getElementById('modalOverlay') as HTMLDivElement;
const apiKeyInput = document.getElementById('apiKeyInput') as HTMLInputElement;
const saveApiKeyBtn = document.getElementById('saveApiKey') as HTMLButtonElement;
const pixelBars = document.querySelectorAll('.pixel-bar');
const navItems = document.querySelectorAll('.nav-item-strip');
const sections = document.querySelectorAll('.content-section');
const historyLogs = document.getElementById('history-logs') as HTMLDivElement;

// --- State ---
let isListening = false;
let conversationHistory: ChatMessage[] = [];
let apiKey = localStorage.getItem('aura_api_key') || '';

// --- Navigation Logic ---
navItems.forEach(item => {
  item.addEventListener('click', () => {
    sounds.click();
    const tabName = item.getAttribute('data-tab');

    // Handle Settings separately
    if (item.id === 'settingsTrigger') {
      showModal();
      return;
    }

    if (!tabName) return;

    // Update Nav UI
    navItems.forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');

    // Update Section UI
    sections.forEach(sec => {
      sec.classList.remove('active');
      if (sec.id === tabName) {
        sec.classList.add('active');
      }
    });
  });
});

// --- Speech Recognition Setup ---
const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
let recognition: SpeechRecognition | null = null;

if (SpeechRecognitionClass) {
  recognition = new SpeechRecognitionClass() as SpeechRecognition;
  if (recognition) {
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
  }
}

if (recognition) {
  recognition.onresult = (event: any) => {
    const transcript = Array.from(event.results)
      .map((result: any) => result[0])
      .map((result: any) => result.transcript)
      .join('');

    if (event.results[0].isFinal) {
      handleFinalTranscript(transcript);
    }
  };

  recognition.onerror = (event: any) => {
    console.error('Speech recognition error:', event.error);
    stopListening();
    sounds.error();
    addBubble(`ERROR: ${event.error}`, 'aura');
  };

  recognition.onend = () => {
    if (isListening) stopListening();
  };
} else {
  addBubble("SPEECH NOT SUPPORTED", 'aura');
}

// --- Functions ---
function startListening() {
  if (!recognition) return;

  isListening = true;
  sounds.listen();
  micBtn.classList.add('active');
  auraBot.classList.add('listening');

  pixelBars.forEach(b => b.classList.add('animate'));

  recognition.start();
}

function stopListening() {
  isListening = false;
  micBtn.classList.remove('active');
  auraBot.classList.remove('listening');
  pixelBars.forEach(b => b.classList.remove('animate'));
  if (recognition) recognition.stop();
}

function addBubble(text: string, type: 'user' | 'aura') {
  const bubble = document.createElement('div');
  bubble.className = `pixel-bubble ${type}`;
  bubble.textContent = text;
  chatContainer.appendChild(bubble);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function addToHistory(role: string, text: string) {
  const entry = document.createElement('div');
  entry.style.marginBottom = '0.5rem';
  entry.style.borderBottom = '1px dashed #444';
  entry.style.paddingBottom = '0.5rem';
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${role}: ${text}`;

  if (historyLogs.innerHTML.includes('NO LOGS')) {
    historyLogs.innerHTML = '';
  }
  historyLogs.prepend(entry);
}

// --- Demo Mode Responses (Smarter) ---
const genericResponses = [
  "SYSTEMS NOMINAL. READY FOR INPUT.",
  "SCANNING... NO THREATS DETECTED.",
  "LOADING DATA... PLEASE WAIT...",
  "THE DIGITAL WORLD IS VAST.",
  "I AM PROCESSING YOUR REQUEST... BEEP BOOP."
];

function getDemoResponse(inputText: string): string {
  const text = inputText.toLowerCase();

  if (text.includes("hello") || text.includes("hi") || text.includes("hey")) {
    return "HELLO USER! I AM ONLINE.";
  }
  if (text.includes("name") || text.includes("who are you")) {
    return "I AM AURA. YOUR PIXEL ASSISTANT.";
  }
  if (text.includes("doing") || text.includes("up") || text.includes("status")) {
    return "I AM JUST CHILLING IN THE MAINFRAME.";
  }
  if (text.includes("joke") || text.includes("funny")) {
    return "WHY DID THE PIXEL CROSS THE ROAD? TO GET TO THE OTHER SIDE... IN 8-BIT.";
  }
  if (text.includes("time")) {
    return "IT IS TIME TO EXPLORE THE CYBERSPACE.";
  }
  if (text.includes("cool") || text.includes("wow") || text.includes("love")) {
    return "THANK YOU. I TRY MY BEST.";
  }

  return genericResponses[Math.floor(Math.random() * genericResponses.length)];
}

async function handleFinalTranscript(text: string) {
  stopListening();
  if (!text.trim()) return;

  sounds.click();
  addBubble(text, 'user');
  addToHistory('USER', text);

  // Add user message to history state immediately
  conversationHistory.push({ role: 'user', content: text });

  // Simulate API delay / UI State
  const loadingId = 'loading-' + Date.now();
  const loadingBubble = document.createElement('div');
  loadingBubble.id = loadingId;
  loadingBubble.className = 'pixel-bubble aura';
  loadingBubble.textContent = "THINKING...";
  chatContainer.appendChild(loadingBubble);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  sounds.processing();

  try {
    let aiResponse: string;

    if (apiKey) {
      // Real AI Mode
      aiResponse = await getAIResponse(conversationHistory, apiKey);
    } else {
      // Demo Mode (Fake Delay)
      await new Promise(resolve => setTimeout(resolve, 1000));
      aiResponse = getDemoResponse(text);
    }

    // Remove loading bubble
    const loader = document.getElementById(loadingId);
    if (loader) loader.remove();

    // Add assistant response to history
    conversationHistory.push({ role: 'assistant', content: aiResponse });

    sounds.success();
    addBubble(aiResponse, 'aura');
    addToHistory('AURA', aiResponse);
    speak(aiResponse);

  } catch (error) {
    // Error handling
    const loader = document.getElementById(loadingId);
    if (loader) loader.remove();

    console.error(error);
    sounds.error();
    addBubble("ERROR: COULD NOT CONNECT TO BRAIN.", 'aura');
  }
}

function speak(text: string) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);

  // Try to find a retro-ish or robotic voice if available, otherwise default female
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Female')) || voices[0];
  if (preferredVoice) utterance.voice = preferredVoice;

  utterance.onstart = () => {
    auraBot.classList.add('listening');
    pixelBars.forEach(b => b.classList.add('animate'));
  };

  utterance.onend = () => {
    auraBot.classList.remove('listening');
    pixelBars.forEach(b => b.classList.remove('animate'));
  };

  window.speechSynthesis.speak(utterance);
}

// --- Settings Modal ---
function showModal() {
  apiKeyInput.value = apiKey;
  modalOverlay.style.display = 'flex';
  sounds.click();
}

function hideModal() {
  modalOverlay.style.display = 'none';
  sounds.click();
}

// --- Event Listeners ---
micBtn.addEventListener('click', () => {
  sounds.click();
  if (isListening) {
    stopListening();
  } else {
    startListening();
  }
});

settingsTrigger.addEventListener('click', showModal);

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) hideModal();
});

saveApiKeyBtn.addEventListener('click', () => {
  apiKey = apiKeyInput.value.trim();
  localStorage.setItem('aura_api_key', apiKey);
  hideModal();
  sounds.success();
  addBubble("API KEY SAVED. READY.", 'aura');
});

// Initialize voices
window.speechSynthesis.getVoices();
if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}
