// Game setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game states
let gameState = 'MENU'; // 'MENU', 'PLAYING', 'UPGRADES', 'GAME_OVER', 'HELP'
let runTimer = 30; // 30 second runs
let score = 0;
let coins = parseInt(localStorage.getItem('coins') || '0');
let totalRuns = parseInt(localStorage.getItem('totalRuns') || '0');
let showControls = false; // Toggle help overlay

// Persistent upgrades (carry between runs)
let permanentUpgrades = {
    damage: parseInt(localStorage.getItem('upgrade_damage') || '0'),
    speed: parseInt(localStorage.getItem('upgrade_speed') || '0'),
    health: parseInt(localStorage.getItem('upgrade_health') || '0'),
    fireRate: parseInt(localStorage.getItem('upgrade_fireRate') || '0'),
    magnetism: parseInt(localStorage.getItem('upgrade_magnetism') || '0')
};

// Temporary upgrades (during single run)
let tempUpgrades = {
    damage: 0,
    speed: 0,
    fireRate: 0,
    health: 0
};

// Player object
let player = {
    x: 400,
    y: 300,
    width: 20,
    height: 20,
    speed: 2.2, // Reduced from 3 for better control
    health: 100,
    maxHealth: 100,
    xp: 0,
    level: 1,
    weapon: {
        damage: 15,
        range: 120,
        fireRate: 600,
        lastShot: 0
    }
};

// Procedural map elements
let mapTiles = [];
let obstacles = [];

// Game objects
let enemies = [];
let bullets = [];
let xpOrbs = [];
let levelUpChoices = [];

// Input handling
const keys = {};
const keysPressed = {}; // For single key press detection
let mouseX = 0;
let mouseY = 0;
let mouseClicked = false;

document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (!keys[key]) {
        keysPressed[key] = true; // First press
    }
    keys[key] = true;
    
    // Prevent default for game keys
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 
         '1', '2', '3', '4', '5', 'enter', 'escape', ' ', 'h', 'u', 'b', 'r', 'q'].includes(key)) {
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

canvas.addEventListener('click', (e) => {
    mouseClicked = true;
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

// Utility functions
function random(min, max) {
    return Math.random() * (max - min) + min;
}

function distance(obj1, obj2) {
    return Math.sqrt(Math.pow(obj1.x - obj2.x, 2) + Math.pow(obj1.y - obj2.y, 2));
}

// Optimized collision detection
function checkCollision(obj1, obj2) {
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
}

// Fast bounds check before expensive collision test
function quickDistanceCheck(obj1, obj2, maxDistance) {
    const dx = (obj1.x + obj1.width/2) - (obj2.x + obj2.width/2);
    const dy = (obj1.y + obj1.height/2) - (obj2.y + obj2.height/2);
    // Use squared distance to avoid sqrt calculation
    return (dx*dx + dy*dy) < (maxDistance * maxDistance);
}

function checkCircleCollision(obj1, obj2, radius1 = 0, radius2 = 0) {
    const dx = (obj1.x + obj1.width/2) - (obj2.x + obj2.width/2);
    const dy = (obj1.y + obj1.height/2) - (obj2.y + obj2.height/2);
    const distance = Math.sqrt(dx*dx + dy*dy);
    return distance < (radius1 + radius2);
}

function pointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.width && 
           y >= rect.y && y <= rect.y + rect.height;
}

// Spatial partitioning for better collision performance
class SpatialGrid {
    constructor(width, height, cellSize = 50) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.grid = [];
        this.clear();
    }
    
    clear() {
        this.grid = Array(this.cols * this.rows).fill(null).map(() => []);
    }
    
    getCell(x, y) {
        const col = Math.floor(x / this.cellSize);
        const row = Math.floor(y / this.cellSize);
        if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
            return this.grid[row * this.cols + col];
        }
        return null;
    }
    
    insert(obj) {
        const cell = this.getCell(obj.x + obj.width/2, obj.y + obj.height/2);
        if (cell) {
            cell.push(obj);
            obj.gridCell = cell;
        }
    }
    
    getNearby(obj) {
        const nearby = [];
        const startCol = Math.max(0, Math.floor(obj.x / this.cellSize) - 1);
        const endCol = Math.min(this.cols - 1, Math.floor((obj.x + obj.width) / this.cellSize) + 1);
        const startRow = Math.max(0, Math.floor(obj.y / this.cellSize) - 1);
        const endRow = Math.min(this.rows - 1, Math.floor((obj.y + obj.height) / this.cellSize) + 1);
        
        for (let col = startCol; col <= endCol; col++) {
            for (let row = startRow; row <= endRow; row++) {
                nearby.push(...this.grid[row * this.cols + col]);
            }
        }
        return nearby;
    }
}

let spatialGrid = new SpatialGrid(800, 600);

// Procedural map generation
function generateMap() {
    mapTiles = [];
    obstacles = [];
    
    // Keep center area clear for player spawn (200x200 around center)
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const clearRadius = 100;
    
    // Generate random obstacles, avoiding center spawn area
    let attempts = 0;
    while (obstacles.length < 12 && attempts < 50) {
        const obstacle = {
            x: random(30, canvas.width - 80),
            y: random(30, canvas.height - 80),
            width: random(25, 45),
            height: random(25, 45),
            color: '#444'
        };
        
        // Check if obstacle is too close to center spawn area
        const distToCenter = distance(
            {x: obstacle.x + obstacle.width/2, y: obstacle.y + obstacle.height/2},
            {x: centerX, y: centerY}
        );
        
        // Also ensure obstacles aren't too close to each other
        let tooClose = false;
        for (let existing of obstacles) {
            if (distance(
                {x: obstacle.x + obstacle.width/2, y: obstacle.y + obstacle.height/2},
                {x: existing.x + existing.width/2, y: existing.y + existing.height/2}
            ) < 60) {
                tooClose = true;
                break;
            }
        }
        
        if (distToCenter > clearRadius && !tooClose) {
            obstacles.push(obstacle);
        }
        attempts++;
    }
}

