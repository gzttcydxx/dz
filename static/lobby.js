// 大厅界面JavaScript

const socket = io();

// 获取元素
const roomKeyDisplay = document.getElementById('roomKeyDisplay');
const maxPlayersLobby = document.getElementById('maxPlayersLobby');
const mapSelectLobby = document.getElementById('mapSelectLobby');
const monsterSelectLobby = document.getElementById('monsterSelectLobby');
const playersList = document.getElementById('playersList');
const currentPlayerCount = document.getElementById('currentPlayerCount');
const maxPlayerCount = document.getElementById('maxPlayerCount');
const readyBtn = document.getElementById('readyBtn');
const startGameBtn = document.getElementById('startGameBtn');

// 角色相关元素
const changeNameBtn = document.getElementById('changeNameBtn');
const changeAvatarBtn = document.getElementById('changeAvatarBtn');
const changeNameModal = document.getElementById('changeNameModal');
const changeAvatarModal = document.getElementById('changeAvatarModal');
const newPlayerName = document.getElementById('newPlayerName');
const confirmNameBtn = document.getElementById('confirmNameBtn');
const cancelNameBtn = document.getElementById('cancelNameBtn');
const characterSelect = document.getElementById('characterSelect');
const colorSelect = document.getElementById('colorSelect');
const avatarPreview = document.getElementById('avatarPreview');
const avatarName = document.getElementById('avatarName');
const confirmAvatarBtn = document.getElementById('confirmAvatarBtn');
const cancelAvatarBtn = document.getElementById('cancelAvatarBtn');

// 房间设置相关元素
const roomSettingsBtn = document.getElementById('roomSettingsBtn');
const changeRoomSettingsModal = document.getElementById('changeRoomSettingsModal');
const modalMaxPlayers = document.getElementById('modalMaxPlayers');
const modalMapSelect = document.getElementById('modalMapSelect');
const modalMonsterSelect = document.getElementById('modalMonsterSelect');
const confirmRoomSettingsBtn = document.getElementById('confirmRoomSettingsBtn');
const cancelRoomSettingsBtn = document.getElementById('cancelRoomSettingsBtn');

// 当前房间信息
let currentRoom = null;
let isHost = false;
let isReady = false;
let currentAvatar = { character: '勇者', color: 1 };
let myPlayerId = null; // 当前玩家的Socket ID

// Socket连接状态调试
socket.on('connect', () => {
    console.log('\n=== Socket连接成功 ===');
    console.log('Socket ID:', socket.id);
    myPlayerId = socket.id; // 保存当前玩家的Socket ID
    console.log('我的玩家ID已设置为:', myPlayerId);
    console.log('房间密钥:', ROOM_KEY);
    console.log('玩家名字(PLAYER_NAME):', PLAYER_NAME);
    console.log('PLAYER_NAME类型:', typeof PLAYER_NAME);
    console.log('PLAYER_NAME是否为空:', PLAYER_NAME === '' || PLAYER_NAME === 'None' || !PLAYER_NAME);
    
    // 确保有玩家名字（使用localStorage备份）
    if (!PLAYER_NAME || PLAYER_NAME === '玩家' || PLAYER_NAME === '' || PLAYER_NAME === 'None') {
        console.warn('⚠️ 玩家名为空！尝试从localStorage恢复...');
        const tempName = localStorage.getItem('temp_player_name');
        const tempRoom = localStorage.getItem('temp_room_key');
        console.log('localStorage数据:', {tempName, tempRoom, currentRoom: ROOM_KEY});
        
        if (tempName && tempRoom === ROOM_KEY) {
            PLAYER_NAME = tempName;
            console.log('✓ 成功从localStorage恢复玩家名:', PLAYER_NAME);
        } else {
            console.error('✗ 无法恢复玩家名，使用默认值');
            PLAYER_NAME = '玩家_' + Date.now(); // 使用带时间戳的默认名
        }
    }
    
    console.log('✓ 最终玩家名:', PLAYER_NAME);
    console.log('准备发送join_room_session事件...');
    
    // 先加入房间的Socket会话（传递玩家名字）
    const joinData = { 
        room_key: ROOM_KEY,
        player_name: PLAYER_NAME 
    };
    console.log('发送join_room_session数据:', joinData);
    socket.emit('join_room_session', joinData);
    console.log('✓ join_room_session事件已发送');
    
    // 请求房间信息
    const getInfoData = { room_key: ROOM_KEY };
    console.log('发送get_room_info数据:', getInfoData);
    socket.emit('get_room_info', getInfoData);
    console.log('✓ get_room_info事件已发送');
    
    // 初始化下拉框选项
    setTimeout(() => {
        initializeLobbySelectOptions();
    }, 100);
    
    console.log('========================\n');
});

