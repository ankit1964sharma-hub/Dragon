import { startDiscordBot } from "./discord-bot.js";
import runApp from "./app.js";

console.log("Starting Discord bot...");
startDiscordBot();

console.log("Starting web server...");
runApp();