// Enemy system
function createEnemy() {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    
    switch(side) {
        case 0: x = -25; y = Math.random() * canvas.height; break;
        case 1: x = canvas.width + 5; y = Math.random() * canvas.height; break;
        case 2: x = Math.random() * canvas.width; y = -25; break;
        case 3: x = Math.random() * canvas.width; y = canvas.height + 5; break;
    }
    
    const enemyTypes = [
        { speed: 1.0, health: 12, color: '#f44', size: 14, weight: 50 }, // Basic red enemy (slower)
        { speed: 0.7, health: 25, color: '#f84', size: 18, weight: 30 }, // Tanky orange enemy (slower)
        { speed: 1.6, health: 6, color: '#f4f', size: 11, weight: 20 }   // Fast pink enemy (slightly slower)
    ];
    
    // Weighted random selection
    const totalWeight = enemyTypes.reduce((sum, type) => sum + type.weight, 0);
    let random = Math.random() * totalWeight;
    let selectedType = enemyTypes[0];
    
    for (let type of enemyTypes) {
        random -= type.weight;
        if (random <= 0) {
            selectedType = type;
            break;
        }
    }
    
    return {
        x: x,
        y: y,
        width: selectedType.size,
        height: selectedType.size,
        speed: selectedType.speed,
        health: selectedType.health,
        maxHealth: selectedType.health,
        color: selectedType.color,
        xpValue: Math.ceil(selectedType.health / 4)
    };
}

// XP and upgrade system
function createXPOrb(x, y, value = 1) {
    xpOrbs.push({
        x: x,
        y: y,
        width: 6,
        height: 6,
        value: value,
        magnetRange: 40 + (permanentUpgrades.magnetism * 10),
        collected: false,
        color: '#4f4'
    });
}

function levelUp() {
    levelUpChoices = generateLevelUpChoices();
    gameState = 'LEVEL_UP';
}

function generateLevelUpChoices() {
    const choices = [
        { name: "Damage Boost", desc: "+3 Damage", apply: () => tempUpgrades.damage += 3 },
        { name: "Fire Rate", desc: "25% Faster Shooting", apply: () => tempUpgrades.fireRate += 0.25 },
        { name: "Speed Boost", desc: "+1 Movement Speed", apply: () => tempUpgrades.speed += 1 },
        { name: "Health Boost", desc: "+20 Max Health", apply: () => { tempUpgrades.health += 20; player.maxHealth += 20; player.health += 20; }},
        { name: "Multi-Shot", desc: "Shoot 2 Extra Bullets", apply: () => player.weapon.multiShot = (player.weapon.multiShot || 0) + 2 },
        { name: "Piercing Shots", desc: "Bullets Pierce 3 Enemies", apply: () => player.weapon.piercing = true },
        { name: "Explosive Rounds", desc: "Bullets Explode on Impact", apply: () => player.weapon.explosive = true },
        { name: "Homing Missiles", desc: "Projectiles Track Enemies", apply: () => player.weapon.homing = true },
        { name: "Rapid Fire", desc: "50% Fire Rate Boost", apply: () => tempUpgrades.fireRate += 0.5 },
        { name: "Health Regen", desc: "Slowly Regenerate HP", apply: () => player.weapon.regen = true }
    ];
    
    // Return 3 random choices
    const shuffled = [...choices].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
}

// Enhanced weapon system with projectile types
function shootAtNearestEnemy() {
    if (enemies.length === 0) return;
    
    const now = Date.now();
    const fireRate = player.weapon.fireRate * (1 - tempUpgrades.fireRate) * (1 - permanentUpgrades.fireRate * 0.1);
    if (now - player.weapon.lastShot < fireRate) return;
    
    let nearestEnemy = null;
    let minDistance = Infinity;
    
    enemies.forEach(enemy => {
        const dist = distance(player, enemy);
        if (dist < minDistance && dist <= player.weapon.range) {
            minDistance = dist;
            nearestEnemy = enemy;
        }
    });
    
    if (nearestEnemy) {
        const angle = Math.atan2(
            nearestEnemy.y + nearestEnemy.height/2 - (player.y + player.height/2),
            nearestEnemy.x + nearestEnemy.width/2 - (player.x + player.width/2)
        );
        
        const damage = player.weapon.damage + tempUpgrades.damage + permanentUpgrades.damage;
        const multiShot = player.weapon.multiShot || 0;
        
        // Determine projectile type based on upgrades
        let projectileType = 'normal';
        if (player.weapon.piercing) projectileType = 'piercing';
        if (player.weapon.explosive) projectileType = 'explosive';
        if (player.weapon.homing) projectileType = 'homing';
        
        // Main projectile
        createProjectile(angle, damage, projectileType);
        
        // Multi-shot projectiles
        for (let i = 0; i < multiShot; i++) {
            const spreadAngle = angle + (Math.random() - 0.5) * 0.8;
            createProjectile(spreadAngle, damage, projectileType);
        }
        
        player.weapon.lastShot = now;
    }
}

function createProjectile(angle, damage, type = 'normal') {
    const projectile = new Projectile(
        player.x + player.width/2,
        player.y + player.height/2,
        angle,
        damage,
        type
    );
    bullets.push(projectile);
}

// Enhanced projectile system
class Projectile {
    constructor(x, y, angle, damage, type = 'normal') {
        this.x = x;
        this.y = y;
        this.width = 4;
        this.height = 4;
        this.angle = angle;
        this.damage = damage;
        this.type = type;
        this.life = 60;
        this.pierceCount = 0;
        this.maxPierce = type === 'piercing' ? 3 : 0;
        this.hitTargets = new Set(); // Track hit enemies for piercing
        
        // Different projectile behaviors
        switch(type) {
            case 'normal':
                this.speed = 10;
                this.color = '#4ff';
                break;
            case 'piercing':
                this.speed = 8;
                this.color = '#f4f';
                this.width = 6;
                this.height = 6;
                break;
            case 'explosive':
                this.speed = 6;
                this.color = '#f84';
                this.explosionRadius = 40;
                break;
            case 'homing':
                this.speed = 7;
                this.color = '#4f8';
                this.homingStrength = 0.05;
                break;
        }
        
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
    }
    
