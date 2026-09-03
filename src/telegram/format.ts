import { APIClan, APIClanWar, APIPlayer } from 'clashofclans.js';
import moment from 'moment';

const MAX_LENGTH = 4000;

export function escapeHtml(text: string | number | null | undefined) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function link(url: string, text: string) {
  return `<a href="${url}">${escapeHtml(text)}</a>`;
}

function compact(num = 0) {
  if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return `${num}`;
}

function truncate(html: string) {
  return html.length > MAX_LENGTH ? `${html.slice(0, MAX_LENGTH)}…` : html;
}

export function formatPlayer(data: APIPlayer, playerUrl: string) {
  const heroes =
    data.heroes
      .filter((h) => h.village === 'home')
      .map((h) => `${escapeHtml(h.name)} ${h.level}`)
      .join(' · ') || 'None';

  const achievements: Record<string, number> = {};
  for (const a of data.achievements ?? []) achievements[a.name] = a.value;

  const lines = [
    `<b>${escapeHtml(data.name)}</b> <code>${escapeHtml(data.tag)}</code>`,
    `🏠 TH${data.townHallLevel} • ✨ ${data.expLevel} • 🏆 ${data.trophies} • ⭐ ${data.warStars}`,
    '',
    `<b>Clan:</b> ${data.clan ? `${escapeHtml(data.clan.name)} <code>${escapeHtml(data.clan.tag)}</code>` : 'No clan'}`,
    `<b>Role:</b> ${escapeHtml(data.role ?? '-')}`,
    '',
    `<b>Season</b> — Donated: ${data.donations.toLocaleString()} • Received: ${data.donationsReceived.toLocaleString()}`,
    `Attacks: ${data.attackWins} • Defenses: ${data.defenseWins} • Best: ${data.bestTrophies}`,
    '',
    `<b>Heroes:</b> ${escapeHtml(heroes)}`,
    `<b>Loot:</b> Gold ${compact(achievements['Gold Grab'])} • Elixir ${compact(achievements['Elixir Escapade'])} • Dark ${compact(achievements['Heroic Heist'])}`,
    `<b>CWL Stars:</b> ${(achievements['War League Legend'] ?? 0).toLocaleString()} • <b>Games:</b> ${(achievements['Games Champion'] ?? 0).toLocaleString()}`,
    '',
    link(playerUrl, 'Open in game ↗')
  ];
  return truncate(lines.join('\n'));
}

export function formatClan(data: APIClan, clanUrl: string) {
  const lines = [
    `<b>${escapeHtml(data.name)}</b> <code>${escapeHtml(data.tag)}</code>`,
    `Level ${data.clanLevel} • 🏆 ${data.clanPoints} • ${data.members}/50`,
    `War: ${data.warWins}W / ${data.warLosses ?? 0}L / ${data.warTies ?? 0}T • Streak ${data.warWinStreak}`,
    `Location: ${escapeHtml(data.location?.name ?? '-')} • Type: ${escapeHtml(data.type)}`,
    '',
    `<b>Requirements:</b> 🏆 ${data.requiredTrophies} • TH${data.requiredTownhallLevel ?? 1}`,
    data.description ? `<i>${escapeHtml(data.description.slice(0, 300))}</i>` : '',
    '',
    `<b>Top members</b>`,
    ...data.memberList
      .slice()
      .sort((a, b) => b.trophies - a.trophies)
      .slice(0, 10)
      .map(
        (m, i) =>
          `${i + 1}. ${escapeHtml(m.name)} <code>${escapeHtml(m.tag)}</code> • TH${m.townHallLevel} • 🏆 ${m.trophies}`
      ),
    '',
    link(clanUrl, 'Open in game ↗')
  ].filter(Boolean);
  return truncate(lines.join('\n'));
}

function warTimeLeft(war: APIClanWar) {
  const end = moment(war.endTime);
  if (war.state === 'preparation') return `Starts ${moment(war.startTime).fromNow()}`;
  if (war.state === 'inWar') return `Ends ${end.fromNow()}`;
  return `Ended ${end.fromNow()}`;
}

export function formatWar(
  war: APIClanWar & { warTag?: string; round?: number; isFriendly?: boolean }
) {
  const { clan, opponent } = war;
  const clanAttacks = clan.attacks ?? 0;
  const oppAttacks = opponent.attacks ?? 0;
  const maxAttacks = war.teamSize * (war.attacksPerMember ?? 1);

  const stars: Record<number, string> = { 0: '☆☆☆', 1: '★☆☆', 2: '★★☆', 3: '★★★' };

  const allAttacks = [...war.clan.members, ...war.opponent.members].flatMap((m) => m.attacks ?? []);
  const recent = [...allAttacks]
    .sort((a, b) => b.order - a.order)
    .slice(0, 5)
    .map(
      (a) =>
        `${stars[a.stars] ?? ''} <code>${escapeHtml(a.attackerTag)}</code> → <code>${escapeHtml(a.defenderTag)}</code> ${a.destructionPercentage}%`
    );

  const lines = [
    `<b>${escapeHtml(clan.name)}</b> vs <b>${escapeHtml(opponent.name)}</b>`,
    `State: <b>${escapeHtml(war.state)}</b> • ${escapeHtml(warTimeLeft(war))} • ${war.teamSize}v${war.teamSize}${war.isFriendly ? ' • Friendly' : ''}${war.round ? ` • CWL Round ${war.round}` : ''}`,
    '',
    `⭐ ${clan.stars} (${clan.destructionPercentage.toFixed(1)}%) — ${opponent.stars} (${opponent.destructionPercentage.toFixed(1)}%) ⭐`,
    `Attacks: ${clanAttacks}/${maxAttacks} — ${oppAttacks}/${maxAttacks}`,
    '',
    recent.length ? `<b>Latest attacks</b>\n${recent.join('\n')}` : 'No attacks yet.'
  ];
  return truncate(lines.join('\n'));
}

export function formatWarList(
  wars: (APIClanWar & { warTag?: string; round?: number; isFriendly?: boolean })[]
) {
  if (!wars.length) return 'No active war found for this clan.';
  return wars.map((w) => formatWar(w)).join('\n\n———————\n\n');
}

export function formatCwlGroup(group: {
  season: string;
  clans: { name: string; tag: string }[];
  wars: APIClanWar[];
}) {
  const table = group.clans
    .map((c) => {
      let stars = 0;
      let destruction = 0;
      let played = 0;
      for (const war of group.wars) {
        if (war.clan.tag === c.tag) {
          stars += war.clan.stars;
          destruction += war.clan.destructionPercentage;
          played += 1;
        } else if (war.opponent.tag === c.tag) {
          stars += war.opponent.stars;
          destruction += war.opponent.destructionPercentage;
          played += 1;
        }
      }
      return { ...c, stars, destruction, played };
    })
    .sort((a, b) => b.stars - a.stars || b.destruction - a.destruction)
    .map(
      (c, i) =>
        `${i + 1}. ${escapeHtml(c.name)} <code>${escapeHtml(c.tag)}</code> — ⭐ ${c.stars} (${c.destruction.toFixed(1)}%)`
    );

  return truncate([`<b>CWL ${escapeHtml(group.season)}</b>`, '', ...table].join('\n'));
}
