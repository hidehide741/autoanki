import StorageManager from './storage.js';

const el = {
  today: document.getElementById('val-today'),
  yesterday: document.getElementById('val-yesterday'),
  streak: document.getElementById('val-streak'),
  total: document.getElementById('val-total'),
  chart: document.getElementById('history-chart'),
  periodBtns: document.querySelectorAll('.period-btn')
};

async function init() {
  const stats = await StorageManager.getStats();
  const cards = await StorageManager.getAllCards();
  
  // Set basic stats
  el.today.textContent = stats.todayReviews || 0;
  el.streak.textContent = stats.streak || 0;
  el.total.textContent = cards.length || 0;

  // Calculate yesterday's date string
  const yesterdayObj = new Date();
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayKey = yesterdayObj.toISOString().split('T')[0];
  
  // Try to get yesterday from history
  const history = stats.history || {};
  el.yesterday.textContent = history[yesterdayKey] || 0;

  // Render Chart for default period (7 days)
  renderChart(history, 7);

  // Setup period button listeners
  el.periodBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      el.periodBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const days = parseInt(e.target.dataset.days, 10);
      renderChart(history, days);
    });
  });
  

}

function renderChart(history, days) {
  el.chart.innerHTML = '';
  const now = new Date();
  
  // Create array of dates
  let maxVal = 0;
  const dataPoints = [];
  
  // Go backwards
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0]; // YYYY-MM-DD
    const val = history[key] || 0;
    if (val > maxVal) maxVal = val;
    
    // label for UI (e.g. 3/11)
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    dataPoints.push({ label, val });
  }
  
  // Minimum scale for visual effect
  if (maxVal < 5) maxVal = 5;

  dataPoints.forEach(pt => {
    const wrap = document.createElement('div');
    wrap.className = 'bar-wrap';
    
    const heightPercent = (pt.val / maxVal) * 100;
    
    const bar = document.createElement('div');
    bar.className = 'bar';
    // Small timeout for animation
    setTimeout(() => {
      bar.style.height = `${Math.max(2, heightPercent)}%`;
    }, 50);
    
    const valText = document.createElement('div');
    valText.className = 'bar-val';
    valText.textContent = pt.val;
    
    const labelText = document.createElement('div');
    labelText.className = 'bar-label';
    labelText.textContent = pt.label;
    
    wrap.appendChild(valText);
    wrap.appendChild(bar);
    wrap.appendChild(labelText);
    el.chart.appendChild(wrap);
  });
}

document.addEventListener('DOMContentLoaded', init);
