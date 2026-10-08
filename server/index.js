const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- FIREBASE IMPORT ---
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc } = require('firebase/firestore');

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyAAoXFJ3-azqk-ma_rHWTNkxe3Ld3KZEbc",
  authDomain: "chatbotai-8b85b.firebaseapp.com",
  projectId: "chatbotai-8b85b",
  storageBucket: "chatbotai-8b85b.firebasestorage.app",
  messagingSenderId: "226816260944",
  appId: "1:226816260944:web:138406206c1b8b42008a55",
  measurementId: "G-2KM0ERY2GF"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// --- PENGATURAN BOT ---
let botSettings = {
  botEnabled: true,
  ignoreGroups: true,
  systemPrompt: "Anda adalah asisten AI pintar untuk WhatsApp Bisnis. Anda harus menjawab pertanyaan pelanggan berdasarkan 'Knowledge Base' yang diberikan di bawah ini. Jawab dengan ramah, sopan, dan persuasif berbahasa Indonesia.",
  knowledgeItems: [
    { id: '1', title: 'Info Dasar', content: 'Kami adalah layanan bisnis profesional.' }
  ],
  ignoredNumbers: []
};

// Fungsi memuat Knowledge Base & Settings dari Firebase
async function loadSettingsFromFirebase() {
  try {
    const docRef = doc(db, "bot_config", "settings");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      botSettings = { 
        ...botSettings, 
        ...data,
        knowledgeItems: data.knowledgeItems || botSettings.knowledgeItems,
        ignoredNumbers: data.ignoredNumbers || botSettings.ignoredNumbers
      };
      console.log('✅ Berhasil memuat Knowledge Base dari Firebase');
    } else {
      console.log('Knowledge Base kosong. Membuat dokumen baru di Firebase...');
      await setDoc(docRef, botSettings);
    }
  } catch (err) {
    console.error('Gagal mengambil data dari Firebase:', err);
  }
}
loadSettingsFromFirebase();

// Fungsi menyimpan Knowledge Base ke Firebase
async function saveSettingsToFirebase(newSettings) {
  try {
    const docRef = doc(db, "bot_config", "settings");
    await setDoc(docRef, newSettings, { merge: true });
    console.log('💾 Pengaturan & Knowledge Base tersimpan di Firebase');
  } catch (err) {
    console.error('Gagal menyimpan ke Firebase:', err);
  }
}

// --- GEMINI AI CONFIG ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'ISI_API_KEY_ANDA_DISINI');

// Urutan model cadangan: kalau satu sedang sibuk (503) / limit (429), otomatis pindah ke model berikutnya
const MODEL_CHAIN = [
  'gemini-flash-lite-latest', // tercepat (~0.7 detik)
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
];
const RETRYABLE_STATUS = [429, 500, 503, 504];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getAiResponse(userMessage) {
  if (!process.env.GEMINI_API_KEY) {
    return "Mohon maaf, sistem AI belum dikonfigurasi (API Key hilang).";
  }

  // Compile Knowledge Base
  const compiledKnowledge = botSettings.knowledgeItems.map(item => `[${item.title}]: ${item.content}`).join('\n');
  const prompt = `${botSettings.systemPrompt}\n\n=== KNOWLEDGE BASE ===\n${compiledKnowledge}\n====================\n\nPesan Pelanggan: "${userMessage}"`;

  for (const modelName of MODEL_CHAIN) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const start = Date.now();
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        console.log(`🤖 [${modelName}] menjawab dalam ${Date.now() - start}ms`);
        return text;
      } catch (error) {
        const status = error.status;
        console.warn(`⚠️ [${modelName}] percobaan ${attempt} gagal (${status || 'unknown'}): ${error.message?.slice(0, 120)}`);
        if (!RETRYABLE_STATUS.includes(status)) break; // error non-sementara -> langsung coba model lain
        if (attempt < 2) await sleep(1000);
      }
    }
  }

  console.error('❌ Semua model Gemini gagal merespons.');
  return "Maaf, saya sedang mengalami kendala teknis saat ini.";
}

