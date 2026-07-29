# Hig School demo credentials

Open `/login` and use one of these accounts:

| Access | Email | Password |
|---|---|---|
| Company Super Admin | `company@higschool.in` | `HIG@Company2026` |
| School Administrator | `schooladmin@northfield.edu` | `School@2026` |
| Teacher / Staff app | `teacher@northfield.edu` | `Teacher@2026` |
| Student app | `student@northfield.edu` | `Student@2026` |
| Parent app | `parent@northfield.edu` | `Parent@2026` |
| Driver GPS app | `driver@northfield.edu` | `Driver@2026` |

## Synchronization demonstration

1. Sign in as Teacher and mark Aarav present, late or absent.
2. Sign out and open Student or Parent access. The attendance card and notification feed reflect the teacher’s latest entry.
3. In the Teacher app, publish homework. It appears in the Student/Parent updates.
4. Sign in as Driver and update the live location. The Student/Parent transport card shows the latest speed and trip status.
5. Sign in as Company, choose **Modules**, and disable a module for Northfield Public School. It disappears from the School portal and any corresponding mobile launcher after synchronization.

These are public demonstration credentials. Never reuse them in production.

The Hostinger Docker package stores demo changes in a persistent SQLite volume. Data survives container restarts unless the `hig-school-data` volume is intentionally removed.
