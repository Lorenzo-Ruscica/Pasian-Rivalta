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
    url: 'INSERISCI_QUI_SUPABASE_URL',       // es. 'https://xyzcompany.supabase.co'
    anonKey: 'INSERISCI_QUI_SUPABASE_ANON_KEY' // es. 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
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
 * STORAGE DEMO LOCALE (Usato automaticamente prima dell'inserimento chiavi Supabase)
 * ============================================================================ */
const DEMO_STORAGE_KEYS = {
    USERS: 'pasian_demo_users_v1',
    SESSION: 'pasian_demo_session_v1',
    CARDS: 'pasian_demo_cards_v1',
    MEMBERS: 'pasian_demo_members_v1',
    PURCHASES: 'pasian_demo_purchases_v1'
};

function ensureDemoSeedData() {
    if (isSupabaseConfigured()) return;
    const existingCards = localStorage.getItem(DEMO_STORAGE_KEYS.CARDS);
    if (existingCards) return;

    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString();

    const demoUsers = [
        {
            id: 'demo-admin-1',
            email: 'admin@pasianrivalta.it',
            password: 'AdminPassword1!',
            is_admin: true
        },
        {
            id: 'demo-user-rossi',
            email: 'famiglia.rossi@esempio.it',
            password: 'RossiPassword1!',
            is_admin: false
        }
    ];

    const demoCards = [
        {
            id: 'card-demo-rossi',
            user_id: 'demo-user-rossi',
            card_code: 'PR-FAM-ROSSI81',
            family_name: 'Famiglia Rossi',
            holder_name: 'Marco Rossi',
            holder_email: 'famiglia.rossi@esempio.it',
            holder_phone: '+39 333 1234567',
            members_locked: true,
            jewelry_step: 1,
            jewelry_cycle_started_at: oneMonthAgo,
            optics_step: 0,
            optics_cycle_started_at: null,
            created_at: oneMonthAgo
        }
    ];

    const demoMembers = [
        {
            id: 'mem-rossi-1',
            card_id: 'card-demo-rossi',
            full_name: 'Marco Rossi',
            role: 'genitore',
            birth_date: '1982-04-15',
            is_holder: true,
            created_at: oneMonthAgo
        },
        {
            id: 'mem-rossi-2',
            card_id: 'card-demo-rossi',
            full_name: 'Elena Bianchi Rossi',
            role: 'genitore',
            birth_date: '1984-09-22',
            is_holder: false,
            created_at: oneMonthAgo
        },
        {
            id: 'mem-rossi-3',
            card_id: 'card-demo-rossi',
            full_name: 'Sofia Rossi',
            role: 'figlio',
            birth_date: '2012-06-10',
            is_holder: false,
            created_at: oneMonthAgo
        },
        {
            id: 'mem-rossi-4',
            card_id: 'card-demo-rossi',
            full_name: 'Giuseppe Rossi',
            role: 'nonno',
            birth_date: '1952-11-03',
            is_holder: false,
            created_at: oneMonthAgo
        }
    ];

    const demoPurchases = [
        {
            id: 'pur-rossi-1',
            card_id: 'card-demo-rossi',
            member_id: 'mem-rossi-1',
            member_name: 'Marco Rossi',
            member_role: 'genitore',
            category: 'gioielleria',
            purchase_number_in_cycle: 1,
            discount_percent: 10,
            original_amount: 350.00,
            final_amount: 315.00,
            notes: '1° Acquisto Gioielleria - Bracciale Oro 18kt',
            created_at: oneMonthAgo
        }
    ];

    localStorage.setItem(DEMO_STORAGE_KEYS.USERS, JSON.stringify(demoUsers));
    localStorage.setItem(DEMO_STORAGE_KEYS.CARDS, JSON.stringify(demoCards));
    localStorage.setItem(DEMO_STORAGE_KEYS.MEMBERS, JSON.stringify(demoMembers));
    localStorage.setItem(DEMO_STORAGE_KEYS.PURCHASES, JSON.stringify(demoPurchases));
}

function getDemoArray(key) {
    ensureDemoSeedData();
    try {
        return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (_) {
        return [];
    }
}

function setDemoArray(key, arr) {
    localStorage.setItem(key, JSON.stringify(arr));
}

/* ============================================================================
 * SERVIZIO UNIFICATO (Supabase Live + Demo Locale)
 * ============================================================================ */
const PasianCardService = {
    isLiveSupabase() {
        return isSupabaseConfigured();
    },

    async getSessionUser() {
        const sb = getSupabaseClient();
        if (sb) {
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
        }

        ensureDemoSeedData();
        try {
            const raw = localStorage.getItem(DEMO_STORAGE_KEYS.SESSION);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    },

    async signIn(email, password) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const sb = getSupabaseClient();
        if (sb) {
            const { data, error } = await sb.auth.signInWithPassword({
                email: cleanEmail,
                password
            });
            if (error) throw new Error(error.message);
            return this.getSessionUser();
        }

        // Modalità Demo Locale
        const users = getDemoArray(DEMO_STORAGE_KEYS.USERS);
        const user = users.find(u => u.email.toLowerCase() === cleanEmail && u.password === password);
        if (!user) {
            throw new Error('Credenziali non valide. (In modalità demo puoi usare famiglia.rossi@esempio.it / RossiPassword1! oppure registrare una nuova famiglia)');
        }
        const sessionUser = { id: user.id, email: user.email, is_admin: Boolean(user.is_admin) };
        localStorage.setItem(DEMO_STORAGE_KEYS.SESSION, JSON.stringify(sessionUser));
        return sessionUser;
    },

    async signOut() {
        const sb = getSupabaseClient();
        if (sb) {
            await sb.auth.signOut();
            return;
        }
        localStorage.removeItem(DEMO_STORAGE_KEYS.SESSION);
    },

    async resetPassword(email) {
        const cleanEmail = String(email || '').trim().toLowerCase();
        const sb = getSupabaseClient();
        if (sb) {
            const { error } = await sb.auth.resetPasswordForEmail(cleanEmail, {
                redirectTo: window.location.origin + '/card-famiglia.html'
            });
            if (error) throw new Error(error.message);
            return true;
        }
        return true;
    },

    /**
     * Registrazione Completa in Un'Unica Fase:
     * Crea l'account Auth + la Card Famiglia + tutti i Membri (Genitori, Figli, Nonni) e blocca subito modifiche future.
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

        if (sb) {
            const { data: signUpData, error: signUpError } = await sb.auth.signUp({
                email: cleanEmail,
                password,
                options: {
                    data: {
                        family_name: familyName,
                        holder_name: holderName,
                        holder_phone: holderPhone,
                        holder_role: holderRole
                    }
                }
            });
            if (signUpError) throw new Error(signUpError.message);

            // Se la conferma email è disattivata su Supabase (o sessione subito attiva), chiama subito la RPC atomica
            if (signUpData?.session) {
                const { error: rpcError } = await sb.rpc('register_family_card', {
                    p_family_name: familyName,
                    p_holder_name: holderName,
                    p_holder_email: cleanEmail,
                    p_holder_phone: holderPhone || '',
                    p_holder_role: holderRole || 'genitore',
                    p_holder_birth_date: holderBirthDate || null,
                    p_additional_members: additionalMembers || []
                });
                if (rpcError) throw new Error(rpcError.message);
                return { requiresEmailConfirmation: false };
            } else {
                // Salva temporaneamente il payload del nucleo famigliare per completare la RPC appena l'utente conferma l'email
                localStorage.setItem(
                    `pasian_pending_family_${cleanEmail}`,
                    JSON.stringify({
                        familyName,
                        holderName,
                        holderEmail: cleanEmail,
                        holderPhone,
                        holderRole,
                        holderBirthDate,
                        additionalMembers
                    })
                );
                return { requiresEmailConfirmation: true };
            }
        }

        // Modalità Demo Locale
        const users = getDemoArray(DEMO_STORAGE_KEYS.USERS);
        if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
            throw new Error('Esiste già un account registrato con questo indirizzo email.');
        }

        const newUserId = 'user-' + Date.now();
        const newCardId = 'card-' + Date.now();
        const cardCode = generateRandomCardCode();
        const nowIso = new Date().toISOString();

        users.push({
            id: newUserId,
            email: cleanEmail,
            password,
            is_admin: false
        });
        setDemoArray(DEMO_STORAGE_KEYS.USERS, users);

        const cards = getDemoArray(DEMO_STORAGE_KEYS.CARDS);
        cards.push({
            id: newCardId,
            user_id: newUserId,
            card_code: cardCode,
            family_name: familyName.trim(),
            holder_name: holderName.trim(),
            holder_email: cleanEmail,
            holder_phone: (holderPhone || '').trim(),
            members_locked: true,
            jewelry_step: 0,
            jewelry_cycle_started_at: null,
            optics_step: 0,
            optics_cycle_started_at: null,
            created_at: nowIso
        });
        setDemoArray(DEMO_STORAGE_KEYS.CARDS, cards);

        const members = getDemoArray(DEMO_STORAGE_KEYS.MEMBERS);
        members.push({
            id: 'mem-' + Date.now() + '-0',
            card_id: newCardId,
            full_name: holderName.trim(),
            role: holderRole || 'genitore',
            birth_date: holderBirthDate || null,
            is_holder: true,
            created_at: nowIso
        });

        (additionalMembers || []).forEach((m, idx) => {
            if (m && m.full_name && m.full_name.trim()) {
                members.push({
                    id: `mem-${Date.now()}-${idx + 1}`,
                    card_id: newCardId,
                    full_name: m.full_name.trim(),
                    role: m.role || 'figlio',
                    birth_date: m.birth_date || null,
                    is_holder: false,
                    created_at: nowIso
                });
            }
        });
        setDemoArray(DEMO_STORAGE_KEYS.MEMBERS, members);

        const sessionUser = { id: newUserId, email: cleanEmail, is_admin: false };
        localStorage.setItem(DEMO_STORAGE_KEYS.SESSION, JSON.stringify(sessionUser));
        return { requiresEmailConfirmation: false };
    },

    /**
     * Recupera i dati completi della Card Famiglia dell'utente loggato
     */
    async getMyFamilyCardBundle() {
        const user = await this.getSessionUser();
        if (!user) return null;

        const sb = getSupabaseClient();
        if (sb) {
            let { data: card, error } = await sb
                .from('family_cards')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle();

            if (error) throw new Error(error.message);

            // Se l'utente aveva confermato l'email dopo il signUp, completa la registrazione pendente in un'unica fase
            if (!card) {
                const pendingRaw = localStorage.getItem(`pasian_pending_family_${user.email.toLowerCase()}`);
                if (pendingRaw) {
                    const pending = JSON.parse(pendingRaw);
                    const { error: rpcErr } = await sb.rpc('register_family_card', {
                        p_family_name: pending.familyName,
                        p_holder_name: pending.holderName,
                        p_holder_email: pending.holderEmail,
                        p_holder_phone: pending.holderPhone || '',
                        p_holder_role: pending.holderRole || 'genitore',
                        p_holder_birth_date: pending.holderBirthDate || null,
                        p_additional_members: pending.additionalMembers || []
                    });
                    if (!rpcErr) {
                        localStorage.removeItem(`pasian_pending_family_${user.email.toLowerCase()}`);
                        const res = await sb.from('family_cards').select('*').eq('user_id', user.id).maybeSingle();
                        card = res.data;
                    }
                }
            }

            if (!card) return null;

            const [{ data: members }, { data: purchases }] = await Promise.all([
                sb.from('family_members').select('*').eq('card_id', card.id).order('is_holder', { ascending: false }).order('created_at', { ascending: true }),
                sb.from('card_purchases').select('*').eq('card_id', card.id).order('created_at', { ascending: false })
            ]);

            return {
                card,
                members: members || [],
                purchases: purchases || []
            };
        }

        // Modalità Demo Locale
        const cards = getDemoArray(DEMO_STORAGE_KEYS.CARDS);
        const card = cards.find(c => c.user_id === user.id) || cards[0];
        if (!card) return null;
        const members = getDemoArray(DEMO_STORAGE_KEYS.MEMBERS).filter(m => m.card_id === card.id);
        const purchases = getDemoArray(DEMO_STORAGE_KEYS.PURCHASES)
            .filter(p => p.card_id === card.id)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        return { card, members, purchases };
    },

    /**
     * Cerca una Card Famiglia per codice QR, codice card, cognome o email (Solo Admin)
     */
    async findCardByQuery(rawQuery) {
        const cleanedCode = parseQrOrCardInput(rawQuery);
        const q = String(rawQuery || '').trim();
        if (!q) throw new Error('Inserisci o scansiona un codice Card Famiglia.');

        const sb = getSupabaseClient();
        if (sb) {
            let { data: card } = await sb
                .from('family_cards')
                .select('*')
                .eq('card_code', cleanedCode)
                .maybeSingle();

            if (!card) {
                const { data: matchedCards } = await sb
                    .from('family_cards')
                    .select('*')
                    .or(`family_name.ilike.%${q}%,holder_name.ilike.%${q}%,holder_email.ilike.%${q}%`)
                    .limit(1);
                card = matchedCards?.[0] || null;
            }

            if (!card) {
                throw new Error(`Nessuna Card Famiglia trovata per "${q}".`);
            }

            const [{ data: members }, { data: purchases }] = await Promise.all([
                sb.from('family_members').select('*').eq('card_id', card.id).order('is_holder', { ascending: false }).order('created_at', { ascending: true }),
                sb.from('card_purchases').select('*').eq('card_id', card.id).order('created_at', { ascending: false })
            ]);

            return {
                card,
                members: members || [],
                purchases: purchases || []
            };
        }

        // Modalità Demo Locale
        const cards = getDemoArray(DEMO_STORAGE_KEYS.CARDS);
        const allMembers = getDemoArray(DEMO_STORAGE_KEYS.MEMBERS);
        const qLower = q.toLowerCase();

        let card = cards.find(c => c.card_code.toUpperCase() === cleanedCode);
        if (!card) {
            card = cards.find(
                c =>
                    c.family_name.toLowerCase().includes(qLower) ||
                    c.holder_name.toLowerCase().includes(qLower) ||
                    c.holder_email.toLowerCase().includes(qLower) ||
                    allMembers.some(m => m.card_id === c.id && m.full_name.toLowerCase().includes(qLower))
            );
        }

        if (!card) {
            throw new Error(`Nessuna Card Famiglia trovata per "${q}". Prova con PR-FAM-ROSSI81.`);
        }

        const members = allMembers.filter(m => m.card_id === card.id);
        const purchases = getDemoArray(DEMO_STORAGE_KEYS.PURCHASES)
            .filter(p => p.card_id === card.id)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        return { card, members, purchases };
    },

    /**
     * Registra un acquisto dal pannello Admin e calcola/aggiorna automaticamente lo step e la finestra di 3 mesi
     */
    async recordPurchase({ cardId, memberId, category, originalAmount, notes }) {
        const sb = getSupabaseClient();
        const parsedAmount = originalAmount !== '' && originalAmount !== null && originalAmount !== undefined
            ? Number(originalAmount)
            : null;

        if (sb) {
            const { data, error } = await sb.rpc('record_card_purchase', {
                p_card_id: cardId,
                p_member_id: memberId,
                p_category: category,
                p_original_amount: parsedAmount,
                p_notes: notes || null
            });
            if (error) throw new Error(error.message);
            return data;
        }

        // Modalità Demo Locale
        const cards = getDemoArray(DEMO_STORAGE_KEYS.CARDS);
        const members = getDemoArray(DEMO_STORAGE_KEYS.MEMBERS);
        const purchases = getDemoArray(DEMO_STORAGE_KEYS.PURCHASES);

        const cardIndex = cards.findIndex(c => c.id === cardId);
        if (cardIndex === -1) throw new Error('Card Famiglia non trovata.');
        const card = cards[cardIndex];

        const member = members.find(m => m.id === memberId && m.card_id === cardId);
        if (!member) throw new Error('Seleziona un membro valido appartenente al nucleo famigliare.');

        const now = new Date();
        const rawStep = category === 'gioielleria' ? card.jewelry_step : card.optics_step;
        const rawStart = category === 'gioielleria' ? card.jewelry_cycle_started_at : card.optics_cycle_started_at;
        const state = computeCategoryCycleState(category, rawStep, rawStart, now);

        const newStep = state.nextPurchaseNumber;
        const discountPercent = state.nextDiscountPercent;
        const newCycleStartIso = newStep === 1 ? now.toISOString() : rawStart;

        const finalAmount =
            parsedAmount !== null && !Number.isNaN(parsedAmount) && parsedAmount > 0
                ? Number((parsedAmount * (100 - discountPercent) / 100).toFixed(2))
                : null;

        const newPurchase = {
            id: 'pur-' + Date.now(),
            card_id: card.id,
            member_id: member.id,
            member_name: member.full_name,
            member_role: member.role,
            category,
            purchase_number_in_cycle: newStep,
            discount_percent: discountPercent,
            original_amount: parsedAmount,
            final_amount: finalAmount,
            notes: (notes || '').trim() || null,
            created_at: now.toISOString()
        };

        purchases.unshift(newPurchase);
        setDemoArray(DEMO_STORAGE_KEYS.PURCHASES, purchases);

        if (category === 'gioielleria') {
            card.jewelry_step = newStep;
            card.jewelry_cycle_started_at = newCycleStartIso;
        } else {
            card.optics_step = newStep;
            card.optics_cycle_started_at = newCycleStartIso;
        }
        cards[cardIndex] = card;
        setDemoArray(DEMO_STORAGE_KEYS.CARDS, cards);

        return {
            purchase_id: newPurchase.id,
            category,
            purchase_number_in_cycle: newStep,
            discount_percent: discountPercent,
            original_amount: parsedAmount,
            final_amount: finalAmount,
            cycle_started_at: newCycleStartIso,
            cycle_expires_at: addThreeMonths(newCycleStartIso)?.toISOString()
        };
    },

    /**
     * Elenco di tutte le Card registrate e ultimi acquisti (per dashboard Admin)
     */
    async listAllCardsAndRecentPurchases() {
        const sb = getSupabaseClient();
        if (sb) {
            const [{ data: cards }, { data: members }, { data: purchases }] = await Promise.all([
                sb.from('family_cards').select('*').order('created_at', { ascending: false }).limit(50),
                sb.from('family_members').select('*'),
                sb.from('card_purchases').select('*').order('created_at', { ascending: false }).limit(30)
            ]);
            return {
                cards: cards || [],
                members: members || [],
                purchases: purchases || []
            };
        }

        const cards = getDemoArray(DEMO_STORAGE_KEYS.CARDS);
        const members = getDemoArray(DEMO_STORAGE_KEYS.MEMBERS);
        const purchases = getDemoArray(DEMO_STORAGE_KEYS.PURCHASES).sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
        return { cards, members, purchases };
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
