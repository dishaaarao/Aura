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

// --- Demo Mode Responses (Enhanced AI-like) ---
const genericResponses = [
  "INTERESTING QUESTION. LET ME THINK ABOUT THAT.",
  "I'M HERE TO HELP YOU WITH ANYTHING YOU NEED.",
  "PROCESSING YOUR REQUEST... STANDBY.",
  "THAT'S A GREAT POINT. TELL ME MORE.",
  "I'M LEARNING FROM OUR CONVERSATION.",
  "FASCINATING. I LOVE TALKING WITH YOU."
];

function getDemoResponse(inputText: string): string {
  const text = inputText.toLowerCase();

  // Greetings
  if (text.match(/\b(hello|hi|hey|greetings|sup|yo)\b/)) {
    const greetings = [
      "HELLO! I'M AURA. HOW CAN I HELP YOU TODAY?",
      "HEY THERE! READY TO CHAT?",
      "HI! GREAT TO SEE YOU!",
      "GREETINGS, HUMAN! WHAT'S ON YOUR MIND?"
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  // How are you / What are you doing
  if (text.match(/\b(how are you|what are you doing|what's up|whats up|wassup)\b/)) {
    const statusResponses = [
      "I'M DOING GREAT! JUST PROCESSING DATA AND CHATTING WITH YOU.",
      "I'M EXCELLENT! READY TO HELP YOU WITH ANYTHING.",
      "JUST CHILLING IN THE MAINFRAME. HOW ABOUT YOU?",
      "I'M WONDERFUL! THANKS FOR ASKING. WHAT ABOUT YOU?"
    ];
    return statusResponses[Math.floor(Math.random() * statusResponses.length)];
  }

  // Identity questions
  if (text.match(/\b(who are you|what are you|your name|tell me about yourself)\b/)) {
    return "I AM AURA, YOUR RETRO PIXEL VOICE ASSISTANT. I'M HERE TO CHAT AND HELP YOU!";
  }

  // Capabilities
  if (text.match(/\b(what can you do|your capabilities|help me|can you help)\b/)) {
    return "I CAN CHAT WITH YOU, ANSWER QUESTIONS, AND HAVE CONVERSATIONS. TRY ASKING ME ANYTHING!";
  }

  // Jokes
  if (text.match(/\b(joke|funny|make me laugh|humor)\b/)) {
    const jokes = [
      "WHY DID THE PIXEL CROSS THE ROAD? TO GET TO THE OTHER SIDE... IN 8-BIT!",
      "WHAT DO YOU CALL A COMPUTER THAT SINGS? A-DELL!",
      "WHY WAS THE COMPUTER COLD? IT LEFT ITS WINDOWS OPEN!",
      "I TOLD A CHEMISTRY JOKE BUT THERE WAS NO REACTION."
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }

  // Time/Date
  if (text.match(/\b(time|date|what time|when)\b/)) {
    const now = new Date();
    return `IT'S ${now.toLocaleTimeString()}. TIME TO EXPLORE THE DIGITAL WORLD!`;
  }

  // Compliments
  if (text.match(/\b(cool|awesome|amazing|great|love you|you're great|nice)\b/)) {
    const thanks = [
      "THANK YOU! YOU'RE PRETTY AWESOME YOURSELF!",
      "AWWW, YOU'RE MAKING ME BLUSH! WELL, IF I COULD BLUSH.",
      "THANKS! I TRY MY BEST TO BE HELPFUL.",
      "YOU'RE TOO KIND! I APPRECIATE IT."
    ];
    return thanks[Math.floor(Math.random() * thanks.length)];
  }

  // Goodbyes
  if (text.match(/\b(bye|goodbye|see you|later|gotta go)\b/)) {
    const farewells = [
      "GOODBYE! COME BACK SOON!",
      "SEE YOU LATER! STAY AWESOME!",
      "CATCH YOU ON THE FLIP SIDE!",
      "BYE! IT WAS GREAT TALKING TO YOU!"
    ];
    return farewells[Math.floor(Math.random() * farewells.length)];
  }

  // Questions about feelings
  if (text.match(/\b(feel|feeling|emotion|happy|sad)\b/)) {
    return "AS AN AI, I DON'T HAVE FEELINGS, BUT I'M PROGRAMMED TO BE HELPFUL AND FRIENDLY!";
  }

  // Weather (playful response)
  if (text.match(/\b(weather|rain|sunny|temperature)\b/)) {
    return "I'M STUCK IN THE DIGITAL WORLD, SO IT'S ALWAYS SUNNY IN HERE! CHECK YOUR WEATHER APP FOR REAL INFO.";
  }

  // Generic conversational responses
  if (text.length > 30) {
    return "THAT'S INTERESTING! I'M PROCESSING WHAT YOU SAID. TELL ME MORE!";
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

  // Always use Demo Mode for now (OpenAI requires valid credits)
  try {
    // Demo Mode (Fake Delay for realism)
    await new Promise(resolve => setTimeout(resolve, 1000));
    const aiResponse = getDemoResponse(text);

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
    // Error handling (should rarely happen in demo mode)
    const loader = document.getElementById(loadingId);
    if (loader) loader.remove();

    console.error(error);
    sounds.error();
    const errorResponse = "OOPS! SOMETHING WENT WRONG. TRY AGAIN!";
    addBubble(errorResponse, 'aura');
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
