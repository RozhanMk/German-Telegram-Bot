import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';
import Groq from "groq-sdk";
import { MongoClient } from 'mongodb';
import express from 'express';

dotenv.config();

const app = express(); 
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const mongoUri = process.env.MONGO_URI;
const client = new MongoClient(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

async function connectToDatabase() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
  }
}

connectToDatabase();

//ping endpoint to keep the app alive
app.get('/keep-alive', (req, res) => {
  res.send('App is alive');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});


async function getGermanStory(level) {
  const prompt = `Tell me a German story for a ${level} level learner.`;
  try {
    const response = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "llama3-8b-8192",
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error(`Error fetching story for level ${level}:`, error);
    return "Sorry, I couldn't fetch a story at the moment. Please try again later.";
  }
}

bot.start((ctx) => {
  ctx.reply('Welcome! Please choose your story level: A1, A2, B1.', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'A1', callback_data: 'A1' }],
        [{ text: 'A2', callback_data: 'A2' }],
        [{ text: 'B1', callback_data: 'B1' }],
      ],
    },
  });
});

bot.on('callback_query', async (ctx) => {
  const level = ctx.callbackQuery.data;
  const db = client.db('telegram_bot');
  const usersCollection = db.collection('users');

  //initialize lastStorySent to the current timestamp
  const now = Date.now();

  //check if the user has already entered the bot
  const user = await usersCollection.findOne({ chatId: ctx.chat.id });

  if (!user) {
    const germanStory = await getGermanStory(level);
    await ctx.reply(germanStory);

    await usersCollection.updateOne(
      { chatId: ctx.chat.id },
      { $set: { level, lastStorySent: now } },
      { upsert: true }
    );
    await ctx.reply(`You selected the ${level} level. I will send you a story every 6 hours.`);

  }
  else{
    await usersCollection.updateOne(
      { chatId: ctx.chat.id },
      { $set: { level } },
      { upsert: true }
    );
    await ctx.reply(`Your level got changed to ${level} now. I will send you a story every 6 hours.`);
  }

});

bot.on('message', (ctx) => {
  ctx.reply('Use the command /start to choose your story level!');
});

async function sendStoriesToAllUsers() {
  const db = client.db('telegram_bot');
  const usersCollection = db.collection('users');
  const users = await usersCollection.find({}).toArray();

  for (const user of users) {
    const storyLevel = user.level || 'A1'; // Default to 'A1' if level not set

    try {
      const germanStory = await getGermanStory(storyLevel);
      await bot.telegram.sendMessage(user.chatId, germanStory);
    } catch (error) {
      console.error(`Error sending story to user ${user.chatId}:`, error);
    }
  }
}

async function checkAndSendStories() {
  const db = client.db('telegram_bot');
  const usersCollection = db.collection('users');
  const users = await usersCollection.find({}).toArray();

  for (const user of users) {
    const storyLevel = user.level || 'A1'; 

    //check if it's time to send a story
    const lastStorySent = user.lastStorySent || 0;
    const now = Date.now();
    const sixHoursInMillis = 6 * 60 * 60 * 1000;

    if (now - lastStorySent >= sixHoursInMillis) {
      try {
        const germanStory = await getGermanStory(storyLevel);
        await bot.telegram.sendMessage(user.chatId, germanStory);

        //update the last story sent time
        await usersCollection.updateOne(
          { chatId: user.chatId },
          { $set: { lastStorySent: now } }
        );
      } catch (error) {
        console.error(`Error sending story to user ${user.chatId}:`, error);
      }
    }
  }
}


setInterval(checkAndSendStories, 1 * 60 * 60 * 1000); // 1 hours in milliseconds

bot.launch().catch((err) => {
  console.error('Error launching bot:', err);
});

console.log('Bot is running...');