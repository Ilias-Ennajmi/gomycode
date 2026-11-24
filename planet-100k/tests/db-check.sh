#!/bin/bash
# Vérifie les règles du tirage sur une base Postgres locale où la migration
# a été appliquée. Usage : PSQL="psql -qAt -d ps100k_test" bash tests/db-check.sh
set -u
PSQL=${PSQL:-"psql -qAt -d ps100k_test"}
q() { $PSQL -c "$1" | tail -1; }
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 : attendu $3, obtenu $2"; fail=1; fi; }

q "delete from ps100k.participants; delete from ps100k.rate_events;
   update ps100k.settings set campaign_active = true, starts_at = null, ends_at = null;
   update ps100k.stores set win_probability = 1, prizes_total = 2, active = true where slug = 'tanger';" >/dev/null

# 40 joueurs inscrits, puis 40 parties lancées en même temps : 2 bons seulement.
for i in $(seq 10 49); do
  q "select ps100k.register('{\"slug\":\"tanger\",\"device_id\":\"device0000000000$i\",\"full_name\":\"Joueur Test\",\"age\":30,\"phone\":\"+2126000000$i\",\"ip_hash\":\"ip$i\"}')" >/dev/null
done
for i in $(seq 10 49); do
  q "select ps100k.spin(jsonb_build_object('participant_id', id, 'device_id', device_id)) from ps100k.participants where device_id = 'device0000000000$i'" >/dev/null &
done
wait
check "jamais plus de gagnants que de bons" "$(q "select count(*) from ps100k.participants where won")" "2"
check "le magasin se ferme quand les bons sont partis" "$(q "select ps100k.store_status(s) from ps100k.stores s where slug = 'tanger'")" "sold_out"
check "les parties refusées ne sont pas comptées comme jouées" "$(q "select count(*) from ps100k.participants where played_at is not null")" "2"
check "codes gagnants uniques" "$(q "select count(distinct win_code) from ps100k.participants where won")" "2"

# Une seule partie par personne.
W=$(q "select id || '|' || device_id || '|' || win_code from ps100k.participants where won limit 1")
ID=${W%%|*}; REST=${W#*|}; DEV=${REST%%|*}; CODE=${REST#*|}
check "rejouer renvoie le même résultat" "$(q "select ps100k.spin('{\"participant_id\":\"$ID\",\"device_id\":\"$DEV\"}')->'me'->>'win_code'")" "$CODE"
check "une partie ne se lance pas depuis un autre appareil" "$(q "select ps100k.spin('{\"participant_id\":\"$ID\",\"device_id\":\"autreappareil0000\"}')->>'error'")" "not_found"
q "update ps100k.stores set prizes_total = 5 where slug = 'tanger'" >/dev/null
PHONE=$(q "select phone from ps100k.participants where id = '$ID'")
check "même numéro, autre appareil : refusé" "$(q "select ps100k.register('{\"slug\":\"tanger\",\"device_id\":\"nouvelappareil000\",\"full_name\":\"Autre Nom\",\"age\":30,\"phone\":\"$PHONE\",\"ip_hash\":\"x\"}')->>'error'")" "phone_used"
check "même appareil, autre numéro : refusé" "$(q "select ps100k.register('{\"slug\":\"tanger\",\"device_id\":\"$DEV\",\"full_name\":\"Autre Nom\",\"age\":30,\"phone\":\"+212699999999\",\"ip_hash\":\"x\"}')->>'error'")" "already_played"

# Probabilité nulle, pause, accès.
q "update ps100k.stores set win_probability = 0 where slug = 'tanger'" >/dev/null
q "select ps100k.register('{\"slug\":\"tanger\",\"device_id\":\"zerochance0000000\",\"full_name\":\"Zero Chance\",\"age\":30,\"phone\":\"+212688888888\",\"ip_hash\":\"x\"}')" >/dev/null
check "chance à 0 % : perdu" "$(q "select ps100k.spin(jsonb_build_object('participant_id', id, 'device_id', device_id))->'me'->>'won' from ps100k.participants where device_id = 'zerochance0000000'")" "false"
q "update ps100k.stores set active = false where slug = 'tanger'" >/dev/null
check "magasin désactivé : inscription refusée" "$(q "select ps100k.register('{\"slug\":\"tanger\",\"device_id\":\"pauseappareil0000\",\"full_name\":\"En Pause\",\"age\":30,\"phone\":\"+212677777777\",\"ip_hash\":\"x\"}')->>'status'")" "paused"
check "mauvaise clé : refusé" "$($PSQL -c "set role anon; select public.ps100k_api('fausse', 'admin_overview', '{}')" 2>&1 | grep -c forbidden)" "1"
check "tables fermées au rôle public" "$($PSQL -c "set role anon; select count(*) from ps100k.participants" 2>&1 | grep -c 'permission denied')" "1"

q "delete from ps100k.participants; delete from ps100k.rate_events;
   update ps100k.stores set win_probability = 0.02, prizes_total = 2, active = true where slug = 'tanger';" >/dev/null
exit $fail
