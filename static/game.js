// 游戏配置
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 设置画布大小为窗口大小
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Socket连接
const socket = io();

// 游戏状态
let gameState = {
    players: {},
    bullets: [],
    enemies: [],
    beams: {},  // 光束系统
    q_skills: {},  // 公主蓉Q技能光环
    lock_skills: {},  // 公主蓉右键锁定技能
    big_apples: {},  // 幺幺俊羊羊巨大苹果
    explosions: {},  // 爆炸特效
    soul_balls: {},  // 王子栗E技能灵魂球
    shatter_effects: {},  // 王子栗Q技能碎裂特效
    white_overlay: null,  // 王子栗Q技能白光笼罩
    divine_mode: null,  // 王子栗Q技能神人模式
    myPlayerId: null,
    gameRunning: true,  // 必须为true才能运行游戏循环
    countdown: 3,
    isDead: false,
    gameResult: null  // 'victory' or 'defeat'
};

console.log('⚙️ 游戏状态初始化:', gameState);

// 角色属性配置（默认值，实际使用用户数据）
const CHARACTER_STATS = {
    '勇者': {
        attack: 53,      // 攻击力（默认值，实际从用户数据加载）
        critRate: 0.20,  // 暴击率 20%
        critDamage: 1.0,  // 暴击伤害 100%
        reloadReduction: 0.2,  // 换弹减免 0.2秒
        rapidFire: 0.0,  // 快速射击 0秒
        extraAmmo: 0.0,  // 额外弹容 0%
        attributePower: 100,  // 属性强度 100
        hp: 1000  // 生命值
    },
    '星耀犊': {
        attack: 0,
        critRate: 0.30,  // 暴击率 30%
        critDamage: 1.5,  // 暴击伤害 150%
        reloadReduction: 0.0,
        rapidFire: 0.0,
        extraAmmo: 0.0,
        attributePower: 0,
        hp: 1500  // 生命值1500
    },
    '公主蓉': {
        attack: 32,
        critRate: 0.0,  // 暴击率 0%（被动会根据治疗加成增加）
        critDamage: 1.0,  // 暴击伤害 100%
        reloadReduction: 0.0,
        rapidFire: 0.0,
        extraAmmo: 0.0,
        attributePower: 0,
        hp: 2000,  // 生命值2000
        healingBonus: 0.20,  // 治疗加成20%
        damageBonus: 0.20  // 伤害加成20%
    },
    '幺幺俊羊羊': {
        attack: 48,
        critRate: 0.15,  // 暴击率 15%
        critDamage: 1.0,  // 暴击伤害 100%
        reloadReduction: 0.0,
        rapidFire: 0.0,
        extraAmmo: 0.0,
        attributePower: 100,  // 属性强度 100
        hp: 1200,  // 生命值1200
        damageBonus: 0.20  // 伤害加成20%
    },
    '王子栗': {
        attack: 49,
        critRate: 0.50,  // 暴击率 50%
        critDamage: 1.0,  // 暴击伤害 100%
        reloadReduction: 0.0,
        rapidFire: 0.0,
        extraAmmo: 0.0,
        attributePower: 0,  // 属性强度 0（被动会转换属性）
        hp: 1000  // 生命值1000
    }
};

// 本地玩家状态
let localPlayer = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    hp: 1000,
    maxHp: 1000,
    angle: 0,
    speed: 5,
    size: 50,  // 图片是100x100，半径50
    color: '#00ff00',
    name: PLAYER_NAME,
    avatar: PLAYER_AVATAR,
    weapon: null,
    stats: null,  // 角色属性，将在初始化时设置
    skills: {
        Q: { active: false, cooldown: 0, cooldownTime: 0, charge: 0, maxCharge: 100, lastChargeTime: 0 },
        E: { active: false, cooldown: 0, cooldownTime: 8, activeTime: 0, activeDuration: 10, showingShadow: false, shadowX: 0, shadowY: 0 },
        rightClick: { active: false, cooldown: 0, cooldownTime: 0, rapidFireQueue: [], lastSpikeTime: 0, spikeCount: 0, selectingPlayer: false, playerList: [] }  // 星耀犊尖刺发射时间和计数，幺幺俊羊羊选择玩家状态
    }
};

// 输入状态
let keys = {};
let mousePos = { x: 0, y: 0 };
let isShooting = false;
let isReloading = false;
let isRightClickHeld = false;  // 右键是否按住

// 星耀犊锁定系统
let lockedPlayerId = null;  // 当前锁定的玩家ID
let lockedPlayer = null;  // 当前锁定的玩家对象

// 星耀犊蓄力系统
let isCharging = false;  // 是否正在蓄力
let chargeStartTime = 0;  // 蓄力开始时间
let chargeTime = 0;  // 当前蓄力时间
let chargedBullet = null;  // 蓄力完成的子弹（等待发射）

// 角色武器配置
const WEAPONS = {
    '勇者': {
        name: '左轮枪',
        fireRate: 0.7,  // 射击间隔（秒）
        bulletSpeed: 4000,  // 加快100倍 (30 * 100)
        bulletSize: 10,
        damage: 500,  // 伤害改为500
        maxAmmo: 6,
        reloadTime: 1.2  // 换弹时间（秒）- 与技能描述一致
    },
    '星耀犊': {
        name: '音符',
        fireRate: 1.0,  // 射击间隔1秒
        bulletSpeed: 3500,  // 加快100倍 (35 * 100)
        bulletSize: 45,
        damage: 0,  // 音符不造成伤害
        maxAmmo: 20,
        reloadTime: 2.0,  // 换弹时间2秒
        bulletImage: '音符.png',  // 子弹图标
        isHealing: true,  // 这是治疗子弹
        canCharge: true,  // 可以蓄力
        maxChargeTime: 2.0,  // 最大蓄力时间2秒
        chargeHealingBonus: 40  // 每秒蓄力增加40点治疗量
    },
    '公主蓉': {
        name: '四连发射击',
        fireRate: 1.0,  // 四连发的间隔1秒
        bulletSpeed: 4200,  // 加快100倍 (42 * 100)
        bulletSize: 12,
        damage: 50,  // 基础伤害50，实际伤害为50+生命值上限的5%
        maxAmmo: 60,
        reloadTime: 2.1,  // 换弹时间2.1秒
        bulletImage: null,  // 粉红色子弹（使用默认绘制）
        isQuadShot: true,  // 标记为四连射
        quadShotCount: 4,  // 四连发数量
        quadShotInterval: 0.1,  // 四连发间隔0.1秒
        canHealTeammates: true,  // 可以治疗队友
        healingAmount: 20  // 基础治疗20，实际治疗为20+生命值上限的1%
    },
    '幺幺俊羊羊': {
        name: '苹果子弹',
        fireRate: 1.5,  // 射击间隔1.5秒
        bulletSpeed: 3300,  // 加快100倍 (33 * 100)
        bulletSize: 25,
        damage: 800,  // 基础伤害800，实际伤害为800+攻击力
        maxAmmo: 15,
        reloadTime: 1.78,  // 换弹时间1.78秒
        bulletImage: '苹果.png',  // 苹果图标
        canHealTeammates: true,  // 可以治疗队友
        healingAmount: 40,  // 基础治疗40，实际治疗为40+攻击力
        canKnockback: true  // 可以击退敌人
    },
    '王子栗': {
        name: '火炮弹',
        fireRate: 1.5,  // 射击间隔1.5秒
        bulletSpeed: 5500,  // 速度55 * 100
        bulletSize: 30,
        damage: 200,  // 命中伤害200+攻击力，爆炸伤害1000+攻击力
        maxAmmo: 6,
        reloadTime: 2.5,  // 换弹时间2.5秒
        bulletImage: null,  // 红色子弹（使用默认绘制，但需要标记为火炮弹）
        isCannonball: true,  // 标记为火炮弹
        explosionRadius: 180,  // 爆炸半径180像素（缩小40%：300*0.6=180）
        explosionDamage: 500,  // 爆炸基础伤害500+攻击力
        bulletColor: '#ff0000'  // 红色弹丸
    }
};

// 根据角色设置武器
function setupWeapon(character) {
    // 优先使用用户角色数据，否则使用默认配置
    let userStats = null;
    if (typeof USER_CHARACTER_DATA !== 'undefined' && USER_CHARACTER_DATA !== null && USER_CHARACTER_DATA && USER_CHARACTER_DATA.stats) {
        // 使用用户角色数据
        userStats = { ...USER_CHARACTER_DATA.stats };
        
        // 确保伤害加成和治疗加成有默认值（如果用户数据中没有）
        if (userStats.damageBonus === undefined) {
            // 从默认配置中获取
            const defaultStats = CHARACTER_STATS[character];
            userStats.damageBonus = (defaultStats && defaultStats.damageBonus) || 0.0;
        }
        if (userStats.healingBonus === undefined) {
            // 从默认配置中获取
            const defaultStats = CHARACTER_STATS[character];
            userStats.healingBonus = (defaultStats && defaultStats.healingBonus) || 0.0;
        }
    } else if (CHARACTER_STATS[character]) {
        // 如果没有用户数据，使用默认配置
        userStats = { ...CHARACTER_STATS[character] };
        // 确保所有属性都有值
        if (userStats.critDamage === undefined) userStats.critDamage = 1.0;
        if (userStats.reloadReduction === undefined) userStats.reloadReduction = 0.0;
        if (userStats.rapidFire === undefined) userStats.rapidFire = 0.0;
        if (userStats.extraAmmo === undefined) userStats.extraAmmo = 0.0;
        if (userStats.damageBonus === undefined) userStats.damageBonus = 0.0;
        if (userStats.healingBonus === undefined) userStats.healingBonus = 0.0;
    } else {
        // 完全默认值
        userStats = { 
            attack: 0, 
            critRate: 0, 
            critDamage: 1.0,
            reloadReduction: 0.0,
            rapidFire: 0.0,
            extraAmmo: 0.0,
            attributePower: 0,
            damageBonus: 0.0,
            healingBonus: 0.0
        };
    }
    
    localPlayer.stats = userStats;
    
    // 设置生命值上限
    if (userStats.hp !== undefined) {
        localPlayer.maxHp = userStats.hp;
        localPlayer.hp = userStats.hp;  // 同时设置当前生命值
    }
    
    const weaponConfig = WEAPONS[character] || WEAPONS['勇者'];
    
    // 计算实际弹容：初始弹容 * (1 + 额外弹容) 向上取整
    const baseMaxAmmo = weaponConfig.maxAmmo;
    const extraAmmoMultiplier = localPlayer.stats.extraAmmo || 0;
    const actualMaxAmmo = Math.ceil(baseMaxAmmo * (1 + extraAmmoMultiplier));
    
    // 计算实际射击间隔：初始间隔 - 快速射击（最小0.1秒）
    const baseFireRate = weaponConfig.fireRate;
    const rapidFire = localPlayer.stats.rapidFire || 0;
    const actualFireRate = Math.max(0.1, baseFireRate - rapidFire);
    
    // 计算实际换弹时间：初始换弹时间 - 换弹减免（最小0.1秒）
    const baseReloadTime = weaponConfig.reloadTime;
    const reloadReduction = localPlayer.stats.reloadReduction || 0;
    const actualReloadTime = Math.max(0.1, baseReloadTime - reloadReduction);
    
    localPlayer.weapon = {
        ...weaponConfig,
        fireRate: actualFireRate,  // 使用计算后的射击间隔
        reloadTime: actualReloadTime,  // 使用计算后的换弹时间
        maxAmmo: actualMaxAmmo,
        currentAmmo: actualMaxAmmo,
        lastFireTime: 0,
        reloadStartTime: 0
    };
    console.log('武器设置完成:', localPlayer.weapon);
    console.log('基础弹容:', baseMaxAmmo, '实际弹容:', actualMaxAmmo);
    console.log('基础射击间隔:', baseFireRate, '实际射击间隔:', actualFireRate);
    console.log('基础换弹时间:', baseReloadTime, '实际换弹时间:', actualReloadTime);
    updateAmmoDisplay();
}

// 背景图片
let backgroundImage = new Image();
backgroundImage.src = `/static/maps/${MAP_NAME}.png`;
backgroundImage.onload = function() {
    console.log(`✓ 地图背景图片 ${MAP_NAME}.png 加载成功`);
};
backgroundImage.onerror = function() {
    console.warn(`⚠️ 地图图片 ${MAP_NAME}.png 加载失败，使用默认背景`);
    console.warn(`请确保文件存在: static/maps/${MAP_NAME}.png`);
};

// 角色图片缓存
let characterImages = {};

// 加载角色图片
function loadCharacterImage(character, color) {
    const key = `${character}${color}`;
    if (!characterImages[key]) {
        const img = new Image();
        img.src = `/static/${character}${color}.png`;
        img.onload = function() {
            console.log(`✓ 角色图片 ${character}${color}.png 加载成功 (${img.width}x${img.height})`);
        };
        img.onerror = function() {
            console.warn(`⚠️ 角色图片 ${character}${color}.png 加载失败`);
            console.warn(`请确保文件存在: static/${character}${color}.png`);
        };
        characterImages[key] = img;
    }
    return characterImages[key];
}

// 敌人图片缓存
let enemyImages = {};

// 加载敌人图片
function loadEnemyImage(enemyType) {
    if (!enemyImages[enemyType]) {
        const img = new Image();
        img.src = `/static/${enemyType}.png`;
        img.onload = function() {
            console.log(`✓ 敌人图片 ${enemyType}.png 加载成功 (${img.width}x${img.height})`);
        };
        img.onerror = function() {
            console.warn(`⚠️ 敌人图片 ${enemyType}.png 加载失败`);
            console.warn(`请确保文件存在: static/${enemyType}.png`);
        };
        enemyImages[enemyType] = img;
    }
    return enemyImages[enemyType];
}

// 初始化
function init() {
    console.log('游戏初始化...');
    console.log('房间:', ROOM_KEY);
    console.log('玩家:', PLAYER_NAME);
    console.log('角色:', PLAYER_AVATAR);
    console.log('地图:', MAP_NAME);
    console.log('怪物:', MONSTER_TYPE);
    // 设置武器（会使用用户角色数据）
    setupWeapon(PLAYER_AVATAR.character);
    
    // 预加载角色图片
    console.log('预加载角色图片:', `${PLAYER_AVATAR.character}${PLAYER_AVATAR.color}`);
    loadCharacterImage(PLAYER_AVATAR.character, PLAYER_AVATAR.color);
    
    // 设置玩家头像
    const playerAvatar = document.getElementById('playerAvatar');
    if (playerAvatar) {
        playerAvatar.src = `/static/${PLAYER_AVATAR.character}${PLAYER_AVATAR.color}.png`;
        playerAvatar.onerror = function() {
            console.warn('玩家头像加载失败');
        };
    }
    
    // 初始化准星位置
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        crosshair.style.left = '50%';
        crosshair.style.top = '50%';
        console.log('准星元素已初始化');
    } else {
        console.error('未找到准星元素！');
    }
    
    // 连接Socket
    socket.emit('join_game', {
        room_key: ROOM_KEY,
        player_name: PLAYER_NAME,
        avatar: PLAYER_AVATAR,
        x: localPlayer.x,
        y: localPlayer.y,
        hp: localPlayer.hp
    });
}

// Socket事件监听
socket.on('connect', () => {
    console.log('Socket连接成功');
});

socket.on('game_state', (data) => {
    console.log('收到游戏状态:', data);
    
    // ⚠️ 重要：保留gameRunning状态，不要被服务器覆盖
    const wasRunning = gameState.gameRunning;
    const wasDead = gameState.isDead;
    const wasResult = gameState.gameResult;
    
    // 如果服务器发送了完整的游戏状态，直接替换（新游戏开始）
    if (data.players !== undefined) {
        gameState.players = data.players;
        
        // 同步本地玩家的生命值上限（从服务器数据）
        const myPlayerId = data.myPlayerId || socket.id;
        if (gameState.players[myPlayerId]) {
            const serverPlayer = gameState.players[myPlayerId];
            if (serverPlayer.maxHp !== undefined) {
                localPlayer.maxHp = serverPlayer.maxHp;
                if (serverPlayer.hp !== undefined) {
                    localPlayer.hp = serverPlayer.hp;  // 同步当前生命值
                } else {
                    // 如果服务器没有发送hp，使用maxHp（满血）
                    localPlayer.hp = localPlayer.maxHp;
                }
                // 确保不超过上限
                if (localPlayer.hp > localPlayer.maxHp) {
                    localPlayer.hp = localPlayer.maxHp;
                }
                console.log('✓ 同步生命值:', { maxHp: localPlayer.maxHp, hp: localPlayer.hp });
                // 立即更新UI显示
                updateHealthBar();
            }
        }
    }
    if (data.bullets !== undefined) {
        gameState.bullets = data.bullets;
    }
    if (data.enemies !== undefined) {
        gameState.enemies = data.enemies;
    }
    if (data.beams !== undefined) {
        gameState.beams = data.beams;
    }
    if (data.countdown !== undefined) {
        gameState.countdown = data.countdown;
    }
    gameState.gameRunning = wasRunning;  // 恢复运行状态
    gameState.isDead = wasDead;  // 保留死亡状态
    gameState.gameResult = wasResult;  // 保留结果状态
    
    if (data.myPlayerId) {
        gameState.myPlayerId = data.myPlayerId;
    } else if (!gameState.myPlayerId) {
        gameState.myPlayerId = socket.id;
    }
    
    console.log('⚙️ 游戏状态已更新，gameRunning:', gameState.gameRunning);
    
    // 预加载所有玩家的角色图片
    for (let playerId in gameState.players) {
        const player = gameState.players[playerId];
        if (player.avatar && player.avatar.character && player.avatar.color) {
            console.log('预加载玩家角色图片:', player.name, `${player.avatar.character}${player.avatar.color}`);
            loadCharacterImage(player.avatar.character, player.avatar.color);
        }
    }
    
    // 预加载敌人图片
    for (let enemy of gameState.enemies) {
        if (enemy.type) {
            loadEnemyImage(enemy.type);
        }
    }
    
    updateCountdownDisplay();
    updatePlayerList();
});

socket.on('player_joined', (data) => {
    console.log('玩家加入:', data);
    gameState.players[data.id] = data;
    
    // 预加载新玩家的角色图片
    if (data.avatar && data.avatar.character && data.avatar.color) {
        console.log('预加载新玩家角色图片:', `${data.avatar.character}${data.avatar.color}`);
        loadCharacterImage(data.avatar.character, data.avatar.color);
    }
    
    updatePlayerList();
});

socket.on('player_moved', (data) => {
    if (gameState.players[data.id]) {
        gameState.players[data.id].x = data.x;
        gameState.players[data.id].y = data.y;
        gameState.players[data.id].angle = data.angle;
        
        // 如果移动的玩家是被锁定的玩家，更新锁定对象
        if (PLAYER_AVATAR.character === '星耀犊' && lockedPlayerId === data.id) {
            lockedPlayer = gameState.players[data.id];
        }
    }
});

socket.on('player_shot', (data) => {
    console.log('收到子弹事件:', data);
    // 添加子弹到游戏中
    if (data.bullet) {
        gameState.bullets.push(data.bullet);
        console.log('子弹已添加到gameState，当前子弹数:', gameState.bullets.length);
    }
});

socket.on('player_hit', (data) => {
    if (data.playerId === socket.id) {
        localPlayer.hp = data.hp;
        localPlayer.hit_flash_end = Date.now() / 1000 + 1.0;  // 1秒闪烁
        // 如果是暴击，添加抖动效果
        if (data.isCrit) {
            localPlayer.crit_shake_end = Date.now() / 1000 + 1.0;  // 1秒抖动
        }
        updateHealthBar();
        
        // 显示伤害数字
        if (data.damage) {
            showDamageNumber(localPlayer.x, localPlayer.y, data.damage, data.isCrit || false, data.attribute);
        }
        
        if (localPlayer.hp <= 0) {
            localPlayer.hp = 0;
            gameState.isDead = true;
            showDeathScreen();
        }
    }
    if (gameState.players[data.playerId]) {
        gameState.players[data.playerId].hp = data.hp;
        gameState.players[data.playerId].hit_flash_end = Date.now() / 1000 + 1.0;
        // 如果是暴击，添加抖动效果
        if (data.isCrit) {
            gameState.players[data.playerId].crit_shake_end = Date.now() / 1000 + 1.0;  // 1秒抖动
        }
        updatePlayerList();
        
        // 显示伤害数字
        if (data.damage) {
            const player = gameState.players[data.playerId];
            showDamageNumber(player.x, player.y, data.damage, data.isCrit || false, data.attribute);
        }
    }
});

// 玩家治疗事件
socket.on('player_healed', (data) => {
    if (data.playerId === socket.id) {
        localPlayer.hp = data.hp;
        localPlayer.hit_flash_end = Date.now() / 1000 + 1.0;  // 1秒闪烁
        // 如果是暴击治疗，添加抖动效果
        if (data.isCrit) {
            localPlayer.crit_shake_end = Date.now() / 1000 + 1.0;  // 1秒抖动
        }
        updateHealthBar();
        
        // 显示治疗数字（黄色）
        showHealingNumber(data.x, data.y, data.healing, data.isCrit || false);
    }
    if (gameState.players[data.playerId]) {
        gameState.players[data.playerId].hp = data.hp;
        gameState.players[data.playerId].hit_flash_end = Date.now() / 1000 + 1.0;
        // 如果是暴击治疗，添加抖动效果
        if (data.isCrit) {
            gameState.players[data.playerId].crit_shake_end = Date.now() / 1000 + 1.0;  // 1秒抖动
        }
        updatePlayerList();
        
        // 显示治疗数字（黄色）
        showHealingNumber(data.x, data.y, data.healing, data.isCrit || false);
    }
});

// 敌人受击事件
socket.on('enemy_hit', (data) => {
    // 找到对应的敌人并设置受击状态
    const enemy = gameState.enemies.find(e => e.id === data.enemyId);
    if (enemy) {
        enemy.hit_flash_end = Date.now() / 1000 + 1.0;  // 1秒闪烁
        // 如果是暴击，添加抖动效果
        if (data.isCrit) {
            enemy.crit_shake_end = Date.now() / 1000 + 1.0;  // 1秒抖动
        }
    }
    
    // 显示伤害数字
    if (data.damage) {
        showDamageNumber(data.x, data.y, data.damage, data.isCrit || false, data.attribute);
    }
});

// Q技能充能事件
socket.on('q_skill_charge', (data) => {
    if (data.playerId === socket.id) {
        const skill = localPlayer.skills.Q;
        skill.charge = Math.min(skill.maxCharge, skill.charge + (data.charge || 0));
        console.log(`Q技能充能: ${skill.charge}%`);
    }
});

// 灵魂球生成事件（王子栗E技能）
socket.on('soul_ball_spawned', (data) => {
    if (!gameState.soul_balls) {
        gameState.soul_balls = {};
    }
    gameState.soul_balls[data.soulBallId] = {
        id: data.soulBallId,
        x: data.x,
        y: data.y,
        deadPlayerId: data.deadPlayerId,
        deadPlayerName: data.deadPlayerName,
        spawnTime: Date.now() / 1000
    };
    console.log(`💛 灵魂球生成: ${data.deadPlayerName}`);
    
    // 如果是王子栗，更新E技能按钮状态
    if (PLAYER_AVATAR.character === '王子栗') {
        updateSkillButtons();
    }
});

// 玩家复活事件
socket.on('player_revived', (data) => {
    const playerId = data.playerId;
    const soulBallId = data.soulBallId;
    
    // 移除灵魂球
    if (gameState.soul_balls && gameState.soul_balls[soulBallId]) {
        delete gameState.soul_balls[soulBallId];
    }
    
    // 更新玩家状态
    if (gameState.players[playerId]) {
        gameState.players[playerId].hp = data.hp || gameState.players[playerId].maxHp;
        if (playerId === socket.id) {
            localPlayer.hp = data.hp || localPlayer.maxHp;
            gameState.isDead = false;
            updateHealthBar();
        }
    }
    
    console.log(`💛 玩家 ${data.playerName} 已复活`);
    
    // 如果是王子栗，更新E技能按钮状态
    if (PLAYER_AVATAR.character === '王子栗') {
        updateSkillButtons();
    }
});

// 碎裂特效生成事件（王子栗Q技能）
socket.on('shatter_spawned', (data) => {
    if (!gameState.shatter_effects) {
        gameState.shatter_effects = {};
    }
    gameState.shatter_effects[data.shatterId] = {
        id: data.shatterId,
        x: data.x,
        y: data.y,
        size: data.size,
        spawnTime: Date.now() / 1000
    };
    console.log(`⚡ 碎裂特效生成: ${data.shatterId}`);
});

// 神人模式开始事件（王子栗Q技能）
socket.on('divine_mode_start', (data) => {
    gameState.divine_mode = {
        playerId: data.playerId,
        x: data.x,
        y: data.y,
        startTime: Date.now() / 1000
    };
    console.log('⚡ 神人模式开始', gameState.divine_mode);
});

// 神人模式结束事件（王子栗Q技能）
socket.on('divine_mode_end', (data) => {
    if (gameState.divine_mode && gameState.divine_mode.playerId === data.playerId) {
        gameState.divine_mode = null;
        console.log('⚡ 神人模式结束', data.playerId);
    }
});

// 白光笼罩开始事件（王子栗Q技能）
socket.on('white_screen_start', (data) => {
    gameState.white_overlay = {
        playerId: data.playerId,
        startTime: Date.now() / 1000,
        alpha: 0,  // 从0开始逐渐增加
        phase: 'fade_in',  // 阶段：fade_in, freeze, fade_out
        fadeInDuration: 1.0,  // 淡入持续时间1秒
        freezeDuration: 0.25,  // 定格持续时间0.25秒
        fadeOutDuration: 1.5,  // 淡出持续时间1.5秒
        fadeOutStartTime: null  // 淡出开始时间（由服务器通知）
    };
    console.log('⚡ 白光笼罩开始', gameState.white_overlay);
});

// 白光淡出开始事件（王子栗Q技能）
socket.on('white_screen_fade_out', (data) => {
    if (gameState.white_overlay && gameState.white_overlay.playerId === data.playerId) {
        // 不立即移除碎裂特效，而是和白色界面一起淡出（1.5秒内逐渐淡去）
        // 切换到淡出阶段
        gameState.white_overlay.phase = 'fade_out';
        gameState.white_overlay.fadeOutStartTime = data.fadeOutStartTime;
        console.log('⚡ 白光开始淡出，碎片特效和白色界面一起在1.5秒内逐渐淡去');
    }
});

// Q技能结束事件（王子栗Q技能）
socket.on('q_skill_end', (data) => {
    // 移除白光笼罩和碎片特效（如果还在）
    gameState.white_overlay = null;
    if (gameState.shatter_effects) {
        gameState.shatter_effects = {};
    }
    
    // 移除神人模式
    if (gameState.divine_mode && gameState.divine_mode.playerId === data.playerId) {
        gameState.divine_mode = null;
    }
    
    // 结束Q技能状态
    if (localPlayer.skills.Q.active) {
        localPlayer.skills.Q.active = false;
        localPlayer.skills.Q.charge = 0;  // 清空充能
        updateSkillButtons();
    }
    console.log('⚡ 王子栗Q技能结束');
});

socket.on('player_left', (data) => {
    delete gameState.players[data.id];
    updatePlayerList();
});

socket.on('game_ended', (data) => {
    gameOver(data.message);
});

