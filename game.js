// Gra: Latające Wyspy - Zniszcz Flagę
// Autor: GitHub Copilot
// Komentarze i logika po polsku

// --- Stałe gry ---
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// Wyspy (pozycje X, Y, szerokość, wysokość)
const islands = [
    {x: 80, y: 350, w: 120, h: 30},
    {x: 700, y: 350, w: 120, h: 30},
    {x: 390, y: 250, w: 120, h: 30},
    {x: 240, y: 180, w: 120, h: 30},
    {x: 540, y: 180, w: 120, h: 30},
];

// Flagi (pozycje X, Y, szerokość, wysokość, HP)
const flags = [
    {x: 120, y: 300, w: 30, h: 50, hp: 2, owner: 0},
    {x: 750, y: 300, w: 30, h: 50, hp: 2, owner: 1},
];

// Gracze
const players = [
    {
        x: 140, y: 270, vx: 0, vy: 0, w: 30, h: 40, color: '#ff4444',
        hp: 10, onGround: false, dir: 1, respawn: 0, attacking: false, attackTimer: 0, flag: 0, jumpCount: 0, extraRespawn: false
    },
    {
        x: 770, y: 270, vx: 0, vy: 0, w: 30, h: 40, color: '#44aaff',
        hp: 10, onGround: false, dir: -1, respawn: 0, attacking: false, attackTimer: 0, flag: 1, jumpCount: 0, extraRespawn: false
    }
];

// --- Budulec (lista bloków) ---
const blocks = [];

// --- Bomby ---
const bombs = [];
// --- Cooldown na bomby (w milisekundach) ---
const bombCooldown = [0, 0]; // Czas (timestamp) kiedy gracz może rzucić kolejną bombę
const BOMB_COOLDOWN_MS = 5000; // 5 sekund

// --- Strzały z łuku ---
const arrows = [];
const arrowCooldown = [0, 0]; // cooldown na łuk dla gracza 1 i 2
const ARROW_COOLDOWN_MS = 1200; // 1.2 sekundy

// --- Sterowanie ---
const keys = {};
document.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// --- Funkcje pomocnicze ---
function rectsCollide(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function resetGame() {
    // Resetuje pozycje, HP i flagi
    players[0].x = 140; players[0].y = 270; players[0].hp = 10; players[0].respawn = 0; players[0].jumpCount = 0;
    players[1].x = 770; players[1].y = 270; players[1].hp = 10; players[1].respawn = 0; players[1].jumpCount = 0;
    flags[0].hp = 2; flags[1].hp = 2;
    blocks.length = 0; // Resetuje bloki
    bombs.length = 0; // Resetuje bomby
    arrows.length = 0; // Resetuje strzały
    players[0].extraRespawn = false;
    players[1].extraRespawn = false;
    document.getElementById('status').textContent = '';
}

// --- Funkcja rysowania budulca ---
function drawBlocks() {
    for (const b of blocks) {
        ctx.fillStyle = '#bbbbbb';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = '#888';
        ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
}

// Funkcja rysowania bomb
function drawBombs() {
    for (const bomb of bombs) {
        ctx.beginPath();
        ctx.arc(bomb.x, bomb.y, 12, 0, 2 * Math.PI);
        ctx.fillStyle = '#333';
        ctx.fill();
        ctx.strokeStyle = '#ff0';
        ctx.stroke();
    }
}

// Funkcja obsługi wybuchu bomby
function explodeBomb(bomb) {
    // Zadaj obrażenia i odpychaj graczy
    for (const p of players) {
        const dx = (p.x + p.w/2) - bomb.x;
        const dy = (p.y + p.h/2) - bomb.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 60) {
            // Zadaj obrażenia nawet jeśli gracz jest w respawnie (AI HP zawsze się zmienia)
            p.hp -= 3;
            // Odepchnięcie tylko jeśli nie jest w respawnie
            if (p.respawn === 0) {
                p.vx += Math.sign(dx) * 6;
                p.vy -= 6;
            }
        }
    }
    // Niszczenie bloków w okolicy
    for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        const bx = b.x + b.w/2;
        const by = b.y + b.h/2;
        const dist = Math.sqrt((bx - bomb.x)**2 + (by - bomb.y)**2);
        if (dist < 60) {
            blocks.splice(i, 1);
        }
    }
    // Bomby nie niszczą flag
}

