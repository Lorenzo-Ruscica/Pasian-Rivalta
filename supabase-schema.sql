-- ============================================================================
-- PASIAN RIVALTA - SISTEMA "CARD FAMIGLIA", CODICI ACQUISTO & PANNELLO ADMIN
-- Script SQL completo e idempotente per Supabase (PostgreSQL + RLS + RPC)
-- ============================================================================
-- ISTRUZIONI:
-- 1. Apri la dashboard del tuo progetto Supabase -> SQL Editor -> New Query
-- 2. Incolla TUTTO questo file e clicca su "Run"
--    (Lo script è idempotente: può essere eseguito anche su un database già
--     attivo senza perdere i dati esistenti, aggiungendo la tabella e le
--     funzioni per i Codici Acquisto monouso).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TABELLA AMMINISTRATORI (Operatori Negozio)
-- ============================================================================
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
        SELECT 1 FROM public.admin_users WHERE user_id = (SELECT auth.uid())
    );
$$;

DROP POLICY IF EXISTS "Admins can read own admin status" ON public.admin_users;
CREATE POLICY "Admins can read own admin status"
    ON public.admin_users
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

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
    registration_code TEXT,
    -- Flag di blocco: una volta terminata l'unica fase di registrazione,
    -- i membri della famiglia non possono più essere aggiunti o modificati dal cliente.
    members_locked BOOLEAN NOT NULL DEFAULT FALSE,
    -- Stato ciclo Gioielleria (10% -> 15% -> 20%, finestra 3 mesi dal 1° acquisto)
    jewelry_step INT NOT NULL DEFAULT 0 CHECK (jewelry_step BETWEEN 0 AND 3),
    jewelry_cycle_started_at TIMESTAMPTZ,
    -- Stato ciclo Ottica Occhiali (15% -> 20% -> 25%, finestra 3 mesi dal 1° acquisto, escluse lenti a contatto)
    optics_step INT NOT NULL DEFAULT 0 CHECK (optics_step BETWEEN 0 AND 3),
    optics_cycle_started_at TIMESTAMPTZ,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.family_cards ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.family_cards ADD COLUMN IF NOT EXISTS registration_code TEXT;

CREATE INDEX IF NOT EXISTS idx_family_cards_code ON public.family_cards(card_code);
CREATE INDEX IF NOT EXISTS idx_family_cards_user ON public.family_cards(user_id);

ALTER TABLE public.family_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own family card or admin views all" ON public.family_cards;
CREATE POLICY "Users can view own family card or admin views all"
    ON public.family_cards
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "Users can insert own family card once" ON public.family_cards;
CREATE POLICY "Users can insert own family card once"
    ON public.family_cards
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Only admins can update family cards" ON public.family_cards;
CREATE POLICY "Only admins can update family cards"
    ON public.family_cards
    FOR UPDATE
    TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

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
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_family_members_card ON public.family_members(card_id);

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own family members or admin views all" ON public.family_members;
CREATE POLICY "Users can view own family members or admin views all"
    ON public.family_members
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.family_cards fc
            WHERE fc.id = family_members.card_id
              AND (fc.user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
        )
    );

DROP POLICY IF EXISTS "Insert family members only during initial unlocked registration" ON public.family_members;
CREATE POLICY "Insert family members only during initial unlocked registration"
    ON public.family_members
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT public.is_admin()) OR EXISTS (
            SELECT 1 FROM public.family_cards fc
            WHERE fc.id = family_members.card_id
              AND fc.user_id = (SELECT auth.uid())
              AND fc.members_locked = FALSE
        )
    );

DROP POLICY IF EXISTS "Only admins can update family members" ON public.family_members;
CREATE POLICY "Only admins can update family members"
    ON public.family_members
    FOR UPDATE
    TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

-- Trigger ferreo per garantire l'immutabilità dei membri per il cliente dopo la prima registrazione
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
    is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.card_purchases ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.card_purchases ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.card_purchases ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_card_purchases_card ON public.card_purchases(card_id, created_at DESC);

