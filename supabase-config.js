/**
 * PASIAN RIVALTA - Configurazione Supabase & Motore Regole "Card Famiglia"
 * =========================================================================
 * ISTRUZIONI:
 * 1. Crea un progetto gratuito su https://supabase.com
 * 2. Esegui il contenuto di `supabase-schema.sql` nel SQL Editor di Supabase
 * 3. Vai su Project Settings -> API e incolla qui sotto `SUPABASE_URL` e `SUPABASE_ANON_KEY`
 *
 * Finché i valori restano impostati sui segnaposto, il sistema funziona in
 * "Modalità Demo Locale" (salvando su localStorage) così puoi testare subito
 * registrazione, QR code, scanner fotocamera e calcolo sconti.
 */

const SUPABASE_CONFIG = {
    url: 'https://kavxkjpfmxwfvbdnbvzc.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImthdnhranBmbXh3ZnZiZG5idnpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMTY1MzAsImV4cCI6MjEwOTg5MjUzMH0.8dWkf0xEs70XborXUHCfj62vHorNaa0uX4nd5KVUcg4'
};

const CARD_RULES = {
    gioielleria: {
        id: 'gioielleria',
        label: 'Gioielleria',
        subtitle: 'Gioielli, Diamanti & Orologeria',
        tiers: [10, 15, 20],
        exclusionNote: null,
        windowMonths: 3
    },
    ottica: {
        id: 'ottica',
        label: 'Ottica (Occhiali)',
        subtitle: 'Occhiali da Vista e da Sole',
        tiers: [15, 20, 25],
        exclusionNote: 'Sono escluse le lenti a contatto',
        windowMonths: 3
    },
    roles: {
        genitore: { label: 'Genitore', icon: 'fa-user-tie' },
        figlio: { label: 'Figlio / Figlia', icon: 'fa-child' },
        nonno: { label: 'Nonno / Nonna', icon: 'fa-user-shield' }
    }
};

function isSupabaseConfigured() {
    return (
        Boolean(SUPABASE_CONFIG.url) &&
        Boolean(SUPABASE_CONFIG.anonKey) &&
        !SUPABASE_CONFIG.url.includes('INSERISCI_QUI') &&
        !SUPABASE_CONFIG.anonKey.includes('INSERISCI_QUI') &&
        SUPABASE_CONFIG.url.startsWith('http')
    );
}

let supabaseClientInstance = null;
function getSupabaseClient() {
    if (!isSupabaseConfigured()) return null;
    if (!supabaseClientInstance && window.supabase && typeof window.supabase.createClient === 'function') {
        supabaseClientInstance = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    }
    return supabaseClientInstance;
}

/**
 * Calcola la data di scadenza aggiungendo esattamente 3 mesi solari alla data del 1° acquisto.
 */
function addThreeMonths(dateInput) {
    if (!dateInput) return null;
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return null;
    const result = new Date(d.getTime());
    result.setMonth(result.getMonth() + 3);
    return result;
}

/**
 * Motore di calcolo dello stato sconti per ciascuna categoria (Gioielleria / Ottica)
 * Regole:
 * - 1° acquisto: avvia la finestra di 3 mesi (10% Gioielleria / 15% Ottica)
 * - 2° acquisto entro 3 mesi: 15% Gioielleria / 20% Ottica
 * - 3° acquisto entro 3 mesi: 20% Gioielleria / 25% Ottica
 * - Dopo il 3° acquisto OPPURE allo scadere dei 3 mesi dal 1° acquisto:
 *   il ciclo si azzera e riparte dal 1° acquisto (10% Gioielleria / 15% Ottica).
 */