    update() {
        // Homing behavior
        if (this.type === 'homing' && enemies.length > 0) {
            let nearestEnemy = null;
            let minDist = Infinity;
            
            enemies.forEach(enemy => {
                const dist = distance(this, enemy);
                if (dist < minDist && dist < 120) {
                    minDist = dist;
                    nearestEnemy = enemy;
                }
            });
            
            if (nearestEnemy) {
                const targetAngle = Math.atan2(
                    nearestEnemy.y - this.y,
                    nearestEnemy.x - this.x
                );
                this.vx += Math.cos(targetAngle) * this.homingStrength;
                this.vy += Math.sin(targetAngle) * this.homingStrength;
                
                // Normalize speed
                const currentSpeed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
                if (currentSpeed > this.speed) {
                    this.vx = (this.vx / currentSpeed) * this.speed;
                    this.vy = (this.vy / currentSpeed) * this.speed;
                }
            }
        }
        
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
    }
    
    explode() {
        if (this.type === 'explosive') {
            // Create explosion effect
            createExplosion(this.x, this.y, this.explosionRadius, this.damage * 0.7);
        }
    }
}

function createExplosion(x, y, radius, damage) {
    // Visual effect
    explosions.push({
        x: x - radius,
        y: y - radius,
        radius: radius,
        life: 10,
        maxLife: 10
    });
    
    // Damage enemies in radius
    enemies.forEach(enemy => {
        const dist = distance(
            {x: x, y: y},
            {x: enemy.x + enemy.width/2, y: enemy.y + enemy.height/2}
        );
        if (dist <= radius) {
            const damageMultiplier = 1 - (dist / radius);
            enemy.health -= damage * damageMultiplier;
        }
    });
}

let explosions = [];

// Game initialization
function initializeGame() {
    // Reset game state
    runTimer = 30;
    score = 0;
    
    // Generate new map first
    generateMap();
    
    // Set player to safe spawn position (center of map)
    player.x = canvas.width/2 - player.width/2;
    player.y = canvas.height/2 - player.height/2;
    player.health = 100 + permanentUpgrades.health * 20;
    player.maxHealth = 100 + permanentUpgrades.health * 20;
    player.xp = 0;
    player.level = 1;
    player.speed = 3 + permanentUpgrades.speed;
    
    // Reset temporary upgrades
    tempUpgrades = { damage: 0, speed: 0, fireRate: 0, health: 0 };
    player.weapon.multiShot = 0;
    player.weapon.piercing = false;
    player.weapon.explosive = false;
    player.weapon.homing = false;
    player.weapon.regen = false;
    
    // Clear arrays
    enemies = [];
    bullets = [];
    xpOrbs = [];
    
    // Spawn initial enemies (fewer at start)
    for (let i = 0; i < 2; i++) {
        enemies.push(createEnemy());
    }
}

// Game state management
function startGame() {
    gameState = 'PLAYING';
    initializeGame();
}

function endRun() {
    const coinsEarned = Math.floor(score / 10) + player.level;
    coins += coinsEarned;
    totalRuns++;
    
    localStorage.setItem('coins', coins.toString());
    localStorage.setItem('totalRuns', totalRuns.toString());
    
    gameState = 'GAME_OVER';
}

// Update player
function updatePlayer() {
    if (gameState !== 'PLAYING') return;
    
    // Handle help toggle
    if (keysPressed['h']) {
        showControls = !showControls;
    }
    
    // Handle pause/return to menu
    if (keysPressed['escape']) {
        if (confirm('Return to main menu? Your progress will be lost.')) {
            resetRun();
            gameState = 'MENU';
        }
    }
    
    // Handle movement
    let newX = player.x;
    let newY = player.y;
    const speed = player.speed + tempUpgrades.speed;
    
    if (keys['w'] || keys['arrowup']) {
        newY = Math.max(0, player.y - speed);
    }
    if (keys['s'] || keys['arrowdown']) {
        newY = Math.min(canvas.height - player.height, player.y + speed);
    }
    if (keys['a'] || keys['arrowleft']) {
        newX = Math.max(0, player.x - speed);
    }
    if (keys['d'] || keys['arrowright']) {
        newX = Math.min(canvas.width - player.width, player.x + speed);
    }
    
    // Check collision with obstacles
    let canMoveX = true, canMoveY = true;
    const tempPlayerX = { ...player, x: newX };
    const tempPlayerY = { ...player, y: newY };
    
    obstacles.forEach(obstacle => {
        if (checkCollision(tempPlayerX, obstacle)) canMoveX = false;
        if (checkCollision(tempPlayerY, obstacle)) canMoveY = false;
    });
    
    if (canMoveX) player.x = newX;
    if (canMoveY) player.y = newY;
    
    // Health regeneration
    if (player.weapon.regen && player.health < player.maxHealth) {
        player.health += 0.2; // Slow regen
        player.health = Math.min(player.health, player.maxHealth);
    }
    
    // Auto-shoot
    shootAtNearestEnemy();
    
    // Check if dead
    if (player.health <= 0) {
        endRun();
    }
}

