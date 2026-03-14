interface RenderAuthLandingArgs {
  loginSelected: boolean;
  error: string | null;
  loginUserId: string;
  loginPassword: string;
  signupUserId: string;
  signupName: string;
  signupPassword: string;
  busy: boolean;
}

interface RenderHomeMenuRootArgs {
  connectionLabel: string;
  balanceLabel: string;
  identityLabel: string;
  phaseLabel: string;
  serverUrl: string;
  roomLabel: string;
  playerCount: number;
  matchButtonHtml: string;
  spectateButtonHtml: string;
  settingsButtonHtml: string;
  statusRailHtml: string;
}

interface RenderHomeMenuSectionPageArgs {
  eyebrow: string;
  title: string;
  description: string;
  tag: string;
  toneClass: string;
  panelHtml: string;
  statusRailHtml: string;
}

export function renderAuthLandingView(args: RenderAuthLandingArgs): string {
  const {
    loginSelected,
    error,
    loginUserId,
    loginPassword,
    signupUserId,
    signupName,
    signupPassword,
    busy
  } = args;

  return `
    <div class="shell auth-shell">
      <main class="auth-layout">
        <section class="panel board auth-stage">
          <div class="auth-stage-copy">
            <span class="eyebrow">Minhwatu Online</span>
            <h1>로그인 후 입장</h1>
            <p class="lede">사이트 첫 진입은 항상 로그인 화면으로 시작합니다. 로그인 또는 회원가입을 완료해야만 메인 로비와 게임에 접근할 수 있습니다.</p>
            <div class="chips">
              <span class="chip">5-7인 온라인</span>
              <span class="chip">실시간 관전</span>
              <span class="chip">즉시 잔고 반영</span>
            </div>
          </div>
        </section>
        <section class="panel auth-panel">
          <div class="auth-tab-row">
            <button class="secondary-button ${loginSelected ? "auth-tab-active" : ""}" id="auth-show-login">로그인</button>
            <button class="secondary-button ${loginSelected ? "" : "auth-tab-active"}" id="auth-show-signup">회원가입</button>
          </div>
          ${
            error === null
              ? ""
              : `<p class="panel-copy"><strong>오류:</strong> ${error}</p>`
          }
          ${
            loginSelected
              ? `
                <div class="auth-form">
                  <label class="field">
                    <span>ID</span>
                    <input id="auth-login-user-id" type="text" value="${loginUserId}" />
                  </label>
                  <label class="field">
                    <span>비밀번호</span>
                    <input id="auth-login-password" type="password" value="${loginPassword}" />
                  </label>
                  <button id="auth-login-submit" class="primary-button" ${busy ? "disabled" : ""}>로그인</button>
                </div>
              `
              : `
                <div class="auth-form">
                  <label class="field">
                    <span>ID</span>
                    <input id="auth-signup-user-id" type="text" value="${signupUserId}" />
                  </label>
                  <label class="field">
                    <span>이름</span>
                    <input id="auth-signup-name" type="text" value="${signupName}" />
                  </label>
                  <label class="field">
                    <span>비밀번호</span>
                    <input id="auth-signup-password" type="password" value="${signupPassword}" />
                  </label>
                  <button id="auth-signup-submit" class="primary-button" ${busy ? "disabled" : ""}>회원가입</button>
                </div>
              `
          }
          <p class="panel-copy auth-footer-note">Account and balance rules are enforced on the server. Client access is gated behind a valid session token.</p>
        </section>
      </main>
    </div>
  `;
}

export function renderHomeMenuRootView(args: RenderHomeMenuRootArgs): string {
  const {
    connectionLabel,
    balanceLabel,
    identityLabel,
    phaseLabel,
    serverUrl,
    roomLabel,
    playerCount,
    matchButtonHtml,
    spectateButtonHtml,
    settingsButtonHtml,
    statusRailHtml
  } = args;

  return `
    <section class="panel board home-menu-shell home-launch-shell">
      <div class="home-launch-grid">
        <div class="home-launch-main">
          <section class="home-showcase-card">
            <div class="home-showcase-header">
              <div>
                <span class="eyebrow">Minhwatu Network</span>
                <p class="home-showcase-kicker">Five-player online table with server-authoritative flow</p>
              </div>
              <span class="home-showcase-badge">${connectionLabel}</span>
            </div>
            <div class="home-showcase-copy">
              <h2>민화투 온라인</h2>
              <p class="panel-copy">방 생성, 준비, 기권, 배패, 실시간 턴 진행까지 한 흐름으로 이어지는 멀티플레이 클라이언트입니다.</p>
            </div>
            <div class="home-showcase-metrics">
              <article class="home-metric-card">
                <span class="mini-label">Wallet</span>
                <strong>${balanceLabel}</strong>
              </article>
              <article class="home-metric-card">
                <span class="mini-label">Identity</span>
                <strong>${identityLabel}</strong>
              </article>
              <article class="home-metric-card">
                <span class="mini-label">Phase</span>
                <strong>${phaseLabel}</strong>
              </article>
            </div>
            <div class="home-showcase-strip">
              <span class="chip">Server ${serverUrl}</span>
              <span class="chip">Room ${roomLabel}</span>
              <span class="chip">Players ${playerCount}</span>
            </div>
          </section>
          <section class="home-mode-grid">
            ${matchButtonHtml}
            ${spectateButtonHtml}
            ${settingsButtonHtml}
          </section>
        </div>
        ${statusRailHtml}
      </div>
    </section>
  `;
}

export function renderHomeMenuSectionPageView(args: RenderHomeMenuSectionPageArgs): string {
  const {
    eyebrow,
    title,
    description,
    tag,
    toneClass,
    panelHtml,
    statusRailHtml
  } = args;

  return `
    <section class="panel board home-menu-shell home-menu-section-shell">
      <div class="home-section-layout">
        <div class="home-section-main">
          <div class="home-section-banner ${toneClass}">
            <div class="home-section-banner-top">
              <button class="secondary-button home-back-button" id="home-back-button">Back</button>
              <span class="home-section-tag">${tag}</span>
            </div>
            <div class="home-section-banner-copy">
              <span class="eyebrow">${eyebrow}</span>
              <h2>${title}</h2>
              <p class="panel-copy">${description}</p>
            </div>
          </div>
          <div class="home-menu-dock home-menu-section-dock">
            ${panelHtml}
          </div>
        </div>
        ${statusRailHtml}
      </div>
    </section>
  `;
}
