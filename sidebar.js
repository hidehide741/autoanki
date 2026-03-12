// sidebar.js - サイドバー折りたたみトグル
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
})();
