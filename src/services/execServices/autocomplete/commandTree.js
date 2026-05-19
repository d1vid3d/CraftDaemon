//  commandTree.js - Static Minecraft command argument structure
//  Single source of truth for autocomplete argument data. Zero logic, zero imports.

// Structure:
// Top-level keys are base commands (without slash).
// Each command has an "args" array defining its argument structure.
// Arguments can be of type:
// - literal: fixed set of string values
// - player: dynamic list of online players (via RCON)
// - selector: dynamic list of player selectors (@a, @p, etc. + online players)
// - item: dynamic list of common items (hardcoded for now, could be extended with RCON)
// - number: freeform numeric input (with optional hint for formatting)
// - freetext: freeform string input (with optional hint for formatting)

// This structure is used by the autocomplete walker to determine what suggestions
// to provide at each stage of command construction.

"use strict";

module.exports = {

  time: {
    args: [
      { type: 'literal', values: ['set', 'add', 'query'] },
      {
        type: 'literal',
        dependsOn: { argIndex: 0, value: 'set' },
        values: ['day', 'night', 'noon', 'midnight'],
        fallback: [{ type: 'number', hint: '<ticks 0-24000>' }]
      },
      {
        type: 'literal',
        dependsOn: { argIndex: 0, value: 'query' },
        values: ['daytime', 'gametime', 'day'],
        fallback: []
      }
    ]
  },

  gamemode: {
    args: [
      { type: 'literal', values: ['survival', 'creative', 'adventure', 'spectator'] },
      { type: 'player' }
    ]
  },

  defaultgamemode: {
    args: [
      { type: 'literal', values: ['survival', 'creative', 'adventure', 'spectator'] }
    ]
  },

  difficulty: {
    args: [
      { type: 'literal', values: ['peaceful', 'easy', 'normal', 'hard'] }
    ]
  },

  weather: {
    args: [
      { type: 'literal', values: ['clear', 'rain', 'thunder'] },
      { type: 'number', hint: '<duration seconds>' }
    ]
  },

  gamerule: {
    args: [
      {
        type: 'literal',
        values: [
          'doDaylightCycle', 'doFireTick', 'keepInventory',
          'doMobSpawning', 'pvp', 'naturalRegeneration',
          'doWeatherCycle', 'mobGriefing', 'doImmediateRespawn',
          'announceAdvancements', 'disableRaids', 'doInsomnia',
          'doLimitedCrafting', 'drowningDamage', 'fallDamage',
          'fireDamage', 'freezeDamage', 'playersSleepingPercentage',
          'randomTickSpeed', 'spawnRadius'
        ]
      },
      {
        type: 'literal',
        dependsOn: {
          argIndex: 0,
          matchesAny: [
            'doDaylightCycle', 'doFireTick', 'keepInventory',
            'doMobSpawning', 'pvp', 'naturalRegeneration',
            'doWeatherCycle', 'mobGriefing', 'doImmediateRespawn',
            'announceAdvancements', 'disableRaids', 'doInsomnia',
            'doLimitedCrafting', 'drowningDamage', 'fallDamage',
            'fireDamage', 'freezeDamage'
          ]
        },
        values: ['true', 'false'],
        fallback: [{ type: 'number', hint: '<number>' }]
      }
    ]
  },

  kick: {
    args: [
      { type: 'player' },
      { type: 'freetext', hint: '<reason>' }
    ]
  },

  ban: {
    args: [
      { type: 'player' },
      { type: 'freetext', hint: '<reason>' }
    ]
  },

  'ban-ip': {
    args: [
      { type: 'player' },
      { type: 'freetext', hint: '<reason>' }
    ]
  },

  pardon: {
    args: [
      { type: 'freetext', hint: '<player name>' }
    ]
  },

  'pardon-ip': {
    args: [
      { type: 'freetext', hint: '<ip address>' }
    ]
  },

  banlist: { args: [] },

  op: {
    args: [
      { type: 'player' }
    ]
  },

  deop: {
    args: [
      { type: 'player' }
    ]
  },

  kill: {
    args: [
      { type: 'selector' }
    ]
  },

  tp: {
    args: [
      { type: 'selector' },
      { type: 'selector' }
    ]
  },

  teleport: {
    args: [
      { type: 'selector' },
      { type: 'selector' }
    ]
  },

  say: {
    args: [
      { type: 'freetext', hint: '<message>' }
    ]
  },

  tell: {
    args: [
      { type: 'player' },
      { type: 'freetext', hint: '<message>' }
    ]
  },

  msg: {
    args: [
      { type: 'player' },
      { type: 'freetext', hint: '<message>' }
    ]
  },

  w: {
    args: [
      { type: 'player' },
      { type: 'freetext', hint: '<message>' }
    ]
  },

  me: {
    args: [
      { type: 'freetext', hint: '<message>' }
    ]
  },

  give: {
    args: [
      { type: 'selector' },
      { type: 'item' },
      { type: 'number', hint: '<amount 1-64>' }
    ]
  },

  clear: {
    args: [
      { type: 'selector' },
      { type: 'item' }
    ]
  },

  enchant: {
    args: [
      { type: 'selector' },
      {
        type: 'literal',
        values: [
          'sharpness', 'smite', 'bane_of_arthropods',
          'knockback', 'fire_aspect', 'looting',
          'sweeping', 'protection', 'fire_protection',
          'feather_falling', 'blast_protection', 'projectile_protection',
          'thorns', 'respiration', 'aqua_affinity', 'depth_strider',
          'efficiency', 'silk_touch', 'unbreaking', 'fortune',
          'power', 'punch', 'flame', 'infinity',
          'luck_of_the_sea', 'lure', 'mending', 'vanishing_curse',
          'binding_curse', 'soul_speed', 'swift_sneak',
          'loyalty', 'impaling', 'riptide', 'channeling',
          'multishot', 'quick_charge', 'piercing', 'frost_walker'
        ]
      },
      { type: 'number', hint: '<level 1-5>' }
    ]
  },

  effect: {
    args: [
      { type: 'selector' },
      {
        type: 'literal',
        values: [
          'clear', 'give', 'speed', 'slowness', 'haste',
          'mining_fatigue', 'strength', 'instant_health',
          'instant_damage', 'jump_boost', 'nausea', 'regeneration',
          'resistance', 'fire_resistance', 'water_breathing',
          'invisibility', 'blindness', 'night_vision', 'hunger',
          'weakness', 'poison', 'wither', 'health_boost',
          'absorption', 'saturation', 'glowing', 'levitation',
          'luck', 'unluck', 'slow_falling', 'conduit_power',
          'dolphins_grace', 'bad_omen', 'hero_of_the_village',
          'darkness'
        ]
      },
      { type: 'number', hint: '<duration seconds>' },
      { type: 'number', hint: '<amplifier 0-255>' }
    ]
  },

  xp: {
    args: [
      { type: 'literal', values: ['add', 'set', 'query'] },
      { type: 'player' },
      { type: 'number', hint: '<amount>' },
      {
        type: 'literal',
        dependsOn: { argIndex: 0, matchesAny: ['add', 'set'] },
        values: ['points', 'levels'],
        fallback: []
      }
    ]
  },

  experience: {
    args: [
      { type: 'literal', values: ['add', 'set', 'query'] },
      { type: 'player' },
      { type: 'number', hint: '<amount>' },
      {
        type: 'literal',
        dependsOn: { argIndex: 0, matchesAny: ['add', 'set'] },
        values: ['points', 'levels'],
        fallback: []
      }
    ]
  },

  whitelist: {
    args: [
      { type: 'literal', values: ['add', 'remove', 'list', 'on', 'off', 'reload'] },
      {
        type: 'player',
        dependsOn: { argIndex: 0, matchesAny: ['add', 'remove'] },
        fallback: []
      }
    ]
  },

  scoreboard: {
    args: [
      { type: 'literal', values: ['objectives', 'players', 'teams'] },
      {
        type: 'literal',
        dependsOn: { argIndex: 0, value: 'objectives' },
        values: ['list', 'add', 'remove', 'setdisplay', 'modify'],
        fallback: []
      },
      {
        type: 'literal',
        dependsOn: { argIndex: 0, value: 'players' },
        values: ['list', 'get', 'set', 'add', 'remove', 'reset', 'enable', 'operation'],
        fallback: []
      }
    ]
  },

  summon: {
    args: [
      {
        type: 'literal',
        values: [
          'minecraft:zombie', 'minecraft:skeleton', 'minecraft:creeper',
          'minecraft:spider', 'minecraft:enderman', 'minecraft:blaze',
          'minecraft:witch', 'minecraft:wither_skeleton', 'minecraft:stray',
          'minecraft:husk', 'minecraft:phantom', 'minecraft:drowned',
          'minecraft:pillager', 'minecraft:ravager', 'minecraft:hoglin',
          'minecraft:piglin', 'minecraft:zoglin', 'minecraft:warden',
          'minecraft:ender_dragon', 'minecraft:wither', 'minecraft:elder_guardian',
          'minecraft:cow', 'minecraft:pig', 'minecraft:sheep',
          'minecraft:chicken', 'minecraft:wolf', 'minecraft:cat',
          'minecraft:horse', 'minecraft:villager', 'minecraft:iron_golem',
          'minecraft:snow_golem', 'minecraft:armor_stand', 'minecraft:item_frame',
          'minecraft:falling_block', 'minecraft:tnt', 'minecraft:bat',
          'minecraft:bee', 'minecraft:fox', 'minecraft:panda',
          'minecraft:dolphin', 'minecraft:turtle', 'minecraft:squid'
        ]
      },
      { type: 'freetext', hint: '<x y z — coordinates optional>' }
    ]
  },

  spawnpoint: {
    args: [
      { type: 'player' },
      { type: 'freetext', hint: '<x y z>' }
    ]
  },

  setworldspawn: {
    args: [
      { type: 'freetext', hint: '<x y z>' }
    ]
  },

  seed: { args: [] },

  list: { args: [] },

  save: {
    args: [
      { type: 'literal', values: ['on', 'off', 'all'] }
    ]
  },

  'save-all': { args: [] },
  'save-on':  { args: [] },
  'save-off': { args: [] },

  reload: { args: [] },

  stop: { args: [] },

};

