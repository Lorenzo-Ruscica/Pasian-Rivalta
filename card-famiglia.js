/**
 * PASIAN RIVALTA - Logica Front-end Portale "Card Famiglia"
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (window.UserInvalidFallback) {
        window.UserInvalidFallback.init(document);
    }
    if (window.initLightDismissDialogs) {
        window.initLightDismissDialogs();
    }

    const body = document.body;
    const $ = (id) => document.getElementById(id);

    const demoBanner = $('demo-banner');
    const demoFillRossiBtn = $('demo-fill-rossi-btn');
    const authSection = $('auth-section');
    const dashboardSection = $('dashboard-section');

    const tabSignin = $('tab-signin');
    const tabSignup = $('tab-signup');
    const panelSignin = $('panel-signin');
    const panelSignup = $('panel-signup');

    const signinForm = $('signin-form');
    const signinSubmitBtn = $('signin-submit-btn');
    const signinStatus = $('signin-status');
    const forgotPasswordBtn = $('forgot-password-btn');

    const signupForm = $('signup-form');
    const signupSubmitBtn = $('signup-submit-btn');
    const signupNextBtn = $('signup-next-btn');
    const signupBackBtn = $('signup-back-btn');
    const signupStatus = $('signup-status');
    const additionalMembersList = $('additional-members-list');
    const newPasswordInput = $('new-password');

    const confirmDialog = $('confirm-registration-dialog');
    const confirmMembersPreview = $('confirm-members-preview');
    const cancelConfirmDialogBtn = $('cancel-confirm-dialog-btn');
    const proceedConfirmDialogBtn = $('proceed-confirm-dialog-btn');

    const qrFullscreenDialog = $('qr-fullscreen-dialog');
    const openFullscreenQrBtn = $('open-fullscreen-qr-btn');
    const cardQrButton = $('card-qr-button');
    const downloadQrBtn = $('download-qr-btn');
    const signoutBtn = $('signout-btn');
    const gotoAdminLink = $('goto-admin-link');

    const CATEGORY_UI = {
        gioielleria: { name: 'Gioielleria', icon: 'fa-gem' },
        ottica: { name: 'Ottica', icon: 'fa-glasses' }
    };

    let pendingRegistrationPayload = null;
    let memberRowCounter = 0;
    let wakeLock = null;

    if (!PasianCardService.isLiveSupabase() && demoBanner) {
        demoBanner.hidden = false;
    }

    /* ------------------------------------------------------------------
     * Utility
     * ------------------------------------------------------------------ */
    function getInitials(fullName) {
        const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '?';
        const first = parts[0][0] || '';
        const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
        return (first + last).toUpperCase();
    }

    function roleLabel(role) {
        return (CARD_RULES.roles[role] || CARD_RULES.roles.genitore).label;
    }

    function showStatus(box, message, type = 'error') {
        if (!box) return;
        box.className = `form-status-box ${type}`;
        box.textContent = message;
    }

    function clearStatus(box) {
        if (!box) return;
        box.className = 'form-status-box';
        box.textContent = '';
    }

    function setLoading(btn, isLoading) {
        if (!btn) return;
        btn.disabled = isLoading;
        btn.classList.toggle('is-loading', isLoading);
    }

    /**
     * Valida tutti i campi di un contenitore, evidenzia quelli errati
     * e restituisce il primo campo non valido (o null).
     */
    function validateFields(container) {
        let firstInvalid = null;
        container.querySelectorAll('input, select, textarea').forEach((input) => {
            if (input.type === 'radio' || input.closest('[hidden]')) return;
            const valid = input.checkValidity();
            const target = input.type === 'checkbox' ? input.closest('.privacy-check') || input : input;
            target.classList.toggle('user-invalid-fallback', !valid);
            input.setAttribute('aria-invalid', valid ? 'false' : 'true');
            if (!valid && !firstInvalid) firstInvalid = input;
        });
        return firstInvalid;
    }

    // Rimuove l'evidenziazione d'errore non appena il campo diventa valido
    document.addEventListener('input', (e) => {
        const input = e.target;
        if (!(input instanceof HTMLInputElement)) return;
        if (input.classList.contains('user-invalid-fallback') && input.checkValidity()) {
            input.classList.remove('user-invalid-fallback');
            input.setAttribute('aria-invalid', 'false');
        }
    });
    document.addEventListener('change', (e) => {
        const input = e.target;
        if (input instanceof HTMLInputElement && input.type === 'checkbox' && input.checked) {
            input.closest('.privacy-check')?.classList.remove('user-invalid-fallback');
        }
    });

    /* ------------------------------------------------------------------
     * Tab Accedi / Registrati
     * ------------------------------------------------------------------ */
    function switchAuthTab(mode) {
        const isSignin = mode === 'signin';
        tabSignin.setAttribute('aria-selected', String(isSignin));
        tabSignup.setAttribute('aria-selected', String(!isSignin));
        panelSignin.hidden = !isSignin;
        panelSignup.hidden = isSignin;
    }

    tabSignin?.addEventListener('click', () => switchAuthTab('signin'));
    tabSignup?.addEventListener('click', () => switchAuthTab('signup'));

    // Mostra / Nascondi password
    document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const input = $(btn.getAttribute('data-toggle-password'));
            if (!input) return;
            const isVisible = input.type === 'text';
            input.type = isVisible ? 'password' : 'text';
            btn.setAttribute('aria-pressed', isVisible ? 'false' : 'true');
            btn.setAttribute('aria-label', isVisible ? 'Mostra password' : 'Nascondi password');
            btn.innerHTML = isVisible
                ? '<i class="fas fa-eye" aria-hidden="true"></i>'
                : '<i class="fas fa-eye-slash" aria-hidden="true"></i>';
        });
    });

    // Requisiti password con spunta in tempo reale
    newPasswordInput?.addEventListener('input', () => {
        const v = newPasswordInput.value;
        const rules = {
            len: v.length >= 8,
            case: /[a-z]/.test(v) && /[A-Z]/.test(v),
            num: /\d/.test(v)
        };
        document.querySelectorAll('#password-rules [data-rule]').forEach((li) => {
            li.classList.toggle('is-ok', Boolean(rules[li.dataset.rule]));
        });
    });

    /* ------------------------------------------------------------------
     * Wizard registrazione (2 passaggi)
     * ------------------------------------------------------------------ */
    function goToSignupStep(step) {
        signupForm.querySelectorAll('.wizard-step').forEach((el) => {
            el.hidden = el.dataset.step !== String(step);
        });
        document.querySelectorAll('[data-step-indicator]').forEach((li) => {
            const n = Number(li.dataset.stepIndicator);
            li.classList.toggle('is-current', n === step);
            li.classList.toggle('is-done', n < step);
        });
        clearStatus(signupStatus);
        $('auth-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function syncHolderPreview() {
        const name = $('holder-name').value.trim() || 'Tu';
        const role = signupForm.querySelector('input[name="holder_role"]:checked')?.value || 'genitore';
        $('holder-preview-name').textContent = name;
        $('holder-preview-role').textContent = roleLabel(role);
        $('holder-preview-avatar').textContent = getInitials(name);
    }

    signupNextBtn?.addEventListener('click', () => {
        const step1 = signupForm.querySelector('[data-step="1"]');
        const firstInvalid = validateFields(step1);
        if (firstInvalid) {
            firstInvalid.focus();
            return;
        }
        syncHolderPreview();
        goToSignupStep(2);
    });

    signupBackBtn?.addEventListener('click', () => goToSignupStep(1));

    // Righe dinamiche dei familiari
    function addFamilyMemberRow(role = 'figlio') {
        memberRowCounter += 1;
        const n = memberRowCounter;
        const roleMeta = CARD_RULES.roles[role] || CARD_RULES.roles.figlio;

        const row = document.createElement('div');
        row.className = 'member-builder-row';
        row.dataset.memberRole = role;

        row.innerHTML = `
            <div class="member-builder-head">
                <span class="member-role-tag">
                    <i class="fas ${roleMeta.icon}" aria-hidden="true"></i> ${roleMeta.label}
                </span>
                <button type="button" class="remove-member-btn" aria-label="Rimuovi ${roleMeta.label}">
                    <i class="fas fa-trash-alt" aria-hidden="true"></i>
                </button>
            </div>
            <div class="field-row">
                <div class="field">
                    <label for="member-name-${n}">Nome e cognome</label>
                    <input type="text" id="member-name-${n}" name="member_full_name_${n}"
                        class="pf-input member-fullname-input" required maxlength="100"
                        enterkeyhint="next" autocomplete="off" placeholder="es. Giulia Rossi">
                    <div class="error-msg">Inserisci nome e cognome.</div>
                </div>
                <div class="field">
                    <label for="member-birth-${n}">Data di nascita <span class="field-optional">(facoltativa)</span></label>
                    <input type="date" id="member-birth-${n}" name="member_birth_date_${n}"
                        class="pf-input member-birthdate-input">
                </div>
            </div>
        `;

        row.querySelector('.remove-member-btn').addEventListener('click', () => row.remove());
        additionalMembersList.appendChild(row);
        row.querySelector('.member-fullname-input')?.focus();
    }

    document.querySelectorAll('[data-add-member-role]').forEach((btn) => {
        btn.addEventListener('click', () => addFamilyMemberRow(btn.getAttribute('data-add-member-role')));
    });

    /* ------------------------------------------------------------------
     * Accesso
     * ------------------------------------------------------------------ */
    demoFillRossiBtn?.addEventListener('click', async () => {
        try {
            await PasianCardService.signIn('famiglia.rossi@esempio.it', 'RossiPassword1!');
            await refreshPortalState();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            showStatus(signinStatus, err.message, 'error');
        }
    });

    signinForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearStatus(signinStatus);

        const firstInvalid = validateFields(signinForm);
        if (firstInvalid) {
            firstInvalid.focus();
            return;
        }

        setLoading(signinSubmitBtn, true);
        try {
            await PasianCardService.signIn($('login-email').value, $('current-password').value);
            await refreshPortalState();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            showStatus(signinStatus, err.message || 'Accesso non riuscito.', 'error');
        } finally {
            setLoading(signinSubmitBtn, false);
        }
    });

    forgotPasswordBtn?.addEventListener('click', async () => {
        const emailInput = $('login-email');
        const email = emailInput?.value?.trim();
        if (!email) {
            showStatus(signinStatus, 'Scrivi prima la tua email qui sopra.', 'error');
            emailInput?.focus();
            return;
        }
        try {
            await PasianCardService.resetPassword(email);
            showStatus(signinStatus, `Se ${email} è registrata, riceverai un'email per reimpostare la password.`, 'success');
        } catch (err) {
            showStatus(signinStatus, err.message, 'error');
        }
    });

    /* ------------------------------------------------------------------
     * Registrazione (con conferma della famiglia)
     * ------------------------------------------------------------------ */
    function buildPreviewItem(name, role, isHolder) {
        const li = document.createElement('li');
        li.className = 'member-row';
        li.innerHTML = `
            <span class="avatar" aria-hidden="true"></span>
            <div class="member-row__body">
                <span class="member-row__name"></span>
                <span class="member-row__role"></span>
            </div>
            ${isHolder ? '<span class="holder-badge">Titolare</span>' : ''}
        `;
        li.querySelector('.avatar').textContent = getInitials(name);
        li.querySelector('.member-row__name').textContent = name;
        li.querySelector('.member-row__role').textContent = roleLabel(role);
        return li;
    }

    signupForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        clearStatus(signupStatus);

        // Se un campo del passo 1 non è valido torna indietro
        const step1Invalid = validateFields(signupForm.querySelector('[data-step="1"]'));
        if (step1Invalid) {
            goToSignupStep(1);
            step1Invalid.focus();
            return;
        }
        const step2Invalid = validateFields(signupForm.querySelector('[data-step="2"]'));
        if (step2Invalid) {
            step2Invalid.focus();
            if (step2Invalid.id === 'signup-privacy') {
                showStatus(signupStatus, 'Per continuare accetta la Privacy Policy.', 'error');
            }
            return;
        }

        const holderName = $('holder-name').value.trim();
        const holderRole = signupForm.querySelector('input[name="holder_role"]:checked')?.value || 'genitore';

        const additionalMembers = [];
        additionalMembersList.querySelectorAll('.member-builder-row').forEach((row) => {
            const nameVal = row.querySelector('.member-fullname-input')?.value?.trim();
            if (nameVal) {
                additionalMembers.push({
                    full_name: nameVal,
                    role: row.dataset.memberRole || 'figlio',
                    birth_date: row.querySelector('.member-birthdate-input')?.value || null
                });
            }
        });

        pendingRegistrationPayload = {
            email: $('signup-email').value.trim(),
            password: newPasswordInput.value,
            familyName: $('family-name').value.trim(),
            holderName,
            holderPhone: $('holder-phone').value.trim(),
            holderRole,
            holderBirthDate: null,
            additionalMembers
        };

        confirmMembersPreview.innerHTML = '';
        confirmMembersPreview.appendChild(buildPreviewItem(holderName, holderRole, true));
        additionalMembers.forEach((m) => confirmMembersPreview.appendChild(buildPreviewItem(m.full_name, m.role, false)));

        if (additionalMembers.length === 0) {
            const note = document.createElement('li');
            note.className = 'pf-callout pf-callout--danger';
            note.style.margin = '0';
            note.innerHTML = '<i class="fas fa-triangle-exclamation" aria-hidden="true"></i><span>Hai inserito solo te stesso.</span>';
            confirmMembersPreview.appendChild(note);
        }

        if (typeof confirmDialog.showModal === 'function') {
            confirmDialog.showModal();
        } else {
            executeConfirmedRegistration();
        }
    });

    cancelConfirmDialogBtn?.addEventListener('click', () => confirmDialog.close());

    async function executeConfirmedRegistration() {
        if (!pendingRegistrationPayload) return;
        confirmDialog.close();
        setLoading(signupSubmitBtn, true);
        proceedConfirmDialogBtn.disabled = true;

        try {
            const res = await PasianCardService.registerFamilyInOnePhase(pendingRegistrationPayload);
            if (res.requiresEmailConfirmation) {
                showStatus(signupStatus, 'Quasi fatto! Apri l\'email che ti abbiamo inviato e conferma per attivare la Card.', 'success');
            } else {
                await refreshPortalState();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        } catch (err) {
            showStatus(signupStatus, err.message || 'Errore durante la registrazione.', 'error');
        } finally {
            setLoading(signupSubmitBtn, false);
            proceedConfirmDialogBtn.disabled = false;
        }
    }

    proceedConfirmDialogBtn?.addEventListener('click', executeConfirmedRegistration);

    signoutBtn?.addEventListener('click', async () => {
        await PasianCardService.signOut();
        await refreshPortalState();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    /* ------------------------------------------------------------------
     * QR Code
     * ------------------------------------------------------------------ */
    function renderQrCode(container, payloadText, sizePx = 240) {
        if (!container) return;
        container.innerHTML = '';
        if (window.QRCode) {
            new window.QRCode(container, {
                text: payloadText,
                width: sizePx,
                height: sizePx,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: window.QRCode.CorrectLevel.H
            });
        } else {
            const fallback = document.createElement('div');
            fallback.style.cssText = 'color:#000;font-weight:700;font-size:0.85rem;';
            fallback.textContent = payloadText;
            container.appendChild(fallback);
        }
    }

    downloadQrBtn?.addEventListener('click', () => {
        const qrContainer = $('qr-fullscreen-container');
        const canvas = qrContainer?.querySelector('canvas');
        const img = qrContainer?.querySelector('img');
        const codeText = $('card-code-display')?.textContent || 'card-famiglia';

        const dataUrl = canvas ? canvas.toDataURL('image/png') : img?.src;
        if (dataUrl) {
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `Pasian-Rivalta-${codeText}.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
        }
    });

    // Mantiene lo schermo acceso mentre il QR è mostrato in cassa
    async function requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                wakeLock = await navigator.wakeLock.request('screen');
            }
        } catch (_) {
            wakeLock = null;
        }
    }

    function openQrFullscreen() {
        if (qrFullscreenDialog && typeof qrFullscreenDialog.showModal === 'function') {
            qrFullscreenDialog.showModal();
            requestWakeLock();
        }
    }

    qrFullscreenDialog?.addEventListener('close', () => {
        wakeLock?.release?.().catch(() => {});
        wakeLock = null;
    });

    openFullscreenQrBtn?.addEventListener('click', openQrFullscreen);
    cardQrButton?.addEventListener('click', openQrFullscreen);

    /* ------------------------------------------------------------------
     * Card sconti (Gioielleria / Ottica)
     * ------------------------------------------------------------------ */
    function renderDiscountCard(container, state) {
        if (!container) return;
        const ui = CATEGORY_UI[state.category] || CATEGORY_UI.gioielleria;
        const done = state.completedInActiveCycle;

        const statusLine = state.isCycleActive
            ? `${state.nextPurchaseNumber}° acquisto su 3`
            : 'Si parte dal 1° acquisto';

        const tiersHtml = state.tiers.map((pct, idx) => {
            const n = idx + 1;
            let cls = '';
            let dot = n;
            if (n <= done) {
                cls = 'is-done';
                dot = '<i class="fas fa-check" aria-hidden="true"></i>';
            } else if (n === state.nextPurchaseNumber) {
                cls = 'is-next';
            }
            return `
                <li class="${cls}">
                    <span class="tier-track__dot">${dot}</span>
                    <span class="tier-track__pct">-${pct}%</span>
                    <span class="tier-track__lbl">${n}° acq.</span>
                </li>`;
        }).join('');

        let footClass = 'discount-card__foot';
        let footHtml = '';
        if (state.isCycleActive && state.expiresAt) {
            const urgent = state.daysRemaining <= 14;
            footClass += urgent ? ' is-active is-urgent' : ' is-active';
            footHtml = `<i class="fas fa-hourglass-half" aria-hidden="true"></i>
                <span>Valido fino al <strong>${formatDateIT(state.expiresAt)}</strong> · ${state.daysRemaining} ${state.daysRemaining === 1 ? 'giorno' : 'giorni'}</span>`;
        } else if (state.wasCompleted) {
            footHtml = `<i class="fas fa-trophy" aria-hidden="true"></i>
                <span>Ciclo completato! Si riparte da <strong>-${state.tiers[0]}%</strong></span>`;
        } else if (state.wasExpired) {
            footHtml = `<i class="fas fa-rotate-left" aria-hidden="true"></i>
                <span>3 mesi scaduti il ${formatDateIT(state.lastExpiresAt)}. Si riparte da <strong>-${state.tiers[0]}%</strong></span>`;
        } else {
            footHtml = `<i class="fas fa-magic" aria-hidden="true"></i>
                <span>Il 1° acquisto attiva <strong>3 mesi</strong> di sconti crescenti</span>`;
        }

        container.innerHTML = `
            <div class="discount-card__head">
                <span class="discount-card__icon" aria-hidden="true"><i class="fas ${ui.icon}"></i></span>
                <div class="discount-card__title">
                    <h3>${ui.name}</h3>
                    <p>${statusLine}</p>
                </div>
                <div class="discount-card__next">
                    <span>Prossimo</span>
                    <strong>-${state.nextDiscountPercent}%</strong>
                </div>
            </div>
            <ol class="tier-track" style="--progress:${done / 2}" aria-label="Avanzamento sconti ${ui.name}">${tiersHtml}</ol>
            <p class="${footClass}">${footHtml}</p>
            ${state.exclusionNote ? `<p class="discount-card__excl"><i class="fas fa-ban" aria-hidden="true"></i> ${state.exclusionNote}</p>` : ''}
        `;
    }

    /* ------------------------------------------------------------------
     * Famiglia e storico
     * ------------------------------------------------------------------ */
    function renderMembers(members) {
        const list = $('registered-members-grid');
        list.innerHTML = '';
        $('members-count').textContent = `${members.length} ${members.length === 1 ? 'membro' : 'membri'}`;

        members.forEach((m) => {
            const li = document.createElement('li');
            li.className = 'member-row';
            li.innerHTML = `
                <span class="avatar" aria-hidden="true"></span>
                <div class="member-row__body">
                    <span class="member-row__name"></span>
                    <span class="member-row__role"></span>
                </div>
                ${m.is_holder ? '<span class="holder-badge">Titolare</span>' : ''}
            `;
            li.querySelector('.avatar').textContent = getInitials(m.full_name);
            li.querySelector('.member-row__name').textContent = m.full_name;
            li.querySelector('.member-row__role').textContent = m.birth_date
                ? `${roleLabel(m.role)} · ${formatDateIT(m.birth_date)}`
                : roleLabel(m.role);
            list.appendChild(li);
        });
    }

    function renderPurchases(purchases) {
        const list = $('customer-purchases-list');
        list.innerHTML = '';

        if (!purchases.length) {
            list.innerHTML = `
                <li class="empty-state">
                    <i class="fas fa-bag-shopping" aria-hidden="true"></i>
                    <strong>Nessun acquisto</strong>
                    <span>Mostra il QR in negozio per iniziare a risparmiare.</span>
                </li>`;
            return;
        }

        purchases.forEach((p) => {
            const ui = CATEGORY_UI[p.category] || CATEGORY_UI.gioielleria;
            const hasAmount = p.final_amount !== null && p.final_amount !== undefined;
            const li = document.createElement('li');
            li.className = 'purchase-item';
            li.innerHTML = `
                <span class="purchase-item__icon" aria-hidden="true"><i class="fas ${ui.icon}"></i></span>
                <div class="purchase-item__body">
                    <span class="purchase-item__title">${ui.name} · ${p.purchase_number_in_cycle}° acquisto</span>
                    <span class="purchase-item__meta"></span>
                    ${p.notes ? '<span class="purchase-item__notes"></span>' : ''}
                </div>
                <div class="purchase-item__right">
                    <span class="purchase-item__pct">-${p.discount_percent}%</span>
                    ${hasAmount ? `<span class="purchase-item__amount">${formatCurrencyEUR(p.final_amount)}<s>${formatCurrencyEUR(p.original_amount)}</s></span>` : ''}
                </div>
            `;
            li.querySelector('.purchase-item__meta').textContent = `${p.member_name || '—'} · ${formatDateIT(p.created_at)}`;
            if (p.notes) li.querySelector('.purchase-item__notes').textContent = p.notes;
            list.appendChild(li);
        });
    }

    /* ------------------------------------------------------------------
     * Stato pagina: accesso ↔ dashboard
     * ------------------------------------------------------------------ */
    function showAuthView() {
        authSection.hidden = false;
        dashboardSection.hidden = true;
        body.dataset.view = 'auth';
    }

    async function refreshPortalState() {
        const user = await PasianCardService.getSessionUser();
        if (!user) {
            showAuthView();
            return;
        }

        const bundle = await PasianCardService.getMyFamilyCardBundle();
        if (!bundle || !bundle.card) {
            showAuthView();
            return;
        }

        authSection.hidden = true;
        dashboardSection.hidden = false;
        body.dataset.view = 'dashboard';

        const { card, members, purchases } = bundle;

        $('dashboard-holder-first').textContent = String(card.holder_name || '').trim().split(/\s+/)[0] || 'benvenuto';
        if ($('dashboard-holder-avatar')) {
            $('dashboard-holder-avatar').textContent = getInitials(card.holder_name || card.family_name);
        }
        $('dashboard-user-email').textContent = user.email;
        if (gotoAdminLink) {
            gotoAdminLink.hidden = !(user.is_admin || !PasianCardService.isLiveSupabase());
        }

        $('card-family-name').textContent = card.family_name;
        $('card-code-display').textContent = card.card_code;
        $('card-holder-display').textContent = card.holder_name;
        $('card-created-display').textContent = formatDateIT(card.created_at);

        const qrPayload = buildQrPayload(card.card_code);
        renderQrCode($('card-qr-container'), qrPayload, 280);
        renderQrCode($('qr-fullscreen-container'), qrPayload, 400);
        $('qr-dialog-family').textContent = card.family_name;
        $('qr-dialog-code').textContent = card.card_code;

        renderDiscountCard(
            $('jewelry-cycle-card'),
            computeCategoryCycleState('gioielleria', card.jewelry_step, card.jewelry_cycle_started_at)
        );
        renderDiscountCard(
            $('optics-cycle-card'),
            computeCategoryCycleState('ottica', card.optics_step, card.optics_cycle_started_at)
        );

        renderMembers(members);
        renderPurchases(purchases);
    }

    /* ------------------------------------------------------------------
     * Tab bar inferiore (mobile) con evidenziazione automatica allo scroll
     * ------------------------------------------------------------------ */
    const mobileNavButtons = document.querySelectorAll('[data-mobile-nav]');

    function setActiveTab(targetId) {
        mobileNavButtons.forEach((b) => b.classList.toggle('active', b.dataset.mobileNav === targetId));
    }

    mobileNavButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.mobileNav;
            setActiveTab(targetId);
            if (targetId === 'wallet-card') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                $(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    if ('IntersectionObserver' in window) {
        const sectionObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) setActiveTab(entry.target.id);
            });
        }, { rootMargin: '-45% 0px -50% 0px' });
        ['wallet-card', 'sconti-section', 'famiglia-section', 'storico-section'].forEach((id) => {
            const el = $(id);
            if (el) sectionObserver.observe(el);
        });
    }

    await refreshPortalState();
});