// Socket连接错误
socket.on('connect_error', (error) => {
    console.error('\n❌ Socket连接错误:', error);
    console.log('========================\n');
});

// Socket断开连接
socket.on('disconnect', (reason) => {
    console.warn('\n⚠️ Socket断开连接:', reason);
    console.log('========================\n');
});

// 监听房间信息更新
socket.on('room_info', (data) => {
    console.log('\n=== 收到 room_info 事件 ===');
    console.log('数据:', data);
    console.log('数据类型:', typeof data);
    console.log('数据是否为null:', data === null);
    console.log('数据是否为undefined:', data === undefined);
    if (data) {
        console.log('room_key:', data.room_key);
        console.log('max_players:', data.max_players);
        console.log('map:', data.map);
        console.log('monster:', data.monster);
        console.log('players数量:', data.players ? data.players.length : 0);
        console.log('current_player_id:', data.current_player_id);
        console.log('host:', data.host);
        console.log('host_name:', data.host_name);
        if (data.players) {
            data.players.forEach((p, i) => {
                console.log(`  玩家${i+1}: id=${p.id}, name='${p.name}', is_host=${p.is_host}, ready=${p.ready}`);
            });
        }
    }
    console.log('========================\n');
    updateRoomDisplay(data);
});

// 监听房间状态更新
socket.on('update_room', (data) => {
    console.log('\n=== 收到 update_room 事件 ===');
    console.log('数据:', data);
    console.log('数据类型:', typeof data);
    console.log('数据是否为null:', data === null);
    console.log('数据是否为undefined:', data === undefined);
    if (data) {
        console.log('room_key:', data.room_key);
        console.log('max_players:', data.max_players);
        console.log('map:', data.map);
        console.log('monster:', data.monster);
        console.log('players数量:', data.players ? data.players.length : 0);
        console.log('current_player_id:', data.current_player_id);
        console.log('host:', data.host);
        console.log('host_name:', data.host_name);
        if (data.players) {
            data.players.forEach((p, i) => {
                console.log(`  玩家${i+1}: id=${p.id}, name='${p.name}', is_host=${p.is_host}, ready=${p.ready}`);
            });
        }
    }
    console.log('==========================\n');
    updateRoomDisplay(data);
});

// 监听房间关闭
socket.on('room_closed', (data) => {
    alert(data.message);
    window.location.href = '/';
});

// 监听房主更换
socket.on('host_changed', (data) => {
    console.log('=== 房主更换 ===');
    console.log(data.message);
    alert(data.message);
});

// 监听新玩家加入
socket.on('player_joined_lobby', (data) => {
    console.log('=== 新玩家加入 ===');
    console.log(data.message);
});

// 监听玩家离开
socket.on('player_left_lobby', (data) => {
    console.log('=== 玩家离开 ===');
    console.log(data.message);
});

// 监听游戏开始
socket.on('game_started', (data) => {
    console.log('\n=== 收到游戏开始事件 ===');
    console.log('事件数据:', data);
    console.log('data.room_key:', data.room_key);
    console.log('当前ROOM_KEY:', ROOM_KEY);
    
    const targetRoomKey = data.room_key || ROOM_KEY;
    const gameUrl = '/game/' + targetRoomKey;
    
    console.log('准备跳转到:', gameUrl);
    console.log('完整URL:', window.location.origin + gameUrl);
    
    // 跳转到游戏界面
    window.location.href = gameUrl;
});

// 监听错误消息
socket.on('error', (data) => {
    alert(data.message);
});