// --- Funkcja sprawdzania kolizji z budulcem ---
function collideBlocks(p) {
    for (const b of blocks) {
        if (rectsCollide(p, b) && p.vy >= 0 && p.y + p.h - p.vy <= b.y + 5) {
            p.y = b.y - p.h;
            p.vy = 0;
            p.onGround = true;
        }
    }
}

// Dodanie trybu AI dla gracza 2
let aiEnabled = true; // Zmienna globalna do włączania/wyłączania AI

// Modyfikacja AI, aby próbowało zniszczyć łóżko
function aiControl(player, enemy) {
    // AI wybiera najbliższy cel: flagę przeciwnika lub gracza
    const targetFlag = flags[enemy.flag];
    // Jeśli flaga przeciwnika jest zniszczona, AI atakuje tylko gracza
    let targetType = 'flag';
    let tx, ty;
    if (targetFlag.hp <= 0) {
        // Atakuj gracza, jeśli flaga zniszczona
        targetType = 'enemy';
        tx = enemy.x + enemy.w / 2;
        ty = enemy.y + enemy.h / 2;
    } else {
        // Oblicz dystans do gracza i do flagi
        const centerPlayer = player.x + player.w / 2;
        const centerEnemy = enemy.x + enemy.w / 2;
        const centerFlag = targetFlag.x + targetFlag.w / 2;
        const distToEnemy = Math.abs(centerPlayer - centerEnemy) + Math.abs(player.y - enemy.y);
        const distToFlag = Math.abs(centerPlayer - centerFlag) + Math.abs(player.y - (targetFlag.y + targetFlag.h / 2));
        tx = centerFlag;
        ty = targetFlag.y + targetFlag.h / 2;
        if (enemy.respawn === 0 && distToEnemy < distToFlag && enemy.hp > 0) {
            targetType = 'enemy';
            tx = centerEnemy;
            ty = enemy.y + enemy.h / 2;
        }
    }
    // Jeśli AI jest poniżej celu, buduje bloki i ustawia się pod celem
    const centerPlayer = player.x + player.w / 2;
    if (player.y > ty + 10) {
        if (Math.abs(centerPlayer - tx) > 5) {
            if (centerPlayer < tx) {
                player.vx = 2;
                player.dir = 1;
            } else {
                player.vx = -2;
                player.dir = -1;
            }
        } else {
            player.vx = 0;
        }
        // 70% szans na postawienie bloku pod sobą
        if (Math.random() < 0.7) {
            const bx = Math.floor((player.x + player.w / 2) / 30) * 30;
            const by = Math.floor((player.y + player.h + 5) / 30) * 30;
            if (!blocks.some(b => b.x === bx && b.y === by)) {
                blocks.push({ x: bx, y: by, w: 30, h: 30 });
            }
        }
        if (player.onGround) {
            player.vy = -7; // AI skacze trochę niżej, łatwiej je zrzucić
            player.onGround = false;
        }
        return;
    }
    // Jeśli AI jest na wysokości celu, ustawia się przy nim i atakuje
    if (centerPlayer < tx - 10) {
        player.vx = 3;
        player.dir = 1;
    } else if (centerPlayer > tx + 10) {
        player.vx = -3;
        player.dir = -1;
    } else {
        player.vx = 0;
        if (!player.attacking && player.attackTimer === 0) {
            if (targetType === 'enemy') {
                // AI łatwiej do pokonania: mniejszy zasięg ataku
                if (
                    Math.abs(player.x + player.w / 2 - (enemy.x + enemy.w / 2)) < 35 &&
                    Math.abs(player.y - enemy.y) < 30 &&
                    Math.sign(enemy.x - player.x) === player.dir &&
                    enemy.respawn === 0 // AI może być atakowane nawet po zniszczeniu flagi, ale nie podczas respawnu
                ) {
                    player.attacking = true;
                    player.attackTimer = 20;
                }
            } else if (targetType === 'flag') {
                if (rectsCollide({x: player.x + player.dir * 30, y: player.y, w: 30, h: 40}, targetFlag) && targetFlag.hp > 0) {
                    player.attacking = true;
                    player.attackTimer = 20;
                }
            }
        }
    }
}

