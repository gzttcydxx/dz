// 主界面JavaScript
const socket = io();

// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', function() {
    console.log('页面加载完成');
    
    // 初始化下拉框选项
    initializeSelectOptions();
    
    // 自动隐藏Flash消息
    setTimeout(() => {
        const flashMessages = document.querySelectorAll('.flash-message');
        flashMessages.forEach(msg => {
            msg.style.transition = 'opacity 0.5s';
            msg.style.opacity = '0';
            setTimeout(() => msg.remove(), 500);
        });
    }, 3000);
    
    // 获取元素（可能不存在，如果用户未登录）
    const startGameBtn = document.getElementById('startGameBtn');
    const viewCharactersBtn = document.getElementById('viewCharactersBtn');
    const viewEquipmentBtn = document.getElementById('viewEquipmentBtn');
    const gachaBtn = document.getElementById('gachaBtn');
    const viewCharactersModal = document.getElementById('viewCharactersModal');
    const viewEquipmentModal = document.getElementById('viewEquipmentModal');
    const closeViewCharactersModal = document.getElementById('closeViewCharactersModal');
    const closeViewEquipmentModal = document.getElementById('closeViewEquipmentModal');
    const modeModal = document.getElementById('modeModal');
    const closeModeModal = document.getElementById('closeModeModal');
    const createRoomBtn = document.getElementById('createRoomBtn');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const createRoomModal = document.getElementById('createRoomModal');
    const closeCreateModal = document.getElementById('closeCreateModal');
    const createRoomForm = document.getElementById('createRoomForm');
    const joinRoomModal = document.getElementById('joinRoomModal');
    const closeJoinModal = document.getElementById('closeJoinModal');
    const joinRoomForm = document.getElementById('joinRoomForm');
    const joinError = document.getElementById('joinError');
    
    // 如果用户未登录，这些元素不存在，直接返回
    if (!startGameBtn) {
        console.log('用户未登录，跳过游戏相关功能');
        return;
    }
    
    // 查看角色按钮
    if (viewCharactersBtn && viewCharactersModal) {
        viewCharactersBtn.addEventListener('click', () => {
            viewCharactersModal.classList.add('show');
            // 默认选中第一个角色
            const firstAvatar = document.querySelector('.character-avatar-item');
            if (firstAvatar) {
                selectCharacter(firstAvatar.dataset.character);
            }
        });
        
        if (closeViewCharactersModal) {
            closeViewCharactersModal.addEventListener('click', () => {
                viewCharactersModal.classList.remove('show');
            });
        }
        
        // 角色头像点击事件
        const avatarItems = document.querySelectorAll('.character-avatar-item');
        avatarItems.forEach(item => {
            item.addEventListener('click', () => {
                const charName = item.dataset.character;
                selectCharacter(charName);
            });
        });
    }
    
    // 查看装备按钮
    if (viewEquipmentBtn && viewEquipmentModal) {
        viewEquipmentBtn.addEventListener('click', () => {
            viewEquipmentModal.classList.add('show');
            currentViewMode = 'equipment';  // 默认显示装备
            renderEquipmentList();
        });
        
        if (closeViewEquipmentModal) {
            closeViewEquipmentModal.addEventListener('click', () => {
                viewEquipmentModal.classList.remove('show');
            });
        }
    }
    
    // 装备/武器切换
    let currentViewMode = 'equipment';  // 'equipment' 或 'weapon'
    const viewEquipmentTab = document.getElementById('viewEquipmentTab');
    const viewWeaponTab = document.getElementById('viewWeaponTab');
    
    if (viewEquipmentTab) {
        viewEquipmentTab.addEventListener('click', () => {
            currentViewMode = 'equipment';
            viewEquipmentTab.className = 'btn btn-primary';
            viewWeaponTab.className = 'btn btn-secondary';
            renderEquipmentList();
        });
    }
    
    if (viewWeaponTab) {
        viewWeaponTab.addEventListener('click', () => {
            currentViewMode = 'weapon';
            viewEquipmentTab.className = 'btn btn-secondary';
            viewWeaponTab.className = 'btn btn-primary';
            renderWeaponList();
        });
    }
    
    // 抽卡页面按钮
    if (gachaBtn) {
        gachaBtn.addEventListener('click', () => {
            window.location.href = '/gacha';
        });
    }
    
    // 渲染装备列表
    function renderEquipmentList() {
        if (currentViewMode !== 'equipment') return;
        
        const equipmentList = document.getElementById('equipmentList');
        if (!equipmentList) return;
        
        const equipment = window.userEquipment || [];
        
        if (equipment.length === 0) {
            equipmentList.innerHTML = '<div style="color: #000; text-align: center; padding: 20px;">暂无装备</div>';
            const infoPanel = document.getElementById('equipmentInfoContent');
            if (infoPanel) {
                infoPanel.innerHTML = '<div style="text-align: center; color: rgba(0, 0, 0, 0.6); padding: 40px;">暂无装备</div>';
            }
            return;
        }
        
        // 装备名称到图标文件名的映射
        const equipmentIconMap = {
            '量天尺': '量天尺.png',
            '量天尺子': '量天尺.png',  // 兼容旧名称
            '拂尘巾': '拂尘巾.png',
            '诵音筒': '诵音筒.png',
            '采访麦克风': '采访麦克风.png',
            '洗脸巾': '洗脸巾.png',
            '黑色面膜': '黑色面膜.png',
            '寂明灯': '寂明灯.png',
            '虹气结': '虹气结.png',
            '胡桃藤': '胡桃藤.png'
        };
        
        // 根据等级获取发光颜色
        function getGlowColor(level) {
            const colors = {
                0: 'none',      // 无特效
                1: '#00ff00',   // 绿色
                2: '#0080ff',   // 蓝色
                3: '#8000ff',   // 紫色
                4: '#ff0000',   // 红色
                5: '#ffd700'    // 金色
            };
            return colors[level] || 'none';
        }
        
        // 获取已查看的装备ID列表（从localStorage）
        const viewedEquipment = JSON.parse(localStorage.getItem('viewedEquipment') || '[]');
        
        equipmentList.innerHTML = equipment.map((eq, index) => {
            const slotNames = { 'weapon': '执器', 'accessory': '挂坠', 'headwear': '头饰' };
            const iconFile = equipmentIconMap[eq.name] || null;
            const level = eq.level || 0;
            const glowColor = getGlowColor(level);
            const glowStyle = glowColor !== 'none' ? 
                `box-shadow: 0 0 10px ${glowColor}, 0 0 20px ${glowColor};` : '';
            const isNew = !viewedEquipment.includes(eq.id);
            
            return `
                <div class="equipment-item" 
                     data-index="${index}"
                     style="background: rgba(255, 255, 255, 0.1); padding: 15px; border-radius: 10px; border: 2px solid rgba(255, 255, 255, 0.3); cursor: pointer; transition: all 0.3s; display: flex; align-items: center; gap: 10px; position: relative;">
                    ${isNew ? '<div style="position: absolute; top: 5px; right: 5px; background: #ff0000; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: bold; z-index: 10;">NEW</div>' : ''}
                    ${iconFile ? `<img src="/static/${iconFile}" alt="${eq.name}" style="width: 50px; height: 50px; border-radius: 5px; background: rgba(255, 255, 255, 0.1); flex-shrink: 0; ${glowStyle}" onerror="this.style.display='none'">` : ''}
                    <div style="flex: 1; min-width: 0;">
                        <div style="color: #000; font-weight: bold; margin-bottom: 5px;">${eq.name}</div>
                        <div style="color: #333; font-size: 0.9em;">${slotNames[eq.slot] || eq.slot} | 等级: ${level}/5</div>
                    </div>
                </div>
            `;
        }).join('');
        
        // 添加点击事件
        equipmentList.querySelectorAll('.equipment-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                selectEquipment(index);
            });
        });
        
        // 默认选中第一个
        if (equipment.length > 0) {
            selectEquipment(0);
        }
    }
    
    // 选择装备并显示详情
    function selectEquipment(index) {
        const equipment = window.userEquipment || [];
        if (index < 0 || index >= equipment.length) return;
        
        const eq = equipment[index];
        
        // 标记为已查看
        const viewedEquipment = JSON.parse(localStorage.getItem('viewedEquipment') || '[]');
        const wasNew = !viewedEquipment.includes(eq.id);
        if (wasNew) {
            viewedEquipment.push(eq.id);
            localStorage.setItem('viewedEquipment', JSON.stringify(viewedEquipment));
            
            // 移除NEW标记
            const item = document.querySelectorAll('.equipment-item')[index];
            if (item) {
                const newBadge = item.querySelector('div[style*="background: #ff0000"]');
                if (newBadge) {
                    newBadge.remove();
                }
            }
        }
        const slotNames = { 'weapon': '执器', 'accessory': '挂坠', 'headwear': '头饰' };
        
        // 更新选中状态
        document.querySelectorAll('.equipment-item').forEach((item, i) => {
            if (i === index) {
                item.style.border = '3px solid #4a9eff';
                item.style.background = 'rgba(74, 158, 255, 0.2)';
            } else {
                item.style.border = '2px solid rgba(255, 255, 255, 0.3)';
                item.style.background = 'rgba(255, 255, 255, 0.1)';
            }
        });
        
        // 格式化属性值
        function formatStatValue(stat) {
            if (stat.type === 'percent') {
                return `${(stat.value * 100).toFixed(1)}%`;
            } else if (stat.type === 'time') {
                return `${stat.value.toFixed(2)}秒`;
            } else {
                return stat.value.toString();
            }
        }
        
        // 装备名称到图标文件名的映射
        const equipmentIconMap = {
            '量天尺': '量天尺.png',
            '量天尺子': '量天尺.png',  // 兼容旧名称
            '拂尘巾': '拂尘巾.png',
            '诵音筒': '诵音筒.png',
            '采访麦克风': '采访麦克风.png',
            '洗脸巾': '洗脸巾.png',
            '黑色面膜': '黑色面膜.png',
            '寂明灯': '寂明灯.png',
            '虹气结': '虹气结.png',
            '胡桃藤': '胡桃藤.png'
        };
        const iconFile = equipmentIconMap[eq.name] || null;
        const level = eq.level || 0;
        
        // 根据等级获取发光颜色
        function getGlowColor(level) {
            const colors = {
                0: 'none',      // 无特效
                1: '#00ff00',   // 绿色
                2: '#0080ff',   // 蓝色
                3: '#8000ff',   // 紫色
                4: '#ff0000',   // 红色
                5: '#ffd700'    // 金色
            };
            return colors[level] || 'none';
        }
        
        const glowColor = getGlowColor(level);
        const glowStyle = glowColor !== 'none' ? 
            `box-shadow: 0 0 20px ${glowColor}, 0 0 40px ${glowColor}, 0 0 60px ${glowColor};` : '';
        
        // 生成装备详情HTML
        const infoHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                ${iconFile ? 
                    `<div style="position: relative; display: inline-block;">
                        <img src="/static/${iconFile}" alt="${eq.name}" style="width: 120px; height: 120px; border-radius: 10px; margin: 0 auto 15px; display: block; background: rgba(0, 0, 0, 0.1); ${glowStyle}" onerror="this.style.display='none'">
                    </div>` :
                    `<div style="width: 120px; height: 120px; background: rgba(0, 0, 0, 0.1); border-radius: 10px; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center; font-size: 48px; ${glowStyle}">
                    ${eq.name.charAt(0)}
                    </div>`
                }
                <h3 style="color: #000; margin: 0; font-weight: bold; font-family: 'Microsoft YaHei', 'SimHei', sans-serif;">${eq.name}</h3>
                <div style="color: #d4af37; font-size: 1.1em; margin-top: 5px; font-weight: bold;">等级: ${level}/5</div>
            </div>
            
            <div style="color: #000; line-height: 2; font-weight: bold; font-family: 'Microsoft YaHei', 'SimHei', sans-serif;">
                <div style="margin-bottom: 15px;">
                    <div><strong>部件：</strong><span style="color: #d4af37;">${slotNames[eq.slot] || eq.slot}</span></div>
                    <div><strong>套装：</strong><span style="color: #d4af37;">${eq.set}</span></div>
                </div>
                
                <div style="margin-top: 20px; margin-bottom: 15px;">
                    <h4 style="color: #000; margin-bottom: 10px; font-weight: bold;">主词条</h4>
                    <div style="color: #d4af37; font-size: 1.1em;">
                        ${eq.mainStat.name}: ${formatStatValue(eq.mainStat)}
                    </div>
                </div>
                
                <div style="margin-top: 20px;">
                    <h4 style="color: #000; margin-bottom: 10px; font-weight: bold;">副词条</h4>
                    ${eq.subStats.map(sub => {
                        const upgradeCount = sub.upgradeCount || 0;
                        const isUpgraded = upgradeCount > 0;
                        const textColor = isUpgraded ? '#d4af37' : '#666';  // 强化过的显示金色
                        const circleNumber = isUpgraded ? 
                            `<span style="display: inline-block; width: 26px; height: 26px; line-height: 26px; text-align: center; border-radius: 50%; border: 2px solid #d4af37; background: transparent; color: #d4af37; font-weight: bold; font-size: 0.85em; margin-right: 10px; flex-shrink: 0;">${upgradeCount}</span>` : 
                            '';
                        return `
                        <div style="color: ${textColor}; margin-bottom: 8px; display: flex; align-items: center; font-weight: ${isUpgraded ? 'bold' : 'normal'};">
                            ${circleNumber}
                            <span>${sub.name}: ${formatStatValue(sub)}</span>
                        </div>
                    `;
                    }).join('')}
                </div>
            </div>
        `;
        
        const infoPanel = document.getElementById('equipmentInfoContent');
        if (infoPanel) {
            infoPanel.innerHTML = infoHTML;
            
            // 添加强化按钮
            const upgradeBtn = document.createElement('button');
            upgradeBtn.className = 'btn btn-primary';
            upgradeBtn.id = 'upgradeEquipmentBtn';
            upgradeBtn.textContent = level >= 5 ? '已达到最高等级' : '强化等级';
            upgradeBtn.disabled = level >= 5;
            upgradeBtn.style.cssText = 'position: absolute; bottom: 20px; right: 20px;';
            upgradeBtn.onclick = () => upgradeEquipment(eq.id, index);
            
            // 移除旧的按钮（如果存在）
            const oldBtn = document.getElementById('upgradeEquipmentBtn');
            if (oldBtn) {
                oldBtn.remove();
            }
            
            // 添加按钮到面板
            const panel = document.getElementById('equipmentInfoPanel');
            if (panel) {
                panel.style.position = 'relative';
                panel.appendChild(upgradeBtn);
            }
        }
    }
    
    // 渲染武器列表
    function renderWeaponList() {
        if (currentViewMode !== 'weapon') return;
        
        const equipmentList = document.getElementById('equipmentList');
        if (!equipmentList) return;
        
        const weapons = window.userWeapons || [];
        
        if (weapons.length === 0) {
            equipmentList.innerHTML = '<div style="color: #000; text-align: center; padding: 20px;">暂无武器</div>';
            const infoPanel = document.getElementById('equipmentInfoContent');
            if (infoPanel) {
                infoPanel.innerHTML = '<div style="text-align: center; color: rgba(0, 0, 0, 0.6); padding: 40px;">暂无武器</div>';
            }
            return;
        }
        
        // 获取已查看的武器ID列表（从localStorage）
        const viewedWeapons = JSON.parse(localStorage.getItem('viewedWeapons') || '[]');
        
        // 根据星级获取发光颜色
        function getWeaponGlowColor(star) {
            const colors = {
                3: '#4a90e2',   // 蓝色（三星）
                4: '#9b59b6',   // 紫色（四星）
                5: '#f1c40f'    // 金色（五星）
            };
            return colors[star] || 'none';
        }
        
        equipmentList.innerHTML = weapons.map((weapon, index) => {
            const star = weapon.star || 3;
            const glowColor = getWeaponGlowColor(star);
            const glowStyle = `box-shadow: 0 0 10px ${glowColor}, 0 0 20px ${glowColor}, 0 0 30px ${glowColor};`;
            const isNew = !viewedWeapons.includes(weapon.id);
            
            return `
                <div class="weapon-item" 
                     data-index="${index}"
                     style="background: rgba(255, 255, 255, 0.1); padding: 15px; border-radius: 10px; border: 2px solid rgba(255, 255, 255, 0.3); cursor: pointer; transition: all 0.3s; display: flex; align-items: center; gap: 10px; position: relative;">
                    ${isNew ? '<div style="position: absolute; top: 5px; right: 5px; background: #ff0000; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: bold; z-index: 10;">NEW</div>' : ''}
                    <img src="/static/武器/${weapon.name}.png" 
                         alt="${weapon.name}" 
                         style="width: 50px; height: 50px; border-radius: 5px; background: rgba(255, 255, 255, 0.1); flex-shrink: 0; ${glowStyle}" 
                         onerror="this.style.display='none'; this.parentElement.innerHTML+='<div style=\\'width:50px;height:50px;background:rgba(255,255,255,0.1);border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:24px;${glowStyle}\\'>⚔️</div>'">
                    <div style="flex: 1; min-width: 0;">
                        <div style="color: #000; font-weight: bold; margin-bottom: 5px;">${weapon.name}</div>
                        <div style="color: #333; font-size: 0.9em;">${star}★</div>
                    </div>
                </div>
            `;
        }).join('');
        
        // 添加点击事件
        equipmentList.querySelectorAll('.weapon-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                selectWeapon(index);
            });
        });
        
        // 默认选中第一个
        if (weapons.length > 0) {
            selectWeapon(0);
        }
    }
    
    // 选择武器并显示详情
    function selectWeapon(index) {
        const weapons = window.userWeapons || [];
        if (index < 0 || index >= weapons.length) return;
        
        const weapon = weapons[index];
        const star = weapon.star || 3;
        
        // 标记为已查看
        const viewedWeapons = JSON.parse(localStorage.getItem('viewedWeapons') || '[]');
        const wasNew = !viewedWeapons.includes(weapon.id);
        if (wasNew) {
            viewedWeapons.push(weapon.id);
            localStorage.setItem('viewedWeapons', JSON.stringify(viewedWeapons));
            
            // 移除NEW标记
            const item = document.querySelectorAll('.weapon-item')[index];
            if (item) {
                const newBadge = item.querySelector('div[style*="background: #ff0000"]');
                if (newBadge) {
                    newBadge.remove();
                }
            }
        }
        
        // 更新选中状态
        document.querySelectorAll('.weapon-item').forEach((item, i) => {
            if (i === index) {
                item.style.border = '3px solid #4a9eff';
                item.style.background = 'rgba(74, 158, 255, 0.2)';
            } else {
                item.style.border = '2px solid rgba(255, 255, 255, 0.3)';
                item.style.background = 'rgba(255, 255, 255, 0.1)';
            }
        });
        
        // 根据星级获取发光颜色
        function getWeaponGlowColor(star) {
            const colors = {
                3: '#4a90e2',   // 蓝色（三星）
                4: '#9b59b6',   // 紫色（四星）
                5: '#f1c40f'    // 金色（五星）
            };
            return colors[star] || 'none';
        }
        
        const glowColor = getWeaponGlowColor(star);
        const glowStyle = `box-shadow: 0 0 20px ${glowColor}, 0 0 40px ${glowColor}, 0 0 60px ${glowColor};`;
        
        // 生成武器详情HTML
        const infoHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="position: relative; display: inline-block;">
                    <img src="/static/武器/${weapon.name}.png" 
                         alt="${weapon.name}" 
                         style="width: 120px; height: 120px; border-radius: 10px; margin: 0 auto 15px; display: block; background: rgba(0, 0, 0, 0.1); ${glowStyle}" 
                         onerror="this.style.display='none'; this.parentElement.innerHTML+='<div style=\\'width:120px;height:120px;background:rgba(0,0,0,0.1);border-radius:10px;margin:0 auto 15px;display:flex;align-items:center;justify-content:center;font-size:48px;${glowStyle}\\'>⚔️</div>'">
                </div>
                <h3 style="color: #000; margin: 0; font-weight: bold; font-family: 'Microsoft YaHei', 'SimHei', sans-serif;">${weapon.name}</h3>
                <div style="color: ${glowColor}; font-size: 1.1em; margin-top: 5px; font-weight: bold;">${star}★ 武器</div>
            </div>
        `;
        
        const infoPanel = document.getElementById('equipmentInfoContent');
        if (infoPanel) {
            infoPanel.innerHTML = infoHTML;
        }
    }
    
    // 强化装备
    function upgradeEquipment(equipmentId, equipmentIndex) {
        const btn = document.getElementById('upgradeEquipmentBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '强化中...';
        }
        
        fetch('/upgrade_equipment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                equipment_id: equipmentId
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // 更新装备数据
                window.userEquipment[equipmentIndex] = data.equipment;
                
                // 更新道具数量显示（如果服务器返回了剩余数量）
                if (data.refinement_material !== undefined) {
                    const refinementMaterialElement = document.querySelector('.item-display .item:first-child .item-count');
                    if (refinementMaterialElement) {
                        refinementMaterialElement.textContent = data.refinement_material;
                    }
                }
                
                // 重新渲染装备列表和详情
                renderEquipmentList();
                selectEquipment(equipmentIndex);
                
                // 显示成功消息
                const boostedStat = data.boosted_stat;
                let boostText = '';
                if (boostedStat.type === 'percent') {
                    boostText = `${(boostedStat.boost * 100).toFixed(1)}%`;
                } else if (boostedStat.type === 'time') {
                    boostText = `${boostedStat.boost.toFixed(2)}秒`;
                } else {
                    boostText = `${boostedStat.boost}`;
                }
                
                alert(`强化成功！\n${boostedStat.name} 提升了 ${boostText}\n剩余叠志精心料：${data.refinement_material || 0}个`);
            } else {
                alert('强化失败：' + data.message);
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '强化等级';
                }
            }
        })
        .catch(error => {
            console.error('强化装备错误:', error);
            alert('强化失败，请重试');
            if (btn) {
                btn.disabled = false;
                btn.textContent = '强化等级';
            }
        });
    }
    
    // 渲染装备槽位
    function renderEquipmentSlot(slot, slotName, equipmentId, charName) {
        const equipment = window.userEquipment || [];
        const equipmentIconMap = {
            '量天尺': '量天尺.png',
            '量天尺子': '量天尺.png',
            '拂尘巾': '拂尘巾.png',
            '诵音筒': '诵音筒.png',
            '采访麦克风': '采访麦克风.png',
            '洗脸巾': '洗脸巾.png',
            '黑色面膜': '黑色面膜.png',
            '寂明灯': '寂明灯.png',
            '虹气结': '虹气结.png',
            '胡桃藤': '胡桃藤.png'
        };
        
        // 获取当前装备
        let currentEquip = null;
        if (equipmentId) {
            currentEquip = equipment.find(eq => eq.id === equipmentId);
        }
        
        // 获取等级发光颜色
        function getGlowColor(level) {
            const colors = {
                0: 'none',
                1: '#00ff00',
                2: '#0080ff',
                3: '#8000ff',
                4: '#ff0000',
                5: '#ffd700'
            };
            return colors[level] || 'none';
        }
        
        const level = currentEquip ? (currentEquip.level || 0) : 0;
        const glowColor = getGlowColor(level);
        const glowStyle = glowColor !== 'none' ? 
            `box-shadow: 0 0 20px ${glowColor}, 0 0 40px ${glowColor}, 0 0 60px ${glowColor};` : '';
        
        const iconFile = currentEquip ? (equipmentIconMap[currentEquip.name] || null) : null;
        
        let slotHTML = `
            <div style="flex: 1; text-align: center;">
                <div style="font-weight: bold; margin-bottom: 10px; color: #000;">${slotName}</div>
                <div class="equipment-slot" 
                     data-slot="${slot}" 
                     data-character="${charName}"
                     style="width: 120px; height: 120px; border: 3px solid #ddd; border-radius: 10px; background: #f8f9fa; cursor: pointer; margin: 0 auto; position: relative; display: flex; align-items: center; justify-content: center; transition: all 0.3s;"
                     onmouseover="this.style.borderColor='#667eea'; this.style.background='#f0f0ff';"
                     onmouseout="this.style.borderColor='#ddd'; this.style.background='#f8f9fa';">
        `;
        
        if (currentEquip && iconFile) {
            slotHTML += `
                <img src="/static/${iconFile}" 
                     alt="${currentEquip.name}" 
                     style="width: 100px; height: 100px; object-fit: contain; ${glowStyle}"
                     onerror="this.style.display='none'">
            `;
        } else {
            slotHTML += `<div style="color: #999; font-size: 14px;">点击选择</div>`;
        }
        
        slotHTML += `</div>`;
        
        // 显示装备信息
        if (currentEquip) {
            slotHTML += `
                <div style="margin-top: 10px; font-size: 12px; color: #333;">
                    <div style="font-weight: bold;">${currentEquip.name}</div>
                    <div style="margin-top: 5px;">
                        <div style="color: #d4af37; font-weight: bold; font-size: 12px;">${currentEquip.mainStat.name}: ${formatStatValue(currentEquip.mainStat)}</div>
                        ${currentEquip.subStats.map(sub => 
                            `<div style="font-size: 11px; color: #666; margin-top: 3px;">${sub.name}: ${formatStatValue(sub)}</div>`
                        ).join('')}
                    </div>
                </div>
            `;
        }
        
        slotHTML += `</div>`;
        return slotHTML;
    }
    
    // 格式化属性值
    function formatStatValue(stat) {
        if (stat.type === 'percent') {
            return `${(stat.value * 100).toFixed(1)}%`;
        } else if (stat.type === 'time') {
            return `${stat.value.toFixed(2)}秒`;
        } else {
            return stat.value.toString();
        }
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
    
    // 生成属性显示的HTML（带颜色和黑色描边）
    function getAttributeDisplayHTML(attribute) {
        const color = getAttributeColor(attribute);
        // 使用text-shadow实现黑色描边效果
        return `<span style="color: ${color}; font-weight: bold; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 3px #000;">${attribute}</span>`;
    }
    
    // 生成带标签的选项文本（用于下拉框）
    function getOptionTextWithTag(name, attribute) {
        // 由于HTML option标签不支持复杂样式，我们使用Unicode字符来模拟标签效果
        // 格式：名字 [属性]
        return `${name} [${attribute}]`;
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
    
    // 初始化下拉框选项（添加属性标签）
    function initializeSelectOptions() {
        // 将怪物选择下拉框转换为自定义下拉框
        convertSelectToCustom('monsterSelect', window.enemyAttributes);
    }
    
    // 选择角色并显示信息
    function selectCharacter(charName) {
        // 更新选中状态
        document.querySelectorAll('.character-avatar-item').forEach(item => {
            if (item.dataset.character === charName) {
                item.style.border = '3px solid #4a9eff';
                item.style.background = 'rgba(74, 158, 255, 0.2)';
            } else {
                item.style.border = '2px solid rgba(255, 255, 255, 0.3)';
                item.style.background = 'rgba(255, 255, 255, 0.1)';
            }
        });
        
        // 获取角色数据（从页面中获取）
        const characterData = window.characterData || {};
        const userCharacters = window.userCharacters || {};
        const characterSkills = window.characterSkills || {};
        const weapons = window.weapons || {};
        
        const charData = userCharacters[charName] || {
            equipment: { weapon: null, accessory: null, headwear: null },
            stats: { 
                attack: 0, 
                critRate: 0, 
                critDamage: 1.0,
                reloadReduction: 0.0,
                rapidFire: 0.0,
                extraAmmo: 0.0 
            }
        };
        const skills = characterSkills[charName] || {};
        const weapon = weapons[charName] || {};
        
        // 计算装备加成后的属性
        const baseStats = charData.stats || {};
        const equipment = window.userEquipment || [];
        let finalStats = calculateEquipmentStats(baseStats, charData.equipment, equipment);
        
        // 应用角色被动技能
        finalStats = applyPassiveSkills(finalStats, charName);
        
        // 检测套装效果
        const setBonus = detectSetBonus(charData.equipment, equipment);
        
        const attackValue = finalStats.attack || 0;
        const critDamage = finalStats.critDamage || 1.0;
        const reloadReduction = finalStats.reloadReduction || 0.0;
        const rapidFire = finalStats.rapidFire || 0.0;
        const extraAmmo = finalStats.extraAmmo || 0.0;
        
        // 处理技能描述，替换攻击力占位符和计算实际数值
        function processDescription(desc, baseDamage, baseFireRate, baseMaxAmmo, baseReloadTime) {
            if (!desc) return desc;
            
            // 替换 "伤害数字+攻击力" 为 "伤害数字+攻击力值(攻击力值为角色攻击力)"
            desc = desc.replace(/伤害(\d+)\+攻击力/g, `伤害$1+${attackValue}(${attackValue}为角色攻击力)`);
            
            // 处理射击间隔：先替换为格式，再计算实际值
            if (baseFireRate !== undefined) {
                // 先替换为 (初始间隔-快速射击)秒 格式
                desc = desc.replace(/射击间隔([\d.]+)秒/g, `射击间隔(${baseFireRate}-${rapidFire})秒`);
                // 再计算并替换为实际值
                desc = desc.replace(/射击间隔\(([\d.]+)-([\d.]+)\)秒/g, (match, base, rapid) => {
                    const actual = Math.max(0.1, parseFloat(base) - parseFloat(rapid)).toFixed(2);
                    return `射击间隔${actual}秒`;
                });
            }
            
            // 处理弹夹容量：先替换为格式，再计算实际值
            if (baseMaxAmmo !== undefined) {
                // 先替换为 (初始弹容*(1+额外弹容))发 格式
                desc = desc.replace(/弹夹容量(\d+)发/g, `弹夹容量(${baseMaxAmmo}*(1+${(extraAmmo * 100).toFixed(0)}%))发`);
                // 再计算并替换为实际值
                desc = desc.replace(/弹夹容量\((\d+)\*\(1\+([\d.]+)%\)\)发/g, (match, base, extra) => {
                    const actual = Math.ceil(parseInt(base) * (1 + parseFloat(extra) / 100));
                    return `弹夹容量${actual}发`;
                });
            }
            
            // 处理换弹时间：先替换为格式，再计算实际值
            if (baseReloadTime !== undefined) {
                // 先替换为 (初始换弹时间-换弹减免)秒 格式
                desc = desc.replace(/换弹时间([\d.]+)秒/g, `换弹时间(${baseReloadTime}-${reloadReduction})秒`);
                // 再计算并替换为实际值
                desc = desc.replace(/换弹时间\(([\d.]+)-([\d.]+)\)秒/g, (match, base, reduction) => {
                    const actual = Math.max(0.1, parseFloat(base) - parseFloat(reduction)).toFixed(2);
                    return `换弹时间${actual}秒`;
                });
            }
            
            return desc;
        }
        
        // 生成角色信息HTML
        let infoHTML = `
            <h3 style="color: #000; margin-top: 0; font-weight: bold; font-family: 'Microsoft YaHei', 'SimHei', sans-serif;">${charName}</h3>
            
            <!-- 角色头像 -->
            <div style="text-align: center; margin: 20px 0;">
                <img src="/static/${charName}1.png" 
                     alt="${charName}" 
                     style="width: 120px; height: 120px; border-radius: 10px; background: rgba(0, 0, 0, 0.1);"
                     onerror="this.style.display='none'">
            </div>
            
            <!-- 角色面板 -->
            <div class="character-stats" style="margin: 20px 0;">
                <h4 style="color: #000; margin-bottom: 15px; font-weight: bold; font-family: 'Microsoft YaHei', 'SimHei', sans-serif;">角色面板</h4>
                <div style="color: #000; line-height: 2; font-weight: bold; font-family: 'Microsoft YaHei', 'SimHei', sans-serif;">
                    <div>属性: ${getAttributeDisplayHTML((window.characterAttributes && window.characterAttributes[charName]) || '无属性')}</div>
                    <div>生命值: <span style="color: #d4af37;">${Math.ceil(finalStats.hp || 1000)}</span></div>
                    <div>攻击力: <span style="color: #d4af37;">${Math.ceil(attackValue)}</span></div>
                    <div>暴击率: <span style="color: #d4af37;">${((finalStats.critRate || 0) * 100).toFixed(1)}%</span></div>
                    <div>暴击伤害: <span style="color: #d4af37;">${((finalStats.critDamage || 1.0) * 100).toFixed(0)}%</span></div>
                    <div>伤害加成: <span style="color: #d4af37;">${((finalStats.damageBonus || 0) * 100).toFixed(1)}%</span></div>
                    <div>治疗加成: <span style="color: #d4af37;">${((finalStats.healingBonus || 0) * 100).toFixed(1)}%</span></div>
                    <div>换弹减免: <span style="color: #d4af37;">${reloadReduction.toFixed(2)}秒</span></div>
                    <div>快速射击: <span style="color: #d4af37;">${rapidFire.toFixed(2)}秒</span></div>
                    <div>额外弹容: <span style="color: #d4af37;">${(extraAmmo * 100).toFixed(1)}%</span></div>
                    <div>属性强度: <span style="color: #d4af37;">${finalStats.attributePower || 0}</span></div>
                </div>
            </div>
            
            <!-- 装备 -->
            <div class="character-equipment" style="margin: 20px 0;">
                <h4 style="color: #000; margin-bottom: 15px; font-weight: bold; font-family: 'Microsoft YaHei', 'SimHei', sans-serif;">装备</h4>
                <div style="display: flex; gap: 15px; margin-bottom: 20px;">
                    ${renderEquipmentSlot('weapon', '执器', charData.equipment.weapon, charName)}
                    ${renderEquipmentSlot('accessory', '挂坠', charData.equipment.accessory, charName)}
                    ${renderEquipmentSlot('headwear', '头饰', charData.equipment.headwear, charName)}
                </div>
                ${setBonus ? `
                    <div style="margin-top: 15px; padding: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; color: white;">
                        <div style="font-weight: bold; font-size: 16px; margin-bottom: 10px;">✨ 套装效果：${setBonus.name}</div>
                        ${setBonus.name === '世间真理的传授者' ? `
                            <div style="font-size: 14px; line-height: 1.8;">
                                <div>• 暴击率提高20%</div>
                                <div>• 造成暴击时自身所有技能的冷却时间减少1秒（每3秒内最多触发一次）</div>
                            </div>
                        ` : setBonus.name === '黑色狭窄的小巷' ? `
                            <div style="font-size: 14px; line-height: 1.8;">
                                <div>• 攻击力提高50%</div>
                                <div>• 若最终装备者攻击力超过150，则还可以额外获得100点属性强度</div>
                            </div>
                        ` : setBonus.name === '愿这一轮朝阳照亮明天' ? `
                            <div style="font-size: 14px; line-height: 1.8;">
                                <div>• 生命值提高50%</div>
                                <div>• 治疗加成提高30%</div>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
            
            <!-- 被动技能 -->
            ${charName === '公主蓉' || charName === '幺幺俊羊羊' || charName === '勇者' || charName === '王子栗' ? `
                <div class="character-passive" style="margin: 20px 0;">
                    <h4 style="color: #000; margin-bottom: 15px; font-weight: bold; font-family: 'Microsoft YaHei', 'SimHei', sans-serif;">被动技能</h4>
                    ${charName === '公主蓉' ? `
                        <div style="padding: 12px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 8px; color: white; font-size: 14px; line-height: 1.6;">
                            <div style="font-weight: bold; margin-bottom: 5px;">✨ 治疗转暴击</div>
                            <div>根据治疗加成获得等额的暴击率</div>
                            <div style="margin-top: 5px; font-size: 12px; opacity: 0.9;">
                                当前治疗加成: ${((finalStats.healingBonus || 0) * 100).toFixed(1)}% → 额外暴击率: ${((finalStats.healingBonus || 0) * 100).toFixed(1)}%
                            </div>
                        </div>
                    ` : ''}
                    ${charName === '幺幺俊羊羊' ? `
                        <div style="padding: 12px; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); border-radius: 8px; color: white; font-size: 14px; line-height: 1.6;">
                            <div style="font-weight: bold; margin-bottom: 5px;">✨ 高攻暴击</div>
                            <div>当自身最终的攻击力面板超过100点时，提高50%暴击率</div>
                            <div style="margin-top: 5px; font-size: 12px; opacity: 0.9;">
                                当前攻击力: ${Math.ceil(attackValue)} ${attackValue > 100 ? `(>100) → 额外暴击率: 50%` : `(≤100) → 未触发`}
                            </div>
                        </div>
                    ` : ''}
                    ${charName === '勇者' ? `
                        <div style="padding: 12px; background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%); border-radius: 8px; color: white; font-size: 14px; line-height: 1.6;">
                            <div style="font-weight: bold; margin-bottom: 5px;">✨ 赏金猎人</div>
                            <div>当暴击率超过100%时，根据超出的部分获得双倍的暴击伤害加成</div>
                            <div style="margin-top: 5px; font-size: 12px; opacity: 0.9;">
                                当前暴击率: ${((finalStats.critRate || 0) * 100).toFixed(1)}% ${(finalStats.critRate || 0) > 1.0 ? `(>100%) → 额外暴击伤害: ${(((finalStats.critRate - 1.0) * 2.0) * 100).toFixed(1)}%` : `(≤100%) → 未触发`}
                            </div>
                        </div>
                    ` : ''}
                    ${charName === '王子栗' ? `
                        <div style="padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; color: white; font-size: 14px; line-height: 1.6;">
                            <div style="font-weight: bold; margin-bottom: 5px;">✨ 救世主</div>
                            <div>对物理/自然/超能属性的敌人造成伤害时，该伤害转变为克制敌人的属性</div>
                        </div>
                    ` : ''}
                </div>
            ` : ''}
            
            <!-- 技能说明 -->
            <div class="character-skills" style="margin: 20px 0;">
                <h4 style="color: #000; margin-bottom: 15px; font-weight: bold; font-family: 'Microsoft YaHei', 'SimHei', sans-serif;">技能</h4>
        `;
        
        // 左键技能（普通射击）
        if (skills['左键']) {
            const leftClickDesc = processDescription(
                skills['左键'].description, 
                weapon.damage, 
                weapon.fireRate, 
                weapon.maxAmmo, 
                weapon.reloadTime
            );
            infoHTML += `
                <div style="margin-bottom: 15px; font-weight: bold; font-family: 'Microsoft YaHei', 'SimHei', sans-serif;">
                    <strong style="color: #d4af37; font-weight: bold;">左键技能 - ${skills['左键'].name}</strong>
                    <div style="color: #333; font-size: 0.9em; margin-top: 5px; font-weight: normal;">${leftClickDesc}</div>
                    <div style="color: #666; font-size: 0.85em; margin-top: 3px; font-weight: normal;">冷却: ${skills['左键'].cooldown}</div>
                </div>
            `;
        }
        
        // Q技能
        if (skills.Q) {
            const qDesc = processDescription(skills.Q.description, 3000);
            infoHTML += `
                <div style="margin-bottom: 15px; font-weight: bold; font-family: 'Microsoft YaHei', 'SimHei', sans-serif;">
                    <strong style="color: #d4af37; font-weight: bold;">Q技能 - ${skills.Q.name}</strong>
                    <div style="color: #333; font-size: 0.9em; margin-top: 5px; font-weight: normal;">${qDesc}</div>
                    <div style="color: #666; font-size: 0.85em; margin-top: 3px; font-weight: normal;">冷却: ${skills.Q.cooldown}</div>
                </div>
            `;
        }
        
        // E技能
        if (skills.E) {
            infoHTML += `
                <div style="margin-bottom: 15px; font-weight: bold; font-family: 'Microsoft YaHei', 'SimHei', sans-serif;">
                    <strong style="color: #d4af37; font-weight: bold;">E技能 - ${skills.E.name}</strong>
                    <div style="color: #333; font-size: 0.9em; margin-top: 5px; font-weight: normal;">${skills.E.description}</div>
                    <div style="color: #666; font-size: 0.85em; margin-top: 3px; font-weight: normal;">冷却: ${skills.E.cooldown}</div>
                </div>
            `;
        }
        
        // 右键技能
        if (skills['右键']) {
            infoHTML += `
                <div style="font-weight: bold; font-family: 'Microsoft YaHei', 'SimHei', sans-serif;">
                    <strong style="color: #d4af37; font-weight: bold;">右键技能 - ${skills['右键'].name}</strong>
                    <div style="color: #333; font-size: 0.9em; margin-top: 5px; font-weight: normal;">${skills['右键'].description}</div>
                    <div style="color: #666; font-size: 0.85em; margin-top: 3px; font-weight: normal;">冷却: ${skills['右键'].cooldown}</div>
                </div>
            `;
        }
        
        infoHTML += `</div>`;
        
        // 更新信息面板
        const infoPanel = document.getElementById('characterInfoContent');
        if (infoPanel) {
            infoPanel.innerHTML = infoHTML;
            
            // 添加装备槽位点击事件
            infoPanel.querySelectorAll('.equipment-slot').forEach(slot => {
                slot.addEventListener('click', (e) => {
                    // 如果点击的是已装备的装备图标，先询问是否卸下
                    const slotType = slot.dataset.slot;
                    const character = slot.dataset.character;
                    const charData = userCharacters[character] || {};
                    const equipmentId = charData.equipment && charData.equipment[slotType];
                    
                    if (equipmentId && e.target.tagName === 'IMG') {
                        // 点击已装备的装备，询问是否卸下
                        if (confirm('是否卸下该装备？')) {
                            equipCharacter(character, slotType, null);
                        }
                    } else {
                        // 点击空槽位或文字，打开选择器
                        openEquipmentSelector(slotType, character);
                    }
                });
            });
        }
    }
    
    // 套装配置（与服务器端保持一致）
    const EQUIPMENT_SETS = {
        '世间真理的传授者': {
            'weapon': '量天尺',
            'accessory': '拂尘巾',
            'headwear': '诵音筒',
            'name': '世间真理的传授者',
            'effects': {
                'critRate': 0.20,
                'crit_cooldown_reduction': true
            }
        },
        '黑色狭窄的小巷': {
            'weapon': '采访麦克风',
            'accessory': '洗脸巾',
            'headwear': '黑色面膜',
            'name': '黑色狭窄的小巷',
            'effects': {
                'attack_bonus': 0.50,
                'attribute_power_conditional': 100
            }
        },
        '愿这一轮朝阳照亮明天': {
            'weapon': '寂明灯',
            'accessory': '虹气结',
            'headwear': '胡桃藤',
            'name': '愿这一轮朝阳照亮明天',
            'effects': {
                'hp_bonus': 0.50,
                'healingBonus': 0.30
            }
        }
    };
    
    // 检测套装
    function detectSetBonus(equipment, allEquipment) {
        const equippedItems = {
            weapon: equipment.weapon ? allEquipment.find(eq => eq.id === equipment.weapon) : null,
            accessory: equipment.accessory ? allEquipment.find(eq => eq.id === equipment.accessory) : null,
            headwear: equipment.headwear ? allEquipment.find(eq => eq.id === equipment.headwear) : null
        };
        
        // 检查每个套装
        for (const setName in EQUIPMENT_SETS) {
            const setConfig = EQUIPMENT_SETS[setName];
            const weaponMatch = equippedItems.weapon && equippedItems.weapon.name === setConfig.weapon;
            const accessoryMatch = equippedItems.accessory && equippedItems.accessory.name === setConfig.accessory;
            const headwearMatch = equippedItems.headwear && equippedItems.headwear.name === setConfig.headwear;
            
            if (weaponMatch && accessoryMatch && headwearMatch) {
                return setConfig;
            }
        }
        
        return null;
    }
    
    // 计算装备属性加成
    function calculateEquipmentStats(baseStats, equipment, allEquipment) {
        const stats = { ...baseStats };
        
        // 保存基础攻击力和生命值（用于百分比加成计算）
        const baseAttack = stats.attack || 0;
        const baseHp = stats.hp || 1000;
        
        // 收集所有百分比加成和固定值加成
        const attackPercentBonuses = [];  // 攻击力百分比加成列表
        const hpPercentBonuses = [];  // 生命值百分比加成列表
        const attackFlatBonuses = [];  // 攻击力固定值加成列表
        const hpFlatBonuses = [];  // 生命值固定值加成列表
        
        // 遍历三个装备槽位
        ['weapon', 'accessory', 'headwear'].forEach(slot => {
            const equipmentId = equipment[slot];
            if (!equipmentId) return;
            
            const equip = allEquipment.find(eq => eq.id === equipmentId);
            if (!equip) return;
            
            // 收集主词条
            if (equip.mainStat) {
                if (equip.mainStat.name === '攻击力') {
                    if (equip.mainStat.type === 'percent') {
                        attackPercentBonuses.push(equip.mainStat.value);
                    } else {
                        attackFlatBonuses.push(equip.mainStat.value);
                    }
                } else if (equip.mainStat.name === '生命值') {
                    if (equip.mainStat.type === 'percent') {
                        hpPercentBonuses.push(equip.mainStat.value);
                    } else {
                        hpFlatBonuses.push(equip.mainStat.value);
                    }
                } else {
                    // 其他属性直接应用
                    applyStat(stats, equip.mainStat);
                }
            }
            
            // 收集副词条
            if (equip.subStats) {
                equip.subStats.forEach(subStat => {
                    if (subStat.name === '攻击力') {
                        if (subStat.type === 'percent') {
                            attackPercentBonuses.push(subStat.value);
                        } else {
                            attackFlatBonuses.push(subStat.value);
                        }
                    } else if (subStat.name === '生命值') {
                        if (subStat.type === 'percent') {
                            hpPercentBonuses.push(subStat.value);
                        } else {
                            hpFlatBonuses.push(subStat.value);
                        }
                    } else {
                        // 其他属性直接应用
                        applyStat(stats, subStat);
                    }
                });
            }
        });
        
        // 检测并收集套装效果的百分比加成
        const setBonus = detectSetBonus(equipment, allEquipment);
        if (setBonus && setBonus.effects) {
            const effects = setBonus.effects;
            
            // 世间真理的传授者：暴击率+20%
            if (effects.critRate) {
                stats.critRate = (stats.critRate || 0) + effects.critRate;
            }
            
            // 黑色狭窄的小巷：攻击力+50%（百分比加成）
            if (effects.attack_bonus) {
                attackPercentBonuses.push(effects.attack_bonus);
            }
            
            // 愿这一轮朝阳照亮明天：生命值+50%（百分比加成）
            if (effects.hp_bonus) {
                hpPercentBonuses.push(effects.hp_bonus);
            }
            
            if (effects.healingBonus) {
                stats.healingBonus = (stats.healingBonus || 0) + effects.healingBonus;
            }
        }
        
        // 先应用所有固定值加成
        let finalAttack = baseAttack + attackFlatBonuses.reduce((sum, val) => sum + val, 0);
        let finalHp = baseHp + hpFlatBonuses.reduce((sum, val) => sum + val, 0);
        
        // 然后基于基础值（包含固定值加成后）应用所有百分比加成
        // 所有百分比加成累加后一次性应用
        const totalAttackPercent = attackPercentBonuses.reduce((sum, val) => sum + val, 0);
        const totalHpPercent = hpPercentBonuses.reduce((sum, val) => sum + val, 0);
        
        if (totalAttackPercent > 0) {
            stats.attack = finalAttack * (1 + totalAttackPercent);
        } else {
            stats.attack = finalAttack;
        }
        
        if (totalHpPercent > 0) {
            stats.hp = finalHp * (1 + totalHpPercent);
        } else {
            stats.hp = finalHp;
        }
        
        // 攻击力和生命值向上取整
        if (stats.attack !== undefined) {
            stats.attack = Math.ceil(stats.attack);
        }
        if (stats.hp !== undefined) {
            stats.hp = Math.ceil(stats.hp);
        }
        
        // 黑色狭窄的小巷：检查攻击力>150的条件（在取整后检查）
        if (setBonus && setBonus.effects && setBonus.effects.attribute_power_conditional) {
            if (stats.attack > 150) {
                stats.attributePower = (stats.attributePower || 0) + setBonus.effects.attribute_power_conditional;
            }
        }
        
        return stats;
    }
    
    // 应用角色被动技能
    function applyPassiveSkills(stats, characterName) {
        const finalStats = { ...stats };
        
        // 公主蓉的被动：根据治疗加成获得等额暴击率
        if (characterName === '公主蓉') {
            const healingBonus = finalStats.healingBonus || 0;
            finalStats.critRate = (finalStats.critRate || 0) + healingBonus;
        }
        
        // 幺幺俊羊羊的被动：当自身最终的攻击力面板超过100点，则提高50%暴击率
        if (characterName === '幺幺俊羊羊') {
            const attack = finalStats.attack || 0;
            if (attack > 100) {
                finalStats.critRate = (finalStats.critRate || 0) + 0.5;
            }
        }
        
        // 勇者的被动：当暴击率超过100%时，根据超出的部分获得双倍的暴击伤害加成
        if (characterName === '勇者') {
            const critRate = finalStats.critRate || 0;
            if (critRate > 1.0) {  // 超过100%
                const excessCritRate = critRate - 1.0;  // 超出的部分
                // 超出的部分转换为双倍的暴击伤害加成
                const critDamageBonus = excessCritRate * 2.0;
                finalStats.critDamage = (finalStats.critDamage || 1.0) + critDamageBonus;
            }
        }
        
        return finalStats;
    }
    
    // 应用单个属性
    function applyStat(stats, stat) {
        const statName = stat.name;
        const statValue = stat.value;
        
        if (statName === '攻击力') {
            if (stat.type === 'percent') {
                stats.attack = (stats.attack || 0) * (1 + statValue);
            } else {
                stats.attack = (stats.attack || 0) + statValue;
            }
        } else if (statName === '生命值') {
            if (stat.type === 'percent') {
                stats.hp = (stats.hp || 1000) * (1 + statValue);
            } else {
                stats.hp = (stats.hp || 1000) + statValue;
            }
        } else if (statName === '暴击率') {
            stats.critRate = (stats.critRate || 0) + statValue;
        } else if (statName === '暴击伤害') {
            stats.critDamage = (stats.critDamage || 1.0) + statValue;
        } else if (statName === '伤害加成') {
            stats.damageBonus = (stats.damageBonus || 0) + statValue;
        } else if (statName === '治疗加成') {
            stats.healingBonus = (stats.healingBonus || 0) + statValue;
        } else if (statName === '换弹减免') {
            stats.reloadReduction = (stats.reloadReduction || 0) + statValue;
        } else if (statName === '快速射击') {
            stats.rapidFire = (stats.rapidFire || 0) + statValue;
        } else if (statName === '额外弹容') {
            stats.extraAmmo = (stats.extraAmmo || 0) + statValue;
        } else if (statName === '属性强度') {
            stats.attributePower = (stats.attributePower || 0) + statValue;
        }
    }
    
    // 打开装备选择器
    function openEquipmentSelector(slotType, character) {
        const equipment = window.userEquipment || [];
        const userCharacters = window.userCharacters || {};
        
        // 获取该槽位的可用装备（过滤掉已被其他角色佩戴的装备）
        const availableEquipment = equipment.filter(eq => {
            if (eq.slot !== slotType) return false;
            
            // 检查是否已被其他角色佩戴
            for (const charName in userCharacters) {
                if (charName === character) continue;
                const charData = userCharacters[charName];
                if (charData.equipment && charData.equipment[slotType] === eq.id) {
                    return false;
                }
            }
            return true;
        });
        
        // 创建选择弹窗
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
                <h2>选择${slotType === 'weapon' ? '执器' : slotType === 'accessory' ? '挂坠' : '头饰'}</h2>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0;">
                    <div class="equipment-select-item" 
                         data-equipment-id="null"
                         style="border: 2px solid #ddd; border-radius: 10px; padding: 15px; cursor: pointer; text-align: center; transition: all 0.3s; background: #f8f9fa;"
                         onmouseover="this.style.borderColor='#667eea'; this.style.background='#f0f0ff';"
                         onmouseout="this.style.borderColor='#ddd'; this.style.background='#f8f9fa';">
                        <div style="width: 80px; height: 80px; margin: 0 auto; display: flex; align-items: center; justify-content: center; color: #999; font-size: 14px;">卸下装备</div>
                        <div style="margin-top: 10px; font-weight: bold; color: #000;">无</div>
                    </div>
                    ${availableEquipment.map(eq => {
                        const equipmentIconMap = {
                            '量天尺': '量天尺.png',
                            '量天尺子': '量天尺.png',
                            '拂尘巾': '拂尘巾.png',
                            '诵音筒': '诵音筒.png',
                            '采访麦克风': '采访麦克风.png',
                            '洗脸巾': '洗脸巾.png',
                            '黑色面膜': '黑色面膜.png',
                            '寂明灯': '寂明灯.png',
                            '虹气结': '虹气结.png',
                            '胡桃藤': '胡桃藤.png'
                        };
                        const iconFile = equipmentIconMap[eq.name] || null;
                        const level = eq.level || 0;
                        const glowColor = getGlowColor(level);
                        const glowStyle = glowColor !== 'none' ? 
                            `box-shadow: 0 0 20px ${glowColor}, 0 0 40px ${glowColor}, 0 0 60px ${glowColor};` : '';
                        
                        return `
                            <div class="equipment-select-item" 
                                 data-equipment-id="${eq.id}"
                                 style="border: 2px solid #ddd; border-radius: 10px; padding: 15px; cursor: pointer; text-align: center; transition: all 0.3s;"
                                 onmouseover="this.style.borderColor='#667eea'; this.style.background='#f0f0ff';"
                                 onmouseout="this.style.borderColor='#ddd'; this.style.background='white';">
                                ${iconFile ? `<img src="/static/${iconFile}" alt="${eq.name}" style="width: 80px; height: 80px; object-fit: contain; ${glowStyle}" onerror="this.style.display='none'">` : ''}
                                <div style="margin-top: 10px; font-weight: bold; color: #000;">${eq.name}</div>
                                <div style="font-size: 12px; color: #666; margin-top: 5px;">等级: ${level}/5</div>
                                <div style="font-size: 11px; color: #999; margin-top: 5px;">${eq.mainStat.name}: ${formatStatValue(eq.mainStat)}</div>
                            </div>
                        `;
                    }).join('')}
                    ${availableEquipment.length === 0 ? '<div style="grid-column: 1 / -1; text-align: center; color: #999; padding: 40px;">暂无可用装备</div>' : ''}
                </div>
                <div class="button-group">
                    <button class="btn btn-secondary" id="cancelEquipmentSelect">取消</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 添加点击事件
        modal.querySelectorAll('.equipment-select-item').forEach(item => {
            item.addEventListener('click', () => {
                const equipmentIdStr = item.dataset.equipmentId;
                const equipmentId = equipmentIdStr === 'null' ? null : equipmentIdStr;
                equipCharacter(character, slotType, equipmentId);
                document.body.removeChild(modal);
            });
        });
        
        modal.querySelector('#cancelEquipmentSelect').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // 点击外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }
    
    // 获取等级发光颜色
    function getGlowColor(level) {
        const colors = {
            0: 'none',
            1: '#00ff00',
            2: '#0080ff',
            3: '#8000ff',
            4: '#ff0000',
            5: '#ffd700'
        };
        return colors[level] || 'none';
    }
    
    // 装备角色
    function equipCharacter(character, slotType, equipmentId) {
        fetch('/equip_character', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                character: character,
                slot: slotType,
                equipment_id: equipmentId
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // 更新本地数据
                if (!window.userCharacters[character]) {
                    window.userCharacters[character] = { equipment: {}, stats: {} };
                }
                if (!window.userCharacters[character].equipment) {
                    window.userCharacters[character].equipment = {};
                }
                window.userCharacters[character].equipment[slotType] = equipmentId;
                
                // 重新渲染角色信息
                selectCharacter(character);
            } else {
                alert('装备失败：' + data.message);
            }
        })
        .catch(error => {
            console.error('装备角色错误:', error);
            alert('装备失败，请重试');
        });
    }
    
    // 点击"开始游戏"
    startGameBtn.addEventListener('click', () => {
        modeModal.classList.add('show');
    });
    
    // 关闭模式选择弹窗
    closeModeModal.addEventListener('click', () => {
        modeModal.classList.remove('show');
    });
    
    // 点击"创建房间"
    createRoomBtn.addEventListener('click', () => {
        modeModal.classList.remove('show');
        createRoomModal.classList.add('show');
    });
    
    // 关闭创建房间弹窗
    closeCreateModal.addEventListener('click', () => {
        createRoomModal.classList.remove('show');
    });
    
    // 点击"加入游戏"
    joinRoomBtn.addEventListener('click', () => {
        modeModal.classList.remove('show');
        joinRoomModal.classList.add('show');
    });
    
    // 关闭加入房间弹窗
    closeJoinModal.addEventListener('click', () => {
        joinRoomModal.classList.remove('show');
        joinError.style.display = 'none';
    });
    
    // 提交创建房间表单 - 直接提交HTML表单
    createRoomForm.addEventListener('submit', (e) => {
        const playerName = document.getElementById('playerName').value.trim();
        if (!playerName) {
            e.preventDefault();
            alert('请输入玩家昵称');
            return false;
        }
        // 让表单正常提交到服务器
        console.log('提交创建房间表单');
        return true;
    });
    
    // 提交加入房间表单
    joinRoomForm.addEventListener('submit', (e) => {
        const playerName = document.getElementById('joinPlayerName').value.trim();
        const roomKey = document.getElementById('roomKey').value.trim().toUpperCase();
        
        if (!playerName) {
            e.preventDefault();
            alert('请输入玩家昵称');
            return false;
        }
        
        if (roomKey.length !== 6) {
            e.preventDefault();
            showJoinError('房间密钥必须是6位');
            return false;
        }
        
        // 让表单正常提交到服务器（HTTP POST）
        console.log('提交加入房间表单');
        return true;
    });
    
    // 显示加入错误信息
    function showJoinError(message) {
        joinError.textContent = message;
        joinError.style.display = 'block';
    }
    
    // 点击模态框外部关闭
    window.addEventListener('click', (e) => {
        if (e.target === modeModal) {
            modeModal.classList.remove('show');
        }
        if (e.target === createRoomModal) {
            createRoomModal.classList.remove('show');
        }
        if (e.target === joinRoomModal) {
            joinRoomModal.classList.remove('show');
            joinError.style.display = 'none';
        }
        if (viewCharactersModal && e.target === viewCharactersModal) {
            viewCharactersModal.classList.remove('show');
        }
    });
});

// Socket事件监听（保留用于其他事件，但join_room已改为HTTP POST）
