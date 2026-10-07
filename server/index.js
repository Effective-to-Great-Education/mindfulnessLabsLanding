import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { generateChatReply } from './lib/agentic-service.js';
import { subscribeContact } from './lib/subscribe.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Contact form submission
app.post('/api/subscribe', async (req, res) => {
  try {
    await subscribeContact(req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving contact:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const reply = await generateChatReply(messages);
    res.json({ reply });
  } catch (error) {
    console.error('Error generating chat reply:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Backend server running on http://localhost:${PORT}`);
});