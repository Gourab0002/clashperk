import { APIClanWar, APIClanWarLeagueGroup, RequestHandler, RestManager } from 'clashofclans.js';
import moment from 'moment';

const TAG_REGEX = /^#?[0289PYLQGRJCUV]{3,}$/i;

/** Standalone Clash of Clans API client for the Telegram bot. No Discord imports. */
export class TelegramCoC extends RestManager {
  public constructor() {
    const keys = process.env.CLASH_OF_CLANS_API_KEYS?.split(',').filter(Boolean) ?? [];
    super({
      restRequestTimeout: 10_000,
      baseURL: process.env.CLASH_OF_CLANS_API_BASE_URL,
      keys: [...keys]
    });

    this.requestHandler = new RequestHandler({
      restRequestTimeout: 10_000,
      rejectIfNotValid: false,
      cache: false,
      retryLimit: 0,
      keys: [...keys],
      baseURL: process.env.CLASH_OF_CLANS_API_BASE_URL
    });
  }

  public fixTag(tag: string) {
    return super.util.parseTag(tag);
  }

  public isValidTag(tag?: string) {
    if (!tag) return false;
    return TAG_REGEX.test(tag.toUpperCase().replace(/O/g, '0'));
  }

  public getClanURL(clanTag: string) {
    return `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${encodeURIComponent(clanTag)}`;
  }

  public getPlayerURL(playerTag: string) {
    return `https://link.clashofclans.com/en?action=OpenPlayerProfile&tag=${encodeURIComponent(playerTag)}`;
  }

  private isFriendly(data: APIClanWar) {
    const friendlyWarTimes = [
      1000 * 60 * 60 * 24,
      1000 * 60 * 60 * 20,
      1000 * 60 * 60 * 16,
      1000 * 60 * 60 * 12,
      1000 * 60 * 60 * 8,
      1000 * 60 * 60 * 6,
      1000 * 60 * 60 * 4,
      1000 * 60 * 60 * 2,
      1000 * 60 * 60,
      1000 * 60 * 30,
      1000 * 60 * 15,
      1000 * 60 * 5
    ];
    return friendlyWarTimes.includes(
      new Date(moment(data.startTime).toDate()).getTime() -
        new Date(moment(data.preparationStartTime).toDate()).getTime()
    );
  }

  public async getCurrentWars(clanTag: string) {
    const [cwl, war] = await Promise.all([
      this._getClanWarLeague(clanTag),
      this._getCurrentWar(clanTag)
    ]);
    return [...cwl, ...war];
  }

  private async _getCurrentWar(clanTag: string) {
    const { body: data, res } = await this.getCurrentWar(clanTag);
    if (!res.ok || data.state === 'notInWar') return [];
    return [Object.assign(data, { isFriendly: this.isFriendly(data) })];
  }

  private async _getClanWarLeague(clanTag: string) {
    const { body: data, res } = await this.getClanWarLeagueGroup(clanTag);
    if (!res.ok || data.state === 'notInWar') return [];
    return this._clanWarLeagueRounds(clanTag, data);
  }

  private async _clanWarLeagueRounds(clanTag: string, body: APIClanWarLeagueGroup) {
    const chunks: (APIClanWar & { warTag: string; round: number })[] = [];
    for (const { warTags } of body.rounds.filter((en) => !en.warTags.includes('#0')).slice(-2)) {
      for (const warTag of warTags) {
        const { body: data, res } = await this.getClanWarLeagueRound(warTag);
        if (!res.ok || data.state === 'notInWar') continue;
        const round = body.rounds.findIndex((en) => en.warTags.includes(warTag));
        if (data.clan.tag === clanTag || data.opponent.tag === clanTag) {
          const clan = data.clan.tag === clanTag ? data.clan : data.opponent;
          const opponent = data.clan.tag === clanTag ? data.opponent : data.clan;
          chunks.push(Object.assign(data, { warTag, round: round + 1 }, { clan, opponent }));
          break;
        }
      }
    }
    return chunks;
  }
}
