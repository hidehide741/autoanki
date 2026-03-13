// sidebar.js - サイドバー折りたたみトグル + モバイルメニュー
(function () {
  const layout = document.getElementById('app-layout');
  const btn = document.getElementById('sidebar-toggle-btn');
  if (!layout || !btn) return;

  const saved = localStorage.getItem('sidebar-mode') || 'expanded';
  layout.className = layout.className.replace(
    /sidebar-expanded|sidebar-collapsed|sidebar-fixed|sidebar-float/g, ''
  ).trim();
  layout.classList.add('sidebar-' + saved);

  function updateArrow() {
    btn.textContent = layout.classList.contains('sidebar-collapsed') ? '›' : '‹';
  }
  updateArrow();

  btn.addEventListener('click', function () {
    const collapsed = layout.classList.contains('sidebar-collapsed');
    layout.classList.remove('sidebar-expanded', 'sidebar-collapsed');
    layout.classList.add(collapsed ? 'sidebar-expanded' : 'sidebar-collapsed');
    localStorage.setItem('sidebar-mode', collapsed ? 'expanded' : 'collapsed');
    updateArrow();
  });

  // ===== モバイルハンバーガーメニュー =====
  const sidebar = document.getElementById('app-sidebar');
  if (!sidebar) return;

  // ナビリンクをサイドバーから取得
  const navLinks = sidebar.querySelectorAll('.nav-btn');
  if (!navLinks.length) return;

  // モバイルメニューボタン
  const menuBtn = document.createElement('button');
  menuBtn.className = 'mobile-menu-btn';
  menuBtn.setAttribute('aria-label', 'メニューを開く');
  menuBtn.textContent = '☰';

  // オーバーレイ
  const overlay = document.createElement('div');
  overlay.className = 'mobile-nav-overlay';

  // パネル
  const panel = document.createElement('div');
  panel.className = 'mobile-nav-panel';
  navLinks.forEach(function (link) {
    const a = document.createElement('a');
    a.href = link.href || '#';
    a.className = link.classList.contains('active') ? 'active' : '';
    a.innerHTML = link.innerHTML;
    panel.appendChild(a);
  });

  document.body.appendChild(menuBtn);
  document.body.appendChild(overlay);
  document.body.appendChild(panel);

  function toggleMobileMenu() {
    const isOpen = panel.classList.contains('show');
    panel.classList.toggle('show', !isOpen);
    overlay.classList.toggle('show', !isOpen);
    menuBtn.textContent = isOpen ? '☰' : '✕';
  }

  menuBtn.addEventListener('click', toggleMobileMenu);
  overlay.addEventListener('click', toggleMobileMenu);
})();