// 更新房间显示
function updateRoomDisplay(data) {
    console.log('\n=== updateRoomDisplay 函数调用 ===');
    console.log('收到的数据:', data);
    console.log('数据是否为null:', data === null);
    console.log('数据是否为undefined:', data === undefined);
    console.log('我的玩家ID (myPlayerId):', myPlayerId);
    console.log('服务器传来的current_player_id:', data.current_player_id);
    
    if (!data) {
        console.error('❌ 数据为空，无法更新显示！');
        return;
    }
    
    console.log('✓ 数据有效，开始更新显示');
    currentRoom = data;
    
    // 使用客户端的socket.id来识别当前玩家，而不是服务器传来的current_player_id
    // 因为广播时current_player_id可能是发送者的ID，而不是接收者的ID
    const currentPlayerId = myPlayerId || socket.id || data.current_player_id;
    console.log('查找当前玩家...');
    console.log('  使用的玩家ID:', currentPlayerId);
    console.log('  players列表:', data.players);
    const currentPlayer = data.players.find(p => p.id === currentPlayerId);
    console.log('  找到的当前玩家:', currentPlayer);
    
    // 如果没找到，尝试使用服务器传来的ID（兼容性处理）
    const fallbackPlayer = currentPlayer || data.players.find(p => p.id === data.current_player_id);
    if (!currentPlayer && fallbackPlayer) {
        console.warn('⚠️ 使用备用方法找到当前玩家:', fallbackPlayer);
    }
    const actualCurrentPlayer = currentPlayer || fallbackPlayer;
    
    isHost = actualCurrentPlayer ? actualCurrentPlayer.is_host : false;
    
    console.log('===== 房间信息更新 =====');
    console.log('当前玩家ID (使用的):', currentPlayerId);
    console.log('当前玩家ID (服务器传来的):', data.current_player_id);
    console.log('房主ID:', data.host);
    console.log('房主名:', data.host_name);
    console.log('是否房主:', isHost);
    console.log('当前玩家信息:', actualCurrentPlayer);
    console.log('玩家列表:', data.players);
    console.log('房间设置: max_players=', data.max_players, ', map=', data.map, ', monster=', data.monster);
    console.log('======================');
    
    // 更新房间设置显示（始终为禁用状态，只能通过弹窗修改）
    console.log('更新房间设置显示...');
    console.log('  maxPlayersLobby元素:', maxPlayersLobby);
    console.log('  mapSelectLobby元素:', mapSelectLobby);
    console.log('  monsterSelectLobby元素:', monsterSelectLobby);
    
    if (maxPlayersLobby) {
        maxPlayersLobby.value = data.max_players;
        maxPlayersLobby.disabled = true;
        console.log('  ✓ maxPlayersLobby已更新为:', data.max_players);
    } else {
        console.error('  ❌ maxPlayersLobby元素不存在！');
    }
    
    if (mapSelectLobby) {
        mapSelectLobby.value = data.map;
        mapSelectLobby.disabled = true;
        console.log('  ✓ mapSelectLobby已更新为:', data.map);
    } else {
        console.error('  ❌ mapSelectLobby元素不存在！');
    }
    
    if (monsterSelectLobby) {
        monsterSelectLobby.value = data.monster;
        monsterSelectLobby.disabled = true;
        console.log('  ✓ monsterSelectLobby已更新为:', data.monster);
    } else {
        console.error('  ❌ monsterSelectLobby元素不存在！');
    }
    
    // 如果是房主，显示"更改房间设置"按钮
    if (isHost) {
        roomSettingsBtn.style.display = 'block';
        console.log('房主权限已启用，显示更改房间设置按钮');
    } else {
        roomSettingsBtn.style.display = 'none';
        console.log('非房主，隐藏更改房间设置按钮');
    }
    
    // 更新玩家列表
    console.log('更新玩家列表...');
    console.log('  players数据:', data.players);
    console.log('  players数量:', data.players ? data.players.length : 0);
    updatePlayersList(data.players, currentPlayerId);
    
    // 更新角色选择下拉菜单，禁用已被其他玩家选择的角色
    updateCharacterSelect(data.players, currentPlayerId);
    
    // 更新玩家计数
    console.log('更新玩家计数...');
    console.log('  currentPlayerCount元素:', currentPlayerCount);
    console.log('  maxPlayerCount元素:', maxPlayerCount);
    if (currentPlayerCount) {
        currentPlayerCount.textContent = data.players ? data.players.length : 0;
        console.log('  ✓ currentPlayerCount已更新为:', data.players ? data.players.length : 0);
    } else {
        console.error('  ❌ currentPlayerCount元素不存在！');
    }
    if (maxPlayerCount) {
        maxPlayerCount.textContent = data.max_players;
        console.log('  ✓ maxPlayerCount已更新为:', data.max_players);
    } else {
        console.error('  ❌ maxPlayerCount元素不存在！');
    }
    
    // 更新准备按钮状态（使用实际找到的当前玩家）
    updateReadyButton(data, currentPlayerId, actualCurrentPlayer);
    
    // 更新开始按钮显示
    if (isHost && data.can_start) {
        startGameBtn.style.display = 'block';
    } else {
        startGameBtn.style.display = 'none';
    }
    
    // 根据准备状态禁用/启用按钮（使用实际找到的当前玩家）
    if (actualCurrentPlayer && actualCurrentPlayer.ready) {
        changeNameBtn.disabled = true;
        changeAvatarBtn.disabled = true;
        changeNameBtn.style.opacity = '0.5';
        changeAvatarBtn.style.opacity = '0.5';
    } else {
        changeNameBtn.disabled = false;
        changeAvatarBtn.disabled = false;
        changeNameBtn.style.opacity = '1';
        changeAvatarBtn.style.opacity = '1';
    }
    
    // 显示/隐藏房间设置按钮（仅房主可见）
    console.log('roomSettingsBtn元素:', roomSettingsBtn);
    if (isHost) {
        roomSettingsBtn.style.display = 'block';
        console.log('✅ 房主身份确认，显示房间设置按钮');
    } else {
        roomSettingsBtn.style.display = 'none';
        console.log('❌ 非房主，隐藏房间设置按钮');
    }
    
    // 如果角色选择弹窗是打开的，更新属性克制关系提示
    if (changeAvatarModal && changeAvatarModal.classList.contains('show')) {
        const currentCharacter = characterSelect ? characterSelect.value : null;
        if (currentCharacter) {
            updateAttributeAdvantageHint(currentCharacter);
        }
    }
}

