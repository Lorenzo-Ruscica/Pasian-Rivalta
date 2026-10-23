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

    const demoBanner = document.getElementById('demo-banner');
    const demoFillRossiBtn = document.getElementById('demo-fill-rossi-btn');
    const authSection = document.getElementById('auth-section');
    const dashboardSection = document.getElementById('dashboard-section');

    const tabSignin = document.getElementById('tab-signin');
    const tabSignup = document.getElementById('tab-signup');
    const panelSignin = document.getElementById('panel-signin');
    const panelSignup = document.getElementById('panel-signup');

    const signinForm = document.getElementById('signin-form');
    const signinSubmitBtn = document.getElementById('signin-submit-btn');
    const signinStatus = document.getElementById('signin-status');
    const forgotPasswordBtn = document.getElementById('forgot-password-btn');

    const signupForm = document.getElementById('signup-form');
    const signupSubmitBtn = document.getElementById('signup-submit-btn');
    const signupStatus = document.getElementById('signup-status');
    const additionalMembersList = document.getElementById('additional-members-list');

    const confirmDialog = document.getElementById('confirm-registration-dialog');
    const confirmMembersPreview = document.getElementById('confirm-members-preview');
    const cancelConfirmDialogBtn = document.getElementById('cancel-confirm-dialog-btn');
    const proceedConfirmDialogBtn = document.getElementById('proceed-confirm-dialog-btn');

    const qrFullscreenDialog = document.getElementById('qr-fullscreen-dialog');
    const openFullscreenQrBtn = document.getElementById('open-fullscreen-qr-btn');
    const downloadQrBtn = document.getElementById('download-qr-btn');
    const signoutBtn = document.getElementById('signout-btn');
    const gotoAdminLink = document.getElementById('goto-admin-link');

    let pendingRegistrationPayload = null;
    let memberRowCounter = 0;

    if (!PasianCardService.isLiveSupabase() && demoBanner) {
        demoBanner.style.display = 'flex';
    }

    // Toggle Tab Accedi / Registra Famiglia
    function switchAuthTab(mode) {
        const isSignin = mode === 'signin';
        tabSignin.setAttribute('aria-selected', isSignin ? 'true' : 'false');
        tabSignup.setAttribute('aria-selected', isSignin ? 'false' : 'true');
        panelSignin.hidden = !isSignin;
        panelSignup.hidden = isSignin;
    }

    tabSignin?.addEventListener('click', () => switchAuthTab('signin'));
    tabSignup?.addEventListener('click', () => switchAuthTab('signup'));

    // Pulsante Mostra / Nascondi Password
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

    // Costruttore dinamico Membri del Nucleo Famigliare (Genitori, Figli, Nonni)
    function addFamilyMemberRow(role = 'figlio') {
        memberRowCounter += 1;
        const rowId = `member-row-${memberRowCounter}`;
        const nameInputId = `member-name-${memberRowCounter}`;
        const birthInputId = `member-birth-${memberRowCounter}`;
        const roleMeta = CARD_RULES.roles[role] || CARD_RULES.roles.figlio;

        const row = document.createElement('div');
        row.className = 'member-builder-row';
        row.id = rowId;
        row.dataset.memberRole = role;

        row.innerHTML = `
            <div class="member-builder-header">
                <span class="member-role-tag">
                    <i class="fas ${roleMeta.icon}" aria-hidden="true"></i>
                    ${roleMeta.label}
                </span>
                <button type="button" class="remove-member-btn" aria-label="Rimuovi questo componente">
                    <i class="fas fa-trash-alt" aria-hidden="true"></i> Rimuovi
                </button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 1rem;">
                <div class="field" style="margin-block-end: 0;">
                    <label for="${nameInputId}">Nome e Cognome (${roleMeta.label}) <span class="required-star" aria-hidden="true">*</span></label>
                    <input
                        type="text"
                        id="${nameInputId}"
                        name="member_full_name_${memberRowCounter}"
                        class="pf-input member-fullname-input"
                        required
                        maxlength="100"
                        enterkeyhint="next"
                    >
                    <div class="error-msg">
                        <span aria-hidden="true">❌</span> Inserisci nome e cognome del familiare.
                    </div>
                </div>
                <div class="field" style="margin-block-end: 0;">
                    <label for="${birthInputId}">Data di nascita (opzionale)</label>
                    <input
                        type="date"
                        id="${birthInputId}"
                        name="member_birth_date_${memberRowCounter}"
                        class="pf-input member-birthdate-input"
                    >
                </div>
            </div>
        `;

        row.querySelector('.remove-member-btn').addEventListener('click', () => {
            row.remove();
        });

        additionalMembersList.appendChild(row);
        row.querySelector('.member-fullname-input')?.focus();
    }

    document.querySelectorAll('[data-add-member-role]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const role = btn.getAttribute('data-add-member-role');
            addFamilyMemberRow(role);
        });
    });

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

    // Accesso rapido Demo Famiglia Rossi
    demoFillRossiBtn?.addEventListener('click', async () => {
        try {
            await PasianCardService.signIn('famiglia.rossi@esempio.it', 'RossiPassword1!');
            await refreshPortalState();
        } catch (err) {
            showStatus(signinStatus, err.message, 'error');
        }
    });

    // Gestione Login
    signinForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearStatus(signinStatus);

        if (!signinForm.checkValidity()) {
            const firstInvalid = signinForm.querySelector(':invalid');
            firstInvalid?.focus();
            return;
        }

        const email = document.getElementById('login-email').value;
        const password = document.getElementById('current-password').value;

        signinSubmitBtn.disabled = true;
        try {
            await PasianCardService.signIn(email, password);
            await refreshPortalState();
        } catch (err) {
            showStatus(signinStatus, err.message || 'Errore durante l\'accesso.', 'error');
        } finally {
            signinSubmitBtn.disabled = false;
        }
    });

    // Recupero Password
    forgotPasswordBtn?.addEventListener('click', async () => {
        const emailInput = document.getElementById('login-email');
        const email = emailInput?.value?.trim();
        if (!email) {
            showStatus(signinStatus, 'Inserisci prima il tuo indirizzo email nel campo qui sopra per ricevere il link di recupero password.', 'error');
            emailInput?.focus();
            return;
        }
        try {
            await PasianCardService.resetPassword(email);
            showStatus(signinStatus, `Se l'indirizzo ${email} è registrato, riceverai a breve un'email con le istruzioni per reimpostare la password.`, 'success');
        } catch (err) {
            showStatus(signinStatus, err.message, 'error');
        }
    });

    // Gestione Registrazione Unica Fase (con Dialog di conferma nucleo famigliare)
    signupForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        clearStatus(signupStatus);

        if (!signupForm.checkValidity()) {
            const firstInvalid = signupForm.querySelector(':invalid');
            firstInvalid?.focus();
            return;
        }

        const familyName = document.getElementById('family-name').value.trim();
        const holderName = document.getElementById('holder-name').value.trim();
        const holderRoleRadio = signupForm.querySelector('input[name="holder_role"]:checked');
        const holderRole = holderRoleRadio ? holderRoleRadio.value : 'genitore';
        const holderPhone = document.getElementById('holder-phone').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('new-password').value;

        const additionalMembers = [];
        additionalMembersList.querySelectorAll('.member-builder-row').forEach((row) => {
            const nameVal = row.querySelector('.member-fullname-input')?.value?.trim();
            const birthVal = row.querySelector('.member-birthdate-input')?.value || null;
            const roleVal = row.dataset.memberRole || 'figlio';
            if (nameVal) {
                additionalMembers.push({
                    full_name: nameVal,
                    role: roleVal,
                    birth_date: birthVal
                });
            }
        });

        pendingRegistrationPayload = {
            email,
            password,
            familyName,
            holderName,
            holderPhone,
            holderRole,
            holderBirthDate: null,
            additionalMembers
        };

        // Popola anteprima membri nel Dialog di conferma
        confirmMembersPreview.innerHTML = '';
        const holderLi = document.createElement('li');
        const holderRoleLabel = CARD_RULES.roles[holderRole]?.label || 'Genitore';
        holderLi.innerHTML = `<strong></strong> — ${holderRoleLabel} (Titolare Card)`;
        holderLi.querySelector('strong').textContent = holderName;
        confirmMembersPreview.appendChild(holderLi);

        additionalMembers.forEach((m) => {
            const li = document.createElement('li');
            const rLabel = CARD_RULES.roles[m.role]?.label || m.role;
            li.innerHTML = `<strong></strong> — ${rLabel}`;
            li.querySelector('strong').textContent = m.full_name;
            confirmMembersPreview.appendChild(li);
        });

        if (additionalMembers.length === 0) {
            const noteLi = document.createElement('li');
            noteLi.style.color = '#ffca80';
            noteLi.textContent = 'Attenzione: non hai aggiunto altri membri oltre a te. Ricorda che non potrai aggiungerne dopo la conferma.';
            confirmMembersPreview.appendChild(noteLi);
        }

        if (typeof confirmDialog.showModal === 'function') {
            confirmDialog.showModal();
        } else {
            executeConfirmedRegistration();
        }
    });

    cancelConfirmDialogBtn?.addEventListener('click', () => {
        confirmDialog.close();
    });

    async function executeConfirmedRegistration() {
        if (!pendingRegistrationPayload) return;
        confirmDialog.close();
        signupSubmitBtn.disabled = true;
        proceedConfirmDialogBtn.disabled = true;

        try {
            const res = await PasianCardService.registerFamilyInOnePhase(pendingRegistrationPayload);
            if (res.requiresEmailConfirmation) {
                showStatus(
                    signupStatus,
                    'Registrazione inviata! Controlla la tua casella email e clicca sul link di conferma per attivare la Card Famiglia e visualizzare il QR Code.',
                    'success'
                );
            } else {
                await refreshPortalState();
            }
        } catch (err) {
            showStatus(signupStatus, err.message || 'Errore durante la registrazione.', 'error');
        } finally {
            signupSubmitBtn.disabled = false;
            proceedConfirmDialogBtn.disabled = false;
        }
    }

    proceedConfirmDialogBtn?.addEventListener('click', executeConfirmedRegistration);

    // Logout
    signoutBtn?.addEventListener('click', async () => {
        await PasianCardService.signOut();
        await refreshPortalState();
    });

    // Generazione QR Code ad alto contrasto
    function renderQrCode(container, payloadText, sizePx = 160) {
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
            fallback.style.color = '#000';
            fallback.style.fontWeight = '700';
            fallback.style.fontSize = '0.85rem';
            fallback.textContent = payloadText;
            container.appendChild(fallback);
        }
    }

    // Scarica QR Code come immagine PNG
    downloadQrBtn?.addEventListener('click', () => {
        const qrContainer = document.getElementById('card-qr-container');
        const canvas = qrContainer?.querySelector('canvas');
        const img = qrContainer?.querySelector('img');
        const codeText = document.getElementById('card-code-display')?.textContent || 'card-famiglia';

        let dataUrl = null;
        if (canvas) {
            dataUrl = canvas.toDataURL('image/png');
        } else if (img && img.src) {
            dataUrl = img.src;
        }

        if (dataUrl) {
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `Pasian-Rivalta-${codeText}.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
        }
    });

    openFullscreenQrBtn?.addEventListener('click', () => {
        if (qrFullscreenDialog && typeof qrFullscreenDialog.showModal === 'function') {
            qrFullscreenDialog.showModal();
        }
    });

    // Renderizza il pannello stato ciclo 3 mesi per una categoria (Gioielleria / Ottica)
    function renderCategoryCycleBox(state, tiersContainerId, nextBadgeId, countdownBoxId) {
        const tiersContainer = document.getElementById(tiersContainerId);
        const nextBadge = document.getElementById(nextBadgeId);
        const countdownBox = document.getElementById(countdownBoxId);

        if (nextBadge) {
            nextBadge.textContent = `Prossimo (${state.nextPurchaseNumber}° Acq.): -${state.nextDiscountPercent}%`;
        }

        if (tiersContainer) {
            tiersContainer.innerHTML = '';
            state.tiers.forEach((pct, idx) => {
                const stepNum = idx + 1;
                const pill = document.createElement('div');
                pill.className = 'tier-pill';

                if (stepNum <= state.completedInActiveCycle) {
                    pill.classList.add('completed-tier');
                } else if (stepNum === state.nextPurchaseNumber) {
                    pill.classList.add('active-tier');
                }

                pill.innerHTML = `
                    <span class="tier-step-label">${stepNum}° Acquisto</span>
                    <span class="tier-discount-value">-${pct}%</span>
                `;
                tiersContainer.appendChild(pill);
            });
        }

        if (countdownBox) {
            if (state.isCycleActive && state.expiresAt) {
                countdownBox.className = 'countdown-banner active-window';
                countdownBox.innerHTML = `
                    <i class="fas fa-hourglass-half" aria-hidden="true" style="color:var(--gold-solid);"></i>
                    <span>
                        <strong>Finestra 3 mesi attiva:</strong> hai tempo fino al <strong>${formatDateIT(state.expiresAt)}</strong>
                        (${state.daysRemaining} giorni rimasti) per usufruire dello sconto del <strong>${state.nextDiscountPercent}%</strong> sul ${state.nextPurchaseNumber}° acquisto.
                    </span>
                `;
            } else if (state.wasCompleted) {
                countdownBox.className = 'countdown-banner';
                countdownBox.innerHTML = `
                    <i class="fas fa-sync-alt" aria-hidden="true" style="color:var(--gold-solid);"></i>
                    <span>
                        Ciclo di 3 acquisti completato! Il tuo prossimo acquisto avvierà un nuovo ciclo di 3 mesi partendo dal <strong>1° acquisto (-${state.tiers[0]}%)</strong>.
                    </span>
                `;
            } else if (state.wasExpired) {
                countdownBox.className = 'countdown-banner';
                countdownBox.innerHTML = `
                    <i class="fas fa-history" aria-hidden="true" style="color:var(--gold-solid);"></i>
                    <span>
                        I 3 mesi dal precedente 1° acquisto (${formatDateIT(state.lastExpiresAt)}) sono trascorsi. Il prossimo acquisto riparte dal <strong>1° sconto (-${state.tiers[0]}%)</strong> e attiva 3 nuovi mesi.
                    </span>
                `;
            } else {
                countdownBox.className = 'countdown-banner';
                countdownBox.innerHTML = `
                    <i class="fas fa-sparkles" aria-hidden="true" style="color:var(--gold-solid);"></i>
                    <span>
                        Al tuo <strong>1° acquisto</strong> avrai subito il <strong>${state.tiers[0]}% di sconto</strong> e da quella data partiranno i <strong>3 mesi</strong> per ottenere il ${state.tiers[1]}% e il ${state.tiers[2]}%.
                    </span>
                `;
            }
        }
    }

    // Aggiorna la vista tra Login/Registrazione e Dashboard Card Famiglia
    async function refreshPortalState() {
        const user = await PasianCardService.getSessionUser();
        if (!user) {
            authSection.hidden = false;
            dashboardSection.hidden = true;
            return;
        }

        const bundle = await PasianCardService.getMyFamilyCardBundle();
        if (!bundle || !bundle.card) {
            authSection.hidden = false;
            dashboardSection.hidden = true;
            return;
        }

        authSection.hidden = true;
        dashboardSection.hidden = false;

        const { card, members, purchases } = bundle;

        document.getElementById('dashboard-user-email').textContent = `Account: ${user.email}`;
        if (gotoAdminLink) {
            gotoAdminLink.style.display = (user.is_admin || !PasianCardService.isLiveSupabase()) ? 'inline-flex' : 'none';
        }

        document.getElementById('card-family-name').textContent = card.family_name;
        document.getElementById('card-code-display').textContent = card.card_code;
        document.getElementById('card-holder-display').textContent = card.holder_name;
        document.getElementById('card-created-display').textContent = formatDateIT(card.created_at);

        const qrPayload = buildQrPayload(card.card_code);
        renderQrCode(document.getElementById('card-qr-container'), qrPayload, 160);
        renderQrCode(document.getElementById('qr-fullscreen-container'), qrPayload, 240);
        document.getElementById('qr-dialog-family').textContent = card.family_name;
        document.getElementById('qr-dialog-code').textContent = card.card_code;

        // Calcola e mostra lo stato per Gioielleria e Ottica
        const jewelryState = computeCategoryCycleState('gioielleria', card.jewelry_step, card.jewelry_cycle_started_at);
        const opticsState = computeCategoryCycleState('ottica', card.optics_step, card.optics_cycle_started_at);

        renderCategoryCycleBox(jewelryState, 'jewelry-tiers-visual', 'jewelry-next-badge', 'jewelry-countdown-box');
        renderCategoryCycleBox(opticsState, 'optics-tiers-visual', 'optics-next-badge', 'optics-countdown-box');

        // Renderizza Membri del Nucleo Famigliare
        const membersGrid = document.getElementById('registered-members-grid');
        membersGrid.innerHTML = '';
        members.forEach((m) => {
            const roleMeta = CARD_RULES.roles[m.role] || CARD_RULES.roles.genitore;
            const item = document.createElement('div');
            item.className = 'member-card-item';

            const iconDiv = document.createElement('div');
            iconDiv.className = 'member-avatar-icon';
            iconDiv.setAttribute('aria-hidden', 'true');
            iconDiv.innerHTML = `<i class="fas ${roleMeta.icon}"></i>`;

            const infoDiv = document.createElement('div');
            infoDiv.className = 'member-info';

            const h4 = document.createElement('h4');
            h4.textContent = m.full_name;

            const span = document.createElement('span');
            span.textContent = m.is_holder ? `${roleMeta.label} • Titolare` : roleMeta.label;

            infoDiv.appendChild(h4);
            infoDiv.appendChild(span);

            if (m.birth_date) {
                const bdateP = document.createElement('p');
                bdateP.style.fontSize = '0.78rem';
                bdateP.style.color = 'var(--text-muted)';
                bdateP.style.marginTop = '2px';
                bdateP.textContent = `Nato/a il ${formatDateIT(m.birth_date)}`;
                infoDiv.appendChild(bdateP);
            }

            item.appendChild(iconDiv);
            item.appendChild(infoDiv);
            membersGrid.appendChild(item);
        });

        // Renderizza Storico Acquisti
        const tbody = document.getElementById('customer-purchases-tbody');
        tbody.innerHTML = '';
        if (!purchases.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nessun acquisto ancora registrato sulla tua Card Famiglia.</td>`;
            tbody.appendChild(tr);
        } else {
            purchases.forEach((p) => {
                const tr = document.createElement('tr');
                const catLabel = p.category === 'gioielleria' ? '💎 Gioielleria' : '👓 Ottica (Occhiali)';

                const thDate = document.createElement('th');
                thDate.scope = 'row';
                thDate.textContent = formatDateIT(p.created_at, true);

                const tdCat = document.createElement('td');
                tdCat.textContent = catLabel;

                const tdMember = document.createElement('td');
                tdMember.textContent = p.member_name;

                const tdStep = document.createElement('td');
                tdStep.textContent = `${p.purchase_number_in_cycle}° Acquisto`;

                const tdDiscount = document.createElement('td');
                tdDiscount.style.color = 'var(--gold-solid)';
                tdDiscount.style.fontWeight = '700';
                tdDiscount.textContent = `-${p.discount_percent}%`;

                const tdAmount = document.createElement('td');
                if (p.final_amount !== null && p.final_amount !== undefined) {
                    tdAmount.textContent = `${formatCurrencyEUR(p.final_amount)} (da ${formatCurrencyEUR(p.original_amount)})`;
                } else {
                    tdAmount.textContent = '—';
                }

                const tdNotes = document.createElement('td');
                tdNotes.style.color = 'var(--text-muted)';
                tdNotes.textContent = p.notes || '—';

                tr.append(thDate, tdCat, tdMember, tdStep, tdDiscount, tdAmount, tdNotes);
                tbody.appendChild(tr);
            });
        }
    }

    // Navigazione rapida dalla barra inferiore stile App Mobile
    const mobileNavButtons = document.querySelectorAll('[data-mobile-nav]');
    mobileNavButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            mobileNavButtons.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.getAttribute('data-mobile-nav');

            if (!dashboardSection.hidden) {
                if (target === 'card') {
                    document.querySelector('.luxury-vip-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else if (target === 'sconti') {
                    document.getElementById('jewelry-cycle-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else if (target === 'famiglia') {
                    document.getElementById('members-section-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            } else {
                if (target === 'card') {
                    switchAuthTab('signin');
                    authSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else if (target === 'sconti') {
                    document.querySelector('.rules-showcase-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else if (target === 'famiglia') {
                    switchAuthTab('signup');
                    authSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    });

    await refreshPortalState();
});
