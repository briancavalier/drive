import {
  FACTORY_COMMAND_CONTEXTS,
  FACTORY_COMMANDS,
  FACTORY_SLASH_COMMANDS
} from "./factory-config.mjs";

function normalizeBody(body) {
  return `${body || ""}`.trim().replace(/\s+/g, " ").toLowerCase();
}

export function parseFactorySlashCommand(body, context) {
  const normalizedBody = normalizeBody(body);
  const commands = FACTORY_SLASH_COMMANDS[context];

  if (!commands) {
    return null;
  }

  for (const [command, literal] of Object.entries(commands)) {
    if (normalizedBody === literal) {
      return {
        command,
        literal
      };
    }
  }

  return null;
}

export function getFactoryCommentContext(payload) {
  if (payload?.issue?.pull_request) {
    return FACTORY_COMMAND_CONTEXTS.pullRequest;
  }

  return FACTORY_COMMAND_CONTEXTS.issue;
}

export function isFactoryIssueCommand(command) {
  return command === FACTORY_COMMANDS.start;
}

