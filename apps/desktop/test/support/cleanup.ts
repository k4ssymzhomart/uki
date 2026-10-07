// `pnpm --filter desktop e2e:cleanup`: removes fixture workspaces a crashed or timed-out run left behind
// (slug desktop-e2e-*), with their sessions, stills and users.
import { admin, destroyWorkspace, leftoverWorkspaces } from "./fixture.ts";

const ids = await leftoverWorkspaces();
for (const id of ids) await destroyWorkspace(id);
// Lead proctors whose workspace went but whose user stayed (a run cut off mid-teardown).
const db = admin();
const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
const leads = (data?.users ?? []).filter((user) =>
  /^e2e-lead-[a-z0-9]+@desktop\.test$/.test(user.email ?? ""),
);
for (const user of leads) await db.auth.admin.deleteUser(user.id);
process.stdout.write(
  `desktop e2e: removed ${ids.length} leftover fixture workspace(s) and ${leads.length} lead user(s)\n`,
);
