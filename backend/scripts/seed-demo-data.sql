-- Jeu de données de démonstration pour un environnement de test/staging.
-- A executer manuellement (jamais via docker-entrypoint-initdb.d) UNE SEULE FOIS
-- apres les migrations, sur la base de staging uniquement (pas en prod).
-- Idempotent : ne fait rien si les patients de demo existent deja.

DO $$
DECLARE
  v_cabinet_id UUID;
  v_admin_id UUID;
  v_patient_1 UUID;
  v_patient_2 UUID;
  v_patient_3 UUID;
  v_patient_4 UUID;
  v_patient_5 UUID;
  v_patient_6 UUID;
  v_appt UUID;
  v_cons UUID;
  v_act_a UUID;
  v_act_b UUID;
  v_act_c UUID;
  v_act_d UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM patients WHERE email = 'demo.lina.benali@medidesk.local') THEN
    RAISE NOTICE 'Demo data already present, skipping.';
    RETURN;
  END IF;

  SELECT id INTO v_admin_id FROM users WHERE email = 'admin@cabortho.local';
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Seed user admin@cabortho.local not found - run migration 002 first.';
  END IF;

  SELECT cabinet_id INTO v_cabinet_id FROM users WHERE id = v_admin_id;

  IF v_cabinet_id IS NULL THEN
    INSERT INTO cabinets (name, address, phone, email, timezone, settings)
    VALUES (
      'Cabinet Demo MediDesk',
      '12 rue de la Sante, 75013 Paris',
      '+33 1 23 45 67 89',
      'contact@medidesk-demo.local',
      'Europe/Paris',
      '{"prestations": [
        {"id": "consultation", "name": "Consultation", "price": 300},
        {"id": "bilan", "name": "Bilan", "price": 500},
        {"id": "restitution", "name": "Restitution", "price": 350},
        {"id": "seance-reeducation", "name": "Séance rééducation", "price": 250},
        {"id": "reunion-ecole", "name": "Réunion école", "price": 0}
      ]}'::jsonb
    )
    RETURNING id INTO v_cabinet_id;

    UPDATE users SET cabinet_id = v_cabinet_id WHERE id = v_admin_id;
  END IF;

  -- Patient 1 : Lina Benali - historique riche (2 consultations terminees, 1 a venir)
  INSERT INTO patients (
    cabinet_id, first_name, last_name, birth_date, gender, phone, email, doctor, insurance,
    diagnosis, school_type, school_level, parent_first_name, parent_last_name, parent_phone_1,
    sessions_count, last_session_date, created_by
  ) VALUES (
    v_cabinet_id, 'Lina', 'Benali', '2016-03-12', 'F', '+212 6 12 34 56 78',
    'demo.lina.benali@medidesk.local', 'Dr. Amrani', 'CNSS',
    'Trouble du langage', 'bilingue', 'CE1', 'Sara', 'Benali', '+212 6 12 34 56 78',
    2, (CURRENT_DATE - INTERVAL '3 days')::date, v_admin_id
  ) RETURNING id INTO v_patient_1;

  -- Patient 2 : Yassine El Amrani - RDV planifie a venir uniquement
  INSERT INTO patients (
    cabinet_id, first_name, last_name, birth_date, gender, phone, email, doctor,
    parent_first_name, parent_last_name, parent_phone_1, created_by
  ) VALUES (
    v_cabinet_id, 'Yassine', 'El Amrani', '2017-07-02', 'M', '+212 6 22 33 44 55',
    'demo.yassine.elamrani@medidesk.local', 'Dr. Benjelloun', 'Nour', 'El Amrani', '+212 6 22 33 44 55', v_admin_id
  ) RETURNING id INTO v_patient_2;

  -- Patient 3 : Nora Cherkaoui - RDV annule
  INSERT INTO patients (cabinet_id, first_name, last_name, birth_date, gender, phone, email, created_by)
  VALUES (v_cabinet_id, 'Nora', 'Cherkaoui', '2015-11-20', 'F', '+212 6 33 44 55 66', 'demo.nora.cherkaoui@medidesk.local', v_admin_id)
  RETURNING id INTO v_patient_3;

  -- Patient 4 : Adam Idrissi - absent (no_show)
  INSERT INTO patients (cabinet_id, first_name, last_name, birth_date, gender, phone, email, created_by)
  VALUES (v_cabinet_id, 'Adam', 'Idrissi', '2014-05-08', 'M', '+212 6 44 55 66 77', 'demo.adam.idrissi@medidesk.local', v_admin_id)
  RETURNING id INTO v_patient_4;

  -- Patient 5 : Maya Fassi - facture payee
  INSERT INTO patients (
    cabinet_id, first_name, last_name, birth_date, gender, phone, email,
    sessions_count, last_session_date, created_by
  ) VALUES (
    v_cabinet_id, 'Maya', 'Fassi', '2016-09-30', 'F', '+212 6 55 66 77 88', 'demo.maya.fassi@medidesk.local',
    1, (CURRENT_DATE - INTERVAL '20 days')::date, v_admin_id
  ) RETURNING id INTO v_patient_5;

  -- Patient 6 : Rayan Tazi - facture envoyee avec remise (remarque obligatoire)
  INSERT INTO patients (
    cabinet_id, first_name, last_name, birth_date, gender, phone, email,
    sessions_count, last_session_date, created_by
  ) VALUES (
    v_cabinet_id, 'Rayan', 'Tazi', '2015-01-17', 'M', '+212 6 66 77 88 99', 'demo.rayan.tazi@medidesk.local',
    1, (CURRENT_DATE - INTERVAL '15 days')::date, v_admin_id
  ) RETURNING id INTO v_patient_6;

  -- === Lina : consultation terminee il y a 10 jours (deja facturee plus bas) ===
  INSERT INTO appointments (cabinet_id, patient_id, starts_at, ends_at, status, tag, created_by)
  VALUES (
    v_cabinet_id, v_patient_1,
    (CURRENT_DATE - INTERVAL '10 days') + TIME '09:00', (CURRENT_DATE - INTERVAL '10 days') + TIME '09:45',
    'completed', 'Consultation', v_admin_id
  ) RETURNING id INTO v_appt;

  INSERT INTO consultations (cabinet_id, appointment_id, patient_id, motif_label, start_time, end_time, duration_minutes, notes, status, created_by, completed_at)
  VALUES (
    v_cabinet_id, v_appt, v_patient_1, 'Consultation',
    (CURRENT_DATE - INTERVAL '10 days') + TIME '09:00', (CURRENT_DATE - INTERVAL '10 days') + TIME '09:45', 45,
    'Premier rendez-vous, bilan initial du langage oral.', 'completed', v_admin_id, (CURRENT_DATE - INTERVAL '10 days') + TIME '09:45'
  ) RETURNING id INTO v_cons;

  INSERT INTO consultation_acts (consultation_id, prestation_id, label, quantity, unit_price, total)
  VALUES (v_cons, 'consultation', 'Consultation', 1, 300, 300)
  RETURNING id INTO v_act_a;

  -- === Lina : consultation terminee il y a 3 jours (non facturee -> visible dans "a facturer") ===
  INSERT INTO appointments (cabinet_id, patient_id, starts_at, ends_at, status, tag, created_by)
  VALUES (
    v_cabinet_id, v_patient_1,
    (CURRENT_DATE - INTERVAL '3 days') + TIME '10:00', (CURRENT_DATE - INTERVAL '3 days') + TIME '10:30',
    'completed', 'Seance reeducation', v_admin_id
  ) RETURNING id INTO v_appt;

  INSERT INTO consultations (cabinet_id, appointment_id, patient_id, motif_label, start_time, end_time, duration_minutes, notes, status, created_by, completed_at)
  VALUES (
    v_cabinet_id, v_appt, v_patient_1, 'Seance reeducation',
    (CURRENT_DATE - INTERVAL '3 days') + TIME '10:00', (CURRENT_DATE - INTERVAL '3 days') + TIME '10:30', 30,
    'Bonne progression sur les exercices d''articulation.', 'completed', v_admin_id, (CURRENT_DATE - INTERVAL '3 days') + TIME '10:30'
  ) RETURNING id INTO v_cons;

  INSERT INTO consultation_acts (consultation_id, prestation_id, label, quantity, unit_price, total)
  VALUES (v_cons, 'seance-reeducation', 'Seance reeducation', 1, 250, 250);

  -- === Lina : RDV a venir dans 4 jours (brouillon) ===
  INSERT INTO appointments (cabinet_id, patient_id, starts_at, ends_at, status, tag, created_by)
  VALUES (
    v_cabinet_id, v_patient_1,
    (CURRENT_DATE + INTERVAL '4 days') + TIME '14:00', (CURRENT_DATE + INTERVAL '4 days') + TIME '14:45',
    'scheduled', 'Restitution', v_admin_id
  ) RETURNING id INTO v_appt;

  INSERT INTO consultations (cabinet_id, appointment_id, patient_id, motif_label, start_time, end_time, duration_minutes, status, created_by)
  VALUES (
    v_cabinet_id, v_appt, v_patient_1, 'Restitution',
    (CURRENT_DATE + INTERVAL '4 days') + TIME '14:00', (CURRENT_DATE + INTERVAL '4 days') + TIME '14:45', 45,
    'draft', v_admin_id
  );

  -- === Yassine : RDV a venir demain (brouillon) ===
  INSERT INTO appointments (cabinet_id, patient_id, starts_at, ends_at, status, tag, created_by)
  VALUES (
    v_cabinet_id, v_patient_2,
    (CURRENT_DATE + INTERVAL '1 day') + TIME '11:00', (CURRENT_DATE + INTERVAL '1 day') + TIME '11:30',
    'scheduled', 'Consultation', v_admin_id
  ) RETURNING id INTO v_appt;

  INSERT INTO consultations (cabinet_id, appointment_id, patient_id, motif_label, start_time, end_time, duration_minutes, status, created_by)
  VALUES (
    v_cabinet_id, v_appt, v_patient_2, 'Consultation',
    (CURRENT_DATE + INTERVAL '1 day') + TIME '11:00', (CURRENT_DATE + INTERVAL '1 day') + TIME '11:30', 30,
    'draft', v_admin_id
  );

  -- === Nora : RDV annule il y a 5 jours ===
  INSERT INTO appointments (cabinet_id, patient_id, starts_at, ends_at, status, tag, created_by)
  VALUES (
    v_cabinet_id, v_patient_3,
    (CURRENT_DATE - INTERVAL '5 days') + TIME '15:00', (CURRENT_DATE - INTERVAL '5 days') + TIME '15:30',
    'canceled', 'Bilan', v_admin_id
  ) RETURNING id INTO v_appt;

  INSERT INTO consultations (cabinet_id, appointment_id, patient_id, motif_label, start_time, end_time, duration_minutes, status, created_by)
  VALUES (
    v_cabinet_id, v_appt, v_patient_3, 'Bilan',
    (CURRENT_DATE - INTERVAL '5 days') + TIME '15:00', (CURRENT_DATE - INTERVAL '5 days') + TIME '15:30', 30,
    'cancelled', v_admin_id
  );

  -- === Adam : absent il y a 2 jours ===
  INSERT INTO appointments (cabinet_id, patient_id, starts_at, ends_at, status, tag, created_by)
  VALUES (
    v_cabinet_id, v_patient_4,
    (CURRENT_DATE - INTERVAL '2 days') + TIME '16:00', (CURRENT_DATE - INTERVAL '2 days') + TIME '16:30',
    'no_show', 'Consultation', v_admin_id
  ) RETURNING id INTO v_appt;

  INSERT INTO consultations (cabinet_id, appointment_id, patient_id, motif_label, start_time, end_time, duration_minutes, status, created_by)
  VALUES (
    v_cabinet_id, v_appt, v_patient_4, 'Consultation',
    (CURRENT_DATE - INTERVAL '2 days') + TIME '16:00', (CURRENT_DATE - INTERVAL '2 days') + TIME '16:30', 30,
    'no_show', v_admin_id
  );

  -- === Maya : consultation terminee il y a 20 jours + facture PAYEE ===
  INSERT INTO appointments (cabinet_id, patient_id, starts_at, ends_at, status, tag, created_by)
  VALUES (
    v_cabinet_id, v_patient_5,
    (CURRENT_DATE - INTERVAL '20 days') + TIME '09:00', (CURRENT_DATE - INTERVAL '20 days') + TIME '10:00',
    'completed', 'Bilan', v_admin_id
  ) RETURNING id INTO v_appt;

  INSERT INTO consultations (cabinet_id, appointment_id, patient_id, motif_label, start_time, end_time, duration_minutes, notes, status, created_by, completed_at)
  VALUES (
    v_cabinet_id, v_appt, v_patient_5, 'Bilan',
    (CURRENT_DATE - INTERVAL '20 days') + TIME '09:00', (CURRENT_DATE - INTERVAL '20 days') + TIME '10:00', 60,
    'Bilan complet realise, compte-rendu remis a la famille.', 'completed', v_admin_id, (CURRENT_DATE - INTERVAL '20 days') + TIME '10:00'
  ) RETURNING id INTO v_cons;

  INSERT INTO consultation_acts (consultation_id, prestation_id, label, quantity, unit_price, total)
  VALUES (v_cons, 'bilan', 'Bilan', 1, 500, 500)
  RETURNING id INTO v_act_c;

  INSERT INTO invoices (cabinet_id, patient_id, invoice_number, status, invoice_date, total_ht, total_ttc, notes, created_by, paid_at)
  VALUES (
    v_cabinet_id, v_patient_5, 'FACT-2026-0001', 'paid',
    (CURRENT_DATE - INTERVAL '19 days')::date, 500, 500, 'Reglee en especes.', v_admin_id,
    (CURRENT_DATE - INTERVAL '18 days')
  ) RETURNING id INTO v_appt; -- reutilise la variable comme id de facture temporaire

  INSERT INTO invoice_lines (invoice_id, consultation_id, consultation_act_id, prestation_id, label, quantity, unit_price, original_unit_price, total, line_order)
  VALUES (v_appt, v_cons, v_act_c, 'bilan', 'Bilan', 1, 500, 500, 500, 0);

  UPDATE consultation_acts SET invoice_line_id = (
    SELECT id FROM invoice_lines WHERE invoice_id = v_appt AND consultation_act_id = v_act_c LIMIT 1
  ) WHERE id = v_act_c;

  -- === Rayan : consultation terminee il y a 15 jours + facture ENVOYEE avec remise (remarque obligatoire) ===
  INSERT INTO appointments (cabinet_id, patient_id, starts_at, ends_at, status, tag, created_by)
  VALUES (
    v_cabinet_id, v_patient_6,
    (CURRENT_DATE - INTERVAL '15 days') + TIME '09:00', (CURRENT_DATE - INTERVAL '15 days') + TIME '09:45',
    'completed', 'Consultation', v_admin_id
  ) RETURNING id INTO v_appt;

  INSERT INTO consultations (cabinet_id, appointment_id, patient_id, motif_label, start_time, end_time, duration_minutes, notes, status, created_by, completed_at)
  VALUES (
    v_cabinet_id, v_appt, v_patient_6, 'Consultation',
    (CURRENT_DATE - INTERVAL '15 days') + TIME '09:00', (CURRENT_DATE - INTERVAL '15 days') + TIME '09:45', 45,
    'Suivi de routine, evolution favorable.', 'completed', v_admin_id, (CURRENT_DATE - INTERVAL '15 days') + TIME '09:45'
  ) RETURNING id INTO v_cons;

  INSERT INTO consultation_acts (consultation_id, prestation_id, label, quantity, unit_price, total)
  VALUES (v_cons, 'consultation', 'Consultation', 1, 300, 300)
  RETURNING id INTO v_act_d;

  INSERT INTO invoices (cabinet_id, patient_id, invoice_number, status, invoice_date, total_ht, total_ttc, notes, created_by)
  VALUES (
    v_cabinet_id, v_patient_6, 'FACT-2026-0002', 'sent',
    (CURRENT_DATE - INTERVAL '14 days')::date, 280, 280, 'Envoyee par email, en attente de reglement.', v_admin_id
  ) RETURNING id INTO v_appt;

  INSERT INTO invoice_lines (invoice_id, consultation_id, consultation_act_id, prestation_id, label, quantity, unit_price, original_unit_price, total, remark, line_order)
  VALUES (
    v_appt, v_cons, v_act_d, 'consultation', 'Consultation', 1, 280, 300, 280,
    'Remise fidelite patient (-20 DH) accordee par le praticien.', 0
  );

  UPDATE consultation_acts SET invoice_line_id = (
    SELECT id FROM invoice_lines WHERE invoice_id = v_appt AND consultation_act_id = v_act_d LIMIT 1
  ) WHERE id = v_act_d;

  RAISE NOTICE 'Demo data seeded successfully for cabinet %', v_cabinet_id;
END $$;
