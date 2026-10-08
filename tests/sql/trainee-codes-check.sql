set role anon;
\echo stores:
select jsonb_array_length(manager_stores('change-this-code'));
\echo wrong manager code:
select manager_stores('nope');
\echo add trainees:
select manager_add_trainee('change-this-code', (select (manager_stores('change-this-code')->0->>'id')::uuid), 'Alex B.')->>'name';
select manager_add_trainee('change-this-code', (select (manager_stores('change-this-code')->1->>'id')::uuid), '  Alex   B. ')->>'name';
\echo rename store:
select manager_rename_store('change-this-code', (manager_stores('change-this-code')->0->>'id')::uuid, 'Main St');
select string_agg(e->>'name', ', ') from jsonb_array_elements(manager_stores('change-this-code')) e;
\echo sign in with first code:
select trainee_sign_in((manager_trainees('change-this-code')->0->>'code'));
\echo wrong code returns null:
select trainee_sign_in('9999') is null or (select count(*) from jsonb_array_elements(manager_trainees('change-this-code')) e where e->>'code'='9999') > 0;
\echo save attempt as signed-in trainee with spoofed name:
select save_attempt(jsonb_build_object('id','a_sql_1','trainee', jsonb_build_object('id', manager_trainees('change-this-code')->0->>'id', 'name','Fake N.'),'mode','challenge','scenarioId','cake-cone','score',95,'passed',true,'seconds',12,'events','[]'::jsonb));
\echo manager sees store on that attempt:
select e->>'storeName', e->'trainee'->>'name' from jsonb_array_elements(manager_attempts('change-this-code')) e where e->>'id'='a_sql_1';
\echo deactivate then sign in:
select manager_set_trainee_active('change-this-code', (manager_trainees('change-this-code')->0->>'id')::uuid, false);
select trainee_sign_in((manager_trainees('change-this-code')->0->>'code')) is null;
\echo anon direct table read:
select count(*) from trainees;
