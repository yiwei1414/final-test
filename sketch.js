let capture;
let bodyPose;
let poses = [];
let canDetect = true; // 冷卻機制，防止手勢連續觸發

// 題目設計：第一關（六大類食物是非題）
let questions = [
  { q: "1. 蘋果屬於「乳品類」嗎？", a: "X", info: "乳品類包含牛奶、起司、優酪乳等。\n蘋果屬於「水果類」喔！" },
  { q: "2. 米飯屬於「全穀雜糧類」嗎？", a: "O", info: "全穀雜糧類包含稻米、地瓜、南瓜等，\n能提供我們大腦所需的能量！" },
  { q: "3. 雞肉屬於「豆魚蛋肉類」嗎？", a: "O", info: "豆魚蛋肉類包含黃豆製品、魚類、蛋、肉類，\n是幫我們長肌肉的蛋白質來源！" },
  { q: "4. 青江菜屬於「水果類」嗎？", a: "X", info: "青江菜屬於「蔬菜類」，含有豐富的膳食纖維。\n水果類則是像蘋果、香蕉、芭樂等。" },
  { q: "5. 牛奶屬於「乳品類」嗎？", a: "O", info: "乳品類能提供豐富鈣質，包含鮮奶、奶粉、優格，\n每天早晚一杯奶能幫助長高！" },
  { q: "6. 花生屬於「油脂與堅果種子類」嗎？", a: "O", info: "這類包含花生、腰果、芝麻、杏仁、食用油等，\n每天吃一小把就能補充健康油脂！" },
  { q: "7. 吐司屬於「蔬菜類」嗎？", a: "X", info: "吐司是由小麥麵粉製成，屬於「全穀雜糧類」喔！" }
];

let currentQ = 0;
let score = 0;
let lives = 3; // 生命值：三個愛心

// 遊戲狀態機：
// COVER (封面), INTRO (第一關介紹), PLAYING (第一關答題), FEEDBACK (第一關詳解),
// SUMMARY (第一關總結), INTRO2 (第二關介紹), CALIBRATE (第二關身高偵測校正), SQUAT (第二關深蹲中), 
// LEVEL3_INTRO (第三關介紹), LEVEL3_PLAYING (第三關抓食材), END (大結局與專業結語)
let gameState = "COVER";
let feedbackMsg = "";

// --- 第二關：體能燃脂關專用變數 ---
let squatCounter = 0;      
let targetSquats = 5;    
let baseNoseY = -1;        
let hasSquatted = false;   
let squatTimer = 15;       
let lastTimeCheck = 0;     
let calibrationTimer = 120;

// --- 第三關：均衡晚餐大作戰專用變數 ---
let level3Rice = 0, level3Veg = 0, level3Meat = 0;
let level3Timer = 60;
let level3Items = [];
let spawnRate = 45; // 每幾幀產生一個物體
let level3GoalReached = false;
// 新增：存儲轉換後的左右手座標，供繪製餐盤使用
let handLX, handLY, handRX, handRY;
// 新增：紀錄目前哪隻手握拳 (null, 'left', 'right')
let activeHand = null;

function setup() {
  createCanvas(windowWidth, windowHeight);
  capture = createCapture(VIDEO);
  capture.size(640, 480); 
  capture.hide(); 

  bodyPose = ml5.bodyPose("BlazePose", modelReady);
  noCursor(); 
}

function modelReady() {
  console.log("AI 模型已準備就緒");
  bodyPose.detectStart(capture, gotPoses);
  canDetect = true;
}

function gotPoses(results) {
  poses = results;
}

