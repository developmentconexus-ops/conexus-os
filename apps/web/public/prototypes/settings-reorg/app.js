// Local state and reactive prototype logic
import { FIXTURES } from './fixtures.js';

// Deep clone fixtures into mutable state
const state = {
  currentSection: 'modelos-de-ia',
  theme: 'light',
  phoneMode: false,
  railOpen: false,
  providers: JSON.parse(JSON.stringify(FIXTURES.modelAccounts.providers)),
  builderModels: JSON.parse(JSON.stringify(FIXTURES.builderModels)),
  modelDefaults: JSON.parse(JSON.stringify(FIXTURES.modelDefaults)),
  providerNames: FIXTURES.providerNames,
  
  // UI Flow states
  connecting: false,
  connectProvider: null,
  connectStep: null, // 'api-key', 'device-code', 'paste-code'
  reconnectingProvider: null,
  connectNotice: null,
  myDefaultsNotice: null,
  companyDefaultsNotice: null,
  confirmStopSharing: null, // provider name
};

// Helpers
function getProviderName(providerId) {
  return state.providerNames[providerId] || providerId;
}

function getOwnAccounts() {
  return state.providers.filter(p => p.source === 'stored-user' || p.source === 'oauth-user');
}

function getSharedAccounts() {
  return state.providers.filter(p => p.source === 'stored-org');
}

function getShareableAccounts() {
  return state.providers.filter(p => (p.source === 'stored-user' || p.source === 'oauth-user') && !p.orgCredential);
}

function getConnectableProviders() {
  return state.providers.filter(p => p.source === 'none');
}

// Router & Section Navigation
function setSection(sectionId) {
  state.currentSection = sectionId;
  window.location.hash = sectionId;
  state.railOpen = false;
  render();
}

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  if (['modelos-de-ia', 'padrao-conversas', 'modelos-empresa'].includes(hash)) {
    state.currentSection = hash;
    render();
  }
});

// App Shell Render
export function initApp() {
  const initialHash = window.location.hash.replace('#', '');
  if (['modelos-de-ia', 'padrao-conversas', 'modelos-empresa'].includes(initialHash)) {
    state.currentSection = initialHash;
  }

  // Theme & Viewport Listeners
  document.getElementById('toggle-theme')?.addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', state.theme);
    updateBannerControls();
  });

  document.getElementById('toggle-phone')?.addEventListener('click', () => {
    state.phoneMode = !state.phoneMode;
    const viewport = document.getElementById('viewport');
    if (state.phoneMode) {
      viewport.classList.add('phone-mode');
    } else {
      viewport.classList.remove('phone-mode');
    }
    updateBannerControls();
  });

  render();
}

function updateBannerControls() {
  const themeBtn = document.getElementById('toggle-theme');
  const phoneBtn = document.getElementById('toggle-phone');
  if (themeBtn) {
    themeBtn.textContent = state.theme === 'light' ? 'Tema: Claro' : 'Tema: Escuro';
  }
  if (phoneBtn) {
    phoneBtn.classList.toggle('active', state.phoneMode);
    phoneBtn.textContent = state.phoneMode ? '📱 Celular (Ativo)' : '🖥️ Desktop';
  }
}

function render() {
  renderRail();
  renderContent();
  renderModal();
}