// 更新玩家列表
function updatePlayersList(players, currentPlayerId) {
    playersList.innerHTML = '';
    
    // 确保有有效的currentPlayerId
    const myId = currentPlayerId || myPlayerId || socket.id;
    
    players.forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        
        const playerInfo = document.createElement('div');
        playerInfo.className = 'player-info';
        
        // 添加角色头像
        if (player.avatar) {
            const avatar = document.createElement('img');
            avatar.className = 'player-avatar';
            avatar.src = `/static/${player.avatar.character}${player.avatar.color}.png`;
            avatar.alt = player.avatar.character;
            avatar.onerror = function() {
                // 如果图片加载失败，使用默认图片或隐藏
                this.style.display = 'none';
            };
            playerInfo.appendChild(avatar);
        }
        
        const playerNameSpan = document.createElement('span');
        playerNameSpan.className = 'player-name';
        
        // 如果是房主，给名字添加特殊样式
        if (player.is_host) {
            playerNameSpan.style.fontWeight = 'bold';
            playerNameSpan.style.color = '#f2994a';
            playerNameSpan.textContent = '👑 ' + player.name;
        } else {
            playerNameSpan.textContent = player.name;
        }
        
        playerInfo.appendChild(playerNameSpan);
        
        // 如果是房主，显示房主标识，并添加特殊样式
        if (player.is_host) {
            playerItem.classList.add('host-player');
            const badge = document.createElement('span');
            badge.className = 'player-badge badge-host';
            badge.textContent = '👑 房主';
            playerInfo.appendChild(badge);
        }
        
        playerItem.appendChild(playerInfo);
        
        // 显示准备状态
        const status = document.createElement('span');
        status.className = 'player-status';
        if (player.ready) {
            status.classList.add('status-ready');
            status.textContent = '已准备';
        } else {
            status.classList.add('status-waiting');
            status.textContent = '未准备';
        }
        playerItem.appendChild(status);
        
        playersList.appendChild(playerItem);
        
        // 如果是当前玩家，保存头像信息（使用客户端的socket.id）
        if (player.id === myId) {
            currentAvatar = player.avatar || { character: '勇者', color: 1 };
            console.log('✓ 更新当前玩家头像:', currentAvatar);
        }
    });
}

// 更新准备按钮状态
function updateReadyButton(data, currentPlayerId, currentPlayer) {
    // 使用传入的currentPlayer，如果没有则根据currentPlayerId查找
    const myId = currentPlayerId || myPlayerId || socket.id;
    const actualPlayer = currentPlayer || data.players.find(p => p.id === myId);
    
    console.log('更新准备按钮状态:');
    console.log('  使用的玩家ID:', myId);
    console.log('  找到的玩家:', actualPlayer);
    
    if (actualPlayer) {
        isReady = actualPlayer.ready;
        console.log('  准备状态:', isReady);
        if (isReady) {
            readyBtn.textContent = '取消准备';
            readyBtn.classList.add('not-ready');
            // 准备后禁用改名和改角色按钮
            changeNameBtn.disabled = true;
            changeAvatarBtn.disabled = true;
            changeNameBtn.style.opacity = '0.5';
            changeAvatarBtn.style.opacity = '0.5';
        } else {
            readyBtn.textContent = '准备';
            readyBtn.classList.remove('not-ready');
            // 未准备时启用改名和改角色按钮
            changeNameBtn.disabled = false;
            changeAvatarBtn.disabled = false;
            changeNameBtn.style.opacity = '1';
            changeAvatarBtn.style.opacity = '1';
        }
    } else {
        console.warn('⚠️ 未找到当前玩家，无法更新准备按钮状态');
    }
}

// 准备按钮点击事件
readyBtn.addEventListener('click', () => {
    socket.emit('toggle_ready', { room_key: ROOM_KEY });
});

// 开始游戏按钮点击事件
startGameBtn.addEventListener('click', () => {
    socket.emit('start_game', { room_key: ROOM_KEY });
});

