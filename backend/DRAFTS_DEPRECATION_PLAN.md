# Drafts Feature Deprecation Plan

The legacy `drafts` endpoints and table are superseded by the new `/api/progress` system which offers:
- Per-user versioned autosave
- Cross-device resume
- Smaller, structured JSON payload
- Server-side validation and size limits

## Timeline
| Phase | Date (target) | Action |
|-------|---------------|--------|
| Phase 0 (Now) | In effect | Deprecation headers emitted on all `/api/drafts` responses (`Deprecation: true`, `Sunset: 01 Jan 2026`, Warning 299). No new frontend calls. |
| Phase 1 | 2025-10-15 | Disable new draft creation (POST returns 410 Gone) while allowing GET for existing records. |
| Phase 2 | 2025-11-15 | Freeze table (set to read-only / remove routes). Provide final export. |
| Phase 3 | 2026-01-01 | Drop `drafts` table & remove code (migration + code removal PR). |

## Migration / Data Handling
If required to preserve legacy drafts for compliance:
1. Run export script (to be added) dumping remaining draft rows to `drafts_archive_YYYYMMDD.json`.
2. (Optional) Transform each draft into a `user_progress` row by mapping `draft.data` to `progress.data.stateSnapshot` and synthesizing a `lastStep` based on available sections.

### Proposed Mapping Logic
- If `financialItems` exist -> lastStep = `financial`.
- Else if `spouse` or `children` exist -> lastStep = `spouse`.
- Else if `user` section only -> lastStep = `user`.
- If draft had a `submitted` flag, ignore (progress only tracks in-flight work). Completed submissions should already live in declarations tables.

## Technical Steps To Remove
1. Remove route registration of `draftRoutes` from `app.js`.
2. Delete `controllers/draftController.js`, `models/draftModel.js`, `routes/draftRoutes.js`.
3. Add migration: `DROP TABLE IF EXISTS drafts;` (exact name per schema).
4. Purge any test fixtures referencing drafts.
5. Update documentation (README) removing draft references.

## Safety / Validation
- Ensure no production traffic still hits `/api/drafts` (monitor logs for 30 days of zero usage before Phase 3).
- Confirm all active sessions have migrated: look for any 4xx trends after Phase 1.

## Monitoring
Add temporary log metric counting `/api/drafts` hits (INFO level) until removal.

## Rollback Strategy
If unforeseen issue arises post-removal:
- Revert migration dropping table.
- Reintroduce lightweight read-only controller serving from archived JSON or a restored table backup.

## Open Items
- [ ] Add export script (`scripts/exportDrafts.js`).
- [ ] Add migration for final table drop when approaching sunset date.
- [ ] Add monitoring log snippet.

---
Generated plan to guide safe retirement of the drafts subsystem.
