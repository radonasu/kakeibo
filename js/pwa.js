// ============================================================
// pwa.js - PWAインストール・更新通知・オフライン・スタンドアロン検出
// ============================================================

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  let _deferredPrompt = null;
  let _isStandalone = false;

  // ── スタンドアロン検出 ─────────────────────────────────
  function detectStandalone() {
    _isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (_isStandalone) {
      document.documentElement.classList.add('pwa-standalone');
    }
    return _isStandalone;
  }

  // ── インストールバナー ─────────────────────────────────
  function initInstallPrompt() {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      _deferredPrompt = e;
      // app.js 設定画面との互換性維持
      window.pwaInstallEvent = e;
      // 未dismiss & 未インストール → バナー表示
      if (!localStorage.getItem('pwa_install_dismissed') &&
          !localStorage.getItem('pwa_installed')) {
        showInstallBanner();
      }
    });

    window.addEventListener('appinstalled', function () {
      _deferredPrompt = null;
      window.pwaInstallEvent = null;
      hideInstallBanner();
      localStorage.setItem('pwa_installed', '1');
    });
  }

  function showInstallBanner() {
    if (_isStandalone || document.getElementById('pwa-install-banner')) return;
    var banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.innerHTML =
      '<div class="install-banner-content">' +
        '<span class="install-banner-icon">📲</span>' +
        '<div class="install-banner-text">' +
          '<strong>ホーム画面に追加</strong>' +
          '<span>アプリとして快適に使えます</span>' +
        '</div>' +
        '<button class="btn btn-primary btn-sm" id="install-banner-btn">追加</button>' +
        '<button class="install-banner-close" id="install-banner-close">&times;</button>' +
      '</div>';
    document.body.appendChild(banner);
    requestAnimationFrame(function () { banner.classList.add('show'); });

    document.getElementById('install-banner-btn').addEventListener('click', triggerInstall);
    document.getElementById('install-banner-close').addEventListener('click', function () {
      localStorage.setItem('pwa_install_dismissed', String(Date.now()));
      hideInstallBanner();
    });
  }

  function triggerInstall() {
    if (!_deferredPrompt) return;
    _deferredPrompt.prompt();
    _deferredPrompt.userChoice.then(function (result) {
      if (result.outcome === 'accepted') {
        _deferredPrompt = null;
        window.pwaInstallEvent = null;
        hideInstallBanner();
      }
    });
  }

  function hideInstallBanner() {
    var el = document.getElementById('pwa-install-banner');
    if (el) {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 300);
    }
  }

  // ── iOS インストールガイド ──────────────────────────────
  function showIOSInstallGuide() {
    var ua = navigator.userAgent;
    var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    var isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    if (!isIOS || !isSafari || _isStandalone) return;
    if (localStorage.getItem('pwa_ios_dismissed')) return;

    setTimeout(function () {
      if (document.getElementById('pwa-ios-guide')) return;
      var guide = document.createElement('div');
      guide.id = 'pwa-ios-guide';
      guide.className = 'pwa-ios-guide';
      guide.innerHTML =
        '<div class="ios-guide-content">' +
          '<button class="ios-guide-close" id="ios-guide-close">&times;</button>' +
          '<div class="ios-guide-icon">📲</div>' +
          '<p class="ios-guide-title">ホーム画面に追加</p>' +
          '<p class="ios-guide-steps">' +
            '画面下部の <strong>共有ボタン（□↑）</strong> をタップし、<br>' +
            '「<strong>ホーム画面に追加</strong>」を選択してください' +
          '</p>' +
          '<div class="ios-guide-arrow">\u25BC</div>' +
        '</div>';
      document.body.appendChild(guide);
      requestAnimationFrame(function () { guide.classList.add('show'); });

      document.getElementById('ios-guide-close').addEventListener('click', function () {
        localStorage.setItem('pwa_ios_dismissed', String(Date.now()));
        guide.classList.remove('show');
        setTimeout(function () { guide.remove(); }, 300);
      });
    }, 30000); // 30秒後に表示
  }

  // ── オフラインインジケーター ────────────────────────────
  function initOfflineIndicator() {
    function update() {
      var isOnline = navigator.onLine;
      document.documentElement.classList.toggle('app-offline', !isOnline);
      var indicator = document.getElementById('offline-indicator');
      if (!isOnline) {
        if (!indicator) {
          var el = document.createElement('div');
          el.id = 'offline-indicator';
          el.className = 'offline-indicator';
          el.textContent = 'オフライン — データはローカルに保存されます';
          document.body.appendChild(el);
          requestAnimationFrame(function () { el.classList.add('show'); });
        }
      } else if (indicator) {
        indicator.classList.remove('show');
        setTimeout(function () { indicator.remove(); }, 300);
      }
    }
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }

  // ── Service Worker 登録 & 更新通知 ──────────────────────
  function initServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('./sw.js').then(function (reg) {
      // 60分ごとに更新チェック
      setInterval(function () { reg.update(); }, 60 * 60 * 1000);

      reg.addEventListener('updatefound', function () {
        var newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener('statechange', function () {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateToast();
          }
        });
      });
    }).catch(function () { /* SW未サポート */ });

    // controllerchange でリロード
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }

  function showUpdateToast() {
    if (document.getElementById('update-toast')) return;
    var toast = document.createElement('div');
    toast.id = 'update-toast';
    toast.className = 'update-toast';
    toast.innerHTML =
      '<span>新しいバージョンが利用可能です</span>' +
      '<button class="btn btn-sm btn-primary" id="update-toast-btn">更新</button>';
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('show'); });

    document.getElementById('update-toast-btn').addEventListener('click', function () {
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (reg && reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
  }

  // ── 初期化 ─────────────────────────────────────────────
  function initPWA() {
    detectStandalone();
    initInstallPrompt();
    showIOSInstallGuide();
    initOfflineIndicator();
    initServiceWorker();
  }

  // DOMContentLoaded の発火タイミングに関わらず動作
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPWA);
  } else {
    initPWA();
  }
})();