// Update enemies
function updateEnemies() {
    if (gameState !== 'PLAYING') return;
    
    for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        
        // Move towards player with improved pathfinding around obstacles
        const dx = player.x + player.width/2 - (enemy.x + enemy.width/2);
        const dy = player.y + player.height/2 - (enemy.y + enemy.height/2);
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist > 1) {
            // Normalize direction vector
            let dirX = dx / dist;
            let dirY = dy / dist;
            
            // Calculate obstacle avoidance force
            let avoidX = 0;
            let avoidY = 0;
            const avoidanceRadius = 35; // How far to look ahead for obstacles
            
            // Check for nearby obstacles and calculate avoidance vector
            for (let obstacle of obstacles) {
                const obstacleCenter = {
                    x: obstacle.x + obstacle.width/2,
                    y: obstacle.y + obstacle.height/2
                };
                const enemyCenter = {
                    x: enemy.x + enemy.width/2,
                    y: enemy.y + enemy.height/2
                };
                
                // Fast distance check first
                if (!quickDistanceCheck(enemyCenter, obstacleCenter, avoidanceRadius)) {
                    continue; // Skip this obstacle if too far
                }
                
                const obstacleDist = distance(enemyCenter, obstacleCenter);
                
                // If obstacle is within avoidance radius
                if (obstacleDist < avoidanceRadius && obstacleDist > 0) {
                    // Calculate avoidance vector (away from obstacle)
                    const obsX = enemyCenter.x - obstacleCenter.x;
                    const obsY = enemyCenter.y - obstacleCenter.y;
                    const obsNormDist = Math.sqrt(obsX*obsX + obsY*obsY);
                    
                    if (obsNormDist > 0) {
                        // Strength inversely proportional to distance
                        const avoidanceStrength = (avoidanceRadius - obstacleDist) / avoidanceRadius;
                        avoidX += (obsX / obsNormDist) * avoidanceStrength;
                        avoidY += (obsY / obsNormDist) * avoidanceStrength;
                    }
                }
            }
            
            // Combine direction and avoidance vectors
            const finalX = dirX + avoidX * 0.7; // Avoidance weight
            const finalY = dirY + avoidY * 0.7;
            
            // Normalize the final vector
            const finalDist = Math.sqrt(finalX*finalX + finalY*finalY);
            const moveX = finalDist > 0 ? (finalX / finalDist) * enemy.speed : 0;
            const moveY = finalDist > 0 ? (finalY / finalDist) * enemy.speed : 0;
            
            // Test the movement for collisions
            const newX = enemy.x + moveX;
            const newY = enemy.y + moveY;
            const testEnemy = { ...enemy, x: newX, y: newY };
            
            let collision = false;
            for (let obstacle of obstacles) {
                if (checkCollision(testEnemy, obstacle)) {
                    collision = true;
                    break;
                }
            }
            
            if (!collision) {
                // Move normally
                enemy.x = newX;
                enemy.y = newY;
            } else {
                // Try sliding along obstacles
                const testX = { ...enemy, x: newX };
                const testY = { ...enemy, y: newY };
                
                let canMoveX = true, canMoveY = true;
                for (let obstacle of obstacles) {
                    if (checkCollision(testX, obstacle)) canMoveX = false;
                    if (checkCollision(testY, obstacle)) canMoveY = false;
                }
                
                if (canMoveX) {
                    enemy.x = newX;
                } else if (canMoveY) {
                    enemy.y = newY;
                } else {
                    // Try perpendicular movement to "unstick" from corners
                    const perpX = -dirY * enemy.speed * 0.4;
                    const perpY = dirX * enemy.speed * 0.4;
                    const testPerp = { ...enemy, x: enemy.x + perpX, y: enemy.y + perpY };
                    
                    let canMovePerp = true;
                    for (let obstacle of obstacles) {
                        if (checkCollision(testPerp, obstacle)) {
                            canMovePerp = false;
                            break;
                        }
                    }
                    
                    if (canMovePerp) {
                        enemy.x += perpX;
                        enemy.y += perpY;
                    }
                }
            }
            
            // Keep enemies within bounds
            enemy.x = Math.max(-15, Math.min(canvas.width + 5, enemy.x));
            enemy.y = Math.max(-15, Math.min(canvas.height + 5, enemy.y));
        }
        
        // Player collision (with damage cooldown)
        if (checkCollision(player, enemy)) {
            const now = Date.now();
            if (!enemy.lastDamageTime || now - enemy.lastDamageTime > 500) { // 0.5 second cooldown
                player.health -= 8; // Reduced from 15
                enemy.lastDamageTime = now;
                
                // Knockback
                const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
                const knockbackForce = 15;
                let newX = player.x + Math.cos(angle) * knockbackForce;
                let newY = player.y + Math.sin(angle) * knockbackForce;
                
                // Keep player in bounds
                newX = Math.max(0, Math.min(canvas.width - player.width, newX));
                newY = Math.max(0, Math.min(canvas.height - player.height, newY));
                
                // Check if knockback position collides with obstacles
                const testKnockback = { ...player, x: newX, y: newY };
                let canKnockback = true;
                obstacles.forEach(obstacle => {
                    if (checkCollision(testKnockback, obstacle)) canKnockback = false;
                });
                
                if (canKnockback) {
                    player.x = newX;
                    player.y = newY;
                }
            }
        }
    }
    
    // Remove dead enemies and create XP orbs
    for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].health <= 0) {
            const enemy = enemies[i];
            createXPOrb(enemy.x + enemy.width/2, enemy.y + enemy.height/2, enemy.xpValue);
            score += enemy.xpValue * 10;
            enemies.splice(i, 1);
        }
    }
    
    // Spawn more enemies over time (gradual difficulty increase)
    const timeElapsed = 30 - runTimer;
    const spawnRate = 0.015 + (timeElapsed * 0.0008); // Starts slow, ramps up
    const maxEnemies = Math.min(8 + Math.floor(timeElapsed / 5), 15); // Cap at 15 enemies max
    
    if (Math.random() < spawnRate && enemies.length < maxEnemies) {
        enemies.push(createEnemy());
    }
}