socket.on('game_state_update', (data) => {
    // 同步本地玩家的生命值上限和泡泡盾状态（从服务器数据）
    if (data.players && data.players[socket.id]) {
        const serverPlayer = data.players[socket.id];
        if (serverPlayer.maxHp !== undefined) {
            localPlayer.maxHp = serverPlayer.maxHp;
            if (serverPlayer.hp !== undefined) {
                localPlayer.hp = serverPlayer.hp;  // 同步当前生命值
            } else if (localPlayer.hp > localPlayer.maxHp) {
                localPlayer.hp = localPlayer.maxHp;  // 确保不超过上限
            }
        }
        // 同步泡泡盾状态
        if (serverPlayer.bubble_shield_end !== undefined) {
            localPlayer.bubbleShieldEnd = serverPlayer.bubble_shield_end;
        }
        if (serverPlayer.bubble_shield_damage_bonus !== undefined) {
            localPlayer.bubbleShieldDamageBonus = serverPlayer.bubble_shield_damage_bonus;
        }
        if (serverPlayer.invincible !== undefined) {
            localPlayer.invincible = serverPlayer.invincible;
        }
    }
    
    // 同步其他玩家的泡泡盾状态
    if (data.players) {
        for (let playerId in data.players) {
            if (playerId === socket.id) continue;
            const serverPlayer = data.players[playerId];
            if (gameState.players[playerId]) {
                if (serverPlayer.bubble_shield_end !== undefined) {
                    gameState.players[playerId].bubbleShieldEnd = serverPlayer.bubble_shield_end;
                }
                if (serverPlayer.invincible !== undefined) {
                    gameState.players[playerId].invincible = serverPlayer.invincible;
                }
            }
        }
    }
    
    // 更新敌人和倒计时
    if (data.enemies) {
        // 更新敌人数据（包括音爆效果和治疗效果）
        for (let i = 0; i < data.enemies.length; i++) {
            const serverEnemy = data.enemies[i];
            const localEnemy = gameState.enemies.find(e => e.id === serverEnemy.id);
            if (localEnemy) {
                // 更新现有敌人的数据
                localEnemy.hp = serverEnemy.hp;
                localEnemy.x = serverEnemy.x;
                localEnemy.y = serverEnemy.y;
                if (serverEnemy.sonic_boom_end !== undefined) {
                    localEnemy.sonic_boom_end = serverEnemy.sonic_boom_end;
                }
                if (serverEnemy.shatter_end !== undefined) {
                    localEnemy.shatter_end = serverEnemy.shatter_end;
                }
                if (serverEnemy.hit_flash_end !== undefined) {
                    localEnemy.hit_flash_end = serverEnemy.hit_flash_end;
                }
                if (serverEnemy.crit_shake_end !== undefined) {
                    localEnemy.crit_shake_end = serverEnemy.crit_shake_end;
                }
                if (serverEnemy.heal_flash_end !== undefined) {
                    localEnemy.heal_flash_end = serverEnemy.heal_flash_end;
                }
            } else {
                // 新敌人，直接添加（确保包含所有特效字段）
                const newEnemy = {
                    ...serverEnemy,
                    sonic_boom_end: serverEnemy.sonic_boom_end || 0,
                    shatter_end: serverEnemy.shatter_end || 0,
                    hit_flash_end: serverEnemy.hit_flash_end || 0,
                    crit_shake_end: serverEnemy.crit_shake_end || 0,
                    heal_flash_end: serverEnemy.heal_flash_end || 0
                };
                gameState.enemies.push(newEnemy);
            }
        }
        // 移除已死亡的敌人
        gameState.enemies = gameState.enemies.filter(e => 
            data.enemies.some(se => se.id === e.id && se.hp > 0)
        );
        // 预加载敌人图片
        for (let enemy of gameState.enemies) {
            if (enemy.type) {
                loadEnemyImage(enemy.type);
            }
        }
    }
    if (data.beams !== undefined) {
        gameState.beams = data.beams;
    }
    if (data.q_skills !== undefined) {
        gameState.q_skills = data.q_skills;
    }
    if (data.lock_skills !== undefined) {
        gameState.lock_skills = data.lock_skills;
    }
    if (data.big_apples !== undefined) {
        gameState.big_apples = data.big_apples;
    }
    
    // 同步毒苹果
    if (data.poison_apples !== undefined) {
        gameState.poison_apples = data.poison_apples;
    }
    
    // 同步爆炸特效
    if (data.explosions !== undefined) {
        gameState.explosions = data.explosions;
    }
    
    if (data.countdown !== undefined) {
        gameState.countdown = data.countdown;
        updateCountdownDisplay();
    }
    if (data.players) {
        // 更新玩家HP和受击闪烁状态
        for (let playerId in data.players) {
            if (gameState.players[playerId]) {
                gameState.players[playerId].hp = data.players[playerId].hp;
                if (data.players[playerId].hit_flash_end !== undefined) {
                    gameState.players[playerId].hit_flash_end = data.players[playerId].hit_flash_end;
                }
                if (data.players[playerId].heal_flash_end !== undefined) {
                    gameState.players[playerId].heal_flash_end = data.players[playerId].heal_flash_end;
                }
            }
        }
    }
    if (data.bullets) {
        // 更新子弹位置（服务器同步，包括弹射后的位置）
        gameState.bullets = data.bullets;
    }
});

socket.on('game_result', (data) => {
    gameState.gameResult = data.result;
    if (data.result === 'victory') {
        showVictory();
    } else if (data.result === 'defeat') {
        showDefeat();
    }
});

// 接收队伍角色数据
socket.on('team_stats', (teamStats) => {
    updateTeamStatsPanel(teamStats);
});

// 键盘事件
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = true;
    
    console.log('按键按下:', key, '当前按键状态:', keys);
    
    // R键换弹
    if (key === 'r') {
        console.log('触发换弹');
        reload();
    }
});

document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = false;
    console.log('按键释放:', key);
});

// 鼠标事件
document.addEventListener('mousemove', (e) => {
    mousePos.x = e.clientX;
    mousePos.y = e.clientY;
    
    // 更新准星位置（使用fixed定位和transform居中，所以直接设置left/top）
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        crosshair.style.left = mousePos.x + 'px';
        crosshair.style.top = mousePos.y + 'px';
    }
    
    // 计算角度
    localPlayer.angle = Math.atan2(mousePos.y - localPlayer.y, mousePos.x - localPlayer.x);
});

document.addEventListener('mousedown', (e) => {
    if (e.button === 0) {  // 左键
        console.log('鼠标左键按下');
        
        // 检查Q技能是否激活（星耀犊激活Q技能时禁用左键）
        if (PLAYER_AVATAR.character === '星耀犊' && localPlayer.skills.Q.active) {
            console.log('Q技能激活中，无法使用左键射击');
            return;
        }
        
        // 检查是否在换弹
        if (isReloading) {
            console.log('正在换弹，无法射击或蓄力');
            return;
        }
        
        isShooting = true;
        
        // 星耀犊需要蓄力
        if (PLAYER_AVATAR.character === '星耀犊' && localPlayer.weapon && localPlayer.weapon.canCharge) {
            // 检查射击间隔
            const now = Date.now() / 1000;
            if (now - localPlayer.weapon.lastFireTime < localPlayer.weapon.fireRate) {
                console.log('射击间隔未到，无法开始蓄力');
                return;
            }
            // 开始蓄力
            isCharging = true;
            chargeStartTime = Date.now() / 1000;
            chargeTime = 0;
            console.log('开始蓄力...');
        } else {
            console.log('调用射击函数...');
            shoot();  // 立即射击一次
        }
    }
});

document.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
        console.log('鼠标左键释放');
        isShooting = false;
        
        // 星耀犊蓄力释放
        if (PLAYER_AVATAR.character === '星耀犊' && isCharging) {
            // 发射蓄力子弹
            fireChargedBullet();
        }
    }
});

// 鼠标右键事件（技能）
document.addEventListener('mousedown', (e) => {
    if (e.button === 2) {  // 右键
        e.preventDefault();
        
        // 检查Q技能是否激活（星耀犊激活Q技能时禁用右键）
        if (PLAYER_AVATAR.character === '星耀犊' && localPlayer.skills.Q.active) {
            console.log('Q技能激活中，无法使用右键技能');
            return;
        }
        
        isRightClickHeld = true;
        
        // 星耀犊右键技能：按住右键持续发射尖刺
        if (PLAYER_AVATAR.character === '星耀犊') {
            activateRightClickSkill();
        } else {
            activateRightClickSkill();
        }
    }
});

document.addEventListener('mouseup', (e) => {
    if (e.button === 2) {  // 右键释放
        e.preventDefault();
        isRightClickHeld = false;
        
        // 星耀犊右键技能：现在是点击切换模式，不需要在鼠标释放时停止
        // （停止逻辑已在activateRightClickSkill中处理）
        
        // 幺幺俊羊羊Q技能：右键取消虚影
        if (PLAYER_AVATAR.character === '幺幺俊羊羊' && 
            localPlayer.skills.Q.active && 
            localPlayer.skills.Q.showingShadow) {
            // 取消虚影，不消耗能量
            localPlayer.skills.Q.active = false;
            localPlayer.skills.Q.showingShadow = false;
            console.log('🍎 幺幺俊羊羊Q技能：取消虚影');
                updateSkillButtons();
            }
        
        // 检查幺幺俊羊羊E技能是否在显示虚影阶段（点击右键取消毒苹果虚影）
        if (PLAYER_AVATAR.character === '幺幺俊羊羊' && 
            localPlayer.skills.E.active && 
            localPlayer.skills.E.showingShadow) {
            // 取消虚影，不进入冷却
            localPlayer.skills.E.active = false;
            localPlayer.skills.E.showingShadow = false;
            console.log('🍎 幺幺俊羊羊E技能：取消毒苹果虚影（不进入冷却）');
            updateSkillButtons();
        }
    }
});

document.addEventListener('contextmenu', (e) => {
    e.preventDefault();  // 阻止右键菜单
});

// 键盘事件 - 技能
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    
    // C键切换角色面板
    if (key === 'c') {
        toggleTeamStatsPanel();
        return;
    }
    
    // 检查是否在选择玩家模式（幺幺俊羊羊右键或E技能）
    if (PLAYER_AVATAR.character === '幺幺俊羊羊') {
        const rightClickSkill = localPlayer.skills.rightClick;
        const eSkill = localPlayer.skills.E;
        
        // 右键技能选择玩家
        if (rightClickSkill.selectingPlayer && (key === '1' || key === '2' || key === '3' || key === '4')) {
            const selectedIndex = parseInt(key) - 1;
            if (selectedIndex >= 0 && selectedIndex < rightClickSkill.playerList.length) {
                const selectedPlayer = rightClickSkill.playerList[selectedIndex];
                applyBubbleShieldToPlayer(selectedPlayer.id);
                rightClickSkill.selectingPlayer = false;
                rightClickSkill.playerList = [];
                hidePlayerSelectionUI();
                return;
            }
        }
        
        // E技能选择玩家
        if (eSkill.selectingPlayer && (key === '1' || key === '2' || key === '3' || key === '4')) {
            const selectedIndex = parseInt(key) - 1;
            if (selectedIndex >= 0 && selectedIndex < eSkill.playerList.length) {
                const selectedPlayer = eSkill.playerList[selectedIndex];
                pullTeammateToPosition(selectedPlayer.id);
                eSkill.selectingPlayer = false;
                eSkill.playerList = [];
                hidePlayerSelectionUI();
                return;
            }
        }
    }
    
    if (key === 'q') {
        activateQSkill();
    } else if (key === 'e') {
        activateESkill();
    }
});

// 窗口大小改变
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// 玩家移动
function updatePlayer(deltaTime) {
    let moved = false;
    let oldX = localPlayer.x;
    let oldY = localPlayer.y;
    
    // 调试：显示按键状态（已禁用，减少输出）
    // const pressedKeys = Object.keys(keys).filter(k => keys[k]);
    // if (pressedKeys.length > 0) {
    //     console.log('当前按下的键:', pressedKeys, 'keys对象:', keys);
    // }
    
    // 王子栗后坐力处理
    const currentTime = Date.now() / 1000;
    const isRecoiling = localPlayer.recoilEnd && currentTime < localPlayer.recoilEnd;
    
    // 检查王子栗Q技能是否激活（神人模式期间不能移动）
    const isDivineMode = gameState.divine_mode && gameState.divine_mode.playerId === socket.id;
    
    if (isRecoiling) {
        // 应用后坐力速度
        localPlayer.x += (localPlayer.recoilVx || 0) * deltaTime;
        localPlayer.y += (localPlayer.recoilVy || 0) * deltaTime;
        moved = true;
        // 后坐力期间禁用WASD移动
    } else if (isDivineMode) {
        // 神人模式期间禁用移动
        // 后坐力结束，清除
        localPlayer.recoilVx = 0;
        localPlayer.recoilVy = 0;
        localPlayer.recoilEnd = 0;
        // 不处理WASD移动
    } else {
        // 后坐力结束，清除
        localPlayer.recoilVx = 0;
        localPlayer.recoilVy = 0;
        localPlayer.recoilEnd = 0;
        
        // WASD移动（只在后坐力结束后才生效）
        if (keys['w']) {
            localPlayer.y -= localPlayer.speed;
            moved = true;
        }
        if (keys['s']) {
            localPlayer.y += localPlayer.speed;
            moved = true;
        }
        if (keys['a']) {
            localPlayer.x -= localPlayer.speed;
            moved = true;
        }
        if (keys['d']) {
            localPlayer.x += localPlayer.speed;
            moved = true;
        }
    }
    
    // 限制在画布内
    localPlayer.x = Math.max(localPlayer.size, Math.min(canvas.width - localPlayer.size, localPlayer.x));
    localPlayer.y = Math.max(localPlayer.size, Math.min(canvas.height - localPlayer.size, localPlayer.y));
    
    // 如果移动了，发送位置到服务器
    if (moved) {
        console.log(`🚶 玩家位置: (${Math.round(localPlayer.x)}, ${Math.round(localPlayer.y)})`);
        
        // 每秒只发送少量更新以减少网络负载
        if (!updatePlayer.lastSendTime || Date.now() - updatePlayer.lastSendTime > 50) {
            socket.emit('player_move', {
                room_key: ROOM_KEY,
                x: localPlayer.x,
                y: localPlayer.y,
                angle: localPlayer.angle
            });
            updatePlayer.lastSendTime = Date.now();
        }
    }
    
    // 检查换弹状态
    if (isReloading) {
        const now = Date.now() / 1000;
        const elapsedTime = now - localPlayer.weapon.reloadStartTime;
        
        console.log(`⏳ 换弹中... ${elapsedTime.toFixed(2)}/${localPlayer.weapon.reloadTime}秒`);
        
        if (elapsedTime >= localPlayer.weapon.reloadTime) {
            // 换弹完成
            console.log('✅ 换弹完成！');
            localPlayer.weapon.currentAmmo = localPlayer.weapon.maxAmmo;
            isReloading = false;
            document.getElementById('reloadingText').style.display = 'none';
            updateAmmoDisplay();
            console.log('弹药已恢复到:', localPlayer.weapon.currentAmmo);
        }
    }
    
    // 星耀犊锁定系统
    if (PLAYER_AVATAR.character === '星耀犊') {
        updateLockTarget();
    }
    
    // 星耀犊蓄力系统
    if (PLAYER_AVATAR.character === '星耀犊' && isCharging) {
        // 如果开始换弹，停止蓄力
        if (isReloading) {
            isCharging = false;
            chargeTime = 0;
            return;
        }
        
        const now = Date.now() / 1000;
        chargeTime = Math.min(now - chargeStartTime, localPlayer.weapon.maxChargeTime);
        
        // 如果达到最大蓄力时间，自动发射
        if (chargeTime >= localPlayer.weapon.maxChargeTime) {
            fireChargedBullet();
        }
    }
    
    // 持续射击（非星耀犊或非蓄力模式）
    // 检查Q技能是否激活（星耀犊激活Q技能时禁用左键）
    const qSkillActive = PLAYER_AVATAR.character === '星耀犊' && localPlayer.skills.Q.active;
    // 检查公主蓉右键技能是否激活（锁定期间禁用左键）
    const princessLockActive = PLAYER_AVATAR.character === '公主蓉' && 
                                localPlayer.skills.rightClick.active && 
                                localPlayer.skills.rightClick.lockPhase === 'locking';
    if (isShooting && !isReloading && !localPlayer.skills.rightClick.active && !qSkillActive && !princessLockActive) {
        if (PLAYER_AVATAR.character === '星耀犊' && localPlayer.weapon.canCharge) {
            // 星耀犊需要蓄力，不在这里直接射击
            if (!isCharging) {
                // 开始蓄力
                isCharging = true;
                chargeStartTime = Date.now() / 1000;
                chargeTime = 0;
            }
        } else {
            shoot();
        }
    }
    
    // 处理公主蓉四连射队列
    if (PLAYER_AVATAR.character === '公主蓉' && localPlayer.weapon && localPlayer.weapon.quadShotQueue) {
        const now = Date.now() / 1000;
        const queue = localPlayer.weapon.quadShotQueue;
        
        // 检查队列中需要发射的子弹
        while (queue.length > 0 && now >= queue[0]) {
            queue.shift();
            // 发射单发子弹
            shootSingleBullet('公主蓉');
        }
        
        // 队列清空后，清除队列
        if (queue.length === 0) {
            localPlayer.weapon.quadShotQueue = null;
        }
    }
    
    // 更新技能状态
    updateSkills(deltaTime);
}

// 发射单发子弹（用于公主蓉四连射）
function shootSingleBullet(character) {
    if (character !== '公主蓉') return;
    
    const weapon = localPlayer.weapon;
    const angle = localPlayer.angle;
    
    // 计算伤害：50 + 生命值上限的5%
    const baseDamage = weapon.damage;
    const maxHpDamage = Math.floor(localPlayer.maxHp * 0.05);
    let damage = baseDamage + maxHpDamage;
    
    console.log('=== 公主蓉四连射伤害计算 ===');
    console.log('基础伤害:', baseDamage);
    console.log('生命值上限:', localPlayer.maxHp);
    console.log('生命值上限5%:', maxHpDamage);
    console.log('伤害(基础+生命值5%):', damage);
    
    // 应用角色伤害加成（在暴击之前计算）
    const damageBonus = (localPlayer.stats && localPlayer.stats.damageBonus) || 0;
    if (damageBonus > 0) {
        const damageBeforeBonus = damage;
        damage = Math.ceil(damage * (1 + damageBonus));
        console.log('伤害加成:', (damageBonus * 100).toFixed(1) + '%');
        console.log('伤害(应用伤害加成后):', damage, `(${damageBeforeBonus} * ${(1 + damageBonus).toFixed(3)})`);
    } else {
        console.log('伤害加成: 0%');
    }
    
    // 计算治疗：20 + 生命值上限的1%（如果击中队友）
    const baseHealing = weapon.healingAmount;
    const maxHpHealing = Math.floor(localPlayer.maxHp * 0.01);
    let healing = baseHealing + maxHpHealing;
    
    // 应用治疗加成（在暴击之前计算）
    const healingBonus = localPlayer.stats.healingBonus || 0;
    if (healingBonus > 0) {
        healing = Math.ceil(healing * (1 + healingBonus));
    }
    
    // 计算暴击率（服务器端已计算被动，直接使用面板暴击率）
    let critRate = localPlayer.stats.critRate || 0;
    // 注意：公主蓉的被动（根据治疗加成获得等额暴击率）已在服务器端计算，客户端不应重复添加
    
    // 验证暴击率是否正确获取
    if (critRate === 0 && localPlayer.stats && localPlayer.stats.critRate !== undefined) {
        console.warn('⚠️ 警告：暴击率为0，但localPlayer.stats.critRate存在:', localPlayer.stats.critRate);
        critRate = localPlayer.stats.critRate;
    }
    
    const critDamage = localPlayer.stats.critDamage || 1.0;
    console.log('=== 公主蓉暴击计算验证 ===');
    console.log('localPlayer.stats:', localPlayer.stats);
    console.log('localPlayer.stats.critRate:', localPlayer.stats ? localPlayer.stats.critRate : 'undefined');
    console.log('计算后的暴击率:', (critRate * 100).toFixed(1) + '%');
    console.log('暴击伤害倍率:', ((1 + critDamage) * 100).toFixed(1) + '%');
    
    // 判断是否暴击（伤害和治疗都可以暴击）
    let isCrit = false;
    const randomValue = Math.random();
    console.log('随机值:', randomValue.toFixed(4));
    if (randomValue < critRate) {
        const damageBeforeCrit = damage;
        const healingBeforeCrit = healing;
        damage = Math.ceil(damage * (1 + critDamage));
        healing = Math.ceil(healing * (1 + critDamage));  // 治疗也可以暴击
        isCrit = true;
        console.log('✓ 触发暴击！伤害:', damageBeforeCrit, '->', damage);
        console.log('✓ 触发暴击！治疗:', healingBeforeCrit, '->', healing);
    } else {
        console.log('✗ 未触发暴击');
    }
    
    console.log('发送给服务器的伤害值:', damage, '(是否暴击:', isCrit + ')');
    console.log('=== 公主蓉四连射伤害计算完成 ===\n');
    
    // 获取属性强度
    let playerAttributePower = localPlayer.stats ? (localPlayer.stats.attributePower || 0) : 0;
    
    // 验证属性强度是否正确获取
    if (playerAttributePower === 0 && localPlayer.stats && localPlayer.stats.attributePower) {
        console.warn('⚠️ 警告：属性强度为0，但localPlayer.stats.attributePower存在:', localPlayer.stats.attributePower);
        playerAttributePower = localPlayer.stats.attributePower;
    }
    
    console.log('公主蓉子弹 - 关键属性验证:');
    console.log('  伤害:', damage);
    console.log('  是否暴击:', isCrit);
    console.log('  属性强度:', playerAttributePower);
    
    const bullet = {
        x: localPlayer.x,
        y: localPlayer.y,
        vx: Math.cos(angle) * weapon.bulletSpeed,
        vy: Math.sin(angle) * weapon.bulletSpeed,
        size: weapon.bulletSize,
        damage: damage,
        healing: healing,
        owner: socket.id,
        ownerName: localPlayer.name,
        isCrit: isCrit,
        canHealTeammates: true,  // 可以治疗队友
        bulletImage: null,  // 粉红色子弹（使用默认绘制）
        attribute: '自然系',  // 公主蓉的属性
        attributePower: playerAttributePower,
        isPinkBullet: true  // 标记为粉红色子弹
    };
    
    socket.emit('player_shoot', {
        room_key: ROOM_KEY,
        bullet: bullet
    });
}

// 发射爱心飞弹（公主蓉右键技能）
function fireHeartMissiles() {
    const skill = localPlayer.skills.rightClick;
    // 检查技能是否激活，并且有锁定目标（lockPhase可以是'locking'或null）
    if (!skill.active) {
        console.log('🌸 公主蓉右键技能：技能未激活');
        return;
    }
    
    // 如果lockPhase还是'locking'，设置为null（防止重复调用）
    if (skill.lockPhase === 'locking') {
        skill.lockPhase = null;
    }
    
    const targets = skill.lockedTargets || [];
    if (targets.length === 0) {
        console.log('没有锁定目标');
        // 即使没有目标，也要解除技能状态
        skill.active = false;
        skill.lockPhase = null;
        skill.cooldown = 8.0;
        skill.cooldownTime = 8.0;
        skill.cooldownStart = Date.now() / 1000;
        skill.lockedTargets = [];
        socket.emit('deactivate_lock_skill', {
            room_key: ROOM_KEY,
            skill_type: 'princess_lock'
        });
        updateSkillButtons();
        return;
    }
    
    // 计算伤害和治疗
    const maxHp = localPlayer.maxHp;
    let enemyDamage = 800 + Math.floor(maxHp * 0.10);  // 800 + 生命值上限的10%
    let playerHealing = 100 + Math.floor(maxHp * 0.01);  // 100 + 生命值上限的1%
    
    // 应用角色伤害加成（在暴击之前计算）
    const damageBonus = (localPlayer.stats && localPlayer.stats.damageBonus) || 0;
    if (damageBonus > 0) {
        enemyDamage = Math.ceil(enemyDamage * (1 + damageBonus));
    }
    
    // 应用治疗加成（在暴击之前计算）
    const healingBonus = (localPlayer.stats && localPlayer.stats.healingBonus) || 0;
    if (healingBonus > 0) {
        playerHealing = Math.ceil(playerHealing * (1 + healingBonus));
    }
    
    // 计算暴击率（服务器端已计算被动，直接使用面板暴击率）
    let critRate = (localPlayer.stats && localPlayer.stats.critRate) || 0;
    // 注意：公主蓉的被动（根据治疗加成获得等额暴击率）已在服务器端计算，客户端不应重复添加
    
    // 判断是否暴击
    let isCrit = false;
    const critDamage = (localPlayer.stats && localPlayer.stats.critDamage) || 1.0;
    if (Math.random() < critRate) {
        enemyDamage = Math.ceil(enemyDamage * (1 + critDamage));
        playerHealing = Math.ceil(playerHealing * (1 + critDamage));
        isCrit = true;
    }
    
    // 向所有锁定的目标发射爱心飞弹
    for (let target of targets) {
        // 计算方向
        const dx = target.x - localPlayer.x;
        const dy = target.y - localPlayer.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 0) {
            const angle = Math.atan2(dy, dx);
            const speed = 2000;  // 爱心飞弹速度（20 * 100）
            
            const bullet = {
                x: localPlayer.x,
                y: localPlayer.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 40,  // 40*40大小
                bulletSpeed: 2000,  // 保存速度用于服务器端追踪
                damage: target.type === 'enemy' ? enemyDamage : 0,
                healing: target.type === 'player' ? playerHealing : 0,
                isCrit: isCrit,
                owner: socket.id,
                ownerName: localPlayer.name,
                isHeartMissile: true,  // 标记为爱心飞弹
                targetId: target.id,  // 目标ID（用于追踪）
                targetType: target.type,  // 目标类型
                bulletImage: '爱心飞弹.png',  // 使用爱心飞弹.png作为图标
                attribute: '自然系',
                attributePower: (localPlayer.stats && localPlayer.stats.attributePower) || 0,
                isPinkBullet: true
            };
            
            socket.emit('player_shoot', {
                room_key: ROOM_KEY,
                bullet: bullet
            });
        }
    }
    
    // 发射后解除技能状态
    skill.active = false;
    skill.lockPhase = null;
    skill.cooldown = 8.0;
    skill.cooldownTime = 8.0;
    skill.cooldownStart = Date.now() / 1000;
    skill.lockedTargets = [];
    
    // 通知服务器移除锁定状态
    socket.emit('deactivate_lock_skill', {
        room_key: ROOM_KEY,
        skill_type: 'princess_lock'
    });
    
    console.log('🌸 公主蓉发射爱心飞弹，技能解除');
    updateSkillButtons();
}

// 生成巨大苹果（幺幺俊羊羊Q技能）
function generateBigApple() {
    const skill = localPlayer.skills.Q;
    if (!skill.active || !skill.showingShadow) {
        return;
    }
    
    // 计算伤害和治疗
    const attackPower = localPlayer.stats ? (localPlayer.stats.attack || 0) : 0;
    const placementDamage = 1000 + attackPower;  // 放置时伤害
    const healingAmount = 100 + attackPower;  // 每秒治疗
    const explosionDamage = 5000 + attackPower;  // 爆炸伤害（5000+攻击力）
    
    // 通知服务器生成巨大苹果
    socket.emit('spawn_big_apple', {
        room_key: ROOM_KEY,
        x: skill.shadowX,
        y: skill.shadowY,
        placementDamage: placementDamage,
        healingAmount: healingAmount,
        explosionDamage: explosionDamage,
        duration: 6.0
    });
    
    // 更新技能状态：虚影消失，开始倒计时
    skill.showingShadow = false;
    skill.active = true;
    skill.activeTime = Date.now() / 1000;
    skill.activeDuration = 6.0;  // 6秒倒计时
    skill.charge = 0;  // 清空能量
    
    console.log('🍎 幺幺俊羊羊生成巨大苹果，位置:', skill.shadowX, skill.shadowY);
    updateSkillButtons();
}

// 生成毒苹果（幺幺俊羊羊E技能）
function generatePoisonApple() {
    const skill = localPlayer.skills.E;
    if (!skill.active || !skill.showingShadow) {
        return;
    }
    
    // 计算伤害
    const attackPower = localPlayer.stats ? (localPlayer.stats.attack || 0) : 0;
    const explosionDamage = 2000 + attackPower;  // 爆炸伤害（2000+攻击力）
    
    // 通知服务器生成毒苹果
    socket.emit('spawn_poison_apple', {
        room_key: ROOM_KEY,
        x: skill.shadowX,
        y: skill.shadowY,
        explosionDamage: explosionDamage,
        duration: 10.0
    });
    
    // 更新技能状态：虚影消失，开始倒计时
    skill.showingShadow = false;
    skill.active = true;
    skill.activeTime = Date.now() / 1000;
    skill.activeDuration = 10.0;  // 10秒倒计时
    skill.cooldownTime = 8.0;  // 8秒冷却
    
    console.log('🍎 幺幺俊羊羊生成毒苹果，位置:', skill.shadowX, skill.shadowY);
    updateSkillButtons();
}

