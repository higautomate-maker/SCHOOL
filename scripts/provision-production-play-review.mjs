import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chmod, open, rm, writeFile } from "node:fs/promises";
import { Client } from "pg";
import { hashPassword } from "../server/auth/password.ts";

const approval = "PROVISION_SYNTHETIC_PLAY_REVIEW";
assert.equal(process.env.HIG_PRODUCTION_PLAY_REVIEW_APPROVED, approval,
  `Set HIG_PRODUCTION_PLAY_REVIEW_APPROVED=${approval}`);

const connectionString = process.env.MIGRATION_DATABASE_URL;
assert.ok(connectionString, "MIGRATION_DATABASE_URL is required");
const target = new URL(connectionString);
assert.equal(target.pathname.replace(/^\//, ""), "hig_school_production",
  "Refusing to provision outside hig_school_production");

const outputPath = process.env.HIG_PLAY_REVIEW_ACCOUNTS_FILE;
const localTestOutput = process.env.HIG_PLAY_REVIEW_ALLOW_LOCAL_TEST === "LOCAL_POSTGRES_ONLY" &&
  ["127.0.0.1", "localhost"].includes(target.hostname) &&
  outputPath === "/tmp/hig-play-review-accounts-test.txt";
assert.ok((outputPath?.startsWith("/review-output/") || localTestOutput) && outputPath.endsWith(".txt"),
  "HIG_PLAY_REVIEW_ACCOUNTS_FILE must be a .txt file under /review-output");

const ids = Object.freeze({
  tenant: "b1000000-0000-4000-8000-000000000001",
  plan: "b2000000-0000-4000-8000-000000000001",
  subscription: "b2100000-0000-4000-8000-000000000001",
  administrator: "b3000000-0000-4000-8000-000000000001",
  parent: "b3000000-0000-4000-8000-000000000002",
  driverUser: "b3000000-0000-4000-8000-000000000003",
  parentIdentity: "b4000000-0000-4000-8000-000000000001",
  driverIdentity: "b4000000-0000-4000-8000-000000000002",
  campus: "b5000000-0000-4000-8000-000000000001",
  session: "b6000000-0000-4000-8000-000000000001",
  schoolClass: "b7000000-0000-4000-8000-000000000001",
  section: "b7100000-0000-4000-8000-000000000001",
  subject: "b7110000-0000-4000-8000-000000000001",
  student: "b7200000-0000-4000-8000-000000000001",
  parentStudent: "b7300000-0000-4000-8000-000000000001",
  driver: "b8000000-0000-4000-8000-000000000001",
  vehicle: "b8100000-0000-4000-8000-000000000001",
  route: "b8200000-0000-4000-8000-000000000001",
  stopHome: "b8300000-0000-4000-8000-000000000001",
  stopSchool: "b8300000-0000-4000-8000-000000000002",
  driverAssignment: "b8400000-0000-4000-8000-000000000001",
  studentTransport: "b8500000-0000-4000-8000-000000000001",
  feeInvoice: "b9000000-0000-4000-8000-000000000001",
  diary: "ba000000-0000-4000-8000-000000000001",
});

const parentEmail = "play.parent.review@higschool.test";
const driverEmail = "play.driver.review@higschool.test";
const password = () => `${randomBytes(18).toString("base64url")}!9Aa`;
const parentPassword = password();
const driverPassword = password();
const parentHash = await hashPassword(parentPassword);
const driverHash = await hashPassword(driverPassword);

const reservation = await open(outputPath, "wx", 0o600);
await reservation.close();
let committed = false;
let connected = false;
const client = new Client({ connectionString });

try {
  await client.connect();
  connected = true;
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('hig.production.play.review'))");
  await client.query("SELECT set_config('app.platform_create', 'true', true)");
  await client.query("SELECT set_config('app.platform_policy_management', 'true', true)");
  await client.query("SELECT set_config('app.auth_service', 'true', true)");
  await client.query("SELECT set_config('app.mobile_auth_service', 'true', true)");
  await client.query("SELECT set_config('app.tenant_id', $1::text, true)", [ids.tenant]);

  const existing = await client.query(
    "SELECT name, slug FROM tenants WHERE id=$1::uuid", [ids.tenant]);
  if (existing.rows[0]) {
    assert.deepEqual(existing.rows[0], {
      name: "HIGA Play Review School",
      slug: "higa-play-review-school",
    }, "Fixed review tenant id belongs to an unexpected tenant");
  }

  await q(`INSERT INTO users (id,email,full_name,status) VALUES
    ($1::uuid,'play.admin.review@higschool.test','HIGA Play Review Administrator','active'),
    ($2::uuid,$4::text,'Aarav Review Parent','active'),
    ($3::uuid,$5::text,'HIGA Review Driver','active')
    ON CONFLICT (id) DO UPDATE SET status='active', updated_at=now()`,
    [ids.administrator, ids.parent, ids.driverUser, parentEmail, driverEmail]);

  await q(`INSERT INTO auth_credentials (user_id,password_hash,must_change_password,disabled_at)
    VALUES ($1::uuid,$3::text,false,NULL),($2::uuid,$4::text,false,NULL)
    ON CONFLICT (user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash,
      credential_version=auth_credentials.credential_version+1,
      must_change_password=false,disabled_at=NULL,password_changed_at=now(),updated_at=now()`,
    [ids.parent, ids.driverUser, parentHash, driverHash]);

  await q(`INSERT INTO plans (id,name,monthly_price_paise,annual_price_paise,active)
    VALUES ($1::uuid,'Play Review',0,0,true)
    ON CONFLICT (id) DO UPDATE SET active=true,updated_at=now()`, [ids.plan]);
  await q(`INSERT INTO tenants (id,name,slug,status,country_code)
    VALUES ($1::uuid,'HIGA Play Review School','higa-play-review-school','active','IN')
    ON CONFLICT (id) DO UPDATE SET status='active',updated_at=now()`, [ids.tenant]);
  await q(`INSERT INTO campuses (id,tenant_id,name,code,city)
    VALUES ($1::uuid,$2::uuid,'Review Campus','MAIN','New Delhi')
    ON CONFLICT (id) DO UPDATE SET updated_at=now()`, [ids.campus, ids.tenant]);
  await q(`INSERT INTO academic_sessions (id,tenant_id,name,starts_on,ends_on,status)
    VALUES ($1::uuid,$2::uuid,'2026-27','2026-04-01','2027-03-31','active')
    ON CONFLICT (id) DO UPDATE SET status='active',updated_at=now()`, [ids.session, ids.tenant]);
  await q(`INSERT INTO subscriptions (id,tenant_id,plan_id,status,period_ends_at)
    VALUES ($1::uuid,$2::uuid,$3::uuid,'active','2027-03-31T18:29:59Z')
    ON CONFLICT (id) DO UPDATE SET plan_id=EXCLUDED.plan_id,status='active',
      period_ends_at=EXCLUDED.period_ends_at,updated_at=now()`,
    [ids.subscription, ids.tenant, ids.plan]);

  const modules = ["student_information","attendance","academics","examinations",
    "fees_finance","communication","front_office","transport"];
  for (const moduleKey of modules) {
    await q(`INSERT INTO module_policies
      (tenant_id,module_key,enabled,source,configuration,updated_by)
      VALUES ($1::uuid,$2::text,true,'override','{}'::jsonb,$3::uuid)
      ON CONFLICT (tenant_id,module_key) DO UPDATE SET enabled=true,source='override',
        updated_by=EXCLUDED.updated_by,updated_at=now()`,
      [ids.tenant, moduleKey, ids.administrator]);
  }

  const parentFeatures = ["child_overview","attendance","homework","timetable",
    "examinations","results","fees_payments","notices","leave_requests",
    "transport_tracking","school_events","contact_school"];
  const driverFeatures = ["assigned_vehicle","assigned_route","pickup_list",
    "trip_control","gps_tracking","boarding","emergency_alerts"];
  for (const [audience, features] of [["parent", parentFeatures], ["transporter", driverFeatures]]) {
    for (const feature of features) {
      await q(`INSERT INTO tenant_app_feature_policies
        (tenant_id,audience,feature_key,enabled,source,configuration,updated_by)
        VALUES ($1::uuid,$2::app_audience,$3::text,true,'override','{}'::jsonb,$4::uuid)
        ON CONFLICT (tenant_id,audience,feature_key) DO UPDATE SET enabled=true,
          source='override',updated_by=EXCLUDED.updated_by,updated_at=now()`,
        [ids.tenant, audience, feature, ids.administrator]);
    }
  }

  await q(`INSERT INTO school_settings
    (tenant_id,short_name,email,phone,principal_name,address,updated_by)
    VALUES ($1::uuid,'HIGA Review','info@higautomation.com','+91 00000 00000',
      'Play Review','Synthetic reviewer tenant — New Delhi, India',$2::uuid)
    ON CONFLICT (tenant_id) DO UPDATE SET updated_at=now()`, [ids.tenant, ids.administrator]);
  await q(`INSERT INTO school_classes (id,tenant_id,name,code,display_order,active)
    VALUES ($1::uuid,$2::uuid,'Grade 8','G8',8,true)
    ON CONFLICT (tenant_id,code) DO UPDATE SET active=true,updated_at=now()`,
    [ids.schoolClass, ids.tenant]);
  await q(`INSERT INTO class_sections (id,tenant_id,class_id,name,capacity)
    VALUES ($1::uuid,$2::uuid,$3::uuid,'A',40)
    ON CONFLICT (class_id,name) DO UPDATE SET capacity=40,updated_at=now()`,
    [ids.section, ids.tenant, ids.schoolClass]);
  await q(`INSERT INTO subjects (id,tenant_id,name,code,type,active)
    VALUES ($1::uuid,$2::uuid,'Mathematics','MATH','core',true)
    ON CONFLICT (tenant_id,code) DO UPDATE SET active=true,updated_at=now()`,
    [ids.subject, ids.tenant]);
  await q(`INSERT INTO students
    (id,tenant_id,campus_id,academic_session_id,admission_number,roll_number,
     first_name,last_name,gender,date_of_birth,admission_date,class_name,section_name,
     guardian_name,guardian_phone,status,created_by)
    VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'PLAY-001','01','Aarav','Review',
      'male','2013-03-12',current_date,'Grade 8','A','Aarav Review Parent',
      '+91 00000 00001','active',$5::uuid)
    ON CONFLICT (tenant_id,id) DO UPDATE SET status='active',updated_at=now()`,
    [ids.student, ids.tenant, ids.campus, ids.session, ids.administrator]);

  await q(`INSERT INTO mobile_identities (id,tenant_id,user_id,audience,status)
    VALUES ($1::uuid,$3::uuid,$4::uuid,'parent','active'),
           ($2::uuid,$3::uuid,$5::uuid,'transporter','active')
    ON CONFLICT (tenant_id,user_id,audience) DO UPDATE SET status='active',
      revoked_at=NULL,revoked_reason=NULL,updated_at=now()`,
    [ids.parentIdentity, ids.driverIdentity, ids.tenant, ids.parent, ids.driverUser]);
  await q(`INSERT INTO mobile_identity_assignments
    (id,tenant_id,mobile_identity_id,resource_type,resource_id,status)
    VALUES ($1::uuid,$2::uuid,$3::uuid,'student',$4::uuid,'active')
    ON CONFLICT (tenant_id,mobile_identity_id,resource_type,resource_id)
    DO UPDATE SET status='active',revoked_at=NULL,revoked_reason=NULL,updated_at=now()`,
    [ids.parentStudent, ids.tenant, ids.parentIdentity, ids.student]);

  await q(`INSERT INTO fee_invoices
    (id,tenant_id,academic_session_id,student_id,fee_type,amount_paise,paid_paise,
     due_date,status,created_by)
    VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'Term fee',225000,105000,
      current_date+14,'partial',$5::uuid)
    ON CONFLICT (tenant_id,id) DO UPDATE SET due_date=current_date+14,
      amount_paise=225000,paid_paise=105000,status='partial',updated_at=now()`,
    [ids.feeInvoice, ids.tenant, ids.session, ids.student, ids.administrator]);
  await q(`INSERT INTO student_attendance
    (tenant_id,academic_session_id,student_id,attendance_date,status,note,marked_by)
    SELECT $1::uuid,$2::uuid,$3::uuid,current_date-day,
      CASE WHEN day=2 THEN 'absent'::attendance_status ELSE 'present'::attendance_status END,
      'Synthetic Play review attendance',$4::uuid
    FROM generate_series(0,6) day
    ON CONFLICT (tenant_id,student_id,attendance_date) DO UPDATE
      SET status=EXCLUDED.status,note=EXCLUDED.note,updated_at=now()`,
    [ids.tenant, ids.session, ids.student, ids.administrator]);
  await q(`INSERT INTO mobile_diary
    (id,tenant_id,academic_session_id,class_id,section_id,subject_id,title,
     description,record_date,due_date,created_by)
    VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,
      'Linear equations practice','Complete exercises 4.1 and 4.2.',
      current_date,current_date+3,$7::uuid)
    ON CONFLICT (tenant_id,id) DO UPDATE SET record_date=current_date,
      due_date=current_date+3`,
    [ids.diary, ids.tenant, ids.session, ids.schoolClass, ids.section, ids.subject, ids.administrator]);
  await q(`INSERT INTO module_records
    (tenant_id,academic_session_id,module_key,workflow,title,description,record_date,
     due_date,assignee,priority,status,metadata,created_by)
    VALUES
    ($1::uuid,$2::uuid,'Academics','Timetable','Monday timetable — Grade 8 A',
      'Mathematics 08:00 · English 09:00 · Science 10:30',current_date,NULL,
      'Grade 8 A','normal','open','{"fixture":"play-review"}'::jsonb,$3::uuid),
    ($1::uuid,$2::uuid,'Communicate','Notice Board','Parent-teacher meeting',
      'Meeting slots are available for Grade 8 A families.',current_date,current_date+7,
      'Grade 8 A','normal','open','{"fixture":"play-review"}'::jsonb,$3::uuid)`,
    [ids.tenant, ids.session, ids.administrator]);

  await q(`INSERT INTO transport_drivers
    (id,tenant_id,user_id,employee_code,mobile_number,license_number,license_expiry,status)
    VALUES ($1::uuid,$2::uuid,$3::uuid,'PLAY-DRV-001','+91 00000 00002',
      'PLAY-REVIEW-LICENCE',current_date+365,'active')
    ON CONFLICT (tenant_id,user_id) DO UPDATE SET status='active',updated_at=now()`,
    [ids.driver, ids.tenant, ids.driverUser]);
  await q(`INSERT INTO transport_vehicles
    (id,tenant_id,vehicle_number,registration_number,vehicle_type,capacity,gps_device_id,status)
    VALUES ($1::uuid,$2::uuid,'Review Bus 01','DL-PLAY-0001','school_bus',40,
      'PLAY-REVIEW-PHONE','active')
    ON CONFLICT (tenant_id,vehicle_number) DO UPDATE SET status='active',updated_at=now()`,
    [ids.vehicle, ids.tenant]);
  await q(`INSERT INTO transport_routes
    (id,tenant_id,route_name,route_code,direction,shift,status)
    VALUES ($1::uuid,$2::uuid,'Review Route A','PLAY-A','both','morning','active')
    ON CONFLICT (tenant_id,route_code) DO UPDATE SET status='active',updated_at=now()`,
    [ids.route, ids.tenant]);
  await q(`INSERT INTO transport_route_stops
    (id,tenant_id,route_id,stop_name,sequence_number,latitude,longitude,
     pickup_time,drop_time,geofence_radius_meters,status)
    VALUES
      ($1::uuid,$3::uuid,$4::uuid,'Review Home Stop',1,28.6139,77.2090,'07:30','14:30',200,'active'),
      ($2::uuid,$3::uuid,$4::uuid,'School Main Gate',2,28.6200,77.2150,'08:00','14:00',200,'active')
    ON CONFLICT (tenant_id,route_id,sequence_number) DO UPDATE
      SET status='active',updated_at=now()`, [ids.stopHome, ids.stopSchool, ids.tenant, ids.route]);
  await q(`INSERT INTO transport_driver_assignments
    (id,tenant_id,driver_id,vehicle_id,route_id,effective_from,status)
    VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,current_date,'active')
    ON CONFLICT (tenant_id,id) DO UPDATE SET effective_from=current_date,
      effective_to=NULL,status='active',updated_at=now()`,
    [ids.driverAssignment, ids.tenant, ids.driver, ids.vehicle, ids.route]);
  await q(`INSERT INTO transport_student_assignments
    (id,tenant_id,student_id,route_id,pickup_stop_id,drop_stop_id,effective_from,status)
    VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,current_date,'active')
    ON CONFLICT (tenant_id,id) DO UPDATE SET effective_from=current_date,
      effective_to=NULL,status='active',updated_at=now()`,
    [ids.studentTransport, ids.tenant, ids.student, ids.route, ids.stopHome, ids.stopSchool]);
  await q(`INSERT INTO transport_trips
    (tenant_id,driver_assignment_id,route_id,service_date,direction,scheduled_start_at,status)
    SELECT $1::uuid,$2::uuid,$3::uuid,day::date,'pickup',day::date+time '07:30','scheduled'
    FROM generate_series(current_date,current_date+60,interval '1 day') day
    ON CONFLICT (tenant_id,route_id,service_date,direction) DO NOTHING`,
    [ids.tenant, ids.driverAssignment, ids.route]);

  await q(`INSERT INTO audit_events
    (tenant_id,actor_id,action,resource_type,resource_id,reason,metadata)
    VALUES ($1::uuid,$2::uuid,'play.review.provision','tenant',$1::text,
      'Google Play reviewer access',
      '{"synthetic":true,"realStudentData":false}'::jsonb)`, [ids.tenant, ids.administrator]);

  await client.query("COMMIT");
  committed = true;
  const text = [
    "HIGA Google Play production reviewer accounts",
    "Synthetic records only. Do not use for normal school operations.",
    `tenant_id=${ids.tenant}`,
    "",
    "[parent]",
    `email=${parentEmail}`,
    `password=${parentPassword}`,
    "principal_type=parent",
    "",
    "[transporter]",
    `email=${driverEmail}`,
    `password=${driverPassword}`,
    "principal_type=transporter",
    "",
  ].join("\n");
  await writeFile(outputPath, text, { flag: "w", mode: 0o600 });
  await chmod(outputPath, 0o600);
  console.log("PRODUCTION_PLAY_REVIEW_FIXTURE=PROVISIONED");
  console.log(`TENANT_ID=${ids.tenant}`);
  console.log("PERSONAS=parent,transporter");
  console.log("Credentials were written to the protected output file and were not printed.");
} catch (error) {
  if (connected) await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end().catch(() => undefined);
  if (!committed) await rm(outputPath, { force: true });
}

async function q(text, values = []) {
  return client.query(text, values);
}
