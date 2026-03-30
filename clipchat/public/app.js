// ClipChat — Client application
(function () {
  'use strict';

  // ===== State =====
  let ws = null;
  let messages = [];
  let showPinned = false;
  let loading = false;
  let hasMore = true;
  let deviceName = localStorage.getItem('clipchat_device') || '';

  // ===== DOM Refs =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ===== Toast System =====
  function showToast(text, type = 'info') {
    const container = $('.toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = text;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ===== Modal System =====
  function showModal(title, body, actions) {
    const existing = $('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const h2 = document.createElement('h2');
    h2.textContent = title;
    modal.appendChild(h2);

    if (typeof body === 'string') {
      const p = document.createElement('p');
      p.textContent = body;
      modal.appendChild(p);
    } else {
      modal.appendChild(body);
    }

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'modal-actions';
    actions.forEach(({ label, cls, onClick }) => {
      const btn = document.createElement('button');
      btn.className = `modal-btn ${cls}`;
      btn.textContent = label;
      btn.onclick = () => {
        overlay.remove();
        if (onClick) onClick();
      };
      actionsDiv.appendChild(btn);
    });
    modal.appendChild(actionsDiv);

    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  // ===== API Helpers =====
  async function api(method, path, body) {
    const opts = {
      method,
      credentials: 'same-origin',
      headers: {},
    };
    if (body && !(body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    } else if (body) {
      opts.body = body;
    }
    const res = await fetch(`/api${path}`, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  // ===== Auth =====
  async function checkAuth() {
    try {
      const data = await api('GET', '/auth/check');
      return data;
    } catch {
      return { authenticated: false, initialized: false };
    }
  }

  function renderLogin(isSetup) {
    $('#app').innerHTML = `
      <div class="login-screen">
        <div class="login-card">
          <div class="login-logo">📎</div>
          <div class="login-title">ClipChat</div>
          <div class="login-subtitle">${isSetup ? 'Установите мастер-пароль' : 'Введите пароль для входа'}</div>
          <form id="login-form">
            <input type="password" class="login-input" id="password" placeholder="Пароль" autocomplete="current-password" required>
            ${isSetup ? '<input type="password" class="login-input" id="password-confirm" placeholder="Подтвердите пароль" autocomplete="new-password" required>' : ''}
            <button type="submit" class="login-btn">${isSetup ? 'Установить пароль' : 'Войти'}</button>
          </form>
          <div class="login-error" id="login-error"></div>
        </div>
      </div>
    `;

    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('.login-btn');
      const error = $('#login-error');
      const password = $('#password').value;

      if (isSetup) {
        const confirm = $('#password-confirm').value;
        if (password !== confirm) {
          error.textContent = 'Пароли не совпадают';
          return;
        }
        if (password.length < 4) {
          error.textContent = 'Минимум 4 символа';
          return;
        }
      }

      btn.disabled = true;
      error.textContent = '';

      try {
        const endpoint = isSetup ? '/auth/setup' : '/auth/login';
        await api('POST', endpoint, { password });
        initApp();
      } catch (err) {
        error.textContent = err.message;
        btn.disabled = false;
      }
    });

    // Focus password field
    setTimeout(() => $('#password')?.focus(), 100);
  }

  // ===== Format Helpers =====
  function formatTime(ts) {
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(ts) {
    const d = new Date(ts * 1000);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Сегодня';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function shortDevice(ua) {
    if (!ua) return '';
    if (ua.length < 20) return ua; // Custom device name
    if (/iPhone|iPad/.test(ua)) return 'iPhone';
    if (/Android/.test(ua)) return 'Android';
    if (/Mac/.test(ua)) return 'MacBook';
    if (/Linux/.test(ua)) return 'Linux';
    if (/Windows/.test(ua)) return 'Windows';
    return 'Browser';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== Message Rendering =====
  function renderMessage(msg) {
    const typeIcons = { text: '📝', clip: '📋', file: '📎' };
    const typeLabels = { text: 'Заметка', clip: 'Буфер обмена', file: 'Файл' };
    const icon = typeIcons[msg.type] || '📝';
    const label = typeLabels[msg.type] || msg.type;

    let contentHtml = '';
    if (msg.type === 'file') {
      contentHtml = `
        <div class="message-file">
          <span class="file-icon">📎</span>
          <div class="file-info">
            <div class="file-name">${escapeHtml(msg.filename || 'file')}</div>
            <div class="file-size">${formatSize(msg.filesize || 0)}</div>
          </div>
        </div>
        <a class="file-download" href="/api/files/${msg.id}" download>⬇ Скачать</a>
      `;
    } else {
      contentHtml = `<div class="message-content">${escapeHtml(msg.content)}</div>`;
    }

    const div = document.createElement('div');
    div.className = `message${msg.pinned ? ' pinned' : ''}`;
    div.dataset.id = msg.id;

    div.innerHTML = `
      <div class="message-header">
        <span class="message-type">${icon} ${label}</span>
      </div>
      ${contentHtml}
      <div class="message-footer">
        <span class="message-meta">
          ${formatTime(msg.created_at)} · ${formatDate(msg.created_at)}${msg.device ? ' · ' + escapeHtml(shortDevice(msg.device)) : ''}
        </span>
        <div class="message-actions">
          ${msg.type !== 'file' ? `<button class="msg-btn copy-btn" title="Копировать" data-content="${escapeHtml(msg.content)}">📄</button>` : ''}
          <button class="msg-btn pin-btn ${msg.pinned ? 'pin-active' : ''}" title="${msg.pinned ? 'Открепить' : 'Закрепить'}" data-id="${msg.id}">📌</button>
          <button class="msg-btn delete-btn" title="Удалить" data-id="${msg.id}">🗑</button>
        </div>
      </div>
    `;

    return div;
  }

  function renderMessages() {
    const container = $('.messages-container');
    if (!container) return;

    container.innerHTML = '';

    const list = showPinned ? messages.filter((m) => m.pinned) : messages;

    if (list.length === 0 && !loading) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">${showPinned ? '📌' : '📎'}</div>
          <p>${showPinned ? 'Нет закреплённых сообщений' : 'Пока нет сообщений.<br>Вставьте текст из буфера обмена или напишите заметку.'}</p>
        </div>
      `;
      return;
    }

    // Messages are in desc order from API
    list.forEach((msg) => {
      container.appendChild(renderMessage(msg));
    });

    // Event delegation for message actions
    container.onclick = (e) => {
      const copyBtn = e.target.closest('.copy-btn');
      if (copyBtn) {
        const content = copyBtn.dataset.content;
        navigator.clipboard.writeText(content).then(
          () => showToast('Скопировано!', 'success'),
          () => showToast('Не удалось скопировать', 'error')
        );
        return;
      }

      const pinBtn = e.target.closest('.pin-btn');
      if (pinBtn) {
        togglePin(pinBtn.dataset.id);
        return;
      }

      const deleteBtn = e.target.closest('.delete-btn');
      if (deleteBtn) {
        confirmDelete(deleteBtn.dataset.id);
        return;
      }
    };
  }

  // ===== Skeleton Loading =====
  function showSkeleton() {
    const container = $('.messages-container');
    if (!container) return;
    container.innerHTML = Array(3).fill('<div class="skeleton"></div>').join('');
  }

  // ===== Data Operations =====
  async function loadMessages() {
    if (loading) return;
    loading = true;
    try {
      const params = showPinned ? '?pinned=true' : '?limit=50';
      const data = await api('GET', `/messages${params}`);
      messages = data.messages || [];
      renderMessages();
    } catch (err) {
      showToast('Ошибка загрузки: ' + err.message, 'error');
    }
    loading = false;
  }

  async function loadMore() {
    if (loading || !hasMore || showPinned) return;
    const last = messages[messages.length - 1];
    if (!last) return;
    loading = true;
    try {
      const data = await api('GET', `/messages?limit=50&before=${last.id}`);
      const newMsgs = data.messages || [];
      if (newMsgs.length === 0) {
        hasMore = false;
        return;
      }
      messages = [...messages, ...newMsgs];
      renderMessages();
    } catch (err) {
      showToast('Ошибка загрузки', 'error');
    }
    loading = false;
  }

  async function sendMessage(type, content) {
    try {
      const body = { type, content };
      if (deviceName) body.device = deviceName;
      await api('POST', '/messages', body);
    } catch (err) {
      showToast('Ошибка отправки: ' + err.message, 'error');
    }
  }

  async function uploadFile(file) {
    if (file.size > 10 * 1024 * 1024) {
      showToast('Файл слишком большой (макс. 10 МБ)', 'error');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (deviceName) formData.append('device', deviceName);
      await api('POST', '/files', formData);
      showToast('Файл загружен', 'success');
    } catch (err) {
      showToast('Ошибка загрузки файла: ' + err.message, 'error');
    }
  }

  async function togglePin(id) {
    try {
      const result = await api('PATCH', `/messages/${id}/pin`);
      const msg = messages.find((m) => m.id === id);
      if (msg) msg.pinned = result.pinned;
      renderMessages();
    } catch (err) {
      showToast('Ошибка', 'error');
    }
  }

  function confirmDelete(id) {
    showModal(
      'Удалить сообщение?',
      'Это действие нельзя отменить.',
      [
        { label: 'Отмена', cls: 'cancel' },
        { label: 'Удалить', cls: 'danger', onClick: () => deleteMessage(id) },
      ]
    );
  }

  async function deleteMessage(id) {
    try {
      await api('DELETE', `/messages/${id}`);
      // Will be handled by WS event or manual removal
      messages = messages.filter((m) => m.id !== id);
      renderMessages();
      showToast('Удалено', 'success');
    } catch (err) {
      showToast('Ошибка удаления', 'error');
    }
  }

  async function deleteAllMessages() {
    try {
      await api('DELETE', '/messages');
      messages = [];
      renderMessages();
      showToast('Все сообщения удалены', 'success');
    } catch (err) {
      showToast('Ошибка', 'error');
    }
  }

  // ===== WebSocket =====
  function connectWS() {
    const sessionCookie = document.cookie.split(';').find((c) => c.trim().startsWith('session='));
    // Session is httpOnly, so we pass a marker and let the server validate
    // Actually httpOnly cookies can't be read. We'll use a different approach:
    // Connect without session param, and validate via cookie on the upgrade request.
    // But our ws.js expects query param. Let's use a workaround.
    // Since cookies are sent with the WS upgrade request too, let's modify the approach.

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws?session=browser`;

    // The session cookie will be sent with the upgrade request
    // Server-side we should validate cookie too, but for now session=browser is a placeholder
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      updateWSIndicator(false);
      return;
    }

    ws.onopen = () => {
      console.log('WebSocket connected');
      updateWSIndicator(true);
    };

    ws.onmessage = (event) => {
      try {
        const { event: evt, data } = JSON.parse(event.data);
        handleWSEvent(evt, data);
      } catch (e) {
        console.error('WS message parse error:', e);
      }
    };

    ws.onclose = () => {
      updateWSIndicator(false);
      // Reconnect after 3s
      setTimeout(connectWS, 3000);
    };

    ws.onerror = () => {
      updateWSIndicator(false);
    };
  }

  function handleWSEvent(event, data) {
    switch (event) {
      case 'new_message':
        // Add to top of list (newest first)
        if (!messages.find((m) => m.id === data.id)) {
          messages.unshift(data);
          renderMessages();
          // Scroll to top (newest)
          const container = $('.messages-container');
          if (container) container.scrollTop = container.scrollHeight;
        }
        break;
      case 'delete_message':
        messages = messages.filter((m) => m.id !== data.id);
        renderMessages();
        break;
      case 'pin_message':
        const msg = messages.find((m) => m.id === data.id);
        if (msg) {
          msg.pinned = data.pinned;
          renderMessages();
        }
        break;
      case 'clear_messages':
        messages = [];
        renderMessages();
        break;
    }
  }

  function updateWSIndicator(connected) {
    const indicator = $('.ws-indicator');
    if (indicator) {
      indicator.classList.toggle('connected', connected);
      indicator.title = connected ? 'Подключено' : 'Отключено';
    }
  }

  // ===== Settings =====
  function showSettings() {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="settings-section">
        <h3>Устройство</h3>
        <div class="settings-row">
          <input type="text" id="settings-device" placeholder="Имя устройства" value="${escapeHtml(deviceName)}">
          <button class="settings-btn primary" id="save-device">Сохранить</button>
        </div>
      </div>
      <div class="settings-section">
        <h3>Смена пароля</h3>
        <div class="settings-row">
          <input type="password" id="settings-old-pw" placeholder="Текущий пароль">
        </div>
        <div class="settings-row">
          <input type="password" id="settings-new-pw" placeholder="Новый пароль">
          <button class="settings-btn primary" id="change-pw">Сменить</button>
        </div>
      </div>
      <div class="settings-section">
        <h3>Данные</h3>
        <button class="settings-btn danger" id="delete-all-data">Удалить все сообщения</button>
      </div>
      <div class="settings-section">
        <h3>Сессия</h3>
        <button class="settings-btn danger" id="logout-btn">Выйти</button>
      </div>
    `;

    showModal('Настройки', body, [{ label: 'Закрыть', cls: 'cancel' }]);

    // Bind settings actions after DOM is ready
    setTimeout(() => {
      $('#save-device')?.addEventListener('click', () => {
        deviceName = $('#settings-device').value.trim();
        localStorage.setItem('clipchat_device', deviceName);
        showToast('Имя устройства сохранено', 'success');
      });

      $('#change-pw')?.addEventListener('click', async () => {
        const oldPw = $('#settings-old-pw').value;
        const newPw = $('#settings-new-pw').value;
        if (!oldPw || !newPw) {
          showToast('Заполните оба поля', 'error');
          return;
        }
        if (newPw.length < 4) {
          showToast('Минимум 4 символа', 'error');
          return;
        }
        try {
          await api('POST', '/auth/change-password', { oldPassword: oldPw, newPassword: newPw });
          showToast('Пароль изменён', 'success');
          $('.modal-overlay')?.remove();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      $('#delete-all-data')?.addEventListener('click', () => {
        $('.modal-overlay')?.remove();
        showModal(
          'Удалить все сообщения?',
          'Все заметки и файлы будут удалены безвозвратно.',
          [
            { label: 'Отмена', cls: 'cancel' },
            { label: 'Удалить всё', cls: 'danger', onClick: deleteAllMessages },
          ]
        );
      });

      $('#logout-btn')?.addEventListener('click', async () => {
        await api('POST', '/auth/logout');
        location.reload();
      });
    }, 50);
  }

  // ===== Main App Render =====
  function renderApp() {
    $('#app').innerHTML = `
      <div class="offline-banner" id="offline-banner">Нет подключения к серверу</div>
      <div class="header">
        <div class="header-left">
          <h1>📎 ClipChat</h1>
          <div class="ws-indicator" title="Отключено"></div>
        </div>
        <div class="header-right">
          <button class="header-btn" id="pin-filter" title="Закреплённые">📌</button>
          <button class="header-btn" id="settings-btn" title="Настройки">⚙️</button>
        </div>
      </div>
      <div class="messages-container" id="messages"></div>
      <div class="input-bar">
        <div class="input-actions">
          <button class="input-action-btn" id="paste-btn" title="Вставить из буфера обмена">📋</button>
          <button class="input-action-btn" id="file-btn" title="Прикрепить файл">📎</button>
        </div>
        <div class="input-wrapper">
          <textarea id="message-input" placeholder="Введите заметку..." rows="1"></textarea>
        </div>
        <button class="send-btn" id="send-btn" title="Отправить">➤</button>
      </div>
      <input type="file" id="file-input">
    `;

    bindEvents();
    showSkeleton();
    loadMessages();
    connectWS();
  }

  function bindEvents() {
    // Send text message
    const input = $('#message-input');
    const sendBtn = $('#send-btn');

    const doSend = () => {
      const text = input.value.trim();
      if (!text) return;
      sendMessage('text', text);
      input.value = '';
      input.style.height = 'auto';
    };

    sendBtn.addEventListener('click', doSend);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    });

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Paste from clipboard
    $('#paste-btn').addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          sendMessage('clip', text.trim());
          showToast('Вставлено из буфера обмена', 'success');
        } else {
          showToast('Буфер обмена пуст', 'info');
        }
      } catch {
        showToast('Нет доступа к буферу обмена', 'error');
      }
    });

    // File upload
    $('#file-btn').addEventListener('click', () => {
      $('#file-input').click();
    });

    $('#file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        uploadFile(file);
        e.target.value = '';
      }
    });

    // Pin filter
    $('#pin-filter').addEventListener('click', () => {
      showPinned = !showPinned;
      $('#pin-filter').classList.toggle('active', showPinned);
      loadMessages();
    });

    // Settings
    $('#settings-btn').addEventListener('click', showSettings);

    // Infinite scroll (load more on scroll to bottom)
    const container = $('#messages');
    container.addEventListener('scroll', () => {
      // Since flex-direction is column-reverse, "bottom" is actually scrollTop near 0
      if (container.scrollTop < -container.scrollHeight + container.clientHeight + 200) {
        loadMore();
      }
    });

    // Offline detection
    window.addEventListener('online', () => {
      $('#offline-banner').classList.remove('visible');
      loadMessages();
    });
    window.addEventListener('offline', () => {
      $('#offline-banner').classList.add('visible');
    });

    // Drag and drop files
    const appEl = $('#app');
    appEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    appEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    });
  }

  // ===== Init =====
  async function initApp() {
    const { authenticated, initialized } = await checkAuth();

    if (!initialized) {
      renderLogin(true);
      return;
    }

    if (!authenticated) {
      renderLogin(false);
      return;
    }

    renderApp();
  }

  // ===== PWA Registration =====
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  }

  // ===== Boot =====
  document.addEventListener('DOMContentLoaded', initApp);
})();