// 星耀犊锁定目标更新
function updateLockTarget() {
    const lockRange = 250;  // 锁定范围（像素）- 500*500区域，半径250
    let nearestPlayer = null;
    let nearestDistance = lockRange;
    
    // 计算准星在画布上的位置
    const crosshairX = mousePos.x;
    const crosshairY = mousePos.y;
    
    // 遍历所有玩家，找到准星附近最近的玩家
    for (let playerId in gameState.players) {
        if (playerId === socket.id) continue;  // 跳过自己
        const player = gameState.players[playerId];
        if (player.hp <= 0) continue;  // 跳过死亡玩家
        // 允许锁定测试木桩
        
        const dx = player.x - crosshairX;
        const dy = player.y - crosshairY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestPlayer = player;
            lockedPlayerId = playerId;
        }
    }
    
    // 更新锁定状态
    if (nearestPlayer) {
        lockedPlayer = nearestPlayer;
        // 通知服务器更新锁定状态
        socket.emit('update_lock_target', {
            room_key: ROOM_KEY,
            targetId: lockedPlayerId
        });
    } else {
        lockedPlayer = null;
        lockedPlayerId = null;
        // 清除锁定状态
        socket.emit('update_lock_target', {
            room_key: ROOM_KEY,
            targetId: null
        });
    }
}

// 发射蓄力子弹
function fireChargedBullet() {
    // 检查是否在换弹
    if (isReloading) {
        console.log('正在换弹，无法发射');
        isCharging = false;
        chargeTime = 0;
        return;
    }
    
    const now = Date.now() / 1000;
    const weapon = localPlayer.weapon;
    
    // 检查射击间隔
    if (now - weapon.lastFireTime < weapon.fireRate) {
        console.log('射击间隔未到，无法发射');
        isCharging = false;
        chargeTime = 0;
        return;
    }
    
    chargeTime = Math.min(now - chargeStartTime, weapon.maxChargeTime);
    
    // 创建蓄力子弹
    const bullet = createChargedBullet(chargeTime);
    if (!bullet) {
        isCharging = false;
        chargeTime = 0;
        return;
    }
    
    // 更新射击时间
    weapon.lastFireTime = now;
    
    // 发送蓄力子弹到服务器
    socket.emit('player_shoot', {
        room_key: ROOM_KEY,
        bullet: bullet
    });
    
    // 重置状态
    isCharging = false;
    chargeTime = 0;
}

// 创建蓄力子弹（星耀犊）
function createChargedBullet(chargeTime) {
    const weapon = localPlayer.weapon;
    
    // 检查弹药
    if (weapon.currentAmmo <= 0) {
        reload();
        return null;
    }
    
    // 消耗弹药
    weapon.currentAmmo--;
    updateAmmoDisplay();
    
    // 如果这是最后一枚子弹，立即换弹
    if (weapon.currentAmmo <= 0) {
        reload();
    }
    
    // 计算角度（锁定玩家或准星方向）
    let angle = localPlayer.angle;
    let targetId = null;
    
    if (lockedPlayerId && lockedPlayer) {
        // 锁定模式：朝向锁定的玩家
        const dx = lockedPlayer.x - localPlayer.x;
        const dy = lockedPlayer.y - localPlayer.y;
        angle = Math.atan2(dy, dx);
        targetId = lockedPlayerId;
    }
    
    // 计算治疗量：基础治疗量 + 星耀犊生命值上限的1% + 蓄力加成
    const baseHealing = 10;
    const maxHpPercent = Math.floor(localPlayer.maxHp * 0.01);
    const chargeBonus = Math.floor(chargeTime * weapon.chargeHealingBonus);
    let healing = baseHealing + maxHpPercent + chargeBonus;
    
    // 应用治疗加成（在E技能和暴击之前计算）
    const healingBonus = localPlayer.stats ? (localPlayer.stats.healingBonus || 0) : 0;
    if (healingBonus > 0) {
        healing = Math.ceil(healing * (1 + healingBonus));
    }
    
    // E技能治疗加成（20%）
    if (localPlayer.skills.E.active && PLAYER_AVATAR.character === '星耀犊') {
        healing = Math.ceil(healing * 1.2);
    }
    
    // 计算暴击（治疗也可以暴击）
    let isCrit = false;
    const critRate = localPlayer.stats ? (localPlayer.stats.critRate || 0) : 0;
    const critDamage = localPlayer.stats ? (localPlayer.stats.critDamage || 1.0) : 1.0;
    
    // 调试日志
    console.log('=== 治疗暴击计算 ===');
    console.log('基础治疗量:', baseHealing);
    console.log('生命值上限百分比:', maxHpPercent);
    console.log('蓄力加成:', chargeBonus);
    console.log('总治疗量（暴击前）:', healing);
    console.log('暴击率:', critRate, '(', (critRate * 100).toFixed(1) + '%)');
    console.log('暴击伤害倍率:', critDamage, '(', ((1 + critDamage) * 100).toFixed(1) + '%)');
    
    const randomValue = Math.random();
    console.log('随机值:', randomValue);
    
    if (randomValue < critRate) {
        const oldHealing = healing;
        healing = Math.floor(healing * (1 + critDamage));
        isCrit = true;
        console.log('✓ 触发暴击！治疗量:', oldHealing, '->', healing);
    } else {
        console.log('✗ 未触发暴击');
    }
    
    // 星耀犊左键治疗获得2%Q技能充能
    if (PLAYER_AVATAR.character === '星耀犊') {
        const qSkill = localPlayer.skills.Q;
        if (qSkill.charge < qSkill.maxCharge) {
            qSkill.charge = Math.min(qSkill.maxCharge, qSkill.charge + 2);
        }
    }
    
    // 计算初始速度方向
    const speed = weapon.bulletSpeed;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    
    // 调试日志
    console.log('🎯 子弹创建:');
    console.log('  角度:', angle, '(', (angle * 180 / Math.PI).toFixed(1) + '度)');
    console.log('  速度:', speed);
    console.log('  速度向量: (', vx.toFixed(1), ',', vy.toFixed(1), ')');
    console.log('  锁定目标ID:', targetId);
    if (targetId && lockedPlayer) {
        console.log('  目标位置: (', lockedPlayer.x, ',', lockedPlayer.y, ')');
    }
    
    // 获取属性强度（E技能加成）
    let playerAttributePower = localPlayer.stats ? (localPlayer.stats.attributePower || 0) : 0;
    if (localPlayer.skills.E.active && PLAYER_AVATAR.character === '星耀犊') {
        playerAttributePower += 200;
    }
    
    const bullet = {
        x: localPlayer.x,
        y: localPlayer.y,
        vx: vx,
        vy: vy,
        size: weapon.bulletSize,
        damage: 0,  // 音符不造成伤害
        healing: healing,  // 治疗量
        owner: socket.id,
        ownerName: localPlayer.name,
        isHealing: true,  // 标记为治疗子弹
        targetId: targetId,  // 锁定的目标ID（如果有）
        isCrit: Boolean(isCrit),  // 确保是布尔值，是否暴击治疗
        bulletImage: weapon.bulletImage,  // 子弹图标
        bulletSpeed: speed,  // 保存子弹速度（用于服务器端追踪）
        attribute: '超能系',  // 星耀犊的属性
        attributePower: playerAttributePower  // 属性强度（包含E技能加成）
    };
    
    // 调试：确保isCrit正确传递
    console.log('🎵 音符子弹创建完成: isCrit=', bullet.isCrit, '(类型:', typeof bullet.isCrit, ')');
    
    return bullet;
}

// 射击
function shoot() {
    console.log('=== shoot函数调用 ===');
    console.log('isReloading:', isReloading);
    console.log('weapon:', localPlayer.weapon);
    
    // 检查是否阵亡
    if (gameState.isDead || localPlayer.hp <= 0) {
        console.log('玩家已阵亡，无法射击');
        return;
    }
    
    // 检查Q技能是否激活（星耀犊激活Q技能时禁用左键）
    if (PLAYER_AVATAR.character === '星耀犊' && localPlayer.skills.Q.active) {
        console.log('Q技能激活中，无法使用左键射击');
        return;
    }
    
    // 星耀犊右键发射过程中，使用左键会立即停止右键发射
    if (PLAYER_AVATAR.character === '星耀犊' && localPlayer.skills.rightClick.active) {
        localPlayer.skills.rightClick.active = false;
        localPlayer.skills.rightClick.lastSpikeTime = 0;
        localPlayer.skills.rightClick.spikeCount = 0;
        console.log('星耀犊使用左键，停止右键发射');
        updateSkillButtons();
    }
    
    if (isReloading) {
        console.log('正在换弹，无法射击');
        return;
    }
    
    // 检查幺幺俊羊羊Q技能是否在显示虚影阶段（点击左键生成巨大苹果）
    if (PLAYER_AVATAR.character === '幺幺俊羊羊' && 
        localPlayer.skills.Q.active && 
        localPlayer.skills.Q.showingShadow) {
        // 生成巨大苹果
        generateBigApple();
        return;
    }
    
    // 检查幺幺俊羊羊E技能是否在显示虚影阶段（点击左键生成毒苹果）
    if (PLAYER_AVATAR.character === '幺幺俊羊羊' && 
        localPlayer.skills.E.active && 
        localPlayer.skills.E.showingShadow) {
        // 生成毒苹果
        generatePoisonApple();
        return;
    }
    
    // 公主蓉右键技能锁定阶段禁用左键（锁定完成后会自动发射，不需要手动点击）
    
    const now = Date.now() / 1000;
    const weapon = localPlayer.weapon;
    
    console.log('当前时间:', now);
    console.log('上次射击时间:', weapon.lastFireTime);
    console.log('射击间隔要求:', weapon.fireRate);
    console.log('时间差:', now - weapon.lastFireTime);
    
    // 检查射击间隔
    if (now - weapon.lastFireTime < weapon.fireRate) {
        console.log('射击间隔未到，跳过');
        return;
    }
    
    // 检查弹药
    if (weapon.currentAmmo <= 0) {
        console.log('弹药耗尽，立即换弹');
        reload();
        return;
    }
    
    // 公主蓉四连射处理
    if (PLAYER_AVATAR.character === '公主蓉' && weapon.isQuadShot) {
        // 检查是否正在四连射中
        if (weapon.quadShotQueue && weapon.quadShotQueue.length > 0) {
            return;  // 正在四连射中，不重复触发
        }
        
        // 检查射击间隔（四连发的间隔）
        if (now - weapon.lastFireTime < weapon.fireRate) {
            return;
        }
        
        // 检查弹药
        const quadShotCount = localPlayer.skills.E.active ? 8 : weapon.quadShotCount;
        const quadShotInterval = localPlayer.skills.E.active ? 0.05 : weapon.quadShotInterval;
        
        if (weapon.currentAmmo < quadShotCount) {
            // 弹药不足，立即换弹
            reload();
            return;
        }
        
        // 创建四连射队列
        weapon.quadShotQueue = [];
        for (let i = 0; i < quadShotCount; i++) {
            weapon.quadShotQueue.push(now + i * quadShotInterval);
        }
        
        // 更新射击时间
        weapon.lastFireTime = now;
        
        // 消耗弹药（一次性消耗所有四连射的弹药）
        weapon.currentAmmo -= quadShotCount;
        updateAmmoDisplay();
        
        // 如果弹药耗尽，立即换弹
        if (weapon.currentAmmo <= 0) {
            reload();
        }
        
        console.log(`🌸 公主蓉四连射开始！发射${quadShotCount}发，间隔${quadShotInterval}秒`);
        return;  // 四连射由队列处理，不在这里直接发射
    }
    
    // 射击
    weapon.lastFireTime = now;
    weapon.currentAmmo--;
    updateAmmoDisplay();
    
    // 如果这是最后一枚子弹（发射后剩余0），立即换弹
    if (weapon.currentAmmo <= 0) {
        reload();
    }
    
    console.log('🔫 射击！剩余弹药:', weapon.currentAmmo);
    
    // 创建子弹
    const bulletsToFire = weapon.bulletsPerShot || 1;
    for (let i = 0; i < bulletsToFire; i++) {
        let angle = localPlayer.angle;
        
        // 星耀犊：如果锁定了玩家，朝向锁定玩家
        if (PLAYER_AVATAR.character === '星耀犊' && lockedPlayerId && lockedPlayer) {
            const dx = lockedPlayer.x - localPlayer.x;
            const dy = lockedPlayer.y - localPlayer.y;
            angle = Math.atan2(dy, dx);
        }
        
        // 如果是霰弹枪，添加散射
        if (bulletsToFire > 1) {
            const spread = 0.3;  // 散射角度
            angle += (Math.random() - 0.5) * spread;
        }
        
        // 计算伤害：子弹初始伤害 + 角色攻击力
        let baseDamage = weapon.damage;
        let attackPower = localPlayer.stats.attack || 0;
        let damage = baseDamage + attackPower;
        
        // 应用角色伤害加成（在暴击之前计算）
        const damageBonus = (localPlayer.stats && localPlayer.stats.damageBonus) || 0;
        if (damageBonus > 0) {
            damage = Math.ceil(damage * (1 + damageBonus));
        }
        
        // 泡泡盾伤害加成（50%）
        if (localPlayer.bubbleShieldEnd && Date.now() / 1000 < localPlayer.bubbleShieldEnd) {
            const bubbleDamageBonus = localPlayer.bubbleShieldDamageBonus || 0;
            if (bubbleDamageBonus > 0) {
                damage = Math.ceil(damage * (1 + bubbleDamageBonus));
            }
        }
        
        // 幺幺俊羊羊：计算伤害和治疗（基于攻击力）
        if (PLAYER_AVATAR.character === '幺幺俊羊羊' && weapon.canHealTeammates) {
            // 伤害：800 + 攻击力（已应用伤害加成）
            // 注意：这里不需要重新计算，因为上面已经应用了伤害加成
            // 治疗：40 + 攻击力（如果击中队友）
            const baseHealing = weapon.healingAmount;
            healing = baseHealing + attackPower;
            
            // 应用治疗加成（在暴击之前计算）
            const healingBonus = (localPlayer.stats && localPlayer.stats.healingBonus) || 0;
            if (healingBonus > 0) {
                healing = Math.ceil(healing * (1 + healingBonus));
            }
        }
        
        // 星耀犊：计算治疗量
        if (weapon.isHealing && PLAYER_AVATAR.character === '星耀犊') {
            const baseHealing = 10;
            const maxHpPercent = Math.floor(localPlayer.maxHp * 0.01);
            healing = baseHealing + maxHpPercent;
            
            // 应用治疗加成（在E技能和暴击之前计算）
            const healingBonus = (localPlayer.stats && localPlayer.stats.healingBonus) || 0;
            if (healingBonus > 0) {
                healing = Math.ceil(healing * (1 + healingBonus));
            }
            
            // E技能治疗加成（20%）
            if (localPlayer.skills.E.active && PLAYER_AVATAR.character === '星耀犊') {
                healing = Math.ceil(healing * 1.2);
            }
        } else if (!weapon.canHealTeammates || PLAYER_AVATAR.character !== '幺幺俊羊羊') {
            healing = 0;
        }
        
        // 调试日志（仅在第一次射击时输出）
        if (!window._damageDebugLogged) {
            console.log('=== 伤害计算验证 ===');
            console.log('基础伤害:', baseDamage);
            console.log('角色攻击力:', attackPower);
            console.log('总伤害:', damage);
            console.log('角色属性:', localPlayer.stats);
            window._damageDebugLogged = true;
        }
        
        // 计算暴击率：角色暴击率 + 技能暴击率
        // 注意：公主蓉和幺幺俊羊羊的被动已在服务器端计算，客户端不应重复添加
        let critRate = (localPlayer.stats && localPlayer.stats.critRate) || 0;
        
        // 验证暴击率是否正确获取
        if (critRate === 0 && localPlayer.stats && localPlayer.stats.critRate !== undefined) {
            console.warn('⚠️ 警告：暴击率为0，但localPlayer.stats.critRate存在:', localPlayer.stats.critRate);
            critRate = localPlayer.stats.critRate;
        }
        
        if (localPlayer.skills.E.active && PLAYER_AVATAR.character === '勇者') {
            critRate += 0.5;  // E技能期间额外50%暴击率
        }
        
        // 判断是否暴击
        let isCrit = false;
        const critDamage = localPlayer.stats.critDamage || 1.0;  // 暴击伤害倍率（1.0 = 100% = 双倍伤害）
        const randomValue = Math.random();
        console.log('=== 暴击计算验证 ===');
        console.log('localPlayer.stats:', localPlayer.stats);
        console.log('localPlayer.stats.critRate:', localPlayer.stats ? localPlayer.stats.critRate : 'undefined');
        console.log('计算后的暴击率:', (critRate * 100).toFixed(1) + '%');
        console.log('暴击伤害倍率:', ((1 + critDamage) * 100).toFixed(1) + '%');
        console.log('随机值:', randomValue.toFixed(4));
        
        if (randomValue < critRate) {
            const damageBeforeCrit = damage;
            if (weapon.isHealing) {
                healing = Math.ceil(healing * (1 + critDamage));
            } else {
                damage = Math.ceil(damage * (1 + critDamage));  // 使用角色暴击伤害倍率，向上取整
            }
            isCrit = true;
            console.log('✓ 触发暴击！伤害:', damageBeforeCrit, '->', damage, `(${damageBeforeCrit} * ${(1 + critDamage).toFixed(3)})`);
        } else {
            // 即使不暴击，也要确保伤害是整数（向上取整）
            damage = Math.ceil(damage);
            console.log('✗ 未触发暴击，最终伤害:', damage);
        }
        
        // 获取属性强度（E技能加成）
        let playerAttributePower = localPlayer.stats ? (localPlayer.stats.attributePower || 0) : 0;
        if (localPlayer.skills.E.active && PLAYER_AVATAR.character === '星耀犊') {
            playerAttributePower += 200;
            console.log('星耀犊E技能激活，属性强度+200:', playerAttributePower);
        }
        
        // 获取玩家属性
        let playerAttribute = '无属性';
        if (PLAYER_AVATAR.character === '星耀犊') {
            playerAttribute = '超能系';
        } else if (PLAYER_AVATAR.character === '勇者') {
            playerAttribute = '物理系';
        } else if (PLAYER_AVATAR.character === '幺幺俊羊羊') {
            playerAttribute = '物理系';
        } else if (PLAYER_AVATAR.character === '公主蓉') {
            playerAttribute = '自然系';
        } else if (PLAYER_AVATAR.character === '王子栗') {
            playerAttribute = '无属性';  // 王子栗是无属性，被动会转换
        }
        
        const bullet = {
            x: localPlayer.x,
            y: localPlayer.y,
            vx: Math.cos(angle) * weapon.bulletSpeed,
            vy: Math.sin(angle) * weapon.bulletSpeed,
            size: weapon.bulletSize,
            damage: damage,
            healing: healing,  // 治疗量（星耀犊、幺幺俊羊羊）
            owner: socket.id,
            ownerName: localPlayer.name,
            canBounce: localPlayer.skills.E.active && PLAYER_AVATAR.character === '勇者',  // E技能期间可以弹射
            bounceCount: 0,  // 弹射次数
            isCrit: isCrit,
            isHealing: weapon.isHealing || false,  // 是否为治疗子弹
            canHealTeammates: weapon.canHealTeammates || false,  // 是否可以治疗队友（公主蓉、幺幺俊羊羊）
            canKnockback: weapon.canKnockback || false,  // 是否可以击退敌人（幺幺俊羊羊）
            targetId: (PLAYER_AVATAR.character === '星耀犊' && lockedPlayerId) ? lockedPlayerId : null,  // 锁定目标
            bulletImage: weapon.bulletImage || null,  // 子弹图标
            attribute: playerAttribute,  // 玩家属性
            attributePower: playerAttributePower  // 属性强度（包含E技能加成）
        };
        
        // 王子栗火炮弹特殊属性
        if (PLAYER_AVATAR.character === '王子栗' && weapon.isCannonball) {
            bullet.isCannonball = true;
            bullet.explosionRadius = weapon.explosionRadius || 180;
            bullet.explosionDamage = weapon.explosionDamage || 500;
            bullet.bulletColor = weapon.bulletColor || '#ff0000';  // 红色弹丸
            
            // 后坐力效果：向发射相反方向飞150像素，速度提升40%
            const recoilDistance = 200;  // 后坐力距离150像素
            const baseRecoilSpeed = recoilDistance / 0.5;  // 基础速度（0.5秒完成）
            const recoilSpeed = baseRecoilSpeed * 1.4;  // 速度提升40%
            const recoilDuration = recoilDistance / recoilSpeed;  // 根据新速度计算持续时间
            const recoilAngle = angle + Math.PI;  // 相反方向
            
            // 应用后坐力速度
            localPlayer.recoilVx = Math.cos(recoilAngle) * recoilSpeed;
            localPlayer.recoilVy = Math.sin(recoilAngle) * recoilSpeed;
            localPlayer.recoilEnd = Date.now() / 1000 + recoilDuration;
        }
        
        socket.emit('player_shoot', {
            room_key: ROOM_KEY,
            bullet: bullet
        });
    }
}

// 换弹
function reload() {
    console.log('=== 换弹函数调用 ===');
    console.log('当前是否在换弹:', isReloading);
    console.log('当前弹药:', localPlayer.weapon.currentAmmo);
    console.log('最大弹药:', localPlayer.weapon.maxAmmo);
    
    if (isReloading) {
        console.log('已经在换弹中，忽略');
        return;
    }
    if (localPlayer.weapon.currentAmmo === localPlayer.weapon.maxAmmo) {
        console.log('弹药已满，无需换弹');
        return;
    }
    
    isReloading = true;
    localPlayer.weapon.reloadStartTime = Date.now() / 1000;
    document.getElementById('reloadingText').style.display = 'block';
    
    // 更新右键技能按钮状态（换弹时禁用）
    updateSkillButtons();
    
    console.log('开始换弹，将在', localPlayer.weapon.reloadTime, '秒后完成');
}

// 技能系统
function activateQSkill() {
    // 检查是否阵亡
    if (gameState.isDead || localPlayer.hp <= 0) {
        console.log('玩家已阵亡，无法使用Q技能');
        return;
    }
    
    const character = PLAYER_AVATAR.character;
    const skill = localPlayer.skills.Q;
    
    // 检查充能是否达到100%
    if (skill.charge < skill.maxCharge) {
        console.log('Q技能充能未满');
        return;
    }
    
    if (character === '勇者') {
        // 勇者Q技能：发射穿透子弹
        skill.active = true;
        // 不在激活时清空充能，在激活状态结束后才清空
        
        // 发射Q技能子弹
        const weapon = localPlayer.weapon;
        let angle = localPlayer.angle;
        
        // Q技能伤害：初始伤害 + 角色攻击力
        const qSkillBaseDamage = 3000;
        let qSkillDamage = qSkillBaseDamage + (localPlayer.stats.attack || 0);
        
        // 应用角色伤害加成（在暴击之前计算）
        const damageBonus = (localPlayer.stats && localPlayer.stats.damageBonus) || 0;
        if (damageBonus > 0) {
            qSkillDamage = Math.ceil(qSkillDamage * (1 + damageBonus));
        }
        
        // Q技能自带50%暴击率
        let isCrit = false;
        const critDamage = localPlayer.stats.critDamage || 1.0;  // 暴击伤害倍率
        if (Math.random() < 0.5) {
            qSkillDamage = Math.ceil(qSkillDamage * (1 + critDamage));  // 使用角色暴击伤害倍率
            isCrit = true;
        } else {
            // 即使不暴击，也要确保伤害是整数（向上取整）
            qSkillDamage = Math.ceil(qSkillDamage);
        }
        
        const bullet = {
            x: localPlayer.x,
            y: localPlayer.y,
            vx: Math.cos(angle) * weapon.bulletSpeed,
            vy: Math.sin(angle) * weapon.bulletSpeed,
            size: weapon.bulletSize * 2,  // 大小增加100%
            damage: qSkillDamage,
            owner: socket.id,
            ownerName: localPlayer.name,
            isQSkill: true,  // 标记为Q技能子弹
            canBounce: true,  // 可以弹射
            bounceCount: 0,  // 弹射次数
            canPenetrate: true,  // 可以穿透
            hitEnemies: [],  // 已击中的敌人ID列表（防止重复伤害）
            isCrit: isCrit  // Q技能暴击标记
        };
        
        socket.emit('player_shoot', {
            room_key: ROOM_KEY,
            bullet: bullet
        });
        
        // Q技能激活状态结束，清空充能
        skill.active = false;
        skill.charge = 0;  // 在激活状态结束后才清空充能
        
        console.log('勇者Q技能激活！发射穿透子弹');
        updateSkillButtons();
    } else if (character === '星耀犊') {
        // 星耀犊Q技能：聚合光束
        // 检查充能是否达到100%（参考勇者的实现）
        if (skill.charge < skill.maxCharge) {
            console.log('Q技能充能未满，当前充能:', skill.charge + '%');
            return;
        }
        
        // 星耀犊右键发射过程中，使用Q技能会立即停止右键发射
        if (localPlayer.skills.rightClick.active) {
            localPlayer.skills.rightClick.active = false;
            localPlayer.skills.rightClick.lastSpikeTime = 0;
            localPlayer.skills.rightClick.spikeCount = 0;
            console.log('星耀犊使用Q技能，停止右键发射');
            updateSkillButtons();
        }
        
        // 获取当前时间
        const currentTime = Date.now() / 1000;
        
        // 激活技能
        skill.active = true;
        skill.activeTime = currentTime;
        skill.activeDuration = 4.0;  // 持续4秒
        // 不在激活时清空充能，在激活状态结束后才清空
        skill.beamWidth = 35;  // 初始宽度35（非暴击）
        skill.isCrit = false;  // 是否暴击（决定光束颜色）
        skill.lastJudgmentTime = currentTime;  // 上次判定时间（每0.3秒判定一次）
        
        updateSkillButtons();
        
        // 通知服务器激活光束
        socket.emit('activate_beam', {
            room_key: ROOM_KEY,
            angle: localPlayer.angle
        });
        
        
        // 立即发送一次光束更新，确保服务器收到初始位置
        socket.emit('update_beam', {
            room_key: ROOM_KEY,
            x: localPlayer.x,
            y: localPlayer.y,
            angle: localPlayer.angle,
            beamWidth: 35,
            isCrit: false
        });
    } else if (character === '公主蓉') {
        // 公主蓉Q技能：微笑拂晓约定
        if (skill.charge < skill.maxCharge) {
            console.log('Q技能充能未满，当前充能:', skill.charge + '%');
            return;
        }
        
        // 检查右键技能是否激活（锁定期间禁用Q技能）
        if (localPlayer.skills.rightClick.active) {
            console.log('右键技能激活中，无法使用Q技能');
            return;
        }
        
        const currentTime = Date.now() / 1000;
        
        // 激活技能
        skill.active = true;
        skill.activeTime = currentTime;
        skill.activeDuration = 8.0;  // 持续8秒
        // 不在激活时清空充能，在激活状态结束后才清空
        skill.auraRadius = 200;  // 光环半径200
        skill.lastHealTime = currentTime;  // 上次治疗时间
        skill.lastDamageTime = currentTime;  // 上次伤害时间
        
        updateSkillButtons();
        
        // 通知服务器激活Q技能
        socket.emit('activate_q_skill', {
            room_key: ROOM_KEY,
            skill_type: 'princess_aura',
            x: localPlayer.x,
            y: localPlayer.y,
            radius: 400  // 800*800范围，半径400
        });
        
        console.log('🌸 公主蓉Q技能激活！微笑拂晓约定');
    } else if (character === '幺幺俊羊羊') {
        // 幺幺俊羊羊Q技能：巨大苹果
        if (skill.charge < skill.maxCharge) {
            console.log('Q技能充能未满，当前充能:', skill.charge + '%');
            return;
        }
        
        // 激活技能，显示虚影
        skill.active = true;
        skill.showingShadow = true;  // 显示虚影状态
        skill.shadowX = mousePos.x;  // 虚影位置（准星位置）
        skill.shadowY = mousePos.y;
        
        console.log('🍎 幺幺俊羊羊Q技能激活！显示巨大苹果虚影');
        updateSkillButtons();
    } else if (character === '王子栗') {
        // 王子栗Q技能：再创世
        if (skill.charge < skill.maxCharge) {
            console.log('Q技能充能未满，当前充能:', skill.charge + '%');
            return;
        }
        
        const currentTime = Date.now() / 1000;
        
        // 激活技能
        skill.active = true;
        skill.activeTime = currentTime;
        skill.shatterCount = 0;  // 碎裂特效计数
        skill.maxShatters = 5;  // 最多5个碎裂特效
        skill.shatterInterval = 0.3;  // 每0.3秒生成一个
        skill.lastShatterTime = currentTime;
        skill.shatters = [];  // 碎裂特效列表
        skill.whiteScreenStart = 0;  // 白光笼罩开始时间
        skill.damageCount = 0;  // 伤害计数
        skill.maxDamages = 5;  // 最多5次伤害
        skill.damageInterval = 0.1;  // 每次伤害间隔0.1秒
        skill.lastDamageTime = 0;
        
        // 通知服务器激活Q技能（服务器会通知所有客户端激活神人模式）
        socket.emit('activate_q_skill', {
            room_key: ROOM_KEY,
            skill_type: 'prince_recreation',
            x: localPlayer.x,
            y: localPlayer.y
        });
        
        console.log('⚡ 王子栗Q技能激活！再创世');
        updateSkillButtons();
    } else {
        // 其他角色空函数
        console.log(`${character} Q技能（未实现）`);
    }
}

