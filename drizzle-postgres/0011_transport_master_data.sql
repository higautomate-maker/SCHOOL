-- Stage 10 Module 1: transport master data and assignment foundation.
-- Tenant-specific sample data is kept in scripts/stage10-greenfield-transport-seed.sql.

CREATE TABLE "transport_drivers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "employee_code" text,
  "mobile_number" text,
  "license_number" text NOT NULL,
  "license_expiry" date,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "transport_drivers_status_ck"
    CHECK ("status" IN ('active', 'inactive', 'suspended')),
  CONSTRAINT "transport_drivers_tenant_id_id_uq" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "transport_drivers_tenant_user_uq" UNIQUE ("tenant_id", "user_id"),
  CONSTRAINT "transport_drivers_tenant_license_uq" UNIQUE ("tenant_id", "license_number")
);

CREATE TABLE "transport_vehicles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "vehicle_number" text NOT NULL,
  "registration_number" text NOT NULL,
  "vehicle_type" text DEFAULT 'bus' NOT NULL,
  "capacity" integer NOT NULL,
  "gps_device_id" text,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "transport_vehicles_capacity_ck" CHECK ("capacity" BETWEEN 1 AND 200),
  CONSTRAINT "transport_vehicles_status_ck"
    CHECK ("status" IN ('active', 'maintenance', 'inactive')),
  CONSTRAINT "transport_vehicles_tenant_id_id_uq" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "transport_vehicles_tenant_number_uq" UNIQUE ("tenant_id", "vehicle_number"),
  CONSTRAINT "transport_vehicles_tenant_registration_uq"
    UNIQUE ("tenant_id", "registration_number")
);

CREATE TABLE "transport_routes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "route_name" text NOT NULL,
  "route_code" text NOT NULL,
  "direction" text DEFAULT 'both' NOT NULL,
  "shift" text DEFAULT 'morning' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "transport_routes_direction_ck"
    CHECK ("direction" IN ('pickup', 'drop', 'both')),
  CONSTRAINT "transport_routes_shift_ck"
    CHECK ("shift" IN ('morning', 'afternoon', 'evening', 'custom')),
  CONSTRAINT "transport_routes_status_ck"
    CHECK ("status" IN ('active', 'inactive')),
  CONSTRAINT "transport_routes_tenant_id_id_uq" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "transport_routes_tenant_code_uq" UNIQUE ("tenant_id", "route_code")
);

CREATE TABLE "transport_route_stops" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "route_id" uuid NOT NULL,
  "stop_name" text NOT NULL,
  "sequence_number" integer NOT NULL,
  "latitude" double precision NOT NULL,
  "longitude" double precision NOT NULL,
  "pickup_time" time,
  "drop_time" time,
  "geofence_radius_meters" integer DEFAULT 200 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "transport_route_stops_route_fk"
    FOREIGN KEY ("tenant_id", "route_id")
    REFERENCES "transport_routes"("tenant_id", "id") ON DELETE CASCADE,
  CONSTRAINT "transport_route_stops_sequence_ck" CHECK ("sequence_number" > 0),
  CONSTRAINT "transport_route_stops_coordinates_ck"
    CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180),
  CONSTRAINT "transport_route_stops_geofence_ck"
    CHECK ("geofence_radius_meters" BETWEEN 25 AND 5000),
  CONSTRAINT "transport_route_stops_status_ck"
    CHECK ("status" IN ('active', 'inactive')),
  CONSTRAINT "transport_route_stops_tenant_id_id_uq" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "transport_route_stops_route_sequence_uq"
    UNIQUE ("tenant_id", "route_id", "sequence_number")
);

CREATE TABLE "transport_driver_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "driver_id" uuid NOT NULL,
  "vehicle_id" uuid NOT NULL,
  "route_id" uuid NOT NULL,
  "effective_from" date DEFAULT current_date NOT NULL,
  "effective_to" date,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "transport_driver_assignments_driver_fk"
    FOREIGN KEY ("tenant_id", "driver_id")
    REFERENCES "transport_drivers"("tenant_id", "id") ON DELETE CASCADE,
  CONSTRAINT "transport_driver_assignments_vehicle_fk"
    FOREIGN KEY ("tenant_id", "vehicle_id")
    REFERENCES "transport_vehicles"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "transport_driver_assignments_route_fk"
    FOREIGN KEY ("tenant_id", "route_id")
    REFERENCES "transport_routes"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "transport_driver_assignments_dates_ck"
    CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
  CONSTRAINT "transport_driver_assignments_status_ck"
    CHECK ("status" IN ('active', 'inactive')),
  CONSTRAINT "transport_driver_assignments_tenant_id_id_uq"
    UNIQUE ("tenant_id", "id")
);

