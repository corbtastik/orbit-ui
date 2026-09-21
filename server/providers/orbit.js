import Anthropic from "@anthropic-ai/sdk";
import { listAnthropicTools, callTool, isReachable, mcpUrl } from "../mcp/client.js";
import { log } from "../lib/log.js";
import { SYSTEM } from "./systemPrompt.js";
import { readContext } from "../../shared/connectionContext.js";

// "Orbit" is Claude with OrbitAI's MCP tools attached. An MCP server serves
// tools, not completions, so the model is still Claude and the API key is
// still this app's -- what OrbitAI contributes is the MongoDB and Atlas tool
// surface, and the Atlas credentials behind it.

let client = null;
const getClient = () => (client ??= new Anthropic());

export const id = "orbit";
export const isConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const checkHealth = () => isReachable();

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5";

// Answering a real question against ~87 tools takes many rounds -- a reference
// client needed 24 calls for a comparable query. These are iterations, not
// calls, and parallel calls in one turn count as one, so 30 leaves room while
// still terminating a genuine loop.
const MAX_ITERATIONS = Number(process.env.ORBIT_MAX_ITERATIONS ?? 30);

// How much of a tool result travels to the browser, and from there into the
// stored conversation. A single call can return tens of kilobytes; twenty of
// them per turn would make transcripts megabytes each, against a 16MB
// document limit. The full text is always in logs/orbit.log -- this is the
// copy that has to be affordable to keep.
const MAX_OUTPUT_CHARS = 4000;

const clip = (text) =>
  text.length <= MAX_OUTPUT_CHARS
    ? { text, truncated: false }
    : { text: text.slice(0, MAX_OUTPUT_CHARS), truncated: true, fullLength: text.length };

/**
 * Yields the same events as every other transport -- token, retrieval, done --
 * so the hook above does not know a tool loop happened.
 */
export async function* streamChat({ messages, signal, conversationId = "default" }) {
  // One MCP session for the whole conversation. `connect` and every call that
  // depends on it have to land in the same session, so the client is fetched
  // by conversation id and never rebuilt mid-answer.
  const tools = await listAnthropicTools(conversationId);
  log(`[${conversationId}] --- turn start, ${tools.length} tools ---`);

  // The definitions are ~21K tokens and identical on every request, so they
  // are cached. Render order is tools -> system -> messages, which makes the
  // tool list the ideal prefix: it never varies, and cached reads cost a
  // tenth of fresh ones.
  if (tools.length > 0) {
    tools[tools.length - 1].cache_control = { type: "ephemeral" };
  }

  const history = messages.map((m) => ({ role: m.role, content: m.text }));

  // Accumulated across the whole turn, not reset per round: a cluster chosen
  // in round two is still the cluster in round nineteen.
  let context = {};

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    log(`[${conversationId}] model call #${iteration + 1} starting (aborted=${signal?.aborted})`);
    const stream = getClient().beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 64000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM,
        tools,
        messages: history,
      },
      { signal }
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "token", text: event.delta.text };
      }
    }

    const message = await stream.finalMessage();
    log(`[${conversationId}] model call #${iteration + 1} returned, stop_reason=${message.stop_reason}`);

    if (message.stop_reason === "refusal") {
      yield { type: "token", text: "\n\n(This request was declined by the model's safety system.)" };
      yield { type: "done", model: message.model ?? MODEL };
      return;
    }

    // Each round emits its own prose, and concatenating them raw runs the last
    // sentence of one into the first word of the next -- "database itself.Found
    // the project". A blank line keeps them separate paragraphs in markdown.
    if (message.content.some((b) => b.type === "text" && b.text?.trim())) {
      yield { type: "token", text: "\n\n" };
    }

    const toolUses = message.content.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) {
      log(
        `[${conversationId}] turn complete after ${iteration} tool round(s), ` +
          `stop_reason=${message.stop_reason}`
      );
      yield { type: "done", model: message.model ?? MODEL };
      return;
    }

    // The full content goes back, not just the tool_use blocks -- thinking and
    // text blocks are part of the turn and dropping them breaks the exchange.
    history.push({ role: "assistant", content: message.content });

    // Parallel tool calls come back in one message and their results must go
    // back in one user message. Splitting them teaches the model to stop
    // making parallel calls.
    const results = [];
    for (const use of toolUses) {
      // Two events per call: one when it starts, one when it finishes.
      //
      // The start event is what the activity bar reacts to -- a call that runs
      // for eight seconds has to be visible while it runs, not only once it
      // is over. The result event carries the output and is matched back by
      // id, because parallel calls finish out of order.
      //
      // Arguments go in whole. They were truncated to 200 characters, which
      // cuts an aggregation pipeline or a find filter off mid-token, and the
      // argument is the half that says what the model actually asked for.
      yield {
        type: "retrieval",
        retrieval: {
          id: use.id,
          tool: use.name,
          mode: "mcp",
          index: mcpUrl(),
          input: use.input ?? {},
          round: iteration + 1,
        },
      };

      const before = context;
      context = readContext(context, use.name, use.input);
      // Only on a change. Re-announcing the same cluster twenty times would
      // make the header flicker through identical states.
      if (JSON.stringify(before) !== JSON.stringify(context)) {
        yield { type: "context", context };
      }

      const started = Date.now();
      try {
        const { text, isError } = await callTool(conversationId, use.name, use.input);
        // Tool traffic is the thing that goes wrong here, and it is invisible
        // from the browser. One line per call, arguments truncated.
        log(
          `[${conversationId}] #${iteration + 1} ${use.name} ` +
            `${JSON.stringify(use.input ?? {}).slice(0, 160)} -> ` +
            `${isError ? "ERROR " : ""}${text.length}b in ${Date.now() - started}ms` +
            (isError ? `: ${text.slice(0, 200)}` : "")
        );
        yield {
          type: "retrieval_result",
          result: {
            id: use.id,
            ...clip(text),
            isError,
            ms: Date.now() - started,
          },
        };

        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: text,
          ...(isError ? { is_error: true } : {}),
        });
      } catch (err) {
        // A failed tool must still return a result, or the conversation is
        // left with a tool_use nothing answered.
        //
        // The session is deliberately NOT torn down here. A tool erroring is a
        // normal outcome; discarding the session would strand the MongoDB
        // connection that `connect` opened and make every following call fail
        // with "No active MongoDB connection for this session".
        log(
          `[${conversationId}] #${iteration + 1} ${use.name} THREW after ` +
            `${Date.now() - started}ms: ${err?.message ?? err}`
        );
        // A thrown call is reported to the transcript the same as a returned
        // error. Previously it reached the model and the log but nothing on
        // screen, so an answer built on three failed calls looked no
        // different from one built on three good ones.
        yield {
          type: "retrieval_result",
          result: {
            id: use.id,
            text: `tool failed: ${err?.message ?? err}`,
            truncated: false,
            isError: true,
            ms: Date.now() - started,
          },
        };

        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: `tool failed: ${err?.message ?? err}`,
          is_error: true,
        });
      }
    }

    history.push({ role: "user", content: results });
  }

  yield {
    type: "token",
    text: `\n\n(Stopped after ${MAX_ITERATIONS} tool rounds without reaching an answer.)`,
  };
  yield { type: "done", model: MODEL };
}
