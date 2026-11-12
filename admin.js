/**
 * PASIAN RIVALTA - Logica Pannello Cassa & Scanner QR (Admin)
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (window.UserInvalidFallback) {
        window.UserInvalidFallback.init(document);
    }

    const body = document.body;
    const $ = (id) => document.getElementById(id);

    const adminLoginSection = $('admin-login-section');
    const adminWorkspaceSection = $('admin-workspace-section');
    const adminSigninForm = $('admin-signin-form');
    const adminSigninBtn = $('admin-signin-btn');
    const adminLoginStatus = $('admin-login-status');
    const adminSetpassForm = $('admin-setpass-form');
    const adminSetpassBtn = $('admin-setpass-btn');
    const adminSetpassStatus = $('admin-setpass-status');
    const switchToSetpassBtn = $('switch-to-setpass-btn');
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

    const toggleEditCardBtn = $('toggle-edit-card-btn');
    const adminEditCardForm = $('admin-edit-card-form');
    const adminEditFamilyName = $('admin-edit-family-name');
    const adminEditHolderName = $('admin-edit-holder-name');
    const adminEditHolderPhone = $('admin-edit-holder-phone');
    const adminSaveCardBtn = $('admin-save-card-btn');

    const toggleAddMemberBtn = $('toggle-add-member-btn');
    const adminAddMemberForm = $('admin-add-member-form');
    const adminNewMemberName = $('admin-new-member-name');
    const adminNewMemberRole = $('admin-new-member-role');
    const adminAddMemberBtn = $('admin-add-member-btn');
    const adminManageStatus = $('admin-manage-status');
    const adminCardPurchasesList = $('admin-card-purchases-list');

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

    const generateCodeForm = $('generate-code-form');
    const newCodeNotes = $('new-code-notes');
    const generateCodeBtn = $('generate-code-btn');
    const generatedCodeBanner = $('generated-code-banner');
    const generatedCodeValue = $('generated-code-value');
    const generatedCodeNote = $('generated-code-note');
    const copyGeneratedCodeBtn = $('copy-generated-code-btn');
    const copyGeneratedLinkBtn = $('copy-generated-link-btn');
    const generateCodeStatus = $('generate-code-status');
    const refreshCodesBtn = $('refresh-codes-btn');
    const adminCodesList = $('admin-codes-list');
    const codeFilterBtns = document.querySelectorAll('[data-codes-filter]');

    const CATEGORY_UI = {
        gioielleria: { name: 'Gioielleria', icon: 'fa-gem' },
        ottica: { name: 'Ottica', icon: 'fa-glasses' }
    };

    let html5QrScanner = null;
    let isCameraRunning = false;
    let currentCardBundle = null;
    let currentCodesFilter = 'unused';
    let cachedCardsData = {
        cards: [],
        members: [],
        purchases: [],
        registrationCodes: [],
        registrationCodesSchemaMissing: false
    };

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
     * Accesso Operatore & Impostazione Password
     * ------------------------------------------------------------------ */
    function switchAdminAuthTab(tabName) {
        const isLogin = tabName !== 'setpass';
        const tabLogin = $('admin-tab-login');
        const tabSetpass = $('admin-tab-setpass');
        const panelLogin = $('admin-panel-login');
        const panelSetpass = $('admin-panel-setpass');

        if (tabLogin) tabLogin.setAttribute('aria-selected', isLogin ? 'true' : 'false');
        if (tabSetpass) tabSetpass.setAttribute('aria-selected', isLogin ? 'false' : 'true');
        if (panelLogin) panelLogin.hidden = !isLogin;
        if (panelSetpass) panelSetpass.hidden = isLogin;

        clearStatus(adminLoginStatus);
        clearStatus(adminSetpassStatus);

        if (!isLogin) {
            const loginEmail = $('admin-email')?.value?.trim();
            if (loginEmail && $('admin-setpass-email')) {
                $('admin-setpass-email').value = loginEmail;
            }
            $('admin-new-password')?.focus();
        }
    }

    document.querySelectorAll('[data-admin-auth-tab]').forEach((btn) => {
        btn.addEventListener('click', () => switchAdminAuthTab(btn.getAttribute('data-admin-auth-tab')));
    });

    switchToSetpassBtn?.addEventListener('click', () => switchAdminAuthTab('setpass'));

    adminSigninForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearStatus(adminLoginStatus);

        if (!adminSigninForm.checkValidity()) {
            adminSigninForm.querySelectorAll('input').forEach((inp) => {
                inp.classList.toggle('user-invalid-fallback', !inp.checkValidity());
            });
            showStatus(adminLoginStatus, 'Email o password errata. Controlla i dati inseriti e riprova.', 'error');
            adminSigninForm.querySelector(':invalid')?.focus();
            return;
        }

        setLoading(adminSigninBtn, true);
        try {
            await PasianCardService.signIn($('admin-email').value, $('current-password').value);
            await refreshAdminView();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            showStatus(adminLoginStatus, err.message || 'Email o password errata. Controlla i dati inseriti e riprova.', 'error');
        } finally {
            setLoading(adminSigninBtn, false);
        }
    });

    adminSetpassForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearStatus(adminSetpassStatus);

        const emailVal = $('admin-setpass-email')?.value?.trim();
        const newPassVal = $('admin-new-password')?.value || '';
        const confirmPassVal = $('admin-confirm-password')?.value || '';

        if (!emailVal || newPassVal.length < 8) {
            showStatus(adminSetpassStatus, 'Inserisci l\'email operatore e una password di almeno 8 caratteri.', 'error');
            return;
        }

        if (newPassVal !== confirmPassVal) {
            showStatus(adminSetpassStatus, 'Le due password non coincidono.', 'error');
            $('admin-confirm-password')?.focus();
            return;
        }

        setLoading(adminSetpassBtn, true);
        try {
            await PasianCardService.setOperatorPassword(emailVal, newPassVal);
            await refreshAdminView();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            showStatus(adminSetpassStatus, err.message || 'Impossibile aggiornare la password.', 'error');
        } finally {
            setLoading(adminSetpassBtn, false);
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

    clearScannedCardBtn?.addEventListener('click', () => {
        currentCardBundle = null;
        scannedCardPanel.hidden = true;
        emptyScanPlaceholder.hidden = false;
        clearStatus(scannerStatus);
        clearStatus(recordPurchaseStatus);
        clearStatus(adminManageStatus);
    });

    async function refreshCurrentCardAndLists(statusMessage = '') {
        if (currentCardBundle?.card?.card_code) {
            const updatedBundle = await PasianCardService.findCardByQuery(currentCardBundle.card.card_code);
            currentCardBundle = updatedBundle;
            renderScannedCardBundle(updatedBundle);
        }
        await loadAdminLists();
        if (statusMessage) {
            showStatus(adminManageStatus, statusMessage, 'success');
        }
    }

    // Toggle modifica dati scheda famiglia
    toggleEditCardBtn?.addEventListener('click', () => {
        if (!adminEditCardForm || !currentCardBundle?.card) return;
        const willOpen = adminEditCardForm.hidden;
        adminEditCardForm.hidden = !willOpen;
        toggleEditCardBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        if (willOpen) {
            adminEditFamilyName.value = currentCardBundle.card.family_name || '';
            adminEditHolderName.value = currentCardBundle.card.holder_name || '';
            adminEditHolderPhone.value = currentCardBundle.card.holder_phone || '';
            adminEditFamilyName.focus();
        }
    });

    adminEditCardForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentCardBundle?.card) return;
        clearStatus(adminManageStatus);

        const familyName = adminEditFamilyName.value.trim();
        const holderName = adminEditHolderName.value.trim();
        const holderPhone = adminEditHolderPhone.value.trim();

        if (!familyName || !holderName) {
            showStatus(adminManageStatus, 'Inserisci il nome famiglia e il nome del titolare.', 'error');
            return;
        }

        setLoading(adminSaveCardBtn, true);
        try {
            await PasianCardService.adminUpdateCard({
                cardId: currentCardBundle.card.id,
                familyName,
                holderName,
                holderPhone
            });
            adminEditCardForm.hidden = true;
            toggleEditCardBtn?.setAttribute('aria-expanded', 'false');
            await refreshCurrentCardAndLists('Dati della Card Famiglia aggiornati.');
        } catch (err) {
            showStatus(adminManageStatus, err.message || 'Errore durante il salvataggio.', 'error');
        } finally {
            setLoading(adminSaveCardBtn, false);
        }
    });

    // Toggle aggiunta rapido componente
    toggleAddMemberBtn?.addEventListener('click', () => {
        if (!adminAddMemberForm) return;
        const willOpen = adminAddMemberForm.hidden;
        adminAddMemberForm.hidden = !willOpen;
        toggleAddMemberBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        if (willOpen) {
            adminNewMemberName?.focus();
        }
    });

    adminAddMemberForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentCardBundle?.card) return;
        clearStatus(adminManageStatus);

        const fullName = adminNewMemberName?.value?.trim();
        const role = adminNewMemberRole?.value || 'figlio';

        if (!fullName || fullName.length < 2) {
            showStatus(adminManageStatus, 'Inserisci nome e cognome del familiare.', 'error');
            adminNewMemberName?.focus();
            return;
        }

        setLoading(adminAddMemberBtn, true);
        try {
            await PasianCardService.adminAddMember({
                cardId: currentCardBundle.card.id,
                fullName,
                role
            });
            adminNewMemberName.value = '';
            adminAddMemberForm.hidden = true;
            toggleAddMemberBtn?.setAttribute('aria-expanded', 'false');
            await refreshCurrentCardAndLists(`Familiare "${fullName}" aggiunto alla Card.`);
        } catch (err) {
            showStatus(adminManageStatus, err.message || 'Impossibile aggiungere il familiare.', 'error');
        } finally {
            setLoading(adminAddMemberBtn, false);
        }
    });

    async function handleCancelPurchase(purchase) {
        if (!purchase?.id) return;
        clearStatus(adminManageStatus);
        clearStatus(recordPurchaseStatus);
        try {
            await PasianCardService.adminCancelPurchase(purchase.id);
            const catLabel = purchase.category === 'gioielleria' ? 'Gioielleria' : 'Ottica';
            await refreshCurrentCardAndLists(
                `Acquisto ${catLabel} (-${purchase.discount_percent}%) annullato: lo sconto è tornato disponibile.`
            );
        } catch (err) {
            showStatus(adminManageStatus, err.message || 'Impossibile annullare l\'acquisto.', 'error');
            showStatus(scannerStatus, err.message || 'Impossibile annullare l\'acquisto.', 'error');
        }
    }

    async function handleDeleteFamilyCard(card) {
        if (!card?.id) return;
        const label = `${card.family_name || 'Famiglia'}${card.holder_email ? ' (' + card.holder_email + ')' : ''}`;
        const confirmed = window.confirm(
            `Vuoi eliminare definitivamente l'account e la Card di "${label}"?\n\nL'account verrà disattivato e rimosso dall'elenco famiglie.`
        );
        if (!confirmed) return;

        clearStatus(adminManageStatus);
        clearStatus(scannerStatus);

        const deleteBtn = $('admin-delete-card-btn');
        if (deleteBtn) setLoading(deleteBtn, true);

        try {
            await PasianCardService.adminDeleteFamilyCard(card.id);
            if (currentCardBundle?.card?.id === card.id) {
                currentCardBundle = null;
                scannedCardPanel.hidden = true;
                emptyScanPlaceholder.hidden = false;
            }
            await loadAdminLists();
            showStatus(scannerStatus, `Account e Card di "${card.family_name}" eliminati con successo.`, 'success');
        } catch (err) {
            showStatus(adminManageStatus, err.message || 'Impossibile eliminare la scheda famiglia.', 'error');
            showStatus(scannerStatus, err.message || 'Impossibile eliminare la scheda famiglia.', 'error');
        } finally {
            if (deleteBtn) setLoading(deleteBtn, false);
        }
    }

    $('admin-delete-card-btn')?.addEventListener('click', () => {
        if (currentCardBundle?.card) {
            handleDeleteFamilyCard(currentCardBundle.card);
        }
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

        const { card, members, purchases } = bundle;

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

        // Chip componenti (con pulsante rimozione per i non-titolari) e select acquirente
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
                ${!m.is_holder ? '<button type="button" class="chip__remove" aria-label="Rimuovi familiare" title="Rimuovi familiare"><i class="fas fa-times" aria-hidden="true"></i></button>' : ''}
            `;
            chip.querySelector('.avatar').textContent = getInitials(m.full_name);
            chip.querySelector('strong').textContent = m.full_name;
            chip.querySelector('small').textContent = m.is_holder ? `${rLabel} · Titolare` : rLabel;

            const removeBtn = chip.querySelector('.chip__remove');
            if (removeBtn) {
                removeBtn.addEventListener('click', async () => {
                    clearStatus(adminManageStatus);
                    try {
                        await PasianCardService.adminRemoveMember(m.id);
                        await refreshCurrentCardAndLists(`Familiare "${m.full_name}" rimosso dalla Card.`);
                    } catch (err) {
                        showStatus(adminManageStatus, err.message || 'Impossibile rimuovere il familiare.', 'error');
                    }
                });
            }

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
        renderScannedCardPurchases(purchases || []);
    }

    function renderScannedCardPurchases(purchases) {
        if (!adminCardPurchasesList) return;
        adminCardPurchasesList.innerHTML = '';

        if (!purchases.length) {
            adminCardPurchasesList.innerHTML = `
                <li class="empty-state empty-state--compact">
                    <span>Nessun acquisto attivo per questa Card.</span>
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
                    <span class="purchase-item__title"></span>
                    <span class="purchase-item__meta"></span>
                    ${p.notes ? '<span class="purchase-item__notes"></span>' : ''}
                </div>
                <div class="purchase-item__right">
                    <span class="purchase-item__pct">-${p.discount_percent}%</span>
                    ${hasAmount ? `<span class="purchase-item__amount">${formatCurrencyEUR(p.final_amount)}<s>${formatCurrencyEUR(p.original_amount)}</s></span>` : ''}
                    <button type="button" class="purchase-cancel-btn" title="Annulla questo acquisto e ripristina lo sconto">
                        <i class="fas fa-rotate-left" aria-hidden="true"></i> Annulla sconto
                    </button>
                </div>
            `;
            li.querySelector('.purchase-item__title').textContent = `${p.member_name || 'Cliente'} · ${p.purchase_number_in_cycle}° ${ui.name}`;
            li.querySelector('.purchase-item__meta').textContent = formatDateIT(p.created_at, true);
            if (p.notes) li.querySelector('.purchase-item__notes').textContent = p.notes;
            li.querySelector('.purchase-cancel-btn').addEventListener('click', () => handleCancelPurchase(p));
            adminCardPurchasesList.appendChild(li);
        });
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

            const delFamilyBtn = document.createElement('button');
            delFamilyBtn.type = 'button';
            delFamilyBtn.className = 'family-item__delete-btn';
            delFamilyBtn.title = `Elimina account e Card di ${c.family_name}`;
            delFamilyBtn.setAttribute('aria-label', `Elimina account e Card di ${c.family_name}`);
            delFamilyBtn.innerHTML = '<i class="fas fa-trash-alt" aria-hidden="true"></i>';
            delFamilyBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                handleDeleteFamilyCard(c);
            });

            li.appendChild(btn);
            li.appendChild(delFamilyBtn);
            listEl.appendChild(li);
        });
    }

    function renderRecentPurchasesList() {
        const listEl = $('admin-recent-purchases-list');
        if (!listEl) return;

        const { purchases, cards } = cachedCardsData;
        const cardById = new Map(cards.map((c) => [c.id, c]));
        if ($('admin-purchases-count')) {
            $('admin-purchases-count').textContent = String(purchases.length);
        }
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
                    <button type="button" class="purchase-cancel-btn" title="Annulla questo acquisto e ripristina lo sconto">
                        <i class="fas fa-rotate-left" aria-hidden="true"></i> Annulla sconto
                    </button>
                </div>
            `;
            li.querySelector('.purchase-item__title').textContent = `${p.member_name || fam || 'Cliente'} · ${p.purchase_number_in_cycle}° ${ui.name}`;
            li.querySelector('.purchase-item__meta').textContent = `${fam ? fam + ' · ' : ''}${formatDateIT(p.created_at, true)}`;
            if (p.notes) li.querySelector('.purchase-item__notes').textContent = p.notes;
            li.querySelector('.purchase-cancel-btn').addEventListener('click', () => handleCancelPurchase(p));
            listEl.appendChild(li);
        });
    }

    /* ------------------------------------------------------------------
     * Gestione Codici Acquisto Monouso (Generazione, Copia, Elenco, Eliminazione)
     * ------------------------------------------------------------------ */
    async function copyTextWithFeedback(text, btn, copiedLabel = 'Copiato!') {
        if (!text) return;
        let ok = false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                ok = true;
            }
        } catch (_) {
            ok = false;
        }
        if (!ok) {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
                ok = true;
            } catch (_) {
                ok = false;
            }
        }
        if (ok && btn) {
            const prevHtml = btn.dataset.origHtml || btn.innerHTML;
            btn.dataset.origHtml = prevHtml;
            btn.innerHTML = `<i class="fas fa-check" aria-hidden="true"></i> ${copiedLabel}`;
            setTimeout(() => {
                btn.innerHTML = prevHtml;
            }, 1800);
        }
    }

    function buildRegistrationUrl(code) {
        const base = window.location.origin + window.location.pathname.replace(/admin\.html.*$/i, 'card-famiglia.html');
        return `${base}?codice=${encodeURIComponent(code)}`;
    }

    copyGeneratedCodeBtn?.addEventListener('click', () => {
        const code = generatedCodeValue?.textContent?.trim();
        copyTextWithFeedback(code, copyGeneratedCodeBtn, 'Codice copiato!');
    });

    copyGeneratedLinkBtn?.addEventListener('click', () => {
        const code = generatedCodeValue?.textContent?.trim();
        if (!code) return;
        copyTextWithFeedback(buildRegistrationUrl(code), copyGeneratedLinkBtn, 'Link copiato!');
    });

    async function handleDeleteRegistrationCode(codeRow) {
        if (!codeRow || codeRow.is_used) return;
        const confirmed = window.confirm(`Vuoi eliminare il codice acquisto non ancora utilizzato "${codeRow.code}"?`);
        if (!confirmed) return;

        clearStatus(generateCodeStatus);
        try {
            await PasianCardService.adminDeleteRegistrationCode(codeRow.id);
            if (generatedCodeValue?.textContent?.trim() === codeRow.code && generatedCodeBanner) {
                generatedCodeBanner.hidden = true;
            }
            showStatus(generateCodeStatus, `Codice ${codeRow.code} eliminato.`, 'success');
            await loadAdminLists();
        } catch (err) {
            showStatus(generateCodeStatus, err.message || 'Impossibile eliminare il codice.', 'error');
        }
    }

    function renderRegistrationCodesList() {
        if (!adminCodesList) return;

        const allCodes = cachedCardsData.registrationCodes || [];
        const unusedCodes = allCodes.filter((c) => !c.is_used);
        const usedCodes = allCodes.filter((c) => Boolean(c.is_used));

        if ($('admin-codes-available-count')) $('admin-codes-available-count').textContent = String(unusedCodes.length);
        if ($('codes-count-unused')) $('codes-count-unused').textContent = String(unusedCodes.length);
        if ($('codes-count-used')) $('codes-count-used').textContent = String(usedCodes.length);
        if ($('codes-count-all')) $('codes-count-all').textContent = String(allCodes.length);

        adminCodesList.innerHTML = '';

        if (cachedCardsData.registrationCodesSchemaMissing) {
            adminCodesList.innerHTML = `
                <li class="empty-state">
                    <i class="fas fa-database" aria-hidden="true"></i>
                    <strong>Tabella Codici Acquisto da attivare su Supabase</strong>
                    <span>Apri il SQL Editor del tuo progetto Supabase ed esegui lo script <code>supabase-schema.sql</code> per abilitare i codici acquisto monouso.</span>
                </li>`;
            return;
        }

        const filtered =
            currentCodesFilter === 'unused'
                ? unusedCodes
                : currentCodesFilter === 'used'
                  ? usedCodes
                  : allCodes;

        if (!filtered.length) {
            const emptyMsg =
                currentCodesFilter === 'unused'
                    ? 'Nessun codice acquisto disponibile al momento. Premi "Genera nuovo codice acquisto" qui sopra per crearne uno.'
                    : currentCodesFilter === 'used'
                      ? 'Nessun codice acquisto è ancora stato utilizzato.'
                      : 'Nessun codice acquisto generato finora.';
            adminCodesList.innerHTML = `
                <li class="empty-state">
                    <i class="fas fa-key" aria-hidden="true"></i>
                    <strong>Nessun codice in questo elenco</strong>
                    <span>${emptyMsg}</span>
                </li>`;
            return;
        }

        const cardById = new Map((cachedCardsData.cards || []).map((c) => [c.id, c]));

        filtered.forEach((c) => {
            const li = document.createElement('li');
            li.className = `code-item ${c.is_used ? 'is-used' : 'is-available'}`;

            const statusBadgeHtml = c.is_used
                ? `<span class="code-status-badge is-used"><i class="fas fa-lock" aria-hidden="true"></i> Già utilizzato</span>`
                : `<span class="code-status-badge is-available"><i class="fas fa-check-circle" aria-hidden="true"></i> Disponibile · 1 utilizzo</span>`;

            li.innerHTML = `
                <div class="code-item__main">
                    <div class="code-item__top">
                        <code class="code-item__code"></code>
                        ${statusBadgeHtml}
                    </div>
                    <span class="code-item__meta"></span>
                    ${c.notes ? '<span class="code-item__note"></span>' : ''}
                </div>
                <div class="code-item__actions"></div>
            `;

            li.querySelector('.code-item__code').textContent = c.code;

            if (c.is_used) {
                const usedFam = c.used_by_family_name || cardById.get(c.used_by_card_id)?.family_name || c.used_by_email || 'Cliente registrato';
                li.querySelector('.code-item__meta').textContent =
                    `Utilizzato da: ${usedFam} · ${c.used_at ? formatDateIT(c.used_at, true) : formatDateIT(c.created_at, true)}`;
            } else {
                li.querySelector('.code-item__meta').textContent = `Generato il ${formatDateIT(c.created_at, true)} · Valido per 1 registrazione`;
            }

            if (c.notes) {
                li.querySelector('.code-item__note').textContent = `Nota: ${c.notes}`;
            }

            const actionsEl = li.querySelector('.code-item__actions');
            if (!c.is_used) {
                const copyBtn = document.createElement('button');
                copyBtn.type = 'button';
                copyBtn.className = 'pf-chip-btn';
                copyBtn.innerHTML = '<i class="fas fa-copy" aria-hidden="true"></i> Copia';
                copyBtn.addEventListener('click', () => copyTextWithFeedback(c.code, copyBtn, 'Copiato!'));

                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'purchase-cancel-btn';
                delBtn.title = 'Elimina codice non utilizzato';
                delBtn.innerHTML = '<i class="fas fa-trash-alt" aria-hidden="true"></i> Elimina';
                delBtn.addEventListener('click', () => handleDeleteRegistrationCode(c));

                actionsEl.appendChild(copyBtn);
                actionsEl.appendChild(delBtn);
            } else {
                const linkedCard = cardById.get(c.used_by_card_id);
                const lookupQuery = linkedCard?.card_code || c.used_by_family_name || c.used_by_email;
                if (lookupQuery) {
                    const openBtn = document.createElement('button');
                    openBtn.type = 'button';
                    openBtn.className = 'pf-chip-btn';
                    openBtn.innerHTML = '<i class="fas fa-id-card" aria-hidden="true"></i> Apri Card';
                    openBtn.addEventListener('click', () => {
                        lookupAndDisplayCard(lookupQuery, false);
                        $('cassa-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                    actionsEl.appendChild(openBtn);
                }
            }

            adminCodesList.appendChild(li);
        });
    }

    codeFilterBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            currentCodesFilter = btn.dataset.codesFilter || 'unused';
            codeFilterBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
            renderRegistrationCodesList();
        });
    });

    generateCodeForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearStatus(generateCodeStatus);

        const notes = newCodeNotes ? newCodeNotes.value.trim() : '';
        setLoading(generateCodeBtn, true);

        try {
            const created = await PasianCardService.adminGenerateRegistrationCode(notes);
            if (newCodeNotes) newCodeNotes.value = '';

            if (generatedCodeBanner && generatedCodeValue && created?.code) {
                generatedCodeValue.textContent = created.code;
                if (generatedCodeNote) {
                    generatedCodeNote.textContent = created.notes ? `Nota: ${created.notes}` : '';
                }
                generatedCodeBanner.hidden = false;
            }

            currentCodesFilter = 'unused';
            codeFilterBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.codesFilter === 'unused'));

            await loadAdminLists();
            showStatus(
                generateCodeStatus,
                `Nuovo codice acquisto ${created.code} generato! Consegnalo al cliente per registrare la sua Card Famiglia (i codici precedenti non usati restano validi).`,
                'success'
            );
        } catch (err) {
            showStatus(generateCodeStatus, err.message || 'Errore nella generazione del codice acquisto.', 'error');
        } finally {
            setLoading(generateCodeBtn, false);
        }
    });

    refreshCodesBtn?.addEventListener('click', loadAdminLists);

    async function loadAdminLists() {
        try {
            cachedCardsData = await PasianCardService.listAllCardsAndRecentPurchases();
            renderCardsList(filterCardsInput?.value || '');
            renderRecentPurchasesList();
            renderRegistrationCodesList();
        } catch (err) {
            showStatus(scannerStatus, err.message, 'error');
        }
    }

    filterCardsInput?.addEventListener('input', () => {
        renderCardsList(filterCardsInput.value);
    });

    refreshAdminListsBtn?.addEventListener('click', loadAdminLists);

    /* ------------------------------------------------------------------
     * Apertura a richiesta per Famiglie registrate e Ultimi acquisti + Tab bar mobile
     * ------------------------------------------------------------------ */
    const toggleAdminFamiglieBtn = $('toggle-admin-famiglie-btn');
    const toggleAdminAcquistiBtn = $('toggle-admin-acquisti-btn');

    function toggleAdminDrawer(sectionId, forceOpen = null) {
        const famSec = $('famiglie-section');
        const acqSec = $('acquisti-section');
        const isFam = sectionId === 'famiglie-section';
        const targetSec = isFam ? famSec : acqSec;
        const targetBtn = isFam ? toggleAdminFamiglieBtn : toggleAdminAcquistiBtn;
        if (!targetSec || !targetBtn) return;

        const willOpen = forceOpen !== null ? forceOpen : targetSec.hidden;
        targetSec.hidden = !willOpen;
        targetBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        targetBtn.classList.toggle('is-open', willOpen);
    }

    toggleAdminFamiglieBtn?.addEventListener('click', () => toggleAdminDrawer('famiglie-section'));
    toggleAdminAcquistiBtn?.addEventListener('click', () => toggleAdminDrawer('acquisti-section'));

    const adminMobileNavBtns = document.querySelectorAll('[data-admin-mobile-nav]');

    function setActiveAdminTab(targetId) {
        adminMobileNavBtns.forEach((b) => b.classList.toggle('active', b.dataset.adminMobileNav === targetId));
    }

    adminMobileNavBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.adminMobileNav;
            setActiveAdminTab(targetId);
            if (targetId === 'famiglie-section' || targetId === 'acquisti-section') {
                toggleAdminDrawer(targetId, true);
            }
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
        ['scanner-panel', 'cassa-panel', 'codici-panel', 'famiglie-section', 'acquisti-section'].forEach((id) => {
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