function computeCategoryCycleState(category, rawStep, rawCycleStartedAt, nowDate = new Date()) {
    const rule = CARD_RULES[category] || CARD_RULES.gioielleria;
    const step = Number(rawStep) || 0;
    const cycleStart = rawCycleStartedAt ? new Date(rawCycleStartedAt) : null;
    const expiresAt = cycleStart ? addThreeMonths(cycleStart) : null;

    const isExpired = Boolean(expiresAt && nowDate.getTime() > expiresAt.getTime());
    const wasCompleted = step >= 3;
    const wasExpired = step > 0 && step < 3 && isExpired;

    let nextPurchaseNumber = 1;
    let completedInActiveCycle = 0;
    let isCycleActive = false;

    if (step === 0 || wasCompleted || isExpired || !cycleStart) {
        nextPurchaseNumber = 1;
        completedInActiveCycle = 0;
        isCycleActive = false;
    } else {
        // step è 1 oppure 2 ed è dentro la finestra dei 3 mesi
        nextPurchaseNumber = step + 1;
        completedInActiveCycle = step;
        isCycleActive = true;
    }

    const nextDiscountPercent = rule.tiers[nextPurchaseNumber - 1];
    let daysRemaining = 0;
    if (isCycleActive && expiresAt) {
        const diffMs = expiresAt.getTime() - nowDate.getTime();
        daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    return {
        category: rule.id,
        label: rule.label,
        subtitle: rule.subtitle,
        tiers: rule.tiers,
        exclusionNote: rule.exclusionNote,
        rawStep: step,
        completedInActiveCycle,
        nextPurchaseNumber,
        nextDiscountPercent,
        isCycleActive,
        wasCompleted,
        wasExpired,
        cycleStartedAt: isCycleActive ? cycleStart : null,
        expiresAt: isCycleActive ? expiresAt : null,
        lastCycleStartedAt: cycleStart,
        lastExpiresAt: expiresAt,
        daysRemaining
    };
}

function formatDateIT(dateInput, includeTime = false) {
    if (!dateInput) return '—';
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return '—';
    const options = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    };
    if (includeTime) {
        options.hour = '2-digit';
        options.minute = '2-digit';
    }
    return d.toLocaleDateString('it-IT', options);
}

function formatCurrencyEUR(value) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) {
        return '—';
    }
    return new Intl.NumberFormat('it-IT', {
        style: 'currency',
        currency: 'EUR'
    }).format(Number(value));
}

function generateRandomCardCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'PR-FAM-';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Payload codificato nel QR Code della Card Famiglia
 */
function buildQrPayload(cardCode) {
    return `PASIAN_CARD:${String(cardCode || '').trim().toUpperCase()}`;
}

/**
 * Estrae il codice `PR-FAM-...` dalla stringa scansionata dal QR o digitata manualmente
 */
function parseQrOrCardInput(rawInput) {
    if (!rawInput) return '';
    const cleaned = String(rawInput).trim().toUpperCase();
    if (cleaned.startsWith('PASIAN_CARD:')) {
        return cleaned.replace('PASIAN_CARD:', '').trim();
    }
    try {
        const parsed = JSON.parse(rawInput);
        if (parsed && parsed.card_code) {
            return String(parsed.card_code).trim().toUpperCase();
        }
    } catch (_) {
        // Non è JSON, procedi con estrazione testo
    }
    const match = cleaned.match(/PR-FAM-[A-Z0-9]{4,12}/);
    if (match) return match[0];
    return cleaned;
}

/* ============================================================================
 * TRADUZIONE MESSAGGI D'ERRORE IN ITALIANO CHIARO
 * ============================================================================ */
function translateAuthErrorIT(rawMessage) {
    const msg = String(rawMessage || '').trim();
    const lower = msg.toLowerCase();

    if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
        return 'Email o password errata. Controlla i dati inseriti e riprova.';
    }
    if (lower.includes('user already registered') || lower.includes('already been registered')) {
        return 'Questa email è già registrata. Vai su "Accedi" per entrare.';
    }
    if (lower.includes('email not confirmed')) {
        return 'Email non ancora confermata.';
    }
    if (lower.includes('password should be at least')) {
        return 'La password deve avere almeno 8 caratteri.';
    }
    if (lower.includes('rate limit') || lower.includes('too many requests')) {
        return 'Troppi tentativi ravvicinati. Attendi qualche secondo e riprova.';
    }
    return msg || 'Si è verificato un errore. Riprova.';
}

/* ============================================================================
 * SERVIZIO LIVE SUPABASE
 * ============================================================================ */