// Optimized bullet update with spatial partitioning
function updateBullets() {
    if (gameState !== 'PLAYING') return;
    
    // Update spatial grid
    spatialGrid.clear();
    enemies.forEach(enemy => spatialGrid.insert(enemy));
    
    for (let i = 0; i < bullets.length; i++) {
        const bullet = bullets[i];
        bullet.update();
        
        // Get nearby enemies using spatial partitioning
        const nearbyEnemies = spatialGrid.getNearby(bullet);
        
        // Check enemy collision
        let hitEnemy = false;
        for (let enemy of nearbyEnemies) {
            if (bullet.hitTargets.has(enemy)) continue; // Skip already hit targets for piercing
            
            if (checkCollision(bullet, enemy)) {
                enemy.health -= bullet.damage;
                bullet.hitTargets.add(enemy);
                
                // Handle different projectile types
                if (bullet.type === 'explosive') {
                    bullet.explode();
                    bullet.life = 0;
                    hitEnemy = true;
                    break;
                } else if (bullet.type === 'piercing') {
                    bullet.pierceCount++;
                    if (bullet.pierceCount >= bullet.maxPierce) {
                        bullet.life = 0;
                        hitEnemy = true;
                        break;
                    }
                } else {
                    bullet.life = 0;
                    hitEnemy = true;
                    break;
                }
            }
        }
        
        // Check obstacle collision
        if (!hitEnemy) {
            obstacles.forEach(obstacle => {
                if (checkCollision(bullet, obstacle)) {
                    if (bullet.type === 'explosive') {
                        bullet.explode();
                    }
                    bullet.life = 0;
                }
            });
        }
    }
    
    // Remove dead bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        if (bullets[i].life <= 0 || bullets[i].x < -20 || bullets[i].x > canvas.width + 20 || 
            bullets[i].y < -20 || bullets[i].y > canvas.height + 20) {
            bullets.splice(i, 1);
        }
    }
    
    // Update explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
        explosions[i].life--;
        if (explosions[i].life <= 0) {
            explosions.splice(i, 1);
        }
    }
}

// Update XP orbs
function updateXPOrbs() {
    if (gameState !== 'PLAYING') return;
    
    for (let i = 0; i < xpOrbs.length; i++) {
        const orb = xpOrbs[i];
        const dx = player.x + player.width/2 - (orb.x + orb.width/2);
        const dy = player.y + player.height/2 - (orb.y + orb.height/2);
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < orb.magnetRange) {
            orb.x += dx * 0.15;
            orb.y += dy * 0.15;
        }
        
        if (checkCollision(player, orb)) {
            orb.collected = true;
            player.xp += orb.value;
            
            // Level up system
            const xpNeeded = player.level * 5;
            if (player.xp >= xpNeeded) {
                player.xp -= xpNeeded;
                player.level++;
                levelUp();
            }
        }
    }
    
    // Remove collected orbs
    for (let i = xpOrbs.length - 1; i >= 0; i--) {
        if (xpOrbs[i].collected) {
            xpOrbs.splice(i, 1);
        }
    }
}

// Update timer
function updateTimer() {
    if (gameState !== 'PLAYING') return;
    
    runTimer -= 1/60;
    if (runTimer <= 0) {
        endRun();
    }
}

// Main update function
function updateGame() {
    updatePlayer();
    updateEnemies();
    updateBullets();
    updateXPOrbs();
    updateTimer();
}

// Enhanced menu input handling with keyboard shortcuts
function handleMenuInput() {
    if (gameState === 'MENU') {
        // Mouse controls
        if (mouseClicked) {
            // Start button
            if (pointInRect(mouseX, mouseY, {x: 300, y: 300, width: 200, height: 50})) {
                startGame();
            }
            // Upgrades button
            if (pointInRect(mouseX, mouseY, {x: 300, y: 370, width: 200, height: 50})) {
                gameState = 'UPGRADES';
            }
        }
        
        // Keyboard shortcuts
        if (keysPressed['enter'] || keysPressed[' '] || keysPressed['1']) {
            startGame();
        }
        if (keysPressed['u'] || keysPressed['2']) {
            gameState = 'UPGRADES';
        }
        if (keysPressed['h'] || keysPressed['3']) {
            showControls = !showControls;
        }
        if (keysPressed['q'] || keysPressed['escape']) {
            // Could add quit functionality here
        }
        
    } else if (gameState === 'UPGRADES') {
        // Mouse controls
        if (mouseClicked) {
            // Back button
            if (pointInRect(mouseX, mouseY, {x: 50, y: 50, width: 100, height: 40})) {
                gameState = 'MENU';
            }
            
            // Upgrade buttons
            const upgrades = [
                {name: 'damage', cost: (permanentUpgrades.damage + 1) * 10, y: 150},
                {name: 'speed', cost: (permanentUpgrades.speed + 1) * 12, y: 200},
                {name: 'health', cost: (permanentUpgrades.health + 1) * 15, y: 250},
                {name: 'fireRate', cost: (permanentUpgrades.fireRate + 1) * 20, y: 300},
                {name: 'magnetism', cost: (permanentUpgrades.magnetism + 1) * 8, y: 350}
            ];
            
            upgrades.forEach(upgrade => {
                if (pointInRect(mouseX, mouseY, {x: 500, y: upgrade.y, width: 100, height: 35}) && 
                    coins >= upgrade.cost) {
                    buyUpgrade(upgrade.name, upgrade.cost);
                }
            });
        }
        
        // Keyboard shortcuts
        if (keysPressed['escape'] || keysPressed['b'] || keysPressed['m']) {
            gameState = 'MENU';
        }
        if (keysPressed['h']) {
            showControls = !showControls;
        }
        
        // Number keys for quick purchase
        const upgradeKeys = ['1', '2', '3', '4', '5'];
        const upgradeNames = ['damage', 'speed', 'health', 'fireRate', 'magnetism'];
        const upgradeCosts = [10, 12, 15, 20, 8];
        
        upgradeKeys.forEach((key, index) => {
            if (keysPressed[key] && index < upgradeNames.length) {
                const upgradeName = upgradeNames[index];
                const cost = (permanentUpgrades[upgradeName] + 1) * upgradeCosts[index];
                if (coins >= cost) {
                    buyUpgrade(upgradeName, cost);
                }
            }
        });
        
    } else if (gameState === 'LEVEL_UP') {
        // Mouse controls
        if (mouseClicked) {
            levelUpChoices.forEach((choice, index) => {
                if (pointInRect(mouseX, mouseY, {x: 200, y: 200 + index * 80, width: 400, height: 70})) {
                    choice.apply();
                    gameState = 'PLAYING';
                }
            });
        }
        
        // Keyboard shortcuts (1, 2, 3 for choices)
        const choiceKeys = ['1', '2', '3'];
        choiceKeys.forEach((key, index) => {
            if (keysPressed[key] && index < levelUpChoices.length) {
                levelUpChoices[index].apply();
                gameState = 'PLAYING';
            }
        });
        
    } else if (gameState === 'GAME_OVER') {
        // Mouse controls
        if (mouseClicked) {
            // Restart button
            if (pointInRect(mouseX, mouseY, {x: 250, y: 380, width: 150, height: 50})) {
                startGame();
            }
            // Menu button
            if (pointInRect(mouseX, mouseY, {x: 420, y: 380, width: 150, height: 50})) {
                gameState = 'MENU';
            }
        }
        
        // Keyboard shortcuts
        if (keysPressed['enter'] || keysPressed[' '] || keysPressed['escape'] || keysPressed['m']) {
            gameState = 'MENU';
        }
        if (keysPressed['r'] || keysPressed['1']) {
            startGame(); // Quick restart
        }
    }
}

