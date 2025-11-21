import type { Express } from "express";
import { storage } from "./storage";

export function registerRoutes(app: Express) {
  // Get all users with their stats
  app.get("/api/users", async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Get bot settings
  app.get("/api/settings", async (_req, res) => {
    try {
      const botSettings = await storage.getBotSettings();
      res.json(botSettings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // Get all messages
  app.get("/api/messages", async (_req, res) => {
    try {
      const allMessages = await storage.getAllMessages();
      res.json(allMessages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });
}