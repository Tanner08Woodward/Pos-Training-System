# Database checks (optional, needs PostgreSQL 16 on this computer)

Not part of `npm test`. Runs the Supabase SQL files against a throwaway local
database to make sure they work before you paste them into Supabase.

```
createdb pos_check
psql -d pos_check -f tests/sql/supabase-roles.sql      # fake Supabase roles
psql -d pos_check -f supabase/schema.sql
psql -d pos_check -f supabase/002_validate_attempts.sql
psql -d pos_check -f supabase/003_trainee_codes.sql
psql -d pos_check -f tests/sql/trainee-codes-check.sql  # read the output
dropdb pos_check
```

`trainee-codes-check.sql` uses the placeholder manager code from
schema.sql (`change-this-code`), so only run it on a throwaway database.