// Helper function for buying upgrades
function buyUpgrade(upgradeName, cost) {
    coins -= cost;
    permanentUpgrades[upgradeName]++;
    localStorage.setItem('coins', coins.toString());
    localStorage.setItem(`upgrade_${upgradeName}`, permanentUpgrades[upgradeName].toString());
}

// Render functions
function renderGame() {
    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw obstacles
    obstacles.forEach(obstacle => {
        ctx.fillStyle = obstacle.color;
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    });
    
    // Draw XP orbs
    xpOrbs.forEach(orb => {
        ctx.fillStyle = orb.color;
        ctx.fillRect(orb.x, orb.y, orb.width, orb.height);
        
        // Glow effect
        ctx.fillStyle = 'rgba(68, 255, 68, 0.3)';
        ctx.fillRect(orb.x - 2, orb.y - 2, orb.width + 4, orb.height + 4);
    });
    
    // Draw enemies
    enemies.forEach(enemy => {
        ctx.fillStyle = enemy.color;
        ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
        
        // Health bar
        const healthPercent = enemy.health / enemy.maxHealth;
        ctx.fillStyle = '#f44';
        ctx.fillRect(enemy.x, enemy.y - 8, enemy.width, 4);
        ctx.fillStyle = '#4f4';
        ctx.fillRect(enemy.x, enemy.y - 8, enemy.width * healthPercent, 4);
    });
    
    // Draw explosions
    explosions.forEach(explosion => {
        const alpha = explosion.life / explosion.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        
        // Orange explosion circle
        ctx.fillStyle = '#f84';
        ctx.beginPath();
        ctx.arc(explosion.x + explosion.radius, explosion.y + explosion.radius, 
                explosion.radius * (1 - alpha * 0.5), 0, Math.PI * 2);
        ctx.fill();
        
        // Inner bright flash
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(explosion.x + explosion.radius, explosion.y + explosion.radius, 
                explosion.radius * 0.3 * alpha, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    });
    
    // Draw bullets with enhanced visuals
    bullets.forEach(bullet => {
        ctx.save();
        
        // Bullet trail effect
        if (bullet.type === 'homing') {
            ctx.strokeStyle = bullet.color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.moveTo(bullet.x - bullet.vx * 0.5, bullet.y - bullet.vy * 0.5);
            ctx.lineTo(bullet.x, bullet.y);
            ctx.stroke();
        }
        
        ctx.globalAlpha = 1;
        ctx.fillStyle = bullet.color;
        
        // Different shapes for different types
        switch(bullet.type) {
            case 'piercing':
                // Diamond shape
                ctx.save();
                ctx.translate(bullet.x + bullet.width/2, bullet.y + bullet.height/2);
                ctx.rotate(bullet.angle);
                ctx.fillRect(-bullet.width/2, -bullet.height/2, bullet.width, bullet.height);
                ctx.restore();
                break;
            case 'explosive':
                // Circle with glow
                ctx.shadowBlur = 8;
                ctx.shadowColor = bullet.color;
                ctx.beginPath();
                ctx.arc(bullet.x + bullet.width/2, bullet.y + bullet.height/2, bullet.width/2, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'homing':
                // Triangle pointing forward
                ctx.save();
                ctx.translate(bullet.x + bullet.width/2, bullet.y + bullet.height/2);
                ctx.rotate(Math.atan2(bullet.vy, bullet.vx));
                ctx.beginPath();
                ctx.moveTo(bullet.width/2, 0);
                ctx.lineTo(-bullet.width/2, -bullet.height/2);
                ctx.lineTo(-bullet.width/2, bullet.height/2);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
                break;
            default:
                // Regular rectangle
                ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
        }
        
        ctx.restore();
    });
    
    // Draw player
    ctx.fillStyle = '#4f4';
    ctx.fillRect(player.x, player.y, player.width, player.height);
    
    // Player glow
    ctx.fillStyle = 'rgba(68, 255, 68, 0.3)';
    ctx.fillRect(player.x - 3, player.y - 3, player.width + 6, player.height + 6);
    
    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = '16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Timer: ${Math.ceil(runTimer)}s`, 10, 25);
    ctx.fillText(`HP: ${Math.floor(player.health)}/${player.maxHealth}`, 10, 45);
    ctx.fillText(`Level: ${player.level}`, 10, 65);
    ctx.fillText(`Score: ${score}`, 10, 85);
    
    // Active weapon upgrades indicator
    let upgradeY = 105;
    ctx.font = '12px Arial';
    ctx.fillStyle = '#ff4';
    if (player.weapon.multiShot > 0) {
        ctx.fillText(`Multi-Shot x${player.weapon.multiShot + 1}`, 10, upgradeY);
        upgradeY += 15;
    }
    if (player.weapon.piercing) {
        ctx.fillText('Piercing', 10, upgradeY);
        upgradeY += 15;
    }
    if (player.weapon.explosive) {
        ctx.fillText('Explosive', 10, upgradeY);
        upgradeY += 15;
    }
    if (player.weapon.homing) {
        ctx.fillText('Homing', 10, upgradeY);
        upgradeY += 15;
    }
    if (player.weapon.regen) {
        ctx.fillText('Regeneration', 10, upgradeY);
        upgradeY += 15;
    }
    
    // Draw controls overlay if toggled
    if (showControls) {
        renderControlsOverlay();
    }
    
    // Health bar
    const healthPercent = player.health / player.maxHealth;
    ctx.fillStyle = '#f44';
    ctx.fillRect(200, 15, 200, 15);
    ctx.fillStyle = '#4f4';
    ctx.fillRect(200, 15, 200 * healthPercent, 15);
    
    // XP bar
    const xpPercent = player.xp / (player.level * 5);
    ctx.fillStyle = '#444';
    ctx.fillRect(200, 35, 200, 10);
    ctx.fillStyle = '#ff4';
    ctx.fillRect(200, 35, 200 * xpPercent, 10);
}

function renderMenu() {
    // Background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Title
    ctx.fillStyle = '#4f4';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('ROGUE RUNNER', canvas.width/2, 150);
    
    ctx.fillStyle = '#fff';
    ctx.font = '16px Arial';
    ctx.fillText('30-Second Roguelike Survival', canvas.width/2, 180);
    
    // Stats
    ctx.fillStyle = '#ff4';
    ctx.font = '18px Arial';
    ctx.fillText(`Coins: ${coins}`, canvas.width/2, 220);
    ctx.fillText(`Runs Completed: ${totalRuns}`, canvas.width/2, 240);
    
    // Buttons with keyboard shortcuts
    drawButton(300, 300, 200, 50, 'START RUN [1]', '#4f4');
    drawButton(300, 370, 200, 50, 'UPGRADES [2]', '#f84');
    
    // Instructions with controls
    ctx.fillStyle = '#aaa';
    ctx.font = '14px Arial';
    ctx.fillText('WASD to move • Auto-shoot • Collect XP • Survive 30 seconds!', canvas.width/2, 480);
    ctx.fillText('Press [H] for full controls help', canvas.width/2, 500);
    
    // Draw controls overlay if toggled
    if (showControls) {
        renderControlsOverlay();
    }
}

function renderUpgrades() {
    // Background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Title
    ctx.fillStyle = '#f84';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('UPGRADES', canvas.width/2, 80);
    
    // Coins
    ctx.fillStyle = '#ff4';
    ctx.font = '20px Arial';
    ctx.fillText(`Coins: ${coins}`, canvas.width/2, 110);
    
    // Back button
    drawButton(50, 50, 100, 40, 'BACK', '#888');
    
    // Upgrade list
    const upgrades = [
        {name: 'Damage [1]', key: 'damage', desc: 'Increase weapon damage', cost: (permanentUpgrades.damage + 1) * 10, level: permanentUpgrades.damage, y: 150},
        {name: 'Speed [2]', key: 'speed', desc: 'Increase movement speed', cost: (permanentUpgrades.speed + 1) * 12, level: permanentUpgrades.speed, y: 200},
        {name: 'Health [3]', key: 'health', desc: 'Increase max health', cost: (permanentUpgrades.health + 1) * 15, level: permanentUpgrades.health, y: 250},
        {name: 'Fire Rate [4]', key: 'fireRate', desc: 'Faster shooting', cost: (permanentUpgrades.fireRate + 1) * 20, level: permanentUpgrades.fireRate, y: 300},
        {name: 'Magnetism [5]', key: 'magnetism', desc: 'Attract XP from farther', cost: (permanentUpgrades.magnetism + 1) * 8, level: permanentUpgrades.magnetism, y: 350}
    ];
    
    ctx.textAlign = 'left';
    upgrades.forEach(upgrade => {
        ctx.fillStyle = '#fff';
        ctx.font = '18px Arial';
        ctx.fillText(`${upgrade.name} (Lv.${upgrade.level})`, 50, upgrade.y + 20);
        
        ctx.fillStyle = '#aaa';
        ctx.font = '14px Arial';
        ctx.fillText(upgrade.desc, 50, upgrade.y + 40);
        
        // Buy button
        const canAfford = coins >= upgrade.cost;
        drawButton(500, upgrade.y, 100, 35, `${upgrade.cost}c`, canAfford ? '#4f4' : '#666');
    });
    
    // Help text
    ctx.fillStyle = '#aaa';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Use number keys 1-5 to quick buy • Press [H] for help', canvas.width/2, 420);
    
    // Draw controls overlay if toggled
    if (showControls) {
        renderControlsOverlay();
    }
}

function renderLevelUp() {
    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Title
    ctx.fillStyle = '#ff4';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL UP!', canvas.width/2, 100);
    
    ctx.fillStyle = '#4f4';
    ctx.font = '18px Arial';
    ctx.fillText('Choose an upgrade:', canvas.width/2, 130);
    
    // Choices
    levelUpChoices.forEach((choice, index) => {
        const y = 200 + index * 80;
        drawButton(200, y, 400, 70, '', '#333');
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`[${index + 1}] ${choice.name}`, canvas.width/2, y + 30);
        
        ctx.fillStyle = '#aaa';
        ctx.font = '14px Arial';
        ctx.fillText(choice.desc, canvas.width/2, y + 50);
    });
}

function renderGameOver() {
    // Background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Title
    ctx.fillStyle = '#f44';
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('RUN COMPLETE!', canvas.width/2, 150);
    
    // Stats
    ctx.fillStyle = '#fff';
    ctx.font = '20px Arial';
    ctx.fillText(`Score: ${score}`, canvas.width/2, 200);
    ctx.fillText(`Level Reached: ${player.level}`, canvas.width/2, 230);
    ctx.fillText(`Time Survived: ${Math.max(0, 30 - runTimer).toFixed(1)}s`, canvas.width/2, 260);
    
    const coinsEarned = Math.floor(score / 10) + player.level;
    ctx.fillStyle = '#ff4';
    ctx.fillText(`Coins Earned: ${coinsEarned}`, canvas.width/2, 310);
    
    // Buttons with shortcuts
    drawButton(250, 380, 150, 50, 'RESTART [R]', '#4f4');
    drawButton(420, 380, 150, 50, 'MENU [M]', '#888');
    
    // Help text
    ctx.fillStyle = '#aaa';
    ctx.font = '14px Arial';
    ctx.fillText('Press [1/R] to restart or [ENTER/M] for menu', canvas.width/2, 480);
}

function drawButton(x, y, width, height, text, color) {
    const isHovered = pointInRect(mouseX, mouseY, {x, y, width, height});
    
    ctx.fillStyle = isHovered ? lightenColor(color) : color;
    ctx.fillRect(x, y, width, height);
    
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, x + width/2, y + height/2 + 6);
}