// --- Główna pętla gry ---
function gameLoop() {
    // Czyści ekran
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // --- Rysowanie wysp ---
    for (const isl of islands) {
        ctx.fillStyle = '#654321';
        ctx.fillRect(isl.x, isl.y, isl.w, isl.h);
    }

    // --- Rysowanie budulca ---
    drawBlocks();

    // --- Rysowanie bomb ---
    drawBombs();

    // --- Rysowanie strzał ---
    for (let i = arrows.length - 1; i >= 0; i--) {
        const a = arrows[i];
        a.x += a.vx;
        a.y += a.vy;
        // Rysuj strzałę
        ctx.save();
        ctx.strokeStyle = '#fa0';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x - Math.sign(a.vx)*20, a.y);
        ctx.stroke();
        ctx.restore();
        // Kolizja z graczem przeciwnym
        const target = players[1 - a.owner];
        if (target.respawn === 0 && a.x > target.x && a.x < target.x + target.w && a.y > target.y && a.y < target.y + target.h) {
            // Strzała zadaje obrażenia tylko jeśli gracz ma więcej niż 0 HP
            if (target.hp > 0) {
                target.hp -= 2;
                if (target.hp < 0) target.hp = 0; // Nie pozwól spaść poniżej 0
                target.vx = 6 * Math.sign(a.vx);
                target.vy = -4;
                document.getElementById('status').textContent = `Gracz ${a.owner+1} trafił z łuku!`;
                setTimeout(()=>{document.getElementById('status').textContent='';}, 700);
            }
            arrows.splice(i, 1);
            continue;
        }
        // Kolizja z wyspą lub blokiem
        let hit = false;
        for (const isl of islands) {
            if (a.x > isl.x && a.x < isl.x + isl.w && a.y > isl.y && a.y < isl.y + isl.h) hit = true;
        }
        for (const b of blocks) {
            if (a.x > b.x && a.x < b.x + b.w && a.y > b.y && a.y < b.y + b.h) hit = true;
        }
        if (a.x < 0 || a.x > WIDTH || a.y < 0 || a.y > HEIGHT) hit = true;
        if (hit) arrows.splice(i, 1);
    }

    // --- Rysowanie flag ---
    for (const flag of flags) {
        ctx.fillStyle = flag.hp > 0 ? '#ffff00' : '#888800';
        ctx.fillRect(flag.x, flag.y, flag.w, flag.h);
        ctx.strokeStyle = '#000';
        ctx.strokeRect(flag.x, flag.y, flag.w, flag.h);
    }

    // --- Rysowanie graczy z animacją uderzania ---
    for (let idx = 0; idx < players.length; idx++) {
        const p = players[idx];
        if (p.respawn > 0) continue; // Nie rysuj podczas respawnu
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        // Animacja uderzania (miecz)
        if (p.attacking && p.attackTimer > 0) {
            ctx.save();
            ctx.translate(p.x + p.w/2, p.y + p.h/2);
            ctx.rotate(p.dir * Math.PI/6 * (1 - p.attackTimer/20));
            ctx.fillStyle = '#ccc';
            ctx.fillRect(10 * p.dir, -5, 25, 10);
            ctx.restore();
        }
    }
    // --- Stałe wyświetlanie HP gracza 1 i AI ---
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText('Gracz 1 HP: ' + players[0].hp, 20, 30);
    if (aiEnabled) {
        ctx.textAlign = 'right';
        ctx.fillText('AI HP: ' + players[1].hp, WIDTH - 20, 30);
    } else {
        ctx.textAlign = 'right';
        ctx.fillText('Gracz 2 HP: ' + players[1].hp, WIDTH - 20, 30);
    }
    ctx.textAlign = 'left'; // Przywróć domyślne wyrównanie

    // --- Logika bomb ---
    for (let i = bombs.length - 1; i >= 0; i--) {
        const bomb = bombs[i];
        bomb.vy += 0.5;
        bomb.x += bomb.vx;
        bomb.y += bomb.vy;
        // Kolizja z ziemią lub blokiem
        let hit = false;
        if (bomb.y > HEIGHT - 10) hit = true;
        for (const isl of islands) {
            if (bomb.x > isl.x && bomb.x < isl.x + isl.w && bomb.y > isl.y && bomb.y < isl.y + isl.h) hit = true;
        }
        for (const b of blocks) {
            if (bomb.x > b.x && bomb.x < b.x + b.w && bomb.y > b.y && bomb.y < b.b + b.h) hit = true;
        }
        if (hit) {
            explodeBomb(bomb);
            bombs.splice(i, 1);
        }
    }

    // --- Logika graczy ---
    for (let i = 0; i < 2; i++) {
        const p = players[i];
        const enemy = players[1 - i];

        if (p.respawn > 0) {
            p.respawn--;
            if (p.respawn === 0) {
                // Odradzanie przy fladze
                const f = flags[p.flag];
                p.x = f.x + f.w/2 - p.w/2;
                p.y = f.y - p.h;
                p.vx = 0; p.vy = 0;
                p.hp = Math.max(1, p.hp); // Minimalne HP po respawnie
                p.jumpCount = 0;
            }
            continue;
        }

        if (aiEnabled && i === 1) {
            aiControl(p, enemy); // Sterowanie AI dla gracza 2
        } else {
            // --- Sterowanie z podwójnym skokiem, budowaniem, rzucaniem bomb i strzelaniem z łuku ---
            if (i === 0) {
                // Gracz 1: A/D/W/E/Q/S/R (rzut bombą, strzał z łuku)
                if (keys['a']) { p.vx = -3; p.dir = -1; }
                else if (keys['d']) { p.vx = 3; p.dir = 1; }
                else p.vx = 0;
                if (keys['w'] && p.jumpCount < 2) {
                    p.vy = -8;
                    p.onGround = false;
                    p.jumpCount++;
                    keys['w'] = false; // zapobiega wielokrotnemu skokowi na jednym wciśnięciu
                }
                if (p.onGround) p.jumpCount = 0;
                if (keys['e'] && !p.attacking && p.attackTimer === 0) { p.attacking = true; p.attackTimer = 20; }
                if (keys['q']) {
                    // Budowanie bloku pod graczem
                    const bx = Math.floor((p.x + p.w/2) / 30) * 30;
                    const by = Math.floor((p.y + p.h + 5) / 30) * 30;
                    if (!blocks.some(b => b.x === bx && b.y === by)) {
                        blocks.push({x: bx, y: by, w: 30, h: 30});
                    }
                    keys['q'] = false;
                }
                if (keys['s']) {
                    // Rzut bombą z cooldownem
                    if (Date.now() > bombCooldown[0]) {
                        bombs.push({x: p.x + p.w/2, y: p.y + p.h/2, vx: p.dir * 6, vy: -5});
                        bombCooldown[0] = Date.now() + BOMB_COOLDOWN_MS;
                    } else {
                        // Komunikat o cooldownie
                        document.getElementById('status').textContent = `Bomba gotowa za ${(Math.ceil((bombCooldown[0] - Date.now())/1000))}s!`;
                        setTimeout(()=>{document.getElementById('status').textContent='';}, 700);
                    }
                    keys['s'] = false;
                }
                if (keys['r']) {
                    // Strzał z łuku dla gracza 1
                    if (Date.now() > arrowCooldown[0]) {
                        arrows.push({x: p.x + p.w/2, y: p.y + p.h/2, vx: p.dir * 10, vy: 0, owner: 0});
                        arrowCooldown[0] = Date.now() + ARROW_COOLDOWN_MS;
                    } else {
                        document.getElementById('status').textContent = `Łuk gotowy za ${(Math.ceil((arrowCooldown[0] - Date.now())/1000))}s!`;
                        setTimeout(()=>{document.getElementById('status').textContent='';}, 700);
                    }
                    keys['r'] = false;
                }
                if (keys['x']) {
                    // Automatyczne stawianie bloku pod nogi (scaffold) dla gracza 1 pod X
                    const bx = Math.floor((p.x + p.w/2) / 30) * 30;
                    const by = Math.floor((p.y + p.h + 5) / 30) * 30;
                    if (!blocks.some(b => b.x === bx && b.y === by)) {
                        blocks.push({x: bx, y: by, w: 30, h: 30});
                    }
                    // Nie kasujemy keys['x'], by można było trzymać X i stawiać wiele bloków
                }
            } else {
                // Gracz 2: strzałki/ukośnik/kropka/dolna strzałka/, (rzut bombą, strzał z łuku)
                if (keys['arrowleft']) { p.vx = -3; p.dir = -1; }
                else if (keys['arrowright']) { p.vx = 3; p.dir = 1; }
                else p.vx = 0;
                if (keys['arrowup'] && p.jumpCount < 2) {
                    p.vy = -8;
                    p.onGround = false;
                    p.jumpCount++;
                    keys['arrowup'] = false;
                }
                if (p.onGround) p.jumpCount = 0;
                if (keys['/'] && !p.attacking && p.attackTimer === 0) { p.attacking = true; p.attackTimer = 20; }
                if (keys['.']) {
                    // Budowanie bloku pod graczem
                    const bx = Math.floor((p.x + p.w/2) / 30) * 30;
                    const by = Math.floor((p.y + p.h + 5) / 30) * 30;
                    if (!blocks.some(b => b.x === bx && b.y === by)) {
                        blocks.push({x: bx, y: by, w: 30, h: 30});
                    }
                    keys['.'] = false;
                }
                if (keys['arrowdown']) {
                    if (Date.now() > bombCooldown[1]) {
                        bombs.push({x: p.x + p.w/2, y: p.y + p.h/2, vx: p.dir * 6, vy: -5});
                        bombCooldown[1] = Date.now() + BOMB_COOLDOWN_MS;
                    } else {
                        document.getElementById('status').textContent = `Bomba gotowa za ${(Math.ceil((bombCooldown[1] - Date.now())/1000))}s!`;
                        setTimeout(()=>{document.getElementById('status').textContent='';}, 700);
                    }
                    keys['arrowdown'] = false;
                }
                if (keys[',']) {
                    // Strzał z łuku dla gracza 2
                    if (Date.now() > arrowCooldown[1]) {
                        arrows.push({x: p.x + p.w/2, y: p.y + p.h/2, vx: p.dir * 10, vy: 0, owner: 1});
                        arrowCooldown[1] = Date.now() + ARROW_COOLDOWN_MS;
                    } else {
                        document.getElementById('status').textContent = `Łuk gotowy za ${(Math.ceil((arrowCooldown[1] - Date.now())/1000))}s!`;
                        setTimeout(()=>{document.getElementById('status').textContent='';}, 700);
                    }
                    keys[','] = false;
                }
                if (keys[';']) {
                    // Automatyczne stawianie bloku pod nogi (scaffold) dla gracza 2 pod ;
                    const bx = Math.floor((p.x + p.w/2) / 30) * 30;
                    const by = Math.floor((p.y + p.h + 5) / 30) * 30;
                    if (!blocks.some(b => b.x === bx && b.y === by)) {
                        blocks.push({x: bx, y: by, w: 30, h: 30});
                    }
                    // Nie kasujemy keys[';'], by można było trzymać ; i stawiać wiele bloków
                }
            }
        }

        // --- Grawitacja ---
        p.vy += 0.4; // Grawitacja
        if (p.vy > 10) p.vy = 10;
        p.x += p.vx;
        p.y += p.vy;
        // --- Kolizje z wyspami ---
        p.onGround = false;
        for (const isl of islands) {
            if (rectsCollide(p, isl) && p.vy >= 0 && p.y + p.h - p.vy <= isl.y + 5) {
                p.y = isl.y - p.h;
                p.vy = 0;
                p.onGround = true;
            }
        }
        // --- Kolizje z budulcem ---
        collideBlocks(p);
        // --- Atak mieczem ---
        if (p.attacking && p.attackTimer > 0) {
            p.attackTimer--;
            if (p.attackTimer === 10) {
                // Sprawdź czy trafia przeciwnika
                if (
                    Math.abs(p.x + p.w / 2 - (enemy.x + enemy.w / 2)) < 45 &&
                    Math.abs(p.y - enemy.y) < 30 &&
                    Math.sign(enemy.x - p.x) === p.dir &&
                    (enemy.respawn === 0 || (aiEnabled && i === 0 && enemy.respawn < 99999)) // Pozwala uderzyć AI nawet po zniszczeniu flagi, jeśli nie jest w nieskończonym respawnie
                ) {
                    // Trafienie mieczem
                    const dmg = Math.floor(Math.random()*4)+1; // 1-4 obrażeń
                    enemy.hp -= dmg;
                    // Odepchnięcie
                    enemy.vx = 5 * p.dir; // Odrzut przeciwnika
                    enemy.vy = -3; // Odrzut w górę
                    document.getElementById('status').textContent = `Gracz ${i+1} uderzył Gracza ${2-i} za ${dmg}!`;
                    setTimeout(()=>{document.getElementById('status').textContent='';}, 1000);
                    if (enemy.hp <= 0) {
                        // Śmierć przeciwnika
                        // Jeśli flaga zniszczona, pozwól na jedno odrodzenie
                        if (flags[enemy.flag].hp <= 0 && !enemy.extraRespawn) {
                            enemy.extraRespawn = true;
                            enemy.respawn = 120;
                            enemy.hp = 10;
                            document.getElementById('status').textContent = `Ostatnie odrodzenie bez łóżka!`;
                            setTimeout(()=>{document.getElementById('status').textContent='';}, 1200);
                        } else if (flags[enemy.flag].hp > 0 || (flags[enemy.flag].hp <= 0 && enemy.extraRespawn)) {
                            // Jeśli flaga nie jest zniszczona lub już wykorzystano extra respawn, normalne odrodzenie lub koniec gry
                            enemy.respawn = 120;
                            enemy.hp = 10;
                        } else {
                            enemy.respawn = 999999; // Nie odradzaj już
                        }
                    }
                }
                // Atak na flagę przeciwnika
                const enemyFlag = flags[1-i];
                if (
                    rectsCollide({x: p.x + p.dir*30, y: p.y, w: 30, h: 40}, enemyFlag) &&
                    enemyFlag.hp > 0
                ) {
                    enemyFlag.hp--;
                    document.getElementById('status').textContent = `Flaga Gracza ${2-i} została zniszczona! Gracz ${2-i} może się odrodzić tylko raz!`;
                    setTimeout(()=>{document.getElementById('status').textContent='';}, 2000);
                }
                // Atak na blok budulca
                for (let b = 0; b < blocks.length; b++) {
                    const block = blocks[b];
                    if (rectsCollide({x: p.x + p.dir*30, y: p.y, w: 30, h: 40}, block)) {
                        blocks.splice(b, 1); // Usuwa blok
                        document.getElementById('status').textContent = `Blok został zniszczony mieczem!`;
                        setTimeout(()=>{document.getElementById('status').textContent='';}, 700);
                        break;
                    }
                }
            }
            if (p.attackTimer === 0) p.attacking = false;
        }
        // --- Spadanie poza mapę ---
        if (p.y > HEIGHT) {
            p.respawn = 120; // 2 sekundy
            p.hp = 10;
        }
    }
    // --- Warunki zwycięstwa ---
    let winner = null;
    if (flags[0].hp <= 0 && players[0].respawn > 0) winner = 2;
    if (flags[1].hp <= 0 && players[1].respawn > 0) winner = 1;
    if (winner) {
        document.getElementById('status').textContent = `Gracz ${winner} wygrywa! Wciśnij H aby zresetować.`;
        // Zatrzymaj grę (nie aktualizuj dalej)
        for (const p of players) p.respawn = 999999;
    }
}

// Dodanie wyboru trybu przed rozpoczęciem gry
function showModeSelection() {
    const modeSelection = document.createElement('div');
    modeSelection.id = 'mode-selection';
    modeSelection.innerHTML = `
        <h2>Wybierz tryb gry</h2>
        <button id="mode-player-vs-player">Gracz vs Gracz</button>
        <button id="mode-player-vs-ai">Gracz vs AI</button>
    `;
    document.body.appendChild(modeSelection);

    document.getElementById('mode-player-vs-player').addEventListener('click', () => {
        aiEnabled = false;
        startGame();
    });

    document.getElementById('mode-player-vs-ai').addEventListener('click', () => {
        aiEnabled = true;
        startGame();
    });
}

function startGame() {
    document.getElementById('mode-selection').remove();
    resetGame();
    setInterval(gameLoop, 1000 / 60); // 60 FPS
}

// Wywołanie wyboru trybu na początku
showModeSelection();

// Obsługa resetu gry
window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'h') resetGame();
});

// --- Koniec pliku ---
