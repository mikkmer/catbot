const mineflayer = require('mineflayer')
const pvp = require('mineflayer-pvp').plugin
const { pathfinder, Movements, goals} = require('mineflayer-pathfinder')
const armorManager = require('mineflayer-armor-manager')
const mineflayerViewer = require('prismarine-viewer').mineflayer
const repl = require('repl')
const { GoalNear, GoalBlock, GoalXZ, GoalY, GoalInvert, GoalFollow } = require('mineflayer-pathfinder').goals
// login to server \\
if (process.argv.length < 4 || process.argv.length > 6) {
  console.log("Usage: node index.js <host> <port> [username] [password]")
  return
}
const bot = mineflayer.createBot({
  host: process.argv[2],
  port: process.argv[3],
  username: process.argv[4] || 'pvp_Bot',
  password: process.argv[5],
})
// load the plugins \\
bot.loadPlugin(pvp)
bot.loadPlugin(armorManager)
bot.loadPlugin(pathfinder)
// open the viewer \\
bot.once('spawn', () => {
  mineflayerViewer(bot, { port: 3007, firstPerson: true })
})
// once login start console to chat
bot.on('login', () => {
  const r = repl.start('> ')
  r.context.bot = bot

  r.on('exit', () => {
    bot.end()
  })
})

bot.on('playerCollect', (collector, itemDrop) => {
  if (collector !== bot.entity) return

  setTimeout(() => {
    const sword = bot.inventory.items().find(item => item.name.includes('sword'))
    if (sword) bot.equip(sword, 'hand')
  }, 150)
})

bot.on('playerCollect', (collector, itemDrop) => {
  if (collector !== bot.entity) return

  setTimeout(() => {
    const shield = bot.inventory.items().find(item => item.name.includes('shield'))
    if (shield) bot.equip(shield, 'off-hand')
  }, 250)
})

let guardPos = null

function guardArea (pos) {
  guardPos = pos.clone()

  if (!bot.pvp.target) {
    moveToGuardPos()
  }
}

function stopGuarding () {
  guardPos = null
  bot.pvp.stop()
  bot.pathfinder.setGoal(null)
}

function moveToGuardPos () {
  const mcData = require('minecraft-data')(bot.version)
  bot.pathfinder.setMovements(new Movements(bot, mcData))
  bot.pathfinder.setGoal(new goals.GoalBlock(guardPos.x, guardPos.y, guardPos.z))
}

bot.on('stoppedAttacking', () => {
  if (guardPos) {
    moveToGuardPos()
  }
})

bot.on('physicTick', () => {
  if (bot.pvp.target) return
  if (bot.pathfinder.isMoving()) return

  const entity = bot.nearestEntity()
  if (entity) bot.lookAt(entity.position.offset(0, entity.height, 0))
})

bot.on('physicTick', () => {
  if (!guardPos) return

  const filter = e => e.type === 'mob' && e.position.distanceTo(bot.entity.position) < 16 &&
                      e.mobType !== 'Armor Stand' // Mojang classifies armor stands as mobs for some reason?

  const entity = bot.nearestEntity(filter)
  if (entity) {
    bot.pvp.attack(entity)
  }
})

