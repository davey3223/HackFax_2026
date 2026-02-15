const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Health Check ---
app.get('/api/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const dbState = states[mongoose.connection.readyState] || 'unknown';
  const geminiConfigured = Boolean(process.env.GOOGLE_API_KEY);
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  res.json({
    status: 'ok',
    db: dbState,
    geminiConfigured,
    geminiModel
  });
});

// --- Database Connection ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Warehouse Connected: MongoDB Atlas'))
  .catch(err => console.error('❌ Connection Error:', err));

// --- External API Clients ---
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

// --- Database Schemas (Models) ---

// 1. Books (The Inventory)
const BookSchema = new mongoose.Schema({
  title: String,
  authors: [String],
  description: String,
  cover: String,
  category: String,
  quantity: { type: Number, default: 5 },
  status: { type: String, default: 'In Stock' }
});
const Book = mongoose.model('Book', BookSchema);

// 2. Users (Authentication)
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' } // 'user' or 'admin'
});
const User = mongoose.model('User', UserSchema);

// 3. Orders (Amazon-style Tracking)
const OrderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book' },
  status: { type: String, default: 'Packed' }, // Packed, Shipped, Out for Delivery, Delivered
  orderDate: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', OrderSchema);

// --- API ROUTES ---

// 1. SEED DATABASE (Fetch 20 books from Google Books)
const seedBooks = async () => {
  const response = await axios.get(`https://www.googleapis.com/books/v1/volumes?q=subject:children&maxResults=20&key=${process.env.GOOGLE_BOOKS_API_KEY}`);
  const books = response.data.items.map(item => ({
    title: item.volumeInfo.title,
    authors: item.volumeInfo.authors || ['Unknown'],
    description: item.volumeInfo.description || 'A great book for kids!',
    cover: item.volumeInfo.imageLinks?.thumbnail || 'https://via.placeholder.com/150',
    category: item.volumeInfo.categories ? item.volumeInfo.categories[0] : 'General',
    quantity: Math.floor(Math.random() * 10) + 1
  }));
  await Book.deleteMany({}); // Clears old data
  await Book.insertMany(books);
  return books.length;
};

app.post('/api/seed', async (req, res) => {
  try {
    const count = await seedBooks();
    res.json({ message: `Success! ${count} books added to warehouse.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. AI SEARCH (Gemini + MongoDB Regex)
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'about', 'with', 'without', 'for', 'to', 'from',
  'of', 'in', 'on', 'at', 'by', 'is', 'are', 'was', 'were', 'be', 'being', 'been',
  'i', 'we', 'you', 'they', 'he', 'she', 'it', 'my', 'your', 'their', 'our',
  'want', 'like', 'love', 'story', 'book', 'read', 'reading', 'please'
]);

const toSafeRegex = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const fallbackKeywords = (query) => {
  const tokens = (query || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));

  if (tokens.length >= 2) return [tokens[0], tokens[1]];
  if (tokens.length === 1) return [tokens[0], tokens[0]];
  return ['kids', 'story'];
};

let cachedModel = null;
let cachedModelAt = 0;

const resolveGeminiModel = async () => {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  const now = Date.now();
  if (cachedModel && now - cachedModelAt < 10 * 60 * 1000) return cachedModel;

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GOOGLE_API_KEY}`;
  const resp = await axios.get(url);
  const models = resp.data?.models || [];
  const candidate = models.find((m) =>
    Array.isArray(m.supportedGenerationMethods) &&
    m.supportedGenerationMethods.includes('generateContent') &&
    (m.name || '').includes('gemini')
  );

  const name = candidate?.name || 'models/gemini-1.5-flash-001';
  cachedModel = name.startsWith('models/') ? name.slice('models/'.length) : name;
  cachedModelAt = now;
  return cachedModel;
};

const extractKeywords = async (query) => {
  const modelName = await resolveGeminiModel();
  const model = genAI.getGenerativeModel({ model: modelName });
  const prompt = `Extract exactly 2 main keywords from this child's book request: "${query}". Return ONLY the words separated by a space.`;
  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();
  const words = raw.split(/\s+/).filter(Boolean).slice(0, 2);
  if (words.length === 2) return words;
  return fallbackKeywords(query);
};

app.post('/api/search', async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query is required.' });
  }
  if (!process.env.GOOGLE_API_KEY) {
    return res.status(500).json({ error: 'Missing GOOGLE_API_KEY in server environment.' });
  }
  try {
    const keywords = await extractKeywords(query);
    const regex = keywords.map(toSafeRegex).join('|');

    const total = await Book.countDocuments();
    if (total === 0) {
      await seedBooks();
    }

    let books = await Book.find({
      $or: [
        { title: { $regex: regex, $options: 'i' } },
        { description: { $regex: regex, $options: 'i' } }
      ]
    }).limit(6);

    if (books.length === 0) {
      books = await Book.find({}).limit(6);
    }

    res.json(books);
  } catch (err) {
    const details = err?.response?.data || err?.message || err;
    console.error('Gemini search error:', details);
    const keywords = fallbackKeywords(query);
    const regex = keywords.map(toSafeRegex).join('|');
    let books = await Book.find({
      $or: [
        { title: { $regex: regex, $options: 'i' } },
        { description: { $regex: regex, $options: 'i' } }
      ]
    }).limit(6);
    if (books.length === 0) {
      books = await Book.find({}).limit(6);
    }
    res.json(books);
  }
});

// 3. ACCESSIBILITY (ElevenLabs TTS)
app.post('/api/speak', async (req, res) => {
  const { text } = req.body;
  try {
    const audio = await elevenlabs.textToSpeech.convert("21m00Tcm4lfs771o02pM", { // Rachel Voice
      text: text,
      model_id: "eleven_multilingual_v2",
    });
    res.setHeader('Content-Type', 'audio/mpeg');
    audio.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. AUTHENTICATION (Register & Login)
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password: hashedPassword });
    res.json({ message: "User Created", userId: user._id });
  } catch (err) {
    res.status(400).json({ error: "Username already exists" });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Invalid Credentials" });
  }
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  res.json({ token, userId: user._id, username: user.username });
});

// 5. BORROW LOGIC (Warehouse Management)
app.post('/api/borrow', async (req, res) => {
  const { userId, bookId } = req.body;
  try {
    const book = await Book.findById(bookId);
    if (!book || book.quantity < 1) return res.status(400).json({ error: "Out of Stock" });

    book.quantity -= 1;
    await book.save();

    const order = await Order.create({ userId, bookId });
    res.json({ message: "Book Requested!", order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. TRACKING (Amazon-style User Orders)
app.get('/api/orders/:userId', async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.params.userId }).populate('bookId');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Server Start ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
