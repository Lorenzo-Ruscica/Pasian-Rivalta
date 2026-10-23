-- ============================================================================
-- PASIAN RIVALTA - SISTEMA "CARD FAMIGLIA" & PANNELLO ADMIN
-- Script SQL completo per Supabase (PostgreSQL + RLS + Trigger + Funzioni RPC)
-- ============================================================================
-- ISTRUZIONI:
-- 1. Apri la dashboard del tuo progetto Supabase -> SQL Editor -> New Query
-- 2. Incolla tutto questo file e clicca su "Run"
-- 3. Per abilitare un account come Amministratore (per usare admin.html),
--    dopo esserti registrato esegui:
--    INSERT INTO public.admin_users (user_id, email)
--    SELECT id, email FROM auth.users WHERE email = 'tua-email-admin@esempio.it';
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TABELLA AMMINISTRATORI (Operatori Negozio)
CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Funzione helper per verificare se l'utente corrente è Admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
    );
$$;

DROP POLICY IF EXISTS "Admins can read own admin status" ON public.admin_users;
CREATE POLICY "Admins can read own admin status"
    ON public.admin_users
    FOR SELECT
    USING (auth.uid() = user_id OR public.is_admin());

-- ============================================================================
-- 2. TABELLA CARD FAMIGLIA
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.family_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_code TEXT UNIQUE NOT NULL,
    family_name TEXT NOT NULL,
    holder_name TEXT NOT NULL,
    holder_email TEXT NOT NULL,
    holder_phone TEXT,
    -- Flag di blocco: una volta terminata l'unica fase di registrazione,
    -- i membri della famiglia non possono più essere aggiunti o modificati.
    members_locked BOOLEAN NOT NULL DEFAULT FALSE,
    -- Stato ciclo Gioielleria (10% -> 15% -> 20%, finestra 3 mesi dal 1° acquisto)
    jewelry_step INT NOT NULL DEFAULT 0 CHECK (jewelry_step BETWEEN 0 AND 3),
    jewelry_cycle_started_at TIMESTAMPTZ,
    -- Stato ciclo Ottica Occhiali (15% -> 20% -> 25%, finestra 3 mesi dal 1° acquisto, escluse lenti a contatto)
    optics_step INT NOT NULL DEFAULT 0 CHECK (optics_step BETWEEN 0 AND 3),
    optics_cycle_started_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_family_cards_code ON public.family_cards(card_code);
CREATE INDEX IF NOT EXISTS idx_family_cards_user ON public.family_cards(user_id);

ALTER TABLE public.family_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own family card or admin views all" ON public.family_cards;
CREATE POLICY "Users can view own family card or admin views all"
    ON public.family_cards
    FOR SELECT
    USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can insert own family card once" ON public.family_cards;
CREATE POLICY "Users can insert own family card once"
    ON public.family_cards
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Only admins can update family cards" ON public.family_cards;
CREATE POLICY "Only admins can update family cards"
    ON public.family_cards
    FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ============================================================================
-- 3. TABELLA MEMBRI DEL NUCLEO FAMIGLIARE (Genitori, Figli, Nonni)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES public.family_cards(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('genitore', 'figlio', 'nonno')),
    birth_date DATE,
    is_holder BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_family_members_card ON public.family_members(card_id);

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own family members or admin views all" ON public.family_members;
CREATE POLICY "Users can view own family members or admin views all"
    ON public.family_members
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.family_cards fc
            WHERE fc.id = family_members.card_id
              AND (fc.user_id = auth.uid() OR public.is_admin())
        )
    );

-- Inserimento consentito SOLO se la card non è ancora bloccata (prima fase unica) o se Admin
DROP POLICY IF EXISTS "Insert family members only during initial unlocked registration" ON public.family_members;
CREATE POLICY "Insert family members only during initial unlocked registration"
    ON public.family_members
    FOR INSERT
    WITH CHECK (
        public.is_admin() OR EXISTS (
            SELECT 1 FROM public.family_cards fc
            WHERE fc.id = family_members.card_id
              AND fc.user_id = auth.uid()
              AND fc.members_locked = FALSE
        )
    );

-- Trigger ferreo per garantire l'immutabilità dei membri dopo la prima registrazione
CREATE OR REPLACE FUNCTION public.enforce_family_members_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_locked BOOLEAN;
    v_card_id UUID;
BEGIN
    IF public.is_admin() THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        v_card_id := OLD.card_id;
    ELSE
        v_card_id := NEW.card_id;
    END IF;

    SELECT members_locked INTO v_locked
    FROM public.family_cards
    WHERE id = v_card_id;

    IF v_locked IS TRUE THEN
        RAISE EXCEPTION 'La registrazione del nucleo famigliare avviene in un''unica fase: non è possibile aggiungere, modificare o rimuovere membri dopo la registrazione iniziale.';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_family_members_lock ON public.family_members;