function lightenColor(color) {
    // Simple color lightening
    if (color === '#4f4') return '#6f6';
    if (color === '#f84') return '#fa6';
    if (color === '#888') return '#aaa';
    if (color === '#666') return '#888';
    if (color === '#333') return '#555';
    return color;
}

function renderControlsOverlay() {
    // Semi-transparent background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('CONTROLS', canvas.width/2, 60);
    
    ctx.font = '16px Arial';
    ctx.textAlign = 'left';
    let y = 100;
    const leftX = 150;
    const rightX = 450;
    
    if (gameState === 'MENU') {
        const menuControls = [
            '1 / ENTER / SPACE - Start Game',
            '2 / U - Upgrades Menu',
            '3 / H - Toggle Help',
            'ESC / Q - Quit'
        ];
        menuControls.forEach(control => {
            ctx.fillText(control, leftX, y);
            y += 25;
        });
    } else if (gameState === 'PLAYING') {
        const gameControls = [
            'WASD / Arrow Keys - Move',
            'H - Toggle Help',
            'ESC - Return to Menu'
        ];
        gameControls.forEach(control => {
            ctx.fillText(control, leftX, y);
            y += 25;
        });
        
        y = 100;
        const infoText = [
            'Auto-shooting at nearest enemy',
            'Collect XP orbs to level up',
            'Choose upgrades with 1/2/3',
            'Survive for 30 seconds!'
        ];
        infoText.forEach(info => {
            ctx.fillText(info, rightX, y);
            y += 25;
        });
    } else if (gameState === 'UPGRADES') {
        const upgradeControls = [
            '1 - Damage (+3 dmg)',
            '2 - Speed (+1 speed)',  
            '3 - Health (+20 hp)',
            '4 - Fire Rate (+25%)',
            '5 - Magnetism (+range)',
            '',
            'B / ESC / M - Back to Menu',
            'H - Toggle Help'
        ];
        upgradeControls.forEach(control => {
            ctx.fillText(control, leftX, y);
            y += 25;
        });
    } else if (gameState === 'LEVEL_UP') {
        const levelUpControls = [
            '1 / 2 / 3 - Choose Upgrade',
            'Or click with mouse'
        ];
        levelUpControls.forEach(control => {
            ctx.fillText(control, leftX, y);
            y += 25;
        });
    } else if (gameState === 'GAME_OVER') {
        const gameOverControls = [
            '1 / R - Restart Game',
            'ENTER / SPACE / M - Main Menu'
        ];
        gameOverControls.forEach(control => {
            ctx.fillText(control, leftX, y);
            y += 25;
        });
    }
    
    ctx.fillStyle = '#888';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Press H again to close', canvas.width/2, canvas.height - 30);
}

