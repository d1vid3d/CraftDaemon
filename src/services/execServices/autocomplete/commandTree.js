//  commandTree.js - Static Minecraft command argument structure (v1.3.3)
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
      { type: 'freetext', hint: '<player or IP address>' },
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
      { type: 'literal', values: ['give', 'clear'] },
      { type: 'selector' },
      {
        type: 'literal',
        dependsOn: { argIndex: 0, value: 'give' },
        values: [
          'speed', 'slowness', 'haste', 'mining_fatigue', 'strength',
          'instant_health', 'instant_damage', 'jump_boost', 'nausea',
          'regeneration', 'resistance', 'fire_resistance', 'water_breathing',
          'invisibility', 'blindness', 'night_vision', 'hunger',
          'weakness', 'poison', 'wither', 'health_boost',
          'absorption', 'saturation', 'glowing', 'levitation',
          'luck', 'unluck', 'slow_falling', 'conduit_power',
          'dolphins_grace', 'bad_omen', 'hero_of_the_village', 'darkness'
        ],
        fallback: [
          {
            type: 'literal',
            dependsOn: { argIndex: 0, value: 'clear' },
            values: [
              'speed', 'slowness', 'haste', 'mining_fatigue', 'strength',
              'instant_health', 'instant_damage', 'jump_boost', 'nausea',
              'regeneration', 'resistance', 'fire_resistance', 'water_breathing',
              'invisibility', 'blindness', 'night_vision', 'hunger',
              'weakness', 'poison', 'wither', 'health_boost',
              'absorption', 'saturation', 'glowing', 'levitation',
              'luck', 'unluck', 'slow_falling', 'conduit_power',
              'dolphins_grace', 'bad_omen', 'hero_of_the_village', 'darkness'
            ],
            fallback: []
          }
        ]
      },
      {
        type: 'number',
        hint: '<duration seconds>',
        dependsOn: { argIndex: 0, value: 'give' },
        fallback: []
      },
      {
        type: 'number',
        hint: '<amplifier 0-255>',
        dependsOn: { argIndex: 0, value: 'give' },
        fallback: []
      }
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

  title: {
    args: [
      { type: 'selector' },
      { type: 'literal', values: ['clear', 'reset', 'title', 'subtitle', 'actionbar', 'times'] },
      {
        type: 'freetext',
        dependsOn: { argIndex: 1, matchesAny: ['title', 'subtitle', 'actionbar'] },
        hint: '<json text>',
        fallback: [
          {
            type: 'number',
            dependsOn: { argIndex: 1, value: 'times' },
            hint: '<fade in ticks>',
            fallback: []
          }
        ]
      },
      {
        type: 'number',
        dependsOn: { argIndex: 1, value: 'times' },
        hint: '<stay ticks>',
        fallback: []
      },
      {
        type: 'number',
        dependsOn: { argIndex: 1, value: 'times' },
        hint: '<fade out ticks>',
        fallback: []
      }
    ]
  },

  tellraw: {
    args: [
      { type: 'selector' },
      { type: 'freetext', hint: '<json message>' }
    ]
  },

  execute: {
    args: [
      { type: 'literal', values: ['as', 'at', 'in', 'positioned', 'rotated', 'facing', 'align', 'anchored', 'store', 'if', 'unless', 'run'] },
      {
        type: 'selector',
        dependsOn: { argIndex: 0, matchesAny: ['as', 'at'] },
        fallback: [
          {
            type: 'literal',
            dependsOn: { argIndex: 0, value: 'in' },
            values: ['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'],
            fallback: [
              {
                type: 'literal',
                dependsOn: { argIndex: 0, value: 'align' },
                values: ['x', 'y', 'z', 'xy', 'xz', 'yz', 'xyz'],
                fallback: [
                  {
                    type: 'literal',
                    dependsOn: { argIndex: 0, value: 'anchored' },
                    values: ['eyes', 'feet'],
                    fallback: [
                      {
                        type: 'freetext',
                        dependsOn: { argIndex: 0, matchesAny: ['positioned', 'rotated', 'facing', 'store', 'if', 'unless'] },
                        hint: '<sub-args>',
                        fallback: [
                          {
                            type: 'freetext',
                            dependsOn: { argIndex: 0, value: 'run' },
                            hint: '<command>',
                            fallback: []
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },

  fill: {
    args: [
      { type: 'freetext', hint: '<x1 y1 z1>' },
      { type: 'freetext', hint: '<x2 y2 z2>' },
      { type: 'item' },
      { type: 'literal', values: ['destroy', 'hollow', 'keep', 'outline', 'replace'] }
    ]
  },

  clone: {
    args: [
      { type: 'freetext', hint: '<x1 y1 z1>' },
      { type: 'freetext', hint: '<x2 y2 z2>' },
      { type: 'freetext', hint: '<x y z destination>' },
      { type: 'literal', values: ['replace', 'masked', 'filtered'] },
      { type: 'literal', values: ['normal', 'force', 'move'] }
    ]
  },

  setblock: {
    args: [
      { type: 'freetext', hint: '<x y z>' },
      { type: 'item' },
      { type: 'literal', values: ['destroy', 'keep', 'replace'] }
    ]
  },

  data: {
    args: [
      { type: 'literal', values: ['get', 'merge', 'modify', 'remove'] },
      { type: 'literal', values: ['block', 'entity', 'storage'] },
      { type: 'freetext', hint: '<target coords or selector>' },
      { type: 'freetext', hint: '<nbt path>' }
    ]
  },

  datapack: {
    args: [
      { type: 'literal', values: ['disable', 'enable', 'list'] },
      {
        type: 'freetext',
        dependsOn: { argIndex: 0, matchesAny: ['disable', 'enable'] },
        hint: '<datapack name>',
        fallback: []
      }
    ]
  },

  locate: {
    args: [
      { type: 'literal', values: ['structure', 'biome'] },
      { type: 'freetext', hint: '<name>' }
    ]
  },

  worldborder: {
    args: [
      { type: 'literal', values: ['set', 'add', 'center', 'damage', 'warning', 'get'] },
      {
        type: 'number',
        dependsOn: { argIndex: 0, matchesAny: ['set', 'add'] },
        hint: '<distance>',
        fallback: [
          {
            type: 'freetext',
            dependsOn: { argIndex: 0, value: 'center' },
            hint: '<x z>',
            fallback: [
              {
                type: 'literal',
                dependsOn: { argIndex: 0, value: 'damage' },
                values: ['buffer', 'amount'],
                fallback: [
                  {
                    type: 'literal',
                    dependsOn: { argIndex: 0, value: 'warning' },
                    values: ['time', 'distance'],
                    fallback: []
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },

  recipe: {
    args: [
      { type: 'literal', values: ['give', 'take'] },
      { type: 'selector' },
      { type: 'freetext', hint: '<recipe or *>' }
    ]
  },

  advancement: {
    args: [
      { type: 'literal', values: ['grant', 'revoke'] },
      { type: 'selector' },
      { type: 'literal', values: ['everything', 'only', 'from', 'through', 'until'] },
      {
        type: 'freetext',
        dependsOn: { argIndex: 2, matchesAny: ['only', 'from', 'through', 'until'] },
        hint: '<advancement>',
        fallback: []
      }
    ]
  },

  bossbar: {
    args: [
      { type: 'literal', values: ['add', 'get', 'list', 'remove', 'set'] },
      {
        type: 'freetext',
        dependsOn: { argIndex: 0, matchesAny: ['add', 'get', 'remove', 'set'] },
        hint: '<bossbar id>',
        fallback: []
      },
      {
        type: 'literal',
        dependsOn: { argIndex: 0, value: 'set' },
        values: ['name', 'color', 'style', 'value', 'max', 'visible', 'players'],
        fallback: [
          {
            type: 'freetext',
            dependsOn: { argIndex: 0, value: 'add' },
            hint: '<name json>',
            fallback: []
          }
        ]
      }
    ]
  },

  attribute: {
    args: [
      { type: 'selector' },
      {
        type: 'literal',
        values: [
          'minecraft:generic.max_health', 'minecraft:generic.knockback_resistance',
          'minecraft:generic.movement_speed', 'minecraft:generic.attack_damage',
          'minecraft:generic.armor', 'minecraft:generic.armor_toughness',
          'minecraft:generic.luck', 'minecraft:generic.follow_range',
          'minecraft:generic.attack_speed', 'minecraft:generic.flying_speed',
          'minecraft:horse.jump_strength', 'minecraft:zombie.spawn_reinforcements'
        ]
      },
      { type: 'literal', values: ['get', 'set', 'base', 'modifier'] },
      {
        type: 'number',
        dependsOn: { argIndex: 2, matchesAny: ['set', 'base'] },
        hint: '<value>',
        fallback: [
          {
            type: 'literal',
            dependsOn: { argIndex: 2, value: 'modifier' },
            values: ['add', 'remove', 'value', 'get'],
            fallback: []
          }
        ]
      }
    ]
  },

  spreadplayers: {
    args: [
      { type: 'freetext', hint: '<x z center>' },
      { type: 'number', hint: '<spread distance>' },
      { type: 'number', hint: '<max range>' },
      { type: 'literal', values: ['true', 'false'] },
      { type: 'selector' }
    ]
  },

  playsound: {
    args: [
      {
        type: 'literal',
        values: [
          'minecraft:ambient.cave', 'minecraft:ambient.underwater.enter',
          'minecraft:block.anvil.break', 'minecraft:block.anvil.destroy',
          'minecraft:block.anvil.land', 'minecraft:block.anvil.use',
          'minecraft:block.bell.use', 'minecraft:block.brewing_stand.brew',
          'minecraft:block.chest.close', 'minecraft:block.chest.locked',
          'minecraft:block.chest.open', 'minecraft:block.ender_chest.close',
          'minecraft:block.ender_chest.open', 'minecraft:block.furnace.fire_crackle',
          'minecraft:block.lantern.break', 'minecraft:block.lantern.fall',
          'minecraft:block.lantern.hit', 'minecraft:block.lantron.place',
          'minecraft:block.lantern.step',
          'minecraft:entity.experience_orb.pickup', 'minecraft:entity.item.pickup',
          'minecraft:entity.player.burp', 'minecraft:entity.player.death',
          'minecraft:entity.player.hurt', 'minecraft:entity.player.levelup',
          'minecraft:entity.player.breath', 'minecraft:entity.player.splash',
          'minecraft:entity.player.swim',
          'minecraft:entity.zombie.ambient', 'minecraft:entity.zombie.death',
          'minecraft:entity.zombie.hurt', 'minecraft:entity.zombie.infect',
          'minecraft:entity.skeleton.ambient', 'minecraft:entity.skeleton.death',
          'minecraft:entity.skeleton.hurt',
          'minecraft:entity.creeper.primed', 'minecraft:entity.creeper.death',
          'minecraft:entity.endermen.ambient', 'minecraft:entity.endermen.death',
          'minecraft:entity.endermen.hurt', 'minecraft:entity.endermen.scream',
          'minecraft:entity.endermen.stare', 'minecraft:entity.endermen.teleport',
          'minecraft:entity.blaze.ambient', 'minecraft:entity.blaze.death',
          'minecraft:entity.blaze.hurt', 'minecraft:entity.blaze.shoot',
          'minecraft:entity.ghast.ambient', 'minecraft:entity.ghast.death',
          'minecraft:entity.ghast.hurt', 'minecraft:entity.ghast.scream',
          'minecraft:entity.spider.ambient', 'minecraft:entity.spider.death',
          'minecraft:entity.spider.hurt',
          'minecraft:entity.witch.ambient', 'minecraft:entity.witch.death',
          'minecraft:entity.witch.hurt',
          'minecraft:entity.dolphin.ambient', 'minecraft:entity.dolphin.death',
          'minecraft:entity.dolphin.hurt', 'minecraft:entity.dolphin.jump',
          'minecraft:entity.panda.ambient', 'minecraft:entity.panda.death',
          'minecraft:entity.panda.hurt', 'minecraft:entity.panda.sneeze',
          'minecraft:entity.wolf.ambient', 'minecraft:entity.wolf.death',
          'minecraft:entity.wolf.hurt', 'minecraft:entity.wolf.howl',
          'minecraft:entity.cat.hiss', 'minecraft:entity.cat.purr',
          'minecraft:entity.cat.beg', 'minecraft:entity.cat.ambient',
          'minecraft:entity.villager.ambient', 'minecraft:entity.villager.death',
          'minecraft:entity.villager.hurt', 'minecraft:entity.villager.no',
          'minecraft:entity.villager.yes',
          'minecraft:entity.warden.ambient', 'minecraft:entity.warden.angry',
          'minecraft:entity.warden.attack_impact', 'minecraft:entity.warden.death',
          'minecraft:entity.warden.hurt', 'minecraft:entity.warden.listen',
          'minecraft:entity.warden.nearby_closer', 'minecraft:entity.warden.roar',
          'minecraft:entity.warden.sonic_boom', 'minecraft:entity.warden.sonic_charge',
          'minecraft:entity.warden.tendril_clicks',
          'minecraft:item.trident.throw', 'minecraft:item.trident.return',
          'minecraft:item.trident.riptide', 'minecraft:item.trident.hit',
          'minecraft:music.disc.11', 'minecraft:music.disc.13',
          'minecraft:music.disc.blocks', 'minecraft:music.disc.cat',
          'minecraft:music.disc.chirp', 'minecraft:music.disc.far',
          'minecraft:music.disc.mellohi', 'minecraft:music.disc.stal',
          'minecraft:music.disc.strad', 'minecraft:music.disc.wait',
          'minecraft:music.disc.otherside', 'minecraft:music.disc.pigstep',
          'minecraft:music.disc.relic',
          'minecraft:music.overworld', 'minecraft:music.creative',
          'minecraft:music.menu', 'minecraft:music.end',
          'minecraft:music.dragon', 'minecraft:music.nether'
        ]
      },
      { type: 'selector' },
      {
        type: 'literal',
        values: ['master', 'music', 'record', 'weather', 'block', 'hostile', 'neutral', 'player', 'ambient', 'voice']
      },
      { type: 'number', hint: '<volume 0.0-1.0>' },
      { type: 'number', hint: '<pitch 0.5-2.0>' },
      { type: 'freetext', hint: '<x y z>' }
    ]
  },

  stopsound: {
    args: [
      { type: 'selector' },
      {
        type: 'literal',
        values: ['master', 'music', 'record', 'weather', 'block', 'hostile', 'neutral', 'player', 'ambient', 'voice'],
        fallback: []
      },
      { type: 'freetext', hint: '<sound>', fallback: [] }
    ]
  },

  particle: {
    args: [
      {
        type: 'literal',
        values: [
          'minecraft:ambient_entity_effect', 'minecraft:angry_villager',
          'minecraft:block', 'minecraft:block_marker',
          'minecraft:bubble', 'minecraft:bubble_column_up',
          'minecraft:bubble_pop', 'minecraft:campfire_cosy_smoke',
          'minecraft:campfire_signal_smoke', 'minecraft:cloud',
          'minecraft:composter', 'minecraft:crimson_spore',
          'minecraft:current_down', 'minecraft:damage_indicator',
          'minecraft:dolphin', 'minecraft:dragon_breath',
          'minecraft:dripping_dripstone_lava', 'minecraft:dripping_dripstone_water',
          'minecraft:dripping_honey', 'minecraft:dripping_lava',
          'minecraft:dripping_obsidian_tear', 'minecraft:dripping_water',
          'minecraft:dust', 'minecraft:dust_color_transition',
          'minecraft:effect', 'minecraft:elder_guardian',
          'minecraft:electric_spark', 'minecraft:enchant',
          'minecraft:enchanted_hit', 'minecraft:end_rod',
          'minecraft:entity_effect', 'minecraft:explosion',
          'minecraft:explosion_emitter', 'minecraft:falling_dripstone_lava',
          'minecraft:falling_dripstone_water', 'minecraft:falling_dust',
          'minecraft:falling_honey', 'minecraft:falling_lava',
          'minecraft:falling_nectar', 'minecraft:falling_obsidian_tear',
          'minecraft:falling_spore_blossom', 'minecraft:falling_water',
          'minecraft:firework', 'minecraft:fishing',
          'minecraft:flame', 'minecraft:flash',
          'minecraft:happy_villager', 'minecraft:heart',
          'minecraft:instant_effect', 'minecraft:item',
          'minecraft:item_snowball', 'minecraft:landing',
          'minecraft:landing_honey', 'minecraft:landing_lava',
          'minecraft:landing_obsidian_tear', 'minecraft:large_smoke',
          'minecraft:lava', 'minecraft:mycelium',
          'minecraft:nautilus', 'minecraft:note',
          'minecraft:poof', 'minecraft:portal',
          'minecraft:rain', 'minecraft:reverse_portal',
          'minecraft:sculk_charge', 'minecraft:sculk_charge_pop',
          'minecraft:sculk_soul', 'minecraft:shriek',
          'minecraft:small_flame', 'minecraft:small_smoke',
          'minecraft:snowflake', 'minecraft:soul',
          'minecraft:soul_fire_flame', 'minecraft:spit',
          'minecraft:splash', 'minecraft:squid_ink',
          'minecraft:sweep_attack', 'minecraft:totem_of_undying',
          'minecraft:underwater', 'minecraft:warped_spore',
          'minecraft:water_bubble', 'minecraft:wax_off',
          'minecraft:wax_on', 'minecraft:white_ash',
          'minecraft:witch'
        ]
      },
      { type: 'selector' },
      { type: 'freetext', hint: '<x y z>' },
      { type: 'number', hint: '<delta x>' },
      { type: 'number', hint: '<delta y>' },
      { type: 'number', hint: '<delta z>' },
      { type: 'number', hint: '<speed>' },
      { type: 'number', hint: '<count>' }
    ]
  },

  tag: {
    args: [
      { type: 'selector' },
      { type: 'literal', values: ['add', 'remove', 'list'] },
      {
        type: 'freetext',
        dependsOn: { argIndex: 1, matchesAny: ['add', 'remove'] },
        hint: '<tag name>',
        fallback: []
      }
    ]
  },

  team: {
    args: [
      { type: 'literal', values: ['add', 'remove', 'join', 'leave', 'list', 'modify', 'empty'] },
      {
        type: 'freetext',
        dependsOn: { argIndex: 0, matchesAny: ['add', 'remove', 'join', 'leave', 'modify', 'empty'] },
        hint: '<team name>',
        fallback: []
      },
      {
        type: 'selector',
        dependsOn: { argIndex: 0, matchesAny: ['join', 'leave'] },
        fallback: [
          {
            type: 'freetext',
            dependsOn: { argIndex: 0, value: 'add' },
            hint: '<display name>',
            fallback: [
              {
                type: 'literal',
                dependsOn: { argIndex: 0, value: 'modify' },
                values: ['color', 'friendlyFire', 'seeFriendlyInvisibles', 'nametagVisibility', 'deathMessageVisibility', 'collisionRule', 'prefix', 'suffix', 'displayName'],
                fallback: [
                  {
                    type: 'selector',
                    dependsOn: { argIndex: 0, value: 'empty' },
                    fallback: []
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },

  function: {
    args: [
      { type: 'freetext', hint: '<namespace:function_name>' }
    ]
  },

  schedule: {
    args: [
      { type: 'literal', values: ['function', 'clear'] },
      {
        type: 'freetext',
        dependsOn: { argIndex: 0, value: 'function' },
        hint: '<namespace:function_name>',
        fallback: [
          {
            type: 'freetext',
            dependsOn: { argIndex: 0, value: 'clear' },
            hint: '<namespace:function_name>',
            fallback: []
          }
        ]
      },
      {
        type: 'freetext',
        dependsOn: { argIndex: 0, value: 'function' },
        hint: '<time e.g. 5s, 10t, 1d>',
        fallback: []
      },
      {
        type: 'literal',
        dependsOn: { argIndex: 0, value: 'function' },
        values: ['append', 'replace'],
        fallback: []
      }
    ]
  },

  forceload: {
    args: [
      { type: 'literal', values: ['add', 'remove', 'query'] },
      { type: 'freetext', hint: '<x z or chunk coords>' },
      {
        type: 'freetext',
        dependsOn: { argIndex: 0, matchesAny: ['add', 'remove'] },
        hint: '<x2 z2 optional range>',
        fallback: []
      }
    ]
  },

  debug: {
    args: [
      { type: 'literal', values: ['start', 'stop', 'report'] }
    ]
  },

  help: {
    args: [
      { type: 'freetext', hint: '<command or page>', fallback: [] }
    ]
  },

  publish: {
    args: [
      { type: 'number', hint: '<port>', fallback: [] }
    ]
  },

  loot: {
    args: [
      { type: 'literal', values: ['spawn', 'give', 'insert', 'replace', 'fish', 'mine'] },
      {
        type: 'literal',
        dependsOn: { argIndex: 0, value: 'spawn' },
        values: ['target', 'world'],
        fallback: [
          {
            type: 'selector',
            dependsOn: { argIndex: 0, value: 'give' },
            fallback: [
              {
                type: 'literal',
                dependsOn: { argIndex: 0, matchesAny: ['insert', 'replace'] },
                values: ['block', 'entity'],
                fallback: [
                  {
                    type: 'freetext',
                    dependsOn: { argIndex: 0, value: 'fish' },
                    hint: '<x y z>',
                    fallback: []
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },

  item: {
    args: [
      { type: 'literal', values: ['replace', 'modify'] },
      {
        type: 'literal',
        dependsOn: { argIndex: 0, value: 'replace' },
        values: ['block', 'entity'],
        fallback: [
          {
            type: 'literal',
            dependsOn: { argIndex: 0, value: 'modify' },
            values: ['block', 'entity'],
            fallback: []
          }
        ]
      },
      { type: 'freetext', hint: '<target or selector>' },
      {
        type: 'literal',
        values: ['weapon', 'weapon.offhand', 'armor.head', 'armor.chest', 'armor.legs', 'armor.feet', 'container.0', 'container.1', 'container.2', 'container.3', 'container.4', 'container.5', 'container.6', 'container.7', 'container.8', 'hotbar.0', 'hotbar.1', 'hotbar.2', 'hotbar.3', 'hotbar.4', 'hotbar.5', 'hotbar.6', 'hotbar.7', 'hotbar.8', 'inventory.0', 'inventory.1', 'inventory.2', 'inventory.3', 'inventory.4', 'inventory.5', 'inventory.6', 'inventory.7', 'inventory.8', 'horse.saddle', 'horse.armor', 'horse.chest', 'vehicle.modes']
      },
      {
        type: 'literal',
        dependsOn: { argIndex: 0, value: 'replace' },
        values: ['with', 'from'],
        fallback: []
      }
    ]
  },

  damage: {
    args: [
      { type: 'selector' },
      { type: 'number', hint: '<amount>' },
      {
        type: 'literal',
        values: [
          'minecraft:arrow', 'minecraft:cactus', 'minecraft:cramming',
          'minecraft:dragon_breath', 'minecraft:dry_out', 'minecraft:drown',
          'minecraft:explosion', 'minecraft:fall', 'minecraft:falling_anvil',
          'minecraft:falling_block', 'minecraft:falling_stalactite',
          'minecraft:fireworks', 'minecraft:fly_into_wall',
          'minecraft:freeze', 'minecraft:generic', 'minecraft:hot_floor',
          'minecraft:in_fire', 'minecraft:in_wall', 'minecraft:indirect_magic',
          'minecraft:lava', 'minecraft:lightning_bolt', 'minecraft:magic',
          'minecraft:mob_attack', 'minecraft:mob_attack_no_aggro',
          'minecraft:on_fire', 'minecraft:out_of_world', 'minecraft:override',
          'minecraft:piercing', 'minecraft:player_attack',
          'minecraft:player_explosion', 'minecraft:projectile',
          'minecraft:sonic_boom', 'minecraft:spit', 'minecraft:starve',
          'minecraft:sting', 'minecraft:sweet_berry_bush', 'minecraft:thorns',
          'minecraft:thrown', 'minecraft:trident', 'minecraft:wither',
          'minecraft:wither_skull', 'minecraft:zone'
        ]
      },
      {
        type: 'selector',
        hint: '<attacker>',
        fallback: []
      }
    ]
  },

  ride: {
    args: [
      { type: 'selector' },
      { type: 'literal', values: ['mount', 'dismount'] },
      {
        type: 'selector',
        dependsOn: { argIndex: 1, value: 'mount' },
        fallback: []
      }
    ]
  },

  random: {
    args: [
      { type: 'literal', values: ['range', 'roll', 'reset'] },
      {
        type: 'freetext',
        dependsOn: { argIndex: 0, matchesAny: ['range', 'roll'] },
        hint: '<sequence>',
        fallback: [
          {
            type: 'freetext',
            dependsOn: { argIndex: 0, value: 'reset' },
            hint: '<sequence>',
            fallback: []
          }
        ]
      },
      {
        type: 'number',
        dependsOn: { argIndex: 0, matchesAny: ['range', 'roll'] },
        hint: '<min>',
        fallback: []
      },
      {
        type: 'number',
        dependsOn: { argIndex: 0, matchesAny: ['range', 'roll'] },
        hint: '<max>',
        fallback: []
      }
    ]
  },

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