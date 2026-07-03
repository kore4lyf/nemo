import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import "../config/env.js";

test("env.js validates required vars", () => {
  assert.ok(process.env.DISCORD_TOKEN, "DISCORD_TOKEN is set");
  assert.ok(process.env.OPENAI_API_KEY, "OPENAI_API_KEY is set");
  assert.ok(process.env.OPENAI_BASE_URL, "OPENAI_BASE_URL is set");
  assert.ok(process.env.OPENAI_MODEL, "OPENAI_MODEL is set");
});

test("LLM API responds", async () => {
  const baseUrl = process.env.OPENAI_BASE_URL;
  const model = process.env.OPENAI_MODEL;
  const apiKey = process.env.OPENAI_API_KEY;

  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   Model:    ${model}`);
  console.log(`   API key:  ${apiKey ? apiKey.slice(0, 8) + "..." : "NOT SET"}`);

  assert.ok(baseUrl, "OPENAI_BASE_URL is set");
  assert.ok(model, "OPENAI_MODEL is set");
  assert.ok(apiKey, "OPENAI_API_KEY is set");

  const llm = new ChatOpenAI({
    apiKey,
    baseURL: baseUrl,
    model,
    temperature: 0,
  });

  const response = await llm.invoke([new HumanMessage("Say 'OK' and nothing else.")]);
  const text = response.content;
  assert.ok(typeof text === "string", "Response should be a string");
  assert.ok(text.length > 0, "Got a response from the API");
  console.log(`✅ API responded: "${text}"`);
});