function draw() {
  noCursor(); 

  // 確保 AI 模型已經加載完成，否則顯示載入中畫面
  if (!bodyPose || (poses.length === 0 && (gameState === "PLAYING" || gameState === "SQUAT" || gameState === "CALIBRATE") && frameCount < 120)) {
    background(255, 245, 225); 
    textAlign(CENTER, CENTER); fill(50); textSize(32);
    text("🍎 營養學園 AI 模型載入中...", width / 2, height / 2);
    drawSpatula();
    return;
  }

  // 1. 繪製小廚房背景
  drawKitchenBackground();

  // 2. 計算影像顯示的大小與位置
  let videoW = width * 0.75;
  let videoH = height * 0.75;
  let x = (width - videoW) / 2;
  let y = (height - videoH) / 2 + 20;

  // 3. 顯示相框白框
  stroke(255); strokeWeight(10); noFill();
  rect(x - 5, y - 5, videoW + 10, videoH + 10, 10);
  
  // 4. 水平翻轉與繪製攝影機影像
  push();
  translate(x + videoW, y); scale(-1, 1);
  image(capture, 0, 0, videoW, videoH);
  pop();

  // 5. 核心：手勢與體感偵測處理邏輯
  handleGestures();

  // 6. 遊戲 UI 覆蓋層（根據狀態渲染畫面）
  drawGameUI(x, y, videoW, videoH);

  // 7. 繪製自定義鍋鏟游標
  drawSpatula();
}

function handleGestures() {
  if (poses && poses.length > 0 && canDetect) {
    let pose = poses[0];
    let joints = {};
    
    if (pose.keypoints) {
      for (let kp of pose.keypoints) {
        if (kp.confidence > 0.2) {
          joints[kp.name] = { x: kp.x, y: kp.y };
        }
      }
    }
    
    let nose = joints['nose'];
    let lw = joints['left_wrist'];
    let rw = joints['right_wrist'];
    
    if (!nose || !lw || !rw) return;

    // ----------------------------------------------------
    // 【通用導航手勢】：雙手合十（左右手腕靠近）切換畫面
    // ----------------------------------------------------
    let d = dist(lw.x, lw.y, rw.x, rw.y);
    if (d < 70) { 
      if (gameState === "COVER") { gameState = "INTRO"; triggerCooldown(1500); return; }
      else if (gameState === "INTRO") { gameState = "PLAYING"; triggerCooldown(1500); return; }
      else if (gameState === "SUMMARY") { gameState = "INTRO2"; triggerCooldown(1500); return; }
      else if (gameState === "FEEDBACK") { nextQuestion(); triggerCooldown(1500); return; }
      else if (gameState === "INTRO2") { gameState = "CALIBRATE"; calibrationTimer = 120; triggerCooldown(1500); return; }
      else if (gameState === "LEVEL3_INTRO") { 
        gameState = "LEVEL3_PLAYING"; 
        level3Timer = 60; lastTimeCheck = millis(); 
        level3Rice = level3Veg = level3Meat = 0;
        level3Items = [];
        triggerCooldown(1500); return; 
      }
    }

    // ----------------------------------------------------
    // 【第一關答題手勢】：僅在 PLAYING 狀態下生效
    // ----------------------------------------------------
    if (gameState === "PLAYING") {
      if (rw.y < nose.y - 40) { checkAnswer("O"); triggerCooldown(); } 
      else if (lw.y < nose.y - 40) { checkAnswer("X"); triggerCooldown(); }
    }

    // ----------------------------------------------------
    // 【第三關：手部位置偵測與食材碰撞判定】
    // ----------------------------------------------------
    if (gameState === "LEVEL3_PLAYING") {
      // 計算影像在畫布上的縮放比例
      let videoW = width * 0.75;
      let videoH = height * 0.75;
      let offX = (width - videoW) / 2;
      let offY = (height - videoH) / 2 + 20;

      // 將手腕座標映射到畫布實際座標 (考慮鏡像與縮放)
      handLX = offX + videoW - (lw.x / 640 * videoW);
      handRX = offX + videoW - (rw.x / 640 * videoW);
      handLY = offY + (lw.y / 480 * videoH);
      handRY = offY + (rw.y / 480 * videoH);
      let handY = offY + (nose.y / 480 * videoH); // 使用鼻子高度代表手部操作區，或直接用手腕 y

      // --- 偵測哪隻手握拳 ---
      const fistThreshold = 80;
      let isLeftFist = (lw && joints['left_index'] && joints['left_thumb'] && 
                        dist(lw.x, lw.y, joints['left_index'].x, joints['left_index'].y) < fistThreshold);
      let isRightFist = (rw && joints['right_index'] && joints['right_thumb'] && 
                         dist(rw.x, rw.y, joints['right_index'].x, joints['right_index'].y) < fistThreshold);

      // 優先序：右手握拳則使用右餐盤，否則檢查左手
      if (isRightFist) {
        activeHand = 'right';
        handRX = offX + videoW - (rw.x / 640 * videoW);
        handRY = offY + (rw.y / 480 * videoH);
      } else if (isLeftFist) {
        activeHand = 'left';
        handLX = offX + videoW - (lw.x / 640 * videoW);
        handLY = offY + (lw.y / 480 * videoH);
      } else {
        activeHand = null;
      }

      if (activeHand === null) return; // 沒握拳就不進行碰撞判定

      let px = (activeHand === 'right') ? handRX : handLX;
      let py = (activeHand === 'right') ? handRY : handLY;

      // 檢查物品碰撞
      for (let i = level3Items.length - 1; i >= 0; i--) {
        let item = level3Items[i];
        if (dist(px, py, item.x, item.y) < 75) {
          // 捕獲物體
          if (item.type === 'VEGGIE') level3Veg++;
          else if (item.type === 'RICE') level3Rice++;
          else if (item.type === 'MEAT') level3Meat++;
          else if (item.type === 'JUNK') level3Timer = max(0, level3Timer - 5);
          
          level3Items.splice(i, 1); // 移除被捕獲的物體
          checkLevel3Win();
        }
      }
    }

    // ----------------------------------------------------
    // 【第二關：AI 身高基準線校正】
    // ----------------------------------------------------
    if (gameState === "CALIBRATE") {
      calibrationTimer--;
      baseNoseY = nose.y; 
      if (calibrationTimer <= 0) {
        gameState = "SQUAT"; squatCounter = 0; squatTimer = 15; lastTimeCheck = millis(); hasSquatted = false;
      }
    }

    // ----------------------------------------------------
    // 【第二關：AI 深蹲追蹤偵測】
    // ----------------------------------------------------
    if (gameState === "SQUAT") {
      if (millis() - lastTimeCheck >= 1000) {
        squatTimer--; lastTimeCheck = millis();
        if (squatTimer <= 0 && squatCounter < targetSquats) { gameState = "INTRO2"; } // 如果時間到且未達標，則重新挑戰第二關
      }

      if (nose.y > baseNoseY + 75 && !hasSquatted) { hasSquatted = true; }

      if (nose.y < baseNoseY + 30 && hasSquatted) {
        squatCounter++; hasSquatted = false;
        if (squatCounter >= targetSquats) { gameState = "LEVEL3_INTRO"; } // 第二關完成進入第三關介紹
      }
    }
  }
}