CREATE UNIQUE INDEX "transport_driver_assignments_active_driver_uq"
  ON "transport_driver_assignments" ("tenant_id", "driver_id")
  WHERE "status" = 'active' AND "effective_to" IS NULL;

CREATE UNIQUE INDEX "transport_driver_assignments_active_vehicle_uq"
  ON "transport_driver_assignments" ("tenant_id", "vehicle_id")
  WHERE "status" = 'active' AND "effective_to" IS NULL;

CREATE TABLE "transport_student_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL,
  "route_id" uuid NOT NULL,
  "pickup_stop_id" uuid,
  "drop_stop_id" uuid,
  "effective_from" date DEFAULT current_date NOT NULL,
  "effective_to" date,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "transport_student_assignments_student_fk"
    FOREIGN KEY ("tenant_id", "student_id")
    REFERENCES "students"("tenant_id", "id") ON DELETE CASCADE,
  CONSTRAINT "transport_student_assignments_route_fk"
    FOREIGN KEY ("tenant_id", "route_id")
    REFERENCES "transport_routes"("tenant_id", "id") ON DELETE CASCADE,
  CONSTRAINT "transport_student_assignments_pickup_stop_fk"
    FOREIGN KEY ("tenant_id", "pickup_stop_id")
    REFERENCES "transport_route_stops"("tenant_id", "id") ON DELETE SET NULL,
  CONSTRAINT "transport_student_assignments_drop_stop_fk"
    FOREIGN KEY ("tenant_id", "drop_stop_id")
    REFERENCES "transport_route_stops"("tenant_id", "id") ON DELETE SET NULL,
  CONSTRAINT "transport_student_assignments_dates_ck"
    CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
  CONSTRAINT "transport_student_assignments_status_ck"
    CHECK ("status" IN ('active', 'inactive')),
  CONSTRAINT "transport_student_assignments_tenant_id_id_uq"
    UNIQUE ("tenant_id", "id")
);

CREATE UNIQUE INDEX "transport_student_assignments_active_student_uq"
  ON "transport_student_assignments" ("tenant_id", "student_id")
  WHERE "status" = 'active' AND "effective_to" IS NULL;

CREATE TABLE "transport_trips" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "driver_assignment_id" uuid NOT NULL,
  "route_id" uuid NOT NULL,
  "service_date" date NOT NULL,
  "direction" text NOT NULL,
  "scheduled_start_at" timestamp with time zone,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "transport_trips_driver_assignment_fk"
    FOREIGN KEY ("tenant_id", "driver_assignment_id")
    REFERENCES "transport_driver_assignments"("tenant_id", "id") ON DELETE CASCADE,
  CONSTRAINT "transport_trips_route_fk"
    FOREIGN KEY ("tenant_id", "route_id")
    REFERENCES "transport_routes"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "transport_trips_direction_ck"
    CHECK ("direction" IN ('pickup', 'drop')),
  CONSTRAINT "transport_trips_status_ck"
    CHECK ("status" IN ('scheduled', 'active', 'paused', 'completed', 'cancelled')),
  CONSTRAINT "transport_trips_tenant_id_id_uq" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "transport_trips_route_service_uq"
    UNIQUE ("tenant_id", "route_id", "service_date", "direction")
);

CREATE INDEX "transport_route_stops_route_idx"
  ON "transport_route_stops" ("tenant_id", "route_id", "sequence_number");
CREATE INDEX "transport_driver_assignments_lookup_idx"
  ON "transport_driver_assignments" ("tenant_id", "driver_id", "status", "effective_from");
CREATE INDEX "transport_student_assignments_route_idx"
  ON "transport_student_assignments" ("tenant_id", "route_id", "status");
