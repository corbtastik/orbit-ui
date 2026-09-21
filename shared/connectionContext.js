// What a conversation is pointed at, derived from its tool calls.
//
// Shared because it has to run in three places: the server, which emits
// context live as a turn goes past; the client, which replays it over a
// transcript it has just loaded; and the tests. It was duplicated between the
// first two with a comment asking the next person to keep them in step, which
// is not a plan.
//
// There is nothing to ask for this. The MCP server holds the connection state
// and does not report it, and the model chooses a cluster by calling `connect`
// and a database by naming one in an argument. So it is inferred from what
// actually went over the wire, which has the advantage of being what happened
// rather than what was intended.

/**
 * Folds one tool call into the running context.
 *
 * Only ever adds. A call that names a database does not mean the cluster
 * changed, and a call with no database argument does not mean there is no
 * database -- the absence of an argument is not a change of context, and
 * treating it as one would blank the indicator every time a tool took none.
 */
export function readContext(previous, toolName, input) {
  const next = { ...previous };
  const args = input ?? {};

  // `connect` is the one that changes cluster, and the argument it uses has
  // been spelled more than one way across OrbitAI versions.
  if (toolName === 'connect') {
    const target = args.name ?? args.connection ?? args.connectionString;
    if (typeof target === 'string' && target) next.connection = target;
  }
  if (typeof args.connection === 'string' && args.connection) next.connection = args.connection;

  if (typeof args.database === 'string' && args.database) next.database = args.database;
  if (typeof args.collection === 'string' && args.collection) next.collection = args.collection;

  // Atlas tools carry the project as a path parameter rather than an argument.
  const groupId = args.params?.groupId;
  if (typeof groupId === 'string' && groupId) next.groupId = groupId;

  return next;
}

/**
 * The context a stored transcript implies.
 *
 * Replayed rather than persisted as its own field: the tool calls are already
 * saved with their arguments, so this reconstructs exactly what the live
 * session showed, needs no schema change, and lights up conversations that
 * were stored before the indicator existed.
 */
export function contextFromMessages(messages) {
  let context = {};
  for (const message of messages ?? []) {
    // `retrieval` is the single-call shape used before transcripts kept them
    // all; both are walked so old conversations are not silently blank.
    const calls = message?.retrievals ?? (message?.retrieval ? [message.retrieval] : []);
    for (const call of calls) {
      context = readContext(context, call?.tool, callInput(call));
    }
  }
  return context;
}

/**
 * A call's arguments, however that transcript happens to store them.
 *
 * Before arguments were kept whole they were a `query` string clipped to 200
 * characters. Short ones still parse and are worth recovering; long ones are
 * truncated mid-token and simply will not, which is the honest outcome --
 * guessing at the missing half would put a cluster name on screen that the
 * conversation never used.
 */
function callInput(call) {
  if (call?.input && typeof call.input === 'object') return call.input;
  if (typeof call?.query !== 'string') return undefined;
  try {
    const parsed = JSON.parse(call.query);
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}