// Rail Navigation
function renderRail() {
  const railContainer = document.getElementById('rail-container');
  if (!railContainer) return;

  railContainer.className = `settings-rail ${state.railOpen ? 'open' : ''}`;
  railContainer.innerHTML = `
    <div class="rail-section">
      <div class="rail-header">Geral</div>
      <ul class="rail-nav">
        <li>
          <button class="rail-link ${state.currentSection === 'modelos-de-ia' ? 'active' : ''}" data-nav="modelos-de-ia">
            <span class="rail-link-content">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21 2-2 2m-6 6 7 7-4 4-7-7 2-2 4 4 6-6Z"/><circle cx="7.5" cy="15.5" r="5.5"/></svg>
              Modelos de IA
            </span>
          </button>
        </li>
        <li>
          <button class="rail-link ${state.currentSection === 'padrao-conversas' ? 'active' : ''}" data-nav="padrao-conversas">
            <span class="rail-link-content">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
              Padrão das conversas novas
            </span>
          </button>
        </li>
      </ul>
    </div>

    <div class="rail-section">
      <div class="rail-header">Instalação</div>
      <ul class="rail-nav">
        <li>
          <button class="rail-link ${state.currentSection === 'modelos-empresa' ? 'active' : ''}" data-nav="modelos-empresa">
            <span class="rail-link-content">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Modelos da empresa
            </span>
          </button>
        </li>
        <li>
          <button class="rail-link boundary" disabled title="Fora do escopo desta reorganização">
            <span class="rail-link-content">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>
              GitHub
            </span>
            <span class="rail-boundary-chip">continua</span>
          </button>
        </li>
        <li>
          <button class="rail-link boundary" disabled title="Fora do escopo desta reorganização">
            <span class="rail-link-content">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 0 0-4 4v1a3 3 0 0 0-3 3v1a3 3 0 0 0 2 2.83V16a5 5 0 0 0 10 0v-2.17A3 3 0 0 0 19 11v-1a3 3 0 0 0-3-3V6a4 4 0 0 0-4-4Z"/></svg>
              Memória
            </span>
            <span class="rail-boundary-chip">continua</span>
          </button>
        </li>
        <li>
          <button class="rail-link boundary" disabled title="Fora do escopo desta reorganização">
            <span class="rail-link-content">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Administradores
            </span>
            <span class="rail-boundary-chip">continua</span>
          </button>
        </li>
      </ul>
    </div>
  `;

  // Attach nav handlers
  railContainer.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      setSection(btn.getAttribute('data-nav'));
    });
  });

  // Mobile menu button hook
  const menuToggle = document.getElementById('phone-menu-toggle');
  if (menuToggle) {
    menuToggle.onclick = () => {
      state.railOpen = !state.railOpen;
      railContainer.classList.toggle('open', state.railOpen);
    };
  }
}

// Main Content Section Dispatcher
function renderContent() {
  const main = document.getElementById('main-content');
  if (!main) return;

  if (state.currentSection === 'modelos-de-ia') {
    main.innerHTML = renderModelosDeIA();
    attachModelosDeIAEvents(main);
  } else if (state.currentSection === 'padrao-conversas') {
    main.innerHTML = renderPadraoConversas();
    attachPadraoConversasEvents(main);
  } else if (state.currentSection === 'modelos-empresa') {
    main.innerHTML = renderModelosEmpresa();
    attachModelosEmpresaEvents(main);
  }
}

// -------------------------------------------------------------
// SECTION 1: Modelos de IA
// -------------------------------------------------------------
function renderModelosDeIA() {
  const own = getOwnAccounts();
  const shared = getSharedAccounts();

  return `
    <div class="cxs-page">
      <div class="cxs-page-header">
        <h1>Modelos de IA</h1>
        <p>Cada pessoa usa a própria conta. Uma conta compartilhada pela instalação atende quem não conectou a sua.</p>
      </div>

      <!-- Suas contas -->
      <section>
        <h2>Suas contas</h2>
        ${own.length === 0 ? '<div class="cxs-empty">Nenhuma conta conectada.</div>' : `
          <ul class="cxs-list">
            ${own.map(acc => {
              const name = getProviderName(acc.provider);
              const isNeedsReconnect = acc.needsReconnect;
              return `
                <li>
                  <div class="cxs-row-main">
                    <span class="cxs-row-title">${name}</span>
                    <span class="cxs-row-meta">${acc.userCredential === 'oauth' ? 'OAuth conectada' : 'Chave de API'}</span>
                  </div>
                  <div class="cxs-row-actions">
                    ${isNeedsReconnect ? `
                      <span class="cxs-chip cxs-chip-warning">
                        <span class="cxs-chip-dot"></span>
                        Precisa entrar de novo
                      </span>
                      <button class="btn btn-primary btn-sm" data-action="reconnect" data-provider="${acc.provider}">Reconectar</button>
                    ` : `
                      <span class="cxs-chip cxs-chip-positive">
                        <span class="cxs-chip-dot"></span>
                        Conectada
                      </span>
                    `}
                    <button class="btn btn-outline btn-sm" data-action="disconnect" data-provider="${acc.provider}">Desconectar</button>
                  </div>
                </li>
              `;
            }).join('')}
          </ul>
        `}

        ${state.reconnectingProvider ? renderReconnectBox(state.reconnectingProvider) : ''}

        ${state.connecting ? renderConnectFlow() : `
          <div>
            <button class="btn btn-primary" id="btn-open-connect">Conectar conta</button>
          </div>
        `}

        ${state.connectNotice ? `<div class="cxs-status">${state.connectNotice}</div>` : ''}
      </section>

      <!-- Compartilhadas pela instalação -->
      <section>
        <h2>Compartilhadas pela instalação</h2>
        ${shared.length === 0 ? '<div class="cxs-empty">Nenhuma conta compartilhada no momento.</div>' : `
          <ul class="cxs-list">
            ${shared.map(acc => `
              <li>
                <div class="cxs-row-main">
                  <span class="cxs-row-title">${getProviderName(acc.provider)}</span>
                  <span class="cxs-row-meta">Compartilhada com toda a organização</span>
                </div>
                <div class="cxs-row-actions">
                  <span class="cxs-chip cxs-chip-neutral">Compartilhada pela instalação</span>
                </div>
              </li>
            `).join('')}
          </ul>
        `}
      </section>
    </div>
  `;
}