// Main render function
function render() {
    switch(gameState) {
        case 'MENU':
            renderMenu();
            break;
        case 'PLAYING':
            renderGame();
            break;
        case 'UPGRADES':
            renderUpgrades();
            break;
        case 'LEVEL_UP':
            renderGame(); // Show game in background
            renderLevelUp();
            break;
        case 'GAME_OVER':
            renderGameOver();
            break;
    }
}

// Game loop
function gameLoop() {
    // Handle input
    handleMenuInput();
    mouseClicked = false; // Reset click state
    
    // Clear single-press keys after handling input
    Object.keys(keysPressed).forEach(key => {
        keysPressed[key] = false;
    });
    
    // Update game
    if (gameState === 'PLAYING') {
        updateGame();
    }
    
    // Render
    render();
    
    requestAnimationFrame(gameLoop);
}

// Initialize and start
function init() {
    console.log('🎮 Rogue Runner initialized!');
    console.log(`💰 Coins: ${coins}`);
    console.log(`🏃 Total runs: ${totalRuns}`);
    
    // Load permanent upgrades
    Object.keys(permanentUpgrades).forEach(key => {
        permanentUpgrades[key] = parseInt(localStorage.getItem(`upgrade_${key}`) || '0');
    });
    
    gameLoop();
}

// Start the game
init();