function activateESkill() {
    // 检查是否阵亡
    if (gameState.isDead || localPlayer.hp <= 0) {
        console.log('玩家已阵亡，无法使用E技能');
        return;
    }
    
    const character = PLAYER_AVATAR.character;
    const skill = localPlayer.skills.E;
    
    // 检查冷却
    if (skill.cooldown > 0) {
        console.log('E技能冷却中');
        return;
    }
    
    // 检查是否已激活
    if (skill.active) {
        console.log('E技能已激活');
        return;
    }
    
    if (character === '勇者') {
        // 激活E技能
        skill.active = true;
        skill.activeTime = Date.now() / 1000;
        
        // 自动填满子弹
        localPlayer.weapon.currentAmmo = localPlayer.weapon.maxAmmo;
        updateAmmoDisplay();
        
        console.log('勇者E技能激活！持续10秒');
        updateSkillButtons();
    } else if (character === '星耀犊') {
        // 星耀犊E技能：激活后获得200点属性强度和20%治疗加成
        skill.active = true;
        skill.activeTime = Date.now() / 1000;
        skill.activeDuration = 10.0;  // 持续10秒
        skill.cooldownTime = 8.0;  // 冷却8秒
        
        // 通知服务器激活E技能
        socket.emit('activate_e_skill', {
            room_key: ROOM_KEY,
            skill_type: 'star_boost'
        });
        
        console.log('星耀犊E技能激活！持续10秒，冷却8秒');
        updateSkillButtons();
    } else if (character === '公主蓉') {
        // 公主蓉E技能：火力优化
        if (skill.cooldown > 0) {
            console.log('E技能冷却中');
            return;
        }
        
        // 检查右键技能是否激活（锁定期间禁用E技能）
        if (localPlayer.skills.rightClick.active) {
            console.log('右键技能激活中，无法使用E技能');
            return;
        }
        
        skill.active = true;
        skill.activeTime = Date.now() / 1000;
        skill.activeDuration = 8.0;  // 持续8秒
        skill.cooldownTime = 10.0;  // 冷却10秒
        
        console.log('🌸 公主蓉E技能激活！火力优化，持续8秒，冷却10秒');
        updateSkillButtons();
    } else if (character === '幺幺俊羊羊') {
        // 幺幺俊羊羊E技能：毒苹果（类似Q技能）
        if (skill.cooldown > 0) {
            console.log('E技能冷却中');
            return;
        }
        
        // 如果已经在显示虚影，取消
        if (skill.showingShadow) {
            skill.active = false;
            skill.showingShadow = false;
            console.log('🍎 幺幺俊羊羊E技能：取消毒苹果虚影');
            updateSkillButtons();
            return;
        }
        
        // 激活技能，显示虚影
        skill.active = true;
        skill.showingShadow = true;  // 显示虚影状态
        skill.shadowX = mousePos.x;  // 虚影位置（准星位置）
        skill.shadowY = mousePos.y;
        
        console.log('🍎 幺幺俊羊羊E技能激活！显示毒苹果虚影');
        updateSkillButtons();
    } else if (character === '王子栗') {
        // 王子栗E技能：重生
        // 检查是否有灵魂球
        if (!gameState.soul_balls || Object.keys(gameState.soul_balls).length === 0) {
            console.log('没有灵魂球，无法使用E技能');
            return;
        }
        
        // 找到第一个灵魂球（通常只有一个）
        const soulBallId = Object.keys(gameState.soul_balls)[0];
        const soulBall = gameState.soul_balls[soulBallId];
        
        if (!soulBall) {
            console.log('灵魂球不存在');
            return;
        }
        
        // 通知服务器复活队友
        socket.emit('revive_teammate', {
            room_key: ROOM_KEY,
            soul_ball_id: soulBallId,
            x: soulBall.x,
            y: soulBall.y
        });
        
        // 进入冷却
        skill.cooldown = 20.0;  // 20秒冷却
        skill.cooldownTime = 20.0;
        skill.cooldownStart = Date.now() / 1000;
        
        console.log('⚡ 王子栗E技能激活！复活队友');
        updateSkillButtons();
    } else {
        // 其他角色空函数
        console.log(`${character} E技能（未实现）`);
    }
}

function activateRightClickSkill() {
    // 检查是否阵亡
    if (gameState.isDead || localPlayer.hp <= 0) {
        console.log('玩家已阵亡，无法使用技能');
        return;
    }
    
    const character = PLAYER_AVATAR.character;
    const skill = localPlayer.skills.rightClick;
    
    // 检查是否在换弹
    if (isReloading) {
        console.log('换弹中，无法使用右键技能');
        return;
    }
    
    if (character === '星耀犊') {
        // 星耀犊右键技能：点击切换发射状态
        // 检查冷却
        if (skill.cooldown > 0) {
            return;
        }
        
        // 如果技能已激活，再次点击终止发射
        if (skill.active) {
            skill.active = false;
            skill.lastSpikeTime = 0;
            skill.spikeCount = 0;  // 重置计数
            updateSkillButtons();
            console.log('星耀犊右键技能：手动终止发射');
            return;
        }
        
        // 激活技能，开始自动连射
            skill.active = true;
            skill.lastSpikeTime = Date.now() / 1000;
        skill.spikeCount = 0;  // 重置计数
            updateSkillButtons();
        console.log('星耀犊右键技能：开始自动连射');
    } else if (character === '公主蓉') {
        // 公主蓉右键技能：锁定射击
        if (skill.cooldown > 0) {
            console.log('右键技能冷却中');
            return;
        }
        
        if (skill.active) {
            console.log('右键技能已激活');
            return;
        }
        
        // 激活锁定状态
        skill.active = true;
        skill.lockStartTime = Date.now() / 1000;
        skill.lockPhase = 'locking';  // 锁定阶段
        skill.lockDuration = 1.0;  // 锁定持续1秒
        skill.lockedTargets = [];  // 锁定的目标列表（将在锁定完成后填充）
        
        // 通知服务器开始锁定
        socket.emit('activate_lock_skill', {
            room_key: ROOM_KEY,
            skill_type: 'princess_lock',
            x: localPlayer.x,
            y: localPlayer.y
        });
        
        console.log('🌸 公主蓉右键技能激活！开始锁定所有目标');
        updateSkillButtons();
    } else if (character === '幺幺俊羊羊') {
        // 幺幺俊羊羊右键技能：泡泡盾（选择玩家模式）
        if (skill.cooldown > 0) {
            console.log('右键技能冷却中');
            return;
        }
        
        // 如果已经在选择模式，取消选择
        if (skill.selectingPlayer) {
            skill.selectingPlayer = false;
            skill.playerList = [];
            hidePlayerSelectionUI();
            console.log('🍎 取消选择玩家');
            updateSkillButtons();
            return;
        }
        
        // 获取所有可选择的玩家（包括自己）
        const playerList = [];
        let index = 1;
        // 先添加自己
        playerList.push({
            index: index++,
            id: socket.id,
            name: localPlayer.name || '自己'
        });
        // 再添加其他玩家
        for (let playerId in gameState.players) {
            if (playerId === socket.id) continue;
            const player = gameState.players[playerId];
            if (player.hp <= 0) continue;
            playerList.push({
                index: index++,
                id: playerId,
                name: player.name || '玩家' + index
            });
        }
        
        if (playerList.length === 0) {
            console.log('没有可选择的玩家');
            return;
        }
        
        // 进入选择模式
        skill.selectingPlayer = true;
        skill.playerList = playerList;
        showPlayerSelectionUI(playerList, '右键技能：选择要赋予泡泡盾的玩家');
        console.log('🍎 幺幺俊羊羊右键技能：进入选择玩家模式，按1-4选择');
        updateSkillButtons();
    } else if (character === '勇者') {
        // 检查是否已激活
        if (skill.active) {
            console.log('右键技能已激活');
            return;
        }
        
        // 激活快速连射
        const currentAmmo = localPlayer.weapon.currentAmmo;
        
        if (currentAmmo <= 0) {
            console.log('没有弹药，无法使用快速连射');
            return;
        }
        
        skill.active = true;
        
        // 将所有剩余子弹加入快速连射队列
        skill.rapidFireQueue = [];
        for (let i = 0; i < currentAmmo; i++) {
            skill.rapidFireQueue.push(Date.now() / 1000 + i * 0.1);
        }
        
        console.log(`快速连射激活！将发射${currentAmmo}发子弹`);
        updateSkillButtons();
    } else if (character === '王子栗') {
        // 王子栗右键技能：净灭射线
        if (skill.cooldown > 0) {
            console.log('右键技能冷却中');
            return;
        }
        
        if (skill.active) {
            console.log('右键技能已激活');
            return;
        }
        
        // 激活技能
        const currentTime = Date.now() / 1000;
        skill.active = true;
        skill.activeTime = currentTime;
        skill.activeDuration = 0.6;  // 持续0.6秒
        
        // 通知服务器激活净灭射线
        socket.emit('activate_beam', {
            room_key: ROOM_KEY,
            angle: localPlayer.angle,
            beam_type: 'prince_purification'  // 标记为王子栗的净灭射线
        });
        
        // 立即发送一次光束更新
        socket.emit('update_beam', {
            room_key: ROOM_KEY,
            x: localPlayer.x,
            y: localPlayer.y,
            angle: localPlayer.angle,
            beamWidth: 50,  // 光束宽度50
            isCrit: false,
            beam_type: 'prince_purification'
        });
        
        // 王子栗右键后坐力效果（只在释放瞬间，速度提升40%）
        const recoilDistance = 200;  // 后坐力距离150像素
        const baseRecoilSpeed = recoilDistance / 0.5;  // 基础速度（0.5秒完成）
        const recoilSpeed = baseRecoilSpeed * 1.4;  // 速度提升40%
        const recoilDuration = recoilDistance / recoilSpeed;  // 根据新速度计算持续时间
        const recoilAngle = localPlayer.angle + Math.PI;  // 相反方向
        
        localPlayer.recoilVx = Math.cos(recoilAngle) * recoilSpeed;
        localPlayer.recoilVy = Math.sin(recoilAngle) * recoilSpeed;
        localPlayer.recoilEnd = Date.now() / 1000 + recoilDuration;
        
        console.log('⚡ 王子栗右键技能激活！净灭射线');
        updateSkillButtons();
    } else {
        // 其他角色空函数
        console.log(`${character} 右键技能（未实现）`);
    }
}

// 更新技能按钮状态
function updateSkillButtons() {
    const character = PLAYER_AVATAR.character;
    const currentTime = Date.now() / 1000;
    
    // Q技能按钮
    const qBtn = document.getElementById('skillQ');
    if (qBtn) {
        const skill = localPlayer.skills.Q;
        qBtn.className = 'skill-btn skill-btn-large';
        
        if (character === '勇者') {
            if (skill.charge >= skill.maxCharge) {
                // 充能完毕，按钮变白色，显示Q
                qBtn.style.background = 'rgba(255, 255, 255, 0.9)';
                qBtn.style.color = '#000';
                qBtn.textContent = 'Q';
                // 添加闪烁效果表示充能完毕
                qBtn.style.boxShadow = '0 0 20px rgba(255, 255, 0, 0.8)';
            } else {
                // 充能中，按钮灰色，显示百分比
                qBtn.style.background = 'rgba(128, 128, 128, 0.9)';
                qBtn.style.color = '#fff';
                qBtn.textContent = Math.floor(skill.charge) + '%';
                qBtn.style.boxShadow = 'none';
            }
        } else if (character === '星耀犊') {
            if (skill.active) {
                // 激活状态，显示剩余时间
                const currentTime = Date.now() / 1000;
                const remaining = skill.activeDuration - (currentTime - skill.activeTime);
                if (remaining > 0) {
                    qBtn.style.background = 'rgba(0, 255, 255, 0.9)';  // 蓝色背景
                    qBtn.style.color = '#fff';
                    qBtn.textContent = Math.ceil(remaining);
                    qBtn.style.boxShadow = '0 0 20px rgba(0, 255, 255, 0.8)';
                } else {
                    // 激活结束
                    skill.active = false;
                    qBtn.style.background = 'rgba(128, 128, 128, 0.9)';
                    qBtn.style.color = '#fff';
                    qBtn.textContent = Math.floor(skill.charge) + '%';
                    qBtn.style.boxShadow = 'none';
                }
            } else if (skill.charge >= skill.maxCharge) {
                // 充能完毕，按钮变白色，显示Q
                qBtn.style.background = 'rgba(255, 255, 255, 0.9)';
                qBtn.style.color = '#000';
                qBtn.textContent = 'Q';
                // 添加闪烁效果表示充能完毕
                qBtn.style.boxShadow = '0 0 20px rgba(255, 255, 0, 0.8)';
            } else {
                // 充能中，按钮灰色，显示百分比
                qBtn.style.background = 'rgba(128, 128, 128, 0.9)';
                qBtn.style.color = '#fff';
                qBtn.textContent = Math.floor(skill.charge) + '%';
                qBtn.style.boxShadow = 'none';
            }
        } else if (character === '公主蓉') {
            if (skill.active) {
                // 激活状态，显示剩余时间
                const currentTime = Date.now() / 1000;
                const remaining = skill.activeDuration - (currentTime - skill.activeTime);
                if (remaining > 0) {
                    qBtn.style.background = 'rgba(255, 105, 180, 0.9)';  // 粉红色背景
                    qBtn.style.color = '#fff';
                    qBtn.textContent = Math.ceil(remaining);
                    qBtn.style.boxShadow = '0 0 20px rgba(255, 105, 180, 0.8)';
                } else {
                    // 激活结束
                    skill.active = false;
                    qBtn.style.background = 'rgba(128, 128, 128, 0.9)';
                    qBtn.style.color = '#fff';
                    qBtn.textContent = Math.floor(skill.charge) + '%';
                    qBtn.style.boxShadow = 'none';
                }
            } else if (skill.charge >= skill.maxCharge) {
                // 充能完毕，按钮变白色，显示Q
                qBtn.style.background = 'rgba(255, 255, 255, 0.9)';
                qBtn.style.color = '#000';
                qBtn.textContent = 'Q';
                // 添加闪烁效果表示充能完毕
                qBtn.style.boxShadow = '0 0 20px rgba(255, 105, 180, 0.8)';
            } else {
                // 充能中，按钮灰色，显示百分比
                qBtn.style.background = 'rgba(128, 128, 128, 0.9)';
                qBtn.style.color = '#fff';
                qBtn.textContent = Math.floor(skill.charge) + '%';
                qBtn.style.boxShadow = 'none';
            }
        } else if (character === '幺幺俊羊羊') {
            if (skill.active && skill.showingShadow) {
                // 显示虚影状态
                qBtn.style.background = 'rgba(255, 165, 0, 0.9)';  // 橙色背景
                qBtn.style.color = '#fff';
                qBtn.textContent = 'Q';
                qBtn.style.boxShadow = '0 0 20px rgba(255, 165, 0, 0.8)';
            } else if (skill.active && !skill.showingShadow) {
                // 巨大苹果倒计时状态
                const currentTime = Date.now() / 1000;
                const remaining = skill.activeDuration - (currentTime - skill.activeTime);
                if (remaining > 0) {
                    qBtn.style.background = 'rgba(255, 140, 0, 0.9)';  // 深橙色背景
                    qBtn.style.color = '#fff';
                    qBtn.textContent = Math.ceil(remaining);
                    qBtn.style.boxShadow = '0 0 20px rgba(255, 140, 0, 0.8)';
                } else {
                    // 倒计时结束
                    skill.active = false;
                    qBtn.style.background = 'rgba(128, 128, 128, 0.9)';
                    qBtn.style.color = '#fff';
                    qBtn.textContent = Math.floor(skill.charge) + '%';
                    qBtn.style.boxShadow = 'none';
                }
            } else if (skill.charge >= skill.maxCharge) {
                // 充能完毕，按钮变白色，显示Q
                qBtn.style.background = 'rgba(255, 255, 255, 0.9)';
                qBtn.style.color = '#000';
                qBtn.textContent = 'Q';
                // 添加闪烁效果表示充能完毕
                qBtn.style.boxShadow = '0 0 20px rgba(255, 165, 0, 0.8)';
            } else {
                // 充能中，按钮灰色，显示百分比
                qBtn.style.background = 'rgba(128, 128, 128, 0.9)';
                qBtn.style.color = '#fff';
                qBtn.textContent = Math.floor(skill.charge) + '%';
                qBtn.style.boxShadow = 'none';
            }
        } else if (character === '王子栗') {
            if (skill.active) {
                // 激活状态（再创世进行中）
                qBtn.style.background = 'rgba(255, 69, 0, 0.9)';  // 橙红色背景
                qBtn.style.color = '#fff';
                qBtn.textContent = 'Q';
                qBtn.style.boxShadow = '0 0 20px rgba(255, 69, 0, 0.8)';
            } else if (skill.charge >= skill.maxCharge) {
                // 充能完毕，按钮变白色，显示Q
                qBtn.style.background = 'rgba(255, 255, 255, 0.9)';
                qBtn.style.color = '#000';
                qBtn.textContent = 'Q';
                qBtn.style.boxShadow = '0 0 20px rgba(255, 69, 0, 0.8)';
            } else {
                // 充能中，按钮灰色，显示百分比
                qBtn.style.background = 'rgba(128, 128, 128, 0.9)';
                qBtn.style.color = '#fff';
                qBtn.textContent = Math.floor(skill.charge) + '%';
                qBtn.style.boxShadow = 'none';
            }
        } else {
            // 其他角色
            qBtn.textContent = 'Q';
        }
    }
    
    // E技能按钮
    const eBtn = document.getElementById('skillE');
    if (eBtn) {
        const skill = localPlayer.skills.E;
        eBtn.className = 'skill-btn skill-btn-small';
        
        if (character === '勇者') {
            if (skill.active) {
                // 激活状态
                const remaining = skill.activeDuration - (currentTime - skill.activeTime);
                if (remaining > 0) {
                    eBtn.classList.add('active');
                    eBtn.textContent = Math.ceil(remaining);
                } else {
                    // 激活结束，进入冷却
                    skill.active = false;
                    skill.cooldown = skill.cooldownTime;
                    skill.cooldownStart = currentTime;
                }
            } else if (skill.cooldown > 0) {
                // 冷却状态
                skill.cooldown = skill.cooldownTime - (currentTime - skill.cooldownStart);
                if (skill.cooldown > 0) {
                    eBtn.classList.add('cooldown');
                    eBtn.textContent = Math.ceil(skill.cooldown);
                } else {
                    // 冷却结束
                    skill.cooldown = 0;
                    eBtn.textContent = 'E';
                }
            } else {
                // 初始状态
                eBtn.textContent = 'E';
            }
        } else if (character === '星耀犊') {
            if (skill.active) {
                // 激活状态
                const remaining = skill.activeDuration - (currentTime - skill.activeTime);
                if (remaining > 0) {
                    eBtn.classList.add('active');
                    eBtn.textContent = Math.ceil(remaining);
        } else {
                    // 激活结束，进入冷却
                    skill.active = false;
                    skill.cooldown = skill.cooldownTime;
                    skill.cooldownStart = currentTime;
                }
            } else if (skill.cooldown > 0) {
                // 冷却状态
                skill.cooldown = skill.cooldownTime - (currentTime - skill.cooldownStart);
                if (skill.cooldown > 0) {
                    eBtn.classList.add('cooldown');
                    eBtn.textContent = Math.ceil(skill.cooldown);
                } else {
                    // 冷却结束
                    skill.cooldown = 0;
                    eBtn.textContent = 'E';
                }
            } else {
                // 初始状态
                eBtn.textContent = 'E';
            }
        } else if (character === '公主蓉') {
            if (skill.active) {
                // 激活状态
                const remaining = skill.activeDuration - (currentTime - skill.activeTime);
                if (remaining > 0) {
                    eBtn.classList.add('active');
                    eBtn.textContent = Math.ceil(remaining);
                } else {
                    // 激活结束，进入冷却
                    skill.active = false;
                    skill.cooldown = skill.cooldownTime;
                    skill.cooldownStart = currentTime;
                }
            } else if (skill.cooldown > 0) {
                // 冷却状态
                skill.cooldown = skill.cooldownTime - (currentTime - skill.cooldownStart);
                if (skill.cooldown > 0) {
                    eBtn.classList.add('cooldown');
                    eBtn.textContent = Math.ceil(skill.cooldown);
                } else {
                    // 冷却结束
                    skill.cooldown = 0;
                    eBtn.textContent = 'E';
                }
            } else {
                // 初始状态
                eBtn.textContent = 'E';
            }
        } else if (character === '幺幺俊羊羊') {
            if (skill.active && skill.showingShadow) {
                // 显示虚影状态
                eBtn.classList.add('active');
                eBtn.textContent = 'E';
            } else if (skill.active && !skill.showingShadow) {
                // 毒苹果倒计时状态
                const remaining = skill.activeDuration - (currentTime - skill.activeTime);
                if (remaining > 0) {
                    eBtn.classList.add('active');
                    eBtn.textContent = Math.ceil(remaining);
                } else {
                    // 倒计时结束，进入冷却
                    skill.active = false;
                    skill.cooldown = skill.cooldownTime;
                    skill.cooldownStart = currentTime;
                }
            } else if (skill.cooldown > 0) {
                // 冷却状态
                skill.cooldown = skill.cooldownTime - (currentTime - skill.cooldownStart);
                if (skill.cooldown > 0) {
                    eBtn.classList.add('cooldown');
                    eBtn.textContent = Math.ceil(skill.cooldown);
                } else {
                    // 冷却结束
                    skill.cooldown = 0;
                    eBtn.textContent = 'E';
                }
            } else {
                // 初始状态
                eBtn.textContent = 'E';
            }
        } else if (character === '王子栗') {
            // 检查是否有灵魂球
            const hasSoulBall = gameState.soul_balls && Object.keys(gameState.soul_balls).length > 0;
            
            if (skill.cooldown > 0) {
                // 冷却状态
                skill.cooldown = skill.cooldownTime - (currentTime - skill.cooldownStart);
                if (skill.cooldown > 0) {
                    eBtn.classList.add('cooldown');
                    eBtn.textContent = Math.ceil(skill.cooldown);
                } else {
                    skill.cooldown = 0;
                    eBtn.textContent = 'E';
                }
            } else if (!hasSoulBall) {
                // 没有灵魂球，按钮灰色（不可用）
                eBtn.classList.add('disabled');
                eBtn.textContent = 'E';
            } else {
                // 有灵魂球，按钮可用
                eBtn.classList.remove('disabled');
                eBtn.classList.add('active');
                eBtn.textContent = 'E';
            }
        } else {
            eBtn.textContent = 'E';
        }
    }
    
    // 右键技能按钮
    const rightClickBtn = document.getElementById('skillRightClick');
    if (rightClickBtn) {
        const skill = localPlayer.skills.rightClick;
        rightClickBtn.className = 'skill-btn skill-btn-small';
        
        if (character === '勇者') {
            if (isReloading) {
                // 换弹时禁用
                rightClickBtn.classList.add('disabled');
                rightClickBtn.textContent = '右键';
            } else if (skill.active) {
                // 激活状态
                rightClickBtn.classList.add('active');
                rightClickBtn.textContent = '右键';
            } else {
                // 初始状态
                rightClickBtn.textContent = '右键';
            }
        } else if (character === '星耀犊') {
            if (skill.cooldown > 0) {
                // 冷却状态
                rightClickBtn.classList.add('cooldown');
                rightClickBtn.textContent = Math.ceil(skill.cooldown);
            } else if (skill.active) {
                // 激活状态（正在发射尖刺）
                rightClickBtn.classList.add('active');
                rightClickBtn.textContent = '右键';
            } else {
                // 初始状态
                rightClickBtn.textContent = '右键';
            }
        } else if (character === '公主蓉') {
            if (skill.cooldown > 0) {
                // 冷却状态
                rightClickBtn.classList.add('cooldown');
                rightClickBtn.textContent = Math.ceil(skill.cooldown);
            } else if (skill.active) {
                // 激活状态（正在锁定）
                rightClickBtn.classList.add('active');
                rightClickBtn.textContent = '右键';
        } else {
                // 初始状态
            rightClickBtn.textContent = '右键';
        }
        } else if (character === '幺幺俊羊羊') {
            if (skill.cooldown > 0) {
                // 冷却状态
                skill.cooldown = skill.cooldownTime - (currentTime - skill.cooldownStart);
                if (skill.cooldown > 0) {
                    rightClickBtn.classList.add('cooldown');
                    rightClickBtn.textContent = Math.ceil(skill.cooldown);
                } else {
                    // 冷却结束
                    skill.cooldown = 0;
                    rightClickBtn.textContent = '右键';
                }
            } else {
                // 初始状态
                rightClickBtn.textContent = '右键';
            }
        } else if (character === '王子栗') {
            if (skill.cooldown > 0) {
                // 冷却状态
                skill.cooldown = skill.cooldownTime - (currentTime - skill.cooldownStart);
                if (skill.cooldown > 0) {
                    rightClickBtn.classList.add('cooldown');
                    rightClickBtn.textContent = Math.ceil(skill.cooldown);
                } else {
                    skill.cooldown = 0;
                    rightClickBtn.textContent = '右键';
                }
            } else if (skill.active) {
                // 激活状态（净灭射线）
                rightClickBtn.classList.add('active');
                rightClickBtn.textContent = '右键';
            } else {
                // 初始状态
                rightClickBtn.textContent = '右键';
            }
        } else {
            rightClickBtn.textContent = '右键';
        }
    }
}

