import {
  FACTORY_COMMAND_CONTEXTS,
  FACTORY_COMMANDS,
  FACTORY_SLASH_COMMANDS
} from "./factory-config.mjs";

function normalizeLine(body) {
  return `${body || ""}`.trim().replace(/\s+/g, " ");
}

export function parseFactorySlashCommand(body, context) {
  const trimmedBody = `${body || ""}`.trim();
  const [firstLine = "", ...remainingLines] = trimmedBody.split(/\r?\n/);
  const normalizedBody = normalizeLine(firstLine).toLowerCase();
  const commands = FACTORY_SLASH_COMMANDS[context];

  if (!commands) {
    return null;
  }

  if (
    context === FACTORY_COMMAND_CONTEXTS.pullRequest &&
    normalizedBody.startsWith(`${FACTORY_SLASH_COMMANDS[context][FACTORY_COMMANDS.answer]} `)
  ) {
    const answerMatch = normalizeLine(firstLine).match(
      /^\/factory\s+answer\s+(\S+)\s+(\S+)(?:\s+(.*))?$/i
    );

    if (!answerMatch) {
      return null;
    }

    const [, interventionId, optionId, firstLineNote = ""] = answerMatch;
    const note = [firstLineNote.trim(), ...remainingLines.map((line) => line.trim())]
      .filter(Boolean)
      .join("\n");

    return {
      command: FACTORY_COMMANDS.answer,
      literal: FACTORY_SLASH_COMMANDS[context][FACTORY_COMMANDS.answer],
      interventionId,
      optionId,
      note
    };
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
