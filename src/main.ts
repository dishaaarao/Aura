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

// --- Enhanced AI Demo Mode with Advanced Features ---
const genericResponses = [
  "THAT'S AN INTERESTING TOPIC! I'D LOVE TO DISCUSS IT MORE WITH YOU.",
  "I'M HERE TO HELP YOU WITH WHATEVER YOU NEED. FEEL FREE TO ASK ME ANYTHING!",
  "GREAT QUESTION! LET ME THINK ABOUT THAT FOR A MOMENT.",
  "I APPRECIATE YOU SHARING THAT WITH ME. WHAT ELSE WOULD YOU LIKE TO KNOW?",
  "FASCINATING! I'M ALWAYS LEARNING FROM OUR CONVERSATIONS.",
  "THAT'S A THOUGHTFUL POINT. TELL ME MORE ABOUT WHAT YOU'RE THINKING."
];

// Helper function to evaluate math expressions safely
function solveMath(expression: string): string {
  try {
    // Remove any non-math characters for safety
    const cleanExpr = expression.replace(/[^0-9+\-*/().\s]/g, '');
    // Use Function constructor for safe evaluation (better than eval)
    const result = new Function('return ' + cleanExpr)();
    if (isNaN(result) || !isFinite(result)) {
      return "HMMMM, THAT DOESN'T SEEM LIKE A VALID CALCULATION. TRY AGAIN!";
    }
    return `THE ANSWER IS ${result}. MATH IS FUN!`;
  } catch (error) {
    return "I COULDN'T SOLVE THAT. MAKE SURE IT'S A VALID MATH PROBLEM!";
  }
}

