"use client";

import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authenticatedFetch } from "../auth-client";
import styles from "./transport-production.module.css";

type StudentOption = {
  id: string;
  admissionNumber: string;
  fullName: string;
  className: string;
  sectionName: string;
};

type StaffUser = {
  id: string;
  name: string;
  email: string;
  status: string;
};

type Driver = {
  id: string;
  userId: string;
  name: string;
  email: string;
  employeeCode: string | null;
  mobileNumber: string | null;
  licenseNumber: string;
  licenseExpiry: string | null;
  status: string;
};

type Vehicle = {
  id: string;
  vehicleNumber: string;
  registrationNumber: string;
  vehicleType: string;
  capacity: number;
  gpsDeviceId: string | null;
  status: string;
};

type Route = {
  id: string;
  routeName: string;
  routeCode: string;
  direction: string;
  shift: string;
  status: string;
};

type Stop = {
  id: string;
  routeId: string;
  stopName: string;
  sequenceNumber: number;
  latitude: number;
  longitude: number;
  pickupTime: string | null;
  dropTime: string | null;
  geofenceRadiusMeters: number;
  status: string;
};

type DriverAssignment = {
  id: string;
  driverId: string;
  vehicleId: string;
  routeId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
};

type StudentAssignment = {
  id: string;
  studentId: string;
  routeId: string;
  pickupStopId: string | null;
  dropStopId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
};

type Trip = {
  id: string;
  driverAssignmentId: string;
  routeId: string;
  serviceDate: string;
  direction: string;
  scheduledStartAt: string | null;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
};

type LocationEvent = {
  id: string;
  tripId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedKph: number | null;
  headingDegrees: number | null;
  capturedAt: string;
};

type TransportEvent = {
  id: string;
  tripId: string | null;
  studentId: string | null;
  eventType: string;
  latitude: number | null;
  longitude: number | null;
  capturedAt: string;
  metadata: Record<string, unknown>;
};

type TransportSnapshot = {
  staffUsers: StaffUser[];
  drivers: Driver[];
  vehicles: Vehicle[];
  routes: Route[];
  stops: Stop[];
  driverAssignments: DriverAssignment[];
  studentAssignments: StudentAssignment[];
  trips: Trip[];
  latestLocations: LocationEvent[];
  recentEvents: TransportEvent[];
};

type TransportAction =
  | {
      action: "create_vehicle";
      vehicleNumber: string;
      registrationNumber: string;
      vehicleType: string;
      capacity: number;
      gpsDeviceId: string | null;
    }
  | {
      action: "create_driver";
      userId: string;
      employeeCode: string | null;
      mobileNumber: string | null;
      licenseNumber: string;
      licenseExpiry: string | null;
    }
  | {
      action: "create_route";
      routeName: string;
      routeCode: string;
      direction: "pickup" | "drop" | "both";
      shift: "morning" | "afternoon" | "evening" | "custom";
    }
  | {
      action: "create_stop";
      routeId: string;
      stopName: string;
      sequenceNumber: number;
      latitude: number;
      longitude: number;
      pickupTime: string | null;
      dropTime: string | null;
      geofenceRadiusMeters: number;
    }
  | {
      action: "assign_driver";
      driverId: string;
      vehicleId: string;
      routeId: string;
      effectiveFrom: string;
    }
  | {
      action: "assign_student";
      studentId: string;
      routeId: string;
      pickupStopId: string | null;
      dropStopId: string | null;
      effectiveFrom: string;
    }
  | {
      action: "schedule_trip";
      driverAssignmentId: string;
      routeId: string;
      serviceDate: string;
      direction: "pickup" | "drop";
      scheduledStartAt: string | null;
    };

const emptySnapshot: TransportSnapshot = {
  staffUsers: [],
  drivers: [],
  vehicles: [],
  routes: [],
  stops: [],
  driverAssignments: [],
  studentAssignments: [],
  trips: [],
  latestLocations: [],
  recentEvents: [],
};

const tabs = [
  ["Transport Dashboard", "Dashboard"],
  ["Transport Guide", "Guide"],
  ["Manage Vehicles", "Vehicles & Drivers"],
  ["Manage Routes", "Routes & Assignments"],
  ["Live Vehicle Tracking", "Live Tracking"],
] as const;

function arrayValue<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeSnapshot(value: unknown): TransportSnapshot {
  const source =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    staffUsers: arrayValue<StaffUser>(source.staffUsers),
    drivers: arrayValue<Driver>(source.drivers),
    vehicles: arrayValue<Vehicle>(source.vehicles),
    routes: arrayValue<Route>(source.routes),
    stops: arrayValue<Stop>(source.stops),
    driverAssignments: arrayValue<DriverAssignment>(
      source.driverAssignments,
    ),
    studentAssignments: arrayValue<StudentAssignment>(
      source.studentAssignments,
    ),
    trips: arrayValue<Trip>(source.trips),
    latestLocations: arrayValue<LocationEvent>(source.latestLocations),
    recentEvents: arrayValue<TransportEvent>(source.recentEvents),
  };
}

function messageFrom(value: unknown, fallback: string): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "string"
  ) {
    return (value as { error: string }).error;
  }
  return fallback;
}