function renderReconnectBox(providerId) {
  const name = getProviderName(providerId);
  return `
    <div class="cxs-connect">
      <div class="cxs-connect-header">
        <h3>Reconectar ${name}</h3>
        <button class="btn btn-outline btn-sm" data-action="cancel-reconnect">Cancelar</button>
      </div>
      <p class="cxs-hint">Autorize novamente a conexão para continuar usando este provedor.</p>
      <div class="cxs-device-code-box">
        <span class="cxs-hint">Código de verificação do dispositivo</span>
        <div class="cxs-device-code">WDGB-9821</div>
        <p class="cxs-hint">Copie o código acima e confirme no navegador.</p>
        <div>
          <button class="btn btn-primary" data-action="finish-reconnect" data-provider="${providerId}">Simular autorização concluída</button>
        </div>
      </div>
    </div>
  `;
}

function renderConnectFlow() {
  if (!state.connectProvider) {
    const available = getConnectableProviders();
    return `
      <div class="cxs-connect">
        <div class="cxs-connect-header">
          <h3>Escolha o provedor de IA</h3>
          <button class="btn btn-outline btn-sm" id="btn-cancel-connect">Cancelar</button>
        </div>
        <div class="cxs-picker-grid">
          ${available.map(p => `
            <div class="cxs-provider-card" data-pick-provider="${p.provider}">
              <strong>${getProviderName(p.provider)}</strong>
              <span class="cxs-row-meta">${p.provider === 'openai' ? 'OAuth / Código' : 'Chave API'}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  const pObj = state.providers.find(p => p.provider === state.connectProvider);
  const name = getProviderName(state.connectProvider);

  if (pObj && pObj.oauth && pObj.oauth.supported) {
    return `
      <div class="cxs-connect">
        <div class="cxs-connect-header">
          <h3>Conectar ${name}</h3>
          <button class="btn btn-outline btn-sm" id="btn-cancel-connect">Cancelar</button>
        </div>
        
        <div class="cxs-connect-methods">
          <button class="btn ${state.connectStep === 'device-code' || !state.connectStep ? 'btn-primary' : 'btn-outline'} btn-sm" data-oauth-mode="device-code">Código no dispositivo</button>
          <button class="btn ${state.connectStep === 'paste-code' ? 'btn-primary' : 'btn-outline'} btn-sm" data-oauth-mode="paste-code">Colar código de retorno</button>
        </div>

        ${state.connectStep === 'paste-code' ? `
          <form class="cxs-form" id="form-paste-code">
            <div class="cxs-field">
              <label>Cole a URL de redirecionamento ou código gerado</label>
              <input type="text" class="cxs-input" placeholder="https://..." required id="input-oauth-code" />
            </div>
            <div>
              <button type="submit" class="btn btn-primary">Concluir conexão</button>
            </div>
          </form>
        ` : `
          <div class="cxs-device-code-box">
            <span class="cxs-hint">Abra o link e insira este código para autorizar o Conexus</span>
            <div class="cxs-device-code">CNX-7429</div>
            <div>
              <button class="btn btn-primary" id="btn-complete-device-code">Simular código aceito</button>
            </div>
          </div>
        `}
      </div>
    `;
  }

  return `
    <div class="cxs-connect">
      <div class="cxs-connect-header">
        <h3>Conectar ${name}</h3>
        <button class="btn btn-outline btn-sm" id="btn-cancel-connect">Cancelar</button>
      </div>
      <form class="cxs-form" id="form-api-key">
        <div class="cxs-field">
          <label>Chave de API (${name})</label>
          <input type="password" class="cxs-input" placeholder="sk-..." required id="input-api-key" />
          <span class="cxs-hint">A credencial fica armazenada com segurança no Hub. Nenhum segredo chega ao navegador.</span>
        </div>
        <div>
          <button type="submit" class="btn btn-primary">Salvar chave de API</button>
        </div>
      </form>
    </div>
  `;
}

function attachModelosDeIAEvents(container) {
  container.querySelector('#btn-open-connect')?.addEventListener('click', () => {
    state.connecting = true;
    state.connectProvider = null;
    state.connectNotice = null;
    render();
  });

  container.querySelector('#btn-cancel-connect')?.addEventListener('click', () => {
    state.connecting = false;
    state.connectProvider = null;
    state.connectStep = null;
    render();
  });

  container.querySelectorAll('[data-pick-provider]').forEach(el => {
    el.addEventListener('click', () => {
      state.connectProvider = el.getAttribute('data-pick-provider');
      state.connectStep = 'device-code';
      render();
    });
  });

  container.querySelectorAll('[data-oauth-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.connectStep = btn.getAttribute('data-oauth-mode');
      render();
    });
  });

  container.querySelector('#form-paste-code')?.addEventListener('submit', (e) => {
    e.preventDefault();
    finishConnect(state.connectProvider, 'oauth');
  });

  container.querySelector('#btn-complete-device-code')?.addEventListener('click', () => {
    finishConnect(state.connectProvider, 'oauth');
  });

  container.querySelector('#form-api-key')?.addEventListener('submit', (e) => {
    e.preventDefault();
    finishConnect(state.connectProvider, 'stored-user');
  });

  container.querySelectorAll('[data-action="reconnect"]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.reconnectingProvider = btn.getAttribute('data-provider');
      render();
    });
  });

  container.querySelector('[data-action="cancel-reconnect"]')?.addEventListener('click', () => {
    state.reconnectingProvider = null;
    render();
  });

  container.querySelectorAll('[data-action="finish-reconnect"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.getAttribute('data-provider');
      const target = state.providers.find(x => x.provider === p);
      if (target) {
        delete target.needsReconnect;
      }
      state.reconnectingProvider = null;
      state.connectNotice = `${getProviderName(p)} reconectado com sucesso.`;
      render();
    });
  });

  container.querySelectorAll('[data-action="disconnect"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.getAttribute('data-provider');
      const target = state.providers.find(x => x.provider === p);
      if (target) {
        target.source = 'none';
        target.userCredential = null;
        delete target.needsReconnect;
      }
      state.connectNotice = `${getProviderName(p)} desconectado.`;
      render();
    });
  });
}

