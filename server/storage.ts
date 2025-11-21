import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import {
  users,
  botSettings,
  messages,
  withdrawalRequests,
  type User,
  type InsertUser,
  type BotSettings,
  type InsertBotSettings,
  type Message,
  type InsertMessage,
  type WithdrawalRequest,
  type InsertWithdrawalRequest
} from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool });

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  incrementUserMessages(userId: string, channelId: string): Promise<User>;
  incrementUserCatches(userId: string): Promise<User>;
  incrementUserShinyCatches(userId: string): Promise<User>;
  incrementUserRareShinyCatches(userId: string): Promise<User>;
  addUserPokecoins(userId: string, amount: number): Promise<User>;
  deductUserPokecoins(userId: string, amount: number): Promise<User>;
  setUserPokecoins(userId: string, amount: number): Promise<User>;
  resetUserStats(userId: string, type: "messages" | "catches" | "all"): Promise<User>;
  resetAllUserStats(type: "messages" | "catches" | "all"): Promise<void>;

  // Bot settings operations
  getBotSettings(): Promise<BotSettings>;
  updateMessageEventStatus(active: boolean): Promise<BotSettings>;
  updateCatchEventStatus(active: boolean): Promise<BotSettings>;
  updatePokecoinRate(rate: number): Promise<BotSettings>;
  updateMessagesPerReward(count: number): Promise<BotSettings>;
  updateCountingChannels(channels: string[]): Promise<BotSettings>;
  updateProofsChannel(channelId: string): Promise<BotSettings>;
  updateAntiSpamSettings(enabled: boolean, timeWindow: number, maxMessages: number, minLength: number): Promise<BotSettings>;
  setProofsChannel(channelId: string): Promise<void>;
  setWithdrawalChannel(channelId: string): Promise<void>;
  addCountingChannel(channelId: string): Promise<void>;
  removeCountingChannel(channelId: string): Promise<void>;

  // Message operations
  createMessageWithSpamCheck(content: string, authorId: string, channelId: string, isBot: boolean): Promise<{ message: Message; spam: { blocked: boolean; reason?: string } }>;
  getMessagesByChannel(channelId: string, limit?: number): Promise<Message[]>;
  getAllMessages(limit?: number): Promise<Message[]>;
  getRecentMessagesByUser(userId: string, seconds: number): Promise<Message[]>;
  checkIsSpam(userId: string, content: string, channelId: string): Promise<{ isSpam: boolean; reason?: string }>;

  // Withdrawal operations
  createWithdrawalRequest(request: InsertWithdrawalRequest): Promise<WithdrawalRequest>;
  getWithdrawalRequestByNumber(requestNumber: number): Promise<WithdrawalRequest | undefined>;
  getWithdrawalRequestsCount(): Promise<number>;
  updateWithdrawalRequestStatus(requestNumber: number, status: string): Promise<WithdrawalRequest>;
  completeWithdrawalIfPending(requestNumber: number): Promise<{ success: boolean; request?: WithdrawalRequest }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async checkIsSpam(userId: string, content: string, channelId: string): Promise<{ isSpam: boolean; reason?: string }> {
    const settings = await this.getBotSettings();

    if (!settings.antiSpamEnabled) {
      return { isSpam: false };
    }

    // Check minimum message length
    if (content.trim().length < settings.minMessageLength) {
      return { isSpam: true, reason: "Message too short" };
    }

    // Check if user is sending too many messages in time window
    const recentMessages = await this.getRecentMessagesByUser(userId, settings.spamTimeWindow);

    if (recentMessages.length >= settings.maxMessagesInWindow) {
      return { isSpam: true, reason: "Too many messages in short time" };
    }

    return { isSpam: false };
  }

  async getRecentMessagesByUser(userId: string, seconds: number): Promise<Message[]> {
    const timeThreshold = new Date(Date.now() - seconds * 1000);

    const result = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.authorId, userId),
          gte(messages.timestamp, timeThreshold),
          eq(messages.isBot, false)
        )
      )
      .orderBy(desc(messages.timestamp));

    return result;
  }

  async incrementUserMessages(userId: string, channelId: string): Promise<User> {
    // Get or create user
    let user = await this.getUser(userId);
    if (!user) {
      user = await this.createUser({
        id: userId,
        username: "User",
        discriminator: "0000"
      });
    }

    // Check if event is active and channel is counting
    const settings = await this.getBotSettings();

    console.log(`[MESSAGE COUNT] User: ${userId}, Channel: ${channelId}`);
    console.log(`[MESSAGE COUNT] Message Event Active: ${settings.messageEventActive}`);
    console.log(`[MESSAGE COUNT] Counting Channels:`, settings.countingChannels);
    console.log(`[MESSAGE COUNT] Channel in list: ${settings.countingChannels.includes(channelId)}`);

    if (!settings.messageEventActive) {
      console.log(`[MESSAGE COUNT] Message event inactive - not counting`);
      return user;
    }

    if (!settings.countingChannels.includes(channelId)) {
      console.log(`[MESSAGE COUNT] Channel not in counting list - not counting`);
      return user;
    }

    const newMessages = user.messages + 1;
    let newPokecoins = user.pokecoins;

    // Award pokecoins based on messagesPerReward setting
    if (newMessages % settings.messagesPerReward === 0) {
      newPokecoins += settings.pokecoinRate;
      console.log(`[MESSAGE COUNT] Awarded ${settings.pokecoinRate} pokecoins! Total: ${newPokecoins}`);
    }

    console.log(`[MESSAGE COUNT] Incrementing messages: ${user.messages} -> ${newMessages}`);

    const result = await db
      .update(users)
      .set({ messages: newMessages, pokecoins: newPokecoins })
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  }

  async incrementUserCatches(userId: string): Promise<User> {
    let user = await this.getUser(userId);
    if (!user) {
      user = await this.createUser({
        id: userId,
        username: "User",
        discriminator: "0000"
      });
    }

    const result = await db
      .update(users)
      .set({ catches: user.catches + 1 })
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  }

  async incrementUserShinyCatches(userId: string): Promise<User> {
    let user = await this.getUser(userId);
    if (!user) {
      user = await this.createUser({
        id: userId,
        username: "User",
        discriminator: "0000"
      });
    }

    const result = await db
      .update(users)
      .set({
        catches: user.catches + 1,
        shinyCatches: (user.shinyCatches || 0) + 1
      })
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  }

  async incrementUserRareShinyCatches(userId: string): Promise<User> {
    let user = await this.getUser(userId);
    if (!user) {
      user = await this.createUser({
        id: userId,
        username: "User",
        discriminator: "0000"
      });
    }

    const result = await db
      .update(users)
      .set({
        catches: user.catches + 1,
        shinyCatches: (user.shinyCatches || 0) + 1,
        rareShinyCatches: (user.rareShinyCatches || 0) + 1
      })
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  }

  async addUserPokecoins(userId: string, amount: number): Promise<User> {
    let user = await this.getUser(userId);
    if (!user) {
      user = await this.createUser({
        id: userId,
        username: "User",
        discriminator: "0000"
      });
    }

    const result = await db
      .update(users)
      .set({ pokecoins: user.pokecoins + amount })
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  }

  async deductUserPokecoins(userId: string, amount: number): Promise<User> {
    let user = await this.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if user has enough balance
    if (user.pokecoins < amount) {
      throw new Error(`Insufficient balance: User has ${user.pokecoins} Pokecoins but ${amount} is required`);
    }

    const newBalance = user.pokecoins - amount;

    const result = await db
      .update(users)
      .set({ pokecoins: newBalance })
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  }

  async setUserPokecoins(userId: string, amount: number): Promise<User> {
    let user = await this.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const result = await db
      .update(users)
      .set({ pokecoins: amount })
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  }

  async resetUserStats(userId: string, type: "messages" | "catches" | "all"): Promise<User> {
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const updates: Partial<User> = {};
    if (type === "messages" || type === "all") updates.messages = 0;
    if (type === "catches" || type === "all") updates.catches = 0;

    const result = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();

    return result[0];
  }

  async resetAllUserStats(type: "messages" | "catches" | "all"): Promise<void> {
    if (type === 'messages') {
      await db.update(users).set({ messages: 0 });
    } else if (type === 'catches') {
      await db.update(users).set({ catches: 0, shinyCatches: 0, rareShinyCatches: 0 });
    } else {
      await db.update(users).set({ messages: 0, catches: 0, shinyCatches: 0, rareShinyCatches: 0, pokecoins: 0 });
    }
  }

  async setProofsChannel(channelId: string): Promise<void> {
    const settings = await this.getBotSettings();
    await db.update(botSettings).set({ proofsChannelId: channelId }).where(eq(botSettings.id, settings.id));
  }

  async setWithdrawalChannel(channelId: string): Promise<void> {
    const settings = await this.getBotSettings();
    await db.update(botSettings).set({ withdrawalChannelId: channelId }).where(eq(botSettings.id, settings.id));
  }

  async addCountingChannel(channelId: string): Promise<void> {
    const settings = await this.getBotSettings();
    const currentChannels = settings.countingChannels || [];
    if (!currentChannels.includes(channelId)) {
      await db.update(botSettings)
        .set({ countingChannels: [...currentChannels, channelId] })
        .where(eq(botSettings.id, settings.id));
    }
  }

  async removeCountingChannel(channelId: string): Promise<void> {
    const settings = await this.getBotSettings();
    const updatedChannels = settings.countingChannels.filter(id => id !== channelId);
    await db
      .update(botSettings)
      .set({ countingChannels: updatedChannels })
      .where(eq(botSettings.id, settings.id));
  }

  async createWithdrawalRequest(request: InsertWithdrawalRequest): Promise<WithdrawalRequest> {
    const result = await db
      .insert(withdrawalRequests)
      .values(request)
      .returning();
    return result[0];
  }

  async getWithdrawalRequestByNumber(requestNumber: number): Promise<WithdrawalRequest | undefined> {
    const result = await db
      .select()
      .from(withdrawalRequests)
      .where(eq(withdrawalRequests.requestNumber, requestNumber))
      .limit(1);
    return result[0];
  }

  async getWithdrawalRequestsCount(): Promise<number> {
    const result = await db
      .select()
      .from(withdrawalRequests);
    return result.length;
  }

  async updateWithdrawalRequestStatus(requestNumber: number, status: string): Promise<WithdrawalRequest> {
    const result = await db
      .update(withdrawalRequests)
      .set({ status })
      .where(eq(withdrawalRequests.requestNumber, requestNumber))
      .returning();
    return result[0];
  }

  async completeWithdrawalIfPending(requestNumber: number): Promise<{ success: boolean; request?: WithdrawalRequest }> {
    // Atomically update the request status to "completed" ONLY if it's currently "pending"
    // This prevents race conditions where two moderators process the same request
    const result = await db
      .update(withdrawalRequests)
      .set({ status: "completed" })
      .where(sql`${withdrawalRequests.requestNumber} = ${requestNumber} AND ${withdrawalRequests.status} = 'pending'`)
      .returning();
    
    if (result.length === 0) {
      // No rows were updated - either the request doesn't exist or it's already completed
      return { success: false };
    }
    
    return { success: true, request: result[0] };
  }


  async getBotSettings(): Promise<BotSettings> {
    const result = await db.select().from(botSettings);
    if (result.length === 0) {
      // Initialize default settings
      const newSettings = await db.insert(botSettings).values({}).returning();
      return newSettings[0];
    }
    return result[0];
  }

  async updateMessageEventStatus(active: boolean): Promise<BotSettings> {
    const settings = await this.getBotSettings();
    const result = await db
      .update(botSettings)
      .set({ messageEventActive: active })
      .where(eq(botSettings.id, settings.id))
      .returning();
    return result[0];
  }

  async updateCatchEventStatus(active: boolean): Promise<BotSettings> {
    const settings = await this.getBotSettings();
    const result = await db
      .update(botSettings)
      .set({ catchEventActive: active })
      .where(eq(botSettings.id, settings.id))
      .returning();
    return result[0];
  }

  async updatePokecoinRate(rate: number): Promise<BotSettings> {
    const settings = await this.getBotSettings();
    const result = await db
      .update(botSettings)
      .set({ pokecoinRate: rate })
      .where(eq(botSettings.id, settings.id))
      .returning();
    return result[0];
  }

  async updateMessagesPerReward(count: number): Promise<BotSettings> {
    const settings = await this.getBotSettings();
    const result = await db
      .update(botSettings)
      .set({ messagesPerReward: count })
      .where(eq(botSettings.id, settings.id))
      .returning();
    return result[0];
  }

  async updateCountingChannels(channels: string[]): Promise<BotSettings> {
    const settings = await this.getBotSettings();
    const result = await db
      .update(botSettings)
      .set({ countingChannels: channels })
      .where(eq(botSettings.id, settings.id))
      .returning();
    return result[0];
  }

  async updateProofsChannel(channelId: string): Promise<BotSettings> {
    const settings = await this.getBotSettings();
    const result = await db
      .update(botSettings)
      .set({ proofsChannelId: channelId })
      .where(eq(botSettings.id, settings.id))
      .returning();
    return result[0];
  }

  async updateAntiSpamSettings(
    enabled: boolean,
    timeWindow: number,
    maxMessages: number,
    minLength: number
  ): Promise<BotSettings> {
    const settings = await this.getBotSettings();
    const result = await db
      .update(botSettings)
      .set({
        antiSpamEnabled: enabled,
        spamTimeWindow: timeWindow,
        maxMessagesInWindow: maxMessages,
        minMessageLength: minLength
      })
      .where(eq(botSettings.id, settings.id))
      .returning();
    return result[0];
  }

  async createMessageWithSpamCheck(
    content: string,
    authorId: string,
    channelId: string,
    isBot: boolean
  ): Promise<{ message: Message; spam: { blocked: boolean; reason?: string } }> {
    // Check for spam if not a bot message
    let spamCheck: { isSpam: boolean; reason?: string } = { isSpam: false };
    if (!isBot) {
      spamCheck = await this.checkIsSpam(authorId, content, channelId);
    }

    // Create message with spam flags
    const result = await db.insert(messages).values({
      content,
      authorId,
      channelId,
      isBot,
    }).returning();

    const message = result[0];

    // Update message with spam info
    if (spamCheck.isSpam || !spamCheck.isSpam) {
      const updated = await db
        .update(messages)
        .set({
          isSpam: spamCheck.isSpam,
          isCounted: !spamCheck.isSpam
        })
        .where(eq(messages.id, message.id))
        .returning();

      return {
        message: updated[0],
        spam: { blocked: spamCheck.isSpam, reason: spamCheck.reason }
      };
    }

    return {
      message,
      spam: { blocked: false }
    };
  }

  async getMessagesByChannel(channelId: string, limit: number = 100): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.channelId, channelId))
      .orderBy(desc(messages.timestamp))
      .limit(limit);
  }

  async getAllMessages(limit: number = 100): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .orderBy(desc(messages.timestamp))
      .limit(limit);
  }
}

export const storage = new DatabaseStorage();