ALTER TABLE public.card_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own purchases or admin views all" ON public.card_purchases;
CREATE POLICY "Users view own purchases or admin views all"
    ON public.card_purchases
    FOR SELECT
    TO authenticated
    USING (
        (SELECT public.is_admin()) OR EXISTS (
            SELECT 1 FROM public.family_cards fc
            WHERE fc.id = card_purchases.card_id
              AND fc.user_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "Only admins can insert purchases" ON public.card_purchases;
CREATE POLICY "Only admins can insert purchases"
    ON public.card_purchases
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Only admins can update purchases" ON public.card_purchases;
CREATE POLICY "Only admins can update purchases"
    ON public.card_purchases
    FOR UPDATE
    TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

-- ============================================================================
-- 5. TABELLA CODICI ACQUISTO MONOUSO PER REGISTRAZIONE CLIENTI
-- ============================================================================
-- - Ogni codice generato dall'Admin è sempre univoco (es. PR-ACQ-XXXX-XXXX)
-- - La generazione di nuovi codici NON invalida quelli precedenti non ancora usati
-- - Ogni codice può essere utilizzato una sola volta (per un singolo account/Card Famiglia)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.registration_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    notes TEXT,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    used_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    used_by_card_id UUID REFERENCES public.family_cards(id) ON DELETE SET NULL,
    used_by_family_name TEXT,
    used_by_email TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    used_at TIMESTAMPTZ
);

ALTER TABLE public.registration_codes ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_registration_codes_upper ON public.registration_codes (upper(code));
CREATE INDEX IF NOT EXISTS idx_registration_codes_unused ON public.registration_codes (created_at DESC) WHERE is_used = FALSE;
CREATE INDEX IF NOT EXISTS idx_registration_codes_created ON public.registration_codes (created_at DESC);

ALTER TABLE public.registration_codes ENABLE ROW LEVEL SECURITY;

-- Solo gli Admin possono leggere/gestire l'elenco completo dei codici acquisto
DROP POLICY IF EXISTS "Only admins can view registration codes" ON public.registration_codes;
CREATE POLICY "Only admins can view registration codes"
    ON public.registration_codes
    FOR SELECT
    TO authenticated
    USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Only admins can insert registration codes" ON public.registration_codes;
CREATE POLICY "Only admins can insert registration codes"
    ON public.registration_codes
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Only admins can update registration codes" ON public.registration_codes;
CREATE POLICY "Only admins can update registration codes"
    ON public.registration_codes
    FOR UPDATE
    TO authenticated
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "Only admins can delete unused registration codes" ON public.registration_codes;
CREATE POLICY "Only admins can delete unused registration codes"
    ON public.registration_codes
    FOR DELETE
    TO authenticated
    USING ((SELECT public.is_admin()) AND is_used = FALSE);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.registration_codes TO authenticated;

-- ============================================================================
-- 6. FUNZIONI RPC PER I CODICI ACQUISTO (GENERAZIONE, VERIFICA, ELIMINAZIONE)
-- ============================================================================

-- 6A. Genera un nuovo Codice Acquisto sempre diverso e univoco (Solo Admin)
CREATE OR REPLACE FUNCTION public.admin_generate_registration_code(
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_bytes BYTEA;
    v_part1 TEXT;
    v_part2 TEXT;
    v_code TEXT;
    v_row public.registration_codes%ROWTYPE;
    i INT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Operazione consentita solo agli operatori autorizzati.';
    END IF;

    -- Genera un codice leggibile e mai uguale: PR-ACQ-XXXX-XXXX
    LOOP
        v_bytes := gen_random_bytes(8);
        v_part1 := '';
        v_part2 := '';
        FOR i IN 0..3 LOOP
            v_part1 := v_part1 || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
            v_part2 := v_part2 || substr(v_alphabet, (get_byte(v_bytes, i + 4) % 32) + 1, 1);
        END LOOP;
        v_code := 'PR-ACQ-' || v_part1 || '-' || v_part2;

        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.registration_codes WHERE upper(code) = v_code
        );
    END LOOP;

    INSERT INTO public.registration_codes (
        code,
        notes,
        is_used,
        created_by
    ) VALUES (
        v_code,
        nullif(trim(coalesce(p_notes, '')), ''),
        FALSE,
        auth.uid()
    ) RETURNING * INTO v_row;

    RETURN to_jsonb(v_row);
END;
$$;

-- 6B. Elimina un Codice Acquisto non ancora utilizzato (Solo Admin)
CREATE OR REPLACE FUNCTION public.admin_delete_registration_code(
    p_code_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row public.registration_codes%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Operazione consentita solo agli operatori autorizzati.';
    END IF;

    SELECT * INTO v_row
    FROM public.registration_codes
    WHERE id = p_code_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Codice acquisto non trovato.';
    END IF;

    IF v_row.is_used THEN
        RAISE EXCEPTION 'Impossibile eliminare un codice acquisto già utilizzato da una famiglia.';
    END IF;

    DELETE FROM public.registration_codes WHERE id = p_code_id;

    RETURN jsonb_build_object(
        'deleted', TRUE,
        'id', p_code_id,
        'code', v_row.code
    );
END;
$$;

-- 6C. Verifica preventiva di un singolo Codice Acquisto (prima del signUp cliente)
-- Non espone alcun elenco: controlla esclusivamente il codice puntuale inserito.
CREATE OR REPLACE FUNCTION public.verify_registration_code(
    p_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_clean TEXT := upper(trim(coalesce(p_code, '')));
    v_row public.registration_codes%ROWTYPE;
BEGIN
    IF v_clean = '' THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'reason', 'missing',
            'message', 'Inserisci il codice acquisto rilasciato in negozio.'
        );
    END IF;

    SELECT * INTO v_row
    FROM public.registration_codes
    WHERE upper(code) = v_clean;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'reason', 'not_found',
            'message', 'Codice acquisto non valido o inesistente. Verifica il codice rilasciato in negozio.'
        );
    END IF;

    IF v_row.is_used THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'reason', 'already_used',
            'message', 'Questo codice acquisto è già stato utilizzato per un altro account.'
        );
    END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'reason', 'ok',
        'code', v_row.code,
        'message', 'Codice acquisto valido.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_registration_code(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_generate_registration_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_registration_code(UUID) TO authenticated;