// 更改房间设置按钮
roomSettingsBtn.addEventListener('click', () => {
    // 设置当前房间设置
    modalMaxPlayers.value = currentRoom.max_players;
    modalMapSelect.value = currentRoom.map;
    modalMonsterSelect.value = currentRoom.monster;
    
    changeRoomSettingsModal.classList.add('show');
});

// 取消更改房间设置
cancelRoomSettingsBtn.addEventListener('click', () => {
    changeRoomSettingsModal.classList.remove('show');
});

// 确认更改房间设置
confirmRoomSettingsBtn.addEventListener('click', () => {
    const newMaxPlayers = parseInt(modalMaxPlayers.value);
    const newMap = modalMapSelect.value;
    const newMonster = modalMonsterSelect.value;
    
    // 检查玩家人数是否合法
    const currentPlayerCount = currentRoom.players.length;
    if (newMaxPlayers < currentPlayerCount) {
        alert(`玩家人数不能小于当前玩家数量（${currentPlayerCount}人）`);
        return;
    }
    
    // 发送更新请求
    socket.emit('update_room_settings', {
        room_key: ROOM_KEY,
        max_players: newMaxPlayers,
        map: newMap,
        monster: newMonster
    });
    
    changeRoomSettingsModal.classList.remove('show');
});

// 更改角色名按钮
changeNameBtn.addEventListener('click', () => {
    changeNameModal.classList.add('show');
    newPlayerName.value = '';
});

// 取消更改角色名
cancelNameBtn.addEventListener('click', () => {
    changeNameModal.classList.remove('show');
});

// 确认更改角色名
confirmNameBtn.addEventListener('click', () => {
    const name = newPlayerName.value.trim();
    if (!name) {
        alert('请输入角色名');
        return;
    }
    
    socket.emit('change_player_name', {
        room_key: ROOM_KEY,
        new_name: name
    });
    
    changeNameModal.classList.remove('show');
});

// 更改角色形象按钮
changeAvatarBtn.addEventListener('click', () => {
    console.log('打开角色选择界面');
    console.log('当前保存的角色:', currentAvatar);
    console.log('当前玩家ID:', myPlayerId || socket.id);
    
    // 从当前房间信息中获取当前玩家的角色（确保是最新的）
    if (currentRoom && currentRoom.players) {
        const myId = myPlayerId || socket.id;
        const myPlayer = currentRoom.players.find(p => p.id === myId);
        if (myPlayer && myPlayer.avatar) {
            currentAvatar = myPlayer.avatar;
            console.log('从房间信息中获取当前角色:', currentAvatar);
        }
    }
    
    // 设置当前角色形象
    if (currentAvatar && currentAvatar.character) {
        characterSelect.value = currentAvatar.character;
        colorSelect.value = currentAvatar.color;
        console.log('设置角色选择器:', characterSelect.value, colorSelect.value);
    } else {
        // 如果没有当前角色，使用默认值
        characterSelect.value = '勇者';
        colorSelect.value = 1;
        console.log('使用默认角色: 勇者, 配色1');
    }
    updateAvatarPreview();
    
    changeAvatarModal.classList.add('show');
});

// 取消更改角色形象
cancelAvatarBtn.addEventListener('click', () => {
    changeAvatarModal.classList.remove('show');
});

// 确认更改角色形象
confirmAvatarBtn.addEventListener('click', () => {
    const character = characterSelect.value;
    const color = parseInt(colorSelect.value);
    
    socket.emit('change_avatar', {
        room_key: ROOM_KEY,
        character: character,
        color: color
    });
    
    changeAvatarModal.classList.remove('show');
});

// 角色或配色改变时更新预览
characterSelect.addEventListener('change', updateAvatarPreview);
colorSelect.addEventListener('change', updateAvatarPreview);

// 更新角色选择下拉菜单，禁用已被其他玩家选择的角色
function updateCharacterSelect(players, currentPlayerId) {
    if (!characterSelect) return;
    
    // 收集已被其他玩家选择的角色
    const selectedCharacters = new Set();
    players.forEach(player => {
        if (player.id !== currentPlayerId && player.avatar && player.avatar.character) {
            selectedCharacters.add(player.avatar.character);
        }
    });
    
    // 更新每个选项的禁用状态
    Array.from(characterSelect.options).forEach(option => {
        const character = option.value;
        if (selectedCharacters.has(character)) {
            option.disabled = true;
            // 保存原始文本（如果还没有保存）
            if (!option.dataset.originalText) {
                option.dataset.originalText = option.textContent;
            }
            option.textContent = `${character} (已被选择)`;
        } else {
            option.disabled = false;
            // 恢复原始文本
            if (option.dataset.originalText) {
                option.textContent = option.dataset.originalText;
            }
        }
    });
}