/**
 * 處理第三關物品掉落
 */
function updateLevel3Items(vx, vy, vw, vh) {
  if (frameCount % spawnRate === 0) {
    let types = [
      {t:'RICE', e:'🍚'}, {t:'MEAT', e:'🍗'}, {t:'VEGGIE', e:'🥦'}, 
      {t:'FRUIT', e:'🍎'}, {t:'MILK', e:'🥛'}, {t:'JUNK', e:'🍩'}, {t:'JUNK', e:'🍟'}
    ];
    let choice = random(types);
    level3Items.push({
      x: random(vx + 50, vx + vw - 50),
      y: vy - 20,
      type: choice.t,
      emoji: choice.e,
      speed: random(3, 6)
    });
  }

  for (let i = level3Items.length - 1; i >= 0; i--) {
    level3Items[i].y += level3Items[i].speed;
    // 繪製物體
    textSize(40);
    text(level3Items[i].emoji, level3Items[i].x, level3Items[i].y + 15); // 偏移一點讓它落在盤子中央
    // 移除掉出螢幕的
    if (level3Items[i].y > vy + vh) {
      level3Items.splice(i, 1);
    }
  }
}

function checkLevel3Win() {
  if (level3Veg >= 2 && level3Rice >= 2 && level3Meat >= 1) {
    gameState = "END";
  }
}

