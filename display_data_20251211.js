/* ==================================================
   Imports & Configuration
================================================== */
import { BUS_DATA } from './bus_schedule_20251211.js';

const CONFIG = {
  // 気象庁 天気予報（神奈川県）
  JMA_FORECAST_URL: "https://www.jma.go.jp/bosai/forecast/data/forecast/140000.json",
  // 気象庁 アメダス（最新時刻確認用 & マップデータ）
  JMA_AMEDAS_TIME: "https://www.jma.go.jp/bosai/amedas/data/latest_time.txt",
  JMA_AMEDAS_MAP: "https://www.jma.go.jp/bosai/amedas/data/map/",
  // アメダス地点コード（46106: 横浜）
  AMEDAS_POINT_ID: "46106",
  
  BUS_SCHEDULE: BUS_DATA
};

/* ==================================================
   Global Variables for Clock Rotation
================================================== */
let loopCountS = 0;
let loopCountM = 0;
let loopCountH = 0;
let prevS = -1;
let prevM = -1;
let prevH = -1;

/* ==================================================
   1. Progress Bar Management
================================================== */
function updateProgress(percent, message) {
  const bar = document.getElementById('progress-bar-fill');
  const text = document.getElementById('loading-text');

  if (bar) bar.style.width = `${percent}%`;
  if (text && message) text.innerText = message;

  if (percent >= 100) {
    setTimeout(() => {
      const loader = document.getElementById('loader-overlay');
      if (loader) loader.classList.add('hidden');

      const container = document.getElementById('main-container');
      if (container) {
        container.classList.add('fade-in');
        container.style.opacity = 1;
      }
    }, 800);
  }
}

/* ==================================================
   2. Clock Display (Digital & Analog)
================================================== */
function updateClock() {
  const now = new Date();

  // --- Digital Clock ---
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const timeEl = document.getElementById('time');
  if (timeEl) timeEl.textContent = `${h}:${m}:${s}`;

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const day = days[now.getDay()];
  const dateEl = document.getElementById('date');
  if (dateEl) dateEl.textContent = `${y}.${mo}.${d} (${day})`;

  // --- Analog Clock Logic ---
  const currentS = now.getSeconds();
  const currentM = now.getMinutes();
  const currentH12 = now.getHours() % 12;

  if (prevS === -1) { 
    prevS = currentS; prevM = currentM; prevH = currentH12; 
  }

  if (currentS < prevS) loopCountS++;
  prevS = currentS;
  if (currentM < prevM) loopCountM++;
  prevM = currentM;
  if (currentH12 < prevH) loopCountH++;
  prevH = currentH12;

  const degS = (currentS * 6) + (loopCountS * 360);
  const degM = (currentM * 6) + (currentS * 0.1) + (loopCountM * 360);
  const degH = (currentH12 * 30) + (currentM * 0.5) + (loopCountH * 360);

  const handS = document.getElementById('hand-second');
  const handM = document.getElementById('hand-minute');
  const handH = document.getElementById('hand-hour');
  if (handS) handS.style.transform = `rotate(${degS}deg)`;
  if (handM) handM.style.transform = `rotate(${degM}deg)`;
  if (handH) handH.style.transform = `rotate(${degH}deg)`;
}

/* ==================================================
   3. Bus Schedule Display
================================================== */
function updateBus() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();

  let upcomingBuses = [];
  const hours = Object.keys(CONFIG.BUS_SCHEDULE).map(Number).sort((a, b) => a - b);

  loop_hours: for (let h of hours) {
    if (h < currentHour) continue;
    const mins = CONFIG.BUS_SCHEDULE[h];
    for (let m of mins) {
      if (h === currentHour && m <= currentMin) continue;
      const busTime = new Date();
      busTime.setHours(h); busTime.setMinutes(m); busTime.setSeconds(0);
      upcomingBuses.push(busTime);
      if (upcomingBuses.length >= 3) break loop_hours;
    }
  }

  const busInfoEl = document.getElementById('bus-info');
  if (!busInfoEl) return;

  if (upcomingBuses.length === 0) {
    busInfoEl.innerHTML = `<span style="color:#aaa; font-size:0.8em;">本日の運行は終了しました</span>`;
    return;
  }

  let html = '';
  upcomingBuses.forEach((bus, index) => {
    const diffMs = bus - now;
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);
    const hStr = bus.getHours();
    const mStr = String(bus.getMinutes()).padStart(2, '0');

    if (index === 0) {
      html += `
        <div class="bus-primary">
          <div class="bus-label-main">NEXT</div>
          <div class="bus-time-main">${hStr}:${mStr}</div>
          <div class="bus-countdown-main">あと ${diffMins}分 ${diffSecs}秒</div>
        </div>
        <div class="bus-divider"></div>
        <div class="bus-sub-container">
      `;
    } else {
      html += `
        <div class="bus-sub-card">
          <div class="bus-time-sub">${hStr}:${mStr}</div>
          <div class="bus-countdown-sub">${diffMins}分${diffSecs}秒</div>
        </div>
      `;
    }
  });
  if (upcomingBuses.length > 0) { html += `</div>`; }
  busInfoEl.innerHTML = html;
}

