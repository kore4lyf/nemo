/**
 * Shared filter helpers for channel-sweep tools (milestones, introductions).
 */

export function matchesAuthor(message, author) {
  if (!author) return true;
  const snowflake = /^\d{17,20}$/.test(author);
  if (snowflake) {
    return message.authorId === author;
  }
  return typeof message.author === "string"
    ? message.author.toLowerCase() === author.toLowerCase()
    : false;
}

export function matchesQuery(message, query) {
  if (!query) return true;
  const content = (message.content || "").toLowerCase();
  return content.includes(query.toLowerCase());
}
