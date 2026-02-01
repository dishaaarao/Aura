import './style.css'
import { getAIResponse } from './ai'
import type { ChatMessage, AIProvider } from './ai'
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
const providerSelect = document.getElementById('providerSelect') as HTMLSelectElement;
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
let provider: AIProvider = (localStorage.getItem('aura_provider') as AIProvider) || 'gemini';

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

// --- Functions ---
async function handleFinalTranscript(text: string) {
  stopListening();
  if (!text.trim()) return;

  sounds.click();
  addBubble(text, 'user');
  addToHistory('USER', text);

  // Add user message to history state immediately
  conversationHistory.push({ role: 'user', content: text });

  // UI State
  const loadingId = 'loading-' + Date.now();
  const loadingBubble = document.createElement('div');
  loadingBubble.id = loadingId;
  loadingBubble.className = 'pixel-bubble aura';
  loadingBubble.textContent = "THINKING...";
  chatContainer.appendChild(loadingBubble);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  sounds.processing();

  try {
    // Inject the latest local time/date/day context so AURA is always accurate
    const timeContext: ChatMessage = {
      role: 'system',
      content: `[SYSTEM CONTEXT] The current local time is ${new Date().toLocaleString()}. Provide this if asked.`
    };

    const aiResult = await getAIResponse([...conversationHistory, timeContext], apiKey, provider);
    const aiResponse = aiResult.text;

    // Remove loading bubble
    const loader = document.getElementById(loadingId);
    if (loader) loader.remove();

    // Add assistant response to history
    conversationHistory.push({ role: 'assistant', content: aiResponse });

    // Logging Intent
    if (aiResult.intent) {
      console.log('Intent Detected:', aiResult.intent);
    }

    sounds.success();
    addBubble(aiResponse, 'aura');
    addToHistory('AURA', aiResponse);
    speak(aiResponse);

  } catch (error: any) {
    const loader = document.getElementById(loadingId);
    if (loader) loader.remove();

    console.error('Handled Error:', error);
    sounds.error();

    let errorMsg = "OOPS! SOMETHING WENT WRONG.";

    if (error.message.includes('API Key') || error.message.includes('key')) {
      errorMsg = "API KEY ERROR! CHECK SETTINGS.";
    } else if (error.message.includes('INTERNAL_PARSE_ERROR') || error.message.includes('JSON')) {
      errorMsg = "INVALID AI DATA. TRY AGAIN.";
    } else if (error.message) {
      errorMsg = error.message.toUpperCase().substring(0, 50);
    }

    addBubble(`ERROR: ${errorMsg}`, 'aura');
    speak("ERROR DETECTED");
  }
}

function speak(text: string) {
  window.speechSynthesis.cancel();

  // Convert to sentence case for better pronunciation (engines often spell out all-caps)
  const spokenText = text.toLowerCase().replace(/(^\w|\.\s+\w)/gm, s => s.toUpperCase());
  const utterance = new SpeechSynthesisUtterance(spokenText);

  // Improved Voice Selection Logic
  const voices = window.speechSynthesis.getVoices();

  // Prioritize "Premium" or "Google" voices which are usually higher quality
  let selectedVoice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
    || voices.find(v => (v.name.includes('Premium') || v.name.includes('Enhanced')) && v.lang.startsWith('en'))
    || voices.find(v => v.lang.startsWith('en'))
    || voices[0];

  if (selectedVoice) utterance.voice = selectedVoice;

  // Tuning for clarity
  utterance.rate = 0.95; // Slightly slower for better articulation
  utterance.pitch = 1.0; // Keep it natural
  utterance.volume = 1.0;

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
  providerSelect.value = provider;
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
  provider = providerSelect.value as AIProvider;

  localStorage.setItem('aura_api_key', apiKey);
  localStorage.setItem('aura_provider', provider);

  hideModal();
  sounds.success();
  addBubble(`SETTINGS UPDATED: ${provider.toUpperCase()} ACTIVE.`, 'aura');
});

// Initialize voices
window.speechSynthesis.getVoices();
if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}
