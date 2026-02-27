INSERT INTO users (email, password_hash, role, first_name, last_name)
VALUES (
  'admin@cabortho.local',
  crypt('Admin12345!', gen_salt('bf')),
  'admin',
  'System',
  'Admin'
)
ON CONFLICT (email) DO NOTHING;