function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function formatEventName(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function toIsoDateTime(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function freshness(capturedAt: string): {
  label: string;
  tone: "online" | "stale" | "offline";
} {
  const age = Date.now() - new Date(capturedAt).getTime();
  if (Number.isFinite(age) && age <= 2 * 60 * 1000) {
    return { label: "Online", tone: "online" };
  }
  if (Number.isFinite(age) && age <= 15 * 60 * 1000) {
    return { label: "Delayed", tone: "stale" };
  }
  return { label: "Offline", tone: "offline" };
}

export function TransportProductionPage({
  schoolId,
  page,
  students,
  onPage,
  onSaved,
}: {
  schoolId: string;
  page: string;
  students: StudentOption[];
  onPage: (page: string) => void;
  onSaved: (message: string) => void;
}) {
  const [snapshot, setSnapshot] =
    useState<TransportSnapshot>(emptySnapshot);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  const endpoint = schoolId
    ? `/api/v1/schools/${encodeURIComponent(schoolId)}/transport`
    : "";

  const load = useCallback(async () => {
    if (!endpoint) {
      setSnapshot(emptySnapshot);
      setError("No school workspace is selected.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch(endpoint, {
        headers: { accept: "application/json" },
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(messageFrom(body, "Transport data could not be loaded."));
      }
      const transport =
        typeof body === "object" && body !== null && "transport" in body
          ? (body as { transport?: unknown }).transport
          : null;
      setSnapshot(normalizeSnapshot(transport));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Transport data could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);


  const mutate = useCallback(
    async (action: TransportAction, successMessage: string) => {
      if (!endpoint) return false;
      setSaving(action.action);
      setError("");
      try {
        const response = await authenticatedFetch(endpoint, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify(action),
        });
        const body: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            messageFrom(body, "The transport operation could not be saved."),
          );
        }
        onSaved(successMessage);
        await load();
        return true;
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "The transport operation could not be saved.",
        );
        return false;
      } finally {
        setSaving("");
      }
    },
    [endpoint, load, onSaved],
  );

  const openRoute = useCallback(
    (routeId: string) => {
      setSelectedRouteId(routeId);
      onPage("Route Details");
    },
    [onPage],
  );

  let content: ReactNode;
  if (loading) {
    content = <LoadingPanel />;
  } else if (page === "Transport Guide") {
    content = <TransportGuide onPage={onPage} />;
  } else if (page === "Add Vehicle") {
    content = (
      <VehicleForm
        busy={saving === "create_vehicle"}
        onCancel={() => onPage("Manage Vehicles")}
        onSave={async (action) => {
          const saved = await mutate(action, "Vehicle added to the fleet.");
          if (saved) onPage("Manage Vehicles");
        }}
      />
    );
  } else if (page === "Manage Vehicles") {
    content = (
      <VehicleDriverRegistry
        snapshot={snapshot}
        busy={saving}
        onAddVehicle={() => onPage("Add Vehicle")}
        onCreateDriver={(action) =>
          mutate(action, "Driver registered for Transport.")
        }
      />
    );
  } else if (page === "Add Route") {
    content = (
      <RouteForm
        busy={saving === "create_route"}
        onCancel={() => onPage("Manage Routes")}
        onSave={async (action) => {
          const saved = await mutate(action, "Route created.");
          if (saved) onPage("Manage Routes");
        }}
      />
    );
  } else if (page === "Manage Routes") {
    content = (
      <RoutesRegistry
        snapshot={snapshot}
        onAddRoute={() => onPage("Add Route")}
        onOpenRoute={openRoute}
      />
    );
  } else if (page === "Route Details") {
    content = (
      <RouteOperations
        snapshot={snapshot}
        students={students}
        selectedRouteId={selectedRouteId}
        busy={saving}
        onSelectRoute={setSelectedRouteId}
        onBack={() => onPage("Manage Routes")}
        onMutate={mutate}
      />
    );
  } else if (page === "Fee Settings") {
    content = <TransportFeeBoundary onPage={onPage} />;
  } else if (page === "Live Vehicle Tracking") {
    content = <LiveTracking snapshot={snapshot} onRefresh={load} />;
  } else {
    content = (
      <TransportDashboard
        snapshot={snapshot}
        onPage={onPage}
        onOpenRoute={openRoute}
      />
    );
  }

  return (
    <section className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <span>STAGE 10 · MODULE 1</span>
          <h1>Transport & GPS Command Center</h1>
          <p>
            Production fleet records, route assignments, scheduled trips and
            foreground driver GPS updates.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.secondaryButton} onClick={() => void load()}>
            Refresh
          </button>
          {page === "Manage Routes" ? (
            <button onClick={() => onPage("Add Route")}>＋ Add Route</button>
          ) : page === "Manage Vehicles" ||
            page === "Transport Dashboard" ? (
            <button onClick={() => onPage("Add Vehicle")}>
              ＋ Add Vehicle
            </button>
          ) : null}
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Transport sections">
        {tabs.map(([key, label]) => (
          <button
            className={page === key ? styles.activeTab : ""}
            key={key}
            onClick={() => onPage(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {error ? (
        <div className={styles.errorBanner} role="alert">
          <div>
            <b>Transport workspace needs attention</b>
            <span>{error}</span>
          </div>
          <button onClick={() => void load()}>Try again</button>
        </div>
      ) : null}

      {content}
    </section>
  );
}

function LoadingPanel() {
  return (
    <article className={styles.loadingPanel}>
      <div />
      <b>Loading production transport records…</b>
      <span>Checking fleet, routes, assignments, trips and GPS events.</span>
    </article>
  );
}

function TransportDashboard({
  snapshot,
  onPage,
  onOpenRoute,
}: {
  snapshot: TransportSnapshot;
  onPage: (page: string) => void;
  onOpenRoute: (routeId: string) => void;
}) {
  const activeAssignments = snapshot.studentAssignments.filter(
    (record) => record.status === "active",
  );
  const today = currentDate();
  const todaysTrips = snapshot.trips.filter(
    (trip) => trip.serviceDate === today,
  );
  const onlineVehicles = snapshot.latestLocations.filter(
    (location) => freshness(location.capturedAt).tone === "online",
  ).length;
  const sosCount = snapshot.recentEvents.filter(
    (event) => event.eventType === "sos",
  ).length;

  return (
    <>
      <section className={styles.metrics}>
        <Metric
          label="Active Vehicles"
          value={snapshot.vehicles.filter((item) => item.status === "active").length}
          note={`${onlineVehicles} reporting now`}
        />
        <Metric
          label="Active Routes"
          value={snapshot.routes.filter((item) => item.status === "active").length}
          note={`${snapshot.stops.length} configured stops`}
        />
        <Metric
          label="Students Assigned"
          value={activeAssignments.length}
          note="Tenant-scoped assignments"
        />
        <Metric
          label="Trips Today"
          value={todaysTrips.length}
          note={`${sosCount} recent SOS event${sosCount === 1 ? "" : "s"}`}
        />
      </section>

      <section className={styles.dashboardGrid}>
        <article className={styles.card}>
          <CardHeader
            title="Fleet Readiness"
            subtitle="Live records from PostgreSQL"
            action="Manage fleet"
            onAction={() => onPage("Manage Vehicles")}
          />
          <DataTable
            headers={["Vehicle", "Registration", "Capacity", "GPS", "Status"]}
            rows={snapshot.vehicles.slice(0, 6).map((vehicle) => [
              vehicle.vehicleNumber,
              vehicle.registrationNumber,
              `${vehicle.capacity} seats`,
              vehicle.gpsDeviceId || "Driver app",
              vehicle.status,
            ])}
            empty="No vehicles have been registered."
          />
        </article>

        <article className={styles.card}>
          <CardHeader
            title="Route Operations"
            subtitle="Stops and student coverage"
            action="Manage routes"
            onAction={() => onPage("Manage Routes")}
          />
          <div className={styles.routeCards}>
            {snapshot.routes.slice(0, 6).map((route) => {
              const stops = snapshot.stops.filter(
                (stop) => stop.routeId === route.id,
              ).length;
              const students = activeAssignments.filter(
                (assignment) => assignment.routeId === route.id,
              ).length;
              return (
                <button key={route.id} onClick={() => onOpenRoute(route.id)}>
                  <span>
                    <b>{route.routeName}</b>
                    <small>
                      {route.routeCode} · {route.shift} · {route.direction}
                    </small>
                  </span>
                  <strong>
                    {stops} stops · {students} students
                  </strong>
                </button>
              );
            })}
            {!snapshot.routes.length ? (
              <EmptyState
                title="No routes configured"
                text="Create the first route, then add ordered stops."
              />
            ) : null}
          </div>
        </article>

        <article className={styles.card}>
          <CardHeader
            title="Today's Trips"
            subtitle="Scheduled and driver-controlled status"
          />
          <DataTable
            headers={["Route", "Direction", "Start", "Status"]}
            rows={todaysTrips.slice(0, 8).map((trip) => {
              const route = snapshot.routes.find(
                (item) => item.id === trip.routeId,
              );
              return [
                route?.routeName ?? "Unknown route",
                trip.direction,
                formatDateTime(trip.scheduledStartAt),
                trip.status,
              ];
            })}
            empty="No trips are scheduled for today."
          />
        </article>

        <article className={styles.card}>
          <CardHeader
            title="GPS & Safety"
            subtitle="Latest foreground driver events"
            action="Open live tracking"
            onAction={() => onPage("Live Vehicle Tracking")}
          />
          <div className={styles.safetySummary}>
            <p>
              <span>Vehicles reporting within 2 minutes</span>
              <b>{onlineVehicles}</b>
            </p>
            <p>
              <span>Latest GPS positions retained</span>
              <b>{snapshot.latestLocations.length}</b>
            </p>
            <p className={sosCount ? styles.dangerText : ""}>
              <span>Recent SOS events</span>
              <b>{sosCount}</b>
            </p>
          </div>
        </article>
      </section>
    </>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note: string;
}) {
  return (
    <article>
      <span>{label}</span>
      <b>{value}</b>
      <small>{note}</small>
    </article>
  );
}

function CardHeader({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string;
  subtitle: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <header className={styles.cardHeader}>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {action && onAction ? <button onClick={onAction}>{action}</button> : null}
    </header>
  );
}

function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: Array<Array<string | number>>;
  empty: string;
}) {
  if (!rows.length) {
    return <EmptyState title={empty} text="Records will appear here after setup." />;
  }
  const gridTemplateColumns = `repeat(${headers.length}, minmax(130px, 1fr))`;
  return (
    <div className={styles.table}>
      <div className={styles.tableHead} style={{ gridTemplateColumns }}>
        {headers.map((header) => (
          <b key={header}>{header}</b>
        ))}
      </div>
      {rows.map((row, index) => (
        <div
          className={styles.tableRow}
          style={{ gridTemplateColumns }}
          key={`${index}-${String(row[0])}`}
        >
          {row.map((cell, cellIndex) => (
            <span key={`${cellIndex}-${String(cell)}`}>{cell}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className={styles.empty}>
      <i>TR</i>
      <b>{title}</b>
      <span>{text}</span>
    </div>
  );
}

function VehicleDriverRegistry({
  snapshot,
  busy,
  onAddVehicle,
  onCreateDriver,
}: {
  snapshot: TransportSnapshot;
  busy: string;
  onAddVehicle: () => void;
  onCreateDriver: (action: Extract<TransportAction, { action: "create_driver" }>) => Promise<boolean>;
}) {
  return (
    <section className={styles.registryGrid}>
      <article className={`${styles.card} ${styles.wideCard}`}>
        <CardHeader
          title="Vehicles"
          subtitle="Registration, capacity and GPS identity"
          action="Add vehicle"
          onAction={onAddVehicle}
        />
        <DataTable
          headers={[
            "Vehicle",
            "Registration",
            "Type",
            "Capacity",
            "GPS Device",
            "Status",
          ]}
          rows={snapshot.vehicles.map((vehicle) => [
            vehicle.vehicleNumber,
            vehicle.registrationNumber,
            vehicle.vehicleType,
            vehicle.capacity,
            vehicle.gpsDeviceId || "Driver app",
            vehicle.status,
          ])}
          empty="No vehicles are registered."
        />
      </article>

      <article className={`${styles.card} ${styles.wideCard}`}>
        <CardHeader
          title="Registered Drivers"
          subtitle="Existing school users approved for Transport"
        />
        <DataTable
          headers={[
            "Driver",
            "Mobile",
            "Employee Code",
            "Licence",
            "Expiry",
            "Status",
          ]}
          rows={snapshot.drivers.map((driver) => [
            driver.name,
            driver.mobileNumber || "—",
            driver.employeeCode || "—",
            driver.licenseNumber,
            driver.licenseExpiry || "—",
            driver.status,
          ])}
          empty="No drivers are registered."
        />
      </article>

      <DriverForm
        users={snapshot.staffUsers}
        busy={busy === "create_driver"}
        onSave={onCreateDriver}
      />
    </section>
  );
}

function VehicleForm({
  busy,
  onCancel,
  onSave,
}: {
  busy: boolean;
  onCancel: () => void;
  onSave: (
    action: Extract<TransportAction, { action: "create_vehicle" }>,
  ) => Promise<void>;
}) {
  return (
    <form
      className={styles.formCard}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void onSave({
          action: "create_vehicle",
          vehicleNumber: String(form.get("vehicleNumber") ?? "").trim(),
          registrationNumber: String(
            form.get("registrationNumber") ?? "",
          ).trim(),
          vehicleType: String(form.get("vehicleType") ?? "school_bus"),
          capacity: Number(form.get("capacity")),
          gpsDeviceId:
            String(form.get("gpsDeviceId") ?? "").trim() || null,
        });
      }}
    >
      <div className={styles.formHeader}>
        <div>
          <button type="button" onClick={onCancel}>
            ← Back to vehicles
          </button>
          <h2>Add Production Vehicle</h2>
          <p>
            Register the fleet identity used by route assignments and the
            Driver app.
          </p>
        </div>
      </div>
      <div className={styles.formGrid}>
        <label>
          Vehicle name or number *
          <input name="vehicleNumber" required placeholder="Bus 01" />
        </label>
        <label>
          Registration number *
          <input name="registrationNumber" required placeholder="HR36AB1234" />
        </label>
        <label>
          Vehicle type *
          <select name="vehicleType" defaultValue="school_bus">
            <option value="school_bus">School bus</option>
            <option value="mini_bus">Mini bus</option>
            <option value="van">Van</option>
            <option value="car">Car</option>
          </select>
        </label>
        <label>
          Seating capacity *
          <input
            name="capacity"
            type="number"
            min="1"
            max="200"
            defaultValue="40"
            required
          />
        </label>
        <label className={styles.fullField}>
          GPS device ID
          <input
            name="gpsDeviceId"
            placeholder="Optional hardware IMEI or device reference"
          />
          <small>
            Leave blank when the Android Driver app supplies GPS updates.
          </small>
        </label>
      </div>
      <FormActions busy={busy} onCancel={onCancel} label="Add Vehicle" />
    </form>
  );
}

function DriverForm({
  users,
  busy,
  onSave,
}: {
  users: StaffUser[];
  busy: boolean;
  onSave: (
    action: Extract<TransportAction, { action: "create_driver" }>,
  ) => Promise<boolean>;
}) {
  return (
    <form
      className={`${styles.formCard} ${styles.wideCard}`}
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const element = event.currentTarget;
        const form = new FormData(element);
        const saved = await onSave({
          action: "create_driver",
          userId: String(form.get("userId") ?? ""),
          employeeCode: String(form.get("employeeCode") ?? "").trim() || null,
          mobileNumber: String(form.get("mobileNumber") ?? "").trim() || null,
          licenseNumber: String(form.get("licenseNumber") ?? "").trim(),
          licenseExpiry:
            String(form.get("licenseExpiry") ?? "").trim() || null,
        });
        if (saved) element.reset();
      }}
    >
      <CardHeader
        title="Register a Driver"
        subtitle="Choose an active school user; no internal UUID entry is required"
      />
      <div className={styles.formGrid}>
        <label>
          School user *
          <select name="userId" required defaultValue="">
            <option value="" disabled>
              Select an active staff user
            </option>
            {users.map((user) => (
              <option value={user.id} key={user.id}>
                {user.name} · {user.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          Employee code
          <input name="employeeCode" placeholder="DRV-001" />
        </label>
        <label>
          Mobile number
          <input name="mobileNumber" inputMode="tel" />
        </label>
        <label>
          Driving licence number *
          <input name="licenseNumber" required />
        </label>
        <label>
          Licence expiry
          <input name="licenseExpiry" type="date" />
        </label>
      </div>
      {!users.length ? (
        <p className={styles.formNotice}>
          Add an active staff user in Human Resources before registering a
          driver.
        </p>
      ) : null}
      <div className={styles.inlineSubmit}>
        <button disabled={busy || !users.length}>
          {busy ? "Saving…" : "Register Driver"}
        </button>
      </div>
    </form>
  );
}

function RoutesRegistry({
  snapshot,
  onAddRoute,
  onOpenRoute,
}: {
  snapshot: TransportSnapshot;
  onAddRoute: () => void;
  onOpenRoute: (routeId: string) => void;
}) {
  return (
    <article className={styles.card}>
      <CardHeader
        title="Production Routes"
        subtitle="Ordered stops, assigned students and operating shift"
        action="Add route"
        onAction={onAddRoute}
      />
      <div className={styles.routeRegistry}>
        {snapshot.routes.map((route) => {
          const stops = snapshot.stops.filter(
            (stop) => stop.routeId === route.id,
          ).length;
          const students = snapshot.studentAssignments.filter(
            (assignment) =>
              assignment.routeId === route.id &&
              assignment.status === "active",
          ).length;
          const assignments = snapshot.driverAssignments.filter(
            (assignment) =>
              assignment.routeId === route.id &&
              assignment.status === "active",
          ).length;
          return (
            <button key={route.id} onClick={() => onOpenRoute(route.id)}>
              <i>{route.routeCode.slice(0, 3).toUpperCase()}</i>
              <span>
                <b>{route.routeName}</b>
                <small>
                  {route.shift} · {route.direction} · {route.status}
                </small>
              </span>
              <strong>
                {stops} stops
                <small>
                  {students} students · {assignments} driver assignment
                  {assignments === 1 ? "" : "s"}
                </small>
              </strong>
              <em>Open →</em>
            </button>
          );
        })}
        {!snapshot.routes.length ? (
          <EmptyState
            title="No routes configured"
            text="Create the first route and then add its stops."
          />
        ) : null}
      </div>
    </article>
  );
}

function RouteForm({
  busy,
  onCancel,
  onSave,
}: {
  busy: boolean;
  onCancel: () => void;
  onSave: (
    action: Extract<TransportAction, { action: "create_route" }>,
  ) => Promise<void>;
}) {
  return (
    <form
      className={styles.formCard}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void onSave({
          action: "create_route",
          routeName: String(form.get("routeName") ?? "").trim(),
          routeCode: String(form.get("routeCode") ?? "").trim(),
          direction: String(form.get("direction")) as
            | "pickup"
            | "drop"
            | "both",
          shift: String(form.get("shift")) as
            | "morning"
            | "afternoon"
            | "evening"
            | "custom",
        });
      }}
    >
      <div className={styles.formHeader}>
        <div>
          <button type="button" onClick={onCancel}>
            ← Back to routes
          </button>
          <h2>Create Production Route</h2>
          <p>
            Add the route identity first. Stops and assignments are configured
            on the next screen.
          </p>
        </div>
      </div>
      <div className={styles.formGrid}>
        <label>
          Route name *
          <input name="routeName" required placeholder="Greenfield Route A" />
        </label>
        <label>
          Route code *
          <input name="routeCode" required placeholder="GFA" />
        </label>
        <label>
          Direction *
          <select name="direction" defaultValue="both">
            <option value="both">Pickup and drop</option>
            <option value="pickup">Pickup only</option>
            <option value="drop">Drop only</option>
          </select>
        </label>
        <label>
          Shift *
          <select name="shift" defaultValue="morning">
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
            <option value="evening">Evening</option>
            <option value="custom">Custom</option>
          </select>
        </label>
      </div>
      <FormActions busy={busy} onCancel={onCancel} label="Create Route" />
    </form>
  );
}

function FormActions({
  busy,
  onCancel,
  label,
}: {
  busy: boolean;
  onCancel: () => void;
  label: string;
}) {
  return (
    <div className={styles.formActions}>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button disabled={busy}>{busy ? "Saving…" : label}</button>
    </div>
  );
}

function RouteOperations({
  snapshot,
  students,
  selectedRouteId,
  busy,
  onSelectRoute,
  onBack,
  onMutate,
}: {
  snapshot: TransportSnapshot;
  students: StudentOption[];
  selectedRouteId: string;
  busy: string;
  onSelectRoute: (routeId: string) => void;
  onBack: () => void;
  onMutate: (action: TransportAction, successMessage: string) => Promise<boolean>;
}) {
  const route =
    snapshot.routes.find((item) => item.id === selectedRouteId) ??
    snapshot.routes[0];
  if (!route) {
    return (
      <article className={styles.card}>
        <button className={styles.backButton} onClick={onBack}>
          ← Back to routes
        </button>
        <EmptyState
          title="Create a route first"
          text="Stops and assignments require an existing route."
        />
      </article>
    );
  }

  const stops = snapshot.stops.filter((stop) => stop.routeId === route.id);
  const driverAssignments = snapshot.driverAssignments.filter(
    (assignment) => assignment.routeId === route.id,
  );
  const studentAssignments = snapshot.studentAssignments.filter(
    (assignment) => assignment.routeId === route.id,
  );
  const trips = snapshot.trips.filter((trip) => trip.routeId === route.id);

  return (
    <>
      <div className={styles.routeDetailHeader}>
        <div>
          <button onClick={onBack}>← Back to routes</button>
          <h2>{route.routeName}</h2>
          <p>
            {route.routeCode} · {route.shift} · {route.direction}
          </p>
        </div>
        <label>
          Current route
          <select
            value={route.id}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => onSelectRoute(event.target.value)}
          >
            {snapshot.routes.map((item) => (
              <option value={item.id} key={item.id}>
                {item.routeName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className={styles.operationsGrid}>
        <StopForm
          route={route}
          nextSequence={
            stops.reduce(
              (highest, stop) => Math.max(highest, stop.sequenceNumber),
              0,
            ) + 1
          }
          busy={busy === "create_stop"}
          onSave={(action) =>
            onMutate(action, `${action.stopName} added to ${route.routeName}.`)
          }
        />

        <article className={styles.card}>
          <CardHeader
            title="Ordered Stops"
            subtitle="Coordinates, timing and geofence radius"
          />
          <DataTable
            headers={[
              "#",
              "Stop",
              "Pickup",
              "Drop",
              "Coordinates",
              "Radius",
            ]}
            rows={stops.map((stop) => [
              stop.sequenceNumber,
              stop.stopName,
              stop.pickupTime || "—",
              stop.dropTime || "—",
              `${stop.latitude}, ${stop.longitude}`,
              `${stop.geofenceRadiusMeters} m`,
            ])}
            empty="No stops are configured for this route."
          />
        </article>

        <DriverAssignmentForm
          route={route}
          drivers={snapshot.drivers}
          vehicles={snapshot.vehicles}
          busy={busy === "assign_driver"}
          onSave={(action) =>
            onMutate(action, "Driver, vehicle and route assignment saved.")
          }
        />

        <StudentAssignmentForm
          route={route}
          stops={stops}
          students={students}
          busy={busy === "assign_student"}
          onSave={(action) =>
            onMutate(action, "Student transport assignment saved.")
          }
        />

        <TripForm
          route={route}
          assignments={driverAssignments}
          busy={busy === "schedule_trip"}
          onSave={(action) =>
            onMutate(action, "Transport trip scheduled.")
          }
        />

        <article className={styles.card}>
          <CardHeader
            title="Route Register"
            subtitle="Current student and trip assignments"
          />
          <DataTable
            headers={["Student", "Pickup Stop", "Drop Stop", "From", "Status"]}
            rows={studentAssignments.map((assignment) => {
              const student = students.find(
                (item) => item.id === assignment.studentId,
              );
              const pickup = stops.find(
                (item) => item.id === assignment.pickupStopId,
              );
              const drop = stops.find(
                (item) => item.id === assignment.dropStopId,
              );
              return [
                student?.fullName ?? assignment.studentId,
                pickup?.stopName ?? "—",
                drop?.stopName ?? "—",
                assignment.effectiveFrom,
                assignment.status,
              ];
            })}
            empty="No students are assigned to this route."
          />
          <div className={styles.tripList}>
            <h3>Scheduled Trips</h3>
            {trips.slice(0, 10).map((trip) => (
              <p key={trip.id}>
                <span>
                  <b>{trip.serviceDate}</b>
                  <small>
                    {trip.direction} · {formatDateTime(trip.scheduledStartAt)}
                  </small>
                </span>
                <em>{trip.status}</em>
              </p>
            ))}
            {!trips.length ? <span>No trips scheduled.</span> : null}
          </div>
        </article>
      </section>
    </>
  );
}

function StopForm({
  route,
  nextSequence,
  busy,
  onSave,
}: {
  route: Route;
  nextSequence: number;
  busy: boolean;
  onSave: (
    action: Extract<TransportAction, { action: "create_stop" }>,
  ) => Promise<boolean>;
}) {
  return (
    <form
      className={styles.formCard}
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const element = event.currentTarget;
        const form = new FormData(element);
        const saved = await onSave({
          action: "create_stop",
          routeId: route.id,
          stopName: String(form.get("stopName") ?? "").trim(),
          sequenceNumber: Number(form.get("sequenceNumber")),
          latitude: Number(form.get("latitude")),
          longitude: Number(form.get("longitude")),
          pickupTime: String(form.get("pickupTime") ?? "").trim() || null,
          dropTime: String(form.get("dropTime") ?? "").trim() || null,
          geofenceRadiusMeters: Number(form.get("geofenceRadiusMeters")),
        });
        if (saved) element.reset();
      }}
    >
      <CardHeader
        title="Add Route Stop"
        subtitle="The Driver app follows this sequence"
      />
      <div className={styles.formGrid}>
        <label>
          Stop name *
          <input name="stopName" required />
        </label>
        <label>
          Sequence *
          <input
            name="sequenceNumber"
            type="number"
            min="1"
            defaultValue={nextSequence}
            required
          />
        </label>
        <label>
          Latitude *
          <input
            name="latitude"
            type="number"
            step="0.000001"
            min="-90"
            max="90"
            required
          />
        </label>
        <label>
          Longitude *
          <input
            name="longitude"
            type="number"
            step="0.000001"
            min="-180"
            max="180"
            required
          />
        </label>
        <label>
          Pickup time
          <input name="pickupTime" type="time" />
        </label>
        <label>
          Drop time
          <input name="dropTime" type="time" />
        </label>
        <label>
          Geofence radius (metres) *
          <input
            name="geofenceRadiusMeters"
            type="number"
            min="25"
            max="5000"
            defaultValue="200"
            required
          />
        </label>
      </div>
      <div className={styles.inlineSubmit}>
        <button disabled={busy}>{busy ? "Saving…" : "Add Stop"}</button>
      </div>
    </form>
  );
}

function DriverAssignmentForm({
  route,
  drivers,
  vehicles,
  busy,
  onSave,
}: {
  route: Route;
  drivers: Driver[];
  vehicles: Vehicle[];
  busy: boolean;
  onSave: (
    action: Extract<TransportAction, { action: "assign_driver" }>,
  ) => Promise<boolean>;
}) {
  return (
    <form
      className={styles.formCard}
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const element = event.currentTarget;
        const form = new FormData(element);
        const saved = await onSave({
          action: "assign_driver",
          driverId: String(form.get("driverId") ?? ""),
          vehicleId: String(form.get("vehicleId") ?? ""),
          routeId: route.id,
          effectiveFrom: String(form.get("effectiveFrom") ?? currentDate()),
        });
        if (saved) element.reset();
      }}
    >
      <CardHeader
        title="Assign Driver & Vehicle"
        subtitle="Only one active vehicle or driver assignment is retained"
      />
      <div className={styles.formGrid}>
        <label>
          Driver *
          <select name="driverId" required defaultValue="">
            <option value="" disabled>
              Select driver
            </option>
            {drivers
              .filter((driver) => driver.status === "active")
              .map((driver) => (
                <option value={driver.id} key={driver.id}>
                  {driver.name} · {driver.licenseNumber}
                </option>
              ))}
          </select>
        </label>
        <label>
          Vehicle *
          <select name="vehicleId" required defaultValue="">
            <option value="" disabled>
              Select vehicle
            </option>
            {vehicles
              .filter((vehicle) => vehicle.status === "active")
              .map((vehicle) => (
                <option value={vehicle.id} key={vehicle.id}>
                  {vehicle.vehicleNumber} · {vehicle.registrationNumber}
                </option>
              ))}
          </select>
        </label>
        <label>
          Effective from *
          <input
            name="effectiveFrom"
            type="date"
            defaultValue={currentDate()}
            required
          />
        </label>
      </div>
      <div className={styles.inlineSubmit}>
        <button disabled={busy || !drivers.length || !vehicles.length}>
          {busy ? "Saving…" : "Save Assignment"}
        </button>
      </div>
    </form>
  );
}

function StudentAssignmentForm({
  route,
  stops,
  students,
  busy,
  onSave,
}: {
  route: Route;
  stops: Stop[];
  students: StudentOption[];
  busy: boolean;
  onSave: (
    action: Extract<TransportAction, { action: "assign_student" }>,
  ) => Promise<boolean>;
}) {
  return (
    <form
      className={styles.formCard}
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const element = event.currentTarget;
        const form = new FormData(element);
        const saved = await onSave({
          action: "assign_student",
          studentId: String(form.get("studentId") ?? ""),
          routeId: route.id,
          pickupStopId: String(form.get("pickupStopId") ?? "") || null,
          dropStopId: String(form.get("dropStopId") ?? "") || null,
          effectiveFrom: String(form.get("effectiveFrom") ?? currentDate()),
        });
        if (saved) element.reset();
      }}
    >
      <CardHeader
        title="Assign Student"
        subtitle="Connect the child to pickup and drop stops"
      />
      <div className={styles.formGrid}>
        <label className={styles.fullField}>
          Student *
          <select name="studentId" required defaultValue="">
            <option value="" disabled>
              Select student
            </option>
            {students.map((student) => (
              <option value={student.id} key={student.id}>
                {student.admissionNumber} · {student.fullName} ·{" "}
                {student.className}-{student.sectionName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pickup stop
          <select name="pickupStopId" defaultValue="">
            <option value="">Not assigned</option>
            {stops.map((stop) => (
              <option value={stop.id} key={stop.id}>
                {stop.sequenceNumber}. {stop.stopName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Drop stop
          <select name="dropStopId" defaultValue="">
            <option value="">Not assigned</option>
            {stops.map((stop) => (
              <option value={stop.id} key={stop.id}>
                {stop.sequenceNumber}. {stop.stopName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Effective from *
          <input
            name="effectiveFrom"
            type="date"
            defaultValue={currentDate()}
            required
          />
        </label>
      </div>
      <div className={styles.inlineSubmit}>
        <button disabled={busy || !students.length}>
          {busy ? "Saving…" : "Assign Student"}
        </button>
      </div>
    </form>
  );
}

function TripForm({
  route,
  assignments,
  busy,
  onSave,
}: {
  route: Route;
  assignments: DriverAssignment[];
  busy: boolean;
  onSave: (
    action: Extract<TransportAction, { action: "schedule_trip" }>,
  ) => Promise<boolean>;
}) {
  return (
    <form
      className={styles.formCard}
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const element = event.currentTarget;
        const form = new FormData(element);
        const saved = await onSave({
          action: "schedule_trip",
          driverAssignmentId: String(
            form.get("driverAssignmentId") ?? "",
          ),
          routeId: route.id,
          serviceDate: String(form.get("serviceDate") ?? currentDate()),
          direction: String(form.get("direction")) as "pickup" | "drop",
          scheduledStartAt: toIsoDateTime(form.get("scheduledStartAt")),
        });
        if (saved) element.reset();
      }}
    >
      <CardHeader
        title="Schedule Trip"
        subtitle="The trip appears in the assigned Driver app"
      />
      <div className={styles.formGrid}>
        <label className={styles.fullField}>
          Active driver assignment *
          <select name="driverAssignmentId" required defaultValue="">
            <option value="" disabled>
              Select assignment
            </option>
            {assignments
              .filter((assignment) => assignment.status === "active")
              .map((assignment) => (
                <option value={assignment.id} key={assignment.id}>
                  Assignment effective {assignment.effectiveFrom}
                </option>
              ))}
          </select>
        </label>
        <label>
          Service date *
          <input
            name="serviceDate"
            type="date"
            defaultValue={currentDate()}
            required
          />
        </label>
        <label>
          Direction *
          <select name="direction" defaultValue="pickup">
            <option value="pickup">Pickup</option>
            <option value="drop">Drop</option>
          </select>
        </label>
        <label>
          Scheduled start
          <input name="scheduledStartAt" type="datetime-local" />
        </label>
      </div>
      <div className={styles.inlineSubmit}>
        <button disabled={busy || !assignments.length}>
          {busy ? "Saving…" : "Schedule Trip"}
        </button>
      </div>
    </form>
  );
}

function LiveTracking({
  snapshot,
  onRefresh,
}: {
  snapshot: TransportSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const cards = useMemo(
    () =>
      snapshot.latestLocations.map((location) => {
        const trip = snapshot.trips.find(
          (item) => item.id === location.tripId,
        );
        const assignment = snapshot.driverAssignments.find(
          (item) => item.id === trip?.driverAssignmentId,
        );
        const route = snapshot.routes.find(
          (item) => item.id === trip?.routeId,
        );
        const vehicle = snapshot.vehicles.find(
          (item) => item.id === assignment?.vehicleId,
        );
        const driver = snapshot.drivers.find(
          (item) => item.id === assignment?.driverId,
        );
        return {
          location,
          trip,
          route,
          vehicle,
          driver,
          freshness: freshness(location.capturedAt),
        };
      }),
    [snapshot],
  );

  return (
    <section className={styles.liveGrid}>
      <article className={`${styles.card} ${styles.wideCard}`}>
        <CardHeader
          title="Latest Driver Positions"
          subtitle="Foreground GPS updates from active Android trips"
          action="Refresh positions"
          onAction={() => void onRefresh()}
        />
        <div className={styles.locationCards}>
          {cards.map((card) => (
            <article key={card.location.id}>
              <header>
                <span
                  className={`${styles.statusDot} ${
                    styles[card.freshness.tone]
                  }`}
                />
                <div>
                  <b>
                    {card.vehicle?.vehicleNumber ?? "Assigned vehicle"}
                  </b>
                  <small>
                    {card.route?.routeName ?? "Unknown route"} ·{" "}
                    {card.driver?.name ?? "Driver"}
                  </small>
                </div>
                <em>{card.freshness.label}</em>
              </header>
              <div>
                <p>
                  <span>Coordinates</span>
                  <b>
                    {card.location.latitude.toFixed(6)},{" "}
                    {card.location.longitude.toFixed(6)}
                  </b>
                </p>
                <p>
                  <span>Speed</span>
                  <b>
                    {card.location.speedKph === null
                      ? "—"
                      : `${Math.round(card.location.speedKph)} km/h`}
                  </b>
                </p>
                <p>
                  <span>Accuracy</span>
                  <b>
                    {card.location.accuracyMeters === null
                      ? "—"
                      : `${Math.round(card.location.accuracyMeters)} m`}
                  </b>
                </p>
                <p>
                  <span>Captured</span>
                  <b>{formatDateTime(card.location.capturedAt)}</b>
                </p>
              </div>
              <a
                href={`https://www.openstreetmap.org/?mlat=${card.location.latitude}&mlon=${card.location.longitude}#map=16/${card.location.latitude}/${card.location.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                Open exact position ↗
              </a>
            </article>
          ))}
          {!cards.length ? (
            <EmptyState
              title="No GPS position received yet"
              text="A driver must start an assigned trip and keep the app open for foreground tracking."
            />
          ) : null}
        </div>
      </article>

      <article className={`${styles.card} ${styles.wideCard}`}>
        <CardHeader
          title="Recent Trip & Safety Events"
          subtitle="Boarding, drop, trip control and SOS activity"
        />
        <div className={styles.eventTimeline}>
          {snapshot.recentEvents.map((event) => {
            const trip = snapshot.trips.find(
              (item) => item.id === event.tripId,
            );
            const route = snapshot.routes.find(
              (item) => item.id === trip?.routeId,
            );
            return (
              <div
                className={
                  event.eventType === "sos" ? styles.sosEvent : ""
                }
                key={event.id}
              >
                <i>{event.eventType === "sos" ? "SOS" : "•"}</i>
                <span>
                  <b>{formatEventName(event.eventType)}</b>
                  <small>
                    {route?.routeName ?? "Transport event"} ·{" "}
                    {formatDateTime(event.capturedAt)}
                  </small>
                </span>
              </div>
            );
          })}
          {!snapshot.recentEvents.length ? (
            <EmptyState
              title="No recent trip events"
              text="Driver activity will appear after a trip starts."
            />
          ) : null}
        </div>
      </article>

      <aside className={styles.scopeNotice}>
        <b>Module 1 tracking boundary</b>
        <p>
          GPS is foreground-only: the Driver app must remain open during the
          trip. Battery-safe background tracking, automated geofence
          notifications and parent live maps remain later Stage 10 modules.
        </p>
      </aside>
    </section>
  );
}

function TransportGuide({ onPage }: { onPage: (page: string) => void }) {
  const steps = [
    [
      "1",
      "Register fleet and drivers",
      "Vehicles use a registration identity. Drivers are linked to active school users.",
      "Manage Vehicles",
    ],
    [
      "2",
      "Create routes and stops",
      "Add ordered stops with coordinates, timings and a geofence radius.",
      "Manage Routes",
    ],
    [
      "3",
      "Assign operations",
      "Connect one driver and vehicle to a route, then assign students to stops.",
      "Manage Routes",
    ],
    [
      "4",
      "Schedule the trip",
      "A scheduled trip is delivered to the assigned Driver app.",
      "Manage Routes",
    ],
    [
      "5",
      "Track safely",
      "Foreground GPS and SOS events appear in the Transport command center.",
      "Live Vehicle Tracking",
    ],
  ] as const;

  return (
    <>
      <section className={styles.guideHero}>
        <span>PRODUCTION WORKFLOW</span>
        <h2>From school setup to a live driver trip</h2>
        <p>
          Module 1 replaces preview transport records with tenant-isolated
          PostgreSQL master data and authenticated operational APIs.
        </p>
      </section>
      <section className={styles.guideGrid}>
        {steps.map(([number, title, text, target]) => (
          <article className={styles.card} key={number}>
            <i>{number}</i>
            <h3>{title}</h3>
            <p>{text}</p>
            <button onClick={() => onPage(target)}>Open →</button>
          </article>
        ))}
      </section>
    </>
  );
}

function TransportFeeBoundary({
  onPage,
}: {
  onPage: (page: string) => void;
}) {
  return (
    <article className={styles.boundaryCard}>
      <span>FINANCE BOUNDARY</span>
      <h2>Transport operations are production-ready</h2>
      <p>
        Vehicle, route, stop, driver, student and trip records are managed
        here. Fee invoices remain owned by Finance & Fees so Transport cannot
        silently create financial records without the fee module’s controls.
      </p>
      <button onClick={() => onPage("Transport Dashboard")}>
        Return to Transport Dashboard
      </button>
    </article>
  );
}