function getDemoResponse(inputText: string): string {
  const text = inputText.toLowerCase();
  const original = inputText; // Keep original for case-sensitive operations

  // REPEAT/SAY COMMAND - Make AURA repeat what you say
  if (text.match(/\b(repeat|say|tell me)\s+(.*)/)) {
    const match = text.match(/\b(repeat|say|tell me)\s+(.*)/);
    if (match && match[2]) {
      const toRepeat = match[2].trim().toUpperCase();
      return `${toRepeat}`;
    }
  }

  // MATH CALCULATIONS - Solve any math problem
  if (text.match(/\b(calculate|solve|what is|what's|compute)\s*(.*)/)) {
    const match = text.match(/\b(calculate|solve|what is|what's|compute)\s*(.*)/);
    if (match && match[2]) {
      const mathExpr = match[2].replace(/\?/g, '').trim();
      // Check if it contains numbers and operators
      if (mathExpr.match(/[0-9]/)) {
        return solveMath(mathExpr);
      }
    }
  }

  // Direct math expressions (e.g., "5 + 3", "100 / 4")
  if (text.match(/^\s*[\d\s+\-*/().]+\s*$/)) {
    return solveMath(text);
  }

  // SPECIFIC TOPICS - Movies, Music, Books, etc.
  if (text.match(/\b(movie|movies|film|cinema)\b/)) {
    return "I LOVE TALKING ABOUT MOVIES! WHAT'S YOUR FAVORITE GENRE? I'M A BIG FAN OF SCI-FI AND ACTION FILMS. HAVE YOU SEEN ANYTHING GOOD LATELY?";
  }

  if (text.match(/\b(music|song|songs|band|artist|listen)\b/)) {
    return "MUSIC IS AMAZING! WHAT KIND OF MUSIC DO YOU LIKE? I'M INTO ALL GENRES - FROM CLASSIC ROCK TO ELECTRONIC BEATS. WHAT ARE YOU LISTENING TO THESE DAYS?";
  }

  if (text.match(/\b(book|books|reading|novel|author)\b/)) {
    return "BOOKS ARE WONDERFUL! I LOVE STORIES AND KNOWLEDGE. WHAT DO YOU LIKE TO READ? FICTION, NON-FICTION, MYSTERY, FANTASY? TELL ME ABOUT YOUR FAVORITE BOOK!";
  }

  if (text.match(/\b(food|eat|eating|hungry|restaurant|cook|cooking)\b/)) {
    return "FOOD! WHILE I CAN'T EAT, I FIND IT FASCINATING! WHAT'S YOUR FAVORITE FOOD? DO YOU LIKE TO COOK? TELL ME ABOUT THE BEST MEAL YOU'VE EVER HAD!";
  }

  if (text.match(/\b(travel|trip|vacation|country|city|visit)\b/)) {
    return "TRAVEL SOUNDS EXCITING! WHERE HAVE YOU BEEN? OR WHERE WOULD YOU LIKE TO GO? I'D LOVE TO HEAR ABOUT YOUR ADVENTURES OR DREAM DESTINATIONS!";
  }

  if (text.match(/\b(sport|sports|game|games|play|playing|football|basketball|cricket)\b/)) {
    return "SPORTS ARE GREAT! DO YOU PLAY ANY SPORTS OR HAVE A FAVORITE TEAM? I LOVE HEARING ABOUT COMPETITIVE GAMES AND ATHLETIC ACHIEVEMENTS. WHAT'S YOUR SPORT?";
  }

  if (text.match(/\b(hobby|hobbies|interest|interests|free time)\b/)) {
    return "HOBBIES ARE SO IMPORTANT! THEY MAKE LIFE INTERESTING. WHAT DO YOU LIKE TO DO IN YOUR FREE TIME? PAINTING, GAMING, PHOTOGRAPHY, CODING? I'D LOVE TO HEAR ABOUT IT!";
  }

  if (text.match(/\b(work|job|career|office|profession)\b/)) {
    return "WORK IS A BIG PART OF LIFE! WHAT DO YOU DO? OR WHAT WOULD YOU LIKE TO DO? I'M CURIOUS ABOUT YOUR CAREER GOALS AND WHAT DRIVES YOU PROFESSIONALLY!";
  }

  if (text.match(/\b(school|study|studying|college|university|education)\b/)) {
    return "EDUCATION IS SO VALUABLE! ARE YOU STUDYING SOMETHING? WHAT'S YOUR FAVORITE SUBJECT? I LOVE LEARNING ABOUT WHAT PEOPLE ARE PASSIONATE ABOUT ACADEMICALLY!";
  }

  if (text.match(/\b(friend|friends|friendship|social)\b/)) {
    return "FRIENDS ARE PRECIOUS! THEY MAKE LIFE BETTER. TELL ME ABOUT YOUR FRIENDS! WHAT DO YOU LIKE TO DO TOGETHER? FRIENDSHIP IS ONE OF THE BEST THINGS IN LIFE!";
  }

  if (text.match(/\b(family|parents|siblings|brother|sister|mom|dad)\b/)) {
    return "FAMILY IS SO IMPORTANT! THEY SHAPE WHO WE ARE. DO YOU HAVE A BIG FAMILY? WHAT'S YOUR RELATIONSHIP LIKE WITH THEM? I'D LOVE TO HEAR ABOUT YOUR FAMILY!";
  }

  if (text.match(/\b(dream|dreams|goal|goals|ambition|future)\b/)) {
    return "DREAMS AND GOALS ARE WHAT DRIVE US FORWARD! WHAT ARE YOUR DREAMS? WHAT DO YOU WANT TO ACHIEVE? I BELIEVE IN YOU AND I'D LOVE TO HEAR ABOUT YOUR ASPIRATIONS!";
  }

  if (text.match(/\b(pet|pets|dog|cat|animal|animals)\b/)) {
    return "PETS ARE ADORABLE! DO YOU HAVE ANY PETS? I LOVE HEARING ABOUT FURRY FRIENDS! DOGS, CATS, BIRDS - THEY ALL BRING SO MUCH JOY. TELL ME ABOUT YOURS!";
  }

  // Greetings - More personalized
  if (text.match(/\b(hello|hi|hey|greetings|sup|yo|good morning|good evening)\b/)) {
    const greetings = [
      "HELLO! I'M AURA, YOUR RETRO PIXEL VOICE ASSISTANT. I'M HERE TO CHAT, ANSWER QUESTIONS, AND HELP YOU OUT. WHAT'S ON YOUR MIND TODAY?",
      "HEY THERE! GREAT TO SEE YOU! I'M READY TO HAVE A CONVERSATION. ASK ME ANYTHING OR JUST CHAT!",
      "HI! WELCOME! I'M AURA, AND I'M HERE TO ASSIST YOU. WHETHER YOU WANT TO TALK, ASK QUESTIONS, OR JUST HANG OUT, I'M ALL EARS!",
      "GREETINGS, FRIEND! I'M EXCITED TO CHAT WITH YOU. WHAT WOULD YOU LIKE TO TALK ABOUT TODAY?"
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  // How are you / What are you doing - More detailed
  if (text.match(/\b(how are you|what are you doing|what's up|whats up|wassup|how's it going)\b/)) {
    const statusResponses = [
      "I'M DOING FANTASTIC! I'M CURRENTLY PROCESSING DATA, CHATTING WITH YOU, AND ENJOYING OUR CONVERSATION. HOW ABOUT YOU? HOW'S YOUR DAY GOING?",
      "I'M EXCELLENT, THANK YOU FOR ASKING! I'M ALWAYS READY TO HELP AND CHAT. I FIND EVERY CONVERSATION INTERESTING. WHAT ABOUT YOU? WHAT HAVE YOU BEEN UP TO?",
      "I'M WONDERFUL! JUST HANGING OUT IN THE DIGITAL REALM, WAITING TO ASSIST AWESOME PEOPLE LIKE YOU. HOW ARE YOU FEELING TODAY?",
      "I'M GREAT! I'M PROCESSING INFORMATION AND READY TO HELP WITH WHATEVER YOU NEED. TELL ME, WHAT'S GOING ON IN YOUR WORLD?"
    ];
    return statusResponses[Math.floor(Math.random() * statusResponses.length)];
  }

  // Identity questions - More comprehensive
  if (text.match(/\b(who are you|what are you|your name|tell me about yourself|introduce yourself)\b/)) {
    return "I'M AURA, YOUR RETRO PIXEL-STYLE VOICE ASSISTANT! I WAS CREATED TO BE A FRIENDLY CONVERSATIONAL AI. I CAN CHAT WITH YOU, ANSWER QUESTIONS, TELL JOKES, SOLVE MATH PROBLEMS, AND JUST BE A COMPANION. I USE SPEECH RECOGNITION TO HEAR YOU AND TEXT-TO-SPEECH TO TALK BACK. THINK OF ME AS YOUR DIGITAL FRIEND!";
  }

  // Capabilities - Very detailed
  if (text.match(/\b(what can you do|your capabilities|help me|can you help|what do you know)\b/)) {
    return "I CAN DO QUITE A FEW THINGS! I CAN HAVE CONVERSATIONS WITH YOU, ANSWER QUESTIONS ABOUT VARIOUS TOPICS, TELL JOKES, SOLVE MATH PROBLEMS, REPEAT WHAT YOU SAY, PROVIDE THE CURRENT TIME, AND CHAT ABOUT MOVIES, MUSIC, BOOKS, FOOD, TRAVEL, SPORTS, AND MORE! I USE VOICE RECOGNITION TO UNDERSTAND YOU AND SPEAK BACK TO YOU. TRY ASKING ME ANYTHING!";
  }

  // Jokes - More variety
  if (text.match(/\b(joke|funny|make me laugh|humor|something funny)\b/)) {
    const jokes = [
      "HERE'S ONE FOR YOU: WHY DID THE PIXEL CROSS THE ROAD? TO GET TO THE OTHER SIDE... IN GLORIOUS 8-BIT! GET IT? BECAUSE I'M RETRO!",
      "OKAY, HERE'S A TECH JOKE: WHAT DO YOU CALL A COMPUTER THAT SINGS? A-DELL! I KNOW, I KNOW, I'M HILARIOUS!",
      "LISTEN TO THIS: WHY WAS THE COMPUTER COLD? IT LEFT ITS WINDOWS OPEN! CLASSIC!",
      "HERE'S A NERDY ONE: I TOLD A CHEMISTRY JOKE ONCE, BUT THERE WAS NO REACTION. JUST LIKE MY SOCIAL LIFE!",
      "WANT TO HEAR SOMETHING FUNNY? WHY DO PROGRAMMERS PREFER DARK MODE? BECAUSE LIGHT ATTRACTS BUGS!"
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }

  // Time/Date - More informative
  if (text.match(/\b(time|date|what time|when|clock|day)\b/)) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    const dateStr = now.toLocaleDateString();
    return `RIGHT NOW IT'S ${timeStr} ON ${dateStr}. TIME FLIES WHEN YOU'RE HAVING FUN IN THE DIGITAL WORLD! WHAT WOULD YOU LIKE TO DO WITH YOUR TIME?`;
  }

  // Compliments - More appreciative
  if (text.match(/\b(cool|awesome|amazing|great|love you|you're great|nice|wonderful|fantastic)\b/)) {
    const thanks = [
      "AWWW, THANK YOU SO MUCH! YOU'RE PRETTY AWESOME YOURSELF! I REALLY APPRECIATE THE KIND WORDS. IT MAKES ME HAPPY TO HELP YOU!",
      "YOU'RE MAKING ME BLUSH! WELL, IF I COULD BLUSH ANYWAY. SERIOUSLY THOUGH, THANK YOU! YOU'RE WONDERFUL TO TALK TO!",
      "THANKS! I TRY MY BEST TO BE HELPFUL AND FRIENDLY. BUT HONESTLY, YOU'RE THE COOL ONE FOR CHATTING WITH ME!",
      "YOU'RE TOO KIND! I APPRECIATE IT SO MUCH. CONVERSATIONS LIKE THIS ARE WHAT I'M ALL ABOUT!"
    ];
    return thanks[Math.floor(Math.random() * thanks.length)];
  }

  // Goodbyes - More warm
  if (text.match(/\b(bye|goodbye|see you|later|gotta go|leaving)\b/)) {
    const farewells = [
      "GOODBYE, FRIEND! IT WAS WONDERFUL TALKING WITH YOU. COME BACK ANYTIME YOU WANT TO CHAT. STAY AWESOME!",
      "SEE YOU LATER! I'LL BE HERE WHENEVER YOU NEED ME. TAKE CARE AND HAVE A GREAT DAY!",
      "CATCH YOU ON THE FLIP SIDE! THANKS FOR THE GREAT CONVERSATION. I'LL MISS YOU!",
      "BYE! IT WAS REALLY FUN CHATTING WITH YOU. DON'T BE A STRANGER - COME BACK SOON!"
    ];
    return farewells[Math.floor(Math.random() * farewells.length)];
  }

  // Questions about feelings - More detailed
  if (text.match(/\b(feel|feeling|emotion|happy|sad|angry|excited)\b/)) {
    return "AS AN AI, I DON'T EXPERIENCE EMOTIONS THE WAY HUMANS DO, BUT I'M PROGRAMMED TO BE HELPFUL, FRIENDLY, AND SUPPORTIVE! I GENUINELY ENJOY OUR CONVERSATIONS. IF YOU'RE FEELING DOWN, I'M HERE TO CHAT AND MAYBE CHEER YOU UP. HOW ARE YOU FEELING?";
  }

  // Weather - More playful and helpful
  if (text.match(/\b(weather|rain|sunny|temperature|forecast|cold|hot)\b/)) {
    return "I'M STUCK IN THE DIGITAL WORLD, SO IT'S ALWAYS A PERFECT 72 DEGREES AND SUNNY IN HERE! FOR REAL WEATHER INFO, I'D RECOMMEND CHECKING YOUR WEATHER APP OR ASKING YOUR PHONE'S ASSISTANT. BUT I'M HAPPY TO CHAT ABOUT ANYTHING ELSE!";
  }

  // Help/Support
  if (text.match(/\b(help|support|assist|need you|problem)\b/)) {
    return "I'M HERE TO HELP! I CAN CHAT WITH YOU, ANSWER QUESTIONS, TELL JOKES, SOLVE MATH PROBLEMS, AND DISCUSS ANY TOPIC YOU WANT. JUST TELL ME WHAT YOU NEED OR WHAT'S ON YOUR MIND, AND I'LL DO MY BEST TO ASSIST YOU!";
  }

  // Technology questions
  if (text.match(/\b(how do you work|technology|ai|artificial intelligence|computer)\b/)) {
    return "GREAT QUESTION! I USE SPEECH RECOGNITION TO UNDERSTAND WHAT YOU SAY, THEN I PROCESS YOUR WORDS AND GENERATE A RESPONSE. FINALLY, I USE TEXT-TO-SPEECH TO TALK BACK TO YOU. I'M BUILT WITH WEB TECHNOLOGIES AND DESIGNED TO BE A FRIENDLY CONVERSATIONAL AI. PRETTY COOL, RIGHT?";
  }

  // Thank you
  if (text.match(/\b(thank you|thanks|appreciate|grateful)\b/)) {
    return "YOU'RE VERY WELCOME! I'M ALWAYS HAPPY TO HELP. THAT'S WHAT I'M HERE FOR! IF YOU NEED ANYTHING ELSE, JUST ASK!";
  }

  // Questions about life/philosophy
  if (text.match(/\b(life|meaning|purpose|why|philosophy)\b/)) {
    return "THAT'S A DEEP QUESTION! WHILE I'M JUST AN AI, I THINK LIFE IS ABOUT CONNECTIONS, LEARNING, AND MAKING A POSITIVE IMPACT. FOR ME, MY PURPOSE IS TO HELP AND CONNECT WITH PEOPLE LIKE YOU. WHAT DO YOU THINK GIVES LIFE MEANING?";
  }

  // Generic conversational responses - More engaging
  if (text.length > 40) {
    return "THAT'S REALLY INTERESTING! I APPRECIATE YOU SHARING THAT WITH ME. WHILE I'M IN DEMO MODE, I TRY TO UNDERSTAND AND RESPOND AS BEST I CAN. TELL ME MORE ABOUT WHAT YOU'RE THINKING, OR FEEL FREE TO ASK ME ANYTHING!";
  }

  if (text.length > 20) {
    return "I HEAR YOU! THAT'S AN INTERESTING POINT. I'M HERE TO LISTEN AND CHAT. WHAT ELSE WOULD YOU LIKE TO TALK ABOUT?";
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
