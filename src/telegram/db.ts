import { Db, MongoClient } from 'mongodb';

let mongoClient: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;
  const url = process.env.MONGODB_URL;
  if (!url) throw new Error('MONGODB_URL is not set (required for Telegram link storage).');
  mongoClient = new MongoClient(url);
  await mongoClient.connect();
  db = mongoClient.db();
  await db.collection('telegram_links').createIndex({ userId: 1 }, { unique: true });
  await db.collection('telegram_links').createIndex({ tag: 1 });
  await db.collection('telegram_chats').createIndex({ chatId: 1 }, { unique: true });
  return db;
}

export interface TelegramLink {
  userId: number;
  tag: string;
  updatedAt: Date;
}

export interface TelegramChat {
  chatId: number;
  defaultClanTag?: string;
  updatedAt: Date;
}

export async function getLinkedTag(userId: number): Promise<string | null> {
  const database = await getDb();
  const doc = await database.collection<TelegramLink>('telegram_links').findOne({ userId });
  return doc?.tag ?? null;
}

export async function setLinkedTag(userId: number, tag: string) {
  const database = await getDb();
  await database
    .collection<TelegramLink>('telegram_links')
    .updateOne({ userId }, { $set: { tag, updatedAt: new Date() } }, { upsert: true });
}

export async function deleteLinkedTag(userId: number) {
  const database = await getDb();
  await database.collection<TelegramLink>('telegram_links').deleteOne({ userId });
}

export async function getDefaultClan(chatId: number): Promise<string | null> {
  const database = await getDb();
  const doc = await database.collection<TelegramChat>('telegram_chats').findOne({ chatId });
  return doc?.defaultClanTag ?? null;
}

export async function setDefaultClan(chatId: number, tag: string) {
  const database = await getDb();
  await database
    .collection<TelegramChat>('telegram_chats')
    .updateOne(
      { chatId },
      { $set: { defaultClanTag: tag, updatedAt: new Date() } },
      { upsert: true }
    );
}
