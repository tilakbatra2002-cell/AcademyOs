# AcademyOS — seeded demo credentials

All seeded tenant accounts use the password `Password@123`.
The platform owner uses `Owner@12345`.

Regenerate at any time with `npm run seed` inside `server/`.
Seeded logins are deterministic **except** student/parent e-mails, which are generated from
random Indian name pools — re-running the seed changes them. The table below matches the
current database; the admin/counselor/accountant/staff/teacher addresses are always stable.

| Portal | Role | Organization | Email | Password |
|---|---|---|---|---|
| `/owner/login` | SAAS_OWNER | — platform — | owner@academyos.com | Owner@12345 |
| `/admin/login` | ORGANIZATION_ADMIN | Brilliant Academy | admin@brilliantacademy.test | Password@123 |
| `/admin/login` | COUNSELOR | Brilliant Academy | counselor1@brilliantacademy.test | Password@123 |
| `/admin/login` | ACCOUNTANT | Brilliant Academy | accounts1@brilliantacademy.test | Password@123 |
| `/admin/login` | STAFF | Brilliant Academy | frontdesk@brilliantacademy.test | Password@123 |
| `/teacher/login` | TEACHER | Brilliant Academy | teacher1@brilliantacademy.test | Password@123 |
| `/student/login` | STUDENT | Brilliant Academy | neha.kapoor1000@brilliantacademy.test | Password@123 |
| `/parent/login` | PARENT | Brilliant Academy | nikhil.bansal1@brilliantacademy.test | Password@123 |
| `/admin/login` | ORGANIZATION_ADMIN | ABC Coaching | admin@abccoaching.test | Password@123 |
| `/admin/login` | COUNSELOR | ABC Coaching | counselor1@abccoaching.test | Password@123 |
| `/admin/login` | ACCOUNTANT | ABC Coaching | accounts1@abccoaching.test | Password@123 |
| `/admin/login` | STAFF | ABC Coaching | frontdesk@abccoaching.test | Password@123 |
| `/teacher/login` | TEACHER | ABC Coaching | teacher1@abccoaching.test | Password@123 |
| `/student/login` | STUDENT | ABC Coaching | ishita.rana1000@abccoaching.test | Password@123 |
| `/parent/login` | PARENT | ABC Coaching | ishaan.sood1@abccoaching.test | Password@123 |
| `/admin/login` | ORGANIZATION_ADMIN | Future Skills Academy | admin@futureskills.test | Password@123 |
| `/admin/login` | COUNSELOR | Future Skills Academy | counselor1@futureskills.test | Password@123 |
| `/admin/login` | ACCOUNTANT | Future Skills Academy | accounts1@futureskills.test | Password@123 |
| `/admin/login` | STAFF | Future Skills Academy | frontdesk@futureskills.test | Password@123 |
| `/teacher/login` | TEACHER | Future Skills Academy | teacher1@futureskills.test | Password@123 |
| `/student/login` | STUDENT | Future Skills Academy | aditya.rana1000@futureskills.test | Password@123 |
| `/parent/login` | PARENT | Future Skills Academy | ishita.negi1@futureskills.test | Password@123 |

## Portals

| Portal | Path | Who signs in |
|---|---|---|
| Owner | `/owner/login` | SAAS_OWNER (platform staff) |
| Admin | `/admin/login` | ORGANIZATION_ADMIN, COUNSELOR, ACCOUNTANT, STAFF |
| Teacher | `/teacher/login` | TEACHER |
| Student | `/student/login` | STUDENT |
| Parent | `/parent/login` | PARENT |

Logging in through the wrong portal is rejected by the backend (a student cannot use
`/admin/login`, an org admin cannot use `/owner/login`).

