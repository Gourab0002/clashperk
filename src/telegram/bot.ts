import { Bot, Context } from 'grammy';
import { TelegramCoC } from './coc.js';
import {
  deleteLinkedTag,
  getDefaultClan,
  getLinkedTag,
  setDefaultClan,
  setLinkedTag
} from './db.js';
import { escapeHtml, formatClan, formatCwlGroup, formatPlayer, formatWarList } from './format.js';

export type TelegramContext = Context;

function getArg(text: string | undefined): string | null {
  if (!text) return null;
  const parts = text.trim().split(/\s+/);
  // parts[0] is the command itself (/player@BotName or /player)
  if (parts.length < 2) return null;
  return parts.slice(1).join(' ').trim() || null;
}

function normalizeTag(raw: string, coc: TelegramCoC): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/O/g, '0');
  if (!coc.isValidTag(cleaned)) return null;
  return coc.fixTag(cleaned);
}

async function isChatAdmin(ctx: TelegramContext) {
  if (!ctx.from || !ctx.chat) return false;
  if (ctx.chat.type === 'private') return true;
  try {
    const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
    return member.status === 'administrator' || member.status === 'creator';
  } catch {
    return false;
  }
}

export function createBot(coc: TelegramCoC) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set.');
  const bot = new Bot<TelegramContext>(token);

  bot.catch((err) => {
    console.error(`[telegram] ${err.ctx.update.update_id}:`, err.error);
  });

  bot.command('start', async (ctx) => {
    await ctx.reply(
      [
        '<b>ClashPerk for Telegram</b>',
        '',
        'Lookup commands:',
        '/player &lt;tag&gt; — player profile',
        '/clan &lt;tag&gt; — clan profile + top members',
        '/war &lt;clan tag&gt; — current war / CWL round',
        '/cwl &lt;clan tag&gt; — CWL group standings',
        '',
        'Account:',
        '/link &lt;player tag&gt; — link your account',
        '/unlink — remove link',
        '/me — your linked player',
        '',
        'Groups:',
        '/setclan &lt;clan tag&gt; — default clan for /war and /cwl',
        '',
        'Tip: tags work with or without #.'
      ].join('\n'),
      { parse_mode: 'HTML' }
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      '/player &lt;tag&gt; • /clan &lt;tag&gt; • /war [clan tag] • /cwl [clan tag] • /link &lt;tag&gt; • /me • /setclan &lt;tag&gt;',
      { parse_mode: 'HTML' }
    );
  });

  bot.command('link', async (ctx) => {
    if (!ctx.from) return;
    const raw = getArg(ctx.message?.text);
    if (!raw) return ctx.reply('Usage: /link #PLAYER-TAG');
    const tag = normalizeTag(raw, coc);
    if (!tag) return ctx.reply('Invalid tag. Example: /link #2PP');

    const { body, res } = await coc.getPlayer(tag);
    if (!res.ok) return ctx.reply(`Player ${tag} not found.`);
    await setLinkedTag(ctx.from.id, body.tag);
    await ctx.reply(`Linked to <b>${escapeHtml(body.name)}</b> <code>${body.tag}</code> ✅`, {
      parse_mode: 'HTML'
    });
  });

  bot.command('unlink', async (ctx) => {
    if (!ctx.from) return;
    await deleteLinkedTag(ctx.from.id);
    await ctx.reply('Link removed.');
  });

  async function resolvePlayerTag(ctx: TelegramContext, raw: string | null) {
    if (raw) return normalizeTag(raw, coc);
    if (!ctx.from) return null;
    const linked = await getLinkedTag(ctx.from.id).catch(() => null);
    if (linked) return linked;
    return null;
  }

  async function resolveClanTag(ctx: TelegramContext, raw: string | null) {
    if (raw) return normalizeTag(raw, coc);
    if (ctx.chat) {
      const def = await getDefaultClan(ctx.chat.id).catch(() => null);
      if (def) return def;
    }
    return null;
  }

  bot.command('me', async (ctx) => {
    if (!ctx.from) return;
    const linked = await getLinkedTag(ctx.from.id).catch(() => null);
    if (!linked) return ctx.reply('No linked account. Use /link #TAG first.');
    const { body, res } = await coc.getPlayer(linked);
    if (!res.ok) return ctx.reply('Linked player not found (was it renamed/deleted?).');
    await ctx.reply(formatPlayer(body, coc.getPlayerURL(body.tag)), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true }
    });
  });

  bot.command('player', async (ctx) => {
    const tag = await resolvePlayerTag(ctx, getArg(ctx.message?.text));
    if (!tag) return ctx.reply('Usage: /player #TAG (or /link #TAG then /player)');
    const { body, res } = await coc.getPlayer(tag);
    if (!res.ok) return ctx.reply(`Player ${tag} not found.`);
    await ctx.reply(formatPlayer(body, coc.getPlayerURL(body.tag)), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true }
    });
  });

  bot.command('clan', async (ctx) => {
    const tag = await resolveClanTag(ctx, getArg(ctx.message?.text));
    if (!tag) return ctx.reply('Usage: /clan #TAG');
    const { body, res } = await coc.getClan(tag);
    if (!res.ok) return ctx.reply(`Clan ${tag} not found.`);
    await ctx.reply(formatClan(body, coc.getClanURL(body.tag)), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true }
    });
  });

  bot.command('setclan', async (ctx) => {
    if (!ctx.from || !ctx.chat) return;
    if (!(await isChatAdmin(ctx))) {
      return ctx.reply('Only chat admins can change the default clan.');
    }
    const raw = getArg(ctx.message?.text);
    if (!raw) return ctx.reply('Usage: /setclan #CLAN-TAG');
    const tag = normalizeTag(raw, coc);
    if (!tag) return ctx.reply('Invalid clan tag.');
    const { body, res } = await coc.getClan(tag);
    if (!res.ok) return ctx.reply(`Clan ${tag} not found.`);
    await setDefaultClan(ctx.chat.id, body.tag);
    await ctx.reply(
      `Default clan set to <b>${escapeHtml(body.name)}</b> <code>${body.tag}</code> ✅`,
      { parse_mode: 'HTML' }
    );
  });

  bot.command('war', async (ctx) => {
    const tag = await resolveClanTag(ctx, getArg(ctx.message?.text));
    if (!tag) return ctx.reply('Usage: /war #CLAN-TAG (or /setclan #TAG in groups)');
    let wars;
    try {
      wars = await coc.getCurrentWars(tag);
    } catch {
      return ctx.reply('Could not fetch war data right now. Try again later.');
    }
    if (!wars.length) return ctx.reply('No active war found for this clan.');
    await ctx.reply(formatWarList(wars), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true }
    });
  });

  bot.command('cwl', async (ctx) => {
    const tag = await resolveClanTag(ctx, getArg(ctx.message?.text));
    if (!tag) return ctx.reply('Usage: /cwl #CLAN-TAG');
    const { body: group, res } = await coc.getClanWarLeagueGroup(tag);
    if (!res.ok || group.state === 'notInWar') return ctx.reply('Clan is not in CWL.');
    const warTags = group.rounds.filter((r) => !r.warTags.includes('#0')).flatMap((r) => r.warTags);
    const wars = (await Promise.all(warTags.map((warTag) => coc.getClanWarLeagueRound(warTag))))
      .filter(({ res: r, body: b }) => r.ok && b.state !== 'notInWar')
      .map(({ body }) => body);
    await ctx.reply(formatCwlGroup({ season: group.season, clans: group.clans, wars }), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true }
    });
  });

  return bot;
}

export async function registerCommands(bot: Bot<TelegramContext>) {
  await bot.api.setMyCommands([
    { command: 'player', description: 'Player profile by tag' },
    { command: 'clan', description: 'Clan profile by tag' },
    { command: 'war', description: 'Current war / CWL round' },
    { command: 'cwl', description: 'CWL group standings' },
    { command: 'link', description: 'Link your player tag' },
    { command: 'me', description: 'Show linked player' },
    { command: 'setclan', description: 'Set group default clan' },
    { command: 'start', description: 'Help and usage' }
  ]);
}