bot.on('chat', (username, message) => {
  if (message === 'guard') {
    const player = bot.players[username]

    if (!player) {
      bot.chat("I can't see you.")
      return
    }

    bot.chat('I will guard that location.')
    guardArea(player.entity.position)
  }

  if (message === 'fight me') {
    const player = bot.players[username]

    if (!player) {
      bot.chat("I can't see you.")
      return
    }

    bot.chat('Prepare to fight!')
    bot.pvp.attack(player.entity)
  }

  if (message === 'stop') {
    bot.chat('I will no longer guard this area.')
    stopGuarding()
  }
})
bot.once('spawn', () => {
  // Once we've spawn, it is safe to access mcData because we know the version
  const mcData = require('minecraft-data')(bot.version)

  // We create different movement generators for different type of activity
  const defaultMove = new Movements(bot, mcData)

  bot.on('path_update', (r) => {
    const nodesPerTick = (r.visitedNodes * 50 / r.time).toFixed(2)
    console.log(`I can get there in ${r.path.length} moves. Computation took ${r.time.toFixed(2)} ms (${r.visitedNodes} nodes, ${nodesPerTick} nodes/tick)`)
  })

  bot.on('goal_reached', (goal) => {
    console.log('Here I am !')
  })

  bot.on('chat', (username, message) => {
    if (username === bot.username) return

    const target = bot.players[username] ? bot.players[username].entity : null
    if (message === 'come') {
      if (!target) {
        bot.chat('I don\'t see you !')
        return
      }
      const p = target.position

      bot.pathfinder.setMovements(defaultMove)
      bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 1))
    } else if (message.startsWith('goto')) {
      const cmd = message.split(' ')

      if (cmd.length === 4) { // goto x y z
        const x = parseInt(cmd[1], 10)
        const y = parseInt(cmd[2], 10)
        const z = parseInt(cmd[3], 10)

        bot.pathfinder.setMovements(defaultMove)
        bot.pathfinder.setGoal(new GoalBlock(x, y, z))
      } else if (cmd.length === 3) { // goto x z
        const x = parseInt(cmd[1], 10)
        const z = parseInt(cmd[2], 10)

        bot.pathfinder.setMovements(defaultMove)
        bot.pathfinder.setGoal(new GoalXZ(x, z))
      } else if (cmd.length === 2) { // goto y
        const y = parseInt(cmd[1], 10)

        bot.pathfinder.setMovements(defaultMove)
        bot.pathfinder.setGoal(new GoalY(y))
      }
    } else if (message === 'follow') {
      bot.pathfinder.setMovements(defaultMove)
      bot.pathfinder.setGoal(new GoalFollow(target, 3), true)
      // follow is a dynamic goal: setGoal(goal, dynamic=true)
      // when reached, the goal will stay active and will not
      // emit an event
    } else if (message === 'avoid') {
      bot.pathfinder.setMovements(defaultMove)
      bot.pathfinder.setGoal(new GoalInvert(new GoalFollow(target, 5)), true)
    } else if (message === 'stud') {
      bot.pathfinder.setGoal(null)
    } else if (message === 'leave') { 
       bot.chat('You asked me to') 
        bot.quit('You asked me to')
      }
  })
})

bot.on('login', () => {
  const r = repl.start('> ')
  r.context.bot = bot

  r.on('exit', () => {
    bot.end()
  })
})

const Vec3 = require('vec3').Vec3

bot.on('chat', (username, message) => {
  if (username === bot.username) return
  const result = /canSee (-?[0-9]+),(-?[0-9]+),(-?[0-9]+)/.exec(message)
  if (result) {
    canSee(new Vec3(result[1], result[2], result[3]))
    return
  }

  function canSee (pos) {
    const block = bot.blockAt(pos)
    const r = bot.canSeeBlock(block)
    if (r) {
      bot.chat(`I can see the block of ${block.displayName} at ${pos}`)
    } else {
      bot.chat(`I cannot see the block of ${block.displayName} at ${pos}`)
    }
  }

  function sayPosition (username) {
    bot.chat(`I am at ${bot.entity.position}`)
    bot.chat(`You are at ${bot.players[username].entity.position}`)
  }

  function sayEquipment () {
    const eq = bot.players[username].entity.equipment
    const eqText = []
    if (eq[0]) eqText.push(`holding a ${eq[0].displayName}`)
    if (eq[1]) eqText.push(`wearing a ${eq[1].displayName} on your feet`)
    if (eq[2]) eqText.push(`wearing a ${eq[2].displayName} on your legs`)
    if (eq[3]) eqText.push(`wearing a ${eq[3].displayName} on your torso`)
    if (eq[4]) eqText.push(`wearing a ${eq[4].displayName} on your head`)
    if (eqText.length) {
      bot.chat(`You are ${eqText.join(', ')}.`)
    } else {
      bot.chat('You are naked!')
    }
  }

  function saySpawnPoint () {
    bot.chat(`Spawn is at ${bot.spawnPoint}`)
  }

  function sayBlockUnder () {
    const block = bot.blockAt(bot.players[username].entity.position.offset(0, -1, 0))
    bot.chat(`Block under you is ${block.displayName} in the ${block.biome.name} biome`)
    console.log(block)
  }

  function quit (username) {
    bot.quit(`${username} told me to`)
  }

  function sayNick () {
    bot.chat(`My name is ${bot.player.displayName}`)
  }
})

