/**
 * PASIAN RIVALTA - Logica Pannello Cassa & Scanner QR (Admin)
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (window.UserInvalidFallback) {
        window.UserInvalidFallback.init(document);
    }

    const body = document.body;
    const $ = (id) => document.getElementById(id);

    const adminDemoBanner = $('admin-demo-banner');
    const adminDemoLoginBtn = $('admin-demo-login-btn');

    const adminLoginSection = $('admin-login-section');
    const adminWorkspaceSection = $('admin-workspace-section');
    const adminSigninForm = $('admin-signin-form');
    const adminSigninBtn = $('admin-signin-btn');
    const adminLoginStatus = $('admin-login-status');
    const adminSignoutBtn = $('admin-signout-btn');

    const scanStage = $('scan-stage');
    const startCameraBtn = $('start-camera-btn');
    const stopCameraBtn = $('stop-camera-btn');
    const qrFileInput = $('qr-file-input');
    const manualLookupForm = $('manual-lookup-form');
    const manualCodeInput = $('manual-code-input');
    const scannerStatus = $('scanner-status');

    const emptyScanPlaceholder = $('empty-scan-placeholder');
    const scannedCardPanel = $('scanned-card-panel');
    const clearScannedCardBtn = $('clear-scanned-card-btn');
    const loadSampleRossiBtn = $('load-sample-rossi-btn');

    const recordPurchaseForm = $('record-purchase-form');
    const recordPurchaseBtn = $('record-purchase-btn');
    const recordPurchaseStatus = $('record-purchase-status');
    const purchaseMemberSelect = $('purchase-member-select');
    const purchaseOriginalAmount = $('purchase-original-amount');
    const purchaseNotes = $('purchase-notes');
    const opticsExclusionBox = $('optics-exclusion-confirm-box');
    const opticsNoContactsCheck = $('optics-no-contacts-check');

    const filterCardsInput = $('filter-cards-input');
    const refreshAdminListsBtn = $('refresh-admin-lists-btn');

    const CATEGORY_UI = {
        gioielleria: { name: 'Gioielleria', icon: 'fa-gem' },
        ottica: { name: 'Ottica', icon: 'fa-glasses' }
    };

    let html5QrScanner = null;
    let isCameraRunning = false;
    let currentCardBundle = null;
    let cachedCardsData = { cards: [], members: [], purchases: [] };

    if (!PasianCardService.isLiveSupabase() && adminDemoBanner) {
        adminDemoBanner.hidden = false;
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

    function showStatus(box, msg, type = 'error') {
        if (!box) return;
        box.className = `form-status-box ${type}`;
        box.textContent = msg;
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

    // Segnale acustico + vibrazione alla scansione del QR
    function playScanFeedback() {
        try {
            navigator.vibrate?.(80);
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.14);
        } catch (_) {
            // Ignora se audio bloccato dal browser
        }
    }

    /* ------------------------------------------------------------------
     * Accesso Operatore
     * ------------------------------------------------------------------ */
    adminDemoLoginBtn?.addEventListener('click', async () => {
        try {
            await PasianCardService.signIn('admin@pasianrivalta.it', 'AdminPassword1!');
            await refreshAdminView();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            showStatus(adminLoginStatus, err.message, 'error');
        }
    });

    adminSigninForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearStatus(adminLoginStatus);

        if (!adminSigninForm.checkValidity()) {
            adminSigninForm.querySelectorAll('input').forEach((inp) => {
                inp.classList.toggle('user-invalid-fallback', !inp.checkValidity());
            });
            adminSigninForm.querySelector(':invalid')?.focus();
            return;
        }

        setLoading(adminSigninBtn, true);
        try {
            await PasianCardService.signIn($('admin-email').value, $('current-password').value);
            await refreshAdminView();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            showStatus(adminLoginStatus, err.message || 'Accesso non riuscito.', 'error');
        } finally {
            setLoading(adminSigninBtn, false);
        }
    });

    adminSignoutBtn?.addEventListener('click', async () => {
        await stopQrCamera();
        await PasianCardService.signOut();
        await refreshAdminView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    /* ------------------------------------------------------------------
     * Fotocamera Scanner QR
     * ------------------------------------------------------------------ */
    async function startQrCamera() {
        clearStatus(scannerStatus);
        if (!window.Html5Qrcode) {
            showStatus(scannerStatus, 'Scanner non disponibile. Usa la ricerca manuale.', 'error');
            return;
        }
        try {
            scanStage?.classList.add('is-scanning');
            if (!html5QrScanner) {
                html5QrScanner = new window.Html5Qrcode('qr-reader');
            }
            await html5QrScanner.start(
                { facingMode: 'environment' },
                { fps: 12, qrbox: { width: 220, height: 220 } },
                async (decodedText) => {
                    playScanFeedback();
                    await stopQrCamera();
                    await lookupAndDisplayCard(decodedText, true);
                },
                () => {}
            );
            isCameraRunning = true;
            if (startCameraBtn) startCameraBtn.hidden = true;
            if (stopCameraBtn) stopCameraBtn.hidden = false;
        } catch (_) {
            scanStage?.classList.remove('is-scanning');
            showStatus(
                scannerStatus,
                'Fotocamera non accessibile. Consenti il permesso o carica una foto del QR.',
                'error'
            );
        }
    }

    async function stopQrCamera() {
        if (html5QrScanner && isCameraRunning) {
            try {
                await html5QrScanner.stop();
            } catch (_) {
                // ignore
            }
            isCameraRunning = false;
        }
        scanStage?.classList.remove('is-scanning');
        if (startCameraBtn) startCameraBtn.hidden = false;
        if (stopCameraBtn) stopCameraBtn.hidden = true;
    }

    startCameraBtn?.addEventListener('click', startQrCamera);
    stopCameraBtn?.addEventListener('click', stopQrCamera);

    // Scansione da foto / screenshot
    qrFileInput?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        clearStatus(scannerStatus);
        await stopQrCamera();

        try {
            if (!html5QrScanner) {
                html5QrScanner = new window.Html5Qrcode('qr-reader');
            }
            const decodedText = await html5QrScanner.scanFile(file, false);
            playScanFeedback();
            await lookupAndDisplayCard(decodedText, true);
        } catch (_) {
            showStatus(scannerStatus, 'Nessun QR Code valido trovato nell\'immagine.', 'error');
        } finally {
            qrFileInput.value = '';
        }
    });

    /* ------------------------------------------------------------------
     * Ricerca e visualizzazione Card Famiglia
     * ------------------------------------------------------------------ */
    manualLookupForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = manualCodeInput.value.trim();
        if (!q) {
            manualCodeInput.focus();
            return;
        }
        await lookupAndDisplayCard(q, false);
    });

    loadSampleRossiBtn?.addEventListener('click', async () => {
        await lookupAndDisplayCard('PR-FAM-ROSSI81', false);
    });

    clearScannedCardBtn?.addEventListener('click', () => {
        currentCardBundle = null;
        scannedCardPanel.hidden = true;
        emptyScanPlaceholder.hidden = false;
        clearStatus(scannerStatus);
        clearStatus(recordPurchaseStatus);
    });

    async function lookupAndDisplayCard(queryText, fromQr = false) {
        clearStatus(scannerStatus);
        clearStatus(recordPurchaseStatus);
        try {
            const bundle = await PasianCardService.findCardByQuery(queryText);
            currentCardBundle = bundle;
            renderScannedCardBundle(bundle);
            showStatus(
                scannerStatus,
                `${fromQr ? 'QR riconosciuto' : 'Card caricata'}: ${bundle.card.family_name}`,
                'success'
            );
            if (window.innerWidth <= 968) {
                setActiveAdminTab('cassa-panel');
                $('cassa-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } catch (err) {
            showStatus(scannerStatus, err.message || 'Card Famiglia non trovata.', 'error');
        }
    }

    function renderAdminStatusTile(containerId, state, iconClass) {
        const box = $(containerId);
        if (!box) return;

        const done = state.completedInActiveCycle;
        const dotsHtml = state.tiers.map((_, idx) => {
            const n = idx + 1;
            const cls = n <= done ? 'is-done' : n === state.nextPurchaseNumber ? 'is-next' : '';
            return `<i class="${cls}"></i>`;
        }).join('');

        let noteClass = 'status-tile__note';
        let noteText = '1° acquisto avvia 3 mesi';
        if (state.isCycleActive && state.expiresAt) {
            noteClass += state.daysRemaining <= 14 ? ' is-warn' : ' is-active';
            noteText = `Scade il ${formatDateIT(state.expiresAt)} (${state.daysRemaining}g)`;
        } else if (state.wasCompleted) {
            noteClass += ' is-active';
            noteText = 'Ciclo 3/3 completato · riparte';
        } else if (state.wasExpired) {
            noteClass += ' is-warn';
            noteText = `Scaduto il ${formatDateIT(state.lastExpiresAt)}`;
        }

        box.innerHTML = `
            <div class="status-tile__head">
                <i class="fas ${iconClass}" aria-hidden="true"></i>
                <span>${state.category === 'gioielleria' ? 'Gioielleria' : 'Ottica'}</span>
            </div>
            <strong class="status-tile__pct">-${state.nextDiscountPercent}%</strong>
            <div class="step-dots" aria-label="${state.nextPurchaseNumber} su 3">
                ${dotsHtml}
                <span>${state.nextPurchaseNumber}° su 3</span>
            </div>
            <span class="${noteClass}">${noteText}</span>
        `;
    }

    function renderScannedCardBundle(bundle) {
        if (!bundle || !bundle.card) return;
        emptyScanPlaceholder.hidden = true;
        scannedCardPanel.hidden = false;

        const { card, members } = bundle;

        $('admin-card-family').textContent = card.family_name;
        $('admin-card-code').textContent = card.card_code;

        const contactsList = $('admin-card-contacts');
        contactsList.innerHTML = '';

        const holderLi = document.createElement('li');
        holderLi.innerHTML = '<i class="fas fa-user" aria-hidden="true"></i><span></span>';
        holderLi.querySelector('span').textContent = card.holder_name;
        contactsList.appendChild(holderLi);

        if (card.holder_phone) {
            const phoneLi = document.createElement('li');
            const telHref = `tel:${String(card.holder_phone).replace(/\s+/g, '')}`;
            phoneLi.innerHTML = `<i class="fas fa-phone" aria-hidden="true"></i><a href="${telHref}"></a>`;
            phoneLi.querySelector('a').textContent = card.holder_phone;
            contactsList.appendChild(phoneLi);
        }

        if (card.holder_email) {
            const mailLi = document.createElement('li');
            mailLi.innerHTML = `<i class="fas fa-envelope" aria-hidden="true"></i><a href="mailto:${card.holder_email}"></a>`;
            mailLi.querySelector('a').textContent = card.holder_email;
            contactsList.appendChild(mailLi);
        }

        // Chip componenti e select acquirente
        const badgesContainer = $('admin-members-badges');
        badgesContainer.innerHTML = '';
        purchaseMemberSelect.innerHTML = '';

        members.forEach((m) => {
            const rLabel = roleLabel(m.role);
            const chip = document.createElement('span');
            chip.className = 'chip';
            chip.innerHTML = `
                <span class="avatar" aria-hidden="true"></span>
                <strong></strong>
                <small></small>
            `;
            chip.querySelector('.avatar').textContent = getInitials(m.full_name);
            chip.querySelector('strong').textContent = m.full_name;
            chip.querySelector('small').textContent = rLabel;
            badgesContainer.appendChild(chip);

            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = `${m.full_name} · ${rLabel}${m.is_holder ? ' (Titolare)' : ''}`;
            purchaseMemberSelect.appendChild(opt);
        });

        const jewelryState = computeCategoryCycleState('gioielleria', card.jewelry_step, card.jewelry_cycle_started_at);
        const opticsState = computeCategoryCycleState('ottica', card.optics_step, card.optics_cycle_started_at);

        renderAdminStatusTile('admin-jewelry-summary', jewelryState, 'fa-gem');
        renderAdminStatusTile('admin-optics-summary', opticsState, 'fa-glasses');

        $('cat-pct-gioielleria').textContent = `-${jewelryState.nextDiscountPercent}%`;
        $('cat-pct-ottica').textContent = `-${opticsState.nextDiscountPercent}%`;

        updateLivePricePreview();
    }

    function getSelectedCategory() {
        return recordPurchaseForm?.querySelector('input[name="purchase_category"]:checked')?.value || 'gioielleria';
    }

    function updateLivePricePreview() {
        if (!currentCardBundle?.card) return;
        const card = currentCardBundle.card;
        const category = getSelectedCategory();

        if (opticsExclusionBox) {
            opticsExclusionBox.hidden = category !== 'ottica';
        }

        const state = category === 'gioielleria'
            ? computeCategoryCycleState('gioielleria', card.jewelry_step, card.jewelry_cycle_started_at)
            : computeCategoryCycleState('ottica', card.optics_step, card.optics_cycle_started_at);

        const ui = CATEGORY_UI[category] || CATEGORY_UI.gioielleria;

        $('preview-discount-badge').textContent = `-${state.nextDiscountPercent}%`;
        $('preview-step-label').textContent = `${state.nextPurchaseNumber}° acquisto ${ui.name}`;

        const rawAmount = parseFloat(purchaseOriginalAmount?.value || '');
        const finalPriceEl = $('preview-final-price');
        const savedPriceEl = $('preview-saved-price');

        if (!Number.isNaN(rawAmount) && rawAmount > 0) {
            const discounted = (rawAmount * (100 - state.nextDiscountPercent)) / 100;
            const saved = rawAmount - discounted;
            finalPriceEl.textContent = formatCurrencyEUR(discounted);
            savedPriceEl.textContent = `Risparmio ${formatCurrencyEUR(saved)}`;
        } else {
            finalPriceEl.textContent = '—';
            savedPriceEl.textContent = 'Inserisci il listino per il calcolo';
        }
    }

    recordPurchaseForm?.querySelectorAll('input[name="purchase_category"]').forEach((radio) => {
        radio.addEventListener('change', updateLivePricePreview);
    });
    purchaseOriginalAmount?.addEventListener('input', updateLivePricePreview);

    /* ------------------------------------------------------------------
     * Registrazione Acquisto in Cassa
     * ------------------------------------------------------------------ */
    recordPurchaseForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearStatus(recordPurchaseStatus);

        if (!currentCardBundle?.card) {
            showStatus(recordPurchaseStatus, 'Scansiona o seleziona prima una Card Famiglia.', 'error');
            return;
        }

        const category = getSelectedCategory();
        if (category === 'ottica' && !opticsNoContactsCheck.checked) {
            showStatus(
                recordPurchaseStatus,
                'Conferma che l\'acquisto riguarda occhiali e non lenti a contatto.',
                'error'
            );
            opticsNoContactsCheck.focus();
            return;
        }

        setLoading(recordPurchaseBtn, true);
        try {
            const result = await PasianCardService.recordPurchase({
                cardId: currentCardBundle.card.id,
                memberId: purchaseMemberSelect.value,
                category,
                originalAmount: purchaseOriginalAmount.value,
                notes: purchaseNotes.value
            });

            const updatedBundle = await PasianCardService.findCardByQuery(currentCardBundle.card.card_code);
            currentCardBundle = updatedBundle;
            renderScannedCardBundle(updatedBundle);

            purchaseOriginalAmount.value = '';
            purchaseNotes.value = '';
            opticsNoContactsCheck.checked = false;
            updateLivePricePreview();

            showStatus(
                recordPurchaseStatus,
                `Registrato ${result.purchase_number_in_cycle}° acquisto (${category === 'gioielleria' ? 'Gioielleria' : 'Ottica'}) con sconto -${result.discount_percent}%. Scadenza ciclo: ${formatDateIT(result.cycle_expires_at)}.`,
                'success'
            );

            await loadAdminLists();
        } catch (err) {
            showStatus(recordPurchaseStatus, err.message || 'Errore nella registrazione.', 'error');
        } finally {
            setLoading(recordPurchaseBtn, false);
        }
    });

    /* ------------------------------------------------------------------
     * Elenchi Famiglie e Ultimi Acquisti (card mobile-first)
     * ------------------------------------------------------------------ */
    function renderCardsList(filterText = '') {
        const listEl = $('admin-all-cards-list');
        if (!listEl) return;

        const { cards, members } = cachedCardsData;
        const q = String(filterText || '').trim().toLowerCase();

        const filtered = cards.filter((c) => {
            if (!q) return true;
            const cardMembers = members.filter((m) => m.card_id === c.id);
            const haystack = [
                c.card_code,
                c.family_name,
                c.holder_name,
                c.holder_email,
                c.holder_phone,
                ...cardMembers.map((m) => m.full_name)
            ].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(q);
        });

        $('admin-cards-count').textContent = String(filtered.length);
        listEl.innerHTML = '';

        if (!filtered.length) {
            listEl.innerHTML = `
                <li class="empty-state">
                    <i class="fas fa-users" aria-hidden="true"></i>
                    <strong>Nessuna famiglia trovata</strong>
                    <span>${q ? 'Prova con un altro termine di ricerca.' : 'Le nuove Card appariranno qui.'}</span>
                </li>`;
            return;
        }

        filtered.forEach((c) => {
            const cardMembers = members.filter((m) => m.card_id === c.id);
            const jState = computeCategoryCycleState('gioielleria', c.jewelry_step, c.jewelry_cycle_started_at);
            const oState = computeCategoryCycleState('ottica', c.optics_step, c.optics_cycle_started_at);

            const li = document.createElement('li');
            li.className = 'family-item';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'family-item__btn';
            btn.innerHTML = `
                <span class="avatar" aria-hidden="true"></span>
                <div class="family-item__body">
                    <span class="family-item__name"></span>
                    <span class="family-item__meta"><code></code> · <span class="js-members"></span></span>
                    <div class="family-item__badges">
                        <span class="mini-badge ${jState.isCycleActive ? 'is-active' : ''}">
                            <i class="fas fa-gem" aria-hidden="true"></i> -${jState.nextDiscountPercent}% (${jState.nextPurchaseNumber}°)
                        </span>
                        <span class="mini-badge ${oState.isCycleActive ? 'is-active' : ''}">
                            <i class="fas fa-glasses" aria-hidden="true"></i> -${oState.nextDiscountPercent}% (${oState.nextPurchaseNumber}°)
                        </span>
                    </div>
                </div>
                <i class="fas fa-chevron-right family-item__chev" aria-hidden="true"></i>
            `;

            btn.querySelector('.avatar').textContent = getInitials(c.family_name.replace(/^famiglia\s+/i, '') || c.holder_name);
            btn.querySelector('.family-item__name').textContent = c.family_name;
            btn.querySelector('code').textContent = c.card_code;
            btn.querySelector('.js-members').textContent = `${cardMembers.length} ${cardMembers.length === 1 ? 'membro' : 'membri'} · ${c.holder_name}`;

            btn.addEventListener('click', () => {
                lookupAndDisplayCard(c.card_code, false);
                $('cassa-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });

            li.appendChild(btn);
            listEl.appendChild(li);
        });
    }

    function renderRecentPurchasesList() {
        const listEl = $('admin-recent-purchases-list');
        if (!listEl) return;

        const { purchases, cards } = cachedCardsData;
        const cardById = new Map(cards.map((c) => [c.id, c]));
        listEl.innerHTML = '';

        if (!purchases.length) {
            listEl.innerHTML = `
                <li class="empty-state">
                    <i class="fas fa-receipt" aria-hidden="true"></i>
                    <strong>Nessun acquisto registrato</strong>
                    <span>Gli ultimi movimenti appariranno qui.</span>
                </li>`;
            return;
        }

        purchases.forEach((p) => {
            const ui = CATEGORY_UI[p.category] || CATEGORY_UI.gioielleria;
            const fam = cardById.get(p.card_id)?.family_name;
            const hasAmount = p.final_amount !== null && p.final_amount !== undefined;

            const li = document.createElement('li');
            li.className = 'purchase-item';
            li.innerHTML = `
                <span class="purchase-item__icon" aria-hidden="true"><i class="fas ${ui.icon}"></i></span>
                <div class="purchase-item__body">
                    <span class="purchase-item__title"></span>
                    <span class="purchase-item__meta"></span>
                    ${p.notes ? '<span class="purchase-item__notes"></span>' : ''}
                </div>
                <div class="purchase-item__right">
                    <span class="purchase-item__pct">-${p.discount_percent}%</span>
                    ${hasAmount ? `<span class="purchase-item__amount">${formatCurrencyEUR(p.final_amount)}<s>${formatCurrencyEUR(p.original_amount)}</s></span>` : ''}
                </div>
            `;
            li.querySelector('.purchase-item__title').textContent = `${p.member_name || fam || 'Cliente'} · ${p.purchase_number_in_cycle}° ${ui.name}`;
            li.querySelector('.purchase-item__meta').textContent = `${fam ? fam + ' · ' : ''}${formatDateIT(p.created_at, true)}`;
            if (p.notes) li.querySelector('.purchase-item__notes').textContent = p.notes;
            listEl.appendChild(li);
        });
    }

    async function loadAdminLists() {
        try {
            cachedCardsData = await PasianCardService.listAllCardsAndRecentPurchases();
            renderCardsList(filterCardsInput?.value || '');
            renderRecentPurchasesList();
        } catch (err) {
            showStatus(scannerStatus, err.message, 'error');
        }
    }

    filterCardsInput?.addEventListener('input', () => {
        renderCardsList(filterCardsInput.value);
    });

    refreshAdminListsBtn?.addEventListener('click', loadAdminLists);

    /* ------------------------------------------------------------------
     * Tab bar inferiore (mobile)
     * ------------------------------------------------------------------ */
    const adminMobileNavBtns = document.querySelectorAll('[data-admin-mobile-nav]');

    function setActiveAdminTab(targetId) {
        adminMobileNavBtns.forEach((b) => b.classList.toggle('active', b.dataset.adminMobileNav === targetId));
    }

    adminMobileNavBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.adminMobileNav;
            setActiveAdminTab(targetId);
            if (targetId === 'scanner-panel') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                $(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    if ('IntersectionObserver' in window) {
        const sectionObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) setActiveAdminTab(entry.target.id);
            });
        }, { rootMargin: '-45% 0px -50% 0px' });
        ['scanner-panel', 'cassa-panel', 'famiglie-section', 'acquisti-section'].forEach((id) => {
            const el = $(id);
            if (el) sectionObserver.observe(el);
        });
    }

    /* ------------------------------------------------------------------
     * Stato pagina: login ↔ postazione cassa
     * ------------------------------------------------------------------ */
    function showLoginView() {
        adminLoginSection.hidden = false;
        adminWorkspaceSection.hidden = true;
        body.dataset.view = 'auth';
    }

    async function refreshAdminView() {
        const user = await PasianCardService.getSessionUser();
        if (!user) {
            showLoginView();
            return;
        }

        if (PasianCardService.isLiveSupabase() && !user.is_admin) {
            showLoginView();
            showStatus(
                adminLoginStatus,
                `L'account ${user.email} non è ancora abilitato come operatore nella tabella admin_users.`,
                'error'
            );
            return;
        }

        adminLoginSection.hidden = true;
        adminWorkspaceSection.hidden = false;
        body.dataset.view = 'workspace';
        $('admin-logged-email').textContent = user.email;

        await loadAdminLists();
    }

    await refreshAdminView();
});
