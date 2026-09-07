import { validateStagingDatabaseRoles } from '../server/runtime/staging-database-roles.ts';
import { getPostgresPool } from '../server/runtime/postgres.ts';

// Read-only verification after the standard staging migration command.
try {
  await validateStagingDatabaseRoles(process.env);
  const pool=getPostgresPool();
  try {
    for(const table of ['teacher_assignments','lesson_attendance','mobile_diary','mobile_diary_completion','mobile_profile_photos']) {
      const result=await pool.query(`SELECT relrowsecurity,relforcerowsecurity,
        (has_table_privilege(current_user,$1,'SELECT') AND has_table_privilege(current_user,$1,'INSERT')
        AND has_table_privilege(current_user,$1,'UPDATE') AND has_table_privilege(current_user,$1,'DELETE')) AS privileges
        FROM pg_class WHERE oid=to_regclass($1)`,[`public.${table}`]);
      const row=result.rows[0];
      if(!row?.relrowsecurity||!row.relforcerowsecurity||!row.privileges)throw new Error(`Missing protected runtime table access: ${table}`);
    }
    console.log('MOBILE_CANDIDATE_RUNTIME_TABLES=PASSED');
  }finally{await pool.end();}
}catch(e){console.error(e instanceof Error?e.message:'Mobile candidate verification failed');process.exitCode=1;}