bot.on('whisper', (username, message, rawMessage) => {
  console.log(`I received a message from ${username}: ${message}`)
  bot.whisper(username, 'I can tell secrets too.')
})
bot.on('nonSpokenChat', (message) => {
  console.log(`Non spoken chat: ${message}`)
})

bot.on('login', () => {
  bot.chat('Hi everyone!')
})
bot.on('spawn', () => {
  bot.chat('I spawned, watch out!')
})
bot.on('spawnReset', (message) => {
  bot.chat('Oh noez! My bed is broken.')
})  
bot.on('death', () => {
  bot.chat('I died x.x')
})
bot.on('kicked', (reason) => {
  console.log(`I got kicked for ${reason}`)
})
bot.on('rain', () => {
  if (bot.isRaining) {
    bot.chat('It started raining.')
  } else {
    bot.chat('It stopped raining.')
  }
})
bot.on('noteHeard', (block, instrument, pitch) => {
  bot.chat(`Music for my ears! I just heard a ${instrument.name}`)
})
bot.on('chestLidMove', (block, isOpen) => {
  const action = isOpen ? 'open' : 'close'
  bot.chat(`Hey, did someone just ${action} a chest?`)
})
bot.on('pistonMove', (block, isPulling, direction) => {
  const action = isPulling ? 'pulling' : 'pushing'
  bot.chat(`A piston is ${action} near me, i can hear it.`)
})

bot.on('playerJoined', (player) => {
  if (player.username !== bot.username) {
    bot.chat(`Hello, ${player.username}! Welcome to the server.`)
  }
})
bot.on('playerLeft', (player) => {
  if (player.username === bot.username) return
  bot.chat(`Bye ${player.username}`)
})
bot.on('entitySpawn', (entity) => {
   if (entity.type === 'object') {
  } else if (entity.type === 'global') {
    bot.chat('Ooh lightning!')
  } else if (entity.type === 'orb') {
    bot.chat('Gimme dat exp orb!')
  }
})


bot.on('entitySleep', (entity) => {
  bot.chat(`Good night, ${entity.username}`)
})
bot.on('entityWake', (entity) => {
  bot.chat(`Top of the morning, ${entity.username}`)
})
bot.on('entityEat', (entity) => {
  bot.chat(`${entity.username}: OM NOM NOM NOMONOM. That's what you sound like.`)
})
bot.on('entityAttach', (entity, vehicle) => {
  if (entity.type === 'player' && vehicle.type === 'object') {
    bot.chat(`Sweet, ${entity.username} is riding that ${vehicle.objectType}`)
  }
})
bot.on('entityDetach', (entity, vehicle) => {
  if (entity.type === 'player' && vehicle.type === 'object') {
    bot.chat(`Lame, ${entity.username} stopped riding the ${vehicle.objectType}`)
  }
})
bot.on('entityEquipmentChange', (entity) => {
  console.log('entityEquipmentChange', entity)
})
bot.on('entityEffect', (entity, effect) => {
  console.log('entityEffect', entity, effect)
})
bot.on('entityEffectEnd', (entity, effect) => {
  console.log('entityEffectEnd', entity, effect)
})