/* ==================================================
   4. Weather Data & Display (Modified)
================================================== */
// 新しいヘルパー: アメダスから現在の気温を取得
async function fetchCurrentTempAmedas() {
  try {
    // 1. 最新の観測時刻を取得 (例: 2023-12-01T12:00:00+09:00)
    const timeRes = await fetch(CONFIG.JMA_AMEDAS_TIME);
    if (!timeRes.ok) return null;
    const timeText = await timeRes.text();
    
    // 2. 時刻文字列をAPI用の形式(YYYYMMDDHHmmss)に変換
    const date = new Date(timeText);
    if (isNaN(date.getTime())) return null;
    
    const fmt = (n) => String(n).padStart(2, '0');
    const timeStr = `${date.getFullYear()}${fmt(date.getMonth()+1)}${fmt(date.getDate())}${fmt(date.getHours())}${fmt(date.getMinutes())}${fmt(date.getSeconds())}`;
    
    // 3. マップデータを取得
    const mapRes = await fetch(`${CONFIG.JMA_AMEDAS_MAP}${timeStr}.json`);
    if (!mapRes.ok) return null;
    const mapData = await mapRes.json();
    
    // 4. 横浜(46106)の気温を取得 (形式: [気温, 品質フラグ])
    const station = mapData[CONFIG.AMEDAS_POINT_ID];
    if (station && station.temp) {
      return station.temp[0]; // 現在の気温
    }
    return null;
  } catch (e) {
    console.warn("Amedas fetch failed", e);
    return null;
  }
}

async function fetchWeather() {
  try {
    updateProgress(60, "Fetching Weather Data...");

    // 並行してデータを取得（予報 ＆ 現在気温）
    const [forecastRes, currentTemp] = await Promise.all([
      fetch(CONFIG.JMA_FORECAST_URL),
      fetchCurrentTempAmedas()
    ]);

    if (!forecastRes.ok) throw new Error('Network Error');
    const data = await forecastRes.json();

    // --- A. 天気概況 (晴れ/雨など) ---
    const areaData = data[0].timeSeries[0].areas.find(a => a.area.name === "東部");
    const weathers = areaData ? areaData.weathers.map(w => w.replace(/　/g, ' ')) : [];
    
    // --- B. 気温 (予報値) ---
    // 横浜の気温予報を取得
    const tempSeries = data[0].timeSeries[2].areas.find(a => a.area.name === "横浜");
    const temps = tempSeries ? tempSeries.temps : [];

    // 明後日のデータ (週間予報から取得)
    const tempSeriesDA = data[1].timeSeries[1].areas.find(a => a.area.name === "横浜");
    const daMin = tempSeriesDA ? tempSeriesDA.tempsMin[1] : '-';
    const daMax = tempSeriesDA ? tempSeriesDA.tempsMax[1] : '-';

    // --- C. データの割り当て ---
    // [今日]
    // 天気: 予報の1つ目 (夜遅くなら「今夜の天気」になるが許容範囲)
    const wToday = weathers[0] || '-';
    // 気温: アメダスの実測値を使用 (予報のMax/Minは無視)
    const tCurrent = currentTemp !== null ? Math.floor(currentTemp) : '-';

    // [明日]
    // 天気: 予報の2つ目
    const wTom = weathers[1] || '-';
    // 気温: 配列の長さから「明日」の位置を推定
    let tmMin = '-', tmMax = '-';
    
    if (temps.length >= 4) {
        // [今日Min, 今日Max, 明日Min, 明日Max] または [今日Max, 明日Min, 明日Max, ...]
        // 通常、後ろの2つが明日または明後日だが、安全策として:
        // 朝(5時発表): temps=[今日Min, 今日Max, 明日Min, 明日Max] -> 明日は idx 2,3
        // 昼(11時発表): temps=[今日Max, 明日Min, 明日Max] -> 明日は idx 1,2
        // 夕(17時発表): temps=[明日Min, 明日Max, 明後日Min, 明後日Max] -> 明日は idx 0,1
        
        // 簡易判定: 夕方(明日先頭)かどうか
        // ※厳密にはtimeDefinesを見るべきですが、ここでは配列長と並びの慣例で判断
        if (temps.length === 4 && !weathers[0].includes("今夜")) { 
            // 朝のパターン (今日Min, Max, 明日Min, Max) と仮定
             tmMin = temps[2]; tmMax = temps[3];
        } else {
             // 夕方のパターン (明日Min, Max, ...)
             tmMin = temps[0]; tmMax = temps[1];
        }
    } else if (temps.length === 3) {
        // [今日Max, 明日Min, 明日Max]
        tmMin = temps[1]; tmMax = temps[2];
    } else if (temps.length === 2) {
        // [明日Min, 明日Max] (夜間など)
        tmMin = temps[0]; tmMax = temps[1];
    }

    // [明後日]
    const wDa = weathers[2] || '-'; // 予報がない場合もある

    // --- D. 画面更新 ---
    // 今日: 気温は1つだけ表示 (Min/Max形式ではない)
    updateWeatherRow('today', wToday, null, tCurrent, true); 
    // 明日・明後日: Min / Max 形式
    updateWeatherRow('tomorrow', wTom, tmMin, tmMax, false);
    updateWeatherRow('dayafter', wDa, daMin, daMax, false);

    updateProgress(100, "Ready!");
  } catch (e) {
    console.error("Weather fetch failed", e);
    updateProgress(100, "Weather Load Failed.");
  }
}