/**
 * 繪製併排愛心生命值於影像視窗右上角
 * @param {number} x 起始 x 座標
 * @param {number} y y 座標
 * @param {number} count 剩餘愛心數量
 */
function drawHearts(x, y, count) {
  for (let i = 0; i < 3; i++) {
    push();
    noStroke();
    // 判斷顏色：索引小於剩餘數量顯示紅色，否則顯示灰色
    if (i < count) { fill(255, 50, 50); } 
    else { fill(150); }
    
    ellipse(x + i * 45 - 10, y, 22, 22);
    ellipse(x + i * 45 + 10, y, 22, 22);
    triangle(x + i * 45 - 21, y + 6, x + i * 45 + 21, y + 6, x + i * 45, y + 28);
    pop();
  }
}

function triggerCooldown(duration = 1000) {
  canDetect = false;
  setTimeout(() => { canDetect = true; }, duration);
}

function drawGameUI(vx, vy, vw, vh) {
  textAlign(CENTER, CENTER);
  
  if (gameState === "COVER") {
    fill(0, 0, 0, 200); rect(0, 0, width, height);
    stroke(0); strokeWeight(8); fill(255, 215, 0); textSize(60);
    text("小小營養師", width / 2, height / 2 - 80);
    textSize(45); fill(255); text("健康餐盤大作戰", width / 2, height / 2);
    noStroke(); fill(200); textSize(24); text("點擊螢幕或雙手合十開啟冒險", width / 2, height / 2 + 100);

    textSize(20); fill(150);
    text("411136541江奕葳", width / 2, height - 30);
  
  } else if (gameState === "SUMMARY") {
    // --- 第一關總結表畫面 ---
    fill(0, 0, 0, 215); rect(0, 0, width, height);
    let boxW = width * 0.6; let boxH = height * 0.6;
    let boxX = width / 2 - boxW / 2; let boxY = height / 2 - boxH / 2 - 40;
    stroke(0); strokeWeight(2); fill(255, 245, 200); rect(boxX, boxY, boxW, boxH, 15);
    
    stroke(0); strokeWeight(4); fill(100, 50, 0); textSize(36);
    text("🍎 六大類食物大總結 🍎", width / 2, boxY + 50);
    
    noStroke(); fill(80, 40, 0); textSize(22); textAlign(LEFT, TOP);
    let infoText = "1. 全穀雜糧類：提供能量 (如：米飯、吐司)\n" +
                   "2. 豆魚蛋肉類：生長發育 (如：雞肉、雞蛋)\n" +
                   "3. 蔬菜類：膳食纖維 (如：青江菜、高麗菜)\n" +
                   "4. 水果類：維生素 (如：蘋果、香蕉)\n" +
                   "5. 乳品類：豐富鈣質 (如：牛奶、優格)\n" +
                   "6. 油脂堅果類：健康油脂 (如：花生、腰果)\n\n" +
                   "💡 記得每天都要均衡攝取這六大類食物喔！";
    text(infoText, boxX + 50, boxY + 110, boxW - 100, boxH - 120);

    textAlign(CENTER, CENTER); stroke(0); strokeWeight(2); fill(0, 150, 255); textSize(24);
    text("🙏 雙手合十（手腕靠攏）進入第二關", width / 2, boxY + boxH + 60);
    
  } else if (gameState === "INTRO") {
    fill(0, 0, 0, 190); rect(0, 0, width, height);
    stroke(0); strokeWeight(6); fill(255, 215, 0); textSize(40);
    text("第一關：食物分類大挑戰", width / 2, height / 2 - 100);
    noStroke(); fill(255); textSize(24);
    text("在這關，你將挑戰辨識「六大類食物」。\n\n❤️ 挑戰規則：你有 3 顆生命愛心，答錯一題扣一顆。\n愛心若全部扣完，就要從第一題重新開始喔！\n\n請依照下方的指引做出手勢：\n正確：✊ 握緊拳頭  |  錯誤：🙅 雙手交叉\n\n點擊螢幕 或 雙手合十 開始作答！", width / 2, height / 2 + 60);

  } else if (gameState === "PLAYING") {
    fill(0, 0, 0, 160); noStroke(); rect(vx, vy, vw, 90, 8);
    stroke(0); strokeWeight(4); fill(255); textSize(32);
    text(questions[currentQ].q, vx + vw/2, vy + 45);
    fill(0, 0, 0, 140); rect(vx, vy + vh - 60, vw, 60, 8);

    // --- 顯示愛心 (右上角) ---
    drawHearts(vx + vw - 140, vy + 35, lives);
    stroke(0); strokeWeight(2); fill(255, 215, 0); textSize(22);
    text("🙅 舉左手代表 (X) 否  |  🙋 舉右手代表 (O) 是", vx + vw/2, vy + vh - 30);
    
  } else if (gameState === "FEEDBACK") {
    fill(0, 0, 0, 190); noStroke(); rect(vx, vy, vw, vh, 10);
    stroke(0); strokeWeight(6);
    if (feedbackMsg === "正確！") { fill(100, 255, 100); textSize(50); text("🎉 " + feedbackMsg, vx + vw/2, vy + vh/2 - 100); } 
    else { fill(255, 100, 100); textSize(50); text("❌ " + feedbackMsg, vx + vw/2, vy + vh/2 - 100); }

    noStroke(); fill(255, 215, 0); textSize(26); text("💡 六大類食物知識補給站", vx + vw/2, vy + vh/2 - 20);
    fill(240); textSize(22); text(questions[currentQ].info, vx + vw/2, vy + vh/2 + 40);
    fill(173, 216, 230); textSize(20); stroke(0); strokeWeight(2); text("🙏 雙手合十進入下一題 ➡️", vx + vw/2, vy + vh - 40);

  } else if (gameState === "LEVEL3_INTRO") {
    fill(0, 0, 0, 200); rect(0, 0, width, height);
    stroke(0); strokeWeight(6); fill(0, 255, 150); textSize(40);
    text("第三關：均衡晚餐大捕手", width / 2, height / 2 - 120);
    noStroke(); fill(255); textSize(24);
    text("最後一關！請用你的雙手去「接住」掉落的食材。\n你需要調配出一份完美的均衡晚餐：\n\n✅ 目標：2 份蔬菜 🥦 + 2 份米飯 🍚 + 1 份肉類 🍗\n⚠️ 警告：接到垃圾食物 🍟 會扣掉 5 秒鐘！\n\n點擊螢幕 或 雙手合十 開始一分鐘挑戰！", width / 2, height / 2 + 60);

  } else if (gameState === "LEVEL3_PLAYING") {
    // 頂部進度條與計時
    fill(0, 0, 0, 160); noStroke(); rect(vx, vy, vw, 80, 8);
    stroke(0); strokeWeight(2); fill(255); textSize(22);
    text(`⏰ 剩餘時間: ${level3Timer}秒`, vx + 100, vy + 40);
    
    // 顯示目標清單
    textAlign(LEFT, CENTER);
    fill(255, 215, 0); text(`🍚 飯: ${level3Rice}/2`, vx + vw - 350, vy + 40);
    fill(100, 255, 100); text(`🥦 菜: ${level3Veg}/2`, vx + vw - 240, vy + 40);
    fill(255, 100, 100); text(`🍗 肉: ${level3Meat}/1`, vx + vw - 130, vy + 40);
    textAlign(CENTER, CENTER);

    // --- 在玩家握拳的手上繪製唯一的餐盤 ---
    if (activeHand === 'right') drawPlate(handRX, handRY);
    else if (activeHand === 'left') drawPlate(handLX, handLY);

    // 更新與繪製掉落食材
    updateLevel3Items(vx, vy, vw, vh);

    if (millis() - lastTimeCheck >= 1000) {
      level3Timer--; lastTimeCheck = millis();
      if (level3Timer <= 0) { gameState = "LEVEL3_INTRO"; } // 時間到未完成，重來
    }

  } else if (gameState === "INTRO2") {
    fill(0, 0, 0, 210); rect(0, 0, width, height);
    stroke(0); strokeWeight(6); fill(255, 100, 100); textSize(42);
    text("🚨 警告！突發卡路里熱量代價體驗 🚨", width / 2, height / 2 - 120);
    noStroke(); fill(255); textSize(24);
    text("你剛剛不小心喝了一杯「珍珠奶茶」，累積了 700 大卡！\n這相當於吃下了 12 顆方糖的熱量！\n\n請在 15 秒內完成 5 次標準深蹲來消滅卡路里！\n\n如果時間內未完成，就需要重新挑戰喔！\n\n點擊螢幕或雙手合十開始「AI 身高偵測」！", width / 2, height / 2 + 40);

  } else if (gameState === "CALIBRATE") {
    fill(0, 0, 0, 160); noStroke(); rect(vx, vy, vw, vh, 10);
    fill(255, 215, 0); textSize(36); stroke(0); strokeWeight(4);
    text("🤖 AI 身高精準校正中...", vx + vw/2, vy + vh/2 - 40);
    noStroke(); fill(255); textSize(22); text("請自然站直，注視鏡頭，保持身體不要亂動...", vx + vw/2, vy + vh/2 + 30);

  } else if (gameState === "SQUAT") {
    fill(0, 0, 0, 160); noStroke(); rect(vx, vy, vw, 100, 8);
    stroke(0); strokeWeight(3); fill(255, 100, 100); textSize(28);
    text("🥤 珍奶熱量大怪獸 (700大卡) 正在逼近！", vx + vw/2, vy + 30);
    stroke(255); strokeWeight(2); fill(50); rect(vx + vw/2 - 150, vy + 60, 300, 20, 5);
    noStroke(); fill(255, 0, 50);
    let remWidth = map(squatCounter, 0, targetSquats, 300, 0);
    rect(vx + vw/2 - 150, vy + 60, remWidth, 20, 5);
    fill(0, 0, 0, 140); rect(vx, vy + vh - 80, vw, 80, 8);
    stroke(0); strokeWeight(3);
    if (squatTimer <= 5) fill(255, 50, 50); else fill(255);
    textSize(24); text(`⏳ 剩餘時間: ${squatTimer} 秒`, vx + vw*0.25, vy + vh - 40);
    fill(100, 255, 100); text(`🏋️ 成功深蹲: ${squatCounter} / ${targetSquats} 次`, vx + vw*0.75, vy + vh - 40);
    if (hasSquatted) { fill(255, 255, 0); textSize(32); text("🔥 偵測到蹲下！請挺胸站起來！ 🔥", vx + vw/2, vy + vh/2); }

  } else if (gameState === "END") {
    // --- 【全新升級】高知識量且溫暖的「期末總結語畫面」 ---
    fill(0, 0, 0, 225); rect(0, 0, width, height);
    
    stroke(0); strokeWeight(6); fill(255, 215, 0); textSize(44);
    text("🏁 榮獲【小小高級營養師證書】 🏁", width/2, height/2 - 200);
    
    // 分數統計
    strokeWeight(3); fill(255); textSize(26);
    text(`第一關食物分類：獲得 ${score} / ${questions.length} 分`, width/2, height/2 - 130);
    fill(100, 255, 100);
    text(`第二關燃脂挑戰：完成 5 次深蹲，成功擊退熱量怪獸！`, width/2, height/2 - 90);
    fill(0, 255, 200);
    text(`第三關餐盤挑戰：成功調配出最均衡的晚餐！`, width/2, height/2 - 50);
    
    // --- 【核心精華結語】知識點總結 ---
    let boxW = width * 0.6;
    let boxH = height * 0.45;
    let boxX = width / 2 - boxW / 2;
    let boxY = height / 2 - 20;

    stroke(0); strokeWeight(1); fill(255, 235, 180); 
    rect(boxX, boxY, boxW, boxH, 15);
    
    textAlign(CENTER, TOP); noStroke(); fill(80, 50, 10); textSize(24);
    let summaryText = "💡 【小小營養師的黃金密碼】 💡\n\n" +
                      "恭喜結業！你學會了：\n" +
                      "1. 均衡餐盤：每餐應包含全穀、蛋白質與充足蔬菜。\n" +
                      "2. 代價體感：一杯珍奶的熱量，需要運動非常久才能抵銷。\n" +
                      "3. 聰明過生活：選擇天然原型食材，遠離加工垃圾食物。\n\n" +
                      "你已經準備好成為家裡的健康小尖兵了！";
    
    // 將文字繪製在方塊內，並預留左右 40px, 上下 30px 的內距
    text(summaryText, boxX + 40, boxY + 30, boxW - 80, boxH - 40);
    
    textAlign(CENTER, CENTER); fill(200); textSize(18);
    text("點擊螢幕任何地方重新開啟挑戰", width / 2, height - 40);
  }
}

