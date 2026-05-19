//  commandAutocomplete.js - Robust Minecraft command autocomplete walker
//  Parses input, walks the command tree, resolves suggestions via RCON for
//  dynamic types (player/selector), applies RBAC filter, formats for Discord.

"use strict";

const commandTree = require('./commandTree');
const { resolveExecPermissions } = require('../permissions');
const { rconSend } = require('../../rconQuery');

const CACHE_TTL_MS = 8000;
const TARGET_SELECTORS = ['@a', '@e', '@p', '@r', '@s'];

const playerCache = {
  players: [],
  fetchedAt: 0,
};

// Main entry point for resolving autocomplete suggestions.
async function getOnlinePlayers() {
  const now = Date.now();
  if (now - playerCache.fetchedAt < CACHE_TTL_MS) {
    return playerCache.players;
  }
  try {
    const response = await rconSend('list');
    if (!response) return playerCache.players;
    const match = response.match(/online:\s*(.+)$/);
    const players = match
      ? match[1].split(',').map(p => p.trim()).filter(Boolean)
      : [];
    playerCache.players = players;
    playerCache.fetchedAt = now;
    return players;
  } catch {
    return playerCache.players;
  }
}

// Parses the focused input into base command, committed args, current arg, and arg index.
function parseInput(focused) {
  const hasTrailingSpace = focused.endsWith(' ');
  const tokens = focused.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return { base: '', committed: [], current: '', argIndex: 0 };
  }

  if (tokens.length === 1 && !hasTrailingSpace) {
    return { base: tokens[0], committed: [], current: tokens[0], argIndex: 0 };
  }

  const base = tokens[0];
  const argTokens = tokens.slice(1);

  if (hasTrailingSpace) {
    return {
      base,
      committed: argTokens,
      current: '',
      argIndex: argTokens.length + 1,
    };
  } else {
    return {
      base,
      committed: argTokens.slice(0, -1),
      current: argTokens[argTokens.length - 1],
      argIndex: argTokens.length,
    };
  }
}

// Checks if the current argument's dependencies are satisfied based on committed args.
function dependsSatisfied(argDef, committed) {
  if (!argDef.dependsOn) return true;

  const { argIndex, value, matchesAny } = argDef.dependsOn;
  const actual = committed[argIndex];

  if (value !== undefined) return actual === value;
  if (matchesAny !== undefined) return matchesAny.includes(actual);
  return true;
}

// Resolves argument suggestions based on the argument definition and current input.
async function resolveArgSuggestions(argDef, current, committed) {
  if (!dependsSatisfied(argDef, committed)) {
    if (argDef.fallback && argDef.fallback.length > 0) {
      return resolveArgSuggestions(argDef.fallback[0], current, committed);
    }
    return [];
  }

  switch (argDef.type) {
    case 'literal': {
      return argDef.values.filter(v =>
        current === '' || v.toLowerCase().startsWith(current.toLowerCase())
      );
    }

    case 'player': {
      const players = await getOnlinePlayers();
      return players.filter(p =>
        current === '' || p.toLowerCase().startsWith(current.toLowerCase())
      );
    }

    case 'selector': {
      const players = await getOnlinePlayers();
      const combined = [...TARGET_SELECTORS, ...players];
      return combined.filter(p =>
        current === '' || p.toLowerCase().startsWith(current.toLowerCase())
      );
    }

    case 'item': {
      const { COMMON_ITEMS } = require('./commandTree');
      return COMMON_ITEMS.filter(item =>
        current === '' || item.toLowerCase().includes(current.toLowerCase())
      );
    }

    case 'freetext': {
      return [argDef.hint];
    }

    case 'number': {
      return [argDef.hint];
    }

    default:
      return [];
  }
}

// Filters a list of base commands by the user's exec permissions.
function filterByAllowlist(commands, userId, member, permConfig) {
  const { blockedCommands } = permConfig.exec;

  return commands.filter(cmd => {
    if (blockedCommands.includes(cmd)) return false;
    return resolveExecPermissions(cmd, userId, member, permConfig);
  });
}

// Formats suggestions into the structure expected by Discord, combining base command and committed args.
function formatSuggestions(suggestions, base, committed, argDef) {
  const prefix = [base, ...committed].join(' ');

  return suggestions.slice(0, 25).map(suggestion => {
    const value = prefix ? `${prefix} ${suggestion}` : suggestion;

    const isFreetext = suggestion.startsWith('<') || suggestion.startsWith('[');
    if (isFreetext) {
      return {
        name: `${prefix} ${suggestion}`.trim(),
        value: prefix || suggestion,
      };
    }

    return {
      name: value.trim(),
      value: value.trim(),
    };
  });
}

// Main function to resolve autocomplete suggestions based on the focused input and user permissions.
async function resolveAutocomplete(focused, interaction, permConfig) {
  const { base, committed, current, argIndex } = parseInput(focused);

  if (argIndex === 0) {
    const allBaseCommands = Object.keys(commandTree);
    const filtered = filterByAllowlist(
      allBaseCommands.filter(cmd =>
        current === '' || cmd.toLowerCase().startsWith(current.toLowerCase())
      ),
      interaction.user.id,
      interaction.member,
      permConfig
    );

    return filtered.slice(0, 25).map(cmd => ({ name: cmd, value: cmd }));
  }

  const tree = commandTree[base];
  if (!tree) return [];

  const argDef = tree.args[argIndex - 1];
  if (!argDef) return [];

  const suggestions = await resolveArgSuggestions(argDef, current, committed);

  return formatSuggestions(suggestions, base, committed, argDef);
}

module.exports = { resolveAutocomplete };