// 获取属性颜色（与伤害字体颜色一致）
function getAttributeColor(attribute) {
    const colors = window.attributeColors || {
        '物理系': '#ffffff',
        '自然系': '#00ffcc',
        '超能系': '#ff00ff',
        '无属性': '#87ceeb'
    };
    return colors[attribute] || '#000000';
}

// 获取属性标签的CSS类名
function getAttributeTagClass(attribute) {
    const classMap = {
        '物理系': 'physical',
        '自然系': 'nature',
        '超能系': 'psychic',
        '无属性': 'none'
    };
    return classMap[attribute] || 'none';
}

// 创建属性标签HTML（使用简写）
function createAttributeTag(attribute) {
    const tagClass = getAttributeTagClass(attribute);
    // 将属性名称转换为简写
    const shortNames = {
        '物理系': '物理',
        '自然系': '自然',
        '超能系': '超能',
        '无属性': '无'
    };
    const shortName = shortNames[attribute] || attribute;
    return `<span class="attribute-tag-inline ${tagClass}">${shortName}</span>`;
}

// 将select转换为自定义下拉框
function convertSelectToCustom(selectId, attributeMap) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    // 创建包装器
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper';
    
    // 创建自定义select
    const customSelect = document.createElement('div');
    customSelect.className = 'custom-select';
    
    const display = document.createElement('div');
    display.className = 'custom-select-display';
    
    const arrow = document.createElement('span');
    arrow.className = 'custom-select-arrow';
    arrow.textContent = '▼';
    
    const dropdown = document.createElement('div');
    dropdown.className = 'custom-select-dropdown';
    
    // 获取当前选中的选项
    const selectedOption = select.options[select.selectedIndex];
    const selectedAttribute = selectedOption.getAttribute('data-attribute') || 
                             (attributeMap && attributeMap[selectedOption.value]) || 
                             '';
    
    // 设置显示内容
    display.innerHTML = `${selectedOption.value} ${selectedAttribute ? createAttributeTag(selectedAttribute) : ''}`;
    
    // 创建选项
    Array.from(select.options).forEach((option, index) => {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'custom-select-option';
        if (index === select.selectedIndex) {
            optionDiv.classList.add('selected');
        }
        
        const attribute = option.getAttribute('data-attribute') || 
                        (attributeMap && attributeMap[option.value]) || 
                        '';
        
        optionDiv.innerHTML = `${option.value} ${attribute ? createAttributeTag(attribute) : ''}`;
        
        optionDiv.addEventListener('click', () => {
            // 更新select的值
            select.selectedIndex = index;
            select.dispatchEvent(new Event('change'));
            
            // 更新显示
            display.innerHTML = `${option.value} ${attribute ? createAttributeTag(attribute) : ''}`;
            
            // 更新选中状态
            dropdown.querySelectorAll('.custom-select-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            optionDiv.classList.add('selected');
            
            // 关闭下拉框
            customSelect.classList.remove('open');
        });
        
        dropdown.appendChild(optionDiv);
    });
    
    // 组装
    customSelect.appendChild(display);
    customSelect.appendChild(arrow);
    customSelect.appendChild(dropdown);
    wrapper.appendChild(customSelect);
    
    // 隐藏原始select
    select.style.display = 'none';
    
    // 插入包装器
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    
    // 点击事件
    customSelect.addEventListener('click', (e) => {
        e.stopPropagation();
        customSelect.classList.toggle('open');
    });
    
    // 点击外部关闭
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            customSelect.classList.remove('open');
        }
    });
    
    // 监听原始select的变化（如果通过代码改变）
    select.addEventListener('change', () => {
        const selectedOption = select.options[select.selectedIndex];
        const selectedAttribute = selectedOption.getAttribute('data-attribute') || 
                                 (attributeMap && attributeMap[selectedOption.value]) || 
                                 '';
        display.innerHTML = `${selectedOption.value} ${selectedAttribute ? createAttributeTag(selectedAttribute) : ''}`;
        
        // 更新选中状态
        dropdown.querySelectorAll('.custom-select-option').forEach((opt, idx) => {
            opt.classList.toggle('selected', idx === select.selectedIndex);
        });
    });
}

// 初始化下拉框选项（转换为自定义下拉框）
function initializeLobbySelectOptions() {
    // 将角色选择下拉框转换为自定义下拉框
    if (characterSelect) {
        convertSelectToCustom('characterSelect', window.characterAttributes);
    }
    
    // 将怪物选择下拉框转换为自定义下拉框
    const monsterSelects = ['settingsMonster', 'modalMonsterSelect'];
    monsterSelects.forEach(selectId => {
        convertSelectToCustom(selectId, window.enemyAttributes);
    });
}

