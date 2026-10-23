/**
 * PASIAN RIVALTA - Logica Pannello Admin, Scanner QR Fotocamera & Cassa Sconti
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (window.UserInvalidFallback) {
        window.UserInvalidFallback.init(document);
    }

    const adminDemoBanner = document.getElementById('admin-demo-banner');
    const adminDemoLoginBtn = document.getElementById('admin-demo-login-btn');

    const adminLoginSection = document.getElementById('admin-login-section');
    const adminWorkspaceSection = document.getElementById('admin-workspace-section');
    const adminSigninForm = document.getElementById('admin-signin-form');
    const adminSigninBtn = document.getElementById('admin-signin-btn');
    const adminLoginStatus = document.getElementById('admin-login-status');
    const adminSignoutBtn = document.getElementById('admin-signout-btn');

    const startCameraBtn = document.getElementById('start-camera-btn');
    const stopCameraBtn = document.getElementById('stop-camera-btn');
    const qrFileInput = document.getElementById('qr-file-input');
    const manualLookupForm = document.getElementById('manual-lookup-form');
    const manualCodeInput = document.getElementById('manual-code-input');
    const scannerStatus = document.getElementById('scanner-status');

    const emptyScanPlaceholder = document.getElementById('empty-scan-placeholder');
    const scannedCardPanel = document.getElementById('scanned-card-panel');
    const loadSampleRossiBtn = document.getElementById('load-sample-rossi-btn');

    const recordPurchaseForm = document.getElementById('record-purchase-form');
    const recordPurchaseBtn = document.getElementById('record-purchase-btn');
    const recordPurchaseStatus = document.getElementById('record-purchase-status');
    const purchaseMemberSelect = document.getElementById('purchase-member-select');
    const purchaseOriginalAmount = document.getElementById('purchase-original-amount');
    const purchaseNotes = document.getElementById('purchase-notes');
    const opticsExclusionBox = document.getElementById('optics-exclusion-confirm-box');
    const opticsNoContactsCheck = document.getElementById('optics-no-contacts-check');

    const refreshAdminListsBtn = document.getElementById('refresh-admin-lists-btn');

    let html5QrScanner = null;
    let isCameraRunning = false;
    let currentCardBundle = null;

    if (!PasianCardService.isLiveSupabase() && adminDemoBanner) {
        adminDemoBanner.style.display = 'flex';
    }

    // Toggle Mostra/Nascondi Password
    document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-toggle-password');
            const input = document.getElementById(targetId);
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

    // Segnale acustico di conferma lettura QR Code
    function playScanBeep() {
        try {
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

    // Accesso rapido Demo Admin
    adminDemoLoginBtn?.addEventListener('click', async () => {
        try {
            await PasianCardService.signIn('admin@pasianrivalta.it', 'AdminPassword1!');
            await refreshAdminView();
        } catch (err) {
            showStatus(adminLoginStatus, err.message, 'error');
        }
    });

    // Login Form Admin
    adminSigninForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearStatus(adminLoginStatus);

        if (!adminSigninForm.checkValidity()) {
            adminSigninForm.querySelector(':invalid')?.focus();
            return;
        }

        const email = document.getElementById('admin-email').value;
        const password = document.getElementById('current-password').value;

        adminSigninBtn.disabled = true;
        try {
            await PasianCardService.signIn(email, password);
            await refreshAdminView();
        } catch (err) {
            showStatus(adminLoginStatus, err.message || 'Accesso non riuscito.', 'error');
        } finally {
            adminSigninBtn.disabled = false;
        }
    });

    adminSignoutBtn?.addEventListener('click', async () => {
        await stopQrCamera();
        await PasianCardService.signOut();
        await refreshAdminView();
    });

    // Gestione Fotocamera Scanner QR (html5-qrcode)
    async function startQrCamera() {
        clearStatus(scannerStatus);
        if (!window.Html5Qrcode) {
            showStatus(scannerStatus, 'Libreria scanner QR non caricata. Usa la ricerca manuale.', 'error');
            return;
        }
        try {
            if (!html5QrScanner) {
                html5QrScanner = new window.Html5Qrcode('qr-reader');
            }
            await html5QrScanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 230, height: 230 } },
                async (decodedText) => {
                    playScanBeep();
                    await stopQrCamera();
                    await lookupAndDisplayCard(decodedText, true);
                },
                () => {}
            );
            isCameraRunning = true;
            startCameraBtn.style.display = 'none';
            stopCameraBtn.style.display = 'inline-flex';
        } catch (err) {
            showStatus(
                scannerStatus,
                'Impossibile avviare la fotocamera (verifica i permessi del browser o carica una foto del QR).',
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
        if (startCameraBtn) startCameraBtn.style.display = 'inline-flex';
        if (stopCameraBtn) stopCameraBtn.style.display = 'none';
    }

    startCameraBtn?.addEventListener('click', startQrCamera);
    stopCameraBtn?.addEventListener('click', stopQrCamera);

    // Scansione QR da file immagine
    qrFileInput?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        clearStatus(scannerStatus);
        await stopQrCamera();

        try {
            if (!html5QrScanner) {
                html5QrScanner = new window.Html5Qrcode('qr-reader');
            }
            const decodedText = await html5QrScanner.scanFile(file, true);
            playScanBeep();
            await lookupAndDisplayCard(decodedText, true);
        } catch (_) {
            showStatus(scannerStatus, 'Nessun QR Code valido rilevato nell\'immagine selezionata.', 'error');
        }
    });

    // Ricerca manuale per Codice Card, Cognome o Email
    manualLookupForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = manualCodeInput.value.trim();
        if (!q) return;
        await lookupAndDisplayCard(q, false);
    });

    loadSampleRossiBtn?.addEventListener('click', async () => {
        await lookupAndDisplayCard('PR-FAM-ROSSI81', false);
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
                fromQr
                    ? `QR Code riconosciuto: ${bundle.card.family_name} (${bundle.card.card_code})`
                    : `Card caricata: ${bundle.card.family_name} (${bundle.card.card_code})`,
                'success'
            );
        } catch (err) {
            showStatus(scannerStatus, err.message || 'Card Famiglia non trovata.', 'error');
        }
    }

    function renderAdminCategorySummary(containerId, state, iconClass) {
        const box = document.getElementById(containerId);
        if (!box) return;

        let windowInfoHtml = '';
        if (state.isCycleActive && state.expiresAt) {
            windowInfoHtml = `<span style="color:#7ee787; display:block; margin-top:6px; font-size:0.8rem;">
                <i class="fas fa-clock" aria-hidden="true"></i> Entro 3 mesi: scade il <strong>${formatDateIT(state.expiresAt)}</strong> (${state.daysRemaining} gg rimasti)
            </span>`;
        } else if (state.wasExpired) {
            windowInfoHtml = `<span style="color:#ffca80; display:block; margin-top:6px; font-size:0.8rem;">
                <i class="fas fa-history" aria-hidden="true"></i> Finestra 3 mesi scaduta il ${formatDateIT(state.lastExpiresAt)} • Riparte dal 1° acquisto
            </span>`;
        } else if (state.wasCompleted) {
            windowInfoHtml = `<span style="color:#7ee787; display:block; margin-top:6px; font-size:0.8rem;">
                <i class="fas fa-sync-alt" aria-hidden="true"></i> Ciclo precedente completato (3/3) • Riparte dal 1° acquisto
            </span>`;
        } else {
            windowInfoHtml = `<span style="color:var(--text-muted); display:block; margin-top:6px; font-size:0.8rem;">
                Nessun ciclo attivo • Il 1° acquisto avvia i 3 mesi
            </span>`;
        }

        box.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.4rem;">
                <strong style="color:#fff; font-size:1rem;">
                    <i class="fas ${iconClass}" aria-hidden="true" style="color:var(--gold-solid); margin-right:6px;"></i>
                    ${state.label}
                </strong>
                <span style="background:rgba(212,175,55,0.2); border:1px solid var(--gold-solid); color:var(--gold-solid); padding:3px 10px; border-radius:50px; font-weight:700; font-size:0.88rem;">
                    -${state.nextDiscountPercent}%
                </span>
            </div>
            <div style="font-size:0.88rem; color:#ddd;">
                Prossimo step: <strong>${state.nextPurchaseNumber}° Acquisto su 3</strong>
            </div>
            ${windowInfoHtml}
        `;
    }

    function renderScannedCardBundle(bundle) {
        if (!bundle || !bundle.card) return;
        emptyScanPlaceholder.hidden = true;
        scannedCardPanel.hidden = false;

        const { card, members } = bundle;

        document.getElementById('admin-card-family').textContent = card.family_name;
        document.getElementById('admin-card-code').textContent = card.card_code;
        document.getElementById('admin-card-contact').textContent =
            `Titolare: ${card.holder_name} • Email: ${card.holder_email}${card.holder_phone ? ' • Tel: ' + card.holder_phone : ''}`;

        // Badge membri registrati
        const badgesContainer = document.getElementById('admin-members-badges');
        badgesContainer.innerHTML = '';
        purchaseMemberSelect.innerHTML = '';

        members.forEach((m) => {
            const roleMeta = CARD_RULES.roles[m.role] || CARD_RULES.roles.genitore;
            const badge = document.createElement('span');
            badge.style.cssText =
                'display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:50px; background:rgba(212,175,55,0.12); border:1px solid rgba(212,175,55,0.35); font-size:0.85rem; color:#fff;';
            badge.innerHTML = `<i class="fas ${roleMeta.icon}" aria-hidden="true" style="color:var(--gold-solid);"></i> <strong></strong> <span style="color:var(--gold-solid); font-size:0.75rem;">(${roleMeta.label})</span>`;
            badge.querySelector('strong').textContent = m.full_name;
            badgesContainer.appendChild(badge);

            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = `${m.full_name} (${roleMeta.label}${m.is_holder ? ' - Titolare' : ''})`;
            purchaseMemberSelect.appendChild(opt);
        });

        const jewelryState = computeCategoryCycleState('gioielleria', card.jewelry_step, card.jewelry_cycle_started_at);
        const opticsState = computeCategoryCycleState('ottica', card.optics_step, card.optics_cycle_started_at);

        renderAdminCategorySummary('admin-jewelry-summary', jewelryState, 'fa-gem');
        renderAdminCategorySummary('admin-optics-summary', opticsState, 'fa-glasses');

        updateLivePricePreview();
    }

    function getSelectedCategory() {
        const checked = recordPurchaseForm?.querySelector('input[name="purchase_category"]:checked');
        return checked ? checked.value : 'gioielleria';
    }

    function updateLivePricePreview() {
        if (!currentCardBundle || !currentCardBundle.card) return;
        const card = currentCardBundle.card;
        const category = getSelectedCategory();

        // Mostra/nascondi obbligo conferma esclusione lenti a contatto per Ottica
        if (opticsExclusionBox) {
            opticsExclusionBox.hidden = category !== 'ottica';
        }

        const state =
            category === 'gioielleria'
                ? computeCategoryCycleState('gioielleria', card.jewelry_step, card.jewelry_cycle_started_at)
                : computeCategoryCycleState('ottica', card.optics_step, card.optics_cycle_started_at);

        const badgeEl = document.getElementById('preview-discount-badge');
        const finalPriceEl = document.getElementById('preview-final-price');

        if (badgeEl) {
            badgeEl.textContent = `${state.nextPurchaseNumber}° Acquisto ${state.label} (-${state.nextDiscountPercent}%)`;
        }

        const rawAmount = parseFloat(purchaseOriginalAmount?.value || '');
        if (!Number.isNaN(rawAmount) && rawAmount > 0) {
            const discounted = (rawAmount * (100 - state.nextDiscountPercent)) / 100;
            const saved = rawAmount - discounted;
            finalPriceEl.textContent = `${formatCurrencyEUR(discounted)} (Risparmio: ${formatCurrencyEUR(saved)})`;
        } else {
            finalPriceEl.textContent = `Sconto -${state.nextDiscountPercent}%`;
        }
    }

    recordPurchaseForm?.querySelectorAll('input[name="purchase_category"]').forEach((radio) => {
        radio.addEventListener('change', updateLivePricePreview);
    });
    purchaseOriginalAmount?.addEventListener('input', updateLivePricePreview);

    // Invio Registrazione Acquisto in Cassa
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
                'Per registrare un acquisto di Ottica devi confermare che NON si tratta di lenti a contatto (escluse dalla promozione).',
                'error'
            );
            opticsNoContactsCheck.focus();
            return;
        }

        const memberId = purchaseMemberSelect.value;
        const originalAmount = purchaseOriginalAmount.value;
        const notes = purchaseNotes.value;

        recordPurchaseBtn.disabled = true;
        try {
            const result = await PasianCardService.recordPurchase({
                cardId: currentCardBundle.card.id,
                memberId,
                category,
                originalAmount,
                notes
            });

            // Ricarica la Card aggiornata e le tabelle
            const updatedBundle = await PasianCardService.findCardByQuery(currentCardBundle.card.card_code);
            currentCardBundle = updatedBundle;
            renderScannedCardBundle(updatedBundle);

            purchaseOriginalAmount.value = '';
            purchaseNotes.value = '';
            opticsNoContactsCheck.checked = false;
            updateLivePricePreview();

            showStatus(
                recordPurchaseStatus,
                `Acquisto registrato! Applicato il ${result.discount_percent}% di sconto (${result.purchase_number_in_cycle}° acquisto ${category === 'gioielleria' ? 'Gioielleria' : 'Ottica'}). Scadenza ciclo 3 mesi: ${formatDateIT(result.cycle_expires_at)}.`,
                'success'
            );

            await loadAdminTables();
        } catch (err) {
            showStatus(recordPurchaseStatus, err.message || 'Errore nella registrazione dell\'acquisto.', 'error');
        } finally {
            recordPurchaseBtn.disabled = false;
        }
    });

    async function loadAdminTables() {
        const cardsTbody = document.getElementById('admin-all-cards-tbody');
        const purchasesTbody = document.getElementById('admin-recent-purchases-tbody');
        if (!cardsTbody || !purchasesTbody) return;

        try {
            const { cards, members, purchases } = await PasianCardService.listAllCardsAndRecentPurchases();

            cardsTbody.innerHTML = '';
            if (!cards.length) {
                cardsTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:1.5rem;">Nessuna Card Famiglia registrata.</td></tr>`;
            } else {
                cards.forEach((c) => {
                    const cardMembers = members.filter((m) => m.card_id === c.id);
                    const jState = computeCategoryCycleState('gioielleria', c.jewelry_step, c.jewelry_cycle_started_at);
                    const oState = computeCategoryCycleState('ottica', c.optics_step, c.optics_cycle_started_at);

                    const tr = document.createElement('tr');

                    const thCode = document.createElement('th');
                    thCode.scope = 'row';
                    const codeEl = document.createElement('code');
                    codeEl.style.color = 'var(--gold-solid)';
                    codeEl.style.fontWeight = '700';
                    codeEl.textContent = c.card_code;
                    thCode.appendChild(codeEl);

                    const tdFam = document.createElement('td');
                    tdFam.style.fontWeight = '600';
                    tdFam.textContent = c.family_name;

                    const tdContact = document.createElement('td');
                    tdContact.textContent = `${c.holder_name} (${c.holder_email})`;

                    const tdMembers = document.createElement('td');
                    tdMembers.textContent = `${cardMembers.length} membri (${cardMembers.map((m) => m.full_name).join(', ')})`;

                    const tdJewelry = document.createElement('td');
                    tdJewelry.textContent = `Prossimo: ${jState.nextPurchaseNumber}° (-${jState.nextDiscountPercent}%)`;

                    const tdOptics = document.createElement('td');
                    tdOptics.textContent = `Prossimo: ${oState.nextPurchaseNumber}° (-${oState.nextDiscountPercent}%)`;

                    const tdAction = document.createElement('td');
                    const openBtn = document.createElement('button');
                    openBtn.type = 'button';
                    openBtn.className = 'btn-secondary-gold';
                    openBtn.style.padding = '0.45rem 0.9rem';
                    openBtn.style.minBlockSize = '38px';
                    openBtn.style.fontSize = '0.78rem';
                    openBtn.innerHTML = '<i class="fas fa-qrcode" aria-hidden="true"></i> Apri in Cassa';
                    openBtn.addEventListener('click', () => {
                        lookupAndDisplayCard(c.card_code, false);
                        document.getElementById('scanned-card-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                    tdAction.appendChild(openBtn);

                    tr.append(thCode, tdFam, tdContact, tdMembers, tdJewelry, tdOptics, tdAction);
                    cardsTbody.appendChild(tr);
                });
            }

            purchasesTbody.innerHTML = '';
            if (!purchases.length) {
                purchasesTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:1.5rem;">Nessun acquisto registrato.</td></tr>`;
            } else {
                purchases.forEach((p) => {
                    const tr = document.createElement('tr');

                    const thDate = document.createElement('th');
                    thDate.scope = 'row';
                    thDate.textContent = formatDateIT(p.created_at, true);

                    const tdCat = document.createElement('td');
                    tdCat.textContent = p.category === 'gioielleria' ? '💎 Gioielleria' : '👓 Ottica (Occhiali)';

                    const tdMember = document.createElement('td');
                    tdMember.textContent = p.member_name;

                    const tdStep = document.createElement('td');
                    tdStep.textContent = `${p.purchase_number_in_cycle}° Acquisto`;

                    const tdDisc = document.createElement('td');
                    tdDisc.style.color = 'var(--gold-solid)';
                    tdDisc.style.fontWeight = '700';
                    tdDisc.textContent = `-${p.discount_percent}%`;

                    const tdPrice = document.createElement('td');
                    tdPrice.textContent =
                        p.final_amount !== null && p.final_amount !== undefined
                            ? `${formatCurrencyEUR(p.original_amount)} → ${formatCurrencyEUR(p.final_amount)}`
                            : '—';

                    const tdNotes = document.createElement('td');
                    tdNotes.style.color = 'var(--text-muted)';
                    tdNotes.textContent = p.notes || '—';

                    tr.append(thDate, tdCat, tdMember, tdStep, tdDisc, tdPrice, tdNotes);
                    purchasesTbody.appendChild(tr);
                });
            }
        } catch (err) {
            showStatus(scannerStatus, err.message, 'error');
        }
    }

    refreshAdminListsBtn?.addEventListener('click', loadAdminTables);

    // Navigazione rapida dalla barra inferiore stile App Mobile (Operatore)
    const adminMobileNavBtns = document.querySelectorAll('[data-admin-mobile-nav]');
    adminMobileNavBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            adminMobileNavBtns.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.getAttribute('data-admin-mobile-nav');

            if (adminWorkspaceSection.hidden) {
                adminLoginSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }

            if (target === 'scanner') {
                document.getElementById('qr-reader')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (target === 'cassa') {
                const targetEl = !scannedCardPanel.hidden ? scannedCardPanel : emptyScanPlaceholder;
                targetEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else if (target === 'famiglie') {
                document.getElementById('all-cards-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    async function refreshAdminView() {
        const user = await PasianCardService.getSessionUser();
        if (!user) {
            adminLoginSection.hidden = false;
            adminWorkspaceSection.hidden = true;
            return;
        }

        // In modalità Live Supabase richiede che l'utente sia presente in public.admin_users
        if (PasianCardService.isLiveSupabase() && !user.is_admin) {
            adminLoginSection.hidden = false;
            adminWorkspaceSection.hidden = true;
            showStatus(
                adminLoginStatus,
                `L'account ${user.email} è autenticato ma non è ancora abilitato come Admin. Esegui nel SQL Editor di Supabase: INSERT INTO public.admin_users (user_id, email) VALUES ('${user.id}', '${user.email}');`,
                'error'
            );
            return;
        }

        adminLoginSection.hidden = true;
        adminWorkspaceSection.hidden = false;
        document.getElementById('admin-logged-email').textContent = `Operatore attivo: ${user.email}`;

        await loadAdminTables();
    }

    await refreshAdminView();
});