function keyPressed() {
  if (gameState === "PLAYING") {
    if (key.toUpperCase() === 'O' || key.toUpperCase() === 'X') { checkAnswer(key.toUpperCase()); }
  } else if (gameState === "FEEDBACK") {
    if (keyCode === RIGHT_ARROW) nextQuestion();
    if (keyCode === LEFT_ARROW) prevQuestion();
  }
}

function checkAnswer(userAnswer) {
  if (userAnswer === questions[currentQ].a) {
    score++; feedbackMsg = "正確！";
  } else {
    lives--; feedbackMsg = "錯誤！";
  }
  gameState = "FEEDBACK";
}

function nextQuestion() {
  if (lives <= 0) { currentQ = 0; score = 0; lives = 3; gameState = "INTRO"; } 
  else {
    currentQ++;
    if (currentQ < questions.length) { gameState = "PLAYING"; } 
    else { gameState = "SUMMARY"; } 
  }
}

function prevQuestion() {
  if (currentQ > 0) { currentQ--; gameState = "PLAYING"; }
}

function mousePressed() {
  if (gameState === "COVER") { gameState = "INTRO"; } 
  else if (gameState === "INTRO") { gameState = "PLAYING"; }
  else if (gameState === "SUMMARY") { gameState = "INTRO2"; }
  else if (gameState === "INTRO2") { gameState = "CALIBRATE"; calibrationTimer = 120; }
  else if (gameState === "LEVEL3_INTRO") { 
    gameState = "LEVEL3_PLAYING"; level3Timer = 60; lastTimeCheck = millis(); 
    level3Rice = level3Veg = level3Meat = 0; level3Items = [];
  }
  else if (gameState === "END") { currentQ = 0; score = 0; lives = 3; gameState = "COVER"; }
}

