import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';
import Groq from "groq-sdk";

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const users = {};

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
  users[ctx.chat.id] = { level };
  ctx.reply(`You selected the ${level} level. I will send you a story every 6 hours.`);
});

bot.on('text', (ctx) => {
  ctx.reply('Use the command /start to choose your story level!');
});

async function sendStoriesToAllUsers() {
  for (const chatId in users) {
    const user = users[chatId];
    const storyLevel = user.level || 'A1'; // Default to 'A1' if level not set

    try {
      const germanStory = await getGermanStory(storyLevel);
      await bot.telegram.sendMessage(chatId, germanStory);
    } catch (error) {
      console.error(`Error sending story to user ${chatId}:`, error);
    }
  }
}

setInterval(sendStoriesToAllUsers, 6 * 60 * 60 * 1000); // 6 hours in milliseconds

bot.launch();

console.log('Bot is running...');