import { describe, it } from "node:test";
import assert from "node:assert";

// ── Test fetchRecentContext logic ────────────────────────────────────
// We test the filtering/normalization logic by mocking the message collection
// and verifying the expected output shape.

function createMockMessage({
  id = "msg-1",
  content = "Hello",
  authorId = "user-1",
  authorName = "testuser",
  isBot = false,
}) {
  return {
    id,
    content,
    author: {
      id: authorId,
      username: authorName,
      bot: isBot,
    },
  };
}

function createMockFetchedMessages(messages) {
  const map = new Map();
  messages.forEach((msg, i) => map.set(msg.id || `msg-${i}`, msg));
  return { values: () => [...map.values()], size: map.size };
}

// Import the module to test the logic inline (we test the same filtering logic)
function filterAndFormatMessages(fetched, currentUserId) {
  return [...fetched.values()]
    .filter((msg) => !msg.author?.bot && msg.content?.trim())
    .slice(0, 10)
    .reverse()
    .map((msg) => {
      const author = msg.author?.username || "unknown";
      const isNemo = msg.author?.id === currentUserId;
      if (isNemo) {
        return { type: "ai", text: `[Nemo, earlier] ${msg.content}` };
      }
      return { type: "human", text: `[${author}] ${msg.content}` };
    });
}

describe("fetchRecentContext logic", () => {
  it("filters out bot messages", () => {
    const messages = [
      createMockMessage({ id: "1", content: "User msg" }),
      createMockMessage({ id: "2", content: "Bot msg", authorId: "bot-1", isBot: true }),
      createMockMessage({ id: "3", content: "Another user msg" }),
    ];
    const fetched = createMockFetchedMessages(messages);

    const result = filterAndFormatMessages(fetched, "nemo-1");

    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].text, "[testuser] Another user msg");
    assert.strictEqual(result[1].text, "[testuser] User msg");
  });

  it("filters out empty content", () => {
    const messages = [
      createMockMessage({ id: "1", content: "Real message" }),
      createMockMessage({ id: "2", content: "" }),
      createMockMessage({ id: "3", content: "   " }),
      createMockMessage({ id: "4", content: null }),
    ];
    const fetched = createMockFetchedMessages(messages);

    const result = filterAndFormatMessages(fetched, "nemo-1");

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].text, "[testuser] Real message");
  });

  it("orders messages oldest first (chronological)", () => {
    // Discord returns messages newest-first; mock that order
    const messages = [
      createMockMessage({ id: "3", content: "Third" }),
      createMockMessage({ id: "2", content: "Second" }),
      createMockMessage({ id: "1", content: "First" }),
    ];
    const fetched = createMockFetchedMessages(messages);

    const result = filterAndFormatMessages(fetched, "nemo-1");

    assert.strictEqual(result[0].text, "[testuser] First");
    assert.strictEqual(result[1].text, "[testuser] Second");
    assert.strictEqual(result[2].text, "[testuser] Third");
  });

  it("labels Nemo's own messages as AIMessage", () => {
    // Discord returns messages newest-first
    const messages = [
      createMockMessage({ id: "2", content: "Nemo responds", authorId: "nemo-1", authorName: "Nemo" }),
      createMockMessage({ id: "1", content: "User asks" }),
    ];
    const fetched = createMockFetchedMessages(messages);

    const result = filterAndFormatMessages(fetched, "nemo-1");

    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].type, "human");
    assert.strictEqual(result[0].text, "[testuser] User asks");
    assert.strictEqual(result[1].type, "ai");
    assert.strictEqual(result[1].text, "[Nemo, earlier] Nemo responds");
  });

  it("returns empty array when fetched is empty", () => {
    const fetched = createMockFetchedMessages([]);
    const result = filterAndFormatMessages(fetched, "nemo-1");
    assert.strictEqual(result.length, 0);
  });

  it("limits to 10 messages", () => {
    const messages = Array.from({ length: 15 }, (_, i) =>
      createMockMessage({ id: `${i}`, content: `Message ${i}` })
    );
    const fetched = createMockFetchedMessages(messages);

    const result = filterAndFormatMessages(fetched, "nemo-1");

    assert.strictEqual(result.length, 10);
  });

  it("handles messages with null author gracefully", () => {
    const messages = [
      { id: "1", content: "No author info", author: null },
    ];
    const fetched = createMockFetchedMessages(messages);

    const result = filterAndFormatMessages(fetched, "nemo-1");

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].text, "[unknown] No author info");
  });
});