function finishConnect(providerId, sourceKind) {
  const p = state.providers.find(x => x.provider === providerId);
  if (p) {
    p.source = sourceKind === 'oauth' ? 'oauth-user' : 'stored-user';
    p.userCredential = sourceKind === 'oauth' ? 'oauth' : 'api_key';
    delete p.needsReconnect;
  }
  state.connecting = false;
  state.connectProvider = null;
  state.connectStep = null;
  state.connectNotice = `Conta ${getProviderName(providerId)} conectada.`;
  render();
}

// -------------------------------------------------------------
// SECTION 2: Padrão das conversas novas
// -------------------------------------------------------------
function renderPadraoConversas() {
  const isMine = Boolean(state.modelDefaults.mine);
  const companyDefaults = state.modelDefaults.installation;
  const models = state.builderModels;

  const buildModelName = models.find(m => m.id === companyDefaults?.build)?.modelName || companyDefaults?.build;
  const fastModelName = models.find(m => m.id === companyDefaults?.fast)?.modelName || companyDefaults?.fast;

  return `
    <div class="cxs-page">
      <div class="cxs-page-header">
        <h1>Padrão das conversas novas</h1>
        <p>Escolha se novas conversas usam as recomendações da organização ou a sua configuração preferida.</p>
      </div>

      <section>
        <h2>Origem dos padrões</h2>
        <div class="cxs-toggle-group" role="radiogroup">
          <button type="button" class="btn ${!isMine ? 'btn-primary' : 'btn-outline'}" id="btn-use-company">
            Usar os padrões da empresa
          </button>
          <button type="button" class="btn ${isMine ? 'btn-primary' : 'btn-outline'}" id="btn-use-mine">
            Escolher os meus
          </button>
        </div>

        ${!isMine ? `
          <div class="cxs-notice cxs-notice-info">
            ${companyDefaults ? `
              <strong>Padrões em vigor da empresa:</strong><br />
              Construção: ${buildModelName} · Rápido: ${fastModelName}
            ` : 'A empresa ainda não definiu padrões.'}
          </div>
        ` : `
          <form class="cxs-form" id="form-my-defaults">
            <div class="cxs-field">
              <label for="select-build">Modelo de Construção</label>
              <select class="cxs-select" id="select-build">
                ${models.map(m => `
                  <option value="${m.id}" ${state.modelDefaults.mine?.build === m.id ? 'selected' : ''}>
                    ${m.provider} · ${m.modelName}
                  </option>
                `).join('')}
              </select>
            </div>
            <div class="cxs-field">
              <label for="select-fast">Modelo Rápido</label>
              <select class="cxs-select" id="select-fast">
                ${models.map(m => `
                  <option value="${m.id}" ${state.modelDefaults.mine?.fast === m.id ? 'selected' : ''}>
                    ${m.provider} · ${m.modelName}
                  </option>
                `).join('')}
              </select>
            </div>
            <div>
              <button type="submit" class="btn btn-primary">Salvar meus padrões</button>
            </div>
          </form>
        `}

        ${state.myDefaultsNotice ? `<div class="cxs-status">${state.myDefaultsNotice}</div>` : ''}

        <p class="cxs-hint">Vale para conversas novas. Numa conversa, o seletor troca o modelo só dela.</p>
      </section>
    </div>
  `;
}