// 更新头像预览
function updateAvatarPreview() {
    const character = characterSelect.value;
    const color = colorSelect.value;
    const imagePath = `/static/${character}${color}.png`;
    
    console.log('加载图片:', imagePath);
    
    avatarPreview.src = imagePath;
    avatarName.textContent = `${character} - 配色${color}`;
    
    // 更新属性克制关系提示
    updateAttributeAdvantageHint(character);
    
    // 重置错误处理
    avatarPreview.onerror = function() {
        console.warn('图片加载失败:', imagePath);
        avatarName.textContent = `${character} - 配色${color}（图片未找到）`;
        // 显示一个占位符或者默认样式
        this.style.background = '#ddd';
    };
    
    avatarPreview.onload = function() {
        console.log('图片加载成功:', imagePath);
        this.style.background = '#f8f9fa';
    };
}

// 更新属性克制关系提示
function updateAttributeAdvantageHint(character) {
    const hintElement = document.getElementById('attributeAdvantageHint');
    const textElement = document.getElementById('attributeAdvantageText');
    
    if (!hintElement || !textElement) {
        console.warn('属性克制关系提示元素不存在');
        return;
    }
    
    // 检查是否有房间信息和配置
    if (!currentRoom || !window.characterAttributes || !window.enemyAttributes || !window.attributeAdvantage) {
        hintElement.style.display = 'none';
        return;
    }
    
    const currentMonster = currentRoom.monster;
    if (!currentMonster) {
        hintElement.style.display = 'none';
        return;
    }
    
    const characterAttribute = window.characterAttributes[character] || '无属性';
    const enemyAttribute = window.enemyAttributes[currentMonster] || '无属性';
    
    // 计算克制关系
    let advantageText = '';
    let hintColor = '#333';
    
    // 王子栗特殊处理：显示被动技能说明
    if (character === '王子栗') {
        if (enemyAttribute === '无属性') {
            // 敌人是无属性，不显示克制关系
            hintElement.style.display = 'none';
            return;
        }
        
        // 检查敌人是否有属性（物理/自然/超能）
        if (enemyAttribute === '物理系' || enemyAttribute === '自然系' || enemyAttribute === '超能系') {
            // 根据敌人属性，显示会被克制的属性
            let counterAttribute = '';
            if (enemyAttribute === '物理系') {
                counterAttribute = '超能系';
            } else if (enemyAttribute === '自然系') {
                counterAttribute = '物理系';
            } else if (enemyAttribute === '超能系') {
                counterAttribute = '自然系';
            }
            
            advantageText = `✨ 被动效果：对${enemyAttribute}敌人造成伤害时，伤害转变为${counterAttribute}（克制${enemyAttribute}）`;
            hintColor = '#667eea'; // 紫色，表示特殊效果
            hintElement.style.background = 'rgba(102, 126, 234, 0.15)';
            hintElement.style.border = '2px solid rgba(102, 126, 234, 0.5)';
            
            textElement.textContent = advantageText;
            textElement.style.color = hintColor;
            hintElement.style.display = 'block';
            return;
        }
    }
    
    // 如果角色或敌人是无属性，不显示克制关系
    if (characterAttribute === '无属性' || enemyAttribute === '无属性') {
        hintElement.style.display = 'none';
        return;
    }
    
    // 检查角色是否克制敌人
    if (window.attributeAdvantage[characterAttribute] === enemyAttribute) {
        // 角色克制敌人
        advantageText = `✓ 优势：${characterAttribute}克制${enemyAttribute}，对敌人造成额外伤害`;
        hintColor = '#28a745'; // 绿色，表示优势
        hintElement.style.background = 'rgba(40, 167, 69, 0.15)';
        hintElement.style.border = '2px solid rgba(40, 167, 69, 0.5)';
    } else if (window.attributeAdvantage[enemyAttribute] === characterAttribute) {
        // 敌人克制角色
        advantageText = `✗ 劣势：${enemyAttribute}克制${characterAttribute}，敌人对你造成额外伤害`;
        hintColor = '#dc3545'; // 红色，表示劣势
        hintElement.style.background = 'rgba(220, 53, 69, 0.15)';
        hintElement.style.border = '2px solid rgba(220, 53, 69, 0.5)';
    } else {
        // 无克制关系
        advantageText = `○ 平衡：${characterAttribute}与${enemyAttribute}无克制关系`;
        hintColor = '#6c757d'; // 灰色，表示平衡
        hintElement.style.background = 'rgba(108, 117, 125, 0.15)';
        hintElement.style.border = '2px solid rgba(108, 117, 125, 0.5)';
    }
    
    textElement.textContent = advantageText;
    textElement.style.color = hintColor;
    hintElement.style.display = 'block';
}

