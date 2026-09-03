import 'dotenv/config';
import { createBot, registerCommands } from './bot.js';
import { TelegramCoC } from './coc.js';
import { getDb } from './db.js';

async function main() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('[telegram] TELEGRAM_BOT_TOKEN is not set. Aborting.');
    process.exit(1);
  }
  if (!process.env.CLASH_OF_CLANS_API_KEYS) {
    console.error('[telegram] CLASH_OF_CLANS_API_KEYS is not set. Aborting.');
    process.exit(1);
  }

  const coc = new TelegramCoC();

  // Optional: link storage (graceful if Mongo is unavailable — lookups still work).
  try {
    await getDb();
    console.log('[telegram] Connected to MongoDB');
  } catch (error) {
    console.warn('[telegram] MongoDB unavailable, /link and /setclan disabled:', error);
  }

  const bot = createBot(coc);
  try {
    await registerCommands(bot);
  } catch (error) {
    console.warn('[telegram] setMyCommands failed:', error);
  }

  const me = await bot.api.getMe();
  console.log(`[telegram] Starting as @${me.username}`);

  const stop = () => {
    console.log('[telegram] Stopping…');
    return bot.stop();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  await bot.start({ drop_pending_updates: true });
}

main().catch((error) => {
  console.error('[telegram] Fatal:', error);
  process.exit(1);
});