const COMMON_ITEMS = [
  'minecraft:diamond_sword', 'minecraft:diamond_pickaxe', 'minecraft:diamond_axe',
  'minecraft:diamond_shovel', 'minecraft:diamond_hoe', 'minecraft:diamond_helmet',
  'minecraft:diamond_chestplate', 'minecraft:diamond_leggings', 'minecraft:diamond_boots',
  'minecraft:netherite_sword', 'minecraft:netherite_pickaxe', 'minecraft:netherite_axe',
  'minecraft:netherite_shovel', 'minecraft:netherite_helmet', 'minecraft:netherite_chestplate',
  'minecraft:netherite_leggings', 'minecraft:netherite_boots',
  'minecraft:diamond', 'minecraft:emerald', 'minecraft:gold_ingot', 'minecraft:iron_ingot',
  'minecraft:netherite_ingot', 'minecraft:coal', 'minecraft:redstone', 'minecraft:lapis_lazuli',
  'minecraft:oak_log', 'minecraft:birch_log', 'minecraft:spruce_log', 'minecraft:jungle_log',
  'minecraft:cobblestone', 'minecraft:stone', 'minecraft:dirt', 'minecraft:grass_block',
  'minecraft:sand', 'minecraft:gravel', 'minecraft:obsidian', 'minecraft:bedrock',
  'minecraft:tnt', 'minecraft:torch', 'minecraft:crafting_table', 'minecraft:furnace',
  'minecraft:chest', 'minecraft:ender_chest', 'minecraft:shulker_box',
  'minecraft:golden_apple', 'minecraft:enchanted_golden_apple',
  'minecraft:bread', 'minecraft:cooked_beef', 'minecraft:cooked_chicken',
  'minecraft:apple', 'minecraft:carrot', 'minecraft:potato',
  'minecraft:bow', 'minecraft:crossbow', 'minecraft:arrow', 'minecraft:trident',
  'minecraft:shield', 'minecraft:totem_of_undying', 'minecraft:elytra',
  'minecraft:experience_bottle', 'minecraft:name_tag', 'minecraft:lead',
  'minecraft:saddle', 'minecraft:oak_boat', 'minecraft:minecart',
  'minecraft:blaze_rod', 'minecraft:ender_pearl', 'minecraft:eye_of_ender',
  'minecraft:nether_star', 'minecraft:beacon', 'minecraft:dragon_egg',
  'minecraft:written_book', 'minecraft:map', 'minecraft:compass',
  'minecraft:spawner', 'minecraft:command_block',
];

module.exports.COMMON_ITEMS = COMMON_ITEMS;