// 更新技能状态
function updateSkills(deltaTime) {
    const character = PLAYER_AVATAR.character;
    const currentTime = Date.now() / 1000;
    
    if (character === '勇者') {
        // Q技能充能更新
        const qSkill = localPlayer.skills.Q;
        if (qSkill.charge < qSkill.maxCharge && gameState.countdown === 0) {
            // 倒计时结束后，每1秒获得1%充能
            if (qSkill.lastChargeTime === 0) {
                qSkill.lastChargeTime = currentTime;
            }
            
            const timeSinceLastCharge = currentTime - qSkill.lastChargeTime;
            if (timeSinceLastCharge >= 1.0) {
                qSkill.charge = Math.min(qSkill.maxCharge, qSkill.charge + 1);
                qSkill.lastChargeTime = currentTime;
            }
        }
        
        // E技能更新
        const eSkill = localPlayer.skills.E;
        if (eSkill.active) {
            const elapsed = currentTime - eSkill.activeTime;
            if (elapsed >= eSkill.activeDuration) {
                // 激活结束，进入冷却
                eSkill.active = false;
                eSkill.cooldown = eSkill.cooldownTime;
                eSkill.cooldownStart = currentTime;
                console.log('E技能激活结束，进入冷却');
            }
        } else if (eSkill.cooldown > 0) {
            // 更新冷却
            eSkill.cooldown = eSkill.cooldownTime - (currentTime - eSkill.cooldownStart);
            if (eSkill.cooldown <= 0) {
                eSkill.cooldown = 0;
                console.log('E技能冷却结束');
            }
        }
        
        // 右键技能更新（快速连射）
        const rightClickSkill = localPlayer.skills.rightClick;
        if (rightClickSkill.active && rightClickSkill.rapidFireQueue.length > 0) {
            // 检查队列中需要发射的子弹
            while (rightClickSkill.rapidFireQueue.length > 0 && 
                   currentTime >= rightClickSkill.rapidFireQueue[0]) {
                rightClickSkill.rapidFireQueue.shift();
                
                // 发射子弹（忽略射击间隔和弹药检查）
                if (localPlayer.weapon.currentAmmo > 0) {
                    rapidFireShoot();
                }
            }
            
            // 如果队列为空，技能结束
            if (rightClickSkill.rapidFireQueue.length === 0) {
                rightClickSkill.active = false;
                console.log('快速连射结束');
            }
        }
    } else if (character === '星耀犊') {
        // 星耀犊Q技能充能更新
        const qSkill = localPlayer.skills.Q;
        if (qSkill.charge < qSkill.maxCharge && gameState.countdown === 0 && !qSkill.active) {
            // 倒计时结束后，每1秒获得1%充能（仅在未激活时）
            if (qSkill.lastChargeTime === 0) {
                qSkill.lastChargeTime = currentTime;
            }
            
            const timeSinceLastCharge = currentTime - qSkill.lastChargeTime;
            if (timeSinceLastCharge >= 1.0) {
                qSkill.charge = Math.min(qSkill.maxCharge, qSkill.charge + 1);
                qSkill.lastChargeTime = currentTime;
            }
        }
        
        // 星耀犊Q技能激活状态更新（聚合光束）
        if (qSkill.active) {
            // 检查是否阵亡，如果阵亡则立即停止Q技能
            if (gameState.isDead || localPlayer.hp <= 0) {
                qSkill.active = false;
                // 通知服务器停止光束
                socket.emit('stop_beam', {
                    room_key: ROOM_KEY
                });
                console.log('星耀犊阵亡，停止Q技能');
                updateSkillButtons();
            } else {
            const elapsed = currentTime - qSkill.activeTime;
            if (elapsed >= qSkill.activeDuration) {
                // 激活结束，清空充能
                qSkill.active = false;
                qSkill.charge = 0;  // 在激活状态结束后才清空充能
                updateSkillButtons();
                
                // 通知服务器结束光束
                socket.emit('deactivate_beam', {
                    room_key: ROOM_KEY
                });
            } else {
                // 光束期间，每秒恢复50生命值
                if (qSkill.lastHealTime === undefined) {
                    qSkill.lastHealTime = currentTime;
                }
                const timeSinceLastHeal = currentTime - qSkill.lastHealTime;
                if (timeSinceLastHeal >= 1.0) {
                    const healAmount = 50;  // 每秒50点
                    localPlayer.hp = Math.min(localPlayer.maxHp, localPlayer.hp + healAmount);
                    qSkill.lastHealTime = currentTime;
                    updateHealthBar();
                }
                
                // 每0.3秒进行一次判定（客户端同步服务器判定结果）
                const timeSinceLastJudgment = currentTime - (qSkill.lastJudgmentTime || qSkill.activeTime);
                if (timeSinceLastJudgment >= 0.3) {
                    // 检查服务器返回的光束状态（用于同步暴击状态）
                    if (gameState.beams && gameState.beams[socket.id]) {
                        const serverBeam = gameState.beams[socket.id];
                        qSkill.isCrit = serverBeam.isCrit || false;
                        qSkill.beamWidth = qSkill.isCrit ? 45 : 35;  // 暴击45宽，非暴击35宽
                        qSkill.lastJudgmentTime = currentTime;
                    }
                }
                
                // 持续发送光束位置和角度到服务器（每帧更新）
                socket.emit('update_beam', {
                    room_key: ROOM_KEY,
                    x: localPlayer.x,
                    y: localPlayer.y,
                    angle: localPlayer.angle,
                    beamWidth: qSkill.beamWidth || 35,
                    isCrit: qSkill.isCrit || false
                });
                }
            }
        }
        
        // 星耀犊E技能更新
        const eSkill = localPlayer.skills.E;
        if (eSkill.active) {
            const elapsed = currentTime - eSkill.activeTime;
            if (elapsed >= eSkill.activeDuration) {
                // 激活结束，通知服务器并进入冷却
                eSkill.active = false;
                eSkill.cooldown = eSkill.cooldownTime;
                eSkill.cooldownStart = currentTime;
                
                // 通知服务器E技能结束
                socket.emit('deactivate_e_skill', {
                    room_key: ROOM_KEY,
                    skill_type: 'star_boost'
                });
                
                console.log('星耀犊E技能激活结束，进入冷却');
                updateSkillButtons();
            }
        } else if (eSkill.cooldown > 0) {
            // 更新冷却
            eSkill.cooldown = eSkill.cooldownTime - (currentTime - eSkill.cooldownStart);
            if (eSkill.cooldown <= 0) {
                eSkill.cooldown = 0;
                console.log('星耀犊E技能冷却结束');
                updateSkillButtons();
            }
        }
        
        // 星耀犊右键技能更新（尖刺发射）
        const rightClickSkill = localPlayer.skills.rightClick;
        
        // 检查是否阵亡，如果阵亡则立即停止右键技能
        if (gameState.isDead || localPlayer.hp <= 0) {
            if (rightClickSkill.active) {
                rightClickSkill.active = false;
                rightClickSkill.lastSpikeTime = 0;
                rightClickSkill.spikeCount = 0;
                console.log('星耀犊阵亡，停止右键技能');
                updateSkillButtons();
            }
        }
        
        // 更新冷却时间
        if (rightClickSkill.cooldown > 0) {
            rightClickSkill.cooldown = rightClickSkill.cooldownTime - (currentTime - rightClickSkill.cooldownStart);
            if (rightClickSkill.cooldown <= 0) {
                rightClickSkill.cooldown = 0;
            }
        }
        
        // 检查Q技能是否激活（星耀犊激活Q技能时禁用右键）
        const qSkillActive = localPlayer.skills.Q.active;
        
        // 如果技能激活，且不在冷却中，且Q技能未激活，且未阵亡，自动发射
        if (rightClickSkill.active && rightClickSkill.cooldown <= 0 && !qSkillActive && !gameState.isDead && localPlayer.hp > 0) {
            // 检查是否到了发射时间（0.075秒每发，不受快速射击影响）
            const spikeFireRate = 0.075;  // 0.075秒每发，固定不变
            if (currentTime - rightClickSkill.lastSpikeTime >= spikeFireRate) {
                shootSpike();
                rightClickSkill.lastSpikeTime = currentTime;
                rightClickSkill.spikeCount = (rightClickSkill.spikeCount || 0) + 1;
                
                // 注意：右键尖刺充能改为命中敌人后才充能（在服务器端处理）
                
                // 如果累计发射80枚，结束激活并进入冷却
                if (rightClickSkill.spikeCount >= 80) {
                    rightClickSkill.active = false;
                    rightClickSkill.cooldown = 3.0;  // 3秒冷却
                    rightClickSkill.cooldownTime = 3.0;
                    rightClickSkill.cooldownStart = currentTime;
                    rightClickSkill.spikeCount = 0;  // 重置计数
                    rightClickSkill.lastSpikeTime = 0;
                    console.log('星耀犊右键技能：发射80发，自动终止');
                    updateSkillButtons();
                }
            }
        } else if (rightClickSkill.active && qSkillActive) {
            // Q技能激活时，停止右键技能
            rightClickSkill.active = false;
            rightClickSkill.lastSpikeTime = 0;
            console.log('星耀犊右键技能：Q技能激活，终止发射');
        }
    } else if (character === '公主蓉') {
        // 公主蓉Q技能充能更新
        const qSkill = localPlayer.skills.Q;
        if (qSkill.charge < qSkill.maxCharge && gameState.countdown === 0 && !qSkill.active) {
            // 倒计时结束后，每秒获得5%充能
            if (qSkill.lastChargeTime === 0) {
                qSkill.lastChargeTime = currentTime;
            }
            
            const timeSinceLastCharge = currentTime - qSkill.lastChargeTime;
            if (timeSinceLastCharge >= 1.0) {
                qSkill.charge = Math.min(qSkill.maxCharge, qSkill.charge + 5);
                qSkill.lastChargeTime = currentTime;
                updateSkillButtons();
            }
        }
        
        // 公主蓉Q技能激活状态更新（微笑拂晓约定）
        if (qSkill.active) {
            const elapsed = currentTime - qSkill.activeTime;
            if (elapsed >= qSkill.activeDuration) {
                // 激活结束，清空充能
                qSkill.active = false;
                qSkill.charge = 0;  // 在激活状态结束后才清空充能
                updateSkillButtons();
                
                // 通知服务器结束Q技能
                socket.emit('deactivate_q_skill', {
                    room_key: ROOM_KEY,
                    skill_type: 'princess_aura'
                });
                
                console.log('🌸 公主蓉Q技能结束');
            } else {
                // 每秒治疗和伤害（在服务器端处理）
                // 客户端只负责显示光环效果
            }
        }
        
        // 公主蓉E技能更新
        const eSkill = localPlayer.skills.E;
        if (eSkill.active) {
            const elapsed = currentTime - eSkill.activeTime;
            if (elapsed >= eSkill.activeDuration) {
                // 激活结束，进入冷却
                eSkill.active = false;
                eSkill.cooldown = eSkill.cooldownTime;
                eSkill.cooldownStart = currentTime;
                console.log('🌸 公主蓉E技能激活结束，进入冷却');
                updateSkillButtons();
            }
        } else if (eSkill.cooldown > 0) {
            // 更新冷却
            eSkill.cooldown = eSkill.cooldownTime - (currentTime - eSkill.cooldownStart);
            if (eSkill.cooldown <= 0) {
                eSkill.cooldown = 0;
                console.log('🌸 公主蓉E技能冷却结束');
                updateSkillButtons();
            }
        }
        
        // 公主蓉右键技能更新（锁定射击）
        const rightClickSkill = localPlayer.skills.rightClick;
        if (rightClickSkill.active) {
            const elapsed = currentTime - rightClickSkill.lockStartTime;
            
            if (rightClickSkill.lockPhase === 'locking') {
                // 锁定阶段（1秒）
                if (elapsed >= rightClickSkill.lockDuration) {
                    // 锁定完成，直接发射爱心飞弹（包括敌人和队友）
                    const targets = [];
                    // 锁定所有敌人
                    if (gameState.enemies) {
                        for (let enemy of gameState.enemies) {
                            if (enemy.hp > 0) {
                                targets.push({
                                    id: enemy.id,
                                    x: enemy.x,
                                    y: enemy.y,
                                    type: 'enemy'
                                });
                            }
                        }
                    }
                    // 锁定所有队友（除了自己）
                    if (gameState.players) {
                        for (let playerId in gameState.players) {
                            if (playerId === socket.id) continue;
                            const player = gameState.players[playerId];
                            if (player.hp > 0) {
                                targets.push({
                                    id: playerId,
                                    x: player.x,
                                    y: player.y,
                                    type: 'player'
                                });
                            }
                        }
                    }
                    rightClickSkill.lockedTargets = targets;
                    
                    console.log('🌸 公主蓉锁定完成，直接发射爱心飞弹，锁定目标数:', targets.length);
                    
                    // 直接发射爱心飞弹（只调用一次，通过设置lockPhase为null防止重复调用）
                    if (rightClickSkill.lockPhase === 'locking') {
                        // 立即设置lockPhase为null，防止重复调用
                        rightClickSkill.lockPhase = null;
                        // 直接调用，不需要延迟
                        fireHeartMissiles();
                    }
                }
            }
        } else if (rightClickSkill.cooldown > 0) {
            // 更新冷却
            rightClickSkill.cooldown = rightClickSkill.cooldownTime - (currentTime - rightClickSkill.cooldownStart);
            if (rightClickSkill.cooldown <= 0) {
                rightClickSkill.cooldown = 0;
                console.log('🌸 公主蓉右键技能冷却结束');
                updateSkillButtons();
            }
        }
    } else if (character === '幺幺俊羊羊') {
        // 幺幺俊羊羊Q技能充能更新
        const qSkill = localPlayer.skills.Q;
        if (qSkill.charge < qSkill.maxCharge && gameState.countdown === 0 && !qSkill.active) {
            // 倒计时结束后，每秒获得1%充能
            if (qSkill.lastChargeTime === 0) {
                qSkill.lastChargeTime = currentTime;
            }
            
            const timeSinceLastCharge = currentTime - qSkill.lastChargeTime;
            if (timeSinceLastCharge >= 1.0) {
                qSkill.charge = Math.min(qSkill.maxCharge, qSkill.charge + 1);
                qSkill.lastChargeTime = currentTime;
                updateSkillButtons();
            }
        }
        
        // 幺幺俊羊羊Q技能虚影位置更新（跟随准星）
        if (qSkill.active && qSkill.showingShadow) {
            qSkill.shadowX = mousePos.x;
            qSkill.shadowY = mousePos.y;
        }
        
        // 幺幺俊羊羊Q技能激活状态更新（巨大苹果倒计时）
        if (qSkill.active && !qSkill.showingShadow) {
            const elapsed = currentTime - qSkill.activeTime;
            if (elapsed >= qSkill.activeDuration) {
                // 倒计时结束，技能结束
                qSkill.active = false;
                updateSkillButtons();
                console.log('🍎 幺幺俊羊羊Q技能倒计时结束');
            }
        }
        
        // 幺幺俊羊羊E技能虚影位置更新（跟随准星）
        const eSkill = localPlayer.skills.E;
        if (eSkill.active && eSkill.showingShadow) {
            eSkill.shadowX = mousePos.x;
            eSkill.shadowY = mousePos.y;
        }
        
        // 幺幺俊羊羊E技能激活状态更新（毒苹果倒计时）
        if (eSkill.active && !eSkill.showingShadow) {
            const elapsed = currentTime - eSkill.activeTime;
            if (elapsed >= eSkill.activeDuration) {
                // 倒计时结束，技能结束，进入冷却
                eSkill.active = false;
                eSkill.cooldown = eSkill.cooldownTime;
                eSkill.cooldownStart = currentTime;
                updateSkillButtons();
                console.log('🍎 幺幺俊羊羊E技能倒计时结束，进入冷却');
            }
        } else if (eSkill.cooldown > 0) {
            // 更新冷却
            eSkill.cooldown = eSkill.cooldownTime - (currentTime - eSkill.cooldownStart);
            if (eSkill.cooldown <= 0) {
                eSkill.cooldown = 0;
                updateSkillButtons();
            }
        }
        
        // 幺幺俊羊羊右键技能更新
        const rightClickSkill = localPlayer.skills.rightClick;
        if (rightClickSkill.cooldown > 0) {
            rightClickSkill.cooldown = rightClickSkill.cooldownTime - (currentTime - rightClickSkill.cooldownStart);
            if (rightClickSkill.cooldown <= 0) {
                rightClickSkill.cooldown = 0;
                updateSkillButtons();
            }
        }
    } else if (character === '王子栗') {
        // 王子栗Q技能充能更新（每秒5%，左键命中敌人+2%）
        const qSkill = localPlayer.skills.Q;
        if (qSkill.charge < qSkill.maxCharge && gameState.countdown === 0 && !qSkill.active) {
            if (qSkill.lastChargeTime === 0) {
                qSkill.lastChargeTime = currentTime;
            }
            const timeSinceLastCharge = currentTime - qSkill.lastChargeTime;
            if (timeSinceLastCharge >= 1.0) {
                qSkill.charge = Math.min(qSkill.maxCharge, qSkill.charge + 5);
                qSkill.lastChargeTime = currentTime;
                updateSkillButtons();
            }
        }
        
        // 王子栗右键技能更新（净灭射线）
        const rightClickSkill = localPlayer.skills.rightClick;
        if (rightClickSkill.active) {
            const elapsed = currentTime - rightClickSkill.activeTime;
            if (elapsed >= rightClickSkill.activeDuration) {
                // 0.6秒持续时间结束，进入冷却
                rightClickSkill.active = false;
                rightClickSkill.cooldown = 5.0;  // 5秒冷却
                rightClickSkill.cooldownTime = 5.0;
                rightClickSkill.cooldownStart = currentTime;
                
                // 通知服务器结束光束
                socket.emit('deactivate_beam', {
                    room_key: ROOM_KEY
                });
                
                console.log('⚡ 王子栗净灭射线结束，进入5秒冷却');
                updateSkillButtons();
            } else {
                // 持续发送光束位置和角度到服务器
                socket.emit('update_beam', {
                    room_key: ROOM_KEY,
                    x: localPlayer.x,
                    y: localPlayer.y,
                    angle: localPlayer.angle,
                    beamWidth: 50,
                    isCrit: false,
                    beam_type: 'prince_purification'
                });
            }
        } else if (rightClickSkill.cooldown > 0) {
            // 更新冷却
            rightClickSkill.cooldown = rightClickSkill.cooldownTime - (currentTime - rightClickSkill.cooldownStart);
            if (rightClickSkill.cooldown <= 0) {
                rightClickSkill.cooldown = 0;
                console.log('⚡ 王子栗右键技能冷却结束');
                updateSkillButtons();
            }
        }
        
        // 王子栗E技能更新
        const eSkill = localPlayer.skills.E;
        if (eSkill.cooldown > 0) {
            eSkill.cooldown = eSkill.cooldownTime - (currentTime - eSkill.cooldownStart);
            if (eSkill.cooldown <= 0) {
                eSkill.cooldown = 0;
                console.log('⚡ 王子栗E技能冷却结束');
                updateSkillButtons();
            }
        }
    }
    
    // 更新按钮显示
    updateSkillButtons();
}

// 发射尖刺（星耀犊右键技能）
function shootSpike() {
    // 检查是否阵亡
    if (gameState.isDead || localPlayer.hp <= 0) {
        return;
    }
    
    // 检查Q技能是否激活（星耀犊激活Q技能时禁用右键）
    if (PLAYER_AVATAR.character === '星耀犊' && localPlayer.skills.Q.active) {
        return;
    }
    
    const angle = localPlayer.angle;  // 朝准星方向
    const spikeSpeed = 2500;  // 速度25，加快100倍
    const spikeSize = 30;
    const baseDamage = 50;  // 伤害改为50点
    
    // 计算伤害：基础伤害 + 角色攻击力
    let damage = baseDamage + (localPlayer.stats ? (localPlayer.stats.attack || 0) : 0);
    
    // 应用角色伤害加成（在暴击之前计算）
    const damageBonus = (localPlayer.stats && localPlayer.stats.damageBonus) || 0;
    if (damageBonus > 0) {
        damage = Math.ceil(damage * (1 + damageBonus));
    }
    
    // 计算暴击率
    const critRate = localPlayer.stats ? (localPlayer.stats.critRate || 0) : 0;
    const critDamage = localPlayer.stats ? (localPlayer.stats.critDamage || 1.0) : 1.0;
    
    // 判断是否暴击
    let isCrit = false;
    if (Math.random() < critRate) {
        damage = Math.ceil(damage * (1 + critDamage));  // 向上取整
        isCrit = true;
    } else {
        // 即使不暴击，也要确保伤害是整数（向上取整）
        damage = Math.ceil(damage);
    }
    
    // 获取玩家属性（星耀犊是超能系）
    const playerAttribute = '超能系';  // 星耀犊的属性
    let playerAttributePower = localPlayer.stats ? (localPlayer.stats.attributePower || 0) : 0;
    
    // E技能属性强度加成（200点）
    if (localPlayer.skills.E.active && PLAYER_AVATAR.character === '星耀犊') {
        playerAttributePower += 200;
    }
    
    const bullet = {
        x: localPlayer.x,
        y: localPlayer.y,
        vx: Math.cos(angle) * spikeSpeed,
        vy: Math.sin(angle) * spikeSpeed,
        size: spikeSize,
        damage: damage,
        owner: socket.id,
        ownerName: localPlayer.name,
        isCrit: isCrit,
        isSpike: true,  // 标记为尖刺子弹
        bulletImage: '尖刺.png',  // 尖刺图标
        bulletSpeed: spikeSpeed,  // 保存速度
        attribute: playerAttribute,  // 玩家属性
        attributePower: playerAttributePower  // 属性强度
    };
    
    console.log('🎵 发射尖刺: 伤害=', damage, '是否暴击=', isCrit);
    
    // 注意：右键尖刺充能改为命中敌人后才充能（在服务器端处理）
    
    socket.emit('player_shoot', {
        room_key: ROOM_KEY,
        bullet: bullet
    });
}

// 快速连射射击（忽略射击间隔）
function rapidFireShoot() {
    const weapon = localPlayer.weapon;
    
    if (weapon.currentAmmo <= 0) {
        // 如果子弹为0，立即换弹
        reload();
        return;
    }
    
    weapon.currentAmmo--;
    updateAmmoDisplay();
    
    // 如果这是最后一枚子弹（发射后剩余0），立即换弹
    if (weapon.currentAmmo <= 0) {
        reload();
    }
    
    // 创建子弹
    let angle = localPlayer.angle;
    
    // 计算伤害：子弹初始伤害 + 角色攻击力，然后减少30%（右键连射伤害为左键的70%），向上取整
    let baseDamage = weapon.damage;
    let damage = Math.ceil((baseDamage + (localPlayer.stats.attack || 0)) * 0.7);  // 右键连射伤害为左键的70%，向上取整
    
    // 计算暴击率：角色暴击率 + 技能暴击率
    let critRate = localPlayer.stats.critRate || 0;
    if (localPlayer.skills.E.active && PLAYER_AVATAR.character === '勇者') {
        critRate += 0.5;  // E技能期间额外50%暴击率
    }
    
    // 判断是否暴击
    let isCrit = false;
    const critDamage = localPlayer.stats.critDamage || 1.0;  // 暴击伤害倍率（1.0 = 100% = 双倍伤害）
    if (Math.random() < critRate) {
        damage *= (1 + critDamage);  // 使用角色暴击伤害倍率
        isCrit = true;
    }
    
    const bullet = {
        x: localPlayer.x,
        y: localPlayer.y,
        vx: Math.cos(angle) * weapon.bulletSpeed,
        vy: Math.sin(angle) * weapon.bulletSpeed,
        size: weapon.bulletSize,
        damage: damage,
        owner: socket.id,
        ownerName: localPlayer.name,
        isRapidFire: true,  // 标记为快速连射
        canBounce: localPlayer.skills.E.active && PLAYER_AVATAR.character === '勇者',  // E技能期间可以弹射
        bounceCount: 0,  // 弹射次数
        isCrit: isCrit
    };
    
    socket.emit('player_shoot', {
        room_key: ROOM_KEY,
        bullet: bullet
    });
}

// 更新子弹
function updateBullets(deltaTime) {
    // 子弹只伤害敌人，不伤害玩家
    // 碰撞检测由服务器处理
    // 客户端只负责显示，弹射逻辑由服务器处理
    for (let i = gameState.bullets.length - 1; i >= 0; i--) {
        const bullet = gameState.bullets[i];
        
        bullet.x += bullet.vx * deltaTime;
        bullet.y += bullet.vy * deltaTime;
        
        // 检查是否超出边界（客户端只做显示，实际弹射由服务器处理）
        // 这里不移除子弹，让服务器处理弹射逻辑
    }
}

// 渲染
function render() {
    // 检查是否需要应用白光抖动效果（在整个渲染过程中应用）
    let screenShakeOffsetX = 0;
    let screenShakeOffsetY = 0;
    if (gameState.white_overlay) {
        const currentTime = Date.now() / 1000;
        const elapsed = currentTime - gameState.white_overlay.startTime;
        const fadeInDuration = gameState.white_overlay.fadeInDuration || 1.0;  // 使用配置的淡入持续时间（1秒）
        
        // 在白光出现过程中（fadeInDuration期间）应用激烈抖动
        if (elapsed < fadeInDuration) {
            const shakeIntensity = 20;  // 抖动强度20像素（激烈抖动）
            screenShakeOffsetX = (Math.random() - 0.5) * shakeIntensity;
            screenShakeOffsetY = (Math.random() - 0.5) * shakeIntensity;
        }
    }
    
    ctx.save();
    ctx.translate(screenShakeOffsetX, screenShakeOffsetY);
    
    // 清空画布
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(-screenShakeOffsetX, -screenShakeOffsetY, canvas.width, canvas.height);
    
    // 绘制背景图片（如果加载成功）
    if (backgroundImage.complete && backgroundImage.naturalWidth > 0) {
        ctx.drawImage(backgroundImage, -screenShakeOffsetX, -screenShakeOffsetY, canvas.width, canvas.height);
    }
    
    // 绘制敌人
    for (let enemy of gameState.enemies) {
        drawEnemy(enemy);
    }
    
    // 绘制其他玩家（排除本地玩家，且生命值大于0）
    for (let playerId in gameState.players) {
        // 跳过本地玩家，避免重复绘制
        if (playerId === socket.id) {
            continue;
        }
        const player = gameState.players[playerId];
        // 只绘制生命值大于0的玩家
        if (player.hp > 0) {
            // 检查是否是王子栗且处于神人模式
            const isDivineMode = player.avatar && 
                                player.avatar.character === '王子栗' && 
                                gameState.divine_mode && 
                                gameState.divine_mode.playerId === playerId;
            
            if (!isDivineMode) {
                // 正常绘制
                drawPlayer(player, false, playerId);
            } else {
                // 神人模式：先绘制白色光芒变身特效，然后绘制神人模式图标
                drawPrinceTransformEffectForOtherPlayer(player, playerId);
                drawDivineModeForOtherPlayer(player, playerId);
            }
            
            // 绘制锁定框（星耀犊锁定队友时）
            if (PLAYER_AVATAR.character === '星耀犊' && lockedPlayerId === playerId && lockedPlayer) {
                drawLockBox(player);
            }
        }
    }
    
    // 绘制本地玩家（如果未死亡且生命值大于0）
    if (!gameState.isDead && localPlayer.hp > 0) {
        // 检查是否是王子栗且处于神人模式
        const isDivineMode = PLAYER_AVATAR.character === '王子栗' && 
                            gameState.divine_mode && 
                            gameState.divine_mode.playerId === socket.id;
        
        if (!isDivineMode) {
            // 正常绘制王子栗或其他角色
            drawPlayer(localPlayer, true, socket.id);
        } else {
            // 神人模式：先绘制白色光芒变身特效，然后绘制神人模式图标
            drawPrinceTransformEffect(localPlayer);
            drawDivineMode(localPlayer);
        }
        
        // 绘制蓄力进度条（星耀犊蓄力时）
        if (PLAYER_AVATAR.character === '星耀犊' && isCharging && localPlayer.weapon && localPlayer.weapon.canCharge) {
            drawChargeBar(localPlayer);
        }
    }
    
    // 绘制子弹
    for (let bullet of gameState.bullets) {
        drawBullet(bullet);
    }
    
    // 绘制光束（星耀犊Q技能）- 在玩家和敌人之后绘制，确保在最上层
    if (gameState.beams) {
        for (let playerId in gameState.beams) {
            const beam = gameState.beams[playerId];
            if (beam && beam.x !== undefined && beam.y !== undefined && beam.angle !== undefined) {
                drawBeam(beam);
            }
        }
    }
    
    // 绘制公主蓉Q技能光环（只绘制公主蓉的Q技能，不绘制王子栗的Q技能）
    if (gameState.q_skills) {
        for (let playerId in gameState.q_skills) {
            const qSkill = gameState.q_skills[playerId];
            // 检查是否是公主蓉的Q技能（有x、y坐标和duration，没有shatter_count）
            if (qSkill && qSkill.x !== undefined && qSkill.y !== undefined && qSkill.duration !== undefined && qSkill.shatter_count === undefined) {
                drawPrincessAura(qSkill);
            }
        }
    }
    
    // 绘制公主蓉右键锁定框
    if (gameState.lock_skills) {
        for (let playerId in gameState.lock_skills) {
            const lockSkill = gameState.lock_skills[playerId];
            drawLockBoxes(lockSkill);
        }
    }
    
    // 绘制幺幺俊羊羊Q技能虚影
    if (PLAYER_AVATAR.character === '幺幺俊羊羊' && 
        localPlayer.skills.Q.active && 
        localPlayer.skills.Q.showingShadow) {
        drawAppleShadow();
    }
    
    // 绘制幺幺俊羊羊E技能虚影（毒苹果）
    if (PLAYER_AVATAR.character === '幺幺俊羊羊' && 
        localPlayer.skills.E.active && 
        localPlayer.skills.E.showingShadow) {
        drawPoisonAppleShadow();
    }
    
    // 绘制巨大苹果
    if (gameState.big_apples) {
        for (let appleId in gameState.big_apples) {
            const apple = gameState.big_apples[appleId];
            drawBigApple(apple);
        }
    }
    
    // 绘制毒苹果
    if (gameState.poison_apples) {
        for (let appleId in gameState.poison_apples) {
            const apple = gameState.poison_apples[appleId];
            drawPoisonApple(apple);
        }
    }
    
    // 绘制爆炸特效
    if (gameState.explosions) {
        for (let explosionId in gameState.explosions) {
            drawExplosion(gameState.explosions[explosionId]);
        }
    }
    
    // 绘制灵魂球（王子栗E技能）
    if (gameState.soul_balls) {
        for (let soulBallId in gameState.soul_balls) {
            drawSoulBall(gameState.soul_balls[soulBallId]);
        }
    }
    
    // 绘制碎裂特效（王子栗Q技能）
    if (gameState.shatter_effects) {
        for (let shatterId in gameState.shatter_effects) {
            drawShatterEffect(gameState.shatter_effects[shatterId], gameState.white_overlay);
        }
    }
    
    // 绘制白光笼罩（王子栗Q技能）- 覆盖所有内容，但伤害数字在其之上
    if (gameState.white_overlay) {
        drawWhiteOverlay(gameState.white_overlay);
    }
    
    // 绘制神人剪影（在白光之后绘制，确保不被白光遮挡）
    if (gameState.divine_mode) {
        drawDivineShadow();
    }
    
    // 绘制伤害数字（在白光之后绘制，确保显示在最上层）
    updateAndDrawDamageNumbers();
    
    // 绘制治疗数字（在白光之后绘制，确保显示在最上层）
    updateAndDrawHealingNumbers();
    
    // 绘制队友阵亡提醒（王子栗E技能）
    if (PLAYER_AVATAR.character === '王子栗' && gameState.soul_balls && Object.keys(gameState.soul_balls).length > 0) {
        drawRevivePrompt();
    }
    
    // 绘制倒计时
    if (gameState.countdown > 0) {
        drawCountdown();
    }
    
    ctx.restore();  // 恢复画布变换（移除抖动偏移）
}