/**
 * 在指定位置繪製一個可愛的餐盤
 */
function drawPlate(px, py) {
  push();
  // 餐盤陰影
  noStroke();
  fill(0, 0, 0, 50);
  ellipse(px, py + 5, 110, 40);
  
  // 盤子主體 (瓷白色)
  stroke(200);
  strokeWeight(2);
  fill(255);
  ellipse(px, py, 100, 30);
  
  // 內圈裝飾線
  noFill();
  stroke(230);
  ellipse(px, py, 70, 20);
  pop();
}

function drawSpatula() {
  push(); translate(mouseX, mouseY); rotate(radians(-15)); 
  stroke(80, 50, 20); strokeWeight(6); line(0, 0, 0, 40); 
  fill(220); stroke(150); strokeWeight(1); rectMode(CENTER); rect(0, -15, 25, 30, 3); 
  stroke(180); strokeWeight(2); line(-5, -22, -5, -8); line(0, -24, 0, -6); line(5, -22, 5, -8);
  pop();
}

function drawKitchenBackground() {
  background(255, 245, 225); 
  noStroke(); fill(255, 200, 200, 50);
  for (let i = 0; i < width; i += 100) { rect(i, 0, 50, height); }
  fill(150, 100, 80); rect(0, height * 0.75, width, height * 0.25);
  fill(100, 70, 50); rect(0, height * 0.75, width, 20);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}