// --- WHATSAPP CONFIG ---
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

let isClientReady = false;
let currentQrCode = '';

client.on('qr', async (qr) => {
  console.log('QR Code diterima, silakan scan!');
  try {
    const qrDataUrl = await qrcode.toDataURL(qr);
    currentQrCode = qrDataUrl;
    io.emit('qr', qrDataUrl);
  } catch (err) {
    console.error('Gagal men-generate QR', err);
  }
});

client.on('ready', () => {
  console.log('Client WhatsApp sudah siap dan terhubung!');
  isClientReady = true;
  io.emit('ready', 'WhatsApp Client is ready!');
});

client.on('authenticated', () => {
  console.log('Autentikasi berhasil!');
  io.emit('authenticated', 'Authenticated successfully!');
});

// Cegah pesan yang sama diproses dua kali
const processedIds = new Set();

client.on('message', async (message) => {
  const msgId = message.id?._serialized;
  if (msgId) {
    if (processedIds.has(msgId)) return;
    processedIds.add(msgId);
    if (processedIds.size > 500) processedIds.delete(processedIds.values().next().value);
  }

  console.log(`Pesan masuk [mentah] dari ${message.from}: ${message.body}`);
  
  if (message.from === 'status@broadcast') return;
  
  // Daftar nomor yang TIDAK BOLEH dibalas oleh AI (gabungan dari UI dan sistem)
  const ignoredNumbers = [
    '0@c.us', // Nomor resmi sistem WhatsApp
    ...(botSettings.ignoredNumbers || [])
  ];

  if (ignoredNumbers.some(num => typeof num === 'string' && num.trim() !== '' && message.from.includes(num.trim()))) {
    console.log(`Pesan dari ${message.from} diabaikan (masuk daftar hitam AI).`);
    return;
  }

  if (!botSettings.botEnabled) {
    console.log('Bot dimatikan, mengabaikan pesan.');
    return;
  }
  
  if (botSettings.ignoreGroups && message.from.endsWith('@g.us')) {
    console.log('Pesan dari grup diabaikan.');
    return;
  }

  io.emit('message_in', { from: message.from, body: message.body });
  
  try {
    const aiReply = await getAiResponse(message.body);
    await message.reply(aiReply);
    console.log(`Balasan AI terkirim ke ${message.from}: ${aiReply}`);
    io.emit('message_out', { to: message.from, body: aiReply });
  } catch (err) {
    console.error('Gagal membalas pesan:', err);
  }
});

client.initialize();

// --- SOCKET IO ---
io.on('connection', (socket) => {
  console.log('Frontend terhubung ke Socket.io');
  
  // Kirim state awal yang diambil dari Firebase
  socket.emit('settings', botSettings);

  if (isClientReady) {
    socket.emit('ready', 'WhatsApp Client is ready!');
  } else if (currentQrCode) {
    socket.emit('qr', currentQrCode);
  }

  // Terima update setting dari frontend
  socket.on('update_settings', async (newSettings) => {
    botSettings = { ...botSettings, ...newSettings };
    console.log('Pengaturan bot diperbarui dari UI, menyimpan ke Firebase...');
    await saveSettingsToFirebase(botSettings);
    io.emit('settings', botSettings);
  });

  // Terima permintaan logout dari UI
  socket.on('logout', async () => {
    console.log('Permintaan logout diterima dari UI');
    try {
      if (isClientReady) {
        await client.logout();
      }
      isClientReady = false;
      currentQrCode = '';
      io.emit('logout_success');
      console.log('Berhasil logout. Memulai ulang client untuk QR baru...');
      await client.initialize();
    } catch (err) {
      console.error('Gagal logout:', err);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server Backend berjalan di http://localhost:${PORT}`);
});