// 绘制公主蓉Q技能光环（微笑拂晓约定）
function drawPrincessAura(qSkill) {
    if (!qSkill) return;
    
    const currentTime = Date.now() / 1000;
    const elapsed = currentTime - qSkill.start_time;
    const remaining = qSkill.duration - elapsed;
    
    if (remaining <= 0) return;
    
    // 检查坐标和半径是否有效
    const x = qSkill.x || 0;
    const y = qSkill.y || 0;
    const radius = qSkill.radius || 400;  // 800*800范围，半径400
    
    // 确保所有值都是有限数字
    if (!isFinite(x) || !isFinite(y) || !isFinite(radius) || !isFinite(qSkill.start_time) || !isFinite(qSkill.duration)) {
        console.warn('⚠️ 公主蓉Q技能数据无效:', qSkill);
        return;
    }
    
    const alpha = Math.min(1.0, remaining / qSkill.duration);
    
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;  // 稍微提高透明度，使粉色更明显
    
    // 绘制圆形光环（粉红色填充）
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(255, 182, 193, 0.6)');  // 浅粉红色中心
    gradient.addColorStop(0.5, 'rgba(255, 105, 180, 0.5)');  // 粉红色中间
    gradient.addColorStop(1, 'rgba(255, 20, 147, 0.3)');  // 深粉红色边缘
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // 绘制光环边框（粉色）
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = '#ff69b4';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();
}

// 绘制灵魂球（王子栗E技能）
function drawSoulBall(soulBall) {
    if (!soulBall) return;
    
    const x = soulBall.x;
    const y = soulBall.y;
    const radius = 30;  // 灵魂球半径30像素
    
    ctx.save();
    
    // 绘制黄色灵魂球（带光晕效果）
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 0, 1.0)');  // 中心黄色
    gradient.addColorStop(0.5, 'rgba(255, 255, 0, 0.8)');  // 中间黄色
    gradient.addColorStop(1, 'rgba(255, 255, 0, 0.3)');  // 边缘半透明
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // 绘制外圈光晕
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
    
    // 绘制闪烁效果
    const currentTime = Date.now() / 1000;
    const flashAlpha = (Math.sin(currentTime * 3) + 1) / 2 * 0.5 + 0.5;  // 0.5到1之间闪烁
    ctx.globalAlpha = flashAlpha;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

// 碎裂图片缓存
let shatterImage = null;

// 加载碎裂图片
function loadShatterImage() {
    if (!shatterImage) {
        shatterImage = new Image();
        shatterImage.src = '/static/碎裂.png';
        shatterImage.onload = function() {
            console.log('✓ 碎裂图片加载成功');
        };
        shatterImage.onerror = function() {
            console.warn('⚠️ 碎裂图片加载失败');
        };
    }
    return shatterImage;
}

// 绘制碎裂特效（王子栗Q技能）
function drawShatterEffect(shatter, whiteOverlay) {
    if (!shatter) return;
    
    const x = shatter.x;
    const y = shatter.y;
    const size = shatter.size || 200;
    
    ctx.save();
    
    // 计算碎片特效的透明度（与白色界面同步淡出）
    let alpha = 1.0;
    if (whiteOverlay && whiteOverlay.phase === 'fade_out' && whiteOverlay.fadeOutStartTime) {
        const currentTime = Date.now() / 1000;
        const fadeOutElapsed = currentTime - whiteOverlay.fadeOutStartTime;
        if (fadeOutElapsed >= 0 && fadeOutElapsed < whiteOverlay.fadeOutDuration) {
            // 与白色界面一起淡出
            alpha = Math.max(0.0, 1.0 - (fadeOutElapsed / whiteOverlay.fadeOutDuration));
        } else if (fadeOutElapsed >= whiteOverlay.fadeOutDuration) {
            // 淡出完成，不绘制
            ctx.restore();
            return;
        }
    }
    
    ctx.globalAlpha = alpha;
    
    // 尝试使用碎裂.png图片
    const img = loadShatterImage();
    if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
        console.log(`绘制碎裂特效: ${shatter.id}, 位置: (${x}, ${y}), 大小: ${size}, 透明度: ${alpha}`);
    } else {
        // 图片未加载，使用默认绘制（白色裂纹效果）
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * alpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        // 绘制裂纹效果
        for (let i = 0; i < 5; i++) {
            const angle = (Math.PI * 2 / 5) * i;
            const startX = x + Math.cos(angle) * size * 0.2;
            const startY = y + Math.sin(angle) * size * 0.2;
            const endX = x + Math.cos(angle) * size * 0.5;
            const endY = y + Math.sin(angle) * size * 0.5;
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
        }
        ctx.stroke();
        console.log(`绘制碎裂特效（默认）: ${shatter.id}, 位置: (${x}, ${y}), 大小: ${size}, 透明度: ${alpha}`);
    }
    
    ctx.restore();
}

// 绘制王子栗变身特效（白色光芒）
function drawPrinceTransformEffect(player) {
    if (!gameState.divine_mode || gameState.divine_mode.playerId !== socket.id) {
        return;
    }
    
    const currentTime = Date.now() / 1000;
    const divineMode = gameState.divine_mode;
    const transformElapsed = currentTime - divineMode.startTime;
    const transformDuration = 0.5;  // 变身持续时间0.5秒
    
    // 只在变身阶段（0.5秒内）绘制白色光芒
    if (transformElapsed >= transformDuration) {
        return;
    }
    
    const playerSize = 100;
    const halfSize = playerSize / 2;
    
    ctx.save();
    ctx.translate(divineMode.x, divineMode.y);
    
    // 白色光芒效果：逐渐增强然后减弱
    const progress = transformElapsed / transformDuration;  // 0到1
    const glowIntensity = Math.sin(progress * Math.PI);  // 使用sin函数实现先增强后减弱
    const glowSize = halfSize * (1.0 + glowIntensity * 2.0);  // 光芒大小从1倍到3倍
    const glowAlpha = glowIntensity * 0.8;  // 透明度最高0.8
    
    // 多层白色光晕效果
    for (let i = 0; i < 3; i++) {
        const layerSize = glowSize * (1.0 + i * 0.3);
        const layerAlpha = glowAlpha * (0.9 - i * 0.2);
        
        // 外发光
        ctx.shadowBlur = 30 + i * 20;
        ctx.shadowColor = `rgba(255, 255, 255, ${layerAlpha})`;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // 绘制光晕层
        ctx.globalAlpha = layerAlpha;
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, layerSize);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${layerAlpha})`);
        gradient.addColorStop(0.5, `rgba(255, 255, 255, ${layerAlpha * 0.7})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, layerSize, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.shadowBlur = 0;  // 重置阴影
    ctx.globalAlpha = 1.0;  // 重置透明度
    ctx.restore();
}

// 绘制其他玩家的王子栗变身特效（白色光芒）
function drawPrinceTransformEffectForOtherPlayer(player, playerId) {
    if (!gameState.divine_mode || gameState.divine_mode.playerId !== playerId) {
        return;
    }
    
    const currentTime = Date.now() / 1000;
    const divineMode = gameState.divine_mode;
    const transformElapsed = currentTime - divineMode.startTime;
    const transformDuration = 0.5;  // 变身持续时间0.5秒
    
    // 只在变身阶段（0.5秒内）绘制白色光芒
    if (transformElapsed >= transformDuration) {
        return;
    }
    
    const playerSize = 100;
    const halfSize = playerSize / 2;
    
    ctx.save();
    ctx.translate(divineMode.x, divineMode.y);
    
    // 白色光芒效果：逐渐增强然后减弱
    const progress = transformElapsed / transformDuration;  // 0到1
    const glowIntensity = Math.sin(progress * Math.PI);  // 使用sin函数实现先增强后减弱
    const glowSize = halfSize * (1.0 + glowIntensity * 2.0);  // 光芒大小从1倍到3倍
    const glowAlpha = glowIntensity * 0.8;  // 透明度最高0.8
    
    // 多层白色光晕效果
    for (let i = 0; i < 3; i++) {
        const layerSize = glowSize * (1.0 + i * 0.3);
        const layerAlpha = glowAlpha * (0.9 - i * 0.2);
        
        // 外发光
        ctx.shadowBlur = 30 + i * 20;
        ctx.shadowColor = `rgba(255, 255, 255, ${layerAlpha})`;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // 绘制光晕层
        ctx.globalAlpha = layerAlpha;
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, layerSize);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${layerAlpha})`);
        gradient.addColorStop(0.5, `rgba(255, 255, 255, ${layerAlpha * 0.7})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, layerSize, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.shadowBlur = 0;  // 重置阴影
    ctx.globalAlpha = 1.0;  // 重置透明度
    ctx.restore();
}

// 绘制神人模式（王子栗Q技能）
function drawDivineMode(player) {
    if (!gameState.divine_mode || gameState.divine_mode.playerId !== socket.id) {
        return;
    }
    
    const currentTime = Date.now() / 1000;
    const divineMode = gameState.divine_mode;
    const playerSize = 100;  // 正常角色大小
    const divineSize = playerSize * 1.5;  // 神人模式大小（大50%）
    const halfDivineSize = divineSize / 2;
    
    // 获取神人模式图标
    const divineImg = loadDivineModeImage();
    
    // 判断角色朝向：本地玩家通过鼠标位置判断
    // mousePos.x < player.x 表示面朝左侧
    const isFacingLeft = mousePos.x < player.x;
    // 面朝右侧时在左侧50像素，面朝左侧时在右侧50像素，都向上30像素
    const offsetX = isFacingLeft ? 50 : -50;
    const offsetY = -30;  // 向上30像素
    
    ctx.save();
    ctx.translate(divineMode.x + offsetX, divineMode.y + offsetY);
    
    // 面朝左侧时镜像翻转
    if (isFacingLeft) {
        ctx.scale(-1, 1);
    }
    
    // 计算神人模式图标的透明度（变身特效：0.5秒内逐渐出现）
    const transformElapsed = currentTime - divineMode.startTime;
    const transformDuration = 0.5;  // 变身持续时间0.5秒
    let divineAlpha = 0;
    
    if (transformElapsed < transformDuration) {
        // 变身阶段：0.5秒内逐渐出现
        divineAlpha = Math.min(1.0, transformElapsed / transformDuration);
    } else {
        // 变身完成，完全显示
        divineAlpha = 1.0;
    }
    
    // 检查是否在白光定格结束后（立即移除）
    if (gameState.white_overlay && gameState.white_overlay.playerId === socket.id) {
        const overlay = gameState.white_overlay;
        const elapsed = currentTime - overlay.startTime;
        const freezeEndTime = overlay.fadeInDuration + overlay.freezeDuration;
        
        // 在白光定格结束后立即移除（不逐渐过渡）
        if (elapsed >= freezeEndTime && overlay.phase === 'fade_out') {
            divineAlpha = 0;
        }
    }
    
    // 绘制神人模式图标
    if (divineImg && divineImg.complete && divineImg.naturalWidth > 0 && divineAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = divineAlpha;
        ctx.drawImage(divineImg, -halfDivineSize, -halfDivineSize, divineSize, divineSize);
        ctx.restore();
    }
    
    ctx.restore();
}

// 绘制其他玩家的神人模式（王子栗Q技能）
function drawDivineModeForOtherPlayer(player, playerId) {
    if (!gameState.divine_mode || gameState.divine_mode.playerId !== playerId) {
        return;
    }
    
    const currentTime = Date.now() / 1000;
    const divineMode = gameState.divine_mode;
    const playerSize = 100;  // 正常角色大小
    const divineSize = playerSize * 1.5;  // 神人模式大小（大50%）
    const halfDivineSize = divineSize / 2;
    
    // 获取神人模式图标
    const divineImg = loadDivineModeImage();
    
    // 判断角色朝向：其他玩家通过angle判断
    // Math.abs(angle) > Math.PI / 2 表示面朝左侧
    const isFacingLeft = Math.abs(player.angle) > Math.PI / 2;
    // 面朝右侧时在左侧50像素，面朝左侧时在右侧50像素，都向上30像素
    const offsetX = isFacingLeft ? 50 : -50;
    const offsetY = -30;  // 向上30像素
    
    ctx.save();
    ctx.translate(divineMode.x + offsetX, divineMode.y + offsetY);
    
    // 面朝左侧时镜像翻转
    if (isFacingLeft) {
        ctx.scale(-1, 1);
    }
    
    // 计算神人模式图标的透明度（变身特效：0.5秒内逐渐出现）
    const transformElapsed = currentTime - divineMode.startTime;
    const transformDuration = 0.5;  // 变身持续时间0.5秒
    let divineAlpha = 0;
    
    if (transformElapsed < transformDuration) {
        // 变身阶段：0.5秒内逐渐出现
        divineAlpha = Math.min(1.0, transformElapsed / transformDuration);
    } else {
        // 变身完成，完全显示
        divineAlpha = 1.0;
    }
    
    // 检查是否在白光定格结束后（立即移除）
    if (gameState.white_overlay && gameState.white_overlay.playerId === playerId) {
        const overlay = gameState.white_overlay;
        const elapsed = currentTime - overlay.startTime;
        const freezeEndTime = overlay.fadeInDuration + overlay.freezeDuration;
        
        // 在白光定格结束后立即移除（不逐渐过渡）
        if (elapsed >= freezeEndTime && overlay.phase === 'fade_out') {
            divineAlpha = 0;
        }
    }
    
    // 绘制神人模式图标
    if (divineImg && divineImg.complete && divineImg.naturalWidth > 0 && divineAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = divineAlpha;
        ctx.drawImage(divineImg, -halfDivineSize, -halfDivineSize, divineSize, divineSize);
        ctx.restore();
    }
    
    ctx.restore();
}

// 绘制神人剪影（在白光之后绘制，确保不被白光遮挡）
function drawDivineShadow() {
    if (!gameState.divine_mode) {
        return;
    }
    
    const currentTime = Date.now() / 1000;
    const divineMode = gameState.divine_mode;
    const playerSize = 100;  // 正常角色大小
    const divineSize = playerSize * 1.5;  // 神人模式大小（大50%）
    const halfDivineSize = divineSize / 2;
    
    // 获取神人剪影图标
    const shadowImg = loadDivineShadowImage();
    
    // 检查对应的白光状态
    const overlay = gameState.white_overlay;
    if (!overlay || overlay.playerId !== divineMode.playerId) {
        return;
    }
    
    // 判断角色朝向
    let isFacingLeft = false;
    if (divineMode.playerId === socket.id) {
        // 本地玩家：通过鼠标位置判断
        const player = localPlayer;
        isFacingLeft = mousePos.x < player.x;
    } else {
        // 其他玩家：通过angle判断
        const player = gameState.players[divineMode.playerId];
        if (player) {
            isFacingLeft = Math.abs(player.angle) > Math.PI / 2;
        }
    }
    // 面朝右侧时在左侧50像素，面朝左侧时在右侧50像素，都向上30像素
    const offsetX = isFacingLeft ? 50 : -50;
    const offsetY = -30;  // 向上30像素
    
    const elapsed = currentTime - overlay.startTime;
    const fadeInDuration = overlay.fadeInDuration || 1.0;
    const freezeDuration = overlay.freezeDuration || 0.25;
    const freezeEndTime = fadeInDuration + freezeDuration;
    
    // 计算神人剪影的透明度
    let shadowAlpha = 0;
    
    // 阶段1：白光淡入（1秒），神人剪影逐渐显现
    if (overlay.phase === 'fade_in' && elapsed < fadeInDuration) {
        shadowAlpha = Math.min(1.0, elapsed / fadeInDuration);
    }
    // 阶段2：定格（0.25秒），神人剪影完全显现
    else if (overlay.phase === 'fade_in' && elapsed >= fadeInDuration && 
             elapsed < freezeEndTime) {
        shadowAlpha = 1.0;
    }
    // 阶段3：定格结束后立即移除（不逐渐过渡）
    else if (elapsed >= freezeEndTime) {
        shadowAlpha = 0;
    }
    // 如果还在定格阶段但phase还没更新
    else if (overlay.phase === 'fade_in' && elapsed >= fadeInDuration) {
        shadowAlpha = 1.0;
    }
    
    // 在白光定格结束后立即移除，不绘制
    if (shadowAlpha <= 0) {
        return;
    }
    
    ctx.save();
    // 神人剪影位置根据角色朝向调整
    ctx.translate(divineMode.x + offsetX, divineMode.y + offsetY);
    
    // 面朝左侧时镜像翻转
    if (isFacingLeft) {
        ctx.scale(-1, 1);
    }
    
    ctx.globalAlpha = shadowAlpha;
    
    // 绘制神人剪影
    if (shadowImg && shadowImg.complete && shadowImg.naturalWidth > 0) {
        ctx.drawImage(shadowImg, -halfDivineSize, -halfDivineSize, divineSize, divineSize);
    }
    
    ctx.restore();
}

// 加载神人模式图标
function loadDivineModeImage() {
    if (!loadDivineModeImage.img) {
        loadDivineModeImage.img = new Image();
        loadDivineModeImage.img.src = '/static/神人模式.png';
    }
    return loadDivineModeImage.img;
}

// 加载神人剪影图标
function loadDivineShadowImage() {
    if (!loadDivineShadowImage.img) {
        loadDivineShadowImage.img = new Image();
        loadDivineShadowImage.img.src = '/static/神人剪影.png';
    }
    return loadDivineShadowImage.img;
}

// 绘制白光笼罩（王子栗Q技能）
function drawWhiteOverlay(overlay) {
    if (!overlay) return;
    
    const currentTime = Date.now() / 1000;
    const elapsed = currentTime - overlay.startTime;
    let alpha = 0;
    
    // 阶段1：淡入（1秒）
    if (overlay.phase === 'fade_in' && elapsed < overlay.fadeInDuration) {
        alpha = Math.min(1.0, elapsed / overlay.fadeInDuration);
    }
    // 阶段2：定格（0.25秒）- 完全白色
    else if (overlay.phase === 'fade_in' && elapsed >= overlay.fadeInDuration && 
             elapsed < overlay.fadeInDuration + overlay.freezeDuration) {
        alpha = 1.0;
    }
    // 阶段3：淡出（1.5秒）
    else if (overlay.phase === 'fade_out' && overlay.fadeOutStartTime) {
        const fadeOutElapsed = currentTime - overlay.fadeOutStartTime;
        if (fadeOutElapsed >= 0 && fadeOutElapsed < overlay.fadeOutDuration) {
            alpha = Math.max(0.0, 1.0 - (fadeOutElapsed / overlay.fadeOutDuration));
        } else if (fadeOutElapsed >= overlay.fadeOutDuration) {
            // 淡出完成，移除覆盖层
            gameState.white_overlay = null;
            return;
        } else {
            // 淡出还未开始，保持完全白色
            alpha = 1.0;
        }
    }
    // 如果还在定格阶段但phase还没更新
    else if (overlay.phase === 'fade_in' && elapsed >= overlay.fadeInDuration) {
        alpha = 1.0;
    }
    
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}

// 绘制队友阵亡提醒（王子栗E技能）
function drawRevivePrompt() {
    const currentTime = Date.now() / 1000;
    const soulBalls = gameState.soul_balls;
    if (!soulBalls || Object.keys(soulBalls).length === 0) {
        return;
    }
    
    // 找到第一个灵魂球
    const soulBallId = Object.keys(soulBalls)[0];
    const soulBall = soulBalls[soulBallId];
    if (!soulBall) {
        return;
    }
    
    // 计算闪烁效果
    const flashAlpha = (Math.sin(currentTime * 2) + 1) / 2 * 0.5 + 0.5;  // 0.5到1之间闪烁
    
    ctx.save();
    ctx.globalAlpha = flashAlpha;
    
    // 绘制背景框
    const text = `队友 ${soulBall.deadPlayerName || '未知'} 已阵亡，按E键复活`;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = 30;
    const padding = 20;
    const boxX = canvas.width / 2;
    const boxY = 100;  // 距离顶部100像素
    
    // 绘制半透明背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(boxX - textWidth / 2 - padding, boxY - textHeight / 2 - padding, textWidth + padding * 2, textHeight + padding * 2);
    
    // 绘制边框
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(boxX - textWidth / 2 - padding, boxY - textHeight / 2 - padding, textWidth + padding * 2, textHeight + padding * 2);
    
    // 绘制文字
    ctx.fillStyle = '#ffff00';
    ctx.fillText(text, boxX, boxY);
    
    ctx.restore();
}

// 锁定框图片缓存（公主蓉）
let princessLockBoxImage = null;

// 加载公主蓉锁定框图片
function loadPrincessLockBoxImage() {
    if (!princessLockBoxImage) {
        princessLockBoxImage = new Image();
        princessLockBoxImage.src = '/static/公主蓉锁定框.png';
        princessLockBoxImage.onload = function() {
            console.log('✓ 公主蓉锁定框图片加载成功');
        };
        princessLockBoxImage.onerror = function() {
            console.warn('⚠️ 公主蓉锁定框图片加载失败');
        };
    }
    return princessLockBoxImage;
}

// 苹果图片缓存
let appleImage = null;

// 加载苹果图片
function loadAppleImage() {
    if (!appleImage) {
        appleImage = new Image();
        appleImage.src = '/static/苹果.png';
        appleImage.onload = function() {
            console.log('✓ 苹果图片加载成功');
        };
        appleImage.onerror = function() {
            console.warn('⚠️ 苹果图片加载失败');
        };
    }
    return appleImage;
}