const PasianCardService = {
    isLiveSupabase() {
        return isSupabaseConfigured();
    },

    async getSessionUser() {
        const sb = getSupabaseClient();
        if (!sb) return null;
        const { data, error } = await sb.auth.getUser();
        if (error || !data?.user) return null;
        const { data: adminRow } = await sb
            .from('admin_users')
            .select('user_id')
            .eq('user_id', data.user.id)
            .maybeSingle();
        return {
            id: data.user.id,
            email: data.user.email,
            is_admin: Boolean(adminRow)
        };
    },

    async signIn(email, password) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        if (!cleanEmail || !password) {
            throw new Error('Inserisci sia l\'email sia la password.');
        }
        const sb = getSupabaseClient();
        if (!sb) throw new Error('Database non raggiungibile.');

        const { error } = await sb.auth.signInWithPassword({
            email: cleanEmail,
            password
        });
        if (error) {
            throw new Error(translateAuthErrorIT(error.message));
        }
        return this.getSessionUser();
    },

    async signOut() {
        const sb = getSupabaseClient();
        if (sb) {
            await sb.auth.signOut();
        }
    },

    async resetPassword(email) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const sb = getSupabaseClient();
        if (sb) {
            const { error } = await sb.auth.resetPasswordForEmail(cleanEmail, {
                redirectTo: window.location.origin + '/card-famiglia.html'
            });
            if (error) throw new Error(translateAuthErrorIT(error.message));
            return true;
        }
        return true;
    },

    /**
     * Imposta o aggiorna la password per un account operatore di cassa (admin@pasianrivalta.it / operatore@pasianrivalta.it)
     * ed effettua subito l'accesso.
     */
    async setOperatorPassword(email, newPassword) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        if (!cleanEmail) throw new Error('Inserisci l\'email operatore.');
        if (!newPassword || newPassword.length < 8) {
            throw new Error('La password deve contenere almeno 8 caratteri.');
        }

        const sb = getSupabaseClient();
        if (!sb) throw new Error('Database non raggiungibile.');

        const { error } = await sb.rpc('set_operator_password', {
            p_email: cleanEmail,
            p_new_password: newPassword
        });
        if (error) throw new Error(translateAuthErrorIT(error.message));
        return this.signIn(cleanEmail, newPassword);
    },

    /**
     * Registrazione Completa in Un'Unica Fase:
     * Crea l'account Auth + la Card Famiglia + tutti i Membri (Genitori, Figli, Nonni) e blocca subito modifiche future per il cliente.
     */
    async registerFamilyInOnePhase({
        email,
        password,
        familyName,
        holderName,
        holderPhone,
        holderRole,
        holderBirthDate,
        additionalMembers
    }) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const sb = getSupabaseClient();
        if (!sb) throw new Error('Database non raggiungibile.');

        const { data: signUpData, error: signUpError } = await sb.auth.signUp({
            email: cleanEmail,
            password,
            options: {
                data: {
                    family_name: familyName,
                    holder_name: holderName,
                    holder_phone: holderPhone,
                    holder_role: holderRole,
                    holder_birth_date: holderBirthDate || null,
                    additional_members: additionalMembers || []
                }
            }
        });
        if (signUpError) throw new Error(translateAuthErrorIT(signUpError.message));

        let hasSession = Boolean(signUpData?.session);
        if (!hasSession) {
            const { data: signInData } = await sb.auth.signInWithPassword({
                email: cleanEmail,
                password
            });
            hasSession = Boolean(signInData?.session);
        }

        if (hasSession) {
            const { error: rpcError } = await sb.rpc('register_family_card', {
                p_family_name: familyName,
                p_holder_name: holderName,
                p_holder_email: cleanEmail,
                p_holder_phone: holderPhone || '',
                p_holder_role: holderRole || 'genitore',
                p_holder_birth_date: holderBirthDate || null,
                p_additional_members: additionalMembers || []
            });
            if (rpcError) throw new Error(translateAuthErrorIT(rpcError.message));
            return { requiresEmailConfirmation: false };
        }

        return { requiresEmailConfirmation: true };
    },

    /**
     * Recupera i dati completi della Card Famiglia dell'utente loggato
     */
    async getMyFamilyCardBundle() {
        const user = await this.getSessionUser();
        if (!user) return null;

        const sb = getSupabaseClient();
        if (!sb) return null;

        const { data: card, error } = await sb
            .from('family_cards')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_archived', false)
            .maybeSingle();

        if (error) throw new Error(translateAuthErrorIT(error.message));
        if (!card) return null;

        const [{ data: members }, { data: purchases }] = await Promise.all([
            sb
                .from('family_members')
                .select('*')
                .eq('card_id', card.id)
                .eq('is_archived', false)
                .order('is_holder', { ascending: false })
                .order('created_at', { ascending: true }),
            sb
                .from('card_purchases')
                .select('*')
                .eq('card_id', card.id)
                .eq('is_cancelled', false)
                .order('created_at', { ascending: false })
        ]);

        return {
            card,
            members: members || [],
            purchases: purchases || []
        };
    },

    /**
     * Cerca una Card Famiglia per codice QR, codice card, cognome o email (Solo Admin)
     */
    async findCardByQuery(rawQuery) {
        const cleanedCode = parseQrOrCardInput(rawQuery);
        const q = String(rawQuery || '').trim();
        if (!q) throw new Error('Inserisci o scansiona un codice Card Famiglia.');

        const sb = getSupabaseClient();
        if (!sb) throw new Error('Database non raggiungibile.');

        let { data: card } = await sb
            .from('family_cards')
            .select('*')
            .eq('card_code', cleanedCode)
            .eq('is_archived', false)
            .maybeSingle();

        if (!card) {
            const { data: matchedCards } = await sb
                .from('family_cards')
                .select('*')
                .eq('is_archived', false)
                .or(`family_name.ilike.%${q}%,holder_name.ilike.%${q}%,holder_email.ilike.%${q}%`)
                .limit(1);
            card = matchedCards?.[0] || null;
        }

        if (!card) {
            throw new Error(`Nessuna Card Famiglia trovata per "${q}".`);
        }

        const [{ data: members }, { data: purchases }] = await Promise.all([
            sb
                .from('family_members')
                .select('*')
                .eq('card_id', card.id)
                .eq('is_archived', false)
                .order('is_holder', { ascending: false })
                .order('created_at', { ascending: true }),
            sb
                .from('card_purchases')
                .select('*')
                .eq('card_id', card.id)
                .eq('is_cancelled', false)
                .order('created_at', { ascending: false })
        ]);

        return {
            card,
            members: members || [],
            purchases: purchases || []
        };
    },

    /**
     * Registra un acquisto dal pannello Admin e calcola/aggiorna automaticamente lo step e la finestra di 3 mesi
     */
    async recordPurchase({ cardId, memberId, category, originalAmount, notes }) {
        const sb = getSupabaseClient();
        if (!sb) throw new Error('Database non raggiungibile.');

        const parsedAmount = originalAmount !== '' && originalAmount !== null && originalAmount !== undefined
            ? Number(originalAmount)
            : null;

        const { data, error } = await sb.rpc('record_card_purchase', {
            p_card_id: cardId,
            p_member_id: memberId,
            p_category: category,
            p_original_amount: parsedAmount,
            p_notes: notes || null
        });
        if (error) throw new Error(translateAuthErrorIT(error.message));
        return data;
    },

    /**
     * Permessi Totali Admin: Aggiungi un componente al nucleo famigliare (Genitore, Figlio/a, Nonno/a)
     */
    async adminAddMember({ cardId, fullName, role }) {
        const sb = getSupabaseClient();
        if (!sb) throw new Error('Database non raggiungibile.');

        const { data, error } = await sb.rpc('admin_add_family_member', {
            p_card_id: cardId,
            p_full_name: fullName,
            p_role: role || 'figlio'
        });
        if (error) throw new Error(translateAuthErrorIT(error.message));
        return data;
    },

    /**
     * Permessi Totali Admin: Rimuovi un componente dal nucleo famigliare
     */
    async adminRemoveMember(memberId) {
        const sb = getSupabaseClient();
        if (!sb) throw new Error('Database non raggiungibile.');

        const { data, error } = await sb.rpc('admin_remove_family_member', {
            p_member_id: memberId
        });
        if (error) throw new Error(translateAuthErrorIT(error.message));
        return data;
    },

    /**
     * Permessi Totali Admin: Annulla/Rimuovi un acquisto e ripristina automaticamente lo sconto precedente
     */
    async adminCancelPurchase(purchaseId) {
        const sb = getSupabaseClient();
        if (!sb) throw new Error('Database non raggiungibile.');

        const { data, error } = await sb.rpc('admin_cancel_card_purchase', {
            p_purchase_id: purchaseId
        });
        if (error) throw new Error(translateAuthErrorIT(error.message));
        return data;
    },

    /**
     * Permessi Totali Admin: Modifica nome famiglia, titolare o telefono della Card
     */
    async adminUpdateCard({ cardId, familyName, holderName, holderPhone }) {
        const sb = getSupabaseClient();
        if (!sb) throw new Error('Database non raggiungibile.');

        const { data, error } = await sb.rpc('admin_update_family_card', {
            p_card_id: cardId,
            p_family_name: familyName,
            p_holder_name: holderName,
            p_holder_phone: holderPhone
        });
        if (error) throw new Error(translateAuthErrorIT(error.message));
        return data;
    },

    /**
     * Elenco di tutte le Card registrate e ultimi acquisti attivi (per dashboard Admin)
     */
    async listAllCardsAndRecentPurchases() {
        const sb = getSupabaseClient();
        if (!sb) return { cards: [], members: [], purchases: [] };

        const [{ data: cards }, { data: members }, { data: purchases }] = await Promise.all([
            sb
                .from('family_cards')
                .select('*')
                .eq('is_archived', false)
                .order('created_at', { ascending: false })
                .limit(50),
            sb
                .from('family_members')
                .select('*')
                .eq('is_archived', false),
            sb
                .from('card_purchases')
                .select('*')
                .eq('is_cancelled', false)
                .order('created_at', { ascending: false })
                .limit(30)
        ]);
        return {
            cards: cards || [],
            members: members || [],
            purchases: purchases || []
        };
    }
};