// updateWeatherRowを修正: isCurrentTempフラグを追加
function updateWeatherRow(dayId, weatherText, min, max, isCurrentTemp) {
  const weatherEl = document.getElementById(`weather-${dayId}`);
  if (weatherEl) weatherEl.innerText = weatherText;

  const tempEl = document.getElementById(`temp-${dayId}`);
  if (tempEl) {
    if (isCurrentTemp) {
      // 現在気温モード: "20.5℃" のように単独表示
      const val = (max === '-' || max === null) ? '--' : `${max}℃`;
      tempEl.innerText = `${val}`;
    } else {
      // 予報モード: "15℃ / 20℃"
      const minStr = (min === '-' || min === undefined) ? '-' : `${min}℃`;
      const maxStr = (max === '-' || max === undefined) ? '-' : `${max}℃`;
      tempEl.innerText = `${minStr} / ${maxStr}`;
    }
  }

  const iconHtml = getWeatherIcon(weatherText);
  const iconEl = document.getElementById(`icon-${dayId}`);
  if (iconEl) iconEl.innerHTML = iconHtml;
}

function getWeatherIcon(text) {
  if (!text) return '<i class="bi bi-question-circle" style="color: #ddd;"></i>';
  if (text.includes("晴")) {
    return '<i class="bi bi-brightness-high-fill" style="color: #ffaa00;"></i>';
  } else if (text.includes("雪")) {
    return '<i class="bi bi-snow" style="color: #ffffff;"></i>';
  } else if (text.includes("雷")) {
    return '<i class="bi bi-cloud-lightning-fill" style="color: #ffd700;"></i>';
  } else if (text.includes("雨")) {
    return '<i class="bi bi-cloud-rain-fill" style="color: #4da6ff;"></i>';
  } else if (text.includes("曇") || text.includes("くもり")) {
    return '<i class="bi bi-cloud-fill" style="color: #aaaaaa;"></i>';
  } else {
    return '<i class="bi bi-cloud-sun" style="color: #ddd;"></i>';
  }
}

/* ==================================================
   Initialization & Main Loop
================================================== */
document.addEventListener('DOMContentLoaded', () => {
  updateProgress(10, "Initializing System...");
  updateClock();
  updateBus();

  setTimeout(() => {
    updateProgress(40, "Loading Weather...");
    fetchWeather();
  }, 600);

  setInterval(updateClock, 1000); 
  setInterval(updateBus, 1000);
  setInterval(fetchWeather, 1000 * 60 * 60); // 天気は10分ごとに更新(アメダス更新頻度に合わせて短縮)
});