CREATE INDEX "transport_trips_driver_idx"
  ON "transport_trips" ("tenant_id", "driver_assignment_id", "service_date", "status");

ALTER TABLE "transport_drivers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_drivers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "transport_vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_vehicles" FORCE ROW LEVEL SECURITY;
ALTER TABLE "transport_routes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_routes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "transport_route_stops" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_route_stops" FORCE ROW LEVEL SECURITY;
ALTER TABLE "transport_driver_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_driver_assignments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "transport_student_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_student_assignments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "transport_trips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_trips" FORCE ROW LEVEL SECURITY;

CREATE POLICY "transport_drivers_isolation" ON "transport_drivers"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());
CREATE POLICY "transport_vehicles_isolation" ON "transport_vehicles"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());
CREATE POLICY "transport_routes_isolation" ON "transport_routes"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());
CREATE POLICY "transport_route_stops_isolation" ON "transport_route_stops"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());
CREATE POLICY "transport_driver_assignments_isolation"
  ON "transport_driver_assignments"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());
CREATE POLICY "transport_student_assignments_isolation"
  ON "transport_student_assignments"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());
CREATE POLICY "transport_trips_isolation" ON "transport_trips"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

CREATE OR REPLACE FUNCTION validate_mobile_identity_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS '
DECLARE
  identity_audience "app_audience";
BEGIN
  SELECT "audience"
    INTO identity_audience
    FROM "mobile_identities"
   WHERE "tenant_id" = NEW."tenant_id"
     AND "id" = NEW."mobile_identity_id";

  IF identity_audience IS NULL THEN
    RAISE EXCEPTION ''Mobile identity is unavailable'';
  END IF;

  IF identity_audience IN (''parent'', ''student'') THEN
    IF NEW."resource_type" <> ''student'' THEN
      RAISE EXCEPTION
        ''Parent and Student identities require a Student assignment'';
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM "students"
       WHERE "tenant_id" = NEW."tenant_id"
         AND "id" = NEW."resource_id"
    ) THEN
      RAISE EXCEPTION
        ''Assigned Student is unavailable in this tenant'';
    END IF;
  ELSIF identity_audience = ''transporter'' THEN
    IF NEW."resource_type" = ''student'' AND NOT EXISTS (
      SELECT 1 FROM "students"
       WHERE "tenant_id" = NEW."tenant_id"
         AND "id" = NEW."resource_id"
    ) THEN
      RAISE EXCEPTION ''Assigned Student is unavailable in this tenant'';
    ELSIF NEW."resource_type" = ''vehicle'' AND NOT EXISTS (
      SELECT 1 FROM "transport_vehicles"
       WHERE "tenant_id" = NEW."tenant_id"
         AND "id" = NEW."resource_id"
    ) THEN
      RAISE EXCEPTION ''Assigned Vehicle is unavailable in this tenant'';
    ELSIF NEW."resource_type" = ''route'' AND NOT EXISTS (
      SELECT 1 FROM "transport_routes"
       WHERE "tenant_id" = NEW."tenant_id"
         AND "id" = NEW."resource_id"
    ) THEN
      RAISE EXCEPTION ''Assigned Route is unavailable in this tenant'';
    ELSIF NEW."resource_type" = ''trip'' AND NOT EXISTS (
      SELECT 1 FROM "transport_trips"
       WHERE "tenant_id" = NEW."tenant_id"
         AND "id" = NEW."resource_id"
    ) THEN
      RAISE EXCEPTION ''Assigned Trip is unavailable in this tenant'';
    END IF;
  END IF;

  RETURN NEW;
END
';
REVOKE ALL ON "transport_drivers" FROM PUBLIC;
REVOKE ALL ON "transport_vehicles" FROM PUBLIC;
REVOKE ALL ON "transport_routes" FROM PUBLIC;
REVOKE ALL ON "transport_route_stops" FROM PUBLIC;
REVOKE ALL ON "transport_driver_assignments" FROM PUBLIC;
REVOKE ALL ON "transport_student_assignments" FROM PUBLIC;
REVOKE ALL ON "transport_trips" FROM PUBLIC;