// 绘制幺幺俊羊羊Q技能虚影
function drawAppleShadow() {
    const skill = localPlayer.skills.Q;
    if (!skill.showingShadow) return;
    
    const img = loadAppleImage();
    const size = 200;  // 200*200大小
    const halfSize = size / 2;
    
    ctx.save();
    ctx.globalAlpha = 0.5;  // 半透明
    
    if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, skill.shadowX - halfSize, skill.shadowY - halfSize, size, size);
    } else {
        // 图片未加载，使用默认绘制（红色圆形）
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.arc(skill.shadowX, skill.shadowY, halfSize, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // 绘制提示文字
    ctx.globalAlpha = 1.0;
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText('左键生成，右键取消', skill.shadowX, skill.shadowY + halfSize + 30);
    ctx.fillText('左键生成，右键取消', skill.shadowX, skill.shadowY + halfSize + 30);
    
    ctx.restore();
}

// 绘制巨大苹果
function drawBigApple(apple) {
    const img = loadAppleImage();
    const size = 200;  // 200*200大小
    const halfSize = size / 2;
    
    ctx.save();
    
    if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, apple.x - halfSize, apple.y - halfSize, size, size);
    } else {
        // 图片未加载，使用默认绘制（红色圆形）
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(apple.x, apple.y, halfSize, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

// 加载毒苹果图片
let poisonAppleImage = null;
function loadPoisonAppleImage() {
    if (!poisonAppleImage) {
        poisonAppleImage = new Image();
        poisonAppleImage.src = '/static/毒苹果.png';
        poisonAppleImage.onload = function() {
            console.log('✓ 毒苹果图片加载成功');
        };
        poisonAppleImage.onerror = function() {
            console.warn('⚠️ 毒苹果图片加载失败');
        };
    }
    return poisonAppleImage;
}

// 绘制幺幺俊羊羊E技能虚影（毒苹果）
function drawPoisonAppleShadow() {
    const skill = localPlayer.skills.E;
    if (!skill.showingShadow) return;
    
    const img = loadPoisonAppleImage();
    const size = 100;  // 100*100大小
    const halfSize = size / 2;
    
    ctx.save();
    ctx.globalAlpha = 0.5;  // 半透明
    
    if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, skill.shadowX - halfSize, skill.shadowY - halfSize, size, size);
    } else {
        // 图片未加载，使用默认绘制（绿色圆形）
        ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
        ctx.beginPath();
        ctx.arc(skill.shadowX, skill.shadowY, halfSize, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // 绘制提示文字
    ctx.globalAlpha = 1.0;
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText('左键生成，右键取消', skill.shadowX, skill.shadowY + halfSize + 30);
    ctx.fillText('左键生成，右键取消', skill.shadowX, skill.shadowY + halfSize + 30);
    
    ctx.restore();
}

// 绘制毒苹果
function drawPoisonApple(apple) {
    const img = loadPoisonAppleImage();
    const size = 100;  // 100*100大小
    const halfSize = size / 2;
    
    ctx.save();
    
    if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, apple.x - halfSize, apple.y - halfSize, size, size);
    } else {
        // 图片未加载，使用默认绘制（绿色圆形）
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.arc(apple.x, apple.y, halfSize, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

// 绘制爆炸特效
function drawExplosion(explosion) {
    if (!explosion) return;
    
    const currentTime = Date.now() / 1000;
    const elapsed = currentTime - explosion.start_time;
    const duration = explosion.duration || 1.0;
    
    if (elapsed < 0 || elapsed >= duration) {
        return;  // 爆炸特效已结束
    }
    
    const progress = elapsed / duration;  // 0到1的进度
    const size = explosion.size || 300;
    const maxSize = size * 1.5;  // 最大尺寸
    const currentSize = size + (maxSize - size) * progress;  // 逐渐变大
    const alpha = 1.0 - progress;  // 逐渐变透明
    
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // 绘制多层爆炸效果
    for (let i = 0; i < 3; i++) {
        const layerSize = currentSize * (0.5 + i * 0.25);
        const layerAlpha = alpha * (1.0 - i * 0.3);
        
        // 创建径向渐变
        const gradient = ctx.createRadialGradient(
            explosion.x, explosion.y, 0,
            explosion.x, explosion.y, layerSize
        );
        gradient.addColorStop(0, `rgba(255, 165, 0, ${layerAlpha})`);  // 橙色中心
        gradient.addColorStop(0.5, `rgba(255, 69, 0, ${layerAlpha * 0.7})`);  // 橙红色
        gradient.addColorStop(1, `rgba(255, 20, 0, 0)`);  // 红色边缘，透明
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(explosion.x, explosion.y, layerSize, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // 绘制爆炸光晕
    ctx.shadowBlur = 30;
    ctx.shadowColor = `rgba(255, 165, 0, ${alpha})`;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, currentSize * 0.3, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1.0;
    ctx.restore();
}

// 绘制公主蓉右键锁定框
function drawLockBoxes(lockSkill) {
    const currentTime = Date.now() / 1000;
    
    // 获取本地玩家的右键技能状态
    const rightClickSkill = localPlayer.skills.rightClick;
    if (!rightClickSkill.active) return;
    
    let targets = [];
    let alpha = 1.0;
    let isFlashing = false;
    
    if (rightClickSkill.lockPhase === 'locking') {
        // 锁定阶段：锁定框逐渐显示
        const elapsed = currentTime - rightClickSkill.lockStartTime;
        const progress = Math.min(1.0, elapsed / rightClickSkill.lockDuration);
        alpha = progress;
        
        // 获取所有目标（敌人和队友）
        if (gameState.players) {
            for (let playerId in gameState.players) {
                if (playerId === socket.id) continue;
                const player = gameState.players[playerId];
                if (player.hp > 0) {
                    targets.push({
                        x: player.x,
                        y: player.y,
                        type: 'player'
                    });
                }
            }
        }
        if (gameState.enemies) {
            for (let enemy of gameState.enemies) {
                if (enemy.hp > 0) {
                    targets.push({
                        x: enemy.x,
                        y: enemy.y,
                        type: 'enemy'
                    });
                }
            }
        }
    } else {
        // 锁定完成后直接发射，不再有闪烁阶段
        return;
    }
    
    // 绘制锁定框
    const img = loadPrincessLockBoxImage();
    const boxSize = 80;  // 锁定框大小
    
    ctx.save();
    ctx.globalAlpha = alpha;
    
    for (let target of targets) {
        if (img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, target.x - boxSize / 2, target.y - boxSize / 2, boxSize, boxSize);
        } else {
            // 图片未加载，使用默认绘制（粉红色方框）
            ctx.strokeStyle = isFlashing ? '#ff1493' : '#ff69b4';  // 闪烁时使用更深的粉红色
            ctx.lineWidth = isFlashing ? 4 : 3;  // 闪烁时线条更粗
            ctx.strokeRect(target.x - boxSize / 2, target.y - boxSize / 2, boxSize, boxSize);
        }
    }
    
    ctx.restore();
}

// 绘制玩家
function drawPlayer(player, isLocal, playerId = null) {
    const playerSize = 100;  // 玩家图片大小
    const halfSize = playerSize / 2;
    const currentTime = Date.now() / 1000;
    
    // 检查是否在受击闪烁状态
    const hitFlashEnd = player.hit_flash_end || 0;
    const isFlashing = currentTime < hitFlashEnd;
    const flashAlpha = isFlashing ? (Math.sin(currentTime * 20) > 0 ? 0.5 : 1.0) : 1.0;  // 快速闪烁
    
    // 检查是否在治疗闪烁状态
    const healFlashEnd = player.heal_flash_end || 0;
    const isHealing = currentTime < healFlashEnd;
    
    // 检查是否在暴击抖动状态
    const critShakeEnd = player.crit_shake_end || 0;
    const isShaking = currentTime < critShakeEnd;
    // 计算抖动偏移（快速随机抖动）
    let shakeOffsetX = 0;
    let shakeOffsetY = 0;
    if (isShaking) {
        const shakeIntensity = 5;  // 抖动强度（像素）
        shakeOffsetX = (Math.random() - 0.5) * shakeIntensity;
        shakeOffsetY = (Math.random() - 0.5) * shakeIntensity;
    }
    
    // 绘制角色图片
    if (player.avatar && player.avatar.character && player.avatar.color) {
        const img = loadCharacterImage(player.avatar.character, player.avatar.color);
        
        // 如果图片已加载，绘制图片；否则绘制占位符
        if (img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.translate(player.x + shakeOffsetX, player.y + shakeOffsetY);
            
            // 判断是否需要翻转（对于本地玩家，根据鼠标位置；对于其他玩家，根据angle）
            let shouldFlip = false;
            if (isLocal) {
                // 本地玩家：当鼠标在角色左侧时翻转
                shouldFlip = mousePos.x < player.x;
            } else {
                // 其他玩家：当角度指向左侧时翻转（-90度到90度之间不翻转）
                shouldFlip = Math.abs(player.angle) > Math.PI / 2;
            }
            
            if (shouldFlip) {
                ctx.scale(-1, 1);  // 水平翻转
            }
            
            // 公主蓉E技能粉色光效（角色图标散发粉色光晕）- 放在图层之下
            if (isLocal && PLAYER_AVATAR.character === '公主蓉' && localPlayer.skills.E.active) {
                ctx.save();
                const eSkill = localPlayer.skills.E;
                const eElapsed = currentTime - eSkill.activeTime;
                const eRemaining = eSkill.activeDuration - eElapsed;
                
                if (eRemaining > 0) {
                    // 粉色光晕效果（围绕角色图标）
                    const glowIntensity = 0.7 + Math.sin(currentTime * 4) * 0.15;  // 呼吸效果
                    
                    // 多层光晕效果，营造散发感（降低透明度，更明显）
                    for (let i = 0; i < 3; i++) {
                        const layerSize = halfSize * (1.1 + i * 0.15);
                        const layerAlpha = glowIntensity * (0.9 - i * 0.2);  // 提高透明度（从0.6改为0.9）
                        
                        // 外发光
                        ctx.shadowBlur = 20 + i * 10;
                        ctx.shadowColor = 'rgba(255, 105, 180, ' + layerAlpha + ')';
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        
                        // 绘制光晕层
                        ctx.globalAlpha = layerAlpha;
                        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, layerSize);
                        gradient.addColorStop(0, 'rgba(255, 105, 180, ' + layerAlpha + ')');
                        gradient.addColorStop(0.5, 'rgba(255, 182, 193, ' + layerAlpha * 0.7 + ')');  // 提高中间层透明度
                        gradient.addColorStop(1, 'rgba(255, 20, 147, 0)');
                        ctx.fillStyle = gradient;
                        ctx.beginPath();
                        ctx.arc(0, 0, layerSize, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    
                    ctx.shadowBlur = 0;  // 重置阴影
                    ctx.globalAlpha = 1.0;  // 重置透明度
                }
                ctx.restore();
            }
            
            // 星耀犊E技能紫色光效（参考公主蓉的代码）
            if (isLocal && PLAYER_AVATAR.character === '星耀犊' && localPlayer.skills.E.active) {
                ctx.save();
                const eSkill = localPlayer.skills.E;
                const eElapsed = currentTime - eSkill.activeTime;
                const eRemaining = eSkill.activeDuration - eElapsed;
                
                if (eRemaining > 0) {
                    // 紫色光晕效果（围绕角色图标）
                    const glowIntensity = 0.7 + Math.sin(currentTime * 4) * 0.15;  // 呼吸效果
                    
                    // 多层光晕效果，营造散发感
                    for (let i = 0; i < 3; i++) {
                        const layerSize = halfSize * (1.1 + i * 0.15);
                        const layerAlpha = glowIntensity * (0.9 - i * 0.2);
                        
                        // 外发光
                        ctx.shadowBlur = 20 + i * 10;
                        ctx.shadowColor = 'rgba(138, 43, 226, ' + layerAlpha + ')';  // 紫色
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        
                        // 绘制光晕层
                        ctx.globalAlpha = layerAlpha;
                        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, layerSize);
                        gradient.addColorStop(0, 'rgba(138, 43, 226, ' + layerAlpha + ')');  // 紫色
                        gradient.addColorStop(0.5, 'rgba(186, 85, 211, ' + layerAlpha * 0.7 + ')');  // 淡紫色
                        gradient.addColorStop(1, 'rgba(138, 43, 226, 0)');
                        ctx.fillStyle = gradient;
                        ctx.beginPath();
                        ctx.arc(0, 0, layerSize, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    
                    ctx.shadowBlur = 0;  // 重置阴影
                    ctx.globalAlpha = 1.0;  // 重置透明度
                }
                ctx.restore();
            }
            
            // 绘制角色图片（中心对齐）
            ctx.drawImage(img, -halfSize, -halfSize, playerSize, playerSize);
            
            // 勇者E技能白色光效（参考Q技能按钮充满能量后的发光效果）
            if (isLocal && PLAYER_AVATAR.character === '勇者' && localPlayer.skills.E.active) {
                ctx.save();
                const eSkill = localPlayer.skills.E;
                const eElapsed = currentTime - eSkill.activeTime;
                const eRemaining = eSkill.activeDuration - eElapsed;
                
                if (eRemaining > 0) {
                    // 白色光效（外发光，类似Q技能按钮充满能量后的效果）
                    const glowIntensity = 0.8 + Math.sin(currentTime * 4) * 0.1;  // 呼吸效果
                    
                    // 多层白色光晕效果
                    for (let i = 0; i < 2; i++) {
                        const layerSize = halfSize * (1.15 + i * 0.1);
                        const layerAlpha = glowIntensity * (0.7 - i * 0.2);
                        
                        // 外发光
                        ctx.shadowBlur = 25 + i * 15;
                        ctx.shadowColor = 'rgba(255, 255, 255, ' + layerAlpha + ')';
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        
                        // 绘制光晕层
                        ctx.globalAlpha = layerAlpha;
                        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, layerSize);
                        gradient.addColorStop(0, 'rgba(255, 255, 255, ' + layerAlpha + ')');
                        gradient.addColorStop(0.5, 'rgba(255, 255, 255, ' + layerAlpha * 0.5 + ')');
                        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                        ctx.fillStyle = gradient;
                        ctx.beginPath();
                        ctx.arc(0, 0, layerSize, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    
                    ctx.shadowBlur = 0;  // 重置阴影
                    ctx.globalAlpha = 1.0;  // 重置透明度
                }
                ctx.restore();
            }
            
            // 幺幺俊羊羊右键技能：显示选中目标的视觉效果
            if (isLocal && PLAYER_AVATAR.character === '幺幺俊羊羊' && localPlayer.skills.rightClick.selectedTargetId) {
                const selectedTargetId = localPlayer.skills.rightClick.selectedTargetId;
                if (!isLocal && playerId === selectedTargetId) {
                    // 绘制选中框（蓝色圆圈）
                    ctx.strokeStyle = '#00BFFF';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(0, 0, halfSize * 1.3, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
            
            // 绘制泡泡盾特效（如果玩家有泡泡盾）
            const bubbleShieldEnd = player.bubbleShieldEnd || player.bubble_shield_end || 0;
            if ((player.invincible || bubbleShieldEnd > 0) && bubbleShieldEnd > 0 && currentTime < bubbleShieldEnd) {
                const bubbleShieldImage = loadBubbleShieldImage();
                const bubbleSize = playerSize * 1.5;  // 泡泡盾大小
                const bubbleHalfSize = bubbleSize / 2;
                
                ctx.save();
                ctx.globalAlpha = 0.8;  // 半透明
                if (bubbleShieldImage.complete && bubbleShieldImage.naturalWidth > 0) {
                    ctx.drawImage(bubbleShieldImage, -bubbleHalfSize, -bubbleHalfSize, bubbleSize, bubbleSize);
                } else {
                    // 图片未加载，使用默认绘制（蓝色圆圈）
                    ctx.strokeStyle = '#00BFFF';
                    ctx.lineWidth = 5;
                    ctx.beginPath();
                    ctx.arc(0, 0, bubbleHalfSize, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1.0;
                ctx.restore();
            }
            
            // 其他玩家的公主蓉E技能光效（需要从服务器同步状态）
            // 这里暂时不处理，因为服务器没有同步E技能状态
            
            // 受击闪烁效果：只在图标不透明部分变红，透明背景不变
            if (isFlashing && !isHealing) {
                // 创建临时canvas提取不透明像素
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = playerSize;
                tempCanvas.height = playerSize;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(img, 0, 0, playerSize, playerSize);
                
                // 获取图像数据，只对不透明像素应用红色
                const imageData = tempCtx.getImageData(0, 0, playerSize, playerSize);
                const data = imageData.data;
                // 提高红色强度，使闪烁更明显（从0.7提高到1.0）
                const redIntensity = 1.0 * (1 - flashAlpha);
                
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i + 3] > 0) {  // 不透明像素
                        // 混合红色，保持原有颜色但增加红色
                        data[i] = Math.min(255, data[i] + (255 - data[i]) * redIntensity);
                    }
                }
                
                tempCtx.putImageData(imageData, 0, 0);
                ctx.drawImage(tempCanvas, -halfSize, -halfSize, playerSize, playerSize);
            }
            
            // 治疗闪烁效果：只在图标不透明部分变黄
            if (isHealing) {
                // 创建临时canvas提取不透明像素
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = playerSize;
                tempCanvas.height = playerSize;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(img, 0, 0, playerSize, playerSize);
                
                // 获取图像数据，只对不透明像素应用黄色
                const imageData = tempCtx.getImageData(0, 0, playerSize, playerSize);
                const data = imageData.data;
                const healFlashAlpha = (healFlashEnd - currentTime) / 1.0;  // 1秒内逐渐消失
                const yellowIntensity = 0.8 * healFlashAlpha;
                
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i + 3] > 0) {  // 不透明像素
                        // 混合黄色
                        data[i] = Math.min(255, data[i] + (255 - data[i]) * yellowIntensity);  // R
                        data[i + 1] = Math.min(255, data[i + 1] + (255 - data[i + 1]) * yellowIntensity * 0.8);  // G
                    }
                }
                
                tempCtx.putImageData(imageData, 0, 0);
                ctx.drawImage(tempCanvas, -halfSize, -halfSize, playerSize, playerSize);
            }
            
            ctx.restore();
        } else {
            // 图片未加载完成，使用彩色圆圈占位
            const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
            const colorIndex = (player.avatar.color || 1) - 1;
            ctx.fillStyle = colors[colorIndex] || '#00ff00';
            ctx.beginPath();
            ctx.arc(player.x, player.y, halfSize, 0, Math.PI * 2);
            ctx.fill();
        }
    } else {
        // 没有角色信息，绘制默认圆圈
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.arc(player.x, player.y, halfSize, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // 绘制玩家名字（带黑色描边的白色字体）
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    // 黑色描边
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeText(player.name, player.x, player.y - halfSize - 15);
    
    // 白色填充
    ctx.fillStyle = '#ffffff';
    ctx.fillText(player.name, player.x, player.y - halfSize - 15);
    
    // 绘制血量条
    const barWidth = 100;
    const barHeight = 8;
    const hpPercent = Math.max(0, Math.min(1, (player.hp || 1000) / (player.maxHp || 1000)));
    
    // 血量条背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(player.x - barWidth/2 - 2, player.y - halfSize - 8, barWidth + 4, barHeight + 4);
    
    // 血量条红色底
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(player.x - barWidth/2, player.y - halfSize - 6, barWidth, barHeight);
    
    // 血量条绿色部分
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(player.x - barWidth/2, player.y - halfSize - 6, barWidth * hpPercent, barHeight);
    
    // 血量条边框
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(player.x - barWidth/2, player.y - halfSize - 6, barWidth, barHeight);
    
    // 绘制治疗效果（黄色十字架）
    if (isHealing) {
        const entityId = isLocal ? 'local_player' : player.id || player.name;
        drawHealEffect(player.x, player.y, halfSize, healFlashEnd, entityId);
    }
}

// 治疗效果数据存储（用于管理多个十字架的移动）
const healEffects = {};  // {entityId: [{x, y, size, startTime, offsetX, offsetY, speed}]}

// 绘制治疗效果（黄色十字架，缓慢向上移动）
function drawHealEffect(x, y, radius, healFlashEnd, entityId) {
    const currentTime = Date.now() / 1000;
    const remaining = Math.max(0, healFlashEnd - currentTime);
    
    if (remaining <= 0) {
        // 效果结束，清除数据
        if (healEffects[entityId]) {
            delete healEffects[entityId];
        }
        return;
    }
    
    // 初始化或更新治疗效果数据
    if (!healEffects[entityId]) {
        // 创建6个随机位置的十字架
        healEffects[entityId] = [];
        for (let i = 0; i < 6; i++) {
            healEffects[entityId].push({
                offsetX: (Math.random() - 0.5) * radius * 1.5,  // 随机X偏移（在角色图标范围内）
                offsetY: (Math.random() - 0.5) * radius * 1.5,  // 随机Y偏移
                size: 8 + Math.random() * 12,  // 大小8-20像素
                startTime: currentTime,
                speed: 20 + Math.random() * 30  // 向上移动速度（像素/秒）
            });
        }
    }
    
    ctx.save();
    ctx.strokeStyle = '#ffff00';  // 黄色
    ctx.fillStyle = '#ffff00';
    ctx.lineWidth = 5;  // 加粗十字架（从2改为5）
    
    // 绘制每个十字架
    const crosses = healEffects[entityId];
    for (let i = crosses.length - 1; i >= 0; i--) {
        const cross = crosses[i];
        const elapsed = currentTime - cross.startTime;
        const moveY = -cross.speed * elapsed;  // 向上移动
        
        // 计算当前位置
        const crossX = x + cross.offsetX;
        const crossY = y + cross.offsetY + moveY;
        
        // 如果超出范围或时间到了，移除这个十字架
        if (crossY < y - radius * 2 || elapsed > 1.0) {
            crosses.splice(i, 1);
            continue;
        }
        
        // 计算透明度（逐渐消失）
        const alpha = Math.max(0, 1.0 - elapsed);
        ctx.globalAlpha = alpha;
        
        // 绘制十字架
        ctx.beginPath();
        // 横线
        ctx.moveTo(crossX - cross.size / 2, crossY);
        ctx.lineTo(crossX + cross.size / 2, crossY);
        // 竖线
        ctx.moveTo(crossX, crossY - cross.size / 2);
        ctx.lineTo(crossX, crossY + cross.size / 2);
        ctx.stroke();
    }
    
    // 如果所有十字架都消失了，清除数据
    if (crosses.length === 0) {
        delete healEffects[entityId];
    }
    
    ctx.restore();
}

// 绘制光束（星耀犊Q技能或王子栗右键技能）
function drawBeam(beam) {
    if (!beam || beam.x === undefined || beam.y === undefined) {
        return;  // 无效的光束数据，不绘制
    }
    
    const beamLength = 2000;  // 光束长度
    const startX = beam.x;
    const startY = beam.y;
    const angle = beam.angle || 0;
    const width = beam.width || 30;
    const isCrit = beam.isCrit || false;
    const beamType = beam.beam_type || 'star_beam';  // 光束类型
    
    // 计算终点
    const endX = startX + Math.cos(angle) * beamLength;
    const endY = startY + Math.sin(angle) * beamLength;
    
    ctx.save();
    
    // 根据光束类型设置颜色
    if (beamType === 'prince_purification') {
        // 王子栗净灭射线：橙红色
        ctx.strokeStyle = '#ff4500';  // 橙红色
        ctx.fillStyle = 'rgba(255, 69, 0, 0.3)';  // 半透明橙红色填充
    } else {
        // 星耀犊聚合光束：蓝色（普通）或紫色（暴击）
        if (isCrit) {
            ctx.strokeStyle = '#ff00ff';  // 紫色
            ctx.fillStyle = 'rgba(255, 0, 255, 0.3)';  // 半透明紫色填充
        } else {
            ctx.strokeStyle = '#00ffff';  // 蓝色
            ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';  // 半透明蓝色填充
        }
    }
    
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    
    // 绘制光束（使用渐变）
    const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
    if (beamType === 'prince_purification') {
        // 王子栗净灭射线：橙红色渐变
        gradient.addColorStop(0, 'rgba(255, 69, 0, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 69, 0, 0.2)');
    } else if (isCrit) {
        gradient.addColorStop(0, 'rgba(255, 0, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 0, 255, 0.2)');
    } else {
        gradient.addColorStop(0, 'rgba(0, 255, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(0, 255, 255, 0.2)');
    }
    
    ctx.strokeStyle = gradient;
    
    // 绘制光束线条
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    
    // 绘制光束中心高亮
    ctx.strokeStyle = beamType === 'prince_purification' ? '#ff8c00' : '#ffffff';
    ctx.lineWidth = width * 0.3;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    
    ctx.restore();
}

// 锁定框图片缓存
let lockBoxImage = null;

// 加载锁定框图片
function loadLockBoxImage() {
    if (!lockBoxImage) {
        lockBoxImage = new Image();
        lockBoxImage.src = '/static/锁定框.png';
        lockBoxImage.onload = function() {
            console.log('✓ 锁定框图片加载成功');
        };
        lockBoxImage.onerror = function() {
            console.warn('⚠️ 锁定框图片加载失败，使用默认绘制');
        };
    }
    return lockBoxImage;
}

// 绘制锁定框
function drawLockBox(player) {
    const boxSize = 120;  // 锁定框大小
    const halfSize = boxSize / 2;
    
    ctx.save();
    
    // 尝试使用锁定框.png图片
    const img = loadLockBoxImage();
    if (img.complete && img.naturalWidth > 0) {
        // 使用图片绘制
        ctx.drawImage(img, player.x - halfSize, player.y - halfSize, boxSize, boxSize);
    } else {
        // 图片未加载，使用默认绘制
        ctx.strokeStyle = '#00ffff';  // 青色锁定框
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);  // 虚线
        
        // 绘制方框
        ctx.strokeRect(player.x - halfSize, player.y - halfSize, boxSize, boxSize);
        
        // 绘制四个角的标记
        const cornerSize = 10;
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(player.x - halfSize - cornerSize, player.y - halfSize - cornerSize, cornerSize, cornerSize);
        ctx.fillRect(player.x + halfSize, player.y - halfSize - cornerSize, cornerSize, cornerSize);
        ctx.fillRect(player.x - halfSize - cornerSize, player.y + halfSize, cornerSize, cornerSize);
        ctx.fillRect(player.x + halfSize, player.y + halfSize, cornerSize, cornerSize);
    }
    
    ctx.restore();
}

// 绘制蓄力进度条
function drawChargeBar(player) {
    const playerSize = 100;  // 玩家图片大小
    const halfSize = playerSize / 2;
    const barWidth = 100;  // 进度条宽度
    const barHeight = 8;  // 进度条高度
    const barY = player.y - halfSize - 30;  // 进度条位置（在玩家头顶，血量条上方）
    
    // 计算蓄力进度（0-1）
    const now = Date.now() / 1000;
    const currentChargeTime = Math.min(now - chargeStartTime, localPlayer.weapon.maxChargeTime);
    const chargePercent = currentChargeTime / localPlayer.weapon.maxChargeTime;
    
    // 进度条背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(player.x - barWidth/2 - 2, barY - 2, barWidth + 4, barHeight + 4);
    
    // 进度条底色（灰色）
    ctx.fillStyle = 'rgba(128, 128, 128, 0.8)';
    ctx.fillRect(player.x - barWidth/2, barY, barWidth, barHeight);
    
    // 进度条填充（青色，表示蓄力）
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(player.x - barWidth/2, barY, barWidth * chargePercent, barHeight);
    
    // 进度条边框
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(player.x - barWidth/2, barY, barWidth, barHeight);
    
    // 绘制蓄力百分比文字（可选）
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(Math.floor(chargePercent * 100) + '%', player.x, barY + barHeight / 2);
}

// 音爆图片缓存
let sonicBoomImage = null;

// 加载音爆图片
function loadSonicBoomImage() {
    if (!sonicBoomImage) {
        sonicBoomImage = new Image();
        sonicBoomImage.src = '/static/音爆.png';
        sonicBoomImage.onload = function() {
            console.log('✓ 音爆图片加载成功');
        };
        sonicBoomImage.onerror = function() {
            console.warn('⚠️ 音爆图片加载失败');
        };
    }
    return sonicBoomImage;
}

// 绘制音爆效果
function drawSonicBoom(enemy) {
    const enemySize = enemy.size;
    const halfSize = enemySize / 2;
    const currentTime = Date.now() / 1000;
    const sonicBoomEnd = enemy.sonic_boom_end || 0;
    
    // 计算透明度（逐渐消失）
    const remaining = sonicBoomEnd - currentTime;
    const alpha = Math.max(0, Math.min(1, remaining / 0.5));
    
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // 尝试使用音爆.png图片
    const img = loadSonicBoomImage();
    if (img.complete && img.naturalWidth > 0) {
        // 使用图片绘制（覆盖在敌人图标上）
        ctx.drawImage(img, enemy.x - halfSize, enemy.y - halfSize, enemySize, enemySize);
    } else {
        // 图片未加载，使用默认绘制（红色圆圈）
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, halfSize * 1.2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

function loadBubbleShieldImage() {
    if (!window.bubbleShieldImage) {
        window.bubbleShieldImage = new Image();
        window.bubbleShieldImage.src = '/static/泡泡盾.png';
    }
    return window.bubbleShieldImage;
}

// 绘制碎裂效果
function drawShatter(enemy) {
    const enemySize = enemy.size;
    const halfSize = enemySize / 2;
    const currentTime = Date.now() / 1000;
    const shatterEnd = enemy.shatter_end || 0;
    
    ctx.save();
    ctx.globalAlpha = 1.0;  // 100%不透明，完全呈现
    
    // 尝试使用碎裂.png图片（增大30%）
    const img = loadShatterImage();
    const shatterSize = enemySize * 1.3;  // 增大30%
    const shatterHalfSize = shatterSize / 2;
    if (img.complete && img.naturalWidth > 0) {
        // 使用图片绘制（覆盖在敌人图标上，增大30%，100%不透明）
        ctx.drawImage(img, enemy.x - shatterHalfSize, enemy.y - shatterHalfSize, shatterSize, shatterSize);
    } else {
        // 图片未加载，使用默认绘制（白色圆圈，增大30%）
        ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, shatterHalfSize * 1.2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

// 音符图片缓存
let bulletImages = {};

// 加载子弹图片
function loadBulletImage(imageName) {
    if (!bulletImages[imageName]) {
        const img = new Image();
        img.src = `/static/${imageName}`;
        img.onload = function() {
            console.log(`✓ 子弹图片 ${imageName} 加载成功`);
        };
        img.onerror = function() {
            console.warn(`⚠️ 子弹图片 ${imageName} 加载失败`);
        };
        bulletImages[imageName] = img;
    }
    return bulletImages[imageName];
}

// 绘制子弹
function drawBullet(bullet) {
    const radius = bullet.size / 2;
    
    // 如果是音符子弹，使用图片
    if (bullet.bulletImage) {
        const img = loadBulletImage(bullet.bulletImage);
        if (img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.translate(bullet.x, bullet.y);
            // 计算旋转角度
            const angle = Math.atan2(bullet.vy, bullet.vx);
            ctx.rotate(angle);
            ctx.drawImage(img, -radius, -radius, bullet.size, bullet.size);
            ctx.restore();
            return;
        }
    }
    
    // 默认子弹绘制（圆形）
    // 计算子弹速度方向（归一化）
    const speed = Math.sqrt(bullet.vx * bullet.vx + bullet.vy * bullet.vy);
    if (speed > 0) {
        const dirX = bullet.vx / speed;
        const dirY = bullet.vy / speed;
        
        // 绘制子弹轨迹（白色拖尾）- 拖尾应该指向子弹运动的反方向（身后）
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = bullet.size / 2;
        ctx.beginPath();
        ctx.moveTo(bullet.x, bullet.y);
        // 拖尾指向子弹来的方向（身后）
        ctx.lineTo(bullet.x - dirX * 20, bullet.y - dirY * 20);
        ctx.stroke();
    }
    
    // 绘制圆形弹丸（根据子弹类型选择颜色）
    if (bullet.isPinkBullet) {
        // 公主蓉的粉红色子弹
        ctx.fillStyle = '#ff69b4';  // 粉红色
        ctx.strokeStyle = '#ff1493';  // 深粉红色描边
    } else if (bullet.bulletColor) {
        // 自定义颜色子弹（王子栗红色弹丸）
        ctx.fillStyle = bullet.bulletColor;
        ctx.strokeStyle = '#000000';  // 黑色描边
    } else {
        // 默认黄色子弹
        ctx.fillStyle = '#ffff00';
        ctx.strokeStyle = '#000000';  // 黑色描边
    }
    
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // 绘制描边
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, radius, 0, Math.PI * 2);
    ctx.stroke();
}

// 绘制敌人
function drawEnemy(enemy) {
    const enemySize = enemy.size;
    const halfSize = enemySize / 2;
    const currentTime = Date.now() / 1000;
    
    // 检查是否在受击闪烁状态
    const hitFlashEnd = enemy.hit_flash_end || 0;
    const isFlashing = currentTime < hitFlashEnd;
    const flashAlpha = isFlashing ? (Math.sin(currentTime * 20) > 0 ? 0.5 : 1.0) : 1.0;  // 快速闪烁
    
    // 检查是否在治疗闪烁状态
    const healFlashEnd = enemy.heal_flash_end || 0;
    const isHealing = currentTime < healFlashEnd;
    
    // 检查是否在暴击抖动状态
    const critShakeEnd = enemy.crit_shake_end || 0;
    const isShaking = currentTime < critShakeEnd;
    // 计算抖动偏移（快速随机抖动）
    let shakeOffsetX = 0;
    let shakeOffsetY = 0;
    if (isShaking) {
        const shakeIntensity = 5;  // 抖动强度（像素）
        shakeOffsetX = (Math.random() - 0.5) * shakeIntensity;
        shakeOffsetY = (Math.random() - 0.5) * shakeIntensity;
    }
    
    // 绘制敌人图片
    const img = loadEnemyImage(enemy.type);
    if (img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.translate(enemy.x + shakeOffsetX, enemy.y + shakeOffsetY);
        
        // 绘制敌人图片
        ctx.drawImage(img, -halfSize, -halfSize, enemySize, enemySize);
        
        // 受击闪烁效果：只在图标不透明部分变红，透明背景不变
        if (isFlashing && !isHealing) {
            // 创建临时canvas提取不透明像素
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = enemySize;
            tempCanvas.height = enemySize;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(img, 0, 0, enemySize, enemySize);
            
                // 获取图像数据，只对不透明像素应用红色
                const imageData = tempCtx.getImageData(0, 0, enemySize, enemySize);
                const data = imageData.data;
                // 提高红色强度，使闪烁更明显（从0.7提高到1.0）
                const redIntensity = 7.0 * (1 - flashAlpha);
                
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i + 3] > 0) {  // 不透明像素
                        // 混合红色，保持原有颜色但增加红色
                        data[i] = Math.min(255, data[i] + (255 - data[i]) * redIntensity);
                    }
                }
            
            tempCtx.putImageData(imageData, 0, 0);
            ctx.drawImage(tempCanvas, -halfSize, -halfSize, enemySize, enemySize);
        }
        
        // 治疗闪烁效果：只在图标不透明部分变黄
        if (isHealing) {
            // 创建临时canvas提取不透明像素
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = enemySize;
            tempCanvas.height = enemySize;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(img, 0, 0, enemySize, enemySize);
            
            // 获取图像数据，只对不透明像素应用黄色
            const imageData = tempCtx.getImageData(0, 0, enemySize, enemySize);
            const data = imageData.data;
            const healFlashAlpha = (healFlashEnd - currentTime) / 1.0;  // 1秒内逐渐消失
            const yellowIntensity = 0.8 * healFlashAlpha;
            
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] > 0) {  // 不透明像素
                    // 混合黄色
                    data[i] = Math.min(255, data[i] + (255 - data[i]) * yellowIntensity);  // R
                    data[i + 1] = Math.min(255, data[i + 1] + (255 - data[i + 1]) * yellowIntensity * 0.8);  // G
                }
            }
            
            tempCtx.putImageData(imageData, 0, 0);
            ctx.drawImage(tempCanvas, -halfSize, -halfSize, enemySize, enemySize);
        }
        
        ctx.restore();
        
        // 绘制音爆效果（如果存在）
        const sonicBoomEnd = enemy.sonic_boom_end || 0;
        if (currentTime < sonicBoomEnd) {
            drawSonicBoom(enemy);
        }
        
        // 绘制碎裂效果（如果存在）
        const shatterEnd = enemy.shatter_end || 0;
        if (currentTime < shatterEnd) {
            drawShatter(enemy);
        }
        
        // 绘制中毒效果（明显的绿色蒙层）
        if (enemy.poisoned) {
            ctx.save();
            ctx.translate(enemy.x, enemy.y);
            // 使用更明显的绿色，直接改变敌人颜色为绿色
            // 使用color混合模式，直接将敌人染成绿色
            ctx.globalCompositeOperation = 'color';  // 使用color混合模式，更明显地改变颜色
            const flashIntensity = (Math.sin(currentTime * 5) + 1) / 2;  // 0到1之间闪烁
            const greenAlpha = 0.6 + flashIntensity * 0.4;  // 60%到100%透明度闪烁，更明显
            ctx.fillStyle = `rgba(0, 255, 0, ${greenAlpha})`;  // 亮绿色，更明显
            ctx.beginPath();
            ctx.arc(0, 0, halfSize, 0, Math.PI * 2);
            ctx.fill();
            // 再叠加一层绿色光晕，使效果更明显
            ctx.globalCompositeOperation = 'screen';  // 使用screen混合模式叠加光晕
            ctx.fillStyle = `rgba(0, 255, 0, ${greenAlpha * 0.3})`;  // 绿色光晕
            ctx.beginPath();
            ctx.arc(0, 0, halfSize * 1.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';  // 恢复默认混合模式
            ctx.restore();
        }
    } else {
        // 图片未加载，使用占位符
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, halfSize, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // 绘制敌人血量条
    const barWidth = enemySize;
    const barHeight = 8;
    const hpPercent = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
    
    // 血量条背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(enemy.x - barWidth/2 - 2, enemy.y - halfSize - 15, barWidth + 4, barHeight + 4);
    
    // 血量条红色底
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(enemy.x - barWidth/2, enemy.y - halfSize - 13, barWidth, barHeight);
    
    // 血量条绿色部分
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(enemy.x - barWidth/2, enemy.y - halfSize - 13, barWidth * hpPercent, barHeight);
    
    // 血量条边框
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(enemy.x - barWidth/2, enemy.y - halfSize - 13, barWidth, barHeight);
    
    // 绘制治疗效果（黄色十字架）
    if (isHealing) {
        const entityId = 'enemy_' + enemy.id;
        drawHealEffect(enemy.x, enemy.y, halfSize, healFlashEnd, entityId);
    }
}

// 绘制倒计时
function drawCountdown() {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 120px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(gameState.countdown, canvas.width / 2, canvas.height / 2);
    
    ctx.restore();
}

// 更新UI
function updateHealthBar() {
    const healthFill = document.getElementById('healthFill');
    const healthBar = document.getElementById('healthBar');
    const percent = (localPlayer.hp / localPlayer.maxHp) * 100;
    healthFill.style.width = percent + '%';
    
    // 更新文字内容（文字已经在HTML中，只需要更新文本）
    if (healthBar) {
        const healthText = healthBar.querySelector('.health-text');
        if (healthText) {
            healthText.textContent = Math.max(0, localPlayer.hp) + ' / ' + localPlayer.maxHp;
        }
    }
}

function updateAmmoDisplay() {
    document.getElementById('currentAmmo').textContent = localPlayer.weapon.currentAmmo;
    document.getElementById('maxAmmo').textContent = localPlayer.weapon.maxAmmo;
}

function updatePlayerList() {
    const container = document.getElementById('playersContainer');
    container.innerHTML = '';
    
    console.log('=== 更新玩家列表 ===');
    console.log('socket.id:', socket.id);
    console.log('gameState.players:', gameState.players);
    
    // 添加本地玩家
    const localDiv = document.createElement('div');
    localDiv.className = 'player-info';
    localDiv.innerHTML = `
        <span class="player-name">${localPlayer.name} (你)</span>
        <span class="player-hp">${localPlayer.hp} HP</span>
    `;
    container.appendChild(localDiv);
    
    // 添加其他玩家（排除本地玩家）
    for (let playerId in gameState.players) {
        // 跳过本地玩家，避免重复
        if (playerId === socket.id) {
            console.log('跳过本地玩家:', playerId, gameState.players[playerId].name);
            continue;
        }
        
        const player = gameState.players[playerId];
        const div = document.createElement('div');
        div.className = 'player-info';
        div.innerHTML = `
            <span class="player-name">${player.name}</span>
            <span class="player-hp">${player.hp || 1000} HP</span>
        `;
        container.appendChild(div);
        console.log('添加玩家:', player.name, player.hp);
    }
}

// 更新倒计时显示
function updateCountdownDisplay() {
    // 倒计时在render函数中绘制
}

// 显示死亡屏幕
function showDeathScreen() {
    const deathOverlay = document.getElementById('deathOverlay');
    if (deathOverlay) {
        deathOverlay.style.display = 'flex';
    }
}

// 显示胜利
function showVictory() {
    gameState.gameRunning = false;
    const gameOver = document.getElementById('gameOver');
    const gameOverText = document.getElementById('gameOverText');
    if (gameOver && gameOverText) {
        gameOverText.textContent = '胜利';
        gameOver.style.display = 'flex';
    }
    
    // 设置返回按钮事件
    const returnBtn = document.getElementById('returnToLobbyBtn');
    if (returnBtn) {
        returnBtn.onclick = function() {
            const roomKey = typeof ROOM_KEY !== 'undefined' ? ROOM_KEY : '';
            if (roomKey) {
                window.location.href = `/lobby/${roomKey}`;
            } else {
                // 尝试从URL获取房间密钥
                const urlMatch = window.location.pathname.match(/\/game\/([A-Z0-9]+)/);
                if (urlMatch) {
                    window.location.href = `/lobby/${urlMatch[1]}`;
                } else {
                    window.location.href = '/';
                }
            }
        };
    }
    
    // 3秒后自动返回大厅
    setTimeout(() => {
        const roomKey = typeof ROOM_KEY !== 'undefined' ? ROOM_KEY : '';
        if (roomKey) {
            window.location.href = `/lobby/${roomKey}`;
        } else {
            // 尝试从URL获取房间密钥
            const urlMatch = window.location.pathname.match(/\/game\/([A-Z0-9]+)/);
            if (urlMatch) {
                window.location.href = `/lobby/${urlMatch[1]}`;
            } else {
                window.location.href = '/';
            }
        }
    }, 3000);
}

// 显示失败
function showDefeat() {
    gameState.gameRunning = false;
    const gameOver = document.getElementById('gameOver');
    const gameOverText = document.getElementById('gameOverText');
    if (gameOver && gameOverText) {
        gameOverText.textContent = '失败';
        gameOver.style.display = 'flex';
    }
    
    // 设置返回按钮事件
    const returnBtn = document.getElementById('returnToLobbyBtn');
    if (returnBtn) {
        returnBtn.onclick = function() {
            const roomKey = typeof ROOM_KEY !== 'undefined' ? ROOM_KEY : '';
            if (roomKey) {
                window.location.href = `/lobby/${roomKey}`;
            } else {
                // 尝试从URL获取房间密钥
                const urlMatch = window.location.pathname.match(/\/game\/([A-Z0-9]+)/);
                if (urlMatch) {
                    window.location.href = `/lobby/${urlMatch[1]}`;
                } else {
                    window.location.href = '/';
                }
            }
        };
    }
    
    // 3秒后自动返回大厅
    setTimeout(() => {
        const roomKey = typeof ROOM_KEY !== 'undefined' ? ROOM_KEY : '';
        if (roomKey) {
            window.location.href = `/lobby/${roomKey}`;
        } else {
            // 尝试从URL获取房间密钥
            const urlMatch = window.location.pathname.match(/\/game\/([A-Z0-9]+)/);
            if (urlMatch) {
                window.location.href = `/lobby/${urlMatch[1]}`;
            } else {
                window.location.href = '/';
            }
        }
    }, 3000);
}

// 游戏结束
function gameOver(message = '你已被击败！') {
    gameState.gameRunning = false;
    document.getElementById('gameOverText').textContent = message;
    document.getElementById('gameOver').style.display = 'flex';
}

// 属性颜色映射
const ATTRIBUTE_COLORS = {
    '物理系': '#ffffff',      // 白色
    '自然系': '#00ffcc',      // 青绿色
    '超能系': '#ff00ff',      // 紫粉色
    '无属性': '#87ceeb'       // 天蓝色
};

// 初始化伤害数字数组
if (!gameState.damageNumbers) {
    gameState.damageNumbers = [];
}
if (!gameState.healingNumbers) {
    gameState.healingNumbers = [];
}

// 显示伤害数字
function showDamageNumber(x, y, damage, isCrit, attribute) {
    // 随机位置偏移（在角色图标范围内）
    const offsetX = (Math.random() - 0.5) * 80;
    const offsetY = (Math.random() - 0.5) * 80;
    
    gameState.damageNumbers.push({
        x: x + offsetX,
        y: y + offsetY,
        damage: damage,
        isCrit: isCrit,
        attribute: attribute || '无属性',  // 默认无属性
        time: Date.now() / 1000,
        duration: 1.0  // 1秒后消失
    });
}

// 显示治疗数字（黄色）
function showHealingNumber(x, y, healing, isCrit) {
    // 随机位置偏移（在角色图标范围内）
    const offsetX = (Math.random() - 0.5) * 80;
    const offsetY = (Math.random() - 0.5) * 80;
    
    gameState.healingNumbers.push({
        x: x + offsetX,
        y: y + offsetY,
        healing: healing,
        isCrit: isCrit,
        time: Date.now() / 1000,
        duration: 1.0  // 1秒后消失
    });
}

// 更新并绘制伤害数字
function updateAndDrawDamageNumbers() {
    if (!gameState.damageNumbers) return;
    
    const currentTime = Date.now() / 1000;
    
    for (let i = gameState.damageNumbers.length - 1; i >= 0; i--) {
        const num = gameState.damageNumbers[i];
        const elapsed = currentTime - num.time;
        
        if (elapsed >= num.duration) {
            // 移除过期的伤害数字
            gameState.damageNumbers.splice(i, 1);
            continue;
        }
        
        // 计算位置（向上移动）
        const progress = elapsed / num.duration;
        const y = num.y - progress * 50;  // 向上移动50像素
        const alpha = 1 - progress;  // 逐渐透明
        
        // 计算字体大小（未暴击加大50%，暴击时加大150%）
        const baseFontSize = num.isCrit ? 48 : 24;  // 未暴击：16 * 1.5 = 24，暴击：32 * 1.5 = 48
        const fontSize = baseFontSize * (1 + progress * 0.5);  // 逐渐变大
        
        // 获取属性颜色
        const attribute = num.attribute || '无属性';
        const colorHex = ATTRIBUTE_COLORS[attribute] || ATTRIBUTE_COLORS['无属性'];
        
        // 将十六进制颜色转换为RGB
        const r = parseInt(colorHex.slice(1, 3), 16);
        const g = parseInt(colorHex.slice(3, 5), 16);
        const b = parseInt(colorHex.slice(5, 7), 16);
        
        // 绘制伤害数字
        ctx.save();
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 黑色描边
        ctx.strokeStyle = 'rgba(0, 0, 0, ' + alpha + ')';
        ctx.lineWidth = 3;
        ctx.strokeText(num.damage.toString(), num.x, y);
        
        // 根据属性设置填充颜色
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fillText(num.damage.toString(), num.x, y);
        
        ctx.restore();
    }
}

// 更新并绘制治疗数字（黄色）
function updateAndDrawHealingNumbers() {
    if (!gameState.healingNumbers) return;
    
    const currentTime = Date.now() / 1000;
    
    for (let i = gameState.healingNumbers.length - 1; i >= 0; i--) {
        const num = gameState.healingNumbers[i];
        const elapsed = currentTime - num.time;
        
        if (elapsed >= num.duration) {
            // 移除过期的治疗数字
            gameState.healingNumbers.splice(i, 1);
            continue;
        }
        
        // 计算位置（向上移动）
        const progress = elapsed / num.duration;
        const y = num.y - progress * 50;  // 向上移动50像素
        const alpha = 1 - progress;  // 逐渐透明
        
        // 计算字体大小（未暴击加大50%，暴击时加大150%）
        const baseFontSize = num.isCrit ? 48 : 24;
        const fontSize = baseFontSize * (1 + progress * 0.5);  // 逐渐变大
        
        // 绘制治疗数字（黄色）
        ctx.save();
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 黑色描边
        ctx.strokeStyle = 'rgba(0, 0, 0, ' + alpha + ')';
        ctx.lineWidth = 3;
        ctx.strokeText('+' + num.healing.toString(), num.x, y);
        
        // 黄色填充
        ctx.fillStyle = `rgba(255, 255, 0, ${alpha})`;  // 黄色
        ctx.fillText('+' + num.healing.toString(), num.x, y);
        
        ctx.restore();
    }
}

// 游戏主循环
let lastTime = Date.now();
let frameCount = 0;
let loopStarted = false;

function gameLoop() {
    if (!loopStarted) {
        console.log('🚀 游戏循环首次启动！');
        console.log('gameState:', gameState);
        loopStarted = true;
    }
    
    if (!gameState.gameRunning) {
        console.error('❌ 游戏已停止！gameState.gameRunning =', gameState.gameRunning);
        return;
    }
    
    const now = Date.now();
    const deltaTime = (now - lastTime) / 1000;
    lastTime = now;
    
    frameCount++;
    if (frameCount % 60 === 0) {  // 每60帧输出一次
        console.log('🎮 游戏循环运行中... 帧数:', frameCount, '玩家位置:', `(${Math.round(localPlayer.x)}, ${Math.round(localPlayer.y)})`);
    }
    
    try {
        // 发送游戏tick到服务器（每帧发送一次，但服务器会限制更新频率）
        if (!gameTickLastSend || Date.now() - gameTickLastSend > 16) {  // 约60fps
            socket.emit('game_tick', {
                room_key: ROOM_KEY,
                canvas_width: canvas.width,
                canvas_height: canvas.height
            });
            gameTickLastSend = Date.now();
        }
        
        if (!gameState.isDead) {
            updatePlayer(deltaTime);
        }
        updateBullets(deltaTime);
        render();
    } catch (error) {
        console.error('❌ 游戏循环错误:', error);
    }
    
    requestAnimationFrame(gameLoop);
}

// 游戏tick发送计时器
let gameTickLastSend = 0;

// 启动游戏（确保页面加载完成后再启动）
console.log('准备启动游戏...');
console.log('Canvas:', canvas);
console.log('Context:', ctx);

// 确保DOM完全加载后启动
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startGame);
} else {
    startGame();
}

function startGame() {
    console.log('=== 启动游戏 ===');
    console.log('gameState.gameRunning (启动前):', gameState.gameRunning);
    
    // 完全重置所有游戏状态（防止上一局数据残留）
    gameState.players = {};
    gameState.bullets = [];
    gameState.enemies = [];
    gameState.countdown = 3;
    gameState.isDead = false;
    gameState.gameResult = null;
    gameState.damageNumbers = [];
    gameState.gameRunning = false;
    gameState.myPlayerId = null;  // 重置玩家ID
    
    // 重置本地玩家状态
    localPlayer.hp = localPlayer.maxHp;
    localPlayer.hit_flash_end = 0;
    localPlayer.x = canvas.width / 2;  // 重置位置
    localPlayer.y = canvas.height / 2;
    localPlayer.angle = 0;
    
    // 重置武器状态
    if (localPlayer.weapon) {
        localPlayer.weapon.currentAmmo = localPlayer.weapon.maxAmmo;
        localPlayer.weapon.lastFireTime = 0;
        localPlayer.weapon.reloadStartTime = 0;
    }
    
    // 重新初始化角色属性和武器
    setupWeapon(PLAYER_AVATAR.character);
    
    // 重置技能状态
    localPlayer.skills = {
        Q: { active: false, cooldown: 0, cooldownTime: 0, charge: 0, maxCharge: 100, lastChargeTime: 0 },
        E: { active: false, cooldown: 0, cooldownTime: 8, activeTime: 0, activeDuration: 10 },
        rightClick: { active: false, cooldown: 0, cooldownTime: 0, rapidFireQueue: [], lastSpikeTime: 0, spikeCount: 0, selectingPlayer: false, playerList: [] }
    };
    
    // 重置换弹状态
    isReloading = false;
    isShooting = false;
    
    // 强制设置游戏为运行状态
    gameState.gameRunning = true;
    console.log('✓ 强制设置 gameState.gameRunning = true');
    
    init();
    updatePlayerList();
    updateSkillButtons();  // 初始化技能按钮
    
    // 启动游戏循环
    console.log('🎮 启动游戏循环...');
    lastTime = Date.now();
    frameCount = 0;
    loopStarted = false;
    gameLoop();  // 立即启动游戏循环
}

// 显示玩家选择UI（幺幺俊羊羊右键和E技能）
function showPlayerSelectionUI(playerList, title) {
    // 创建或更新选择UI
    let selectionDiv = document.getElementById('playerSelectionUI');
    if (!selectionDiv) {
        selectionDiv = document.createElement('div');
        selectionDiv.id = 'playerSelectionUI';
        selectionDiv.style.position = 'fixed';
        selectionDiv.style.top = '50%';
        selectionDiv.style.left = '50%';
        selectionDiv.style.transform = 'translate(-50%, -50%)';
        selectionDiv.style.background = 'rgba(0, 0, 0, 0.8)';
        selectionDiv.style.padding = '20px';
        selectionDiv.style.borderRadius = '10px';
        selectionDiv.style.zIndex = '10000';
        selectionDiv.style.color = '#ffffff';
        selectionDiv.style.fontSize = '18px';
        selectionDiv.style.textAlign = 'center';
        document.body.appendChild(selectionDiv);
    }
    
    let html = `<div style="margin-bottom: 15px; font-size: 20px; font-weight: bold;">${title}</div>`;
    for (let player of playerList) {
        html += `<div style="margin: 10px 0;">按 <span style="color: #ffff00; font-weight: bold;">${player.index}</span> 选择: ${player.name}</div>`;
    }
    html += `<div style="margin-top: 15px; font-size: 14px; color: #aaaaaa;">再次点击右键/E取消选择</div>`;
    selectionDiv.innerHTML = html;
    selectionDiv.style.display = 'block';
}

// 隐藏玩家选择UI
function hidePlayerSelectionUI() {
    const selectionDiv = document.getElementById('playerSelectionUI');
    if (selectionDiv) {
        selectionDiv.style.display = 'none';
    }
}

// 为玩家赋予泡泡盾（幺幺俊羊羊右键技能）
function applyBubbleShieldToPlayer(targetId) {
    const skill = localPlayer.skills.rightClick;
    
    // 激活技能状态
    skill.active = true;
    skill.activeTime = Date.now() / 1000;
    skill.activeDuration = 3.0;  // 持续3秒
    skill.selectedTargetId = targetId;
    
    // 通知服务器赋予泡泡盾
    socket.emit('apply_bubble_shield', {
        room_key: ROOM_KEY,
        targetId: targetId,
        ownerAttack: localPlayer.stats ? (localPlayer.stats.attack || 0) : 0  // 传递幺幺俊羊羊的攻击力
    });
    
    // 进入冷却
    skill.cooldown = 8.0;
    skill.cooldownTime = 8.0;
    skill.cooldownStart = Date.now() / 1000;
    
    console.log('🍎 幺幺俊羊羊赋予泡泡盾给玩家:', targetId);
    updateSkillButtons();
}

// 拉取队友到位置（幺幺俊羊羊E技能）
function pullTeammateToPosition(targetId) {
    const skill = localPlayer.skills.E;
    
    // 激活技能状态
    skill.active = true;
    skill.activeTime = Date.now() / 1000;
    skill.activeDuration = 3.0;  // 持续3秒（拉取时间）
    skill.selectedTargetId = targetId;
    skill.targetX = localPlayer.x;
    skill.targetY = localPlayer.y;
    
    // 通知服务器拉取队友并赋予泡泡盾
    socket.emit('pull_teammate_with_shield', {
        room_key: ROOM_KEY,
        targetId: targetId,
        targetX: localPlayer.x,
        targetY: localPlayer.y,
        pullSpeed: 20000  // 每秒200像素，加快100倍
    });
    
    // 进入冷却
    skill.cooldown = 5.0;
    skill.cooldownTime = 5.0;
    skill.cooldownStart = Date.now() / 1000;
    
    console.log('🍎 幺幺俊羊羊拉取队友:', targetId, '到位置:', localPlayer.x, localPlayer.y);
    updateSkillButtons();
}

// 切换队伍角色面板
function toggleTeamStatsPanel() {
    const panel = document.getElementById('teamStatsPanel');
    if (!panel) return;
    
    if (panel.style.display === 'none' || !panel.style.display) {
        showTeamStatsPanel();
    } else {
        hideTeamStatsPanel();
    }
}

// 显示队伍角色面板
function showTeamStatsPanel() {
    const panel = document.getElementById('teamStatsPanel');
    const content = document.getElementById('teamStatsContent');
    if (!panel || !content) return;
    
    // 请求所有玩家的角色数据
    socket.emit('request_team_stats', { room_key: ROOM_KEY });
    
    panel.style.display = 'block';
}

// 隐藏队伍角色面板
function hideTeamStatsPanel() {
    const panel = document.getElementById('teamStatsPanel');
    if (!panel) return;
    panel.style.display = 'none';
}

// 更新队伍角色面板内容
function updateTeamStatsPanel(teamStats) {
    const content = document.getElementById('teamStatsContent');
    if (!content || !teamStats) return;
    
    content.innerHTML = '';
    
    // 遍历所有玩家的角色数据
    for (const playerId in teamStats) {
        const playerData = teamStats[playerId];
        const stats = playerData.stats || {};
        const character = playerData.character || '未知';
        const playerName = playerData.name || '未知玩家';
        const isLocalPlayer = playerId === socket.id;
        
        // 获取当前生命值
        const currentHp = gameState.players[playerId] ? (gameState.players[playerId].hp || 0) : 0;
        const maxHp = stats.hp || 1000;
        
        const playerCard = document.createElement('div');
        playerCard.style.cssText = 'background: rgba(102, 126, 234, 0.2); border: 2px solid #667eea; border-radius: 10px; padding: 20px;';
        
        playerCard.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                <img src="/static/${character}1.png" 
                     alt="${character}" 
                     style="width: 60px; height: 60px; border-radius: 8px; background: rgba(255, 255, 255, 0.1);"
                     onerror="this.style.display='none'">
                <div>
                    <h3 style="color: #667eea; margin: 0; font-size: 18px;">${playerName} ${isLocalPlayer ? '(你)' : ''}</h3>
                    <div style="color: #aaa; font-size: 14px; margin-top: 5px;">${character}</div>
                </div>
            </div>
            <div style="margin-bottom: 10px;">
                <div style="color: #fff; font-size: 14px; margin-bottom: 5px;">生命值: ${currentHp} / ${Math.ceil(maxHp)}</div>
                <div style="width: 100%; height: 8px; background: rgba(255, 255, 255, 0.2); border-radius: 4px; overflow: hidden;">
                    <div style="width: ${(currentHp / maxHp * 100).toFixed(1)}%; height: 100%; background: linear-gradient(90deg, #ff0000, #ff6b6b); transition: width 0.3s;"></div>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; color: #ddd;">
                <div>攻击力: <span style="color: #d4af37; font-weight: bold;">${Math.ceil(stats.attack || 0)}</span></div>
                <div>暴击率: <span style="color: #d4af37; font-weight: bold;">${((stats.critRate || 0) * 100).toFixed(1)}%</span></div>
                <div>暴击伤害: <span style="color: #d4af37; font-weight: bold;">${((stats.critDamage || 1.0) * 100).toFixed(0)}%</span></div>
                <div>伤害加成: <span style="color: #d4af37; font-weight: bold;">${((stats.damageBonus || 0) * 100).toFixed(1)}%</span></div>
                <div>治疗加成: <span style="color: #d4af37; font-weight: bold;">${((stats.healingBonus || 0) * 100).toFixed(1)}%</span></div>
                <div>属性强度: <span style="color: #d4af37; font-weight: bold;">${stats.attributePower || 0}</span></div>
                <div>换弹减免: <span style="color: #d4af37; font-weight: bold;">${(stats.reloadReduction || 0).toFixed(2)}秒</span></div>
                <div>快速射击: <span style="color: #d4af37; font-weight: bold;">${(stats.rapidFire || 0).toFixed(2)}秒</span></div>
                <div>额外弹容: <span style="color: #d4af37; font-weight: bold;">${((stats.extraAmmo || 0) * 100).toFixed(1)}%</span></div>
            </div>
        `;
        
        content.appendChild(playerCard);
    }
}

// 关闭按钮事件
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('closeTeamStatsBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            hideTeamStatsPanel();
        });
    }
});

