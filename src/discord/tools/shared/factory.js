import { tool } from "@langchain/core/tools";

/**
 * Generic factory: convert one { name, description, schema, create } definition
 * into a bound LangChain tool that takes the live client at construction time.
 *
 * All tools in this codebase go through makeTool. Keeps zero duplication
 * across action + context layers.
 */
export function makeTool(def) {
  return ({ client, message }) =>
    tool((input) => def.create(client, input, { message }), {
      name: def.name,
      description: def.description,
      schema: def.schema,
    });
}