/* ============================================================================
 * ACCESSIBILITÀ & MODERN WEB GUIDANCE HELPERS
 * - Fallback WeakMap per :user-invalid + sincronizzazione aria-invalid
 * - Fallback per <dialog closedby="any">
 * ============================================================================ */
const UserInvalidFallback = (() => {
    const dirtyState = new WeakMap();

    const updateState = (input) => {
        if (!input || typeof input.checkValidity !== 'function') return;
        const isValid = input.checkValidity();

        input.classList.toggle('user-invalid-fallback', !isValid);
        input.classList.toggle('user-valid-fallback', isValid);

        if (!isValid) {
            input.setAttribute('aria-invalid', 'true');
        } else {
            input.removeAttribute('aria-invalid');
        }
    };

    const handleEvent = (event) => {
        const input = event.target;

        if (event.type === 'reset') {
            const controls = input.elements || [];
            for (const control of controls) {
                dirtyState.delete(control);
                control.classList.remove('user-invalid-fallback', 'user-valid-fallback');
                control.removeAttribute('aria-invalid');
            }
            return;
        }

        if (!input || typeof input.checkValidity !== 'function') return;

        if (event.type === 'input' || event.type === 'change') {
            const state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
            state.hasInteracted = true;
            dirtyState.set(input, state);
            if (state.hasBlurred) {
                updateState(input);
            }
        } else if (event.type === 'blur') {
            const state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
            state.hasBlurred = true;
            dirtyState.set(input, state);
            if (state.hasInteracted) {
                updateState(input);
            }
        }
    };

    const init = (root = document) => {
        // Sincronizza sempre aria-invalid con :user-invalid quando supportato
        const syncAria = (el) => {
            if (!el || typeof el.matches !== 'function' || typeof el.checkValidity !== 'function') return;
            try {
                if (CSS.supports('selector(:user-invalid)')) {
                    el.setAttribute('aria-invalid', el.matches(':user-invalid') ? 'true' : 'false');
                }
            } catch (_) {
                // ignore
            }
        };

        root.addEventListener('blur', (e) => syncAria(e.target), true);
        root.addEventListener('input', (e) => {
            if (e.target && e.target.hasAttribute && e.target.hasAttribute('aria-invalid')) {
                syncAria(e.target);
            }
        });

        if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('selector(:user-invalid)')) return;

        root.addEventListener('blur', handleEvent, true);
        root.addEventListener('input', handleEvent);
        root.addEventListener('change', handleEvent);
        root.addEventListener('reset', handleEvent, true);
    };

    return { init };
})();

function initLightDismissDialogs() {
    const dialogs = document.querySelectorAll('dialog[closedby="any"]');
    dialogs.forEach((dialog) => {
        if (!('closedBy' in HTMLDialogElement.prototype)) {
            dialog.addEventListener('click', (event) => {
                if (event.target !== dialog) return;
                const rect = dialog.getBoundingClientRect();
                const isDialogContent =
                    rect.top <= event.clientY &&
                    event.clientY <= rect.top + rect.height &&
                    rect.left <= event.clientX &&
                    event.clientX <= rect.left + rect.width;
                if (isDialogContent) return;
                dialog.close();
            });
        }
    });
}

window.CARD_RULES = CARD_RULES;
window.PasianCardService = PasianCardService;
window.computeCategoryCycleState = computeCategoryCycleState;
window.formatDateIT = formatDateIT;
window.formatCurrencyEUR = formatCurrencyEUR;
window.buildQrPayload = buildQrPayload;
window.parseQrOrCardInput = parseQrOrCardInput;
window.UserInvalidFallback = UserInvalidFallback;
window.initLightDismissDialogs = initLightDismissDialogs;