CREATE TRIGGER trg_enforce_family_members_lock
    BEFORE INSERT OR UPDATE OR DELETE ON public.family_members
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_family_members_lock();

-- ============================================================================
-- 4. TABELLA ACQUISTI E UTILIZZO SCONTI
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.card_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES public.family_cards(id) ON DELETE CASCADE,
    member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
    member_name TEXT NOT NULL,
    member_role TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('gioielleria', 'ottica')),
    purchase_number_in_cycle INT NOT NULL CHECK (purchase_number_in_cycle IN (1, 2, 3)),
    discount_percent INT NOT NULL CHECK (discount_percent IN (10, 15, 20, 25)),
    original_amount NUMERIC(10, 2),
    final_amount NUMERIC(10, 2),
    notes TEXT,
    recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_card_purchases_card ON public.card_purchases(card_id, created_at DESC);

ALTER TABLE public.card_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own purchases or admin views all" ON public.card_purchases;
CREATE POLICY "Users view own purchases or admin views all"
    ON public.card_purchases
    FOR SELECT
    USING (
        public.is_admin() OR EXISTS (
            SELECT 1 FROM public.family_cards fc
            WHERE fc.id = card_purchases.card_id
              AND fc.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Only admins can insert purchases" ON public.card_purchases;
CREATE POLICY "Only admins can insert purchases"
    ON public.card_purchases
    FOR INSERT
    WITH CHECK (public.is_admin());

-- ============================================================================
-- 5. FUNZIONE RPC: REGISTRAZIONE ATOMICA IN UN'UNICA FASE DELLA CARD FAMIGLIA
-- ============================================================================
CREATE OR REPLACE FUNCTION public.register_family_card(
    p_family_name TEXT,
    p_holder_name TEXT,
    p_holder_email TEXT,
    p_holder_phone TEXT,
    p_holder_role TEXT,
    p_holder_birth_date DATE,
    p_additional_members JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_card_id UUID;
    v_card_code TEXT;
    v_member JSONB;
    v_role TEXT;
    v_bdate DATE;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Utente non autenticato.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.family_cards WHERE user_id = v_user_id) THEN
        RAISE EXCEPTION 'Esiste già una Card Famiglia associata a questo account.';
    END IF;

    -- Genera codice univoco leggibile: PR-FAM-XXXXXXXX
    LOOP
        v_card_code := 'PR-FAM-' || upper(substring(encode(gen_random_bytes(4), 'hex') from 1 for 8));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.family_cards WHERE card_code = v_card_code);
    END LOOP;

    v_role := lower(coalesce(nullif(trim(p_holder_role), ''), 'genitore'));
    IF v_role NOT IN ('genitore', 'figlio', 'nonno') THEN
        v_role := 'genitore';
    END IF;

    -- 1. Crea la Card con members_locked = FALSE temporaneamente nella transazione
    INSERT INTO public.family_cards (
        user_id,
        card_code,
        family_name,
        holder_name,
        holder_email,
        holder_phone,
        members_locked
    ) VALUES (
        v_user_id,
        v_card_code,
        trim(p_family_name),
        trim(p_holder_name),
        lower(trim(p_holder_email)),
        nullif(trim(coalesce(p_holder_phone, '')), ''),
        FALSE
    ) RETURNING id INTO v_card_id;

    -- 2. Inserisce il titolare come primo membro
    INSERT INTO public.family_members (
        card_id,
        full_name,
        role,
        birth_date,
        is_holder
    ) VALUES (
        v_card_id,
        trim(p_holder_name),
        v_role,
        p_holder_birth_date,
        TRUE
    );

    -- 3. Inserisce tutti gli altri membri del nucleo famigliare (Genitori, Figli, Nonni)
    IF jsonb_typeof(p_additional_members) = 'array' THEN
        FOR v_member IN SELECT * FROM jsonb_array_elements(p_additional_members)
        LOOP
            IF coalesce(trim(v_member->>'full_name'), '') <> '' THEN
                v_role := lower(coalesce(v_member->>'role', 'figlio'));
                IF v_role NOT IN ('genitore', 'figlio', 'nonno') THEN
                    v_role := 'figlio';
                END IF;

                BEGIN
                    v_bdate := NULLIF(trim(coalesce(v_member->>'birth_date', '')), '')::DATE;
                EXCEPTION WHEN OTHERS THEN
                    v_bdate := NULL;
                END;

                INSERT INTO public.family_members (
                    card_id,
                    full_name,
                    role,
                    birth_date,
                    is_holder
                ) VALUES (
                    v_card_id,
                    trim(v_member->>'full_name'),
                    v_role,
                    v_bdate,
                    FALSE
                );
            END IF;
        END LOOP;
    END IF;

    -- 4. Sigilla e blocca definitivamente i membri della famiglia
    UPDATE public.family_cards
    SET members_locked = TRUE
    WHERE id = v_card_id;

    RETURN jsonb_build_object(
        'card_id', v_card_id,
        'card_code', v_card_code,
        'members_locked', TRUE
    );
END;
$$;

-- ============================================================================
-- 6. FUNZIONE RPC ADMIN: REGISTRAZIONE ACQUISTO CON CALCOLO AUTOMATICO SCONTO
-- ============================================================================
-- Regole:
-- - Gioielleria: 1° acquisto = 10% (avvia 3 mesi), 2° = 15%, 3° = 20%.
-- - Ottica (Occhiali, escluse lenti a contatto): 1° acquisto = 15% (avvia 3 mesi), 2° = 20%, 3° = 25%.
-- - Dopo il 3° acquisto o se sono passati > 3 mesi dal 1° acquisto della categoria,
--   il ciclo riparte dal 1° acquisto.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_card_purchase(
    p_card_id UUID,
    p_member_id UUID,
    p_category TEXT,
    p_original_amount NUMERIC DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_card public.family_cards%ROWTYPE;
    v_member public.family_members%ROWTYPE;
    v_now TIMESTAMPTZ := now();
    v_current_step INT;
    v_cycle_start TIMESTAMPTZ;
    v_new_step INT;
    v_new_cycle_start TIMESTAMPTZ;
    v_discount INT;
    v_final_amount NUMERIC(10, 2);
    v_purchase_id UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Operazione consentita solo agli amministratori.';
    END IF;

    IF p_category NOT IN ('gioielleria', 'ottica') THEN
        RAISE EXCEPTION 'Categoria non valida. Valori ammessi: gioielleria, ottica.';
    END IF;

    SELECT * INTO v_card
    FROM public.family_cards
    WHERE id = p_card_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Card Famiglia non trovata.';
    END IF;

    SELECT * INTO v_member
    FROM public.family_members
    WHERE id = p_member_id AND card_id = p_card_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Il membro selezionato non appartiene a questa Card Famiglia.';
    END IF;

    IF p_category = 'gioielleria' THEN
        v_current_step := v_card.jewelry_step;
        v_cycle_start := v_card.jewelry_cycle_started_at;
    ELSE
        v_current_step := v_card.optics_step;
        v_cycle_start := v_card.optics_cycle_started_at;
    END IF;

    -- Verifica se bisogna iniziare un nuovo ciclo (1° acquisto, oppure ciclo concluso al 3°, oppure scaduti i 3 mesi)
    IF v_current_step = 0
       OR v_current_step >= 3
       OR v_cycle_start IS NULL
       OR v_now > (v_cycle_start + INTERVAL '3 months')
    THEN
        v_new_step := 1;
        v_new_cycle_start := v_now;
    ELSE
        v_new_step := v_current_step + 1;
        v_new_cycle_start := v_cycle_start;
    END IF;

    -- Determina la percentuale di sconto in base a categoria e numero acquisto
    IF p_category = 'gioielleria' THEN
        v_discount := CASE v_new_step
            WHEN 1 THEN 10
            WHEN 2 THEN 15
            WHEN 3 THEN 20
            ELSE 10
        END;
    ELSE
        v_discount := CASE v_new_step
            WHEN 1 THEN 15
            WHEN 2 THEN 20
            WHEN 3 THEN 25
            ELSE 15
        END;
    END IF;

    IF p_original_amount IS NOT NULL AND p_original_amount > 0 THEN
        v_final_amount := round(p_original_amount * (100 - v_discount)::NUMERIC / 100.0, 2);
    ELSE
        v_final_amount := NULL;
    END IF;

    INSERT INTO public.card_purchases (
        card_id,
        member_id,
        member_name,
        member_role,
        category,
        purchase_number_in_cycle,
        discount_percent,
        original_amount,
        final_amount,
        notes,
        recorded_by
    ) VALUES (
        p_card_id,
        v_member.id,
        v_member.full_name,
        v_member.role,
        p_category,
        v_new_step,
        v_discount,
        p_original_amount,
        v_final_amount,
        nullif(trim(coalesce(p_notes, '')), ''),
        auth.uid()
    ) RETURNING id INTO v_purchase_id;

    IF p_category = 'gioielleria' THEN
        UPDATE public.family_cards
        SET jewelry_step = v_new_step,
            jewelry_cycle_started_at = v_new_cycle_start
        WHERE id = p_card_id;
    ELSE
        UPDATE public.family_cards
        SET optics_step = v_new_step,
            optics_cycle_started_at = v_new_cycle_start
        WHERE id = p_card_id;
    END IF;

    RETURN jsonb_build_object(
        'purchase_id', v_purchase_id,
        'category', p_category,
        'purchase_number_in_cycle', v_new_step,
        'discount_percent', v_discount,
        'original_amount', p_original_amount,
        'final_amount', v_final_amount,
        'cycle_started_at', v_new_cycle_start,
        'cycle_expires_at', (v_new_cycle_start + INTERVAL '3 months')
    );
END;
$$;
