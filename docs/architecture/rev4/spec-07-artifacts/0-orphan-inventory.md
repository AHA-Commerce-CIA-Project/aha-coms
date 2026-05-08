# Spec 07 Phase 0 — Orphan & Duplicate Inventory

**Captured:** 2026-05-08 from `aha-fast-db-instance-cd5db712` (PG 15.17) and the portal `coms_portal` DB on `coms-aha-heroes-db` (PG 18.3).

## Fast `user` table — full email census (16 rows)

All 16 are `account_status = 'active'`. No NULLs, no whitespace-only emails, no internal case-fold collisions.

| email                                 | matches portal? | portal `identity_users.id`              | name                          |
| ------------------------------------- | --------------- | --------------------------------------- | ----------------------------- |
| admin@gmail.com                       | NO              | —                                       | Admin                         |
| alfiano.mahardika@ahacommerce.net     | yes             | fc099ffc-6774-4afb-9672-66304b0af546    | Mohammad Alfiano R. Mahardika |
| alfini.yuliyanti@ahacommerce.net      | yes             | aa283ffd-7c5a-49c5-b9e1-8f4db3554bc1    | Alfini Yuliyanti              |
| alif.masyhur@ahacommerce.net          | yes             | 67708179-0c86-4a9c-96a0-d74ae5eed17a    | Alif Masyhur                  |
| aqil.bahri@ahacommerce.net            | yes             | b033c858-e3e8-459a-a689-29a9a358e262    | M. Nur Aqil Bahri             |
| claudia.ong@ahacommerce.net           | yes             | 31aee187-438a-4f1e-8443-60c9e4fe2d64    | Claudia Ong                   |
| dani.hidayat@ahacommerce.net          | yes             | b07b26ab-4dc2-4c83-b725-ef1bb380c78d    | Dani Hidayat                  |
| handers.the@ahacommerce.net           | yes             | 8cdb6608-6b29-4d16-8249-8d49b5badbec    | Handers The                   |
| lintang.thiertian@ahacommerce.net     | yes             | dcb0bac6-9301-47cf-8ce2-4f99c770033d    | Lintang P. O. Thiertian       |
| lukmanulhak@ahacommerce.net           | yes             | 31c243cd-e454-46b5-86e0-90e7d85f54c8    | Lukmanul Hakim                |
| rangga.fadli@ahacommerce.net          | yes             | 9e79eeca-b10e-4d4c-b43f-2d7c91be66f2    | Rangga F. Fadli               |
| shireen.malika@ahacommerce.net        | yes             | 9f44d097-cba6-4b3e-8dda-bfc27ef7c6d3    | Shireen Malika                |
| tbranding@ahacommerce.net             | NO              | —                                       | tbranding                     |
| tmp2@ahacommerce.net                  | NO              | —                                       | tmp2                          |
| tmp@ahacommerce.net                   | NO              | —                                       | testmp                        |
| tpr@ahacommerce.net                   | NO              | —                                       | testpr                        |

## Duplicate inventory

- Internal Fast email collisions (case-folded): **0**
- Fast emails resolving to multiple portal `identity_users`: **0**

## Triage decisions (2026-05-08)

| email             | activity                                                    | decision                                         |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| `admin@gmail.com` | role=admin, used today, owns 3 ch msgs, 5 DMs, 2 notes, 59 act-log rows | **Keep**. Auto-provision portal identity in Phase 1C. |
| `tpr@`            | 1 test task ("TEstPR"), 2 system direct-assign msgs, 1 "test" reply, 3 act-log rows | **Delete pre-rekey**.                            |
| `tbranding@`      | 90s session, no domain rows                                 | **Delete pre-rekey**.                            |
| `tmp@`            | 60s session, no domain rows                                 | **Delete pre-rekey**.                            |
| `tmp2@`           | never logged in, zero rows                                  | **Delete pre-rekey**.                            |

This **diverges from spec D1** (which said auto-provision all orphans) for the four test/role accounts — only `admin@gmail.com` is auto-provisioned.

## Post-cleanup expected state

Active Fast users: **12** (16 − 4 deletes). All 12 have a known portal `identity_users.id` to backfill into `User.portalSub` in Phase 2C.