function attachPadraoConversasEvents(container) {
  container.querySelector('#btn-use-company')?.addEventListener('click', () => {
    state.modelDefaults.mine = null;
    state.myDefaultsNotice = 'Voltou a usar os padrões da empresa.';
    render();
  });

  container.querySelector('#btn-use-mine')?.addEventListener('click', () => {
    state.modelDefaults.mine = {
      build: state.builderModels[0].id,
      fast: state.builderModels[1].id
    };
    state.myDefaultsNotice = null;
    render();
  });

  container.querySelector('#form-my-defaults')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const build = container.querySelector('#select-build').value;
    const fast = container.querySelector('#select-fast').value;
    state.modelDefaults.mine = { build, fast };
    state.myDefaultsNotice = 'Padrões salvos.';
    render();
  });
}

// -------------------------------------------------------------
// SECTION 3: Modelos da empresa
// -------------------------------------------------------------
function renderModelosEmpresa() {
  const shared = getSharedAccounts();
  const shareable = getShareableAccounts();
  const defaults = state.modelDefaults.installation;
  const models = state.builderModels;

  return `
    <div class="cxs-page">
      <div class="cxs-page-header">
        <h1>Modelos da empresa</h1>
        <p>Gerencie as contas compartilhadas com todos e os modelos padrão da instalação em um só lugar.</p>
      </div>

      <div class="cxs-notice cxs-notice-warning">
        Compartilhar uma assinatura pessoal pode violar os termos do provedor. Use contas corporativas para a equipe.
      </div>

      <!-- 1. Contas compartilhadas com todos -->
      <section>
        <h2>Compartilhadas com todos</h2>
        ${shared.length === 0 ? '<div class="cxs-empty">Nenhuma conta compartilhada no momento.</div>' : `
          <ul class="cxs-list">
            ${shared.map(acc => `
              <li>
                <div class="cxs-row-main">
                  <span class="cxs-row-title">${getProviderName(acc.provider)}</span>
                  <span class="cxs-row-meta">Compartilhada pela instalação</span>
                </div>
                <div class="cxs-row-actions">
                  <button class="btn btn-outline btn-sm" data-action="prompt-stop-share" data-provider="${acc.provider}">
                    Parar de compartilhar
                  </button>
                </div>
              </li>
            `).join('')}
          </ul>
        `}
      </section>

      <!-- 2. Suas contas disponíveis para compartilhar -->
      <section>
        <h2>Suas contas que podem ser compartilhadas</h2>
        ${shareable.length === 0 ? '<div class="cxs-empty">Nenhuma conta sua disponível para compartilhar.</div>' : `
          <ul class="cxs-list">
            ${shareable.map(acc => `
              <li>
                <div class="cxs-row-main">
                  <span class="cxs-row-title">${getProviderName(acc.provider)}</span>
                  <span class="cxs-row-meta">Conectada pessoalmente (${acc.userCredential === 'oauth' ? 'OAuth' : 'API Key'})</span>
                </div>
                <div class="cxs-row-actions">
                  <button class="btn btn-primary btn-sm" data-action="share-everyone" data-provider="${acc.provider}">
                    Compartilhar com todos
                  </button>
                </div>
              </li>
            `).join('')}
          </ul>
        `}
      </section>

      <!-- 3. Padrões da empresa para a instalação -->
      <section>
        <h2>Modelos padrão da instalação</h2>
        <p class="cxs-hint">Modelos atribuídos para usuários que não customizaram seus próprios padrões.</p>
        <form class="cxs-form" id="form-company-defaults">
          <div class="cxs-field">
            <label for="company-build">Construção (Padrão da empresa)</label>
            <select class="cxs-select" id="company-build">
              ${models.map(m => `
                <option value="${m.id}" ${defaults?.build === m.id ? 'selected' : ''}>
                  ${m.provider} · ${m.modelName}
                </option>
              `).join('')}
            </select>
          </div>
          <div class="cxs-field">
            <label for="company-fast">Rápido (Padrão da empresa)</label>
            <select class="cxs-select" id="company-fast">
              ${models.map(m => `
                <option value="${m.id}" ${defaults?.fast === m.id ? 'selected' : ''}>
                  ${m.provider} · ${m.modelName}
                </option>
              `).join('')}
            </select>
          </div>
          <div>
            <button type="submit" class="btn btn-primary">Salvar padrões da empresa</button>
          </div>
        </form>

        ${state.companyDefaultsNotice ? `<div class="cxs-status">${state.companyDefaultsNotice}</div>` : ''}
      </section>
    </div>
  `;
}