// 点击模态框外部关闭
window.addEventListener('click', (e) => {
    if (e.target === changeNameModal) {
        changeNameModal.classList.remove('show');
    }
    if (e.target === changeAvatarModal) {
        changeAvatarModal.classList.remove('show');
    }
    if (e.target === changeRoomSettingsModal) {
        changeRoomSettingsModal.classList.remove('show');
    }
});

// 返回主页按钮
const backToHomeBtn = document.getElementById('backToHomeBtn');
if (backToHomeBtn) {
    backToHomeBtn.addEventListener('click', () => {
        // 发送退出房间事件
        socket.emit('leave_lobby', { room_key: ROOM_KEY });
        // 跳转到主页
        window.location.href = '/';
    });
}

// 页面关闭前断开连接
window.addEventListener('beforeunload', () => {
    socket.disconnect();
});

// ==================== 聊天系统 ====================

// 获取聊天相关元素
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const emojiToggleBtn = document.getElementById('emojiToggleBtn');
const emojiPanel = document.getElementById('emojiPanel');

// 初始化表情包
function initEmojis() {
    const emojiPanel = document.getElementById('emojiPanel');
    if (!emojiPanel) return;
    
    // 表情包编号从1到10
    for (let i = 1; i <= 10; i++) {
        const emojiItem = document.createElement('div');
        emojiItem.className = 'emoji-item';
        emojiItem.innerHTML = `<img src="/static/表情包/${i}.png" alt="表情${i}" onerror="this.parentElement.style.display='none'">`;
        emojiItem.addEventListener('click', () => {
            insertEmoji(i);
        });
        emojiPanel.appendChild(emojiItem);
    }
}

// 插入表情包到输入框
function insertEmoji(emojiNumber) {
    const input = document.getElementById('chatInput');
    if (!input) return;
    
    // 在光标位置插入表情标记
    const cursorPos = input.selectionStart;
    const textBefore = input.value.substring(0, cursorPos);
    const textAfter = input.value.substring(cursorPos);
    
    // 使用特殊标记来表示表情包，格式：[emoji:数字]
    input.value = textBefore + `[emoji:${emojiNumber}]` + textAfter;
    
    // 恢复光标位置
    const newCursorPos = cursorPos + `[emoji:${emojiNumber}]`.length;
    input.setSelectionRange(newCursorPos, newCursorPos);
    input.focus();
    
    // 关闭表情面板
    emojiPanel.style.display = 'none';
}

// 切换表情面板显示
if (emojiToggleBtn && emojiPanel) {
    emojiToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (emojiPanel.style.display === 'none' || !emojiPanel.style.display) {
            emojiPanel.style.display = 'grid';
        } else {
            emojiPanel.style.display = 'none';
        }
    });
    
    // 点击外部关闭表情面板
    document.addEventListener('click', (e) => {
        if (!emojiPanel.contains(e.target) && e.target !== emojiToggleBtn) {
            emojiPanel.style.display = 'none';
        }
    });
}

// 发送聊天消息
function sendChatMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    
    socket.emit('send_lobby_message', {
        room_key: ROOM_KEY,
        message: message
    });
    
    chatInput.value = '';
    chatInput.focus();
}

// 发送按钮点击事件
if (sendChatBtn) {
    sendChatBtn.addEventListener('click', sendChatMessage);
}

// 输入框回车发送
if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
}

// 接收聊天消息
socket.on('lobby_message', (data) => {
    addChatMessage(data.player_name, data.message, data.is_own);
});

// 添加聊天消息到界面
function addChatMessage(playerName, message, isOwn) {
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isOwn ? 'own-message' : 'other-message'}`;
    
    // 处理消息中的表情包标记 [emoji:数字]
    let processedMessage = message;
    const emojiRegex = /\[emoji:(\d+)\]/g;
    processedMessage = processedMessage.replace(emojiRegex, (match, emojiNumber) => {
        return `<img src="/static/表情包/${emojiNumber}.png" alt="表情${emojiNumber}" class="message-emoji" onerror="this.style.display='none'">`;
    });
    
    // 获取当前时间
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    messageDiv.innerHTML = `
        <div class="message-sender">${isOwn ? '我' : playerName}</div>
        <div class="message-content">${processedMessage}</div>
        <div class="message-time">${timeString}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
    
    // 自动滚动到底部
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 页面加载时初始化表情包
document.addEventListener('DOMContentLoaded', () => {
    initEmojis();
});