-- ============================================================================
-- 7. FUNZIONE RPC: REGISTRAZIONE ATOMICA IN UN'UNICA FASE CON CODICE ACQUISTO MONOUSO
-- ============================================================================
-- Rimuove la precedente firma a 7 parametri per evitare ambiguità in PostgREST
DROP FUNCTION IF EXISTS public.register_family_card(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, JSONB);

CREATE OR REPLACE FUNCTION public.register_family_card(
    p_family_name TEXT,
    p_holder_name TEXT,
    p_holder_email TEXT,
    p_holder_phone TEXT,
    p_holder_role TEXT,
    p_holder_birth_date DATE DEFAULT NULL,
    p_additional_members JSONB DEFAULT '[]'::JSONB,
    p_registration_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_clean_reg_code TEXT := upper(trim(coalesce(p_registration_code, '')));
    v_reg_code_row public.registration_codes%ROWTYPE;
    v_card_id UUID;
    v_card_code TEXT;
    v_member JSONB;
    v_role TEXT;
    v_bdate DATE;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Utente non autenticato.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.family_cards WHERE user_id = v_user_id AND is_archived = FALSE) THEN
        RAISE EXCEPTION 'Esiste già una Card Famiglia associata a questo account.';
    END IF;

    -- 1. Verifica e blocca (FOR UPDATE) il Codice Acquisto monouso
    IF v_clean_reg_code = '' THEN
        RAISE EXCEPTION 'Inserisci il codice acquisto rilasciato in negozio per poterti registrare.';
    END IF;

    SELECT * INTO v_reg_code_row
    FROM public.registration_codes
    WHERE upper(code) = v_clean_reg_code
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Codice acquisto non valido o inesistente. Verifica il codice rilasciato in negozio.';
    END IF;

    IF v_reg_code_row.is_used THEN
        RAISE EXCEPTION 'Questo codice acquisto è già stato utilizzato per un altro account.';
    END IF;

    -- 2. Genera codice univoco leggibile per la Card Famiglia: PR-FAM-XXXXXXXX
    LOOP
        v_card_code := 'PR-FAM-' || upper(substring(encode(gen_random_bytes(4), 'hex') from 1 for 8));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.family_cards WHERE card_code = v_card_code);
    END LOOP;

    v_role := lower(coalesce(nullif(trim(p_holder_role), ''), 'genitore'));
    IF v_role NOT IN ('genitore', 'figlio', 'nonno') THEN
        v_role := 'genitore';
    END IF;

    -- 3. Crea la Card con members_locked = FALSE temporaneamente nella transazione
    INSERT INTO public.family_cards (
        user_id,
        card_code,
        family_name,
        holder_name,
        holder_email,
        holder_phone,
        registration_code,
        members_locked
    ) VALUES (
        v_user_id,
        v_card_code,
        trim(p_family_name),
        trim(p_holder_name),
        lower(trim(p_holder_email)),
        nullif(trim(coalesce(p_holder_phone, '')), ''),
        v_reg_code_row.code,
        FALSE
    ) RETURNING id INTO v_card_id;

    -- 4. Inserisce il titolare come primo membro
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

    -- 5. Inserisce tutti gli altri membri del nucleo famigliare (Genitori, Figli, Nonni)
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

    -- 6. Sigilla e blocca definitivamente i membri della famiglia
    UPDATE public.family_cards
    SET members_locked = TRUE
    WHERE id = v_card_id;

    -- 7. Marca il Codice Acquisto come UTILIZZATO (monouso) e lo lega alla famiglia appena creata
    UPDATE public.registration_codes
    SET
        is_used = TRUE,
        used_by_user_id = v_user_id,
        used_by_card_id = v_card_id,
        used_by_family_name = trim(p_family_name),
        used_by_email = lower(trim(p_holder_email)),
        used_at = now()
    WHERE id = v_reg_code_row.id;

    RETURN jsonb_build_object(
        'card_id', v_card_id,
        'card_code', v_card_code,
        'registration_code', v_reg_code_row.code,
        'members_locked', TRUE
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_family_card(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, JSONB, TEXT) TO authenticated;

-- ============================================================================
-- 8. FUNZIONE RPC ADMIN: REGISTRAZIONE ACQUISTO CON CALCOLO AUTOMATICO SCONTO
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
    WHERE id = p_member_id AND card_id = p_card_id AND is_archived = FALSE;

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

-- ============================================================================
-- 9. FUNZIONI RPC OPERATORE: GESTIONE CARD, FAMILIARI E ANNULLAMENTO SCONTI
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_add_family_member(
    p_card_id UUID,
    p_full_name TEXT,
    p_role TEXT DEFAULT 'figlio'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT := lower(coalesce(nullif(trim(p_role), ''), 'figlio'));
    v_member public.family_members%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Operazione consentita solo agli operatori autorizzati.';
    END IF;

    IF trim(coalesce(p_full_name, '')) = '' THEN
        RAISE EXCEPTION 'Inserisci il nome e cognome del familiare.';
    END IF;

    IF v_role NOT IN ('genitore', 'figlio', 'nonno') THEN
        v_role := 'figlio';
    END IF;

    INSERT INTO public.family_members (
        card_id,
        full_name,
        role,
        is_holder,
        is_archived
    ) VALUES (
        p_card_id,
        trim(p_full_name),
        v_role,
        FALSE,
        FALSE
    ) RETURNING * INTO v_member;

    RETURN to_jsonb(v_member);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_family_member(
    p_member_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member public.family_members%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Operazione consentita solo agli operatori autorizzati.';
    END IF;

    SELECT * INTO v_member
    FROM public.family_members
    WHERE id = p_member_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Familiare non trovato.';
    END IF;

    IF v_member.is_holder THEN
        RAISE EXCEPTION 'Non è possibile rimuovere il titolare principale della Card.';
    END IF;

    UPDATE public.family_members
    SET is_archived = TRUE
    WHERE id = p_member_id;

    RETURN jsonb_build_object('removed', TRUE, 'member_id', p_member_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_family_card(
    p_card_id UUID,
    p_family_name TEXT,
    p_holder_name TEXT,
    p_holder_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_card public.family_cards%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Operazione consentita solo agli operatori autorizzati.';
    END IF;

    UPDATE public.family_cards
    SET
        family_name = trim(p_family_name),
        holder_name = trim(p_holder_name),
        holder_phone = nullif(trim(coalesce(p_holder_phone, '')), '')
    WHERE id = p_card_id
    RETURNING * INTO v_card;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Card Famiglia non trovata.';
    END IF;

    UPDATE public.family_members
    SET full_name = trim(p_holder_name)
    WHERE card_id = p_card_id AND is_holder = TRUE;

    RETURN to_jsonb(v_card);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_card_purchase(
    p_purchase_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_purchase public.card_purchases%ROWTYPE;
    v_last_active public.card_purchases%ROWTYPE;
    v_first_in_cycle TIMESTAMPTZ;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Operazione consentita solo agli operatori autorizzati.';
    END IF;

    SELECT * INTO v_purchase
    FROM public.card_purchases
    WHERE id = p_purchase_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Acquisto non trovato.';
    END IF;

    IF v_purchase.is_cancelled THEN
        RAISE EXCEPTION 'Questo acquisto è già stato annullato.';
    END IF;

    UPDATE public.card_purchases
    SET
        is_cancelled = TRUE,
        cancelled_at = now(),
        cancelled_by = auth.uid()
    WHERE id = p_purchase_id;

    -- Ricalcola lo stato del ciclo per la categoria dell'acquisto annullato
    SELECT * INTO v_last_active
    FROM public.card_purchases
    WHERE card_id = v_purchase.card_id
      AND category = v_purchase.category
      AND is_cancelled = FALSE
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        IF v_purchase.category = 'gioielleria' THEN
            UPDATE public.family_cards
            SET jewelry_step = 0, jewelry_cycle_started_at = NULL
            WHERE id = v_purchase.card_id;
        ELSE
            UPDATE public.family_cards
            SET optics_step = 0, optics_cycle_started_at = NULL
            WHERE id = v_purchase.card_id;
        END IF;
    ELSE
        SELECT created_at INTO v_first_in_cycle
        FROM public.card_purchases
        WHERE card_id = v_purchase.card_id
          AND category = v_purchase.category
          AND is_cancelled = FALSE
          AND purchase_number_in_cycle = 1
          AND created_at <= v_last_active.created_at
        ORDER BY created_at DESC
        LIMIT 1;

        IF v_purchase.category = 'gioielleria' THEN
            UPDATE public.family_cards
            SET
                jewelry_step = v_last_active.purchase_number_in_cycle,
                jewelry_cycle_started_at = coalesce(v_first_in_cycle, v_last_active.created_at)
            WHERE id = v_purchase.card_id;
        ELSE
            UPDATE public.family_cards
            SET
                optics_step = v_last_active.purchase_number_in_cycle,
                optics_cycle_started_at = coalesce(v_first_in_cycle, v_last_active.created_at)
            WHERE id = v_purchase.card_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'cancelled', TRUE,
        'purchase_id', p_purchase_id,
        'card_id', v_purchase.card_id,
        'category', v_purchase.category
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_family_card(
    p_card_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_card public.family_cards%ROWTYPE;
    v_archived_email TEXT;
    v_is_target_admin BOOLEAN;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Operazione consentita solo agli operatori autorizzati.';
    END IF;

    SELECT * INTO v_card
    FROM public.family_cards
    WHERE id = p_card_id AND is_archived = FALSE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Scheda famiglia non trovata o già eliminata.';
    END IF;

    UPDATE public.family_cards
    SET
        is_archived = TRUE,
        card_code = v_card.card_code || '-DEL-' || substr(replace(v_card.id::text, '-', ''), 1, 6)
    WHERE id = p_card_id;

    UPDATE public.family_members
    SET is_archived = TRUE
    WHERE card_id = p_card_id;

    UPDATE public.card_purchases
    SET is_cancelled = TRUE
    WHERE card_id = p_card_id;

    SELECT EXISTS (
        SELECT 1 FROM public.admin_users WHERE user_id = v_card.user_id
    ) INTO v_is_target_admin;

    IF NOT v_is_target_admin THEN
        v_archived_email := 'deleted_' || replace(v_card.id::text, '-', '') || '@deleted.pasianrivalta.local';

        UPDATE auth.identities
        SET
            identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(v_archived_email)),
            updated_at = now()
        WHERE user_id = v_card.user_id;

        UPDATE auth.users
        SET
            email = v_archived_email,
            encrypted_password = '',
            banned_until = '2099-12-31 23:59:59+00',
            raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
                'deleted_at', now(),
                'original_email', v_card.holder_email,
                'family_name', NULL,
                'holder_name', NULL
            ),
            updated_at = now()
        WHERE id = v_card.user_id;
    END IF;

    RETURN jsonb_build_object(
        'deleted', TRUE,
        'card_id', p_card_id,
        'family_name', v_card.family_name,
        'holder_email', v_card.holder_email
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_family_card(UUID) TO authenticated;