function attachModelosEmpresaEvents(container) {
  container.querySelectorAll('[data-action="prompt-stop-share"]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.confirmStopSharing = btn.getAttribute('data-provider');
      render();
    });
  });

  container.querySelectorAll('[data-action="share-everyone"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.getAttribute('data-provider');
      const target = state.providers.find(x => x.provider === p);
      if (target) {
        target.source = 'stored-org';
        target.orgCredential = 'api_key';
      }
      render();
    });
  });

  container.querySelector('#form-company-defaults')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const build = container.querySelector('#company-build').value;
    const fast = container.querySelector('#company-fast').value;
    state.modelDefaults.installation = { build, fast };
    state.companyDefaultsNotice = 'Padrões da empresa salvos com sucesso.';
    render();
  });
}

// -------------------------------------------------------------
// Confirmation Modal Dialog (Parar de compartilhar)
// -------------------------------------------------------------
function renderModal() {
  const modalContainer = document.getElementById('modal-container');
  if (!modalContainer) return;

  if (!state.confirmStopSharing) {
    modalContainer.innerHTML = '';
    return;
  }

  const name = getProviderName(state.confirmStopSharing);
  modalContainer.innerHTML = `
    <div class="proto-modal-backdrop">
      <div class="proto-modal">
        <h3 class="proto-modal-title">Parar de compartilhar ${name}?</h3>
        <p class="proto-modal-desc">
          Vale a partir da próxima execução. Usuários que dependem desta conta perderão acesso se não tiverem uma própria.
        </p>
        <div class="proto-modal-actions">
          <button class="btn btn-outline" id="btn-cancel-modal">Cancelar</button>
          <button class="btn btn-destructive" id="btn-confirm-modal">Parar de compartilhar</button>
        </div>
      </div>
    </div>
  `;

  modalContainer.querySelector('#btn-cancel-modal')?.addEventListener('click', () => {
    state.confirmStopSharing = null;
    render();
  });

  modalContainer.querySelector('#btn-confirm-modal')?.addEventListener('click', () => {
    const p = state.confirmStopSharing;
    const target = state.providers.find(x => x.provider === p);
    if (target) {
      target.source = 'stored-user';
      target.userCredential = 'api_key';
      target.orgCredential = null;
    }
    state.confirmStopSharing = null;
    render();
  });
}
